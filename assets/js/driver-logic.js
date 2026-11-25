// Pure Driver Eligibility, Period Window, Schedule & Reconciliation, Checksheet Grid, Tariff Lookup, Payroll & Audit Engine
import { DEFAULT_OPS_SETTINGS, normalizeOpsSettings, calculateEkstraMeal } from './ops-settings-logic.js';
import { compactNik, normKey, pad2 } from './attendance-logic.js';

export const DRIVER_SECTION_CODES = {
  Support: 'S',
  Indoor: 'I',
  Outdoor: 'O',
  Radin: 'R'
};

export const CHECKSHEET_TIME_SLOTS = [
  { id: 'slot_00_05', label: '_____ - 05:59', startMin: 0, endMin: 359 },
  { id: 'slot_06', label: '06:00 - 06:59', startMin: 360, endMin: 419 },
  { id: 'slot_07', label: '07:00 - 07:59', startMin: 420, endMin: 479 },
  { id: 'slot_08', label: '08:00 - 08:59', startMin: 480, endMin: 539 },
  { id: 'slot_09', label: '09:00 - 09:59', startMin: 540, endMin: 599 },
  { id: 'slot_10', label: '10:00 - 10:59', startMin: 600, endMin: 659 },
  { id: 'slot_11', label: '11:00 - 11:59', startMin: 660, endMin: 719 },
  { id: 'slot_12', label: '12:00 - 12:59', startMin: 720, endMin: 779 },
  { id: 'slot_13', label: '13:00 - 13:59', startMin: 780, endMin: 839 },
  { id: 'slot_14', label: '14:00 - 14:59', startMin: 840, endMin: 899 },
  { id: 'slot_15', label: '15:00 - 15:59', startMin: 900, endMin: 959 },
  { id: 'slot_16', label: '16:00 - 16:59', startMin: 960, endMin: 1019 },
  { id: 'slot_17_end', label: '17:00 - _____', startMin: 1020, endMin: 1439 }
];

const MONTHS_ID_UPPER = [
  'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
  'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
];

const MONTHS_ID_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
];

export function timeToMinutes(hhmm = '') {
  const m = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + (Number(m[3] || 0) / 60);
}

export function floorStep(val, step = 0.5) {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const inv = 1 / step;
  return Math.floor((n + 1e-9) * inv) / inv;
}

export function floorHalfHour(hours) {
  return floorStep(hours, 0.5);
}

export function roundHalfHour(hours) {
  return floorHalfHour(hours);
}

export function isEligibleDriver(emp = {}, settings = DEFAULT_OPS_SETTINGS) {
  const cfg = normalizeOpsSettings(settings).driver;
  const pos = normKey(emp?.position || '');
  const kw = normKey(cfg.requiredPositionKeyword || 'SOPIR');
  const isDriverPos = pos.includes(kw) || pos.includes('DRIVER');
  if (!isDriverPos) return false;
  const name = normKey(emp?.full_name || emp?.driver_name || '');
  const excluded = (cfg.excludedDriverNames || ['SIKUS']).map(x => normKey(x)).filter(Boolean);
  if (excluded.some(ex => name === ex || name.split(/\s+/).includes(ex))) {
    return false;
  }
  return true;
}

export function getEligibleDrivers(employees = [], settings = DEFAULT_OPS_SETTINGS) {
  return (employees || [])
    .filter(e => isEligibleDriver(e, settings))
    .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')));
}

export function getDriverPeriodWindow(monthKey = '2026-11', halfPeriod = 'P1') {
  const m = String(monthKey || '2026-11').match(/^(\d{4})-(\d{2})/);
  const year = m ? Number(m[1]) : 2026;
  const month = m ? Number(m[2]) : 11;
  const rawHalf = String(halfPeriod || 'P1').trim().toUpperCase();
  const half = rawHalf === 'P2' ? 'P2' : (rawHalf === 'FULL' ? 'FULL' : 'P1');
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDay = half === 'P2' ? 16 : 1;
  const endDay = half === 'P1' ? 15 : daysInMonth;

  const dates = [];
  for (let d = startDay; d <= endDay; d++) {
    dates.push(`${year}-${pad2(month)}-${pad2(d)}`);
  }

  const nextDate = new Date(Date.UTC(year, month - 1, endDay + 1));
  const printDateLabel = `${nextDate.getUTCDate()} ${MONTHS_ID_UPPER[nextDate.getUTCMonth()]} ${nextDate.getUTCFullYear()}`;
  const monthUpper = MONTHS_ID_UPPER[month - 1] || 'NOVEMBER';
  const monthShort = MONTHS_ID_SHORT[month - 1] || 'Nov';

  return {
    periodKey: `${year}-${pad2(month)}-${half}`,
    monthKey: `${year}-${pad2(month)}`,
    year,
    month,
    halfPeriod: half,
    startDay,
    endDay,
    startDate: `${year}-${pad2(month)}-${pad2(startDay)}`,
    endDate: `${year}-${pad2(month)}-${pad2(endDay)}`,
    dates,
    headerLabel: `${startDay} - ${endDay} ${monthUpper} ${year}`,
    checksheetLabel: `${pad2(startDay)} - ${pad2(endDay)} ${monthShort} ${year}`,
    printDateLabel
  };
}

