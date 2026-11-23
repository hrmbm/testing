-- Migration: HR&GA Workspace v6
-- Covers:
-- 1. Attendance Upload Center (idempotent batches, normalized raw punch/event log)
-- 2. Calendar Days & Conditional Holiday Schedule
-- 3. Staff Attendance Processing (persisted HR review & confirmed statuses)
-- 4. Employee Leave / Cuti Balances & History
-- 5. Drivers Daily Schedule, Time Checksheets, Payroll Runs & Lines
-- 6. Stationery / ATK Master Items, Canonical SLOCs, Immutable Stock Ledger, Atomic RPCs

BEGIN;

CREATE TABLE IF NOT EXISTS public.attendance_upload_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_hash text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('mitra_transaksi', 'mitra_presensi', 'radin_xlsx', 'cuti_xlsx', 'employee_xlsx')),
  filename text NOT NULL DEFAULT '',
  period_start date NULL,
  period_end date NULL,
  status text NOT NULL DEFAULT 'imported' CHECK (status IN ('uploaded', 'validating', 'needs_review', 'imported', 'partially_imported', 'rejected')),
  total_rows integer NOT NULL DEFAULT 0,
  accepted_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  rejected_rows integer NOT NULL DEFAULT 0,
  exceptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  uploaded_by uuid NULL,
  uploaded_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_upload_batches_hash_idx
  ON public.attendance_upload_batches (file_hash, source_type);

ALTER TABLE public.attendance_upload_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_upload_batches_admin_all" ON public.attendance_upload_batches;
CREATE POLICY "attendance_upload_batches_admin_all"
  ON public.attendance_upload_batches FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.attendance_raw_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NULL REFERENCES public.attendance_upload_batches(id) ON DELETE SET NULL,
  source_system text NOT NULL,
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_nik text NOT NULL DEFAULT '',
  raw_name text NOT NULL DEFAULT '',
  event_date date NOT NULL,
  event_at timestamptz NULL,
  event_time text NOT NULL DEFAULT '',
  event_type text NOT NULL CHECK (event_type IN ('check_in', 'check_out', 'overtime_in', 'overtime_out', 'summary', 'exception')),
  raw_status text NOT NULL DEFAULT '',
  verify_method text NOT NULL DEFAULT '',
  source_sheet text NOT NULL DEFAULT '',
  source_row integer NULL,
  event_fingerprint text NOT NULL,
  is_exception boolean NOT NULL DEFAULT false,
  exception_reason text NOT NULL DEFAULT '',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_fingerprint)
);

CREATE INDEX IF NOT EXISTS attendance_raw_events_emp_date_idx
  ON public.attendance_raw_events (employee_id, event_date);

ALTER TABLE public.attendance_raw_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_raw_events_admin_all" ON public.attendance_raw_events;
CREATE POLICY "attendance_raw_events_admin_all"
  ON public.attendance_raw_events FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.attendance_calendar_days (
  cal_date date NOT NULL,
  pt_scope text NOT NULL DEFAULT 'ALL' CHECK (pt_scope IN ('ALL', 'MITRA', 'RADIN')),
  day_type text NOT NULL DEFAULT 'WORKING' CHECK (day_type IN ('WORKING', 'WEEKEND', 'HOLIDAY', 'CUTI_BERSAMA')),
  is_conditional boolean NOT NULL DEFAULT false,
  title text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cal_date, pt_scope)
);

ALTER TABLE public.attendance_calendar_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_calendar_days_admin_all" ON public.attendance_calendar_days;
CREATE POLICY "attendance_calendar_days_admin_all"
  ON public.attendance_calendar_days FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.staff_attendance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_key text NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  auto_code text NOT NULL DEFAULT '',
  final_code text NOT NULL DEFAULT '',
  check_in_time text NOT NULL DEFAULT '',
  check_out_time text NOT NULL DEFAULT '',
  is_confirmed boolean NOT NULL DEFAULT false,
  needs_review boolean NOT NULL DEFAULT false,
  leave_candidate boolean NOT NULL DEFAULT false,
  source_conflict boolean NOT NULL DEFAULT false,
  reason_notes text NOT NULL DEFAULT '',
  reviewed_by text NOT NULL DEFAULT '',
  reviewed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS staff_attendance_reviews_period_idx
  ON public.staff_attendance_reviews (period_key, work_date);

ALTER TABLE public.staff_attendance_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_attendance_reviews_admin_all" ON public.staff_attendance_reviews;
CREATE POLICY "staff_attendance_reviews_admin_all"
  ON public.staff_attendance_reviews FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.employee_leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_nik text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  pt text NOT NULL DEFAULT 'MITRA',
  period_label text NOT NULL,
  annual_quota integer NOT NULL DEFAULT 12,
  cuti_bersama_deduction integer NOT NULL DEFAULT 6,
  available_quota integer NOT NULL DEFAULT 6,
  used_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  remaining_quota integer NOT NULL DEFAULT 6,
  reset_date date NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending_review', 'exception')),
  source_batch_id uuid NULL REFERENCES public.attendance_upload_batches(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_nik, period_label)
);

