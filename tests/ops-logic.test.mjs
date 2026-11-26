import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { read, utils } from '../node_modules/xlsx/xlsx.mjs';
import {
  DEFAULT_VACANCIES,
  DEFAULT_RECRUITMENT_SCORING_CONFIG,
  normalizeRecruitmentScoringConfig,
  calculateCandidateScore,
  buildApplicationPdfTitle
} from '../assets/js/vacancy-logic.js';
import {
  DEFAULT_OPS_SETTINGS,
  STAFF_ATTENDANCE_CODE_ORDER,
  DEFAULT_STAFF_REPORT_TOTAL_COLUMNS,
  normalizeOpsSettings,
  calculateEkstraMeal
} from '../assets/js/ops-settings-logic.js';
import {
  SEED_STATIONERY_ITEMS,
  SEED_STATIONERY_MOVEMENTS,
  SEED_EMPLOYEES,
  SEED_DRIVERS,
  SEED_STAFF_SAMPLES,
  SEED_ATTENDANCE_BATCHES,
  SEED_ATTENDANCE_EVENTS,
  SEED_STAFF_REVIEWS,
  SEED_STAFF_MEAL_OVERRIDES,
  SEED_DRIVER_RECONCILIATIONS
} from '../assets/js/ops-seed-data.js';
import {
  parseExcelOrTextDate,
  parseAttendanceDateTime,
  parseLaporanTransaksiRows,
  parseDataPresensiRows,
  parseRadinAttendanceRows,
  buildAttendanceBatchResult,
  getStaffPayrollPeriodWindow,
  getWeeklyMealPeriodWindow,
  processStaffAttendancePeriod,
  processStaffMealAllowanceReport,
  computeEmployeeDirectoryDelta,
  parseCutiSpreadsheetRows,
  evaluateCutiConfirmationGate,
  resolveStaffWorkSchedule,
  evaluateStaffArrivalStatus,
  evaluateStaffDepartureStatus,
  resolveStaffDayMealEligibility,
  getIndonesianNationalHolidaysPreset,
  parseHolidayImportRows,
  resolveDefaultStaffFocusDate,
  countPendingStaffForSelectedDate
} from '../assets/js/attendance-logic.js';
import { buildDeptPdfSheetHtml, buildSummaryPdfSheetHtml } from '../assets/js/driver-reports.js';
import {
  isEligibleDriver,
  getEligibleDrivers,
  getDriverPeriodWindow,
  computeDriverDayMetrics,
  computeDriverWorkHours,
  validateDriverSchedules,
  generateDriverChecksheetGrid,
  lookupOvertimeTariff,
  reconcileDriverSchedulesAndAttendance,
  buildDriverTimeChecksheetData,
  terbilangRupiah,
  calculateDriverPayrollPeriod
} from '../assets/js/driver-logic.js';
import {
  resolveCanonicalSloc,
  applyStationeryTransaction,
  applyStationeryBatchTransactions,
  normalizeMaterialCode,
  generateNextMaterialCode,
  generateNextDepartmentCode,
  normalizeStationeryItems,
  normalizeStationeryDepartments,
  buildStationeryReports,
  sliceTopFavoriteItems,
  buildDepartmentUsageChartData,
  computeNextPurchasePlanWindow,
  buildPurchasePlanSuggestions,
  classifyPurchasePlanFrequency,
  buildPurchaseRequisitionWorkspaceRows,
  buildNextPrDraftCode,
  buildPurchaseRequisitionPrintData,
  STATIONERY_MASTER_IMPORT_HEADERS,
  STATIONERY_MASTER_SAMPLE_ROW,
  parseStationeryMasterImportRows,
  importStationeryMasterDataset,
  parseStationeryMovementImportRows,
  importStationeryMovementsDataset
} from '../assets/js/stationery-logic.js';

// Helper removed (deleted obsolete Project Tambahan fixtures)

test('Recruitment scoring config, per-vacancy thresholds, and PDF title formatting work accurately', () => {
  const cfg = normalizeRecruitmentScoringConfig({ defaultMinScore: 65, scoringMode: 'percentage', requireQualificationForWa: true });
  assert.equal(cfg.defaultMinScore, 65);
  assert.equal(cfg.scoringMode, 'percentage');

  const spray = DEFAULT_VACANCIES.find(v => v.id === 'spray');
  const qual = calculateCandidateScore(spray, 'Pasuruan', 'Purwosari', {
    sprayType: 'Kayu',
    company: 'PT Maju',
    duration: 'Lebih dari 6 bulan',
    explanation: 'Finishing semprot wood'
  }, cfg);
  assert.equal(qual.totalScore, 100);
  assert.equal(qual.percentageScore, 100);
  assert.equal(qual.recommended, true);
  assert.equal(qual.recommendation, 'Direkomendasikan');

  const nonQual = calculateCandidateScore(spray, 'Malang', 'Dau', {
    sprayType: 'Besi',
    company: 'Bengkel',
    duration: 'Kurang dari 6 bulan',
    explanation: ''
  }, cfg);
  assert.equal(nonQual.totalScore, 45);
  assert.equal(nonQual.percentageScore, 45);
  assert.equal(nonQual.recommended, false);
  assert.equal(nonQual.recommendation, 'Belum Ditentukan');

  // Per-vacancy threshold in points mode
  const customSpray = { ...spray, minScore: 40, minScoreMode: 'points' };
  const overrideRes = calculateCandidateScore(customSpray, 'Malang', 'Dau', {
    sprayType: 'Besi',
    duration: 'Kurang dari 6 bulan',
    explanation: ''
  }, cfg);
  assert.equal(overrideRes.threshold, 40);
  assert.equal(overrideRes.scoringMode, 'points');
  assert.equal(overrideRes.recommended, true);

  assert.equal(buildApplicationPdfTitle({ full_name: 'Budi Santoso', position: 'CNC' }), 'Budi Santoso - CNC');
  assert.equal(buildApplicationPdfTitle({ application_data: { nama: 'Sari: Indah/Putri', posisi: 'QC*' } }), 'Sari Indah Putri - QC');
  assert.equal(normalizeRecruitmentScoringConfig().defaultMinScore, DEFAULT_RECRUITMENT_SCORING_CONFIG.defaultMinScore);
});

test('Attendance parsers, Cuti #REF! handling, DK 174 canonical seeds, and cleared attendance seeds work cleanly', () => {
  // Laporan Transaksi punch parser
  const txAoa = [
    ['NO. ID', 'NIK', 'NAMA', 'WAKTU', 'STATUS', 'STATUS BARU', 'PENGECUALIAN'],
    ['101', 'ST 130116', 'ABD. KHAMID', '2026-11-02 07:14:22', 'C/Masuk', '', 'OK'],
    ['101', 'ST 130116', 'ABD. KHAMID', '2026-11-02 17:04:10', 'C/Keluar', '', 'OK']
  ];
  const txRows = parseLaporanTransaksiRows(txAoa);
  assert.equal(txRows.length, 2);
  assert.ok(txRows.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.work_date)));

  // Data Presensi summary parser
  const prAoa = [
    ['DEPARTEMEN', 'NAMA', 'NO.ID', 'TGL/WAKTU', 'LOKASI ID', 'NO.PIN'],
    ['QC OUTDOOR', 'ABDUL AJIS', '102', '2026-11-02 07:22:00', '1', 'ST 130117']
  ];
  const prRows = parseDataPresensiRows(prAoa);
  assert.equal(prRows.length, 1);
  assert.equal(prRows[0].employee_no, 'ST 130117');

  // Radin facial-clockin matrix parser
  const radAoa = [
    ['Employee ID', 'Date', 'Full Name', 'Attendance Code', 'Check In', 'Check Out', 'Organization'],
    ['ST 000002', '2026-11-11', 'FLORENCIA IRENA', 'H', '07:55', '17:05', 'MARKETING & OPERATION'],
    ['ST 000002', '2026-11-12', 'FLORENCIA IRENA', 'H', '07:58', '17:10', 'MARKETING & OPERATION']
  ];
  const radRows = parseRadinAttendanceRows(radAoa);
  assert.equal(radRows.length, 2);
  assert.ok(radRows.every(r => r.source_type === 'radin_xlsx'));

  // Cuti spreadsheet parser flags #REF! errors and normalizes company entity -> MITRA/REHOLZ
  const cutiAoa = [
    ['NO', 'NAMA', 'PT', 'TGL MASUK', '', 'JATAH CUTI', 'CUTI BERSAMA', '', 'TGL1', '', '', '', '', '', '', 'RENEWAL', 'PERIODE'],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    [1, 'ABD. KHAMID', 'PT. Mitra Binamandiri Makmur', '2004-11-05', '', 12, 4, '', '', '', '', '', '', '', '', '2027-06-15', '2026-2027'],
    [2, 'ELIAN PURBONEGORO', 'PT Radin Mitra Lestari', '2019-11-28', '', 12, 4, '', '2026-08-10', '', '', '', '', '', '', '2026-12-20', '2026-2027'],
    ['', 'ERR ROW', 'MITRA', '#REF!', '', 12, 4, '', '', '', '', '', '', '', '', '#REF!', '']
  ];
  const { rows: cutiRows, errors: cutiErrors } = parseCutiSpreadsheetRows(cutiAoa, SEED_STAFF_SAMPLES, DEFAULT_OPS_SETTINGS);
  assert.equal(cutiRows.length, 3);
  assert.equal(cutiRows[0].pt_entity, 'MITRA');
  assert.equal(cutiRows[1].pt_entity, 'REHOLZ');
  assert.equal(cutiRows[1].remaining_leave, 7);
  assert.ok(cutiErrors.some(e => e.includes('#REF!')), 'Cuti parser must flag #REF! errors cleanly instead of NaN');
  assert.ok(cutiRows.every(r => Number.isFinite(r.remaining_leave)));

  // Canonical DK 174 & ATK 121 seed checks + cleared attendance database seeds
  assert.equal(SEED_EMPLOYEES.length, 174);
  assert.equal(SEED_DRIVERS.length, 8);
  assert.equal(SEED_STAFF_SAMPLES.length, 166);
  assert.equal(SEED_STATIONERY_ITEMS.length, 121);
  assert.equal(SEED_ATTENDANCE_BATCHES.length, 0);
  assert.equal(SEED_ATTENDANCE_EVENTS.length, 0);
  assert.equal(SEED_STAFF_REVIEWS.length, 0);
  assert.equal(SEED_STAFF_MEAL_OVERRIDES.length, 0);
  assert.equal(SEED_DRIVER_RECONCILIATIONS.length, 0);

  // Verify mixed Excel serial and dd/mm/yy date parsing
  assert.equal(parseExcelOrTextDate('20/6/26'), '2026-06-20');
  assert.equal(parseExcelOrTextDate('29/12/05'), '2005-12-29');
  assert.equal(parseExcelOrTextDate('#REF!'), null);
  assert.equal(parseAttendanceDateTime('11/10/2026 7:29:15 AM')?.time, '07:29:15');
  assert.equal(parseAttendanceDateTime('11/10/2026 4:05:00 PM')?.time, '16:05:00');
});