export function getDriverDayRule(workDate, calendarMap = new Map(), settings = DEFAULT_OPS_SETTINGS) {
  const cfg = normalizeOpsSettings(settings).driver;
  const dow = new Date(`${workDate}T00:00:00Z`).getUTCDay();
  const cal = calendarMap instanceof Map ? calendarMap.get(workDate) : null;
  const isSunday = dow === 0;
  const isSaturday = dow === 6;
  const isNationalHoliday = cal?.day_type === 'HOLIDAY' || cal?.day_type === 'CUTI_BERSAMA';

  if (isSunday) {
    return {
      dayKind: isNationalHoliday ? 'SUNDAY_HOLIDAY' : 'SUNDAY',
      dayLabel: isNationalHoliday ? `Minggu / ${cal?.label || 'Hari Besar'}` : 'Minggu',
      normalQuotaHours: 0,
      isHolidayTariff: true,
      colorMark: isNationalHoliday ? 'red' : 'yellow'
    };
  }

  if (isNationalHoliday) {
    const quota = isSaturday ? cfg.saturdayNormalHours : cfg.weekdayNormalHours;
    return {
      dayKind: 'HOLIDAY',
      dayLabel: `Hari Besar (${cal?.label || 'Nasional'}) · Normal ${quota}j`,
      normalQuotaHours: quota,
      isHolidayTariff: true,
      colorMark: 'red'
    };
  }

  if (isSaturday) {
    return {
      dayKind: 'SATURDAY',
      dayLabel: `Sabtu (Normal ${cfg.saturdayNormalHours}j)`,
      normalQuotaHours: cfg.saturdayNormalHours,
      isHolidayTariff: false,
      colorMark: ''
    };
  }

  return {
    dayKind: 'WEEKDAY',
    dayLabel: `Senin–Jumat (Normal ${cfg.weekdayNormalHours}j)`,
    normalQuotaHours: cfg.weekdayNormalHours,
    isHolidayTariff: false,
    colorMark: ''
  };
}

export function calculateDurationMinutes(startDate, startTime, endDate, endTime, isOvernight = false) {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  if (s === null || e === null) return 0;

  let dayDiff = 0;
  if (startDate && endDate && endDate > startDate) {
    const msA = Date.parse(`${startDate}T00:00:00Z`);
    const msB = Date.parse(`${endDate}T00:00:00Z`);
    if (Number.isFinite(msA) && Number.isFinite(msB)) {
      dayDiff = Math.max(0, Math.round((msB - msA) / 86400000));
    }
  } else if (isOvernight || e < s) {
    dayDiff = 1;
  }

  return Math.max(0, dayDiff * 1440 + (e - s));
}

export function lookupOvertimeTariff(hoursInput, isHoliday = false, settings = DEFAULT_OPS_SETTINGS) {
  const cfg = normalizeOpsSettings(settings).driver;
  const h = floorHalfHour(hoursInput);
  if (h <= 0) return 0;

  const table = isHoliday ? cfg.holidayOvertimeTariff : cfg.weekdayOvertimeTariff;
  const exact = table.find(r => Math.abs(r.hours - h) < 0.001);
  if (exact) return Math.round(exact.amount);
  if (table.length === 0) return 0;

  const sorted = [...table].sort((a, b) => a.hours - b.hours);
  const last = sorted[sorted.length - 1];
  const inc = isHoliday ? cfg.extraHolidayHalfHourIncrement : cfg.extraWeekdayHalfHourIncrement;
  if (h > last.hours) {
    const extraSteps = Math.round((h - last.hours) / 0.5);
    return Math.round(last.amount + extraSteps * inc);
  }
  let lower = sorted[0];
  for (const row of sorted) {
    if (row.hours <= h) lower = row;
  }
  const extraSteps = Math.round((h - lower.hours) / 0.5);
  return Math.round(lower.amount + extraSteps * inc);
}

