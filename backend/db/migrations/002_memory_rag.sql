-- ============================================================
-- Migration 002: Memory & RAG layer
-- Additive only — does not alter or drop existing tables.
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1) Enable pgvector (no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2) CUSTOMERS — proper entity (replaces customer_wiki as source of truth)
CREATE TABLE IF NOT EXISTS customers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        text UNIQUE,                    -- internal code (e.g. Odoo partner id)
    name        text NOT NULL,
    phone       text,
    age         int,
    gender      text,
    address     text,
    source      text,                           -- hotline | facebook | referral | walk-in | other
    health_profile     jsonb DEFAULT '{}'::jsonb,  -- {conditions, allergies, medications, lifestyle}
    preferences        jsonb DEFAULT '{}'::jsonb,  -- {decision_style, budget, contact_time, family}
    lifetime_value_vnd numeric DEFAULT 0,
    churn_risk  numeric DEFAULT 0,              -- 0..1
    next_best_action text,
    tags        text[] DEFAULT '{}',
    assigned_rep_id bigint,                     -- points at users.id (existing)
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers(phone);
CREATE INDEX IF NOT EXISTS customers_code_idx ON customers(code);
CREATE INDEX IF NOT EXISTS customers_name_trgm_idx ON customers USING gin(name gin_trgm_ops);

-- 3) CUSTOMER_MEMORY — fact store with versioning (agent's long-term knowledge about KH)
-- Inspired by Mem0 / memGPT fact patterns.
CREATE TABLE IF NOT EXISTS customer_memory (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
    fact_type   text NOT NULL,                  -- condition | medication | allergy | preference | objection | goal | family | purchase
    fact_key    text NOT NULL,                  -- e.g. "allergy:penicillin", "condition:hypertension"
    fact_value  jsonb NOT NULL,                 -- full structured fact
    confidence  numeric DEFAULT 0.8,            -- 0..1
    source_call_id uuid,                        -- reference to calls.id
    source_quote text,
    source_timestamp_sec numeric,
    valid_from  timestamptz DEFAULT now(),
    valid_to    timestamptz,                    -- NULL = currently valid
    superseded_by uuid REFERENCES customer_memory(id),
    created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cmem_customer_idx ON customer_memory(customer_id, fact_type);
CREATE INDEX IF NOT EXISTS cmem_active_idx ON customer_memory(customer_id) WHERE valid_to IS NULL;

-- 4) CALLS V2 — new canonical table (keep existing `transcriptions` for backward compat)
CREATE TABLE IF NOT EXISTS calls (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
    rep_user_id bigint,                         -- users.id
    legacy_transcription_id bigint,             -- back-ref to old transcriptions table
    audio_url   text,
    audio_filename text,
    duration_sec numeric,
    recorded_at timestamptz,
    channel     text,                           -- inbound | outbound | hotline
    metadata    jsonb DEFAULT '{}'::jsonb,
    customer_identified boolean DEFAULT false,
    match_candidates jsonb DEFAULT '[]'::jsonb,
    transcript_raw text,
    transcript_diarized jsonb,
    talk_ratio  numeric,
    total_quality_score numeric,
    opportunity_score numeric,
    compliance_status text,                     -- clean | yellow | orange | red
    analysis_version text,
    insights    jsonb,                          -- master insights object
    processing_status text DEFAULT 'done',      -- queued | asr | analyzing | done | failed
    processing_ms int,
    created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calls_customer_idx ON calls(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_rep_idx ON calls(rep_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_compliance_idx ON calls(compliance_status) WHERE compliance_status IN ('red','orange');

-- 5) CALL_CHUNKS — vector embeddings for RAG
-- Using Gemini text-embedding-004 (768 dims).
CREATE TABLE IF NOT EXISTS call_chunks (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id     uuid REFERENCES calls(id) ON DELETE CASCADE,
    customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
    chunk_text  text NOT NULL,
    speaker     text,
    start_sec   numeric,
    end_sec     numeric,
    embedding   vector(768),
    metadata    jsonb DEFAULT '{}'::jsonb,
    created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chunks_call_idx ON call_chunks(call_id);
CREATE INDEX IF NOT EXISTS chunks_customer_idx ON call_chunks(customer_id);
-- HNSW index for fast similarity search (pgvector >= 0.5.0)
CREATE INDEX IF NOT EXISTS chunks_embed_hnsw
    ON call_chunks USING hnsw (embedding vector_cosine_ops);

-- 6) OPPORTUNITIES — sales pipeline from calls
CREATE TABLE IF NOT EXISTS opportunities (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
    call_id     uuid REFERENCES calls(id) ON DELETE SET NULL,
    product_hint text,
    stage       text,                           -- cold..ready_to_buy..won..lost
    score       numeric,
    estimated_value_vnd numeric,
    next_action text,
    due_date    timestamptz,
    confidence  numeric,
    outcome     text,                           -- won | lost | abandoned
    assigned_rep_id bigint,
    created_at  timestamptz DEFAULT now(),
    closed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS opp_customer_idx ON opportunities(customer_id, stage);
CREATE INDEX IF NOT EXISTS opp_stage_idx ON opportunities(stage) WHERE outcome IS NULL;

-- 7) COMPLIANCE_EVENTS
CREATE TABLE IF NOT EXISTS compliance_events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id     uuid REFERENCES calls(id) ON DELETE CASCADE,
    customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
    rep_user_id bigint,
    event_type  text NOT NULL,
    severity    text NOT NULL,                  -- red | orange | yellow
    timestamp_sec numeric,
    speaker     text,
    quote       text,
    explanation text,
    recommended_action text,
    reviewed    boolean DEFAULT false,
    reviewed_by bigint,
    reviewed_at timestamptz,
    review_note text,
    created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compliance_severity_idx ON compliance_events(severity, reviewed);
CREATE INDEX IF NOT EXISTS compliance_call_idx ON compliance_events(call_id);

-- 8) Helper RPC for semantic search (pgvector cosine similarity)
CREATE OR REPLACE FUNCTION match_customer_chunks(
    query_embedding vector(768),
    customer_filter uuid,
    match_count int DEFAULT 5,
    similarity_threshold float DEFAULT 0.70
)
RETURNS TABLE (
    id uuid,
    call_id uuid,
    chunk_text text,
    speaker text,
    start_sec numeric,
    similarity float,
    created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cc.id, cc.call_id, cc.chunk_text, cc.speaker, cc.start_sec,
        1 - (cc.embedding <=> query_embedding) AS similarity,
        cc.created_at
    FROM call_chunks cc
    WHERE cc.customer_id = customer_filter
      AND 1 - (cc.embedding <=> query_embedding) > similarity_threshold
    ORDER BY cc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 9) Global match (across all customers — for matcher when customer unknown)
CREATE OR REPLACE FUNCTION match_chunks_global(
    query_embedding vector(768),
    match_count int DEFAULT 10,
    similarity_threshold float DEFAULT 0.75
)
RETURNS TABLE (
    id uuid,
    call_id uuid,
    customer_id uuid,
    chunk_text text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cc.id, cc.call_id, cc.customer_id, cc.chunk_text,
        1 - (cc.embedding <=> query_embedding) AS similarity
    FROM call_chunks cc
    WHERE cc.customer_id IS NOT NULL
      AND 1 - (cc.embedding <=> query_embedding) > similarity_threshold
    ORDER BY cc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
