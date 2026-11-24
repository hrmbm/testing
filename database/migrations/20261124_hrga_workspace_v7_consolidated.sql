-- Consolidated Idempotent Migration: HR&GA Workspace v5 + v6 + v7
-- Safe to run once in Supabase SQL Editor on a project that has NOT yet run v5 or v6 (and also safe if partially run).
-- Covers:
-- 1. Contract Update Requests & Contract History (from v5)
-- 2. Attendance Upload Center, Raw Punch Log, National Holiday & Calendar Days, Conditional Holidays (from v6)
-- 3. Staff Attendance Reviews, Staff Meal Overrides (v7), Employee Leave/Cuti Balances (from v6)
-- 4. Drivers Multi-Activity Schedules (v7), Abnormal/Overnight Attendance Reconciliations (v7), Time Checksheets, Payroll Runs & Lines (from v6)
-- 5. Stationery / ATK Master Items, SLOCs, Immutable Stock Ledger & Atomic RPC (from v6)

BEGIN;

-- ============================================================================
-- 1. CONTRACT UPDATE REQUESTS & HISTORY (v5)
-- ============================================================================
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
  FOR ALL TO authenticated
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
  FOR ALL TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());

-- ============================================================================
-- 2. ATTENDANCE UPLOAD, RAW EVENTS, CALENDAR & CONDITIONAL HOLIDAYS (v6)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.attendance_upload_batches (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  file_hash text NOT NULL DEFAULT '',
  source_type text NOT NULL CHECK (source_type IN ('mitra_transaksi', 'mitra_presensi', 'radin_xlsx', 'cuti_xlsx', 'employee_xlsx', 'holiday_xlsx')),
  filename text NOT NULL DEFAULT '',
  period_start date NULL,
  period_end date NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('uploaded', 'validating', 'needs_review', 'partial_exceptions', 'completed', 'imported', 'partially_imported', 'rejected')),
  row_count integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  exception_count integer NOT NULL DEFAULT 0,
  exceptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  uploaded_by uuid NULL,
  uploaded_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure constraint allows holiday_xlsx if table pre-existed
ALTER TABLE public.attendance_upload_batches
  DROP CONSTRAINT IF EXISTS attendance_upload_batches_source_type_check;
ALTER TABLE public.attendance_upload_batches
  ADD CONSTRAINT attendance_upload_batches_source_type_check
  CHECK (source_type IN ('mitra_transaksi', 'mitra_presensi', 'radin_xlsx', 'cuti_xlsx', 'employee_xlsx', 'holiday_xlsx'));

CREATE INDEX IF NOT EXISTS attendance_upload_batches_hash_idx
  ON public.attendance_upload_batches (file_hash, source_type);

ALTER TABLE public.attendance_upload_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_upload_batches_admin_all" ON public.attendance_upload_batches;
CREATE POLICY "attendance_upload_batches_admin_all"
  ON public.attendance_upload_batches FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.attendance_raw_events (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  batch_id text NULL REFERENCES public.attendance_upload_batches(id) ON DELETE SET NULL,
  source_type text NOT NULL,
  source_priority integer NOT NULL DEFAULT 1,
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_no text NOT NULL DEFAULT '',
  employee_name text NOT NULL DEFAULT '',
  work_date date NOT NULL,
  check_in text NOT NULL DEFAULT '',
  check_out text NOT NULL DEFAULT '',
  raw_code text NOT NULL DEFAULT '',
  source_status text NOT NULL DEFAULT '',
  fingerprint text NOT NULL,
  is_exception boolean NOT NULL DEFAULT false,
  exception_reason text NULL DEFAULT '',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fingerprint)
);

CREATE INDEX IF NOT EXISTS attendance_raw_events_emp_date_idx
  ON public.attendance_raw_events (employee_no, work_date);

ALTER TABLE public.attendance_raw_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_raw_events_admin_all" ON public.attendance_raw_events;
CREATE POLICY "attendance_raw_events_admin_all"
  ON public.attendance_raw_events FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.attendance_calendar_days (
  cal_date date PRIMARY KEY,
  pt_scope text NOT NULL DEFAULT 'ALL' CHECK (pt_scope IN ('ALL', 'MITRA', 'RADIN')),
  day_type text NOT NULL DEFAULT 'WORKING' CHECK (day_type IN ('WORKING', 'WEEKEND', 'HOLIDAY', 'CUTI_BERSAMA')),
  is_conditional boolean NOT NULL DEFAULT false,
  label text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_calendar_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_calendar_days_admin_all" ON public.attendance_calendar_days;
CREATE POLICY "attendance_calendar_days_admin_all"
  ON public.attendance_calendar_days FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.staff_conditional_holidays (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  work_date date NOT NULL,
  employee_no text NOT NULL,
  employee_name text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_date, employee_no)
);