export function computeDriverDayMetrics({
  workDate,
  startTime,
  endTime,
  checkoutDate = '',
  isOvernight = false,
  calendarMap = new Map(),
  settings = DEFAULT_OPS_SETTINGS
}) {
  const cfg = normalizeOpsSettings(settings).driver;
  const dayRule = getDriverDayRule(workDate, calendarMap, settings);
  const totalMinutes = calculateDurationMinutes(workDate, startTime, checkoutDate || workDate, endTime, isOvernight);
  const totalHoursExact = Math.round((totalMinutes / 60) * 1000) / 1000;
  const quota = dayRule.normalQuotaHours;
  const auditSteps = [];

  if (totalMinutes <= 0) {
    return {
      dayRule,
      totalMinutes: 0,
      totalHoursExact: 0,
      normalHours: 0,
      presentDays: 0,
      rawOvertimeHours: 0,
      breakDeductionHours: 0,
      overtimeHours: 0,
      normalPay: 0,
      overtimePay: 0,
      ekstraMealPay: 0,
      auditSteps: ['Durasi kerja 0 menit (tidak ada jam masuk/pulang lengkap).']
    };
  }

  let normalHours = 0;
  let presentDays = 0;
  let rawOvertimeHours = 0;
  let breakDeductionHours = 0;
  let overtimeHours = 0;

  auditSteps.push(`Status hari: ${dayRule.dayLabel}. Total durasi kerja: ${(totalMinutes / 60).toFixed(2)} jam (${Math.floor(totalMinutes / 60)}j ${Math.round(totalMinutes % 60)}m).`);

  if (quota === 0) {
    // Minggu: seluruh jam masuk dihitung lembur hari libur
    rawOvertimeHours = floorStep(totalHoursExact, cfg.overtimeRoundStepHours);
    breakDeductionHours = rawOvertimeHours > cfg.overtimeBreakThresholdHours ? cfg.overtimeBreakDeductionHours : 0;
    overtimeHours = Math.max(0, rawOvertimeHours - breakDeductionHours);
    auditSteps.push(`Hari Minggu: jam normal = 0 hari; seluruh jam dibulatkan ke bawah kelipatan ${cfg.overtimeRoundStepHours}j = ${rawOvertimeHours}j lembur.`);
    if (breakDeductionHours > 0) {
      auditSteps.push(`Lembur kotor (${rawOvertimeHours}j) > ${cfg.overtimeBreakThresholdHours}j -> dikurangi istirahat ${breakDeductionHours}j = ${overtimeHours}j lembur bersih.`);
    }
  } else if (totalHoursExact < quota) {
    // Kurang dari kuota normal: pembulatan ke bawah kelipatan 1 jam, proporsional terhadap kuota
    const floored = floorStep(totalHoursExact, cfg.normalFloorUnitHours);
    normalHours = floored;
    presentDays = Math.round((floored / quota) * 10000) / 10000;
    auditSteps.push(`Kurang dari kuota normal ${quota}j -> dibulatkan ke bawah kelipatan ${cfg.normalFloorUnitHours}j = ${floored}j -> ${presentDays} hari hadir.`);
  } else {
    normalHours = quota;
    presentDays = 1;
    const excessHours = totalHoursExact - quota;
    rawOvertimeHours = floorStep(excessHours, cfg.overtimeRoundStepHours);
    breakDeductionHours = rawOvertimeHours > cfg.overtimeBreakThresholdHours ? cfg.overtimeBreakDeductionHours : 0;
    overtimeHours = Math.max(0, rawOvertimeHours - breakDeductionHours);
    auditSteps.push(`Mencapai kuota normal ${quota}j = 1 hari hadir (Rp ${cfg.defaultDailyWage.toLocaleString('id-ID')}). Kelebihan ${(excessHours).toFixed(2)}j -> floor ${cfg.overtimeRoundStepHours}j = ${rawOvertimeHours}j lembur kotor.`);
    if (breakDeductionHours > 0) {
      auditSteps.push(`Lembur kotor (${rawOvertimeHours}j) > ${cfg.overtimeBreakThresholdHours}j -> dikurangi istirahat ${breakDeductionHours}j = ${overtimeHours}j lembur bersih.`);
    }
  }

  const normalPay = Math.round(presentDays * cfg.defaultDailyWage);
  const overtimePay = lookupOvertimeTariff(overtimeHours, dayRule.isHolidayTariff, settings);
  const ekstraMealPay = calculateEkstraMeal(overtimeHours, settings);
  if (overtimeHours > 0) {
    auditSteps.push(`Tarif ${dayRule.isHolidayTariff ? 'Lembur Hari Minggu/Besar' : 'Lembur Hari Biasa'} (${overtimeHours}j) = Rp ${overtimePay.toLocaleString('id-ID')}.`);
  }
  if (ekstraMealPay > 0) {
    auditSteps.push(`Ekstra Meal lembur (${overtimeHours}j) = Rp ${ekstraMealPay.toLocaleString('id-ID')}.`);
  }

  return {
    dayRule,
    totalMinutes,
    totalHoursExact,
    normalHours,
    presentDays,
    rawOvertimeHours,
    breakDeductionHours,
    overtimeHours,
    normalPay,
    overtimePay,
    ekstraMealPay,
    auditSteps
  };
}

// Backward-compatible signature helper
export function computeDriverWorkHours(startTime, endTime, { normalWorkHours = 8, isHoliday = false, isSunday = false, isSaturday = false, settings = DEFAULT_OPS_SETTINGS } = {}) {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  if (s === null || e === null) return { totalHours: 0, normalHours: 0, overtimeHours: 0 };
  const diffMin = e >= s ? (e - s) : ((1440 - s) + e);
  const exactH = diffMin / 60;
  const totalHours = floorHalfHour(exactH);
  if (isSunday || (isHoliday && normalWorkHours === 0)) {
    const rawOt = floorHalfHour(exactH);
    const netOt = rawOt > 8 ? rawOt - 1 : rawOt;
    return { totalHours, normalHours: 0, overtimeHours: netOt };
  }
  const quota = isSaturday ? 5 : normalWorkHours;
  if (exactH < quota) {
    const floored = floorStep(exactH, 1);
    return { totalHours, normalHours: floored, overtimeHours: 0 };
  }
  const rawOt = floorHalfHour(exactH - quota);
  const netOt = rawOt > 8 ? rawOt - 1 : rawOt;
  return { totalHours, normalHours: quota, overtimeHours: netOt };
}

