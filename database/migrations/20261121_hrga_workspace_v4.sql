-- Migration: HR&GA Workspace v4
-- Covers:
-- 1. Lead Register `source` column (for external Lead Register form tracking & auto-sync to Invited as Responded)
-- 2. Final Interview `contract_number` column on `candidate_interviews`
-- 3. CV Screening `position` column on `cv_screenings` with composite unique constraint (position, source)

BEGIN;

-- ============================================================================
-- 1. LEAD REGISTER SOURCE COLUMN
-- ============================================================================
ALTER TABLE public.candidate_stage1_applications
  ADD COLUMN IF NOT EXISTS source text DEFAULT ''::text NOT NULL;

CREATE INDEX IF NOT EXISTS candidate_stage1_source_idx
  ON public.candidate_stage1_applications (source);

-- ============================================================================
-- 2. FINAL INTERVIEW CONTRACT NUMBER
-- ============================================================================
ALTER TABLE public.candidate_interviews
  ADD COLUMN IF NOT EXISTS contract_number text DEFAULT ''::text NOT NULL;

-- ============================================================================
-- 3. CV SCREENING POSITION + SOURCE COMPOSITE KEY
-- ============================================================================
ALTER TABLE public.cv_screenings
  ADD COLUMN IF NOT EXISTS "position" text DEFAULT ''::text NOT NULL;

ALTER TABLE public.cv_screenings
  DROP CONSTRAINT IF EXISTS cv_screenings_source_key;

DROP INDEX IF EXISTS public.cv_screenings_source_key;

ALTER TABLE public.cv_screenings
  DROP CONSTRAINT IF EXISTS cv_screenings_position_source_unique;

ALTER TABLE public.cv_screenings
  ADD CONSTRAINT cv_screenings_position_source_unique UNIQUE ("position", source);

CREATE INDEX IF NOT EXISTS cv_screenings_position_idx
  ON public.cv_screenings ("position");

-- ============================================================================
-- 4. CROSS-POSITION DISC CONTINUITY BY 16-DIGIT NIK
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_disc_candidate_by_nik(p_nik text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_nik text := regexp_replace(coalesce(p_nik,''), '[^0-9]', '', 'g');
  v_result jsonb;
  v_has_disc boolean := false;
begin
  if length(v_nik) <> 16 then
    raise exception 'NIK harus terdiri dari 16 angka.';
  end if;

  select exists (
    select 1
    from public.applicants a
    left join public.disc_submissions d on d.applicant_id = a.id
    where regexp_replace(coalesce(a.nik,''), '[^0-9]', '', 'g') = v_nik
      and (
        d.id is not null
        or a.stage in ('disc_completed', 'stage4_pending', 'os_sent', 'hired')
      )
  )
  into v_has_disc;

  select jsonb_build_object(
    'full_name', a.full_name,
    'position', a.position,
    'stage', a.stage,
    'disc_completed', v_has_disc
  )
  into v_result
  from public.applicants a
  where regexp_replace(coalesce(a.nik,''), '[^0-9]', '', 'g') = v_nik
    and a.stage in ('application_submitted','disc_completed','stage4_pending','os_sent','hired','rejected')
  order by (exists (select 1 from public.disc_submissions d where d.applicant_id = a.id)) desc, a.created_at desc
  limit 1;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_disc_answers_by_nik(p_nik text, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_nik text := regexp_replace(coalesce(p_nik,''), '[^0-9]', '', 'g');
  v_applicant_id uuid;
  v_answer jsonb;
  v_most integer;
  v_least integer;
begin
  if length(v_nik) <> 16 then
    raise exception 'NIK harus terdiri dari 16 angka.';
  end if;
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> 24 then
    raise exception 'Tes DISC harus berisi 24 jawaban.';
  end if;

  if exists (
    select 1
    from public.applicants a
    join public.disc_submissions d on d.applicant_id = a.id
    where regexp_replace(coalesce(a.nik,''), '[^0-9]', '', 'g') = v_nik
  ) then
    raise exception 'Tes DISC sudah pernah diselesaikan untuk NIK ini.';
  end if;

  select a.id into v_applicant_id
  from public.applicants a
  where regexp_replace(coalesce(a.nik,''), '[^0-9]', '', 'g') = v_nik
    and a.stage = 'application_submitted'
  order by a.created_at desc
  limit 1;

  if v_applicant_id is null then
    raise exception 'NIK tidak ditemukan atau lamaran Tahap 2 belum terdaftar.';
  end if;

  for v_answer in select value from jsonb_array_elements(p_answers) loop
    if jsonb_typeof(v_answer) <> 'object' then
      raise exception 'Format jawaban DISC tidak valid.';
    end if;
    v_most := nullif(v_answer->>'most','')::integer;
    v_least := nullif(v_answer->>'least','')::integer;
    if v_most is null or v_least is null
       or v_most not between 0 and 3
       or v_least not between 0 and 3
       or v_most = v_least then
      raise exception 'Pilih tepat satu P dan satu K pada setiap nomor.';
    end if;
  end loop;

  insert into public.disc_submissions(applicant_id, answers)
  values(v_applicant_id, p_answers);

  insert into public.disc_submissions(applicant_id, answers)
  select sibling.id, p_answers
  from public.applicants sibling
  where regexp_replace(coalesce(sibling.nik,''), '[^0-9]', '', 'g') = v_nik
    and sibling.id <> v_applicant_id
  on conflict (applicant_id) do nothing;

  update public.applicants
  set stage = 'disc_completed', updated_at = now()
  where regexp_replace(coalesce(nik,''), '[^0-9]', '', 'g') = v_nik
    and stage = 'application_submitted';

  return jsonb_build_object('ok', true, 'stage', 'disc_completed');
end;
$function$;

COMMIT;
