-- Migration: HR&GA Workspace v2
-- Covers:
-- 1. NIK Karyawan + PIN login & Manajemen User (Superadmin role, encrypted PIN reveal guarded by '8karakterH!')
-- 2. Lead Register recommendation column (Keterangan)
-- 3. Candidate List duplication for different positions (composite unique index on nik + position)
-- 4. Multi-stage Interview system (HR 1, HR 2, User 1, User 2, Final Interview)
-- 5. Extended 16-column Employee Directory schema & Final Interview hiring sync

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================================
-- 1. ADMIN CREDENTIALS, NIK LOGIN & MANAJEMEN USER
-- ============================================================================
ALTER TABLE public.admin_login_credentials
  ADD COLUMN IF NOT EXISTS employee_nik text,
  ADD COLUMN IF NOT EXISTS pin_encrypted text;

ALTER TABLE public.admin_login_credentials
  DROP CONSTRAINT IF EXISTS admin_login_credentials_role_check;
ALTER TABLE public.admin_login_credentials
  ADD CONSTRAINT admin_login_credentials_role_check
  CHECK (role IN ('Superadmin', 'admin', 'hr'));

ALTER TABLE public.admin_users
  DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE public.admin_users
  ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('Superadmin', 'admin', 'hr'));

UPDATE public.admin_login_credentials
SET employee_nik = coalesce(nullif(btrim(employee_nik), ''), upper(username)),
    role = CASE WHEN role IN ('admin', 'hr') THEN 'Superadmin' ELSE role END
WHERE employee_nik IS NULL OR btrim(employee_nik) = '' OR role IN ('admin', 'hr');

UPDATE public.admin_users
SET role = 'Superadmin'
WHERE role IN ('admin', 'hr');

CREATE UNIQUE INDEX IF NOT EXISTS admin_login_credentials_employee_nik_idx
  ON public.admin_login_credentials (lower(regexp_replace(employee_nik, '\s+', '', 'g')))
  WHERE employee_nik IS NOT NULL AND btrim(employee_nik) <> '';

-- Server-side login PIN verification supporting NIK Karyawan (case/space insensitive) or legacy username
CREATE OR REPLACE FUNCTION public.verify_admin_pin(p_username text, p_pin text)
RETURNS TABLE(
  ok boolean,
  auth_user_id uuid,
  display_name text,
  role text,
  message text,
  attempts_left integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_credential public.admin_login_credentials%rowtype;
  v_attempts integer;
  v_raw text := lower(btrim(coalesce(p_username, '')));
  v_norm text := lower(regexp_replace(coalesce(p_username, ''), '\s+', '', 'g'));
  v_pin text := coalesce(p_pin, '');
BEGIN
  SELECT * INTO v_credential
  FROM public.admin_login_credentials
  WHERE lower(username) = v_raw
     OR lower(username) = v_norm
     OR lower(regexp_replace(coalesce(employee_nik, ''), '\s+', '', 'g')) = v_norm
  ORDER BY (lower(username) = v_raw) DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, null::uuid, null::text, null::text,
      'NIK Karyawan atau PIN tidak sesuai.', 0;
    RETURN;
  END IF;

  IF v_credential.locked_until IS NOT NULL AND v_credential.locked_until > now() THEN
    RETURN QUERY SELECT false, null::uuid, null::text, null::text,
      'Login dikunci sementara. Silakan coba lagi setelah 15 menit.', 0;
    RETURN;
  END IF;

  IF extensions.crypt(v_pin, v_credential.pin_hash) = v_credential.pin_hash THEN
    UPDATE public.admin_login_credentials
    SET failed_attempts = 0,
        locked_until = null,
        last_login = now(),
        updated_at = now()
    WHERE username = v_credential.username;

    RETURN QUERY SELECT true, v_credential.auth_user_id,
      v_credential.display_name, v_credential.role, 'OK', 5;
    RETURN;
  END IF;

  v_attempts := v_credential.failed_attempts + 1;
  UPDATE public.admin_login_credentials
  SET failed_attempts = v_attempts,
      locked_until = CASE WHEN v_attempts >= 5 THEN now() + interval '15 minutes' ELSE null END,
      updated_at = now()
  WHERE username = v_credential.username;

  RETURN QUERY SELECT false, null::uuid, null::text, null::text,
    CASE WHEN v_attempts >= 5
      THEN 'Terlalu banyak percobaan. Login dikunci selama 15 menit.'
      ELSE 'NIK Karyawan atau PIN tidak sesuai.'
    END,
    greatest(0, 5 - v_attempts);
END;
$$;

-- Helper to check whether the signed-in user is the root 'admin' (Superuser) account
CREATE OR REPLACE FUNCTION public.is_root_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_login_credentials c
    WHERE c.auth_user_id = auth.uid()
      AND lower(c.username) = 'admin'
  );