test('Attendance deduplication, late cutoff 07:30:59, Driver exemption, and confirmed HR review lock work properly', () => {
  const emp = [
    { employee_no: 'ST 130117', full_name: 'ABDUL AJIS', position: 'QC', home_base: 'PASURUAN', company_entity: 'PT MBM', join_date: '2013-01-17' },
    { employee_no: 'KT 190403', full_name: 'ACHMAD FAUZI', position: 'SOPIR', home_base: 'PASURUAN', company_entity: 'PT MBM', join_date: '2019-04-12' }
  ];

  const firstBatch = buildAttendanceBatchResult({
    filename: 'batch1.xls',
    sourceType: 'mitra_transaksi',
    rawPunches: [
      { employee_no: 'ST 130117', work_date: '2026-11-02', punch_time: '07:30:59', raw_code: 'IN' },
      { employee_no: 'ST 130117', work_date: '2026-11-03', punch_time: '07:31:00', raw_code: 'IN' },
      { employee_no: 'KT 190403', work_date: '2026-11-03', punch_time: '08:15:00', raw_code: 'IN' },
      { employee_no: 'UNKNOWN-99', work_date: '2026-11-03', punch_time: '07:20:00', raw_code: 'IN' }
    ],
    existingEvents: [],
    employees: emp
  });
  assert.equal(firstBatch.accepted.length, 4);
  assert.equal(firstBatch.exceptions.length, 1);

  // Re-upload same punches must yield 0 accepted + 4 duplicates
  const dupBatch = buildAttendanceBatchResult({
    filename: 'batch1-retry.xls',
    sourceType: 'mitra_transaksi',
    rawPunches: [
      { employee_no: 'ST 130117', work_date: '2026-11-02', punch_time: '07:30:59', raw_code: 'IN' },
      { employee_no: 'ST 130117', work_date: '2026-11-03', punch_time: '07:31:00', raw_code: 'IN' },
      { employee_no: 'KT 190403', work_date: '2026-11-03', punch_time: '08:15:00', raw_code: 'IN' },
      { employee_no: 'UNKNOWN-99', work_date: '2026-11-03', punch_time: '07:20:00', raw_code: 'IN' }
    ],
    existingEvents: firstBatch.accepted,
    employees: emp
  });
  assert.equal(dupBatch.accepted.length, 0);
  assert.equal(dupBatch.duplicateCount, 4);

  const win = getStaffPayrollPeriodWindow('2026-11');
  assert.equal(win.startDate, '2026-10-06');
  assert.equal(win.endDate, '2026-11-05');
  assert.equal(win.dates.length, 31);

  const processed = processStaffAttendancePeriod({
    periodKey: '2026-11',
    employees: emp,
    rawEvents: firstBatch.accepted,
    calendarDays: [{ cal_date: '2026-11-01', day_type: 'WEEKEND' }],
    existingReviews: [
      { employee_no: 'ST 130117', work_date: '2026-11-04', final_code: 'CT', is_confirmed: true }
    ]
  });

  const staffSum = processed.summaries.find(s => s.employee_no === 'ST 130117');
  const drvSum = processed.summaries.find(s => s.employee_no === 'KT 190403');
  const day2 = staffSum.days.find(d => d.work_date === '2026-11-02');
  const day3 = staffSum.days.find(d => d.work_date === '2026-11-03');
  const day4 = staffSum.days.find(d => d.work_date === '2026-11-04');
  assert.equal(day2.code, 'H');
  assert.equal(day3.code, 'T');
  assert.equal(day4.code, 'CT');
  assert.equal(day4.is_confirmed, true);
  assert.ok(staffSum.counts.PENDING > 0, 'Unpunched workdays must default to PERLU_PEMERIKSAAN_HR');

  // Driver exempt from late flag T
  const drvDay3 = drvSum.days.find(d => d.work_date === '2026-11-03');
  assert.equal(drvDay3.code, 'H');
});

test('Employee Directory delta computes diff cleanly and Cuti gate respects threshold', () => {
  const existing = [
    { employee_no: 'ST 130116', full_name: 'ABD. KHAMID', department: 'PURCHASING', position: 'MMD', employment_status: 'TETAP' },
    { employee_no: 'ST 130117', full_name: 'ABDUL AJIS', department: 'QC OUTDOOR', position: 'QC', employment_status: 'TETAP' }
  ];
  const incoming = [
    { employee_no: 'ST 130116', full_name: 'ABD. KHAMID', department: 'PURCHASING', position: 'MMD', employment_status: 'TETAP' },
    { employee_no: 'KT 999999', full_name: 'BARU', department: 'HR GA', position: 'SOPIR', employment_status: 'KONTRAK' }
  ];
  const delta = computeEmployeeDirectoryDelta(incoming, existing);
  assert.equal(delta.summary.unchangedCount, 1);
  assert.equal(delta.summary.newCount, 1);
  assert.equal(delta.summary.notFoundCount, 1);

  const gateSoon = evaluateCutiConfirmationGate({ renewal_date: '2026-12-20' }, '2026-11-23');
  assert.equal(gateSoon.requiresConfirmation, true);
  assert.equal(gateSoon.daysUntilRenewal, 27);

  const gateFar = evaluateCutiConfirmationGate({ renewal_date: '2027-06-13' }, '2026-11-23');
  assert.equal(gateFar.requiresConfirmation, false);
});

test('General Staff Work Schedules, exact late/meal cutoffs (07:30:59 vs 07:31:00; 07:35:59 vs 07:36:00), and National Holidays work accurately', () => {
  const staffPasuruan = SEED_STAFF_SAMPLES.find(s => s.employee_no === 'ST 130117');
  const staffKilnDry = SEED_STAFF_SAMPLES.find(s => s.employee_no === 'ST 130116'); // ABD. KHAMID MMD
  const staffSby = SEED_STAFF_SAMPLES.find(s => s.employee_no === 'ST 210202'); // NATHANIA (REHOLZ)
  const staffMitraSby = { ...staffSby, company_entity: 'MITRA', home_base: 'SURABAYA' };
  const staffRadinPasuruan = SEED_STAFF_SAMPLES.find(s => s.employee_no === 'ST 000001'); // BRYAN SOENNARDI (PASURUAN, REHOLZ)

  // Mon-Fri vs Saturday for Pasuruan & Surabaya (MITRA)
  assert.equal(resolveStaffWorkSchedule(staffPasuruan, '2026-11-02').startTime, '07:30');
  assert.equal(resolveStaffWorkSchedule(staffPasuruan, '2026-11-07').endTime, '12:00');
  assert.equal(resolveStaffWorkSchedule(staffMitraSby, '2026-11-02').startTime, '08:00');
  assert.equal(resolveStaffWorkSchedule(staffMitraSby, '2026-11-07').endTime, '12:00');

  // Kiln Dry MMD per-person schedule (ABD. KHAMID starts 07:00)
  const kdMon = resolveStaffWorkSchedule(staffKilnDry, '2026-11-02');
  assert.equal(kdMon.ruleSource, 'kiln_dry_mmd');
  assert.equal(kdMon.startTime, '07:00');

  // REHOLZ (PT Radin Mitra Lestari) stays on radin_hold regardless of Pasuruan/Surabaya home_base
  assert.equal(resolveStaffWorkSchedule(staffSby, '2026-11-02').ruleSource, 'radin_hold');
  assert.equal(resolveStaffWorkSchedule(staffRadinPasuruan, '2026-11-02').ruleSource, 'radin_hold');

  // Manual exception override beats Pasuruan/Kiln Dry defaults
  const withExceptionSettings = normalizeOpsSettings({
    attendance: {
      workSchedules: {
        manualExceptions: [
          { id: 'ex-1', employee_no: 'ST 130117', full_name: 'ABDUL AJIS', homeBase: 'Shift Khusus QC', weekdayStart: '06:30', weekdayEnd: '15:30', saturdayStart: '06:30', saturdayEnd: '11:30', reason: 'Pengecekan awal container' }
        ]
      }
    }
  });
  const exRes = resolveStaffWorkSchedule(staffPasuruan, '2026-11-02', withExceptionSettings);
  assert.equal(exRes.ruleSource, 'manual_exception');
  assert.equal(exRes.startTime, '06:30');

  // Exact cutoffs for 07:30 schedule: 07:30:59 on-time (H), 07:31:00 late (T); 07:35:59 gets meal, 07:36:00 loses meal
  const onTime = evaluateStaffArrivalStatus({ checkInTime: '07:30:59', scheduleStart: '07:30' });
  assert.equal(onTime.isLate, false);
  assert.equal(onTime.code, 'H');
  assert.equal(onTime.getsMealAllowance, true);

  const lateButMeal = evaluateStaffArrivalStatus({ checkInTime: '07:31:00', scheduleStart: '07:30' });
  assert.equal(lateButMeal.isLate, true);
  assert.equal(lateButMeal.code, 'T');
  assert.equal(lateButMeal.getsMealAllowance, true);

  const mealEdge = evaluateStaffArrivalStatus({ checkInTime: '07:35:59', scheduleStart: '07:30' });
  assert.equal(mealEdge.isLate, true);
  assert.equal(mealEdge.getsMealAllowance, true);

  const mealLost = evaluateStaffArrivalStatus({ checkInTime: '07:36:00', scheduleStart: '07:30' });
  assert.equal(mealLost.isLate, true);
  assert.equal(mealLost.getsMealAllowance, false);

  // Manual meal allowance override
  const mealManualYes = evaluateStaffArrivalStatus({
    checkInTime: '07:45:00',
    scheduleStart: '07:30',
    manualMealOverride: { eligible: true, reason: 'Tugas luar pagi' }
  });
  assert.equal(mealManualYes.isLate, true);
  assert.equal(mealManualYes.getsMealAllowance, true);

  // National Holiday Preset & Import parsing
  const preset2026 = getIndonesianNationalHolidaysPreset(2026);
  assert.ok(preset2026.some(h => h.cal_date === '2026-08-17' && h.day_type === 'HOLIDAY'));
  const impHols = parseHolidayImportRows([
    ['Tanggal', 'Keterangan Libur', 'Tipe', 'Alasan'],
    ['2026-11-10', 'Hari Pahlawan (Koreksi)', 'HOLIDAY', 'Keputusan Manajemen']
  ]);
  assert.equal(impHols.length, 1);
  assert.equal(impHols[0].cal_date, '2026-11-10');
});

