// Pure Driver Schedule Validation, Checksheet Matrix, Overtime Tariff Lookup, Payroll & BKK/BKM Engine
import { DEFAULT_OPS_SETTINGS, normalizeOpsSettings } from './ops-settings-logic.js';
import { compactNik } from './attendance-logic.js';

export function timeToMinutes(hhmm = '') {
  const m = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function roundHalfHour(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 2) / 2;
}

export function computeDriverWorkHours(startTime, endTime, { normalWorkHours = 8, isHoliday = false } = {}) {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  if (s === null || e === null) return { totalHours: 0, normalHours: 0, overtimeHours: 0 };
  const diffMin = e >= s ? (e - s) : ((1440 - s) + e);
  const totalHours = roundHalfHour(diffMin / 60);
  if (isHoliday) {
    return { totalHours, normalHours: 0, overtimeHours: totalHours };
  }
  const normal = Math.min(totalHours, normalWorkHours);
  const ot = Math.max(0, roundHalfHour(totalHours - normalWorkHours));
  return { totalHours, normalHours: normal, overtimeHours: ot };
}

export function validateDriverSchedules(schedules = [], employees = [], settings = DEFAULT_OPS_SETTINGS) {
  const cfg = normalizeOpsSettings(settings).driver;
  const empByNik = new Map(employees.map(e => [compactNik(e.employee_no), e]));
  const empBySuffix = new Map();
  employees.forEach(e => {
    const suffix = compactNik(e.employee_no).replace(/^[A-Z]+/, '');
    if (suffix) empBySuffix.set(suffix, e);
  });

  const conflicts = [];
  const nikWarnings = [];
  const seenKeyMap = new Map();

  for (const row of schedules) {
    const nikKey = compactNik(row.employee_no || '');
    const exactEmp = empByNik.get(nikKey);
    if (!exactEmp) {
      const suffix = nikKey.replace(/^[A-Z]+/, '');
      const suggestion = empBySuffix.get(suffix);
      nikWarnings.push({
        scheduleId: row.id,
        employee_no: row.employee_no,
        driver_name: row.driver_name,
        work_date: row.work_date,
        suggestedNik: suggestion ? suggestion.employee_no : '',
        message: suggestion
          ? `Format NIK "${row.employee_no}" berbeda dengan direktori "${suggestion.employee_no}" (${suggestion.full_name})`
          : `NIK "${row.employee_no}" tidak ditemukan di Employee Directory`
      });
    }

    if (row.section && !cfg.sections.includes(row.section)) {
      nikWarnings.push({
        scheduleId: row.id,
        employee_no: row.employee_no,
        work_date: row.work_date,
        message: `Seksi "${row.section}" di luar daftar standar (${cfg.sections.join(', ')})`
      });
    }

    const dupKey = `${nikKey}|${row.work_date}`;
    const prev = seenKeyMap.get(dupKey);
    if (prev) {
      const s1 = timeToMinutes(prev.start_time) ?? 0;
      const e1 = timeToMinutes(prev.end_time) ?? 0;
      const s2 = timeToMinutes(row.start_time) ?? 0;
      const e2 = timeToMinutes(row.end_time) ?? 0;
      const overlaps = (s1 < e2 && s2 < e1) || (s1 === s2 && e1 === e2);
      if (overlaps) {
        conflicts.push({
          scheduleId: row.id,
          otherScheduleId: prev.id,
          employee_no: row.employee_no,
          driver_name: row.driver_name,
          work_date: row.work_date,
          message: `Jadwal bentrok pada ${row.work_date}: ${prev.section} (${prev.start_time}-${prev.end_time}) vs ${row.section} (${row.start_time}-${row.end_time})`
        });
      }
    } else {
      seenKeyMap.set(dupKey, row);
    }
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
    nikWarnings
  };
}

export function generateDriverChecksheetGrid(schedules = [], startHour = 6, endHour = 22) {
  const hours = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);

  const rows = schedules.map(s => {
    const startMin = timeToMinutes(s.start_time) ?? 420;
    const endMin = timeToMinutes(s.end_time) ?? 900;
    const normalEndMin = startMin + ((Number(s.normal_hours) || 0) * 60);
    const cells = hours.map(h => {
      const slotStart = h * 60;
      const slotMid = slotStart + 30;
      if (slotMid < startMin || slotMid > endMin) return 'O';
      if (s.is_holiday || slotMid > normalEndMin) return 'L';
      if (h === 12) return 'I';
      return s.ritase_flag ? 'R' : 'S';
    });
    return {
      ...s,
      cells
    };
  });

  return { hours, rows };
}