$$;

-- Returns profile & root-admin status for current authenticated portal user
CREATE OR REPLACE FUNCTION public.get_my_admin_profile()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'username', c.username,
        'employee_nik', coalesce(nullif(c.employee_nik, ''), upper(c.username)),
        'display_name', c.display_name,
        'role', c.role,
        'is_root_admin', (lower(c.username) = 'admin')
      )
      FROM public.admin_login_credentials c
      WHERE c.auth_user_id = auth.uid()
      LIMIT 1
    ),
    (
      SELECT jsonb_build_object(
        'username', CASE WHEN lower(u.display_name) = 'administrator' THEN 'admin' ELSE '' END,
        'employee_nik', CASE WHEN lower(u.display_name) = 'administrator' THEN 'ADMIN' ELSE '' END,
        'display_name', u.display_name,
        'role', u.role,
        'is_root_admin', (lower(u.display_name) = 'administrator')
      )
      FROM public.admin_users u
      WHERE u.user_id = auth.uid()
      LIMIT 1
    )
  );
$$;

-- User Management RPCs (authenticated admins can view; only root 'admin' can add/edit/delete/reveal)
CREATE OR REPLACE FUNCTION public.list_portal_users()
RETURNS TABLE(
  username text,
  employee_nik text,
  display_name text,
  role text,
  has_stored_pin boolean,
  last_login timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_portal_admin() THEN
    RAISE EXCEPTION 'Akses admin diperlukan.';
  END IF;
  RETURN QUERY
  SELECT c.username,
         coalesce(nullif(c.employee_nik, ''), upper(c.username)),
         c.display_name,
         c.role,
         (c.pin_encrypted IS NOT NULL),
         c.last_login,
         c.created_at,
         c.updated_at
  FROM public.admin_login_credentials c
  ORDER BY c.created_at DESC, c.display_name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_portal_user(
  p_nik text,
  p_full_name text,
  p_role text DEFAULT 'Superadmin',
  p_pin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_display_nik text := upper(btrim(regexp_replace(coalesce(p_nik, ''), '\s+', ' ', 'g')));
  v_username text := lower(regexp_replace(coalesce(p_nik, ''), '[^a-zA-Z0-9._-]', '', 'g'));
  v_name text := btrim(coalesce(p_full_name, ''));
  v_role text := CASE WHEN btrim(coalesce(p_role, '')) IN ('Superadmin', 'admin', 'hr') THEN btrim(p_role) ELSE 'Superadmin' END;
  v_pin text := nullif(btrim(coalesce(p_pin, '')), '');
  v_exists boolean;
  v_auth_user_id uuid;
  v_secret text := 'hrga-workspace-pin-vault-v2-key';
BEGIN
  IF NOT public.is_portal_admin() OR NOT public.is_root_admin() THEN
    RAISE EXCEPTION 'Hanya akun Admin utama yang dapat menambahkan atau mengubah user.';
  END IF;
  IF length(v_username) < 3 OR length(v_username) > 32 THEN
    RAISE EXCEPTION 'NIK Karyawan minimal 3 karakter alfanumerik dan maksimal 32 karakter.';
  END IF;
  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Nama karyawan wajib diisi.';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.admin_login_credentials WHERE username = v_username),
         (SELECT auth_user_id FROM public.admin_login_credentials WHERE username = v_username)
  INTO v_exists, v_auth_user_id;

  IF NOT v_exists AND (v_pin IS NULL OR v_pin !~ '^\d{4,12}$') THEN
    RAISE EXCEPTION 'PIN wajib diisi 4–12 digit angka untuk user baru.';
  END IF;
  IF v_pin IS NOT NULL AND v_pin !~ '^\d{4,12}$' THEN
    RAISE EXCEPTION 'PIN harus terdiri dari 4–12 digit angka.';
  END IF;

  IF v_exists THEN
    UPDATE public.admin_login_credentials
    SET employee_nik = v_display_nik,
        display_name = v_name,
        role = v_role,
        pin_hash = CASE WHEN v_pin IS NOT NULL THEN extensions.crypt(v_pin, extensions.gen_salt('bf')) ELSE pin_hash END,
        pin_encrypted = CASE WHEN v_pin IS NOT NULL THEN encode(extensions.pgp_sym_encrypt(v_pin, v_secret), 'base64') ELSE pin_encrypted END,
        failed_attempts = 0,
        locked_until = null,
        updated_at = now()
    WHERE username = v_username;

    IF v_auth_user_id IS NOT NULL THEN
      UPDATE public.admin_users
      SET display_name = v_name,
          role = v_role
      WHERE user_id = v_auth_user_id;
    END IF;
  ELSE
    INSERT INTO public.admin_login_credentials (
      username, employee_nik, display_name, role, pin_hash, pin_encrypted
    ) VALUES (
      v_username,
      v_display_nik,
      v_name,
      v_role,
      extensions.crypt(v_pin, extensions.gen_salt('bf')),
      encode(extensions.pgp_sym_encrypt(v_pin, v_secret), 'base64')
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'username', v_username,
    'employee_nik', v_display_nik,
    'display_name', v_name,
    'role', v_role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reveal_portal_user_pin(p_username text, p_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_encrypted text;
  v_secret text := 'hrga-workspace-pin-vault-v2-key';
BEGIN
  IF NOT public.is_portal_admin() OR NOT public.is_root_admin() THEN
    RAISE EXCEPTION 'Hanya akun Admin utama yang dapat melihat PIN user.';
  END IF;
  IF coalesce(p_password, '') <> '8karakterH!' THEN
    RAISE EXCEPTION 'Password konfirmasi tidak sesuai.';
  END IF;
  SELECT pin_encrypted INTO v_encrypted
  FROM public.admin_login_credentials
  WHERE username = lower(btrim(coalesce(p_username, '')))
     OR lower(regexp_replace(coalesce(employee_nik, ''), '\s+', '', 'g')) = lower(regexp_replace(coalesce(p_username, ''), '\s+', '', 'g'))
  LIMIT 1;

  IF v_encrypted IS NULL THEN
    RAISE EXCEPTION 'PIN user ini dibuat sebelum pembaruan. Silakan edit dan simpan ulang PIN.';
  END IF;
  RETURN extensions.pgp_sym_decrypt(decode(v_encrypted, 'base64'), v_secret);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_portal_user(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_target public.admin_login_credentials%rowtype;
BEGIN
  IF NOT public.is_portal_admin() OR NOT public.is_root_admin() THEN
    RAISE EXCEPTION 'Hanya akun Admin utama yang dapat menghapus user.';
  END IF;
  SELECT * INTO v_target
  FROM public.admin_login_credentials
  WHERE username = lower(btrim(coalesce(p_username, '')));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User tidak ditemukan.';
  END IF;
  IF lower(v_target.username) = 'admin' OR v_target.auth_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Tidak dapat menghapus akun Admin utama atau akun yang sedang aktif digunakan.';
  END IF;
  DELETE FROM public.admin_login_credentials WHERE username = v_target.username;
  IF v_target.auth_user_id IS NOT NULL THEN
    DELETE FROM public.admin_users WHERE user_id = v_target.auth_user_id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Server-side lean applicants query: strips heavy base64 ktp_foto before network serialization
CREATE OR REPLACE FUNCTION public.list_applicants_lean()
RETURNS TABLE(
  id uuid,
  full_name text,
  nik text,
  "position" text,
  stage text,
  application_data jsonb,
  cv_path text,
  ktp_path text,
  created_at timestamptz,
  disc_submissions jsonb,
  employees jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_portal_admin() THEN
    RAISE EXCEPTION 'Akses admin diperlukan.';
  END IF;
  RETURN QUERY
  SELECT
    a.id,
    a.full_name,
    a.nik,
    a."position",
    a.stage,
    coalesce(a.application_data, '{}'::jsonb) - 'ktp_foto',
    a.cv_path,
    a.ktp_path,
    a.created_at,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'answers', d.answers, 'completed_at', d.completed_at))
      FROM public.disc_submissions d
      WHERE d.applicant_id = a.id
    ), '[]'::jsonb),
    coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', e.id))
      FROM public.employees e
      WHERE e.applicant_id = a.id
    ), '[]'::jsonb)
  FROM public.applicants a
  ORDER BY a.created_at DESC
  LIMIT 1000;