ALTER TABLE public.staff_conditional_holidays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_conditional_holidays_admin_all" ON public.staff_conditional_holidays;
CREATE POLICY "staff_conditional_holidays_admin_all"
  ON public.staff_conditional_holidays FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

-- ============================================================================
-- 3. STAFF ATTENDANCE REVIEWS, MEAL OVERRIDES (v7) & CUTI BALANCES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staff_attendance_reviews (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  period_key text NOT NULL DEFAULT '',
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_no text NOT NULL,
  work_date date NOT NULL,
  auto_code text NOT NULL DEFAULT '',
  final_code text NOT NULL DEFAULT '',
  check_in_time text NOT NULL DEFAULT '',
  check_out_time text NOT NULL DEFAULT '',
  is_confirmed boolean NOT NULL DEFAULT false,
  needs_review boolean NOT NULL DEFAULT false,
  leave_candidate boolean NOT NULL DEFAULT false,
  source_conflict boolean NOT NULL DEFAULT false,
  reason text NOT NULL DEFAULT '',
  confirmed_by text NOT NULL DEFAULT '',
  confirmed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_no, work_date)
);

CREATE INDEX IF NOT EXISTS staff_attendance_reviews_period_idx
  ON public.staff_attendance_reviews (period_key, work_date);

ALTER TABLE public.staff_attendance_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_attendance_reviews_admin_all" ON public.staff_attendance_reviews;
CREATE POLICY "staff_attendance_reviews_admin_all"
  ON public.staff_attendance_reviews FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

-- NEW v7: Manual Staff Meal Allowance Overrides (per-date adjustment)
CREATE TABLE IF NOT EXISTS public.staff_meal_overrides (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  work_date date NOT NULL,
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_no text NOT NULL,
  employee_name text NOT NULL DEFAULT '',
  eligible boolean NOT NULL DEFAULT true,
  reason text NOT NULL DEFAULT '',
  updated_by text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_no, work_date)
);

ALTER TABLE public.staff_meal_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_meal_overrides_admin_all" ON public.staff_meal_overrides;
CREATE POLICY "staff_meal_overrides_admin_all"
  ON public.staff_meal_overrides FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.employee_leave_balances (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_no text NOT NULL DEFAULT '',
  employee_name text NOT NULL DEFAULT '',
  pt_entity text NOT NULL DEFAULT 'MITRA',
  join_date date NULL,
  period_label text NOT NULL DEFAULT '',
  annual_quota integer NOT NULL DEFAULT 12,
  cuti_bersama_used integer NOT NULL DEFAULT 6,
  diambil_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  pending_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  remaining_leave integer NOT NULL DEFAULT 6,
  renewal_date date NULL,
  unmatched_employee boolean NOT NULL DEFAULT false,
  confirmation_required boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending_review', 'exception')),
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_no, period_label)
);

ALTER TABLE public.employee_leave_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employee_leave_balances_admin_all" ON public.employee_leave_balances;
CREATE POLICY "employee_leave_balances_admin_all"
  ON public.employee_leave_balances FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

-- ============================================================================
-- 4. DRIVERS SCHEDULES (v7 Multi-Activity), ABNORMAL RECONCILIATIONS (v7), CHECKSHEET & PAYROLL
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.driver_daily_schedules (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  work_date date NOT NULL,
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_no text NOT NULL DEFAULT '',
  driver_name text NOT NULL DEFAULT '',
  section text NOT NULL DEFAULT 'Support' CHECK (section IN ('Support', 'Indoor', 'Outdoor', 'Radin', 'Lainnya')),
  start_time text NOT NULL DEFAULT '07:00',
  end_time text NOT NULL DEFAULT '15:00',
  activities jsonb NOT NULL DEFAULT '[]'::jsonb,
  normal_hours numeric NOT NULL DEFAULT 8,
  overtime_hours numeric NOT NULL DEFAULT 0,
  is_holiday boolean NOT NULL DEFAULT false,
  ritase_flag boolean NOT NULL DEFAULT false,
  vehicle_no text NOT NULL DEFAULT '',
  destination text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  revision_no integer NOT NULL DEFAULT 1,
  revision_reason text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- v7 Upgrade: allow multi-block schedules per driver/date/section and store structured activities array
ALTER TABLE public.driver_daily_schedules
  DROP CONSTRAINT IF EXISTS driver_daily_schedules_work_date_employee_no_section_key;
ALTER TABLE public.driver_daily_schedules
  ADD COLUMN IF NOT EXISTS activities jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS driver_daily_schedules_emp_date_idx
  ON public.driver_daily_schedules (employee_no, work_date);

ALTER TABLE public.driver_daily_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "driver_daily_schedules_admin_all" ON public.driver_daily_schedules;
CREATE POLICY "driver_daily_schedules_admin_all"
  ON public.driver_daily_schedules FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

-- NEW v7: Driver Attendance Abnormal & Overnight Reconciliation Overrides
CREATE TABLE IF NOT EXISTS public.driver_attendance_reconciliations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_no text NOT NULL,
  driver_name text NOT NULL DEFAULT '',
  work_date date NOT NULL,
  checkout_date date NOT NULL,
  actual_check_in text NOT NULL DEFAULT '',
  actual_check_out text NOT NULL DEFAULT '',
  is_overnight boolean NOT NULL DEFAULT false,
  resolved boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  updated_by text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_no, work_date)
);