export function lookupOvertimeTariff(hoursInput, isHoliday = false, settings = DEFAULT_OPS_SETTINGS) {
  const cfg = normalizeOpsSettings(settings).driver;
  const h = roundHalfHour(hoursInput);
  if (h <= 0) return 0;

  const table = isHoliday ? cfg.holidayOvertimeTariff : cfg.weekdayOvertimeTariff;
  const exact = table.find(r => Math.abs(r.hours - h) < 0.001);
  if (exact) return Math.round(exact.amount);

  if (table.length === 0) return 0;
  // Find nearest lower row and extrapolate using configured half-hour increment
  const sorted = [...table].sort((a, b) => a.hours - b.hours);
  const last = sorted[sorted.length - 1];
  if (h > last.hours) {
    const extraSteps = Math.round((h - last.hours) / 0.5);
    const inc = isHoliday ? cfg.extraHolidayHalfHourIncrement : cfg.extraWeekdayHalfHourIncrement;
    return Math.round(last.amount + extraSteps * inc);
  }
  let lower = sorted[0];
  for (const row of sorted) {
    if (row.hours <= h) lower = row;
  }
  const inc = isHoliday ? cfg.extraHolidayHalfHourIncrement : cfg.extraWeekdayHalfHourIncrement;
  const extraSteps = Math.round((h - lower.hours) / 0.5);
  return Math.round(lower.amount + extraSteps * inc);
}

const ONES_ID = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];

function terbilangCore(n) {
  if (n < 12) return ONES_ID[n];
  if (n < 20) return `${terbilangCore(n - 10)} Belas`;
  if (n < 100) return `${terbilangCore(Math.floor(n / 10))} Puluh${n % 10 ? ` ${terbilangCore(n % 10)}` : ''}`;
  if (n < 200) return `Seratus${n % 100 ? ` ${terbilangCore(n % 100)}` : ''}`;
  if (n < 1000) return `${terbilangCore(Math.floor(n / 100))} Ratus${n % 100 ? ` ${terbilangCore(n % 100)}` : ''}`;
  if (n < 2000) return `Seribu${n % 1000 ? ` ${terbilangCore(n % 1000)}` : ''}`;
  if (n < 1000000) return `${terbilangCore(Math.floor(n / 1000))} Ribu${n % 1000 ? ` ${terbilangCore(n % 1000)}` : ''}`;
  if (n < 1000000000) return `${terbilangCore(Math.floor(n / 1000000))} Juta${n % 1000000 ? ` ${terbilangCore(n % 1000000)}` : ''}`;
  if (n < 1000000000000) return `${terbilangCore(Math.floor(n / 1000000000))} Miliar${n % 1000000000 ? ` ${terbilangCore(n % 1000000000)}` : ''}`;
  return String(n);
}

export function terbilangRupiah(amount) {
  const val = Math.round(Number(amount) || 0);
  if (val <= 0) return 'Nol Rupiah';
  return `${terbilangCore(val).replace(/\s+/g, ' ').trim()} Rupiah`;
}

