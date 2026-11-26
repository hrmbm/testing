-- HR&GA Workspace Migration v11
-- Fixes Lead Register (candidate_stage1_applications) Delete / Update / Select RLS policies
-- and adds a SECURITY DEFINER RPC fallback so admins can reliably delete leads even when
-- FK-linked interviews/invites exist or direct PostgREST DELETE is blocked by missing RLS.

BEGIN;

-- 1. Ensure schema and table grants on candidate_stage1_applications
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT INSERT ON public.candidate_stage1_applications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_stage1_applications TO authenticated;

-- 2. Ensure admin SELECT / UPDATE / DELETE RLS policies exist on candidate_stage1_applications
-- (Leaves existing public /apply INSERT policy intact)
ALTER TABLE IF EXISTS public.candidate_stage1_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS candidate_stage1_admin_select ON public.candidate_stage1_applications;
DROP POLICY IF EXISTS candidate_stage1_admin_update ON public.candidate_stage1_applications;
DROP POLICY IF EXISTS candidate_stage1_admin_delete ON public.candidate_stage1_applications;
DROP POLICY IF EXISTS "portal admin selects stage1" ON public.candidate_stage1_applications;
DROP POLICY IF EXISTS "portal admin updates stage1" ON public.candidate_stage1_applications;
DROP POLICY IF EXISTS "portal admin deletes stage1" ON public.candidate_stage1_applications;

CREATE POLICY candidate_stage1_admin_select
  ON public.candidate_stage1_applications
  FOR SELECT
  TO authenticated
  USING (public.is_portal_admin());

CREATE POLICY candidate_stage1_admin_update
  ON public.candidate_stage1_applications
  FOR UPDATE
  TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());

CREATE POLICY candidate_stage1_admin_delete
  ON public.candidate_stage1_applications
  FOR DELETE
  TO authenticated
  USING (public.is_portal_admin());

-- 3. Allow portal admins to remove uploaded Stage 1 CVs from storage
DROP POLICY IF EXISTS candidate_stage1_cv_admin_delete ON storage.objects;
DROP POLICY IF EXISTS "portal admin deletes stage1 cv" ON storage.objects;
CREATE POLICY candidate_stage1_cv_admin_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'candidate-stage1-cv' AND public.is_portal_admin());

-- 4. SECURITY DEFINER RPC for deleting Lead Register rows cleanly & atomically
CREATE OR REPLACE FUNCTION public.delete_stage1_application(p_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text := btrim(coalesce(p_id, ''));
  v_deleted integer := 0;
BEGIN
  IF NOT public.is_portal_admin() THEN
    RAISE EXCEPTION 'permission denied for candidate_stage1_applications' USING ERRCODE = '42501';
  END IF;

  IF v_id = '' THEN
    RETURN 0;
  END IF;

  IF to_regclass('public.invited_candidates') IS NOT NULL THEN
    UPDATE public.invited_candidates
       SET linked_stage1_id = NULL,
           updated_at = now()
     WHERE linked_stage1_id::text = v_id;
  END IF;

  IF to_regclass('public.candidate_interviews') IS NOT NULL THEN
    DELETE FROM public.candidate_interviews
     WHERE stage1_id::text = v_id;
  END IF;

  DELETE FROM public.candidate_stage1_applications
   WHERE id::text = v_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_stage1_application(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_stage1_application(text) TO authenticated;

COMMIT;
