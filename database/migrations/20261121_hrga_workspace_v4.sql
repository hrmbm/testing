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

COMMIT;