export function normalizeScheduleActivities(schedule = {}) {
  if (Array.isArray(schedule.activities) && schedule.activities.length) {
    return schedule.activities.map(a => ({
      start_time: String(a.start_time || schedule.start_time || '07:00').slice(0, 5),
      end_time: a.is_until_home ? '' : String(a.end_time || '').slice(0, 5),
      is_until_home: Boolean(a.is_until_home || !a.end_time || /PULANG/i.test(String(a.end_time))),
      activity: String(a.activity || schedule.destination || '').trim()
    }));
  }
  return [{
    start_time: String(schedule.start_time || '07:00').slice(0, 5),
    end_time: String(schedule.end_time || '').slice(0, 5),
    is_until_home: !schedule.end_time,
    activity: String(schedule.destination || schedule.notes || '').trim()
  }];
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
  const byNikDate = new Map();

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
    } else if (!isEligibleDriver(exactEmp, settings)) {
      nikWarnings.push({
        scheduleId: row.id,
        employee_no: row.employee_no,
        driver_name: row.driver_name,
        work_date: row.work_date,
        message: `${exactEmp.full_name} bukan Sopir aktif atau masuk daftar pengecualian (${cfg.excludedDriverNames.join(', ')})`
      });
    }

    if (row.section && !cfg.sections.includes(row.section)) {
      nikWarnings.push({
        scheduleId: row.id,
        employee_no: row.employee_no,
        work_date: row.work_date,
        message: `Departemen "${row.section}" di luar daftar standar (${cfg.sections.join(', ')})`
      });
    }

    const acts = normalizeScheduleActivities(row);
    const firstStart = timeToMinutes(acts[0]?.start_time || row.start_time) ?? 420;
    const lastAct = acts[acts.length - 1];
    const lastEnd = lastAct?.is_until_home ? 1080 : (timeToMinutes(lastAct?.end_time || row.end_time) ?? 1020);
    const key = `${nikKey}|${row.work_date}`;
    const prevList = byNikDate.get(key) || [];
    for (const prev of prevList) {
      const overlaps = (prev.s < lastEnd && firstStart < prev.e) || (prev.s === firstStart && prev.e === lastEnd);
      if (overlaps) {
        conflicts.push({
          scheduleId: row.id,
          otherScheduleId: prev.row.id,
          employee_no: row.employee_no,
          driver_name: row.driver_name,
          work_date: row.work_date,
          message: `Jadwal bentrok pada ${row.work_date}: ${prev.row.section} (${prev.row.start_time || ''}-${prev.row.end_time || 'Pulang'}) vs ${row.section} (${acts[0]?.start_time || ''}-${lastAct?.is_until_home ? 'Pulang' : lastAct?.end_time})`
        });
      }
    }
    prevList.push({ row, s: firstStart, e: lastEnd });
    byNikDate.set(key, prevList);
  }

  return { valid: conflicts.length === 0, conflicts, nikWarnings };
}

function getScheduleBlocksRange(daySchedules = [], effStartMin, effEndMin) {
  if (!daySchedules.length) return [];
  const rawSegments = [];
  for (const sch of daySchedules) {
    const acts = normalizeScheduleActivities(sch);
    for (const act of acts) {
      const s = timeToMinutes(act.start_time) ?? effStartMin;
      const e = act.is_until_home || !act.end_time ? effEndMin : (timeToMinutes(act.end_time) ?? effEndMin);
      const adjE = e <= s ? Math.max(effEndMin, s + 60) : e;
      rawSegments.push({
        section: sch.section || 'Support',
        code: DRIVER_SECTION_CODES[sch.section] || 'S',
        startMin: s,
        endMin: adjE,
        activity: act.activity || ''
      });
    }
  }
  rawSegments.sort((a, b) => a.startMin - b.startMin);
  return rawSegments;
}

function resolveSectionForMinute(minuteOffset, segments = [], fallbackSection = 'Support') {
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (minuteOffset >= seg.startMin && minuteOffset < seg.endMin) {
      return seg.section;
    }
  }
  if (segments.length) {
    if (minuteOffset < segments[0].startMin) return segments[0].section;
    return segments[segments.length - 1].section;
  }
  return fallbackSection;
}