test('Driver eligibility (SIKUS excluded), period rules, overtime flooring/break, overnight reconciliation & department payroll audit match exact formulas', () => {
  // SIKUS ST 140807 is SOPIR in directory but MUST be excluded from Driver module
  const sikus = SEED_DRIVERS.find(d => d.full_name === 'SIKUS');
  assert.ok(sikus);
  assert.equal(isEligibleDriver(sikus), false);
  const eligible = getEligibleDrivers([...SEED_DRIVERS, ...SEED_STAFF_SAMPLES]);
  assert.equal(eligible.length, 7);
  assert.ok(!eligible.some(d => d.full_name === 'SIKUS'));

  // Period windows P1 (1-15) and P2 (16-end of month)
  const p1Win = getDriverPeriodWindow('2026-11', 'P1');
  const p2Win = getDriverPeriodWindow('2026-11', 'P2');
  assert.equal(p1Win.startDate, '2026-11-01');
  assert.equal(p1Win.endDate, '2026-11-15');
  assert.equal(p2Win.startDate, '2026-11-16');
  assert.equal(p2Win.endDate, '2026-11-30');

  // Overtime tariffs & floor 0.5h rule
  assert.equal(lookupOvertimeTariff(5, false), 104000);
  assert.equal(lookupOvertimeTariff(5.4, false), 104000); // floor 0.5 -> 5.0
  assert.equal(lookupOvertimeTariff(15, false), 364000);
  assert.equal(lookupOvertimeTariff(16, false), 390000);
  assert.equal(lookupOvertimeTariff(8, true), 193000);

  // Proportional < 8h floored to 1h step
  const partialDay = computeDriverDayMetrics({ workDate: '2026-11-02', startTime: '07:00', endTime: '14:45' });
  assert.equal(partialDay.normalHours, 7);
  assert.equal(partialDay.presentDays, 0.875);
  assert.equal(partialDay.normalPay, Math.round(0.875 * 147000));
  assert.equal(partialDay.overtimeHours, 0);

  // Saturday: 5h normal quota, excess > 8h deducted by 1h break (05:48 - 20:09 = 14h21m -> excess 9h21m -> floor 9h -> break -1h = 8h OT)
  const satDay = computeDriverDayMetrics({ workDate: '2026-11-07', startTime: '05:48', endTime: '20:09' });
  assert.equal(satDay.presentDays, 1);
  assert.equal(satDay.normalHours, 5);
  assert.equal(satDay.rawOvertimeHours, 9);
  assert.equal(satDay.breakDeductionHours, 1);
  assert.equal(satDay.overtimeHours, 8);
  assert.equal(satDay.normalPay, 147000);
  assert.equal(satDay.overtimePay, 182000);

  // Sunday: 0 normal days, all hours paid on Holiday OT tariff
  const sunDay = computeDriverDayMetrics({ workDate: '2026-11-08', startTime: '07:00', endTime: '15:00' });
  assert.equal(sunDay.presentDays, 0);
  assert.equal(sunDay.normalPay, 0);
  assert.equal(sunDay.overtimeHours, 8);
  assert.equal(sunDay.overtimePay, 193000);

  // National Holiday on Weekday (2026-11-10): normal 8h = 1 day + overtime on Holiday OT tariff
  const calMap = new Map([['2026-11-10', { cal_date: '2026-11-10', day_type: 'HOLIDAY', label: 'Hari Pahlawan' }]]);
  const natHol = computeDriverDayMetrics({ workDate: '2026-11-10', startTime: '07:00', endTime: '18:00', calendarMap: calMap });
  assert.equal(natHol.presentDays, 1);
  assert.equal(natHol.normalHours, 8);
  assert.equal(natHol.overtimeHours, 3);
  assert.equal(natHol.normalPay, 147000);
  assert.equal(natHol.overtimePay, 63000); // Holiday 3h tariff

  // Backward-compat helper still behaves accurately
  const work = computeDriverWorkHours('07:00', '20:00', { normalWorkHours: 8, isHoliday: false });
  assert.equal(work.normalHours, 8);
  assert.equal(work.overtimeHours, 5);

  const val = validateDriverSchedules([
    { id: '1', employee_no: 'KT 190403', driver_name: 'ACHMAD FAUZI', work_date: '2026-11-02', start_time: '07:00', end_time: '17:00', section: 'Support' },
    { id: '2', employee_no: 'KT 190403', driver_name: 'ACHMAD FAUZI', work_date: '2026-11-02', start_time: '12:00', end_time: '18:00', section: 'Indoor' },
    { id: '3', employee_no: 'ST 190905', driver_name: 'TEGUH SUSANTO', work_date: '2026-11-03', start_time: '07:00', end_time: '15:00', section: 'Radin' }
  ], eligible);
  assert.equal(val.valid, false);
  assert.equal(val.conflicts.length, 1);
  assert.equal(val.nikWarnings.length, 1);
  assert.equal(val.nikWarnings[0].suggestedNik, 'KT 190905');

  const grid = generateDriverChecksheetGrid([
    { id: '1', employee_no: 'KT 190403', work_date: '2026-11-02', start_time: '07:00', end_time: '18:00', normal_hours: 8, ritase_flag: true, is_holiday: false }
  ]);
  assert.ok(grid.rows[0].cells.includes('R'));

  // Missing checkout anomaly -> resolved as overnight (+1 day) -> included cleanly
  const driverSubset = eligible.filter(d => ['KT 190403', 'KT 021010'].includes(d.employee_no));
  const rawEvents = [
    { id: 'e1', employee_no: 'KT 190403', work_date: '2026-11-02', check_in: '07:00:00', check_out: '20:00:00', source_type: 'mitra_transaksi' },
    { id: 'e2', employee_no: 'KT 021010', work_date: '2026-11-13', check_in: '06:30:00', check_out: '', source_type: 'mitra_transaksi' }
  ];
  const schedules = [
    {
      id: 's1',
      employee_no: 'KT 190403',
      driver_name: 'ACHMAD FAUZI',
      work_date: '2026-11-02',
      section: 'Support',
      activities: [
        { start_time: '07:00', end_time: '12:00', is_until_home: false, activity: 'Antar barang' },
        { start_time: '12:00', end_time: '', is_until_home: true, activity: 'Bantu kirim' }
      ]
    },
    { id: 's2', employee_no: 'KT 021010', driver_name: 'SUGENG PURWANTO', work_date: '2026-11-13', section: 'Outdoor', start_time: '06:30', end_time: '' }
  ];

  const anomalyRec = reconcileDriverSchedulesAndAttendance({
    monthKey: '2026-11',
    halfPeriod: 'P1',
    drivers: driverSubset,
    schedules,
    rawEvents,
    reconciliations: [],
    calendarDays: [{ cal_date: '2026-11-10', day_type: 'HOLIDAY', label: 'Hari Pahlawan' }]
  });
  assert.equal(anomalyRec.anomalies.length, 1);
  assert.equal(anomalyRec.anomalies[0].anomalyType, 'MISSING_CHECKOUT');

  // Resolve Sugeng Purwanto overnight 06:30 -> +1 day 01:30 (19 hours total -> 8h normal + 11h raw OT - 1h break = 10h OT)
  const reconciliations = [
    { employee_no: 'KT 021010', work_date: '2026-11-13', checkout_date: '2026-11-14', actual_check_in: '06:30', actual_check_out: '01:30', is_overnight: true, resolved: true, notes: 'Lembur luar kota lewat hari' }
  ];

  // Period 1 (no BPJS) + Kurang Gaji per-dept
  const payrollP1 = calculateDriverPayrollPeriod({
    monthKey: '2026-11',
    halfPeriod: 'P1',
    drivers: driverSubset,
    schedules,
    rawEvents,
    reconciliations,
    adjustmentsByPeriod: {
      '2026-11-P1': {
        'KT 190403': { priorShortfall: 50000, bySection: { Support: 50000, Indoor: 0, Outdoor: 0, Radin: 0 } }
      }
    },
    calendarDays: [{ cal_date: '2026-11-10', day_type: 'HOLIDAY', label: 'Hari Pahlawan' }]
  });
  assert.equal(payrollP1.reconciliation.anomalies.length, 0);
  const fauziP1 = payrollP1.summaryRows.find(r => r.employee_no === 'KT 190403');
  const sugengP1 = payrollP1.summaryRows.find(r => r.employee_no === 'KT 021010');
  assert.equal(fauziP1.bpjsDeduction, 0);
  // 5h OT -> 2 blocks (2h + 2h) = 6,000 + 8,000 = 14,000 Ekstra Meal
  assert.equal(fauziP1.ekstraMealPay, 14000);
  assert.equal(fauziP1.grossPay, 147000 + 104000 + 14000 + 50000); // 315,000
  assert.equal(fauziP1.netPay, 315000);
  assert.equal(sugengP1.overtimeHours, 10); // 19h - 8h = 11h OT -> >8 deduct 1h = 10h OT (Rp 234,000)
  assert.equal(sugengP1.overtimePay, 234000);
  assert.equal(sugengP1.ekstraMealPay, 44000); // 10h OT -> 5 blocks = 6k + 8k + 3*10k

  // Ekstra Meal stepped brackets for all employees
  assert.equal(calculateEkstraMeal(1.5), 0);
  assert.equal(calculateEkstraMeal(2), 6000);
  assert.equal(calculateEkstraMeal(4), 14000);
  assert.equal(calculateEkstraMeal(6), 24000);
  assert.equal(calculateEkstraMeal(8), 34000);

  // Summary gross MUST equal sum of Support + Indoor + Outdoor + Radin gross
  const deptGrossSum = ['Support', 'Indoor', 'Outdoor', 'Radin'].reduce((acc, sec) => acc + payrollP1.deptTotals[sec].grossPay, 0);
  assert.equal(deptGrossSum, payrollP1.summaryTotals.grossPay);

  // Time checksheet Sunday yellow + Holiday red marking
  const csSugeng = payrollP1.checksheets.find(c => c.driver.employee_no === 'KT 021010');
  assert.equal(csSugeng.dayMeta.find(d => d.dateStr === '2026-11-08').colorMark, 'yellow');
  assert.equal(csSugeng.dayMeta.find(d => d.dateStr === '2026-11-10').colorMark, 'red');

  // Period 2 applies default BPJS 207,507 automatically
  const payrollP2 = calculateDriverPayrollPeriod({
    monthKey: '2026-11',
    halfPeriod: 'P2',
    drivers: driverSubset,
    schedules: [],
    rawEvents: []
  });
  assert.equal(payrollP2.summaryRows[0].bpjsDeduction, 207507);

  // Full-month period option (1 - end of month) also applies BPJS deduction
  const fullWin = getDriverPeriodWindow('2026-11', 'FULL');
  assert.equal(fullWin.startDate, '2026-11-01');
  assert.equal(fullWin.endDate, '2026-11-30');
  assert.equal(fullWin.dates.length, 30);
  const payrollFull = calculateDriverPayrollPeriod({
    monthKey: '2026-11',
    halfPeriod: 'FULL',
    drivers: driverSubset,
    schedules: [],
    rawEvents: []
  });
  assert.equal(payrollFull.summaryRows[0].bpjsDeduction, 207507);

  // Check buildDriverTimeChecksheetData exports cleanly
  assert.equal(typeof buildDriverTimeChecksheetData, 'function');
  assert.equal(terbilangRupiah(1532500), 'Satu Juta Lima Ratus Tiga Puluh Dua Ribu Lima Ratus Rupiah');
});

