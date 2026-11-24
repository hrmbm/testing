-- HR&GA Workspace v8 Migration:
-- 1. Integrasi Kolom Home Base & Perusahaan (MITRA = PT. Mitra Binamandiri Makmur, REHOLZ = PT Radin Mitra Lestari)
--    pada Employee Directory (18 Kolom sesuai DK/Data_Karyawan_*.xlsx)
-- 2. Pembersihan seluruh data absensi & hasil proses absensi sebelumnya di database

BEGIN;

-- ============================================================================
-- 1. TAMBAH & NORMALISASI KOLOM HOME_BASE & COMPANY_ENTITY PADA EMPLOYEES
-- ============================================================================
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS home_base text NOT NULL DEFAULT 'PASURUAN',
  ADD COLUMN IF NOT EXISTS company_entity text NOT NULL DEFAULT 'MITRA';

UPDATE public.employees
SET
  home_base = COALESCE(NULLIF(upper(btrim(home_base)), ''), 'PASURUAN'),
  company_entity = CASE
    WHEN upper(coalesce(company_entity, '')) ~ '(REHOLZ|RADIN|RML)' THEN 'REHOLZ'
    ELSE 'MITRA'
  END;

CREATE INDEX IF NOT EXISTS employees_company_home_base_idx
  ON public.employees (company_entity, home_base);

-- Normalisasi kode PT pada tabel Cuti agar selaras dengan MITRA / REHOLZ
DO $$
BEGIN
  IF to_regclass('public.employee_leave_balances') IS NOT NULL THEN
    UPDATE public.employee_leave_balances
    SET pt_entity = CASE
      WHEN upper(coalesce(pt_entity, '')) ~ '(REHOLZ|RADIN|RML)' THEN 'REHOLZ'
      ELSE 'MITRA'
    END;
  END IF;
END $$;

-- ============================================================================
-- 2. HAPUS SELURUH DATA ABSENSI YANG ADA DI DATABASE
--    (Employee Directory, Applicants, Cuti, Kalender Libur & ATK TETAP AMAN)
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.driver_payroll_lines') IS NOT NULL THEN
    DELETE FROM public.driver_payroll_lines;
  END IF;

  IF to_regclass('public.driver_payroll_runs') IS NOT NULL THEN
    DELETE FROM public.driver_payroll_runs;
  END IF;

  IF to_regclass('public.driver_time_checksheets') IS NOT NULL THEN
    DELETE FROM public.driver_time_checksheets;
  END IF;

  IF to_regclass('public.driver_attendance_reconciliations') IS NOT NULL THEN
    DELETE FROM public.driver_attendance_reconciliations;
  END IF;

  IF to_regclass('public.staff_meal_overrides') IS NOT NULL THEN
    DELETE FROM public.staff_meal_overrides;
  END IF;

  IF to_regclass('public.staff_attendance_reviews') IS NOT NULL THEN
    DELETE FROM public.staff_attendance_reviews;
  END IF;

  IF to_regclass('public.attendance_raw_events') IS NOT NULL THEN
    DELETE FROM public.attendance_raw_events;
  END IF;

  IF to_regclass('public.attendance_upload_batches') IS NOT NULL THEN
    DELETE FROM public.attendance_upload_batches
    WHERE source_type IN ('mitra_transaksi', 'mitra_presensi', 'radin_xlsx');
  END IF;
END $$;

COMMIT;