ALTER TABLE public.employee_leave_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employee_leave_balances_admin_all" ON public.employee_leave_balances;
CREATE POLICY "employee_leave_balances_admin_all"
  ON public.employee_leave_balances FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.driver_daily_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date date NOT NULL,
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_nik text NOT NULL DEFAULT '',
  driver_name text NOT NULL DEFAULT '',
  section text NOT NULL DEFAULT 'Support' CHECK (section IN ('Support', 'Indoor', 'Outdoor', 'Radin', 'Lainnya')),
  destination text NOT NULL DEFAULT '',
  vehicle text NOT NULL DEFAULT '',
  present_flag numeric NOT NULL DEFAULT 1,
  overtime_hours numeric NOT NULL DEFAULT 0,
  is_holiday boolean NOT NULL DEFAULT false,
  revision_no integer NOT NULL DEFAULT 1,
  revision_reason text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_date, employee_nik, section)
);

ALTER TABLE public.driver_daily_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "driver_daily_schedules_admin_all" ON public.driver_daily_schedules;
CREATE POLICY "driver_daily_schedules_admin_all"
  ON public.driver_daily_schedules FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.driver_time_checksheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date date NOT NULL,
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_nik text NOT NULL DEFAULT '',
  hour_slot text NOT NULL,
  section_code text NOT NULL DEFAULT '' CHECK (section_code IN ('S', 'I', 'O', 'R', 'L', '')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_date, employee_nik, hour_slot)
);

ALTER TABLE public.driver_time_checksheets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "driver_time_checksheets_admin_all" ON public.driver_time_checksheets;
CREATE POLICY "driver_time_checksheets_admin_all"
  ON public.driver_time_checksheets FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.driver_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.driver_payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_nik text NOT NULL DEFAULT '',
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code text UNIQUE NOT NULL,
  name text UNIQUE NOT NULL,
  unit text NOT NULL DEFAULT 'PCS',
  current_stock numeric NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  min_stock numeric NOT NULL DEFAULT 2 CHECK (min_stock >= 0),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stationery_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stationery_items_admin_all" ON public.stationery_items;
CREATE POLICY "stationery_items_admin_all"
  ON public.stationery_items FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

CREATE TABLE IF NOT EXISTS public.stationery_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_date date NOT NULL,
  tx_type text NOT NULL CHECK (tx_type IN ('IN', 'OUT', 'ADJUST', 'REVERSAL')),
  item_id uuid NOT NULL REFERENCES public.stationery_items(id) ON DELETE RESTRICT,
  sloc_code text NOT NULL DEFAULT 'HR GA',
  qty numeric NOT NULL,
  unit_snapshot text NOT NULL DEFAULT 'PCS',
  balance_after numeric NOT NULL CHECK (balance_after >= 0),
  reference_tx_id uuid NULL REFERENCES public.stationery_ledger(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stationery_ledger_item_date_idx
  ON public.stationery_ledger (item_id, tx_date DESC);

ALTER TABLE public.stationery_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stationery_ledger_admin_all" ON public.stationery_ledger;
CREATE POLICY "stationery_ledger_admin_all"
  ON public.stationery_ledger FOR ALL TO authenticated
  USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

-- Atomic stock-safe Stationery transaction RPC (prevents negative balances under concurrency)
CREATE OR REPLACE FUNCTION public.record_stationery_transaction(
  p_tx_date date,
  p_tx_type text,
  p_item_id uuid,
  p_sloc_code text,
  p_qty numeric,
  p_notes text DEFAULT '',
  p_reference_tx_id uuid DEFAULT NULL,
  p_created_by text DEFAULT ''
)
RETURNS public.stationery_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.stationery_items%ROWTYPE;
  v_delta numeric;
  v_new_balance numeric;
  v_row public.stationery_ledger%ROWTYPE;
BEGIN
  IF NOT public.is_portal_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin privileges required';
  END IF;

  IF p_tx_type NOT IN ('IN', 'OUT', 'ADJUST', 'REVERSAL') THEN
    RAISE EXCEPTION 'Invalid transaction type: %', p_tx_type;
  END IF;

  IF p_tx_type IN ('IN', 'OUT') AND (p_qty IS NULL OR p_qty <= 0) THEN
    RAISE EXCEPTION 'Quantity for % must be greater than zero', p_tx_type;
  END IF;

  SELECT * INTO v_item FROM public.stationery_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stationery item not found: %', p_item_id;
  END IF;

  IF p_tx_type = 'IN' THEN
    v_delta := p_qty;
  ELSIF p_tx_type = 'OUT' THEN
    v_delta := -p_qty;
  ELSE
    v_delta := COALESCE(p_qty, 0);
  END IF;

  v_new_balance := v_item.current_stock + v_delta;
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient stock for % (available: %, requested change: %)', v_item.name, v_item.current_stock, v_delta;
  END IF;

  UPDATE public.stationery_items
    SET current_stock = v_new_balance, updated_at = now()
    WHERE id = p_item_id;

  INSERT INTO public.stationery_ledger (
    tx_date, tx_type, item_id, sloc_code, qty, unit_snapshot,
    balance_after, reference_tx_id, notes, created_by
  )
  VALUES (
    COALESCE(p_tx_date, CURRENT_DATE),
    p_tx_type,
    p_item_id,
    COALESCE(NULLIF(trim(p_sloc_code), ''), 'HR GA'),
    p_qty,
    v_item.unit,
    v_new_balance,
    p_reference_tx_id,
    COALESCE(p_notes, ''),
    COALESCE(p_created_by, '')
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_stationery_transaction(date, text, uuid, text, numeric, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_stationery_transaction(date, text, uuid, text, numeric, text, uuid, text) TO authenticated;

COMMIT;
