-- Migration: HR&GA Workspace v3
-- Covers:
-- 1. interview_date column on candidate_interviews + backfill
-- 2. English + legacy Indonesian compatibility on Lead Register recommendation check
-- 3. invited_candidates table (Invited Candidates menu with Candidate List linking)
-- 4. cv_screenings table (CV Screening tally per Source)

BEGIN;

-- ============================================================================
-- 1. INTERVIEW DATE ON CANDIDATE INTERVIEWS
-- ============================================================================
ALTER TABLE public.candidate_interviews
  ADD COLUMN IF NOT EXISTS interview_date date DEFAULT current_date;

UPDATE public.candidate_interviews
SET interview_date = coalesce(interview_date, created_at::date)
WHERE interview_date IS NULL;

CREATE INDEX IF NOT EXISTS candidate_interviews_stage_date_idx
  ON public.candidate_interviews (interview_stage, interview_date DESC, updated_at DESC);

-- ============================================================================
-- 2. LEAD REGISTER RECOMMENDATION CONSTRAINT (ENGLISH + LEGACY ID)
-- ============================================================================
ALTER TABLE public.candidate_stage1_applications
  DROP CONSTRAINT IF EXISTS candidate_stage1_recommendation_check;

ALTER TABLE public.candidate_stage1_applications
  ADD CONSTRAINT candidate_stage1_recommendation_check
  CHECK (
    recommendation IN (
      'Pending', 'Recommended', 'Not Recommended',
      'Belum Ditentukan', 'Direkomendasikan', 'Tidak Direkomendasikan'
    )
  );

-- ============================================================================
-- 3. INVITED CANDIDATES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.invited_candidates (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  invite_date date DEFAULT current_date NOT NULL,
  candidate_name text NOT NULL,
  applied_position text DEFAULT ''::text NOT NULL,
  source text NOT NULL,
  status text DEFAULT 'No Response'::text NOT NULL CHECK (status IN ('No Response', 'Responded')),
  linked_applicant_id uuid REFERENCES public.applicants(id) ON DELETE SET NULL,
  linked_stage1_id uuid REFERENCES public.candidate_stage1_applications(id) ON DELETE SET NULL,
  notes text DEFAULT ''::text NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS invited_candidates_date_idx
  ON public.invited_candidates (invite_date DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS invited_candidates_applicant_idx
  ON public.invited_candidates (linked_applicant_id);
CREATE INDEX IF NOT EXISTS invited_candidates_stage1_idx
  ON public.invited_candidates (linked_stage1_id);

ALTER TABLE public.invited_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal admin manages invited candidates" ON public.invited_candidates;
CREATE POLICY "portal admin manages invited candidates"
  ON public.invited_candidates
  TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());

-- ============================================================================
-- 4. CV SCREENING TABLE (SOURCE + SCREENING COUNT)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cv_screenings (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  source text NOT NULL UNIQUE,
  screening_count integer DEFAULT 0 NOT NULL CHECK (screening_count >= 0),
  notes text DEFAULT ''::text NOT NULL,
  updated_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS cv_screenings_source_idx
  ON public.cv_screenings (source);

ALTER TABLE public.cv_screenings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal admin manages cv screenings" ON public.cv_screenings;
CREATE POLICY "portal admin manages cv screenings"
  ON public.cv_screenings
  TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());

COMMIT;
