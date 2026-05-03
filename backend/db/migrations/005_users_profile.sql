-- ============================================================
-- Migration 005: public.users table — profile/role for app
-- Linked to auth.users by email. Run in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.users (
    id          bigserial PRIMARY KEY,
    auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    name        text NOT NULL,
    email       text UNIQUE NOT NULL,
    password    text,                -- placeholder for legacy/non-Supabase auth
    image       text,
    role        text NOT NULL DEFAULT 'staff'  CHECK (role IN ('admin', 'staff')),
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON public.users(email);
CREATE INDEX IF NOT EXISTS users_auth_idx  ON public.users(auth_user_id);

-- Allow anon read (so backend with anon key can query)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_all"   ON public.users;
DROP POLICY IF EXISTS "users_insert_all"   ON public.users;
DROP POLICY IF EXISTS "users_update_all"   ON public.users;

CREATE POLICY "users_select_all" ON public.users FOR SELECT USING (true);
CREATE POLICY "users_insert_all" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "users_update_all" ON public.users FOR UPDATE USING (true);

-- Auto-create profile when someone signs up via Supabase Auth (trigger on auth.users)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    user_count INT;
    assigned_role TEXT;
    new_name TEXT;
    new_image TEXT;
BEGIN
    -- First user gets admin
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
-- BACKFILL: tạo profile cho các auth.users đã tồn tại
-- (Bao gồm admin@gmail.com mà user đã tạo)
-- ============================================================
INSERT INTO public.users (auth_user_id, name, email, image, role)
SELECT
    u.id,
    COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
    u.email,
    COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
    'staff'
FROM auth.users u
WHERE u.email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- Set admin@gmail.com làm admin
UPDATE public.users SET role = 'admin' WHERE email = 'admin@gmail.com';

-- Verify
SELECT id, email, role, created_at FROM public.users ORDER BY created_at;