ALTER TABLE public.driver_attendance_reconciliations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "driver_attendance_reconciliations_admin_all" ON public.driver_attendance_reconciliations;
CREATE POLICY "driver_attendance_reconciliations_admin_all"
  ON public.driver_attendance_reconciliations FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.driver_time_checksheets (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  work_date date NOT NULL,
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_no text NOT NULL DEFAULT '',
  hour_slot text NOT NULL,
  section_code text NOT NULL DEFAULT '' CHECK (section_code IN ('S', 'I', 'O', 'R', 'L', '')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_date, employee_no, hour_slot)
);

ALTER TABLE public.driver_time_checksheets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "driver_time_checksheets_admin_all" ON public.driver_time_checksheets;
CREATE POLICY "driver_time_checksheets_admin_all"
  ON public.driver_time_checksheets FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.driver_payroll_runs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  period_key text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'reopened')),
  rules_confirmed boolean NOT NULL DEFAULT false,
  settings_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  bkk_number text NOT NULL DEFAULT '',
  total_gross numeric NOT NULL DEFAULT 0,
  total_fee numeric NOT NULL DEFAULT 0,
  total_pph numeric NOT NULL DEFAULT 0,
  total_net_transfer numeric NOT NULL DEFAULT 0,
  finalized_by text NOT NULL DEFAULT '',
  finalized_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_key)
);

ALTER TABLE public.driver_payroll_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "driver_payroll_runs_admin_all" ON public.driver_payroll_runs;
CREATE POLICY "driver_payroll_runs_admin_all"
  ON public.driver_payroll_runs FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.driver_payroll_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  run_id text NOT NULL REFERENCES public.driver_payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_no text NOT NULL DEFAULT '',
  driver_name text NOT NULL DEFAULT '',
  section text NOT NULL DEFAULT 'Support',
  base_wage numeric NOT NULL DEFAULT 3675000,
  present_days numeric NOT NULL DEFAULT 0,
  basic_pay numeric NOT NULL DEFAULT 0,
  weekday_ot_hours numeric NOT NULL DEFAULT 0,
  holiday_ot_hours numeric NOT NULL DEFAULT 0,
  overtime_pay numeric NOT NULL DEFAULT 0,
  prior_shortfall numeric NOT NULL DEFAULT 0,
  gross_pay numeric NOT NULL DEFAULT 0,
  bpjs_deduction numeric NOT NULL DEFAULT 0,
  claim_hours numeric NOT NULL DEFAULT 0,
  claim_deduction numeric NOT NULL DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_payroll_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "driver_payroll_lines_admin_all" ON public.driver_payroll_lines;
CREATE POLICY "driver_payroll_lines_admin_all"
  ON public.driver_payroll_lines FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