test('Stationery aliases, strict non-negative ledger guard, Adjustment notes & reports work properly', () => {
  assert.equal(resolveCanonicalSloc('GUDANG'), 'INVENTORY & GUDANG');
  assert.equal(resolveCanonicalSloc('marketing'), 'MARKETING SERVICE');
  assert.equal(resolveCanonicalSloc('radin'), 'RADIN MITRA LESTARI');

  // Seeds retain all 121 Material Management definitions with stock zeroed & movements cleared
  assert.equal(SEED_STATIONERY_ITEMS.length, 121);
  assert.ok(SEED_STATIONERY_ITEMS.every(x => x.opening_stock === 0 && x.current_stock === 0));
  assert.equal(SEED_STATIONERY_MOVEMENTS.length, 0);

  const baseBinder = SEED_STATIONERY_ITEMS.find(x => x.item_name === 'BINDER CLIP 155');
  const testItems = SEED_STATIONERY_ITEMS.map(x =>
    x.id === baseBinder.id ? { ...x, opening_stock: 2, current_stock: 2 } : x
  );
  const binder155 = testItems.find(x => x.id === baseBinder.id);
  assert.equal(binder155.current_stock, 2);

  // Attempting to take 3 when stock is 2 MUST fail
  assert.throws(() => {
    applyStationeryTransaction({
      items: testItems,
      ledger: [],
      tx: { tx_type: 'OUT', item_id: binder155.id, qty: 3, sloc_raw: 'HR GA' }
    });
  }, /Stok minus diblokir/);

  // Adjustment without notes MUST fail
  assert.throws(() => {
    applyStationeryTransaction({
      items: testItems,
      ledger: [],
      tx: { tx_type: 'ADJUSTMENT', item_id: binder155.id, qty: -1, notes: '' }
    });
  }, /catatan audit/);

  // Valid IN followed by OUT
  const afterIn = applyStationeryTransaction({
    items: testItems,
    ledger: [],
    tx: { tx_type: 'IN', item_id: binder155.id, qty: 5, sloc_raw: 'HR GA', notes: 'PO ATK' }
  });
  assert.equal(afterIn.entry.balance_after, 7);

  const afterOut = applyStationeryTransaction({
    items: afterIn.items,
    ledger: afterIn.ledger,
    tx: { tx_type: 'OUT', item_id: binder155.id, qty: 3, sloc_raw: 'GUDANG', tx_date: '2026-11-15' }
  });
  assert.equal(afterOut.entry.sloc_canonical, 'INVENTORY & GUDANG');
  assert.equal(afterOut.entry.balance_after, 4);

  const rep = buildStationeryReports({ items: afterOut.items, ledger: afterOut.ledger, monthKey: '2026-11' });
  const repItem = rep.itemReports.find(r => r.id === binder155.id);
  assert.equal(repItem.inQty, 5);
  assert.equal(repItem.outQty, 3);
  assert.equal(repItem.closingStock, 4);
  assert.ok(['FAST', 'MEDIUM', 'SLOW', 'DEAD'].includes(repItem.movingClass));
});

test('normalizeOpsSettings enforces immutable safety locks on negative stock and unapproved cuti', () => {
  const s = normalizeOpsSettings({
    stationery: { allowNegativeStock: true, purchaseHorizon: '1m' },
    cuti: { autoConvertPendingToApproved: true, confirmationDaysThreshold: 45 },
    driver: { defaultMonthlyWage: 4000000, workingDayDivisor: 25 }
  });
  assert.equal(s.stationery.allowNegativeStock, false);
  assert.equal(s.cuti.autoConvertPendingToApproved, false);
  assert.equal(s.stationery.purchaseHorizon, '1m');
  assert.equal(s.cuti.confirmationDaysThreshold, 45);
  assert.equal(s.driver.defaultDailyWage, 160000);
  assert.equal(DEFAULT_OPS_SETTINGS.driver.defaultMonthlyWage, 3675000);
});

test('Driver Support/Indoor/Outdoor have independent 3-column signatories (including DIKETAHUI)', () => {
  const customSettings = normalizeOpsSettings({
    driver: {
      signatories: {
        support: { rightName: 'KEPALA SUPPORT BARU', rightTitle: 'MGR SUPPORT' },
        indoor: { rightName: 'KEPALA INDOOR BARU', rightTitle: 'KABAG INDOOR' },
        outdoor: { rightName: 'KEPALA OUTDOOR BARU', rightTitle: 'KADEPT OUTDOOR' }
      }
    }
  });

  assert.equal(customSettings.driver.signatories.support.rightName, 'KEPALA SUPPORT BARU');
  assert.equal(customSettings.driver.signatories.indoor.rightName, 'KEPALA INDOOR BARU');
  assert.equal(customSettings.driver.signatories.outdoor.rightName, 'KEPALA OUTDOOR BARU');

  const payroll = calculateDriverPayrollPeriod({
    monthKey: '2026-11',
    halfPeriod: 'P1',
    drivers: getEligibleDrivers(SEED_DRIVERS, customSettings),
    schedules: [],
    rawEvents: [],
    settings: customSettings
  });

  const supHtml = buildDeptPdfSheetHtml('Support', payroll, customSettings);
  const indHtml = buildDeptPdfSheetHtml('Indoor', payroll, customSettings);
  const outHtml = buildDeptPdfSheetHtml('Outdoor', payroll, customSettings);

  assert.ok(supHtml.includes('drv-pdf-footer-3'));
  assert.ok(supHtml.includes('KEPALA SUPPORT BARU'));
  assert.ok(!supHtml.includes('KEPALA INDOOR BARU'));
  assert.ok(indHtml.includes('drv-pdf-footer-3'));
  assert.ok(indHtml.includes('KEPALA INDOOR BARU'));
  assert.ok(outHtml.includes('drv-pdf-footer-3'));
  assert.ok(outHtml.includes('KEPALA OUTDOOR BARU'));
});

