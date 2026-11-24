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
  normalizeOpsSettings
} from '../assets/js/ops-settings-logic.js';
import {
  SEED_STATIONERY_ITEMS,
  SEED_DRIVERS,
  SEED_STAFF_SAMPLES
} from '../assets/js/ops-seed-data.js';
import {
  parseExcelOrTextDate,
  parseAttendanceDateTime,
  parseLaporanTransaksiRows,
  parseDataPresensiRows,
  parseRadinAttendanceRows,
  buildAttendanceBatchResult,
  getStaffPayrollPeriodWindow,
  processStaffAttendancePeriod,
  computeEmployeeDirectoryDelta,
  parseCutiSpreadsheetRows,
  evaluateCutiConfirmationGate,
  resolveStaffWorkSchedule,
  evaluateStaffArrivalStatus,
  getIndonesianNationalHolidaysPreset,
  parseHolidayImportRows
} from '../assets/js/attendance-logic.js';
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
  buildStationeryReports
} from '../assets/js/stationery-logic.js';

function readXlsxAoa(relPath, sheetName = '') {
  const buf = fs.readFileSync(relPath);
  const wb = read(buf, { type: 'buffer' });
  const target = sheetName && wb.Sheets[sheetName] ? sheetName : wb.SheetNames[0];
  const sheet = wb.Sheets[target];
  return { wb, target, sheet, aoa: utils.sheet_to_json(sheet, { header: 1, defval: '' }) };
}

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

test('Real Project Tambahan workbooks parse cleanly (Transaksi, Presensi, Radin, Cuti, Karyawan, ATK)', () => {
  const { aoa: txAoa } = readXlsxAoa('Project Tambahan/Attendance Suite/Upload Absensi/Input Utama - Laporan Transaksi.xls');
  const txRows = parseLaporanTransaksiRows(txAoa);
  assert.ok(txRows.length >= 100, 'Laporan Transaksi should yield > 100 punch rows');
  assert.ok(txRows.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.work_date)));

  const { aoa: prAoa } = readXlsxAoa('Project Tambahan/Attendance Suite/Upload Absensi/Input Pendukung Opsional - Data Presensi.xls');
  const prRows = parseDataPresensiRows(prAoa);
  assert.ok(prRows.length >= 100, 'Data Presensi should yield > 100 punch rows');

  const { aoa: radAoa } = readXlsxAoa('Project Tambahan/Attendance Suite/Upload Absensi/Input Utama - Karyawan RadinPRESENSI KARYAWAN RADIN 11-12 NOVEMBER 2026.xlsx');
  const radRows = parseRadinAttendanceRows(radAoa);
  assert.ok(radRows.length >= 2, 'Radin export should parse clean attendance rows');
  assert.ok(radRows.every(r => r.source_type === 'radin_xlsx'));

  const { aoa: cutiAoa, sheet: cutiSheet } = readXlsxAoa('Project Tambahan/Attendance Suite/Employee Directory/Cuti.xlsx');
  const { rows: cutiRows, errors: cutiErrors } = parseCutiSpreadsheetRows(cutiAoa, SEED_STAFF_SAMPLES, DEFAULT_OPS_SETTINGS, cutiSheet);
  assert.ok(cutiRows.length >= 20, 'Cuti.xlsx should parse all active employee leave rows');
  assert.ok(cutiErrors.some(e => e.includes('#REF!')), 'Cuti.xlsx parser must flag #REF! errors cleanly instead of NaN');
  assert.ok(cutiRows.every(r => Number.isFinite(r.remaining_leave)));

  const { aoa: atkAoa } = readXlsxAoa('Project Tambahan/Stationery/Process/ATK.xlsx', 'NOV');
  const atkItems = atkAoa.slice(1).filter(r => r && Number(r[0]) > 0 && String(r[1] || '').trim() && !/^TOTAL$/i.test(String(r[1]).trim()));
  assert.equal(atkItems.length, 121, 'ATK.xlsx NOV sheet has 121 items');
  assert.equal(SEED_STATIONERY_ITEMS.length, 121, 'SEED_STATIONERY_ITEMS matches all 121 ATK items');

  // Verify mixed Excel serial and dd/mm/yy date parsing
  assert.equal(parseExcelOrTextDate('20/6/26'), '2026-06-20');
  assert.equal(parseExcelOrTextDate('29/12/05'), '2005-12-29');
  assert.equal(parseExcelOrTextDate('#REF!'), null);
  assert.equal(parseAttendanceDateTime('11/10/2026 7:29:15 AM')?.time, '07:29:15');
  assert.equal(parseAttendanceDateTime('11/10/2026 4:05:00 PM')?.time, '16:05:00');
});