-- ============================================================================
-- 5. STATIONERY / ATK & ATOMIC RPC (v6)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.stationery_slocs (
  code text PRIMARY KEY,
  name text NOT NULL,
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stationery_slocs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stationery_slocs_admin_all" ON public.stationery_slocs;
CREATE POLICY "stationery_slocs_admin_all"
  ON public.stationery_slocs FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.stationery_items (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  item_code text UNIQUE NOT NULL,
  item_name text UNIQUE NOT NULL,
  unit text NOT NULL DEFAULT 'PCS',
  opening_stock numeric NOT NULL DEFAULT 0,
  current_stock numeric NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  min_stock numeric NOT NULL DEFAULT 2 CHECK (min_stock >= 0),
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stationery_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stationery_items_admin_all" ON public.stationery_items;
CREATE POLICY "stationery_items_admin_all"
  ON public.stationery_items FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.stationery_movements (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tx_date date NOT NULL,
  tx_type text NOT NULL CHECK (tx_type IN ('IN', 'OUT', 'ADJUSTMENT', 'REVERSAL')),
  item_id text NOT NULL REFERENCES public.stationery_items(id) ON DELETE RESTRICT,
  item_code text NOT NULL DEFAULT '',
  item_name text NOT NULL DEFAULT '',
  qty numeric NOT NULL,
  unit text NOT NULL DEFAULT 'PCS',
  sloc_raw text NOT NULL DEFAULT 'HR GA',
  sloc_canonical text NOT NULL DEFAULT 'HR GA',
  reference_no text NOT NULL DEFAULT '',
  balance_before numeric NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL CHECK (balance_after >= 0),
  notes text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stationery_movements_item_date_idx
  ON public.stationery_movements (item_id, tx_date DESC);

ALTER TABLE public.stationery_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stationery_movements_admin_all" ON public.stationery_movements;
CREATE POLICY "stationery_movements_admin_all"
  ON public.stationery_movements FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

DROP FUNCTION IF EXISTS public.record_stationery_transaction(date, text, uuid, text, numeric, text, uuid, text);
DROP FUNCTION IF EXISTS public.record_stationery_transaction(text, text, numeric, date, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.record_stationery_transaction(
  p_item_id text,
  p_tx_type text,
  p_qty numeric,
  p_tx_date date DEFAULT CURRENT_DATE,
  p_sloc_raw text DEFAULT 'HR GA',
  p_sloc_canonical text DEFAULT 'HR GA',
  p_reference_no text DEFAULT '',
  p_notes text DEFAULT '',
  p_created_by text DEFAULT ''
)
RETURNS public.stationery_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.stationery_items%ROWTYPE;
  v_tx_type text;
  v_delta numeric;
  v_new_balance numeric;
  v_row public.stationery_movements%ROWTYPE;
BEGIN
  IF NOT public.is_portal_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin privileges required';
  END IF;

  v_tx_type := UPPER(COALESCE(NULLIF(trim(p_tx_type), ''), 'OUT'));
  IF v_tx_type = 'ADJUST' THEN
    v_tx_type := 'ADJUSTMENT';
  END IF;

  IF v_tx_type NOT IN ('IN', 'OUT', 'ADJUSTMENT', 'REVERSAL') THEN
    RAISE EXCEPTION 'Invalid transaction type: %', p_tx_type;
  END IF;

  IF v_tx_type IN ('IN', 'OUT') AND (p_qty IS NULL OR p_qty <= 0) THEN
    RAISE EXCEPTION 'Quantity for % must be greater than zero', v_tx_type;
  END IF;

  SELECT * INTO v_item FROM public.stationery_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stationery item not found: %', p_item_id;
  END IF;

  IF v_tx_type = 'IN' THEN
    v_delta := ABS(p_qty);
  ELSIF v_tx_type = 'OUT' THEN
    v_delta := -ABS(p_qty);
  ELSE
    v_delta := COALESCE(p_qty, 0);
  END IF;

  v_new_balance := ROUND((v_item.current_stock + v_delta)::numeric, 2);
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient stock for % (available: %, requested change: %)', v_item.item_name, v_item.current_stock, v_delta;
  END IF;

  UPDATE public.stationery_items
    SET current_stock = v_new_balance, updated_at = now()
    WHERE id = p_item_id;

  INSERT INTO public.stationery_movements (
    tx_date, tx_type, item_id, item_code, item_name, qty, unit,
    sloc_raw, sloc_canonical, reference_no, balance_before, balance_after,
    notes, created_by
  )
  VALUES (
    COALESCE(p_tx_date, CURRENT_DATE),
    v_tx_type,
    p_item_id,
    v_item.item_code,
    v_item.item_name,
    CASE WHEN v_tx_type = 'ADJUSTMENT' THEN v_delta ELSE ABS(p_qty) END,
    v_item.unit,
    COALESCE(NULLIF(trim(p_sloc_raw), ''), 'HR GA'),
    COALESCE(NULLIF(trim(p_sloc_canonical), ''), 'HR GA'),
    COALESCE(p_reference_no, ''),
    v_item.current_stock,
    v_new_balance,
    COALESCE(p_notes, ''),
    COALESCE(p_created_by, '')
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_stationery_transaction(text, text, numeric, date, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_stationery_transaction(text, text, numeric, date, text, text, text, text, text) TO authenticated;

COMMIT;