test('Staff PA (Pulang Awal) detection, 9-code Report Absensi totals, and Friday-Thursday Rp 10.000 Report Uang Makan', () => {
  assert.deepEqual(STAFF_ATTENDANCE_CODE_ORDER, ['H', 'S', 'I', 'A', 'T', 'PA', 'CT', 'L', 'DS']);
  assert.deepEqual(DEFAULT_STAFF_REPORT_TOTAL_COLUMNS, ['S', 'I', 'A', 'T', 'PA', 'CT', 'L', 'DS']);

  // Early departure >= 1 minute before schedule end -> PA
  const paHit = evaluateStaffDepartureStatus({ checkOutTime: '16:59:00', scheduleEnd: '17:00' });
  const paOk = evaluateStaffDepartureStatus({ checkOutTime: '16:59:30', scheduleEnd: '17:00' });
  const satPa = evaluateStaffDepartureStatus({ checkOutTime: '11:58:00', scheduleEnd: '12:00' });
  assert.equal(paHit.isEarlyLeave, true);
  assert.equal(paOk.isEarlyLeave, false);
  assert.equal(satPa.isEarlyLeave, true);

  // Weekly meal period anchored on any day snaps to Friday -> Thursday
  const mealWin = getWeeklyMealPeriodWindow('2026-11-10'); // Tuesday
  assert.equal(mealWin.startDate, '2026-11-06'); // Friday
  assert.equal(mealWin.endDate, '2026-11-12'); // Thursday
  assert.equal(mealWin.dates.length, 7);

  const ajis = SEED_STAFF_SAMPLES.find(e => e.employee_no === 'ST 130117'); // Pasuruan 07:30-17:00
  const events = [
    // 2026-11-06 Fri: on time + normal out -> H, gets Rp 10,000
    { employee_no: 'ST 130117', work_date: '2026-11-06', check_in: '07:25:00', check_out: '17:05:00', source_type: 'mitra_transaksi' },
    // 2026-11-07 Sat: late 07:35:59 (<6 min) + early out 11:50:00 -> T, Saturday < 15:00 gets Rp 0
    { employee_no: 'ST 130117', work_date: '2026-11-07', check_in: '07:35:59', check_out: '11:50:00', source_type: 'mitra_transaksi' },
    // 2026-11-09 Mon: on-time in + PA out 16:40:00 (>= 15:00) -> PA, gets Rp 10,000
    { employee_no: 'ST 130117', work_date: '2026-11-09', check_in: '07:28:00', check_out: '16:40:00', source_type: 'mitra_transaksi' },
    // 2026-11-10 Tue: late >= 6m 07:36:00 -> T, Rp 0 (no override)
    { employee_no: 'ST 130117', work_date: '2026-11-10', check_in: '07:36:00', check_out: '17:00:00', source_type: 'mitra_transaksi' },
    // 2026-11-11 Wed: late >= 6m 07:45:00 -> T, manual meal allow override -> Rp 10,000
    { employee_no: 'ST 130117', work_date: '2026-11-11', check_in: '07:45:00', check_out: '17:00:00', source_type: 'mitra_transaksi' }
  ];
  const reviews = [
    { employee_no: 'ST 130117', work_date: '2026-11-12', final_code: 'CT', is_confirmed: true }
  ];
  const mealOverrides = [
    { employee_no: 'ST 130117', work_date: '2026-11-11', eligible: true, reason: 'Tugas luar pagi' }
  ];

  const attReport = processStaffAttendancePeriod({
    periodKey: '2026-12', // 2026-11-06..2026-12-05 covers 2026-11-06..12
    employees: [ajis],
    rawEvents: events,
    existingReviews: reviews,
    mealOverrides
  });
  const sum = attReport.summaries[0];
  assert.equal(sum.counts.H, 1);
  assert.equal(sum.counts.T, 3);
  assert.equal(sum.counts.PA, 1);
  assert.equal(sum.counts.CT, 1);
  assert.equal(sum.days.find(d => d.work_date === '2026-11-08').code, 'L'); // Sunday

  const mealReport = processStaffMealAllowanceReport({
    anchorDateIso: '2026-11-06',
    employees: [ajis],
    rawEvents: events,
    existingReviews: reviews,
    mealOverrides
  });
  assert.equal(mealReport.dailyAmount, 10000);
  // Eligible days: Nov 6 (H on time + >= 15:00), Nov 9 (PA on time + >= 15:00), Nov 11 (manual allow) = 3 days (Saturday < 15:00 = Rp 0)
  assert.equal(mealReport.rows[0].totalEligibleDays, 3);
  assert.equal(mealReport.rows[0].totalAmount, 30000);

  // Mon-Fri check-out < 15:00 forfeits meal allowance even when on time
  const weekdayForfeit = resolveStaffDayMealEligibility({
    workDate: '2026-11-09',
    attCode: 'PA',
    checkIn: '07:20:00',
    checkOut: '14:55:00',
    arrivalEval: { getsMealAllowance: true }
  });
  assert.equal(weekdayForfeit.eligible, false);
  assert.equal(weekdayForfeit.amount, 0);

  // Saturday check-out >= 15:00 grants Rp 7,500
  const satEligible = resolveStaffDayMealEligibility({
    workDate: '2026-11-07',
    attCode: 'H',
    checkIn: '07:25:00',
    checkOut: '15:00:00'
  });
  assert.equal(satEligible.eligible, true);
  assert.equal(satEligible.amount, 7500);

  // Staff overtime Ekstra Meal triggers when working >= 2h past scheduleEnd
  const staffOtReport = processStaffMealAllowanceReport({
    anchorDateIso: '2026-11-06',
    employees: [ajis],
    rawEvents: [
      { employee_no: 'ST 130117', work_date: '2026-11-06', check_in: '07:25:00', check_out: '21:10:00', source_type: 'mitra_transaksi' }
    ]
  });
  const friDay = staffOtReport.rows[0].days.find(d => d.work_date === '2026-11-06');
  assert.equal(friDay.ekstraMealAmount, 14000); // 4h10m OT -> 6000 + 8000
  assert.equal(staffOtReport.rows[0].totalCombinedAmount, 24000);
});

test('Staff selected-date pending counter counts single date instead of full period, and Driver PDF uses Kekurangan Gaji Periode Lalu', () => {
  const sampleStaff = SEED_STAFF_SAMPLES.slice(0, 10);
  const processed = processStaffAttendancePeriod({
    periodKey: '2026-11',
    employees: sampleStaff,
    rawEvents: [
      { employee_no: sampleStaff[0].employee_no, work_date: '2026-11-02', check_in: '07:20:00', check_out: '17:05:00' }
    ],
    calendarDays: [{ cal_date: '2026-11-01', day_type: 'WEEKEND' }]
  });

  const focusDate = resolveDefaultStaffFocusDate({
    windowDates: processed.window.dates,
    dayMeta: processed.dayMeta,
    rawEvents: [{ work_date: '2026-11-02' }]
  });
  assert.equal(focusDate, '2026-11-02');
  const pendingForDay = countPendingStaffForSelectedDate({
    summaries: processed.summaries,
    focusDate
  });
  // 10 employees, 1 punched cleanly -> 9 pending on that single date (NOT 9 * 27 days)
  assert.equal(pendingForDay, 9);

  // Driver report sheet label uses Kekurangan Gaji Periode Lalu
  const payroll = calculateDriverPayrollPeriod({
    monthKey: '2026-11',
    halfPeriod: 'P1',
    drivers: getEligibleDrivers(SEED_DRIVERS, DEFAULT_OPS_SETTINGS),
    schedules: [],
    rawEvents: [],
    settings: DEFAULT_OPS_SETTINGS
  });
  const html = buildDeptPdfSheetHtml('Support', payroll, DEFAULT_OPS_SETTINGS);
  assert.ok(html.includes('KEKURANGAN<br>GAJI PERIODE LALU'));
});

test('Stationery multi-item batch input, 5-digit Material/3-digit Dept codes, Report ATK charts, and Purchase Plan Suggestions work accurately', () => {
  // Material 5-digit code & Dept 3-digit code helpers
  assert.equal(normalizeMaterialCode('ATK-007'), '10007');
  assert.equal(generateNextMaterialCode([{ item_code: '10001' }, { item_code: '10121' }]), '10122');
  const normItems = normalizeStationeryItems(SEED_STATIONERY_ITEMS);
  assert.equal(normItems.length, 121);
  assert.ok(normItems.every(it => /^\d{5}$/.test(it.item_code)));
  const pen = normItems.find(it => /BOLPOINT/i.test(it.item_name));
  assert.equal(pen.purchase_unit, 'PACK');

  const normDepts = normalizeStationeryDepartments([]);
  assert.equal(normDepts.length, 15);
  assert.ok(normDepts.every(d => /^\d{3}$/.test(d.dept_code)));
  assert.equal(generateNextDepartmentCode(normDepts), '116');

  // Multi-item batch commit for one date + type + department with optional empty notes
  const itemA = normItems[0];
  const itemB = normItems[1];
  const stocked = applyStationeryBatchTransactions({
    items: normItems,
    ledger: [],
    txDate: '2026-11-05',
    txType: 'IN',
    department: 'HR GA',
    rows: [
      { item_id: itemA.id, qty: 12, notes: '' },
      { item_id: itemB.id, qty: 8, notes: '' }
    ]
  });
  assert.equal(stocked.entries.length, 2);
  assert.equal(stocked.entries[0].reference_no, '');
  assert.equal(stocked.entries[1].notes, '');

  const batchOut = applyStationeryBatchTransactions({
    items: stocked.items,
    ledger: stocked.ledger,
    txDate: '2026-11-10',
    txType: 'OUT',
    department: 'HR GA',
    rows: [
      { item_id: itemA.id, qty: 5, notes: 'Pengambilan rutin' },
      { item_id: itemB.id, qty: 2, notes: '' }
    ]
  });
  assert.equal(batchOut.entries.length, 2);

  // Report ATK: stockPeriodik, deptOutReport, favoriteItems, sliceTopFavoriteItems
  const reports = buildStationeryReports({ items: batchOut.items, ledger: batchOut.ledger, monthKey: '2026-11' });
  const topA = reports.favoriteItems[0];
  assert.equal(topA.id, itemA.id);
  assert.equal(topA.totalOut, 5);
  assert.equal(topA.byDept['HR GA'], 5);
  assert.equal(reports.stockPeriodik.find(r => r.id === itemA.id).inQty, 12);
  assert.equal(reports.stockPeriodik.find(r => r.id === itemA.id).outQty, 5);
  assert.equal(sliceTopFavoriteItems(reports.favoriteItems, 10).length, 10);
  assert.equal(sliceTopFavoriteItems(reports.favoriteItems, 'ALL').length, 121);

  // Chart series share consistent Rank item order and multiple-of-10 Y axis
  const chartData = buildDepartmentUsageChartData({
    favoriteItems: reports.favoriteItems,
    topN: 10,
    scopeMode: 'both',
    scaleMax: 0
  });
  assert.equal(chartData.scaleMax, 10);
  assert.deepEqual(chartData.ticks, [0, 2, 4, 6, 8, 10]);
  assert.equal(chartData.globalSeries.key, 'GLOBAL');
  assert.equal(chartData.globalSeries.bars[0].item_id, itemA.id);
  assert.equal(chartData.departmentSeries[0].bars[0].item_id, itemA.id); // Same Rank #1 order in HR GA chart

  // Purchase Plan Window: Weekly (Sun-Sat), Bi-Weekly (Sun-Sat +13d), Monthly (1st-last of next month)
  const wWin = computeNextPurchasePlanWindow('1w', '2026-11-24'); // Tue Nov 24 -> next Sun Nov 29..Sat Dec 05
  assert.equal(wWin.startDate, '2026-11-29');
  assert.equal(wWin.endDate, '2026-12-05');
  const bwWin = computeNextPurchasePlanWindow('2w', '2026-11-24');
  assert.equal(bwWin.startDate, '2026-11-29');
  assert.equal(bwWin.endDate, '2026-12-12');
  const mWin = computeNextPurchasePlanWindow('1m', '2026-11-24');
  assert.equal(mWin.startDate, '2026-12-01');
  assert.equal(mWin.endDate, '2026-12-31');

  // Purchase Plan Suggestion defaults & manual overrides
  const plan = buildPurchasePlanSuggestions({
    items: batchOut.items,
    ledger: batchOut.ledger,
    purchasePeriod: '1w',
    referenceDate: '2026-11-24',
    manualOverrides: {
      [itemA.id]: { minPurchase: 3, decisionQty: '5' }
    }
  });
  const planRowA = plan.rows.find(r => r.id === itemA.id);
  assert.equal(planRowA.rank, 1);
  assert.equal(planRowA.periodRequirement, Math.ceil(planRowA.periodRequirement));
  assert.equal(planRowA.minStock, planRowA.periodRequirement * 2);
  assert.equal(planRowA.minPurchase, 3);
  assert.equal(planRowA.decisionQty, '5');
  const planRowB = plan.rows.find(r => r.id === itemB.id);
  assert.equal(planRowB.minPurchase, 1);
  assert.equal(planRowB.decisionQty, '');
});

