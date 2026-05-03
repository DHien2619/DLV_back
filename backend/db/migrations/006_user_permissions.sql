-- ============================================================
-- Migration 006: Granular permissions per user
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS title text;

-- Default permission preset for staff (inherits role-based rules)
-- Admin always has all permissions implicitly (checked in app code).
-- Staff defaults: only own work + customer/notes
UPDATE public.users
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
  'view_all_calls',       false,
  'view_dashboard',       false,
  'view_compliance_queue',false,
  'view_skills',          false,
  'coach_team',           false,
  'manage_users',         false,
  'delete_calls',         false,
  'export_data',          false
)
WHERE role = 'staff' AND (permissions IS NULL OR permissions = '{}'::jsonb);

-- Verify
SELECT id, email, role, permissions FROM public.users ORDER BY created_at;
