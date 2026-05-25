-- ============================================================
-- VECTOR / RAG layer — chạy SAU khi 000a_safe_schema.sql đã xong
-- Yêu cầu pgvector extension. Nếu lỗi, vào Database → Extensions
-- bật `vector` rồi chạy lại file này.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

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

NOTIFY pgrst, 'reload schema';
SELECT 'Vector RAG layer done' AS status;