test('ATK Master & Stock Movement spreadsheet import computes chronological IN/OUT balances cleanly and flows into reports', () => {
  // Exact 6-column ATK Master Item & Stock Awal schema (no manual Min Stock)
  assert.deepEqual(STATIONERY_MASTER_IMPORT_HEADERS, [
    'Kode Material',
    'Nama Item',
    'Satuan',
    'Satuan Minimal Pembelian',
    'Konversi Satuan',
    'Saldo Awal'
  ]);
  assert.deepEqual(Object.keys(STATIONERY_MASTER_SAMPLE_ROW), STATIONERY_MASTER_IMPORT_HEADERS);

  // 1. Parse and import Master ATK (Clean Replace) using 6 exact columns
  const rawMaster = [
    { 'Kode Material': '10001', 'Nama Item': 'BOLPOINT HITAM', 'Satuan': 'PCS', 'Satuan Minimal Pembelian': 'PACK', 'Konversi Satuan': 36, 'Saldo Awal': 50 },
    { 'Kode Material': '', 'Nama Item': 'KERTAS HVS A4', 'Satuan': 'RIM', 'Satuan Minimal Pembelian': 'RIM', 'Konversi Satuan': 1, 'Saldo Awal': 5 }
  ];
  const parsedMaster = parseStationeryMasterImportRows(rawMaster);
  assert.equal(parsedMaster.errors.length, 0);
  assert.equal(parsedMaster.rows.length, 2);
  assert.equal(parsedMaster.rows[0].opening_stock, 50);
  assert.equal(parsedMaster.rows[0].conversion_qty, 36);

  const masterRes = importStationeryMasterDataset({
    existingItems: SEED_STATIONERY_ITEMS,
    existingLedger: [{ id: 'old-mv' }],
    parsedRows: parsedMaster.rows,
    replaceExisting: true
  });
  assert.equal(masterRes.items.length, 2);
  assert.equal(masterRes.ledger.length, 0);
  assert.equal(masterRes.items[1].item_code, '10002');

  // 2. Parse and import chronological Stock Movements (mix of ISO, DD/MM/YYYY, Excel serial date, existing + new items, auto-seed opening stock)
  const rawMovements = [
    { Tanggal: '15/11/2026', Type: 'Barang Keluar', Departemen: 'PPC INDOOR', Item: 'BOLPOINT HITAM', Qty: 12, Satuan: 'PCS', Keterangan: 'Rutin' },
    { Tanggal: '2026-11-15', Type: 'Barang Masuk', Departemen: 'PURCHASING', Item: 'BOLPOINT HITAM', Qty: 20, Satuan: 'PCS', Keterangan: 'Masuk sama tanggal' },
    { Tanggal: 46331, Type: 'Barang Keluar', Departemen: 'HR GA', Item: 'KERTAS HVS A4', Qty: 8, Satuan: 'RIM', Keterangan: 'Exceeds opening -> auto seed 3' },
    { Tanggal: '2026-11-16', Type: 'OUT', Departemen: 'FINANCE', Item: 'CLIP BINDER NO 155', Qty: 6, Satuan: 'PACK', Keterangan: 'Item baru auto-create' }
  ];
  const parsedMv = parseStationeryMovementImportRows(rawMovements);
  assert.equal(parsedMv.errors.length, 0);
  assert.equal(parsedMv.rows.length, 4);
  // Same-date IN must sort before OUT
  assert.equal(parsedMv.rows[1].tx_date, '2026-11-15');
  assert.equal(parsedMv.rows[1].tx_type, 'IN');
  assert.equal(parsedMv.rows[2].tx_date, '2026-11-15');
  assert.equal(parsedMv.rows[2].tx_type, 'OUT');

  const mvRes = importStationeryMovementsDataset({
    items: masterRes.items,
    existingLedger: [],
    parsedRows: parsedMv.rows,
    replaceLedger: true,
    autoSeedOpeningIfShort: true
  });
  assert.equal(mvRes.importedEntries.length, 4);
  assert.equal(mvRes.createdItemsCount, 1);
  assert.equal(mvRes.autoSeededCount, 2); // KERTAS HVS A4 (+3) & CLIP BINDER (+6)

  const pen = mvRes.items.find(i => i.item_name === 'BOLPOINT HITAM');
  // Opening 50 + IN 20 - OUT 12 = 58
  assert.equal(pen.current_stock, 58);

  const paper = mvRes.items.find(i => i.item_name === 'KERTAS HVS A4');
  // Opening auto-seeded 5+3=8, OUT 8 => closing 0
  assert.equal(paper.opening_stock, 8);
  assert.equal(paper.current_stock, 0);

  // Check downstream reports
  const rep = buildStationeryReports({ items: mvRes.items, ledger: mvRes.ledger, monthKey: '2026-11' });
  assert.equal(rep.totals.totalIn, 20);
  assert.equal(rep.totals.totalOut, 26);
  const favTop = rep.favoriteItems[0];
  assert.equal(favTop.item_name, 'BOLPOINT HITAM');
  assert.equal(favTop.totalOut, 12);

  const chart = buildDepartmentUsageChartData({ favoriteItems: rep.favoriteItems, topN: 10 });
  assert.equal(chart.globalSeries.bars[0].qty, 12);

  const plan = buildPurchasePlanSuggestions({ items: mvRes.items, ledger: mvRes.ledger, purchasePeriod: '1w', referenceDate: '2026-11-24' });
  assert.ok(plan.rows.length >= 2);
  assert.ok(plan.rows[0].deficit >= plan.rows[1].deficit, 'Purchase plan must be sorted by purchase priority deficit descending');
  assert.ok(plan.rows[0].periodRequirement >= 1);
  // Verify Master ATK conversion ('Konversi Satuan') & Purchase Plan convertedDecisionQty
  const rawConvMaster = [
    { 'Kode Material': '10001', 'Nama Item': 'BOLPOINT HITAM', 'Satuan': 'PCS', 'Satuan Minimal Pembelian': 'PACK', 'Konversi Satuan': 36, 'Stock Awal': 0, 'Min Stock': 10 }
  ];
  const parsedConv = parseStationeryMasterImportRows(rawConvMaster);
  assert.equal(parsedConv.errors.length, 0);
  assert.equal(parsedConv.rows[0].conversion_qty, 36);
  const convRes = importStationeryMasterDataset({
    existingItems: [],
    existingLedger: [],
    parsedRows: parsedConv.rows,
    replaceExisting: true
  });
  assert.equal(convRes.items[0].conversion_qty, 36);
  const convPlan = buildPurchasePlanSuggestions({
    items: convRes.items,
    ledger: [],
    purchasePeriod: '1w',
    referenceDate: '2026-11-24',
    manualOverrides: {
      [convRes.items[0].id]: { minPurchase: 1, decisionQty: '2' }
    }
  });
  assert.equal(convPlan.rows[0].conversionQty, 36);
  assert.equal(convPlan.rows[0].convertedDecisionQty, 72);
});

test('Cache worker and HTML entrypoints stay synchronized on build 20261124-hrga-workspace-22 without cache-first JS traps', () => {
  const swText = fs.readFileSync('sw.js', 'utf8');
  const htmlText = fs.readFileSync('index.html', 'utf8');
  const cacheText = fs.readFileSync('assets/js/cache.js', 'utf8');
  assert.ok(swText.includes("const BUILD = '20261124-hrga-workspace-22';"));
  assert.ok(htmlText.includes("const BUILD = '20261124-hrga-workspace-22';"));
  assert.ok(cacheText.includes("APP_BUILD = '20261124-hrga-workspace-22';"));
  assert.ok(!swText.includes('isImmutableVersioned'), 'sw.js must not cache-first JS/CSS files');
});