function allocateDayAcrossDepartments({
  workDate,
  effIn,
  effOut,
  checkoutDate,
  isOvernight,
  daySchedules,
  metrics,
  settings
}) {
  const cfg = normalizeOpsSettings(settings).driver;
  const sections = cfg.sections;
  const bySection = {};
  sections.forEach(sec => {
    bySection[sec] = {
      section: sec,
      code: DRIVER_SECTION_CODES[sec] || sec[0],
      normalMinutes: 0,
      overtimeMinutes: 0,
      presentDays: 0,
      normalHours: 0,
      overtimeHours: 0,
      normalPay: 0,
      overtimePay: 0,
      ekstraMealPay: 0
    };
  });

  if (metrics.totalMinutes <= 0) return bySection;

  const sMin = timeToMinutes(effIn) ?? 420;
  const eMinAbs = sMin + metrics.totalMinutes;
  const segments = getScheduleBlocksRange(daySchedules, sMin, eMinAbs);
  const fallbackSection = daySchedules[0]?.section || 'Support';

  const normalQuotaMin = Math.round(metrics.dayRule.normalQuotaHours * 60);
  const step = 15; // 15-min precision for department split
  for (let m = sMin; m < eMinAbs; m += step) {
    const slice = Math.min(step, eMinAbs - m);
    const mid = m + slice / 2;
    const sec = resolveSectionForMinute(mid, segments, fallbackSection);
    const target = bySection[sec] || bySection[fallbackSection] || bySection.Support;
    if (normalQuotaMin > 0 && (m - sMin) < normalQuotaMin) {
      target.normalMinutes += slice;
    } else {
      target.overtimeMinutes += slice;
    }
  }

  const totalNormalMin = Object.values(bySection).reduce((a, b) => a + b.normalMinutes, 0);
  const totalOtMin = Object.values(bySection).reduce((a, b) => a + b.overtimeMinutes, 0);

  // Allocate presentDays & normalPay proportionally so sums match metrics exactly
  let remDays = metrics.presentDays;
  let remNormalPay = metrics.normalPay;
  let remOtHours = metrics.overtimeHours;
  let remOtPay = metrics.overtimePay;

  const activeNormalSecs = Object.values(bySection).filter(s => s.normalMinutes > 0).sort((a, b) => b.normalMinutes - a.normalMinutes);
  activeNormalSecs.forEach((secObj, idx) => {
    if (idx === activeNormalSecs.length - 1) {
      secObj.presentDays = Math.round(remDays * 10000) / 10000;
      secObj.normalPay = Math.round(remNormalPay);
    } else {
      const ratio = totalNormalMin > 0 ? secObj.normalMinutes / totalNormalMin : 0;
      secObj.presentDays = Math.round(metrics.presentDays * ratio * 10000) / 10000;
      secObj.normalPay = Math.round(metrics.normalPay * ratio);
      remDays -= secObj.presentDays;
      remNormalPay -= secObj.normalPay;
    }
    secObj.normalHours = Math.round(secObj.presentDays * (metrics.dayRule.normalQuotaHours || 8) * 100) / 100;
  });

  const activeOtSecs = Object.values(bySection).filter(s => s.overtimeMinutes > 0).sort((a, b) => b.overtimeMinutes - a.overtimeMinutes);
  let remEkstraMealPay = Math.round(metrics.ekstraMealPay || 0);
  if (activeOtSecs.length === 1) {
    activeOtSecs[0].overtimeHours = metrics.overtimeHours;
    activeOtSecs[0].overtimePay = metrics.overtimePay;
    activeOtSecs[0].ekstraMealPay = remEkstraMealPay;
  } else if (activeOtSecs.length > 1) {
    activeOtSecs.forEach((secObj, idx) => {
      if (idx === activeOtSecs.length - 1) {
        secObj.overtimeHours = Math.round(remOtHours * 100) / 100;
        secObj.overtimePay = Math.round(remOtPay);
        secObj.ekstraMealPay = Math.round(remEkstraMealPay);
      } else {
        const ratio = totalOtMin > 0 ? secObj.overtimeMinutes / totalOtMin : 0;
        secObj.overtimeHours = Math.round(metrics.overtimeHours * ratio * 2) / 2;
        secObj.overtimePay = Math.round(metrics.overtimePay * ratio);
        secObj.ekstraMealPay = Math.round((metrics.ekstraMealPay || 0) * ratio);
        remOtHours -= secObj.overtimeHours;
        remOtPay -= secObj.overtimePay;
        remEkstraMealPay -= secObj.ekstraMealPay;
      }
    });
  } else if (remEkstraMealPay > 0) {
    const targetSec = Object.values(bySection).sort((a, b) => (b.normalMinutes + b.overtimeMinutes) - (a.normalMinutes + a.overtimeMinutes))[0] || bySection[fallbackSection] || bySection.Support;
    if (targetSec) targetSec.ekstraMealPay = remEkstraMealPay;
  }

  return bySection;
}

