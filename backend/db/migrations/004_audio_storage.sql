-- ============================================================
-- Migration 004: Supabase Storage bucket for call audio files
-- Run this ONCE in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1) Create the bucket (public, 50MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'call-audio',
  'call-audio',
  true,
  52428800,  -- 50 MB
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/mp4', 'audio/m4a', 'audio/ogg', 'audio/flac', 'audio/webm', 'audio/opus']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 52428800,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) Drop old policies if they exist (for idempotency)
DROP POLICY IF EXISTS "call_audio_public_read"   ON storage.objects;
DROP POLICY IF EXISTS "call_audio_public_upload" ON storage.objects;
DROP POLICY IF EXISTS "call_audio_public_update" ON storage.objects;
DROP POLICY IF EXISTS "call_audio_public_delete" ON storage.objects;

-- 3) Allow anyone (including anon key) to READ audio files
CREATE POLICY "call_audio_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'call-audio');

-- 4) Allow anyone to UPLOAD new audio files
CREATE POLICY "call_audio_public_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'call-audio');

-- 5) Allow anyone to UPDATE (overwrite) audio files
CREATE POLICY "call_audio_public_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'call-audio');

-- 6) Allow anyone to DELETE audio files (for cleanup)
CREATE POLICY "call_audio_public_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'call-audio');

-- Verify setup
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'call-audio';