test('Flexible Uang Makan rules and per-person standing exceptions work accurately across day types and Ekstra Meal OT', () => {
  const baseAtt = DEFAULT_OPS_SETTINGS.attendance;

  // Master toggle disables all meal allowances
  const disabledRes = resolveStaffDayMealEligibility({
    workDate: '2026-11-04',
    checkIn: '07:20:00',
    checkOut: '16:30:00',
    employee: { employee_no: 'ST 1001', full_name: 'BUDI' },
    settings: { attendance: { ...baseAtt, mealAllowanceEnabled: false } }
  });
  assert.equal(disabledRes.eligible, false);
  assert.equal(disabledRes.amount, 0);

  // Holiday work meal enabled grants configured holiday rate
  const holMeal = resolveStaffDayMealEligibility({
    workDate: '2026-11-10',
    isOffDay: true,
    checkIn: '07:25:00',
    checkOut: '15:00:00',
    employee: { employee_no: 'ST 1001', full_name: 'BUDI' },
    settings: { attendance: { ...baseAtt, holidayMealEnabled: true, holidayMealAmount: 15000 } }
  });
  assert.equal(holMeal.eligible, true);
  assert.equal(holMeal.amount, 15000);

  // Early leave forfeit can be toggled off flexibly
  const earlyDepEval = evaluateStaffDepartureStatus({
    checkOutTime: '15:30:00',
    scheduleEnd: '16:00',
    workDate: '2026-11-04',
    settings: { attendance: { ...baseAtt, earlyLeaveMealForfeitEnabled: false } }
  });
  assert.equal(earlyDepEval.isEarlyLeave, true);
  const earlyAllowed = resolveStaffDayMealEligibility({
    workDate: '2026-11-04',
    checkIn: '07:20:00',
    checkOut: '15:30:00',
    departureEval: earlyDepEval,
    employee: { employee_no: 'ST 1001', full_name: 'BUDI' },
    settings: { attendance: { ...baseAtt, earlyLeaveMealForfeitEnabled: false } }
  });
  assert.equal(earlyAllowed.eligible, true);
  assert.equal(earlyAllowed.amount, 10000);

  // Saturday cutoff requirement can be disabled, OR Saturday meal disabled entirely
  const satNoCutoff = resolveStaffDayMealEligibility({
    workDate: '2026-11-07',
    checkIn: '07:20:00',
    checkOut: '12:30:00',
    employee: { employee_no: 'ST 1001', full_name: 'BUDI' },
    settings: { attendance: { ...baseAtt, saturdayMealRequireCutoff: false } }
  });
  assert.equal(satNoCutoff.eligible, true);
  assert.equal(satNoCutoff.amount, 7500);

  const satOff = resolveStaffDayMealEligibility({
    workDate: '2026-11-07',
    checkIn: '07:20:00',
    checkOut: '15:30:00',
    employee: { employee_no: 'ST 1001', full_name: 'BUDI' },
    settings: { attendance: { ...baseAtt, saturdayMealEnabled: false } }
  });
  assert.equal(satOff.eligible, false);
  assert.equal(satOff.amount, 0);

  // Standing per-person exceptions: 'none' (excluded) and 'custom_amount' (different weekday/Saturday rate)
  const flexSettings = normalizeOpsSettings({
    attendance: {
      ekstraMealMinHours: 3,
      mealExceptions: [
        { employeeNo: 'ST 9001', fullName: 'NO MEAL PERSON', mode: 'none', includeEkstraMeal: false, reason: 'Catering khusus' },
        { employeeNo: 'ST 9002', fullName: 'VIP MEAL PERSON', mode: 'custom_amount', weekdayAmount: 25000, saturdayAmount: 20000, includeEkstraMeal: true, reason: 'Tarif lapangan' }
      ]
    }
  });

  const excludedStaff = { id: 'e-exc1', employee_no: 'ST 9001', full_name: 'NO MEAL PERSON', department: 'STAFF', home_base: 'PASURUAN', employment_status: 'TETAP' };
  const customStaff = { id: 'e-exc2', employee_no: 'ST 9002', full_name: 'VIP MEAL PERSON', department: 'STAFF', home_base: 'PASURUAN', employment_status: 'TETAP' };

  // Friday 2026-11-06 -> Thursday 2026-11-12 weekly window (includes Saturday 2026-11-07)
  const report = processStaffMealAllowanceReport({
    anchorDateIso: '2026-11-06',
    employees: [excludedStaff, customStaff],
    rawEvents: [
      { employee_no: 'ST 9001', work_date: '2026-11-06', check_in: '07:20:00', check_out: '19:30:00' },
      { employee_no: 'ST 9002', work_date: '2026-11-06', check_in: '07:20:00', check_out: '19:30:00' },
      { employee_no: 'ST 9002', work_date: '2026-11-07', check_in: '07:20:00', check_out: '15:30:00' }
    ],
    settings: flexSettings
  });

  const rowExcluded = report.rows.find(r => r.employee_no === 'ST 9001');
  const rowCustom = report.rows.find(r => r.employee_no === 'ST 9002');
  assert.equal(rowExcluded.totalEligibleDays, 0);
  assert.equal(rowExcluded.totalAmount, 0);
  assert.equal(rowExcluded.totalEkstraMealAmount, 0);
  assert.equal(rowCustom.totalEligibleDays, 2);
  assert.equal(rowCustom.totalAmount, 45000); // 25,000 Friday + 20,000 Saturday
  assert.equal(rowCustom.totalEkstraMealAmount, 6000); // 16:00 -> 19:30 = 3.5h >= min 3h (default 6,000 / block)

  // Ekstra Meal threshold configurable
  assert.equal(calculateEkstraMeal(2.5, { ekstraMealMinHours: 3 }), 0);
  assert.equal(calculateEkstraMeal(3, { ekstraMealMinHours: 3 }), 6000);
  assert.equal(calculateEkstraMeal(4, { ekstraMealEnabled: false }), 0);
});

test('Driver Salary Report printout wraps SUMMARY and section labels in yellow stabilo highlight', () => {
  const payroll = calculateDriverPayrollPeriod({
    monthKey: '2026-11',
    halfPeriod: 'P1',
    drivers: getEligibleDrivers(SEED_DRIVERS, DEFAULT_OPS_SETTINGS),
    schedules: [],
    rawEvents: [],
    settings: DEFAULT_OPS_SETTINGS
  });

  const deptHtml = buildDeptPdfSheetHtml('Indoor', payroll, DEFAULT_OPS_SETTINGS);
  assert.ok(deptHtml.includes('<span class="drv-section-highlight" style="background:#ffff00 !important">INDOOR</span>'));

  const sumHtml = buildSummaryPdfSheetHtml(payroll, DEFAULT_OPS_SETTINGS);
  assert.ok(sumHtml.includes('<span class="drv-section-highlight" style="background:#ffff00 !important">SUMMARY</span>'));

  const customHighlightSettings = normalizeOpsSettings({ driver: { sectionHighlightColor: '#fde047' } });
  const customHtml = buildDeptPdfSheetHtml('Support', payroll, customHighlightSettings);
  assert.ok(customHtml.includes('<span class="drv-section-highlight" style="background:#fde047 !important">SUPPORT</span>'));
});

