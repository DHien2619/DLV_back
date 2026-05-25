-- ============================================================
-- FULL SCHEMA — chạy 1 lần trên Supabase project mới
-- Bao gồm: 001 (legacy tables) + 002 (memory/RAG) + 003 (notes)
--          + 004 (storage bucket) + 005 (users profile) + 006 (permissions)
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 001: Legacy tables (transcriptions, customer_wiki, employee_wiki)
-- ============================================================

CREATE TABLE IF NOT EXISTS transcriptions (
    id           bigserial PRIMARY KEY,
    user_id      bigint,
    "audioURL"   text,
    transcription text,
    status       text DEFAULT 'completed',
    insights     jsonb,
    created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transcriptions_user_idx ON transcriptions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_wiki (
    id              bigserial PRIMARY KEY,
    customer_phone  text UNIQUE NOT NULL,
    customer_name   text,
    wiki_content    text,
    total_calls     int DEFAULT 0,
    last_updated    timestamptz DEFAULT now(),
    created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_wiki_name_idx ON customer_wiki(customer_name);

CREATE TABLE IF NOT EXISTS employee_wiki (
    id              bigserial PRIMARY KEY,
    employee_phone  text UNIQUE NOT NULL,
    wiki_content    text,
    total_calls     int DEFAULT 0,
    last_updated    timestamptz DEFAULT now(),
    created_at      timestamptz DEFAULT now()
);

-- ============================================================
-- 002: Memory & RAG layer
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        text UNIQUE,
    name        text NOT NULL,
    phone       text,
    age         int,
    gender      text,
    address     text,
    source      text,
    health_profile     jsonb DEFAULT '{}'::jsonb,
    preferences        jsonb DEFAULT '{}'::jsonb,
    lifetime_value_vnd numeric DEFAULT 0,
    churn_risk  numeric DEFAULT 0,
    next_best_action text,
    tags        text[] DEFAULT '{}',
    assigned_rep_id bigint,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers(phone);
CREATE INDEX IF NOT EXISTS customers_code_idx ON customers(code);
CREATE INDEX IF NOT EXISTS customers_name_trgm_idx ON customers USING gin(name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS customer_memory (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
    fact_type   text NOT NULL,
    fact_key    text NOT NULL,
    fact_value  jsonb NOT NULL,
    confidence  numeric DEFAULT 0.8,
    source_call_id uuid,
    source_quote text,
    source_timestamp_sec numeric,
    valid_from  timestamptz DEFAULT now(),
    valid_to    timestamptz,
    superseded_by uuid REFERENCES customer_memory(id),
    created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cmem_customer_idx ON customer_memory(customer_id, fact_type);
CREATE INDEX IF NOT EXISTS cmem_active_idx ON customer_memory(customer_id) WHERE valid_to IS NULL;

CREATE TABLE IF NOT EXISTS calls (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
    rep_user_id bigint,
    legacy_transcription_id bigint,
    audio_url   text,
    audio_filename text,
    duration_sec numeric,
    recorded_at timestamptz,
    channel     text,
    metadata    jsonb DEFAULT '{}'::jsonb,
    customer_identified boolean DEFAULT false,
    match_candidates jsonb DEFAULT '[]'::jsonb,
    transcript_raw text,
    transcript_diarized jsonb,
    talk_ratio  numeric,
    total_quality_score numeric,
    opportunity_score numeric,
    compliance_status text,
    analysis_version text,
    insights    jsonb,
    processing_status text DEFAULT 'done',
    processing_ms int,
    created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calls_customer_idx ON calls(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_rep_idx ON calls(rep_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_compliance_idx ON calls(compliance_status) WHERE compliance_status IN ('red','orange');

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
CREATE INDEX IF NOT EXISTS chunks_embed_hnsw
    ON call_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS opportunities (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
    call_id     uuid REFERENCES calls(id) ON DELETE SET NULL,
    product_hint text,
    stage       text,
    score       numeric,
    estimated_value_vnd numeric,
    next_action text,
    due_date    timestamptz,
    confidence  numeric,
    outcome     text,
    assigned_rep_id bigint,
    created_at  timestamptz DEFAULT now(),
    closed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS opp_customer_idx ON opportunities(customer_id, stage);
CREATE INDEX IF NOT EXISTS opp_stage_idx ON opportunities(stage) WHERE outcome IS NULL;

CREATE TABLE IF NOT EXISTS compliance_events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id     uuid REFERENCES calls(id) ON DELETE CASCADE,
    customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
    rep_user_id bigint,
    event_type  text NOT NULL,
    severity    text NOT NULL,
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

CREATE OR REPLACE FUNCTION match_customer_chunks(
    query_embedding vector(768),
    customer_filter uuid,
    match_count int DEFAULT 5,
    similarity_threshold float DEFAULT 0.70
)
RETURNS TABLE (
    id uuid, call_id uuid, chunk_text text, speaker text,
    start_sec numeric, similarity float, created_at timestamptz
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT cc.id, cc.call_id, cc.chunk_text, cc.speaker, cc.start_sec,
        1 - (cc.embedding <=> query_embedding) AS similarity, cc.created_at
    FROM call_chunks cc
    WHERE cc.customer_id = customer_filter
      AND 1 - (cc.embedding <=> query_embedding) > similarity_threshold
    ORDER BY cc.embedding <=> query_embedding
    LIMIT match_count;
END; $$;

CREATE OR REPLACE FUNCTION match_chunks_global(
    query_embedding vector(768),
    match_count int DEFAULT 10,
    similarity_threshold float DEFAULT 0.75
)
RETURNS TABLE (id uuid, call_id uuid, customer_id uuid, chunk_text text, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT cc.id, cc.call_id, cc.customer_id, cc.chunk_text,
        1 - (cc.embedding <=> query_embedding) AS similarity
    FROM call_chunks cc
    WHERE cc.customer_id IS NOT NULL
      AND 1 - (cc.embedding <=> query_embedding) > similarity_threshold
    ORDER BY cc.embedding <=> query_embedding
    LIMIT match_count;
END; $$;

-- ============================================================
-- 003: Notes / Reminders
-- ============================================================

CREATE TABLE IF NOT EXISTS notes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     bigint,
    customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
    call_id     uuid REFERENCES calls(id) ON DELETE SET NULL,
    title       text NOT NULL,
    body        text,
    note_type   text DEFAULT 'note',
    priority    text DEFAULT 'medium',
    status      text DEFAULT 'open',
    due_date    timestamptz,
    tags        text[] DEFAULT '{}',
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now(),
    completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS notes_user_status_idx ON notes(user_id, status);
CREATE INDEX IF NOT EXISTS notes_due_idx ON notes(due_date) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS notes_customer_idx ON notes(customer_id);

CREATE OR REPLACE FUNCTION notes_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notes_updated_at ON notes;
CREATE TRIGGER notes_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION notes_set_updated_at();

-- ============================================================
-- 004: Storage bucket for call audio
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'call-audio', 'call-audio', true, 52428800,
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/mp4', 'audio/m4a',
        'audio/ogg', 'audio/flac', 'audio/webm', 'audio/opus']
)
ON CONFLICT (id) DO UPDATE
SET public = true, file_size_limit = 52428800,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "call_audio_public_read"   ON storage.objects;
DROP POLICY IF EXISTS "call_audio_public_upload" ON storage.objects;
DROP POLICY IF EXISTS "call_audio_public_update" ON storage.objects;
DROP POLICY IF EXISTS "call_audio_public_delete" ON storage.objects;

CREATE POLICY "call_audio_public_read"   ON storage.objects FOR SELECT USING (bucket_id = 'call-audio');
CREATE POLICY "call_audio_public_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'call-audio');
CREATE POLICY "call_audio_public_update" ON storage.objects FOR UPDATE USING (bucket_id = 'call-audio');
CREATE POLICY "call_audio_public_delete" ON storage.objects FOR DELETE USING (bucket_id = 'call-audio');

-- ============================================================
-- 005: Users profile (linked to auth.users)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.users (
    id          bigserial PRIMARY KEY,
    auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    name        text NOT NULL,
    email       text UNIQUE NOT NULL,
    password    text,
    image       text,
    role        text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
    created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_email_idx ON public.users(email);
CREATE INDEX IF NOT EXISTS users_auth_idx  ON public.users(auth_user_id);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_all" ON public.users;
DROP POLICY IF EXISTS "users_insert_all" ON public.users;
DROP POLICY IF EXISTS "users_update_all" ON public.users;

CREATE POLICY "users_select_all" ON public.users FOR SELECT USING (true);
CREATE POLICY "users_insert_all" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "users_update_all" ON public.users FOR UPDATE USING (true);

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    user_count INT;
    assigned_role TEXT;
    new_name TEXT;
    new_image TEXT;
BEGIN
    SELECT COUNT(*) INTO user_count FROM public.users;
    assigned_role := CASE WHEN user_count = 0 THEN 'admin' ELSE 'staff' END;

    new_name  := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
    new_image := COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture');

    INSERT INTO public.users (auth_user_id, name, email, image, role)
    VALUES (NEW.id, new_name, NEW.email, new_image, assigned_role)
    ON CONFLICT (email) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================
-- 006: Granular permissions per user
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS title text;

-- Verify
SELECT 'Schema setup completed. Tables created:' AS status;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