export function reconcileDriverSchedulesAndAttendance({
  monthKey = '2026-11',
  halfPeriod = 'P1',
  drivers = [],
  schedules = [],
  rawEvents = [],
  reconciliations = [],
  calendarDays = [],
  settings = DEFAULT_OPS_SETTINGS
}) {
  const win = getDriverPeriodWindow(monthKey, halfPeriod);
  const calMap = new Map((calendarDays || []).map(c => [c.cal_date, c]));
  const recMap = new Map(
    (reconciliations || [])
      .filter(r => r && r.work_date && r.employee_no)
      .map(r => [`${compactNik(r.employee_no)}|${r.work_date}`, r])
  );

  // Deduplicate rawEvents per (nik, work_date) using source priority
  const attPriority = normalizeOpsSettings(settings).attendance.sourcePriority;
  const prio = s => {
    const i = attPriority.indexOf(s);
    return i >= 0 ? i : 99;
  };
  const eventMap = new Map();
  for (const ev of rawEvents || []) {
    if (!ev.work_date) continue;
    const k = `${compactNik(ev.employee_no)}|${ev.work_date}`;
    const prev = eventMap.get(k);
    if (!prev || prio(ev.source_type) < prio(prev.source_type)) {
      eventMap.set(k, ev);
    }
  }

  const schedMap = new Map();
  for (const sch of schedules || []) {
    if (!sch.work_date) continue;
    const k = `${compactNik(sch.employee_no)}|${sch.work_date}`;
    const list = schedMap.get(k) || [];
    list.push(sch);
    schedMap.set(k, list);
  }

  const rows = [];
  const anomalies = [];

  for (const drv of drivers) {
    const nikKey = compactNik(drv.employee_no);
    for (const workDate of win.dates) {
      const daySchedules = schedMap.get(`${nikKey}|${workDate}`) || [];
      const ev = eventMap.get(`${nikKey}|${workDate}`) || null;
      const rec = recMap.get(`${nikKey}|${workDate}`) || null;

      if (!daySchedules.length && !ev && !rec) continue;

      const schStart = daySchedules[0] ? normalizeScheduleActivities(daySchedules[0])[0]?.start_time : '';
      const lastSch = daySchedules[daySchedules.length - 1];
      const lastActs = lastSch ? normalizeScheduleActivities(lastSch) : [];
      const schEnd = lastActs.length ? (lastActs[lastActs.length - 1].is_until_home ? '' : lastActs[lastActs.length - 1].end_time) : '';

      const punchIn = ev?.check_in ? String(ev.check_in).slice(0, 5) : '';
      const punchOut = ev?.check_out ? String(ev.check_out).slice(0, 5) : '';

      let anomalyType = '';
      let anomalyMessage = '';
      if (rec?.resolved) {
        anomalyType = '';
      } else if (punchIn && !punchOut) {
        anomalyType = 'MISSING_CHECKOUT';
        anomalyMessage = 'Clock-In ada tanpa Clock-Out (kemungkinan lembur lewat hari / lupa tap pulang)';
      } else if (ev && !daySchedules.length) {
        anomalyType = 'NO_SCHEDULE';
        anomalyMessage = 'Ada tap absensi tapi belum ada Jadwal Manual Driver (Departemen S/I/O/R belum diplot)';
      } else if (daySchedules.length && !ev) {
        anomalyType = 'NO_ATTENDANCE';
        anomalyMessage = 'Ada Jadwal Manual Driver tapi belum ada data tap absensi mesin';
      } else if (punchIn && schStart) {
        const diff = Math.abs((timeToMinutes(punchIn) ?? 0) - (timeToMinutes(schStart) ?? 0));
        if (diff > 60) {
          anomalyType = 'TIME_MISMATCH';
          anomalyMessage = `Jam tap masuk (${punchIn}) selisih > 60 menit dari jadwal (${schStart})`;
        }
      }

      const effIn = rec?.actual_check_in || punchIn || schStart || '';
      const effOut = rec?.actual_check_out || punchOut || schEnd || '';
      const effOutDate = rec?.checkout_date || workDate;
      const isOvernight = Boolean(rec?.is_overnight || (effOutDate && effOutDate > workDate));

      const metrics = computeDriverDayMetrics({
        workDate,
        startTime: effIn,
        endTime: effOut,
        checkoutDate: effOutDate,
        isOvernight,
        calendarMap: calMap,
        settings
      });

      const bySection = allocateDayAcrossDepartments({
        workDate,
        effIn,
        effOut,
        checkoutDate: effOutDate,
        isOvernight,
        daySchedules,
        metrics,
        settings
      });

      const row = {
        key: `${nikKey}|${workDate}`,
        work_date: workDate,
        employee_no: drv.employee_no,
        driver_name: drv.full_name,
        schedules: daySchedules,
        rawEvent: ev,
        reconciliation: rec,
        punchIn,
        punchOut,
        scheduleStart: schStart,
        scheduleEnd: schEnd,
        effectiveIn: effIn,
        effectiveOut: effOut,
        checkoutDate: effOutDate,
        isOvernight,
        sourceUsed: rec?.resolved ? 'abnormal_override' : (ev ? 'attendance_machine' : 'manual_schedule'),
        anomalyType,
        anomalyMessage,
        isResolved: Boolean(rec?.resolved),
        metrics,
        bySection
      };
      rows.push(row);
      if (anomalyType) anomalies.push(row);
    }
  }

  rows.sort((a, b) => a.work_date.localeCompare(b.work_date) || a.driver_name.localeCompare(b.driver_name));
  return { window: win, rows, anomalies };
}