test('ATK Plan Purchase Requisition frequency classification, non-zero + manual rows, draft headers, and 2-part print split', () => {
  // Default rank frequency tiers: 1-10 Very Fast, 11-30 Fast, 31-50 Slow, 51+ Very Slow
  assert.equal(classifyPurchasePlanFrequency(1), 'Very Fast Moving');
  assert.equal(classifyPurchasePlanFrequency(10), 'Very Fast Moving');
  assert.equal(classifyPurchasePlanFrequency(11), 'Fast Moving');
  assert.equal(classifyPurchasePlanFrequency(30), 'Fast Moving');
  assert.equal(classifyPurchasePlanFrequency(31), 'Slow Moving');
  assert.equal(classifyPurchasePlanFrequency(50), 'Slow Moving');
  assert.equal(classifyPurchasePlanFrequency(51), 'Very Slow Moving');

  // Configurable rank cutoffs and labels
  const customStk = normalizeOpsSettings({
    stationery: {
      frequencyTiers: {
        veryFastMaxRank: 5,
        veryFastLabel: 'Ultra Fast',
        fastMaxRank: 15,
        fastLabel: 'Regular Fast'
      }
    }
  }).stationery;
  assert.equal(classifyPurchasePlanFrequency(5, customStk), 'Ultra Fast');
  assert.equal(classifyPurchasePlanFrequency(6, customStk), 'Regular Fast');

  // Non-zero suggestion filtering + manual item addition
  const baseRows = [
    { id: 'i1', rank: 1, item_code: '10001', item_name: 'KERTAS A4', unit: 'RIM', purchase_unit: 'RIM', conversion_qty: 1, current_stock: 2, periodRequirement: 8, minStock: 16, deficit: 14, minPurchase: 1, decisionQty: '14', convertedDecisionQty: 14 },
    { id: 'i2', rank: 14, item_code: '10002', item_name: 'BOLPOINT HITAM', unit: 'PCS', purchase_unit: 'PACK', conversion_qty: 12, current_stock: 24, periodRequirement: 6, minStock: 12, deficit: 0, minPurchase: 1, decisionQty: '', convertedDecisionQty: 0 },
    { id: 'i3', rank: 52, item_code: '10003', item_name: 'MAP PLASTIK', unit: 'PCS', purchase_unit: 'PCS', conversion_qty: 1, current_stock: 20, periodRequirement: 0, minStock: 0, deficit: 0, minPurchase: 1, decisionQty: '', convertedDecisionQty: 0 }
  ];

  const reqOnlyNonZero = buildPurchaseRequisitionWorkspaceRows({ planRows: baseRows, manualItemIds: [] });
  assert.deepEqual(reqOnlyNonZero.rows.map(r => r.id), ['i1', 'i2']);
  assert.deepEqual(reqOnlyNonZero.availableToAdd.map(r => r.id), ['i3']);

  const reqWithManual = buildPurchaseRequisitionWorkspaceRows({ planRows: baseRows, manualItemIds: ['i3'] });
  assert.deepEqual(reqWithManual.rows.map(r => r.id), ['i1', 'i2', 'i3']);
  assert.equal(reqWithManual.rows[2].isManualAdded, true);

  // Draft code sequence increment
  assert.equal(buildNextPrDraftCode([], 'PR-ATK', '2026-11-25'), 'PR-ATK-202611-001');
  assert.equal(
    buildNextPrDraftCode([{ draftCode: 'PR-ATK-202611-001' }, { draftCode: 'PR-ATK-202611-004' }], 'PR-ATK', '2026-11-25'),
    'PR-ATK-202611-005'
  );

  // Print dataset splits Page 1 (strictly Purchase Qty Decision > 0) vs Lampiran (all non-zero + manual rows)
  const annotatedRows = reqWithManual.rows.map((r, idx) => ({
    ...r,
    purchaseUnit: r.purchase_unit,
    frequency: classifyPurchasePlanFrequency(r.rank),
    note: idx === 0 ? 'Stok habis awal bulan' : ''
  }));
  const printData = buildPurchaseRequisitionPrintData({
    reqRows: annotatedRows,
    stationerySettings: DEFAULT_OPS_SETTINGS.stationery,
    draft: {
      draftCode: 'PR-ATK-202611-001',
      title: 'Pengadaan Mingguan',
      docDate: '2026-11-25',
      preparedBy: { name: 'Ayuk Nur Khotifah', title: 'HR & GA Admin' },
      approvedBy: { name: 'Samsul Hariyadi', title: 'HR & GA Manager' }
    }
  });
  assert.equal(printData.purchaseItems.length, 1);
  assert.equal(printData.purchaseItems[0].item_code, '10001');
  assert.equal(printData.purchaseItems[0].currentStock, 2);
  assert.equal(printData.purchaseItems[0].baseUnit, 'RIM');
  assert.equal(printData.purchaseItems[0].purchaseQty, 14);
  assert.equal(printData.attachmentItems.length, 3);
  assert.equal(printData.attachmentItems[0].note, 'Stok habis awal bulan');
  assert.equal(printData.meta.signatureLayout, 'columns');
  assert.equal(printData.meta.preparedBy.name, 'Ayuk Nur Khotifah');
  assert.equal(printData.meta.approvedBy.name, 'Samsul Hariyadi');
});

test('PR Frequency uses global Rank (favRank) rather than deficit urgency Priority, and UI/Print/Settings contracts hold', () => {
  // Build 55 items: item_01 is heavily used (favRank #1) with ample stock -> low deficit priority;
  // item_55 is rarely used (favRank #55) with 0 stock -> high deficit priority (#1 when sorted by deficit)
  const items = Array.from({ length: 55 }, (_, i) => ({
    id: `stk-${i + 1}`,
    item_code: String(10001 + i),
    item_name: `ATK ITEM ${String(i + 1).padStart(2, '0')}`,
    unit: 'PCS',
    purchase_unit: 'PCS',
    conversion_qty: 1,
    opening_stock: i === 54 ? 0 : 1000,
    current_stock: i === 54 ? 0 : 1000
  }));

  const ledger = [
    // Item 1 used 200 times -> Rank #1 globally, ample stock 1000 -> deficit 0
    { item_id: 'stk-1', tx_type: 'OUT', tx_date: '2026-11-05', qty: 200, sloc_canonical: 'HR GA' },
    // Items 2..54 used decreasing amounts 150..98, ample stock 1000 -> deficit 0
    ...Array.from({ length: 53 }, (_, k) => ({
      item_id: `stk-${k + 2}`,
      tx_type: 'OUT',
      tx_date: '2026-11-05',
      qty: 150 - k,
      sloc_canonical: 'HR GA'
    })),
    // Item 55 used 10 times -> Rank #55 globally, 0 stock -> deficit > 0 -> Priority #1
    { item_id: 'stk-55', tx_type: 'OUT', tx_date: '2026-11-05', qty: 10, sloc_canonical: 'HR GA' }
  ];

  const plan = buildPurchasePlanSuggestions({
    items,
    ledger,
    purchasePeriod: '1w',
    referenceDate: '2026-11-24'
  });

  const prio1Row = plan.rows[0];
  assert.equal(prio1Row.id, 'stk-55');
  assert.equal(prio1Row.priority, 1);
  assert.equal(prio1Row.favRank, 55);
  assert.equal(prio1Row.frequency, 'Very Slow Moving');

  const topUsageRow = plan.rows.find(r => r.id === 'stk-1');
  assert.equal(topUsageRow.favRank, 1);
  assert.ok(topUsageRow.priority > 1);
  assert.equal(topUsageRow.frequency, 'Very Fast Moving');

  // Verify Dashboard removes Needs Attention panel while restoring crisp light workspace and keeping Dashboard hero/cards non-bright with eye-catching attention indicators
  const adminText = fs.readFileSync('assets/js/admin.js', 'utf8');
  assert.ok(!adminText.includes('dashboard-attention-panel'), 'Needs Attention panel must be removed from Dashboard');
  assert.ok(!adminText.includes('Needs Attention'), 'Needs Attention heading must be removed from Dashboard');

  const cssText = fs.readFileSync('assets/css/workspace.css', 'utf8');
  assert.ok(!cssText.includes('color-scheme: dark;'), 'Workspace shell must keep crisp light theme');
  assert.ok(cssText.includes('.dash-module-box.has-attention') && cssText.includes('.dash-module-att-badge'), 'Dashboard cards must style high-visibility attention indicators');
  assert.ok(cssText.includes('.icon-btn.print-doc-btn-lit'), 'Application Print buttons must include illuminated styling');

  // Verify Plan PR UI has only 3 streamlined controls, Current Stock after Nama Item, and 2-column signatures
  const opsViewsText = fs.readFileSync('assets/js/ops-views.js', 'utf8');
  assert.ok(opsViewsText.includes('atk-pr-controls-grid'), 'Plan PR must use compact 3-control grid');
  assert.ok(!opsViewsText.includes('id="pr-prep-name"'), 'Signatory configuration must live in System Settings, not inside Plan PR');
  assert.ok(!opsViewsText.includes('id="pr-draft-code"'), 'Draft config inputs must not clutter Plan PR workspace');
  assert.ok(opsViewsText.includes("renderSigSelector('sig-pr-l'") && opsViewsText.includes("renderSigSelector('sig-pr-r'"), 'System Settings must host 2-column PR signatories');
  assert.match(opsViewsText, /Nama Item<\/th>\s*<th[^>]*>Current Stock<\/th>/, 'Current Stock column must immediately follow Nama Item');
  assert.ok(!opsViewsText.includes('atk-pr-sig-stacked'), 'PR print signatures must always sit side-by-side (Left Dibuat oleh, Right Menyetujui)');
});

test('Dashboard renders 6 module boxes and supports Lead Register & Invited Edit/Delete plus lit Application Print buttons', async () => {
  const adminText = fs.readFileSync('assets/js/admin.js', 'utf8');
  assert.ok(adminText.includes('dash_recruitment_grads_1795673203042.jpg'));
  assert.ok(adminText.includes('dash_pkwt_contracts_1795673205288.jpg'));
  assert.ok(adminText.includes('dash_staff_bright_1795673204438.jpg'));
  assert.ok(adminText.includes('dash_drivers_bus_park_1795673204702.jpg'));
  assert.ok(adminText.includes('dash_vehicle_supercar_1795673204825.jpg'));
  assert.ok(adminText.includes('dash_atk_stationery_1795673206455.jpg'));
  assert.ok(adminText.includes("targetView: 'contracts'"));
  assert.ok(adminText.includes("targetView: 'stationeryReports'"));

  // Lead Register must include Actions column with Edit & Delete controls (and never Remarks)
  assert.ok(adminText.includes('data-stage1-edit=') && adminText.includes('data-stage1-delete='), 'Lead Register must render Edit and Delete actions');
  assert.ok(adminText.includes('openStage1LeadModal'), 'Lead Register Edit must open openStage1LeadModal');

  // Invited must render Edit & Delete for every row (manual and auto-derived)
  assert.ok(adminText.includes('data-inv-edit="${esc(row.rowKey)}"') && adminText.includes('data-inv-delete="${esc(row.rowKey)}"'), 'Invited rows must always provide Edit and Delete actions');

  // Application Print Documents button must carry illuminated class synced with Stage pill tone
  assert.ok(adminText.includes('class="icon-btn print-doc-btn-lit ${esc(progress.tone || \'blue\')}"'), 'Application Print Documents button must carry lit stage-matched class');

  // Verify buildInvitedCandidatesViewRows honors dismissedKeys cleanly
  const { buildInvitedCandidatesViewRows } = await import('../assets/js/workspace-logic.js');
  const rows = buildInvitedCandidatesViewRows({
    manualInvites: [],
    applicants: [
      { id: 'a1', full_name: 'Candidate One', position: 'CNC', stage: 'hired', created_at: '2026-11-20T00:00:00Z' },
      { id: 'a2', full_name: 'Candidate Two', position: 'Spray', stage: 'application_submitted', created_at: '2026-11-21T00:00:00Z' }
    ],
    stage1Leads: [
      { id: 's1', full_name: 'Lead One', position: 'Las', source: 'Jobstreet', created_at: '2026-11-22T00:00:00Z' }
    ],
    dismissedKeys: ['app:a1', 'stage1:s1']
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rowKey, 'app:a2');
});