export function calculateDriverPayroll({
  periodKey = '2026-11-P1',
  periodStart = '',
  periodEnd = '',
  schedules = [],
  adjustmentsByNik = {},
  employees = [],
  settings = DEFAULT_OPS_SETTINGS
}) {
  const cfg = normalizeOpsSettings(settings).driver;
  if (!cfg.payrollRulesConfirmed) {
    throw new Error('Aturan tarif gaji & lembur driver belum dikonfirmasi di Operations & Formulas Settings.');
  }

  const filtered = schedules.filter(s => {
    if (periodStart && s.work_date < periodStart) return false;
    if (periodEnd && s.work_date > periodEnd) return false;
    return true;
  });

  const empByNik = new Map(employees.map(e => [compactNik(e.employee_no), e]));
  const driverMap = new Map();
  const sectionTotals = {};
  cfg.sections.forEach(sec => {
    sectionTotals[sec] = { section: sec, shifts: 0, normalHours: 0, overtimeHours: 0, overtimePay: 0, grossPay: 0, netPay: 0 };
  });

  for (const s of filtered) {
    const nik = String(s.employee_no || '').trim();
    const nikKey = compactNik(nik);
    const emp = empByNik.get(nikKey);
    const adj = adjustmentsByNik[nik] || adjustmentsByNik[nikKey] || {};
    const monthlyWage = Number(adj.monthlyWage || cfg.defaultMonthlyWage);
    const dailyWage = Number(adj.dailyWage || Math.round(monthlyWage / cfg.workingDayDivisor));
    const otPay = lookupOvertimeTariff(s.overtime_hours, Boolean(s.is_holiday), settings);
    const secName = cfg.sections.includes(s.section) ? s.section : 'Lainnya';

    let row = driverMap.get(nikKey);
    if (!row) {
      row = {
        employee_no: emp?.employee_no || nik,
        driver_name: emp?.full_name || s.driver_name || nik,
        primary_section: secName,
        monthlyWage,
        dailyWage,
        presentDays: 0,
        holidayShifts: 0,
        normalHours: 0,
        overtimeHours: 0,
        basicPay: 0,
        overtimePay: 0,
        priorShortfall: Math.round(Number(adj.priorShortfall || 0)),
        claimHours: Number(adj.claimHours || 0),
        claimRatePerHour: cfg.claimDailyBase / cfg.claimHoursDivisor,
        claimDeduction: Math.round((cfg.claimDailyBase / cfg.claimHoursDivisor) * Number(adj.claimHours || 0)),
        bpjsDeduction: Math.round(Number(adj.bpjsDeduction || 0)),
        grossPay: 0,
        netPay: 0,
        entries: []
      };
      driverMap.set(nikKey, row);
    }

    if (!s.is_holiday) row.presentDays += 1;
    else row.holidayShifts += 1;

    row.normalHours = Math.round((row.normalHours + Number(s.normal_hours || 0)) * 100) / 100;
    row.overtimeHours = Math.round((row.overtimeHours + Number(s.overtime_hours || 0)) * 100) / 100;
    row.overtimePay += otPay;
    row.entries.push({ ...s, overtimePay: otPay });

    const st = sectionTotals[secName] || (sectionTotals[secName] = { section: secName, shifts: 0, normalHours: 0, overtimeHours: 0, overtimePay: 0, grossPay: 0, netPay: 0 });
    st.shifts += 1;
    st.normalHours = Math.round((st.normalHours + Number(s.normal_hours || 0)) * 100) / 100;
    st.overtimeHours = Math.round((st.overtimeHours + Number(s.overtime_hours || 0)) * 100) / 100;
    st.overtimePay += otPay;
    // Allocate basic wage share to section where shift occurred (if regular non-holiday shift)
    const shiftBasic = s.is_holiday ? 0 : dailyWage;
    st.grossPay += shiftBasic + otPay;
    st.netPay += shiftBasic + otPay;
  }

  const drivers = [];
  for (const row of driverMap.values()) {
    row.basicPay = Math.round(row.dailyWage * row.presentDays);
    row.grossPay = Math.round(row.basicPay + row.overtimePay + row.priorShortfall);
    row.netPay = Math.round(row.grossPay - row.bpjsDeduction - row.claimDeduction);
    row.terbilangNet = terbilangRupiah(row.netPay);
    drivers.push(row);
  }
  drivers.sort((a, b) => a.driver_name.localeCompare(b.driver_name));

  const sections = Object.values(sectionTotals).filter(s => s.shifts > 0);
  const grandTotal = drivers.reduce((acc, d) => {
    acc.presentDays += d.presentDays;
    acc.holidayShifts += d.holidayShifts;
    acc.normalHours += d.normalHours;
    acc.overtimeHours += d.overtimeHours;
    acc.basicPay += d.basicPay;
    acc.overtimePay += d.overtimePay;
    acc.priorShortfall += d.priorShortfall;
    acc.grossPay += d.grossPay;
    acc.claimDeduction += d.claimDeduction;
    acc.bpjsDeduction += d.bpjsDeduction;
    acc.netPay += d.netPay;
    return acc;
  }, {
    presentDays: 0, holidayShifts: 0, normalHours: 0, overtimeHours: 0,
    basicPay: 0, overtimePay: 0, priorShortfall: 0, grossPay: 0,
    claimDeduction: 0, bpjsDeduction: 0, netPay: 0
  });

  // BKK/BKM rows per section
  const bkkRows = sections.map(sec => {
    const subtotalGaji = Math.round(sec.grossPay);
    const feeAmount = Math.round(subtotalGaji * cfg.bkkFeeRate);
    const totalBkk = subtotalGaji + feeAmount;
    const pphAmount = Math.round(feeAmount * cfg.pphFeeRate);
    const netTransfer = totalBkk - pphAmount;
    return {
      section: sec.section,
      subtotalGaji,
      feeRate: cfg.bkkFeeRate,
      feeAmount,
      totalBkk,
      pphRate: cfg.pphFeeRate,
      pphAmount,
      netTransfer,
      terbilangBkk: terbilangRupiah(totalBkk),
      terbilangTransfer: terbilangRupiah(netTransfer)
    };
  });

  const bkkTotals = bkkRows.reduce((acc, r) => {
    acc.subtotalGaji += r.subtotalGaji;
    acc.feeAmount += r.feeAmount;
    acc.totalBkk += r.totalBkk;
    acc.pphAmount += r.pphAmount;
    acc.netTransfer += r.netTransfer;
    return acc;
  }, { subtotalGaji: 0, feeAmount: 0, totalBkk: 0, pphAmount: 0, netTransfer: 0 });
  bkkTotals.terbilangBkk = terbilangRupiah(bkkTotals.totalBkk);
  bkkTotals.terbilangTransfer = terbilangRupiah(bkkTotals.netTransfer);

  return {
    periodKey,
    periodStart,
    periodEnd,
    drivers,
    sections,
    grandTotal,
    bkkRows,
    bkkTotals
  };
}