export function buildDriverTimeChecksheetData({
  driver,
  periodWindow,
  driverDayRows = [],
  calendarMap = new Map(),
  settings = DEFAULT_OPS_SETTINGS
}) {
  const rowByDate = new Map(driverDayRows.map(r => [r.work_date, r]));
  const sections = normalizeOpsSettings(settings).driver.sections;

  const dayMeta = periodWindow.dates.map(dateStr => {
    const dayRule = getDriverDayRule(dateStr, calendarMap, settings);
    return {
      dateStr,
      dayNum: Number(dateStr.slice(8, 10)),
      colorMark: dayRule.colorMark, // 'yellow' | 'red' | ''
      dayKind: dayRule.dayKind
    };
  });

  const timeRows = CHECKSHEET_TIME_SLOTS.map(slot => {
    const cells = periodWindow.dates.map(dateStr => {
      const rec = rowByDate.get(dateStr);
      if (!rec || !rec.effectiveIn || !rec.effectiveOut) return '';
      const sMin = timeToMinutes(rec.effectiveIn);
      const eMin = sMin + rec.metrics.totalMinutes;
      if (sMin === null || rec.metrics.totalMinutes <= 0) return '';

      // Check overlap with this time slot
      const ovStart = Math.max(slot.startMin, sMin);
      const ovEnd = Math.min(slot.endMin + 1, eMin);
      if (ovEnd <= ovStart) return '';

      const segments = getScheduleBlocksRange(rec.schedules, sMin, eMin);
      const sec = resolveSectionForMinute((ovStart + ovEnd) / 2, segments, rec.schedules[0]?.section || 'Support');
      return DRIVER_SECTION_CODES[sec] || 'S';
    });
    return { ...slot, cells };
  });

  const normalRows = sections.map(sec => {
    const dailyValues = periodWindow.dates.map(dateStr => {
      const rec = rowByDate.get(dateStr);
      const val = rec?.bySection?.[sec]?.presentDays || 0;
      return val > 0 ? Math.round(val * 100) / 100 : 0;
    });
    const total = Math.round(dailyValues.reduce((a, b) => a + b, 0) * 100) / 100;
    return { section: sec, label: sec.toUpperCase(), dailyValues, total };
  });

  const overtimeRows = sections.map(sec => {
    const dailyValues = periodWindow.dates.map(dateStr => {
      const rec = rowByDate.get(dateStr);
      const val = rec?.bySection?.[sec]?.overtimeHours || 0;
      return val > 0 ? Math.round(val * 100) / 100 : 0;
    });
    const total = Math.round(dailyValues.reduce((a, b) => a + b, 0) * 100) / 100;
    return { section: sec, label: sec.toUpperCase(), dailyValues, total };
  });

  return {
    driver,
    periodWindow,
    dayMeta,
    timeRows,
    normalRows,
    overtimeRows
  };
}

