-- HR&GA Workspace Migration v10
-- Fixes portal_settings permission denied (42501), adds SECURITY DEFINER RPC fallback,
-- adds official_department & salary_tier columns, and adds stationery purchase unit metadata.

-- 1. Ensure schema, table, sequence, and routine privileges for Supabase roles
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.portal_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

-- 2. Harden public.is_portal_admin() across admin_users and admin_login_credentials
CREATE OR REPLACE FUNCTION public.is_portal_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_username text := split_part(v_email, '@', 1);
  v_found boolean := false;
BEGIN
  IF v_uid IS NULL AND coalesce(auth.role(), '') <> 'authenticated' THEN
    RETURN false;
  END IF;

  IF to_regclass('public.admin_users') IS NOT NULL AND v_uid IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.admin_users au
      WHERE au.user_id = v_uid
    ) INTO v_found;
    IF v_found THEN
      RETURN true;
    END IF;
  END IF;

  IF to_regclass('public.admin_login_credentials') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.admin_login_credentials alc
      WHERE (v_uid IS NOT NULL AND alc.auth_user_id = v_uid)
         OR (v_username <> '' AND lower(coalesce(alc.username, '')) = v_username)
    ) INTO v_found;
    IF v_found THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.is_portal_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_portal_admin() TO anon, authenticated;

-- 3. Ensure portal_settings table & RLS policies allow reads for portal and writes for admins
ALTER TABLE IF EXISTS public.portal_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_settings_read_all ON public.portal_settings;
DROP POLICY IF EXISTS portal_settings_admin_write ON public.portal_settings;
DROP POLICY IF EXISTS "portal_settings_read" ON public.portal_settings;
DROP POLICY IF EXISTS "portal_settings_write" ON public.portal_settings;
DROP POLICY IF EXISTS "Allow public read portal_settings" ON public.portal_settings;
DROP POLICY IF EXISTS "Allow admin write portal_settings" ON public.portal_settings;

CREATE POLICY portal_settings_read_all
  ON public.portal_settings
  FOR SELECT
  USING (true);

CREATE POLICY portal_settings_admin_write
  ON public.portal_settings
  FOR ALL
  TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());

-- 4. SECURITY DEFINER batch upsert RPC fallback for portal_settings
CREATE OR REPLACE FUNCTION public.upsert_portal_settings_batch(p_entries jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_count integer := 0;
  v_key text;
BEGIN
  IF NOT public.is_portal_admin() THEN
    RAISE EXCEPTION 'permission denied for portal_settings' USING ERRCODE = '42501';
  END IF;

  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_key := trim(coalesce(v_item ->> 'key', ''));
    IF v_key <> '' THEN
      INSERT INTO public.portal_settings (key, value, updated_at)
      VALUES (v_key, coalesce(v_item -> 'value', 'null'::jsonb), now())
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_at = now();
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_portal_settings_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_portal_settings_batch(jsonb) TO authenticated;

-- 5. Schema extensions for Final Interview Official Department, Salary Tier, and ATK Purchase Units
ALTER TABLE IF EXISTS public.candidate_interviews
  ADD COLUMN IF NOT EXISTS official_department text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS salary_tier text NOT NULL DEFAULT 'below_umk';

ALTER TABLE IF EXISTS public.employees
  ADD COLUMN IF NOT EXISTS salary_tier text NOT NULL DEFAULT 'below_umk';

ALTER TABLE IF EXISTS public.stationery_items
  ADD COLUMN IF NOT EXISTS purchase_unit text NOT NULL DEFAULT 'PCS',
  ADD COLUMN IF NOT EXISTS conversion_qty numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_purchase_qty numeric NOT NULL DEFAULT 1;
