-- Migration: HR&GA Workspace v5
-- Covers:
-- 1. Contract Update Requests (post-print Employee Directory updates awaiting Root Admin approval)
-- 2. Contract History & Cancellation Snapshots (continuous sequence + rollback capability)

BEGIN;

CREATE TABLE IF NOT EXISTS public.contract_update_requests (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text NOT NULL DEFAULT '',
  reviewed_at timestamptz NULL,
  reviewed_by text NULL,
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  applicant_id uuid NULL REFERENCES public.applicants(id) ON DELETE SET NULL,
  interview_id uuid NULL REFERENCES public.candidate_interviews(id) ON DELETE SET NULL,
  full_name text NOT NULL DEFAULT '',
  employee_nik text NOT NULL DEFAULT '',
  ktp_nik text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  employment_status text NOT NULL DEFAULT 'KONTRAK',
  contract_start_date date NULL,
  contract_end_date date NULL,
  duration_months integer NOT NULL DEFAULT 12,
  doc_sequence text NOT NULL DEFAULT '001',
  contract_number text NOT NULL DEFAULT '',
  salary numeric NULL,
  previous_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_update_requests
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

CREATE INDEX IF NOT EXISTS contract_update_requests_status_idx
  ON public.contract_update_requests (status, requested_at DESC);

ALTER TABLE public.contract_update_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contract_update_requests_admin_all" ON public.contract_update_requests;
CREATE POLICY "contract_update_requests_admin_all"
  ON public.contract_update_requests
  FOR ALL
  TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.contract_history (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  request_id text NULL,
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'cancelled')),
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL DEFAULT '',
  applied_by_name text NOT NULL DEFAULT '',
  cancelled_at timestamptz NULL,
  cancelled_by text NULL,
  cancelled_by_name text NOT NULL DEFAULT '',
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_employee_id uuid NULL,
  applicant_id uuid NULL REFERENCES public.applicants(id) ON DELETE SET NULL,
  interview_id uuid NULL REFERENCES public.candidate_interviews(id) ON DELETE SET NULL,
  full_name text NOT NULL DEFAULT '',
  employee_nik text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  contract_start_date date NULL,
  contract_end_date date NULL,
  duration_months integer NOT NULL DEFAULT 12,
  doc_sequence text NOT NULL DEFAULT '001',
  contract_number text NOT NULL DEFAULT '',
  salary numeric NULL,
  previous_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_history
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE public.contract_history
  ADD COLUMN IF NOT EXISTS applied_by_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cancelled_by_name text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS contract_history_applied_idx
  ON public.contract_history (applied_at DESC);

ALTER TABLE public.contract_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contract_history_admin_all" ON public.contract_history;
CREATE POLICY "contract_history_admin_all"
  ON public.contract_history
  FOR ALL
  TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());

COMMIT;