END;
$$;

REVOKE ALL ON FUNCTION public.is_root_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_root_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_admin_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_admin_profile() TO authenticated;
REVOKE ALL ON FUNCTION public.list_portal_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_portal_users() TO authenticated;
REVOKE ALL ON FUNCTION public.upsert_portal_user(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_portal_user(text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.reveal_portal_user_pin(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reveal_portal_user_pin(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_portal_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_portal_user(text) TO authenticated;
REVOKE ALL ON FUNCTION public.list_applicants_lean() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_applicants_lean() TO authenticated;

-- ============================================================================
-- 2. LEAD REGISTER: KETERANGAN REKOMENDASI
-- ============================================================================
ALTER TABLE public.candidate_stage1_applications
  ADD COLUMN IF NOT EXISTS recommendation text DEFAULT 'Belum Ditentukan'::text NOT NULL,
  ADD COLUMN IF NOT EXISTS recommendation_notes text DEFAULT ''::text NOT NULL;

ALTER TABLE public.candidate_stage1_applications
  DROP CONSTRAINT IF EXISTS candidate_stage1_recommendation_check;
ALTER TABLE public.candidate_stage1_applications
  ADD CONSTRAINT candidate_stage1_recommendation_check
  CHECK (recommendation IN ('Belum Ditentukan', 'Direkomendasikan', 'Tidak Direkomendasikan'));

-- ============================================================================
-- 3. APPLICANTS: DUPLIKASI KE POSISI LAIN & STATUS BARU
-- ============================================================================
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS duplicated_from uuid REFERENCES public.applicants(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS public.applicants_nik_unique_nonempty;
CREATE UNIQUE INDEX IF NOT EXISTS applicants_nik_position_unique_idx
  ON public.applicants (nik, lower(btrim("position")))
  WHERE nik IS NOT NULL AND btrim(nik) <> '';

ALTER TABLE public.applicants
  DROP CONSTRAINT IF EXISTS applicants_stage_check;
ALTER TABLE public.applicants
  ADD CONSTRAINT applicants_stage_check
  CHECK (stage IN ('stage1_pending', 'application_submitted', 'disc_completed', 'stage4_pending', 'os_sent', 'hired', 'rejected'));

-- Ensure DISC lookup supports duplicated candidate rows cleanly
CREATE OR REPLACE FUNCTION public.get_disc_candidate_by_nik(p_nik text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_nik text := regexp_replace(coalesce(p_nik, ''), '[^0-9]', '', 'g');
  v_result jsonb;
BEGIN
  IF length(v_nik) <> 16 THEN
    RAISE EXCEPTION 'NIK harus terdiri dari 16 angka.';
  END IF;
  SELECT jsonb_build_object(
    'full_name', a.full_name,
    'position', a.position,
    'stage', a.stage,
    'disc_completed', exists (
      SELECT 1 FROM public.disc_submissions d WHERE d.applicant_id = a.id
    )
  )
  INTO v_result
  FROM public.applicants a
  WHERE a.nik = v_nik
    AND a.stage IN ('application_submitted', 'disc_completed')
  ORDER BY a.created_at DESC
  LIMIT 1;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_disc_answers_by_nik(p_nik text, p_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_nik text := regexp_replace(coalesce(p_nik, ''), '[^0-9]', '', 'g');
  v_applicant_id uuid;
  v_answer jsonb;
  v_most integer;
  v_least integer;
BEGIN
  IF length(v_nik) <> 16 THEN
    RAISE EXCEPTION 'NIK harus terdiri dari 16 angka.';
  END IF;
  IF jsonb_typeof(p_answers) <> 'array' OR jsonb_array_length(p_answers) <> 24 THEN
    RAISE EXCEPTION 'Tes DISC harus berisi 24 jawaban.';
  END IF;
  SELECT a.id INTO v_applicant_id
  FROM public.applicants a
  WHERE a.nik = v_nik
    AND a.stage = 'application_submitted'
  ORDER BY a.created_at DESC
  LIMIT 1;
  IF v_applicant_id IS NULL THEN
    RAISE EXCEPTION 'NIK tidak ditemukan atau lamaran Tahap 2 belum terdaftar.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.disc_submissions d WHERE d.applicant_id = v_applicant_id) THEN
    RAISE EXCEPTION 'Tes DISC sudah pernah diselesaikan.';
  END IF;
  FOR v_answer IN SELECT value FROM jsonb_array_elements(p_answers) LOOP
    IF jsonb_typeof(v_answer) <> 'object' THEN
      RAISE EXCEPTION 'Format jawaban DISC tidak valid.';
    END IF;
    v_most := nullif(v_answer->>'most', '')::integer;
    v_least := nullif(v_answer->>'least', '')::integer;
    IF v_most IS NULL OR v_least IS NULL
       OR v_most NOT BETWEEN 0 AND 3
       OR v_least NOT BETWEEN 0 AND 3
       OR v_most = v_least THEN
      RAISE EXCEPTION 'Pilih tepat satu P dan satu K pada setiap nomor.';
    END IF;
  END LOOP;
  INSERT INTO public.disc_submissions(applicant_id, answers)
  VALUES(v_applicant_id, p_answers);
  UPDATE public.applicants
  SET stage = 'disc_completed', updated_at = now()
  WHERE id = v_applicant_id;
  RETURN jsonb_build_object('ok', true, 'stage', 'disc_completed');
END;
$$;

-- ============================================================================
-- 4. EMPLOYEE DIRECTORY (16-COLUMN FORMAT + HIRING DETAILS)
-- ============================================================================
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS full_name text DEFAULT ''::text NOT NULL,
  ADD COLUMN IF NOT EXISTS contract_start_date date,
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS address text DEFAULT ''::text NOT NULL,
  ADD COLUMN IF NOT EXISTS ktp_nik text DEFAULT ''::text NOT NULL,
  ADD COLUMN IF NOT EXISTS birth_place text DEFAULT ''::text NOT NULL,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS phone text DEFAULT ''::text NOT NULL,
  ADD COLUMN IF NOT EXISTS education text DEFAULT ''::text NOT NULL,
  ADD COLUMN IF NOT EXISTS gender text DEFAULT ''::text NOT NULL,
  ADD COLUMN IF NOT EXISTS religion text DEFAULT ''::text NOT NULL,
  ADD COLUMN IF NOT EXISTS salary numeric(14,2);

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_employment_status_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_employment_status_check
  CHECK (char_length(btrim(employment_status)) > 0);

-- Backfill full_name & KTP info on existing linked employees
UPDATE public.employees e
SET full_name = coalesce(nullif(e.full_name, ''), a.full_name, ''),
    ktp_nik = coalesce(nullif(e.ktp_nik, ''), a.nik, ''),
    address = coalesce(nullif(e.address, ''), a.application_data->>'alamat_asal', a.application_data->>'domisili', ''),
    birth_place = coalesce(nullif(e.birth_place, ''), a.application_data->>'tempat_lahir', ''),
    birth_date = coalesce(e.birth_date, nullif(a.application_data->>'tanggal_lahir', '')::date),
    phone = coalesce(nullif(e.phone, ''), a.application_data->>'telepon', ''),
    education = coalesce(nullif(e.education, ''), a.application_data->>'pendidikan_terakhir', ''),
    gender = coalesce(nullif(e.gender, ''), CASE WHEN a.application_data->>'gender' = 'L' THEN 'Laki-laki' WHEN a.application_data->>'gender' = 'P' THEN 'Perempuan' ELSE coalesce(a.application_data->>'gender', '') END),
    religion = coalesce(nullif(e.religion, ''), a.application_data->>'agama', '')
FROM public.applicants a
WHERE e.applicant_id = a.id;

-- ============================================================================
-- 5. INTERVIEW WORKFLOW TABLE (HR 1, HR 2, USER 1, USER 2, FINAL INTERVIEW)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.candidate_interviews (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  source_type text DEFAULT 'applicant'::text NOT NULL CHECK (source_type IN ('applicant', 'stage1')),
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE CASCADE,
  stage1_id uuid REFERENCES public.candidate_stage1_applications(id) ON DELETE CASCADE,
  candidate_name text NOT NULL,
  candidate_nik text DEFAULT ''::text NOT NULL,
  candidate_whatsapp text DEFAULT ''::text NOT NULL,
  applied_position text DEFAULT ''::text NOT NULL,
  interview_stage text NOT NULL CHECK (interview_stage IN ('HR 1', 'HR 2', 'User 1', 'User 2', 'Final Interview')),
  pic_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  pic_nik text DEFAULT ''::text NOT NULL,
  pic_name text DEFAULT ''::text NOT NULL,
  notes text DEFAULT ''::text NOT NULL,
  decision text NOT NULL,
  rejection_reason_category text DEFAULT ''::text NOT NULL,
  rejection_reason_detail text DEFAULT ''::text NOT NULL,
  work_start_date date,
  salary numeric(14,2),
  contract_duration_months integer,
  contract_start_date date,
  contract_end_date date,
  official_position text DEFAULT ''::text NOT NULL,
  assigned_nik text DEFAULT ''::text NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS candidate_interviews_stage_updated_idx
  ON public.candidate_interviews (interview_stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS candidate_interviews_applicant_idx
  ON public.candidate_interviews (applicant_id);
CREATE INDEX IF NOT EXISTS candidate_interviews_stage1_idx
  ON public.candidate_interviews (stage1_id);

ALTER TABLE public.candidate_interviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal admin manages candidate interviews" ON public.candidate_interviews;
CREATE POLICY "portal admin manages candidate interviews"
  ON public.candidate_interviews
  TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());

COMMIT;