export function calculateDriverPayrollPeriod({
  monthKey = '2026-11',
  halfPeriod = 'P1',
  drivers = [],
  schedules = [],
  rawEvents = [],
  reconciliations = [],
  adjustmentsByPeriod = {},
  calendarDays = [],
  settings = DEFAULT_OPS_SETTINGS
}) {
  const cfg = normalizeOpsSettings(settings).driver;
  if (!cfg.payrollRulesConfirmed) {
    throw new Error('Aturan tarif gaji & lembur driver belum dikonfirmasi di System Settings.');
  }

  const calMap = new Map((calendarDays || []).map(c => [c.cal_date, c]));
  const reconciliation = reconcileDriverSchedulesAndAttendance({
    monthKey,
    halfPeriod,
    drivers,
    schedules,
    rawEvents,
    reconciliations,
    calendarDays,
    settings
  });

  const win = reconciliation.window;
  const periodAdj = adjustmentsByPeriod?.[win.periodKey] || adjustmentsByPeriod || {};
  const isPeriod2 = win.halfPeriod === 'P2' || win.halfPeriod === 'FULL';
  const defaultBpjs = cfg.bpjsPeriodRule === 'always' || (cfg.bpjsPeriodRule === 'period2_only' && isPeriod2)
    ? cfg.bpjsDefaultAmount
    : 0;

  const rowsByNik = new Map();
  reconciliation.rows.forEach(r => {
    const k = compactNik(r.employee_no);
    const arr = rowsByNik.get(k) || [];
    arr.push(r);
    rowsByNik.set(k, arr);
  });

  const summaryRows = [];
  const deptTables = {};
  cfg.sections.forEach(sec => { deptTables[sec] = []; });
  const checksheets = [];

  for (const drv of drivers) {
    const nikKey = compactNik(drv.employee_no);
    const drvDays = rowsByNik.get(nikKey) || [];
    const adj = periodAdj[drv.employee_no] || periodAdj[nikKey] || {};

    let totalPresentDays = 0;
    let totalNormalHours = 0;
    let totalOvertimeHours = 0;
    let totalNormalPay = 0;
    let totalOvertimePay = 0;
    let totalEkstraMealPay = 0;

    const deptAgg = {};
    cfg.sections.forEach(sec => {
      deptAgg[sec] = { presentDays: 0, normalHours: 0, overtimeHours: 0, normalPay: 0, overtimePay: 0, ekstraMealPay: 0 };
    });

    for (const day of drvDays) {
      totalPresentDays += day.metrics.presentDays;
      totalNormalHours += day.metrics.normalHours;
      totalOvertimeHours += day.metrics.overtimeHours;
      totalNormalPay += day.metrics.normalPay;
      totalOvertimePay += day.metrics.overtimePay;
      totalEkstraMealPay += day.metrics.ekstraMealPay || 0;

      for (const sec of cfg.sections) {
        const s = day.bySection[sec];
        if (!s) continue;
        deptAgg[sec].presentDays += s.presentDays;
        deptAgg[sec].normalHours += s.normalHours;
        deptAgg[sec].overtimeHours += s.overtimeHours;
        deptAgg[sec].normalPay += s.normalPay;
        deptAgg[sec].overtimePay += s.overtimePay;
        deptAgg[sec].ekstraMealPay += s.ekstraMealPay || 0;
      }
    }

    // Prior shortfall can be entered per-department or as summary override
    const deptShortfalls = {};
    let totalShortfall = 0;
    if (adj.bySection && typeof adj.bySection === 'object') {
      cfg.sections.forEach(sec => {
        const val = Math.round(Number(adj.bySection[sec] || 0));
        deptShortfalls[sec] = val;
        totalShortfall += val;
      });
    } else {
      totalShortfall = Math.round(Number(adj.priorShortfall || 0));
      // Attribute summary shortfall to primary active section or Support
      const activeSec = cfg.sections.find(sec => deptAgg[sec].presentDays > 0 || deptAgg[sec].overtimeHours > 0) || 'Support';
      cfg.sections.forEach(sec => {
        deptShortfalls[sec] = sec === activeSec ? totalShortfall : 0;
      });
    }

    const bpjsAmount = adj.bpjsOverride !== undefined && adj.bpjsOverride !== null && adj.bpjsOverride !== ''
      ? Math.round(Number(adj.bpjsOverride || 0))
      : defaultBpjs;

    const roundedPresentDays = Math.round(totalPresentDays * 100) / 100;
    const roundedNormalHours = Math.round(totalNormalHours * 100) / 100;
    const roundedOtHours = Math.round(totalOvertimeHours * 100) / 100;
    const roundedNormalPay = Math.round(totalNormalPay);
    const roundedOtPay = Math.round(totalOvertimePay);
    const roundedEkstraMealPay = Math.round(totalEkstraMealPay);
    const grossPay = roundedNormalPay + roundedOtPay + roundedEkstraMealPay + totalShortfall;
    const netPay = grossPay - bpjsAmount;

    summaryRows.push({
      employee_no: drv.employee_no,
      driver_name: drv.full_name,
      monthlyWage: cfg.defaultMonthlyWage,
      presentDays: roundedPresentDays,
      normalHours: roundedNormalHours,
      overtimeHours: roundedOtHours,
      normalPay: roundedNormalPay,
      overtimePay: roundedOtPay,
      ekstraMealPay: roundedEkstraMealPay,
      priorShortfall: totalShortfall,
      grossPay,
      bpjsDeduction: bpjsAmount,
      netPay,
      days: drvDays
    });

    cfg.sections.forEach(sec => {
      const da = deptAgg[sec];
      const sf = deptShortfalls[sec] || 0;
      const dDays = Math.round(da.presentDays * 100) / 100;
      const dNormH = Math.round(da.normalHours * 100) / 100;
      const dOtH = Math.round(da.overtimeHours * 100) / 100;
      const dNormP = Math.round(da.normalPay);
      const dOtP = Math.round(da.overtimePay);
      const dEkstraMealP = Math.round(da.ekstraMealPay || 0);
      const dGross = dNormP + dOtP + dEkstraMealP + sf;
      if (dDays > 0 || dOtH > 0 || sf > 0 || dGross > 0) {
        deptTables[sec].push({
          employee_no: drv.employee_no,
          driver_name: drv.full_name,
          monthlyWage: cfg.defaultMonthlyWage,
          presentDays: dDays,
          normalHours: dNormH,
          overtimeHours: dOtH,
          normalPay: dNormP,
          overtimePay: dOtP,
          ekstraMealPay: dEkstraMealP,
          priorShortfall: sf,
          grossPay: dGross
        });
      }
    });

    checksheets.push(buildDriverTimeChecksheetData({
      driver: drv,
      periodWindow: win,
      driverDayRows: drvDays,
      calendarMap: calMap,
      settings
    }));
  }

  const sumSummary = rows => rows.reduce((acc, r) => {
    acc.presentDays = Math.round((acc.presentDays + r.presentDays) * 100) / 100;
    acc.normalHours = Math.round((acc.normalHours + r.normalHours) * 100) / 100;
    acc.overtimeHours = Math.round((acc.overtimeHours + r.overtimeHours) * 100) / 100;
    acc.normalPay += r.normalPay;
    acc.overtimePay += r.overtimePay;
    acc.ekstraMealPay += r.ekstraMealPay || 0;
    acc.priorShortfall += r.priorShortfall;
    acc.grossPay += r.grossPay;
    acc.bpjsDeduction += r.bpjsDeduction || 0;
    acc.netPay += r.netPay ?? r.grossPay;
    return acc;
  }, { presentDays: 0, normalHours: 0, overtimeHours: 0, normalPay: 0, overtimePay: 0, ekstraMealPay: 0, priorShortfall: 0, grossPay: 0, bpjsDeduction: 0, netPay: 0 });

  const summaryTotals = sumSummary(summaryRows);
  const deptTotals = {};
  cfg.sections.forEach(sec => {
    deptTotals[sec] = sumSummary(deptTables[sec]);
  });

  return {
    window: win,
    reconciliation,
    summaryRows,
    summaryTotals,
    deptTables,
    deptTotals,
    checksheets
  };
}

// Backward-compatible legacy helpers kept so older tests/imports don't crash
export function generateDriverChecksheetGrid(schedules = [], startHour = 6, endHour = 22) {
  const hours = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);
  const rows = schedules.map(s => {
    const startMin = timeToMinutes(s.start_time) ?? 420;
    const endMin = timeToMinutes(s.end_time) ?? 900;
    const normalEndMin = startMin + ((Number(s.normal_hours) || 0) * 60);
    const cells = hours.map(h => {
      const slotMid = h * 60 + 30;
      if (slotMid < startMin || slotMid > endMin) return 'O';
      if (s.is_holiday || slotMid > normalEndMin) return 'L';
      if (h === 12) return 'I';
      return s.ritase_flag ? 'R' : 'S';
    });
    return { ...s, cells };
  });
  return { hours, rows };
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