test('Attendance deduplication, late cutoff 07:30:59, Driver exemption, and confirmed HR review lock work properly', () => {
  const emp = [
    { employee_no: 'ST 130116', full_name: 'ABD. KHAMID', position: 'MMD', company_entity: 'PT MBM', join_date: '2004-11-05' },
    { employee_no: 'KT 190403', full_name: 'ACHMAD FAUZI', position: 'SOPIR', company_entity: 'PT MBM', join_date: '2019-04-12' }
  ];

  const firstBatch = buildAttendanceBatchResult({
    filename: 'batch1.xls',
    sourceType: 'mitra_transaksi',
    rawPunches: [
      { employee_no: 'ST 130116', work_date: '2026-11-02', punch_time: '07:30:59', raw_code: 'IN' },
      { employee_no: 'ST 130116', work_date: '2026-11-03', punch_time: '07:31:00', raw_code: 'IN' },
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
      { employee_no: 'ST 130116', work_date: '2026-11-02', punch_time: '07:30:59', raw_code: 'IN' },
      { employee_no: 'ST 130116', work_date: '2026-11-03', punch_time: '07:31:00', raw_code: 'IN' },
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
      { employee_no: 'ST 130116', work_date: '2026-11-04', final_code: 'CT', is_confirmed: true }
    ]
  });

  const staffSum = processed.summaries.find(s => s.employee_no === 'ST 130116');
  const drvSum = processed.summaries.find(s => s.employee_no === 'KT 190403');
  const day2 = staffSum.days.find(d => d.work_date === '2026-11-02');
  const day3 = staffSum.days.find(d => d.work_date === '2026-11-03');
  const day4 = staffSum.days.find(d => d.work_date === '2026-11-04');
  assert.equal(day2.code, 'M');
  assert.equal(day3.code, 'T');
  assert.equal(day4.code, 'CT');
  assert.equal(day4.is_confirmed, true);
  assert.ok(staffSum.counts.PENDING > 0, 'Unpunched workdays must default to PERLU_PEMERIKSAAN_HR');

  // Driver exempt from late flag T
  const drvDay3 = drvSum.days.find(d => d.work_date === '2026-11-03');
  assert.equal(drvDay3.code, 'M');
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
  const staffSby = SEED_STAFF_SAMPLES.find(s => s.employee_no === 'ST 210202');
  const staffRadin = SEED_STAFF_SAMPLES.find(s => s.employee_no === 'ST 000002');

  // Mon-Fri vs Saturday for Pasuruan & Surabaya
  assert.equal(resolveStaffWorkSchedule(staffPasuruan, '2026-11-02').startTime, '07:30');
  assert.equal(resolveStaffWorkSchedule(staffPasuruan, '2026-11-07').endTime, '12:00');
  assert.equal(resolveStaffWorkSchedule(staffSby, '2026-11-02').startTime, '08:00');
  assert.equal(resolveStaffWorkSchedule(staffSby, '2026-11-07').endTime, '12:00');

  // Kiln Dry MMD per-person schedule (ABD. KHAMID starts 07:00)
  const kdMon = resolveStaffWorkSchedule(staffKilnDry, '2026-11-02');
  assert.equal(kdMon.ruleSource, 'kiln_dry_mmd');
  assert.equal(kdMon.startTime, '07:00');

  // Radin stays on radin_hold
  assert.equal(resolveStaffWorkSchedule(staffRadin, '2026-11-02').ruleSource, 'radin_hold');

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

  // Exact cutoffs for 07:30 schedule: 07:30:59 on-time, 07:31:00 late; 07:35:59 gets meal, 07:36:00 loses meal
  const onTime = evaluateStaffArrivalStatus({ checkInTime: '07:30:59', scheduleStart: '07:30' });
  assert.equal(onTime.isLate, false);
  assert.equal(onTime.code, 'M');
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
  assert.equal(fauziP1.grossPay, 147000 + 104000 + 50000); // 301,000
  assert.equal(fauziP1.netPay, 301000);
  assert.equal(sugengP1.overtimeHours, 10); // 19h - 8h = 11h OT -> >8 deduct 1h = 10h OT (Rp 234,000)
  assert.equal(sugengP1.overtimePay, 234000);

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

  // Check buildDriverTimeChecksheetData exports cleanly
  assert.equal(typeof buildDriverTimeChecksheetData, 'function');
  assert.equal(terbilangRupiah(1532500), 'Satu Juta Lima Ratus Tiga Puluh Dua Ribu Lima Ratus Rupiah');
});

test('Stationery aliases, strict non-negative ledger guard, Adjustment notes & reports work properly', () => {
  assert.equal(resolveCanonicalSloc('GUDANG'), 'INVENTORY & GUDANG');
  assert.equal(resolveCanonicalSloc('marketing'), 'MARKETING SERVICE');
  assert.equal(resolveCanonicalSloc('radin'), 'RADIN MITRA LESTARI');

  const binder155 = SEED_STATIONERY_ITEMS.find(x => x.item_name === 'BINDER CLIP 155');
  assert.equal(binder155.current_stock, 2);

  // Attempting to take 3 when stock is 2 MUST fail
  assert.throws(() => {
    applyStationeryTransaction({
      items: SEED_STATIONERY_ITEMS,
      ledger: [],
      tx: { tx_type: 'OUT', item_id: binder155.id, qty: 3, sloc_raw: 'HR GA' }
    });
  }, /Stok minus diblokir/);

  // Adjustment without notes MUST fail
  assert.throws(() => {
    applyStationeryTransaction({
      items: SEED_STATIONERY_ITEMS,
      ledger: [],
      tx: { tx_type: 'ADJUSTMENT', item_id: binder155.id, qty: -1, notes: '' }
    });
  }, /catatan audit/);

  // Valid IN followed by OUT
  const afterIn = applyStationeryTransaction({
    items: SEED_STATIONERY_ITEMS,
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
