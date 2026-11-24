// Pure Attendance Normalization, Upload Deduplication, Cuti, Directory Delta & Staff Payroll Attendance Logic
import {
  DEFAULT_OPS_SETTINGS,
  STAFF_ATTENDANCE_CODE_ORDER,
  DEFAULT_STAFF_CODEBOOK,
  normalizeOpsSettings
} from './ops-settings-logic.js';
import {
  normalizeCompanyEntity,
  isReholzCompanyEntity,
  normalizeHomeBase
} from './workspace-logic.js';

export {
  normalizeCompanyEntity,
  isReholzCompanyEntity,
  normalizeHomeBase,
  STAFF_ATTENDANCE_CODE_ORDER,
  DEFAULT_STAFF_CODEBOOK
};

export function normKey(v = '') {
  return String(v || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function compactNik(v = '') {
  return String(v || '').trim().replace(/\s+/g, '').toUpperCase();
}

export function pad2(n) {
  return String(Math.trunc(Number(n) || 0)).padStart(2, '0');
}

export function excelSerialToIsoDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n < 1000 || n > 100000) return null;
  // Excel epoch: 1899-12-30 in UTC to avoid TZ drift
  const wholeDays = Math.floor(n + 1e-6);
  const ms = Date.UTC(1899, 11, 30) + wholeDays * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function parseExcelOrTextDate(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'string' && /^#/.test(raw.trim())) return null; // Reject #REF!, #VALUE!, #N/A!
  if (typeof raw === 'number') return excelSerialToIsoDate(raw);
  const str = String(raw).trim();
  if (!str || str === '-' || /^#(REF|VALUE|NAME|DIV|N\/A)/i.test(str)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(str)) return str.slice(0, 10);
  // dd-mm-yyyy or dd/mm/yyyy or dd/mm/yy
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let day = Number(dmy[1]);
    let month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }
  return null;
}

export function parseAttendanceDateTime(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const isoDate = excelSerialToIsoDate(Math.floor(raw));
    if (!isoDate) return null;
    const frac = raw - Math.floor(raw);
    const totalSec = Math.round(frac * 86400) % 86400;
    const hh = Math.floor(totalSec / 3600);
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    return { date: isoDate, time: `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}` };
  }

  const str = String(raw).trim();
  if (!str) return null;

  // US style M/D/YYYY h:mm[:ss] AM/PM (used by Laporan Transaksi.xls & Data Presensi.xls)
  const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (usMatch) {
    let p1 = Number(usMatch[1]);
    let p2 = Number(usMatch[2]);
    const yyyy = Number(usMatch[3]);
    let hh = Number(usMatch[4]);
    const mm = Number(usMatch[5]);
    const ss = Number(usMatch[6] || 0);
    const ampm = (usMatch[7] || '').toUpperCase();
    if (ampm === 'PM' && hh < 12) hh += 12;
    if (ampm === 'AM' && hh === 12) hh = 0;
    let month = p1;
    let day = p2;
    if (p1 > 12 && p2 <= 12) {
      day = p1;
      month = p2;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return {
      date: `${yyyy}-${pad2(month)}-${pad2(day)}`,
      time: `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`
    };
  }

  // ISO style YYYY-MM-DD HH:mm[:ss]
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (isoMatch) {
    const time = isoMatch[4] !== undefined
      ? `${pad2(isoMatch[4])}:${pad2(isoMatch[5])}:${pad2(isoMatch[6] || 0)}`
      : '';
    return { date: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`, time };
  }

  // DD-MM-YYYY HH:mm[:ss]
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (dmyMatch) {
    return {
      date: `${dmyMatch[3]}-${pad2(dmyMatch[2])}-${pad2(dmyMatch[1])}`,
      time: `${pad2(dmyMatch[4])}:${pad2(dmyMatch[5])}:${pad2(dmyMatch[6] || 0)}`
    };
  }

  const onlyDate = parseExcelOrTextDate(str);
  if (onlyDate) return { date: onlyDate, time: '' };
  return null;
}

export function normalizeTimeString(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return '';
  return `${pad2(m[1])}:${pad2(m[2])}:${pad2(m[3] || 0)}`;
}

export function timeToSeconds(raw) {
  const norm = normalizeTimeString(raw);
  if (!norm) return null;
  const [hh, mm, ss] = norm.split(':').map(Number);
  return hh * 3600 + mm * 60 + ss;
}

export function isTimeAfter(hms, cutoffHms) {
  if (!hms || !cutoffHms) return false;
  return normalizeTimeString(hms) > normalizeTimeString(cutoffHms);
}

export function normalizeStaffAttendanceCode(raw = '') {
  const code = normKey(raw);
  if (!code) return '';
  if (code === 'M' || code === 'H' || code === 'H_LIBUR' || code === 'HADIR') return 'H';
  if (code === 'O' || code === 'OFF' || code === 'LIBUR') return 'L';
  if (code === 'SDR') return 'S';
  if (code === 'ITB' || code === 'BPJS') return 'I';
  if (code === 'CI') return 'CT';
  if (code === 'PC') return 'PA';
  if (STAFF_ATTENDANCE_CODE_ORDER.includes(code)) return code;
  if (code === 'PERLU_PEMERIKSAAN_HR' || code === '-') return code;
  return code;
}

export function computeSimpleHashHex(input = '') {
  const s = typeof input === 'string' ? input : JSON.stringify(input);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + (i & 255);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

function findHeaderRowIndex(rows, requiredPatterns) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const line = (Array.isArray(rows[i]) ? rows[i] : []).map(c => normKey(c)).join('|');
    if (requiredPatterns.every(rx => rx.test(line))) return i;
  }
  return -1;
}

export function parseLaporanTransaksiRows(aoa = []) {
  const idx = findHeaderRowIndex(aoa, [/NIK/, /NAMA/, /WAKTU/]);
  const start = idx >= 0 ? idx + 1 : 0;
  const header = idx >= 0 ? aoa[idx].map(normKey) : ['NO. ID', 'NIK', 'NAMA', 'WAKTU', 'STATUS', 'STATUS BARU', 'PENGECUALIAN', 'OPERASI'];
  const col = key => header.findIndex(h => h === key || h.includes(key));
  const cNoId = col('NO. ID');
  const cNik = col('NIK');
  const cNama = col('NAMA');
  const cWaktu = col('WAKTU');
  const cStatus = col('STATUS');
  const cStatusNew = col('STATUS BARU');
  const cExc = col('PENGECUALIAN');

  const parsed = [];
  for (let r = start; r < aoa.length; r++) {
    const row = aoa[r];
    if (!Array.isArray(row) || !row.some(v => String(v ?? '').trim() !== '')) continue;
    const rawTime = cWaktu >= 0 ? row[cWaktu] : row[3];
    const dt = parseAttendanceDateTime(rawTime);
    if (!dt) continue;
    const rawNik = String((cNik >= 0 ? row[cNik] : row[1]) ?? '').trim();
    const rawPin = String((cNoId >= 0 ? row[cNoId] : row[0]) ?? '').trim();
    const nama = String((cNama >= 0 ? row[cNama] : row[2]) ?? '').trim();
    const st = String((cStatus >= 0 ? row[cStatus] : row[4]) ?? '').trim();
    const stNew = String((cStatusNew >= 0 ? row[cStatusNew] : row[5]) ?? '').trim();
    const exc = String((cExc >= 0 ? row[cExc] : row[6]) ?? '').trim();
    const effective = (stNew || st).toLowerCase();
    const isOut = effective.includes('keluar') || effective.includes('out');
    parsed.push({
      source_type: 'mitra_transaksi',
      employee_no: rawNik || rawPin,
      machine_pin: rawPin,
      employee_name: nama,
      work_date: dt.date,
      punch_time: dt.time,
      direction: isOut ? 'OUT' : 'IN',
      raw_code: exc && exc.toUpperCase() !== 'OK' ? exc : (stNew || st || 'IN'),
      raw_payload: { st, stNew, exc }
    });
  }
  return parsed;
}

export function parseDataPresensiRows(aoa = []) {
  const idx = findHeaderRowIndex(aoa, [/NAMA/, /TGL\/WAKTU|WAKTU/]);
  const start = idx >= 0 ? idx + 1 : 0;
  const header = idx >= 0 ? aoa[idx].map(normKey) : ['DEPARTEMEN', 'NAMA', 'NO.ID', 'TGL/WAKTU', 'LOKASI ID', 'NO.PIN', 'KODE VERIFIKASI', 'NO.KARTU'];
  const col = rx => header.findIndex(h => rx.test(h));
  const cDept = col(/DEPARTEMEN/);
  const cNama = col(/^NAMA$/);
  const cNoId = col(/NO\.?ID/);
  const cWaktu = col(/TGL\/WAKTU|WAKTU/);
  const cPin = col(/NO\.?PIN/);

  const parsed = [];
  for (let r = start; r < aoa.length; r++) {
    const row = aoa[r];
    if (!Array.isArray(row) || !row.some(v => String(v ?? '').trim() !== '')) continue;
    const dt = parseAttendanceDateTime(cWaktu >= 0 ? row[cWaktu] : row[3]);
    if (!dt) continue;
    const rawPin = String((cNoId >= 0 ? row[cNoId] : row[2]) ?? '').trim();
    const empNik = String((cPin >= 0 ? row[cPin] : row[5]) ?? '').trim();
    const nama = String((cNama >= 0 ? row[cNama] : row[1]) ?? '').trim();
    const dept = String((cDept >= 0 ? row[cDept] : row[0]) ?? '').trim();
    parsed.push({
      source_type: 'mitra_presensi',
      employee_no: empNik || rawPin,
      machine_pin: rawPin,
      employee_name: nama,
      department: dept,
      work_date: dt.date,
      punch_time: dt.time,
      direction: dt.time >= '12:00:00' ? 'OUT' : 'IN',
      raw_code: 'M',
      raw_payload: { dept, rawPin, empNik }
    });
  }
  return parsed;
}

export function parseRadinAttendanceRows(aoa = []) {
  const idx = findHeaderRowIndex(aoa, [/EMPLOYEE ID/, /DATE/, /FULL NAME/]);
  const start = idx >= 0 ? idx + 1 : 0;
  const header = idx >= 0 ? aoa[idx].map(normKey) : [];
  const col = rx => header.findIndex(h => rx.test(h));
  const cId = idx >= 0 ? col(/EMPLOYEE ID/) : 0;
  const cDate = idx >= 0 ? col(/^DATE/) : 1;
  const cName = idx >= 0 ? col(/FULL NAME/) : 2;
  const cCode = idx >= 0 ? col(/ATTENDANCE CODE/) : 3;
  const cIn = idx >= 0 ? col(/^CHECK IN$/) : 4;
  const cOut = idx >= 0 ? col(/^CHECK OUT$/) : 5;
  const cOff = idx >= 0 ? col(/TIME OFF CODE/) : 12;
  const cOrg = idx >= 0 ? col(/ORGANIZATION/) : 17;

  const parsed = [];
  for (let r = start; r < aoa.length; r++) {
    const row = aoa[r];
    if (!Array.isArray(row) || !row.some(v => String(v ?? '').trim() !== '')) continue;
    const workDate = parseExcelOrTextDate(row[cDate >= 0 ? cDate : 1]);
    if (!workDate) continue;
    const nik = String(row[cId >= 0 ? cId : 0] ?? '').trim();
    const name = String(row[cName >= 0 ? cName : 2] ?? '').trim();
    const attCode = normKey(row[cCode >= 0 ? cCode : 3]) || 'H';
    const checkIn = normalizeTimeString(row[cIn >= 0 ? cIn : 4]);
    const checkOut = normalizeTimeString(row[cOut >= 0 ? cOut : 5]);
    const timeOffCode = normKey(row[cOff >= 0 ? cOff : 12]);
    const org = String(row[cOrg >= 0 ? cOrg : 17] ?? '').trim();
    parsed.push({
      source_type: 'radin_xlsx',
      employee_no: nik,
      employee_name: name,
      department: org,
      work_date: workDate,
      check_in: checkIn,
      check_out: checkOut,
      raw_code: timeOffCode || attCode || 'H',
      source_status: timeOffCode || (attCode === 'H' ? 'M' : attCode),
      raw_payload: { attCode, timeOffCode, org }
    });
  }
  return parsed;
}

export function buildAttendanceBatchResult({
  filename = 'upload.xlsx',
  sourceType = 'mitra_transaksi',
  rawPunches = [],
  existingEvents = [],
  employees = [],
  settings = DEFAULT_OPS_SETTINGS
}) {
  const cfg = normalizeOpsSettings(settings);
  const priorityList = cfg.attendance.sourcePriority;
  const priorityOf = src => {
    const i = priorityList.indexOf(src);
    return i >= 0 ? i + 1 : 9;
  };
  const empByNik = new Map();
  employees.forEach(e => {
    if (e?.employee_no) empByNik.set(compactNik(e.employee_no), e);
  });

  // Group raw punches by (employee_no + work_date)
  const dailyMap = new Map();
  const exceptions = [];

  for (const row of rawPunches) {
    const empKey = compactNik(row.employee_no || '');
    const emp = empByNik.get(empKey) || null;
    const displayNik = emp ? emp.employee_no : (row.employee_no || row.machine_pin || '');
    if (!row.work_date) {
      exceptions.push({
        employee_no: displayNik,
        employee_name: row.employee_name || '',
        work_date: '',
        reason: 'Format tanggal tidak valid'
      });
      continue;
    }

    const key = `${compactNik(displayNik)}|${row.work_date}|${sourceType}`;
    let entry = dailyMap.get(key);
    if (!entry) {
      const hasEmployeeMatch = Boolean(emp);
      const preJoin = emp?.join_date && row.work_date < emp.join_date;
      entry = {
        id: `ev-${computeSimpleHashHex(key)}`,
        source_type: sourceType,
        source_priority: priorityOf(sourceType),
        employee_no: displayNik,
        employee_name: emp?.full_name || row.employee_name || '',
        work_date: row.work_date,
        check_in: row.check_in || '',
        check_out: row.check_out || '',
        punches: [],
        raw_code: row.raw_code || 'M',
        source_status: row.source_status || row.raw_code || 'M',
        is_exception: !hasEmployeeMatch || Boolean(preJoin),
        exception_reason: !hasEmployeeMatch
          ? `NIK/PIN "${displayNik}" belum terdaftar di Employee Directory`
          : (preJoin ? `Absensi sebelum Tgl Masuk (${emp.join_date})` : ''),
        raw_payload: row.raw_payload || {}
      };
      dailyMap.set(key, entry);
    }

    const t = row.punch_time || row.check_in || '';
    if (t) entry.punches.push(t);
    if (row.check_out) entry.punches.push(row.check_out);
  }

  const existingFp = new Set(existingEvents.map(ev => ev.fingerprint).filter(Boolean));
  const accepted = [];
  let duplicateCount = 0;

  for (const ev of dailyMap.values()) {
    const times = [...new Set(ev.punches.filter(Boolean))].sort();
    if (!ev.check_in && times.length) ev.check_in = times[0];
    if (!ev.check_out && times.length > 1) ev.check_out = times[times.length - 1];
    delete ev.punches;

    ev.fingerprint = `${compactNik(ev.employee_no)}|${ev.work_date}|${ev.check_in || ev.raw_code || ''}`;
    if (existingFp.has(ev.fingerprint)) {
      duplicateCount++;
      continue;
    }
    existingFp.add(ev.fingerprint);
    if (ev.is_exception) {
      exceptions.push({
        employee_no: ev.employee_no,
        employee_name: ev.employee_name,
        work_date: ev.work_date,
        reason: ev.exception_reason
      });
    }
    accepted.push(ev);
  }

  const dates = accepted.map(a => a.work_date).filter(Boolean).sort();
  const batch = {
    id: `batch-${computeSimpleHashHex(`${filename}|${Date.now()}|${accepted.length}`)}`,
    source_type: sourceType,
    filename,
    file_hash: computeSimpleHashHex(JSON.stringify(rawPunches.slice(0, 200)) + filename),
    period_start: dates[0] || null,
    period_end: dates[dates.length - 1] || null,
    row_count: rawPunches.length,
    inserted_count: accepted.length,
    duplicate_count: duplicateCount,
    exception_count: exceptions.length,
    status: exceptions.length ? 'partial_exceptions' : 'completed',
    created_at: new Date().toISOString()
  };

  return { batch, accepted, duplicateCount, exceptions };
}

export function shiftIsoDate(isoDate = '2026-11-06', deltaDays = 0) {
  const baseMs = Date.parse(`${String(isoDate || '2026-11-06').slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(baseMs)) return '2026-11-06';
  const next = new Date(baseMs + Math.round(Number(deltaDays) || 0) * 86400000);
  return next.toISOString().slice(0, 10);
}

const ID_DAY_SHORTS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const ID_DAY_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const ID_MONTH_SHORTS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatShortIdDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const dow = d.getUTCDay();
  return `${ID_DAY_FULL[dow]}, ${pad2(d.getUTCDate())} ${ID_MONTH_SHORTS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function getWeeklyMealPeriodWindow(anchorDateIso = '2026-11-06', settings = DEFAULT_OPS_SETTINGS) {
  const cfg = normalizeOpsSettings(settings).attendance;
  const startDow = cfg.mealPeriodStartDay ?? 5; // Default 5 = Jumat
  const lengthDays = Math.max(1, cfg.mealPeriodLengthDays ?? 7);
  const cleanAnchor = /^\d{4}-\d{2}-\d{2}$/.test(String(anchorDateIso || '').trim())
    ? String(anchorDateIso).trim()
    : '2026-11-06';
  const anchorDow = new Date(`${cleanAnchor}T00:00:00Z`).getUTCDay();
  const backDays = (anchorDow - startDow + 7) % 7;
  const startDate = shiftIsoDate(cleanAnchor, -backDays);

  const dates = [];
  const dayMeta = [];
  for (let i = 0; i < lengthDays; i++) {
    const dateStr = shiftIsoDate(startDate, i);
    const d = new Date(`${dateStr}T00:00:00Z`);
    const dow = d.getUTCDay();
    dates.push(dateStr);
    dayMeta.push({
      dateStr,
      dayNum: d.getUTCDate(),
      monthNum: d.getUTCMonth() + 1,
      dow,
      dayShort: ID_DAY_SHORTS[dow],
      dayFull: ID_DAY_FULL[dow],
      isSunday: dow === 0
    });
  }
  const endDate = dates[dates.length - 1];
  return {
    startDate,
    endDate,
    dates,
    dayMeta,
    label: `${formatShortIdDate(startDate)} s/d ${formatShortIdDate(endDate)}`
  };
}

export function getStaffPayrollPeriodWindow(periodKey = '2026-11', settings = DEFAULT_OPS_SETTINGS) {
  const cfg = normalizeOpsSettings(settings).attendance;
  const match = String(periodKey || '').match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : 2026;
  const month = match ? Number(match[2]) : 11;
  const startMonth = month === 1 ? 12 : month - 1;
  const startYear = month === 1 ? year - 1 : year;
  const startDate = `${startYear}-${pad2(startMonth)}-${pad2(cfg.cutoffStartDay)}`;
  const endDate = `${year}-${pad2(month)}-${pad2(cfg.cutoffEndDay)}`;

  const dates = [];
  const dayMeta = [];
  const cur = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    const dow = cur.getUTCDay();
    dates.push(iso);
    dayMeta.push({
      dateStr: iso,
      dayNum: cur.getUTCDate(),
      monthNum: cur.getUTCMonth() + 1,
      dow,
      dayShort: ID_DAY_SHORTS[dow],
      isSunday: dow === 0
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return { periodKey: `${year}-${pad2(month)}`, startDate, endDate, dates, dayMeta };
}

export function processStaffAttendancePeriod({
  periodKey = '2026-11',
  employees = [],
  rawEvents = [],
  calendarDays = [],
  holidaySchedules = [],
  leaveBalances = [],
  existingReviews = [],
  mealOverrides = [],
  settings = DEFAULT_OPS_SETTINGS
}) {
  const cfg = normalizeOpsSettings(settings);
  const attCfg = cfg.attendance;
  const win = getStaffPayrollPeriodWindow(periodKey, cfg);
  const calByDate = new Map(calendarDays.map(c => [c.cal_date, c]));
  const reviewMap = new Map(
    existingReviews
      .filter(r => r && r.work_date && r.employee_no)
      .map(r => [`${compactNik(r.employee_no)}|${r.work_date}`, r])
  );
  const mealOvMap = new Map(
    mealOverrides
      .filter(m => m && m.work_date && m.employee_no)
      .map(m => [`${compactNik(m.employee_no)}|${m.work_date}`, m])
  );
  const leaveByNik = new Map(leaveBalances.map(l => [compactNik(l.employee_no), l]));
  const holidayScheduleSet = new Set(
    holidaySchedules.map(h => `${compactNik(h.employee_no)}|${h.work_date}`)
  );

  const eventMap = new Map();
  const priorityIndex = src => {
    const idx = attCfg.sourcePriority.indexOf(src);
    return idx >= 0 ? idx : 99;
  };
  for (const ev of rawEvents) {
    if (!ev.work_date || ev.work_date < win.startDate || ev.work_date > win.endDate) continue;
    const k = `${compactNik(ev.employee_no)}|${ev.work_date}`;
    const prev = eventMap.get(k);
    if (!prev || priorityIndex(ev.source_type) < priorityIndex(prev.source_type)) {
      eventMap.set(k, ev);
    }
  }

  const summaries = [];
  const dailyRecords = [];

  for (const emp of employees) {
    const nikKey = compactNik(emp.employee_no);
    const isDriver = /SOPIR|DRIVER/i.test(String(emp.position || '')) || /SOPIR|DRIVER/i.test(String(emp.department || ''));

    const counts = {
      H: 0,
      S: 0,
      I: 0,
      A: 0,
      T: 0,
      PA: 0,
      CT: 0,
      L: 0,
      DS: 0,
      PENDING: 0
    };
    let scheduledWorkDays = 0;
    const empDays = [];

    for (let di = 0; di < win.dates.length; di++) {
      const dateStr = win.dates[di];
      const meta = win.dayMeta[di];
      if (emp.join_date && dateStr < emp.join_date) {
        empDays.push({
          work_date: dateStr,
          dayNum: meta.dayNum,
          dayShort: meta.dayShort,
          isOffDay: false,
          isSunday: meta.isSunday,
          isHoliday: false,
          code: '-',
          locked: true,
          source_type: '',
          ruleFlags: [],
          note: 'Belum bergabung'
        });
        continue;
      }

      const cal = calByDate.get(dateStr);
      const dayOfWeek = meta.dow;
      const isWeekend = dayOfWeek === 0 || cal?.day_type === 'WEEKEND';
      const isHoliday = cal?.day_type === 'HOLIDAY' || cal?.day_type === 'CUTI_BERSAMA';
      const isScheduledHolidayWork = holidayScheduleSet.has(`${nikKey}|${dateStr}`);
      const isOffDay = isWeekend || (isHoliday && !isScheduledHolidayWork);

      const schedule = resolveStaffWorkSchedule(emp, dateStr, cfg);
      const ev = eventMap.get(`${nikKey}|${dateStr}`);
      const review = reviewMap.get(`${nikKey}|${dateStr}`);
      const mealOverride = mealOvMap.get(`${nikKey}|${dateStr}`) || null;

      const checkIn = ev?.check_in || '';
      const checkOut = ev?.check_out || '';
      const arrivalEval = checkIn
        ? evaluateStaffArrivalStatus({
            checkInTime: checkIn,
            scheduleStart: schedule.startTime,
            settings: cfg,
            manualMealOverride: mealOverride
          })
        : null;
      const departureEval = checkOut
        ? evaluateStaffDepartureStatus({
            checkOutTime: checkOut,
            scheduleEnd: schedule.endTime,
            settings: cfg
          })
        : null;

      const ruleFlags = [];
      const isLateByRule = !(isDriver && attCfg.exemptDriverLateFlag) && Boolean(arrivalEval?.isLate);
      const isEarlyByRule = !(isDriver && attCfg.exemptDriverLateFlag) && Boolean(departureEval?.isEarlyLeave);
      if (isLateByRule) ruleFlags.push('T');
      if (isEarlyByRule) ruleFlags.push('PA');

      let finalCode = '';
      let isConfirmed = false;
      let needsReview = false;

      if (attCfg.preserveConfirmedReviews && review?.is_confirmed && review.final_code) {
        finalCode = normalizeStaffAttendanceCode(review.final_code);
        isConfirmed = true;
      } else if (ev) {
        const rawNorm = normalizeStaffAttendanceCode(ev.source_status || ev.raw_code);
        if (['S', 'I', 'A', 'CT', 'L', 'DS'].includes(rawNorm)) {
          finalCode = rawNorm;
        } else if (checkIn || checkOut) {
          if (isOffDay) {
            finalCode = 'H';
          } else if (isLateByRule && isEarlyByRule) {
            finalCode = attCfg.lateAndEarlyPriority === 'PA' ? 'PA' : 'T';
          } else if (isLateByRule) {
            finalCode = 'T';
          } else if (isEarlyByRule) {
            finalCode = 'PA';
          } else {
            finalCode = 'H';
          }
        } else if (rawNorm === 'H') {
          finalCode = 'H';
        } else if (['T', 'PA'].includes(rawNorm)) {
          finalCode = rawNorm;
        } else {
          finalCode = attCfg.autoMarkNoPunchAs;
          needsReview = finalCode === 'PERLU_PEMERIKSAAN_HR';
        }
      } else if (review?.final_code) {
        finalCode = normalizeStaffAttendanceCode(review.final_code);
        isConfirmed = Boolean(review.is_confirmed);
      } else if (isOffDay) {
        finalCode = 'L';
      } else {
        finalCode = attCfg.autoMarkNoPunchAs;
        needsReview = finalCode === 'PERLU_PEMERIKSAAN_HR';
      }

      if (!isOffDay) scheduledWorkDays++;

      if (finalCode === 'PERLU_PEMERIKSAAN_HR') {
        counts.PENDING++;
      } else if (Object.prototype.hasOwnProperty.call(counts, finalCode)) {
        counts[finalCode]++;
      }

      const rec = {
        employee_no: emp.employee_no,
        work_date: dateStr,
        dayNum: meta.dayNum,
        dayShort: meta.dayShort,
        isOffDay,
        isSunday: meta.isSunday,
        isHoliday,
        check_in: checkIn,
        check_out: checkOut,
        scheduleStart: schedule.startTime,
        scheduleEnd: schedule.endTime,
        ruleFlags,
        getsMealAllowance: mealOverride
          ? Boolean(mealOverride.eligible)
          : (['H', 'T', 'PA'].includes(finalCode) && Boolean(arrivalEval?.getsMealAllowance)),
        mealOverridden: Boolean(mealOverride),
        raw_code: ev?.raw_code || '',
        code: finalCode,
        is_confirmed: isConfirmed,
        needs_review: needsReview,
        review_reason: review?.reason || '',
        source_type: ev?.source_type || (isOffDay ? 'calendar' : 'none')
      };
      empDays.push(rec);
      dailyRecords.push(rec);
    }

    const totalPresent = counts.H + counts.T + counts.PA + counts.DS;
    const totalHadir = Math.round((counts.H + counts.T + counts.PA + counts.DS + counts.CT) * 100) / 100;
    const absenPotong = counts.A;
    const totalPotonganHari = Math.round((absenPotong + counts.T * attCfg.latePenaltyWeight) * 100) / 100;
    const bobotKetidakhadiran = Math.round((absenPotong + counts.S + counts.I + counts.T * attCfg.latePenaltyWeight) * 100) / 100;
    const basis = scheduledWorkDays > 0 ? Math.min(scheduledWorkDays, attCfg.workingDaysBasis) : attCfg.workingDaysBasis;
    const effectivePaidDays = Math.min(attCfg.maxPaidDaysCap, Math.max(0, totalHadir - totalPotonganHari));
    const presencePct = basis > 0 ? Math.round((totalHadir / basis) * 10000) / 100 : 100;
    const absenceRatio = basis > 0 ? bobotKetidakhadiran / basis : 0;
    const evalStatus = absenceRatio > attCfg.warningAbsenceThreshold ? 'Perhatian / Surat Peringatan' : 'Baik';
    const leaveBal = leaveByNik.get(nikKey) || null;

    summaries.push({
      period_key: win.periodKey,
      employee_no: emp.employee_no,
      employee_name: emp.full_name,
      department: emp.department || '',
      position: emp.position || '',
      home_base: emp.home_base || 'PASURUAN',
      company_entity: normalizeCompanyEntity(emp.company_entity || 'MITRA'),
      is_driver: isDriver,
      scheduled_days: scheduledWorkDays,
      counts,
      totalPresent,
      totalHadir,
      absenPotong,
      totalPotonganHari,
      bobotKetidakhadiran,
      effectivePaidDays: Math.round(effectivePaidDays * 100) / 100,
      presencePct,
      evalStatus,
      remainingLeave: leaveBal ? leaveBal.remaining_leave : null,
      leaveCandidate: Boolean(counts.A > 0 && leaveBal && Number(leaveBal.remaining_leave) > 0),
      days: empDays
    });
  }

  return { window: win, summaries, dailyRecords };
}

export function processStaffMealAllowanceReport({
  anchorDateIso = '2026-11-06',
  employees = [],
  rawEvents = [],
  calendarDays = [],
  holidaySchedules = [],
  existingReviews = [],
  mealOverrides = [],
  settings = DEFAULT_OPS_SETTINGS
} = {}) {
  const cfg = normalizeOpsSettings(settings);
  const attCfg = cfg.attendance;
  const win = getWeeklyMealPeriodWindow(anchorDateIso, cfg);
  const dailyAmount = Math.round(Number(attCfg.mealAllowanceAmount || 0));

  const calByDate = new Map(calendarDays.map(c => [c.cal_date, c]));
  const reviewMap = new Map(
    existingReviews
      .filter(r => r && r.work_date && r.employee_no)
      .map(r => [`${compactNik(r.employee_no)}|${r.work_date}`, r])
  );
  const mealOvMap = new Map(
    mealOverrides
      .filter(m => m && m.work_date && m.employee_no)
      .map(m => [`${compactNik(m.employee_no)}|${m.work_date}`, m])
  );
  const holidayScheduleSet = new Set(
    holidaySchedules.map(h => `${compactNik(h.employee_no)}|${h.work_date}`)
  );

  const eventMap = new Map();
  const priorityIndex = src => {
    const idx = attCfg.sourcePriority.indexOf(src);
    return idx >= 0 ? idx : 99;
  };
  for (const ev of rawEvents) {
    if (!ev.work_date || ev.work_date < win.startDate || ev.work_date > win.endDate) continue;
    const k = `${compactNik(ev.employee_no)}|${ev.work_date}`;
    const prev = eventMap.get(k);
    if (!prev || priorityIndex(ev.source_type) < priorityIndex(prev.source_type)) {
      eventMap.set(k, ev);
    }
  }

  const dailyTotals = win.dates.map(dateStr => ({ dateStr, eligibleCount: 0, totalAmount: 0 }));
  const rows = [];
  let grandTotalEligibleDays = 0;
  let grandTotalAmount = 0;

  for (const emp of employees) {
    const nikKey = compactNik(emp.employee_no);
    const days = [];
    let empEligibleDays = 0;
    let empTotalAmount = 0;

    for (let di = 0; di < win.dates.length; di++) {
      const dateStr = win.dates[di];
      const meta = win.dayMeta[di];
      const cal = calByDate.get(dateStr);
      const isWeekend = meta.dow === 0 || cal?.day_type === 'WEEKEND';
      const isHoliday = cal?.day_type === 'HOLIDAY' || cal?.day_type === 'CUTI_BERSAMA';
      const isScheduledHolidayWork = holidayScheduleSet.has(`${nikKey}|${dateStr}`);
      const isOffDay = isWeekend || (isHoliday && !isScheduledHolidayWork);

      const schedule = resolveStaffWorkSchedule(emp, dateStr, cfg);
      const ev = eventMap.get(`${nikKey}|${dateStr}`);
      const review = reviewMap.get(`${nikKey}|${dateStr}`);
      const override = mealOvMap.get(`${nikKey}|${dateStr}`) || null;
      const checkIn = ev?.check_in || '';

      let attCode = '';
      if (attCfg.preserveConfirmedReviews && review?.is_confirmed && review.final_code) {
        attCode = normalizeStaffAttendanceCode(review.final_code);
      } else if (ev) {
        const rawNorm = normalizeStaffAttendanceCode(ev.source_status || ev.raw_code);
        if (['S', 'I', 'A', 'CT', 'L', 'DS'].includes(rawNorm)) attCode = rawNorm;
        else if (checkIn) attCode = 'H';
      } else if (review?.final_code) {
        attCode = normalizeStaffAttendanceCode(review.final_code);
      } else if (isOffDay) {
        attCode = 'L';
      }

      let eligible = false;
      let overridden = false;
      let reason = '';

      if (emp.join_date && dateStr < emp.join_date) {
        eligible = false;
        reason = 'Belum bergabung';
      } else if (override && typeof override.eligible === 'boolean') {
        eligible = override.eligible;
        overridden = true;
        reason = override.reason || (eligible ? 'Override Manual: Dapat' : 'Override Manual: Tidak Dapat');
      } else if (['S', 'I', 'A', 'CT', 'DS'].includes(attCode)) {
        eligible = false;
        reason = `Status ${attCode}`;
      } else if (attCode === 'L' && !checkIn) {
        eligible = false;
        reason = 'Libur';
      } else if (checkIn) {
        const arrival = evaluateStaffArrivalStatus({
          checkInTime: checkIn,
          scheduleStart: schedule.startTime,
          settings: cfg
        });
        eligible = arrival.getsMealAllowance;
        reason = arrival.mealReason;
      } else if (attCode === 'H' && attCfg.mealAutoOnManualHadir) {
        eligible = true;
        reason = 'Hadir Manual (H)';
      } else {
        eligible = false;
        reason = isOffDay ? 'Libur' : 'Tidak ada jam masuk';
      }

      const amount = eligible ? dailyAmount : 0;
      if (eligible) {
        empEligibleDays++;
        empTotalAmount += amount;
        dailyTotals[di].eligibleCount++;
        dailyTotals[di].totalAmount += amount;
      }

      days.push({
        work_date: dateStr,
        dayShort: meta.dayShort,
        dayNum: meta.dayNum,
        isOffDay,
        check_in: checkIn,
        scheduleStart: schedule.startTime,
        attCode: attCode || (isOffDay ? 'L' : ''),
        eligible,
        amount,
        overridden,
        reason
      });
    }

    grandTotalEligibleDays += empEligibleDays;
    grandTotalAmount += empTotalAmount;

    rows.push({
      employee_no: emp.employee_no,
      employee_name: emp.full_name,
      department: emp.department || '',
      home_base: emp.home_base || 'PASURUAN',
      company_entity: normalizeCompanyEntity(emp.company_entity || 'MITRA'),
      days,
      totalEligibleDays: empEligibleDays,
      totalAmount: empTotalAmount
    });
  }

  return {
    window: win,
    dailyAmount,
    rows,
    dailyTotals,
    grandTotalEligibleDays,
    grandTotalAmount
  };
}

export function computeEmployeeDirectoryDelta(incomingRows = [], existingEmployees = []) {
  const existingByNik = new Map(existingEmployees.map(e => [compactNik(e.employee_no), e]));
  const incomingKeys = new Set();
  const compareFields = [
    'full_name',
    'department',
    'position',
    'employment_status',
    'join_date',
    'contract_start_date',
    'contract_end_date',
    'address',
    'phone',
    'home_base',
    'company_entity'
  ];

  const items = [];
  let newCount = 0;
  let changedCount = 0;
  let unchangedCount = 0;
  let conflictCount = 0;

  for (const row of incomingRows) {
    const nikKey = compactNik(row.employee_no || '');
    if (!nikKey) continue;
    if (incomingKeys.has(nikKey)) {
      conflictCount++;
      items.push({
        kind: 'conflict',
        employee_no: row.employee_no,
        full_name: row.full_name,
        reason: 'NIK duplikat di file snapshot baru',
        diffs: [],
        incoming: row,
        existing: existingByNik.get(nikKey) || null
      });
      continue;
    }
    incomingKeys.add(nikKey);
    const existing = existingByNik.get(nikKey);
    if (!existing) {
      newCount++;
      items.push({
        kind: 'new',
        employee_no: row.employee_no,
        full_name: row.full_name,
        reason: 'Karyawan baru di snapshot',
        diffs: compareFields.filter(f => row[f]).map(f => ({ field: f, from: '', to: row[f] })),
        incoming: row,
        existing: null
      });
      continue;
    }

    const diffs = [];
    for (const f of compareFields) {
      let a = String(existing[f] ?? '').trim();
      let b = String(row[f] ?? '').trim();
      if (f === 'home_base') {
        a = normalizeHomeBase(a || 'PASURUAN');
        b = normalizeHomeBase(b || 'PASURUAN');
      } else if (f === 'company_entity') {
        a = normalizeCompanyEntity(a || 'MITRA');
        b = normalizeCompanyEntity(b || 'MITRA');
      }
      if (a !== b) diffs.push({ field: f, from: a, to: b });
    }
    if (diffs.length) {
      changedCount++;
      items.push({
        kind: 'changed',
        employee_no: row.employee_no,
        full_name: row.full_name,
        reason: `${diffs.length} kolom berubah`,
        diffs,
        incoming: row,
        existing
      });
    } else {
      unchangedCount++;
      items.push({
        kind: 'unchanged',
        employee_no: row.employee_no,
        full_name: row.full_name,
        reason: 'Identik',
        diffs: [],
        incoming: row,
        existing
      });
    }
  }

  let notFoundCount = 0;
  for (const ex of existingEmployees) {
    const key = compactNik(ex.employee_no);
    if (key && !incomingKeys.has(key)) {
      notFoundCount++;
      items.push({
        kind: 'not_found',
        employee_no: ex.employee_no,
        full_name: ex.full_name,
        reason: 'Tidak ada pada snapshot terbaru (mungkin resign / tidak diekspor)',
        diffs: [],
        incoming: null,
        existing: ex
      });
    }
  }

  return {
    items,
    summary: { newCount, changedCount, unchangedCount, conflictCount, notFoundCount }
  };
}

export function parseCutiSpreadsheetRows(aoa = [], employees = [], settings = DEFAULT_OPS_SETTINGS, sheet = null) {
  const cfg = normalizeOpsSettings(settings).cuti;
  const headerIdx = findHeaderRowIndex(aoa, [/NAMA/, /CUTI/]);
  const start = headerIdx >= 0 ? headerIdx + 2 : 2;
  const empByName = new Map(employees.map(e => [normKey(e.full_name), e]));
  const rows = [];
  const errors = [];
  let seenNumericNo = false;

  for (let i = start; i < aoa.length; i++) {
    const r = aoa[i];
    if (!Array.isArray(r) || !r[1]) continue;
    const rawName = String(r[1] || '').trim();
    if (!rawName || /^JUMLAH|^TOTAL/i.test(rawName)) continue;

    if (Number.isFinite(Number(r[0])) && String(r[0] ?? '').trim() !== '') {
      seenNumericNo = true;
    }

    // Detect spreadsheet formula errors (#REF! etc.) both from string values, SheetJS cell metadata, or blank No column
    const rowNum = i + 1;
    const sheetHasErr = sheet
      ? ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'].some(col => {
        const cell = sheet[`${col}${rowNum}`];
        return cell && (cell.t === 'e' || /^#(REF|VALUE|NAME|DIV|N\/A)/i.test(String(cell.w || cell.v || '')));
      })
      : false;
    const rowHasRefErr = sheetHasErr
      || r.some(cell => typeof cell === 'string' && /^#(REF|VALUE|NAME|DIV|N\/A)!/i.test(cell.trim()))
      || (seenNumericNo && String(r[0] ?? '').trim() === '');
    if (rowHasRefErr) {
      errors.push(`Baris ${rowNum} (${rawName}) mengandung error Excel (#REF!), nilai dihitung ulang bersih oleh sistem.`);
    }

    const emp = empByName.get(normKey(rawName)) || null;
    const joinDate = parseExcelOrTextDate(r[3]);
    const renewalDate = parseExcelOrTextDate(r[15]);
    const annualQuota = Number.isFinite(Number(r[5])) ? Number(r[5]) : cfg.defaultAnnualQuota;
    const bersama = Number.isFinite(Number(r[6])) ? Number(r[6]) : cfg.cutiBersamaDeduction;

    const diambilDates = [];
    for (let c = 8; c <= 13; c++) {
      const parsedCt = parseExcelOrTextDate(r[c]);
      if (parsedCt) diambilDates.push(parsedCt);
    }

    const remaining = Math.max(0, annualQuota - bersama - diambilDates.length);
    rows.push({
      id: `cuti-imp-${i}`,
      employee_no: emp?.employee_no || '',
      employee_name: rawName,
      pt_entity: emp ? normalizeCompanyEntity(emp.company_entity) : normalizeCompanyEntity(r[2] || 'MITRA'),
      join_date: joinDate,
      period_label: String(r[16] || '').trim(),
      annual_quota: annualQuota,
      cuti_bersama_used: bersama,
      diambil_dates: diambilDates,
      pending_dates: [],
      remaining_leave: remaining,
      renewal_date: renewalDate,
      unmatched_employee: !emp
    });
  }

  return { rows, errors };
}

export function evaluateCutiConfirmationGate(leaveRow, referenceDateIso = '2026-11-23', settings = DEFAULT_OPS_SETTINGS) {
  const cfg = normalizeOpsSettings(settings).cuti;
  if (!cfg.enableConfirmationGate || !leaveRow?.renewal_date) {
    return { requiresConfirmation: false, daysUntilRenewal: null };
  }
  const refMs = Date.parse(`${referenceDateIso}T00:00:00Z`);
  const renMs = Date.parse(`${leaveRow.renewal_date}T00:00:00Z`);
  if (!Number.isFinite(refMs) || !Number.isFinite(renMs)) {
    return { requiresConfirmation: false, daysUntilRenewal: null };
  }
  const days = Math.round((renMs - refMs) / 86400000);
  const requiresConfirmation = days <= cfg.confirmationDaysThreshold;
  return { requiresConfirmation, daysUntilRenewal: days };
}

export function addMinutesToScheduleCutoff(hhmm = '07:30', thresholdMinutes = 1) {
  const m = String(hhmm || '07:30').trim().match(/^(\d{1,2}):(\d{2})/);
  const baseMin = m ? (Number(m[1]) * 60 + Number(m[2])) : (7 * 60 + 30);
  const offset = Math.max(0, Math.round(Number(thresholdMinutes) || 0) - 1);
  const totalMin = Math.min(23 * 60 + 59, baseMin + offset);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${pad2(hh)}:${pad2(mm)}:59`;
}

export function resolveStaffWorkSchedule(emp = {}, workDate = '2026-11-02', settings = DEFAULT_OPS_SETTINGS) {
  const cfg = normalizeOpsSettings(settings);
  const ws = cfg.attendance.workSchedules;
  const dow = workDate ? new Date(`${workDate}T00:00:00Z`).getUTCDay() : 1;
  const isSaturday = dow === 6;
  const isSunday = dow === 0;
  const nikKey = compactNik(emp?.employee_no || '');
  const nameKey = normKey(emp?.full_name || '');
  const isReholz = isReholzCompanyEntity(emp?.company_entity || '') ||
    /RADIN|REHOLZ/.test(String(emp?.department || '').toUpperCase());

  // 1. PT Radin Mitra Lestari (ReHolz) — holds phase 2 regardless of Pasuruan / Surabaya station
  if (isReholz) {
    return {
      ruleSource: 'radin_hold',
      homeBase: 'PT RADIN MITRA LESTARI (REHOLZ)',
      isSunday,
      isSaturday,
      startTime: '08:00',
      endTime: isSaturday ? '12:00' : '17:00',
      note: ws.radinPolicy.notes
    };
  }

  // 2. Manual per-employee exception takes top priority for PT MBM Staff
  const manual = (ws.manualExceptions || []).find(ex =>
    (ex.employee_no && compactNik(ex.employee_no) === nikKey) ||
    (ex.full_name && normKey(ex.full_name) === nameKey)
  );
  if (manual) {
    return {
      ruleSource: 'manual_exception',
      homeBase: manual.homeBase || 'Pengecualian Manual',
      isSunday,
      isSaturday,
      startTime: isSaturday ? manual.saturdayStart : manual.weekdayStart,
      endTime: isSaturday ? manual.saturdayEnd : manual.weekdayEnd,
      note: manual.reason || 'Pengecualian manual jadwal staff'
    };
  }

  // 3. Kiln Dry MMD per-person schedule
  const kiln = (ws.kilnDryPersonnel || []).find(k =>
    (k.employee_no && compactNik(k.employee_no) === nikKey) ||
    (k.full_name && normKey(k.full_name) === nameKey)
  );
  if (kiln) {
    return {
      ruleSource: 'kiln_dry_mmd',
      homeBase: 'Kiln Dry (MMD)',
      isSunday,
      isSaturday,
      startTime: isSaturday ? kiln.saturdayStart : kiln.weekdayStart,
      endTime: isSaturday ? kiln.saturdayEnd : kiln.weekdayEnd,
      note: kiln.notes || 'Jadwal Khusus Kiln Dry'
    };
  }

  // 4. Surabaya & Jakarta vs Pasuruan Home Base (PT. Mitra Binamandiri Makmur)
  const canonHomeBase = normalizeHomeBase(emp?.home_base || '');
  const isSbyJkt = canonHomeBase === 'SURABAYA' || canonHomeBase === 'JAKARTA' ||
    /SURABAYA|\bSBY\b|JAKARTA|\bJKT\b/.test(`${emp?.position || ''} ${emp?.address || ''}`.toUpperCase());
  const block = isSbyJkt ? ws.surabayaJakarta : ws.pasuruan;
  return {
    ruleSource: isSbyJkt ? 'surabaya_jakarta' : 'pasuruan',
    homeBase: block.label,
    isSunday,
    isSaturday,
    startTime: isSaturday ? block.saturdayStart : block.weekdayStart,
    endTime: isSaturday ? block.saturdayEnd : block.weekdayEnd,
    note: ''
  };
}

export function evaluateStaffDepartureStatus({
  checkOutTime = '',
  scheduleEnd = '17:00',
  settings = DEFAULT_OPS_SETTINGS
} = {}) {
  const cfg = normalizeOpsSettings(settings).attendance;
  const normOut = normalizeTimeString(checkOutTime);
  const endSec = timeToSeconds(scheduleEnd);
  if (!normOut || endSec === null) {
    return { hasPunch: false, isEarlyLeave: false, code: '' };
  }
  const outSec = timeToSeconds(normOut);
  const thrSec = Math.max(0, Math.round(Number(cfg.earlyLeaveThresholdMinutes ?? 1))) * 60;
  const isEarlyLeave = thrSec === 0 ? (outSec < endSec) : (outSec <= endSec - thrSec);
  return {
    hasPunch: true,
    isEarlyLeave,
    code: isEarlyLeave ? 'PA' : 'H',
    earlyCutoffSec: endSec - thrSec
  };
}

export function evaluateStaffArrivalStatus({
  checkInTime = '',
  scheduleStart = '07:30',
  settings = DEFAULT_OPS_SETTINGS,
  manualMealOverride = null // null | { eligible: boolean, reason: string }
} = {}) {
  const cfg = normalizeOpsSettings(settings).attendance;
  const normIn = normalizeTimeString(checkInTime);
  const lateCutoff = addMinutesToScheduleCutoff(scheduleStart, cfg.lateThresholdMinutes);
  const mealCutoff = addMinutesToScheduleCutoff(scheduleStart, cfg.mealThresholdMinutes);

  if (!normIn) {
    return {
      hasPunch: false,
      isLate: false,
      code: 'PENDING',
      lateCutoff,
      mealCutoff,
      getsMealAllowance: manualMealOverride ? Boolean(manualMealOverride.eligible) : false,
      mealOverridden: Boolean(manualMealOverride),
      mealReason: manualMealOverride?.reason || 'Belum ada jam masuk'
    };
  }

  const isLate = isTimeAfter(normIn, lateCutoff);
  const autoMeal = !isTimeAfter(normIn, mealCutoff);
  const getsMealAllowance = manualMealOverride && typeof manualMealOverride.eligible === 'boolean'
    ? manualMealOverride.eligible
    : autoMeal;

  return {
    hasPunch: true,
    isLate,
    code: isLate ? 'T' : 'H',
    lateCutoff,
    mealCutoff,
    getsMealAllowance,
    mealOverridden: Boolean(manualMealOverride),
    mealReason: manualMealOverride?.reason || (autoMeal ? `Tap <= ${mealCutoff} (Dapat Uang Makan)` : `Tap > ${mealCutoff} (Tidak Dapat Uang Makan)`)
  };
}

export function getIndonesianNationalHolidaysPreset(year = 2026) {
  const y = Number(year) || 2026;
  const presets = {
    2026: [
      { cal_date: '2026-01-01', day_type: 'HOLIDAY', label: 'Tahun Baru 2026 Masehi', notes: 'Libur Nasional' },
      { cal_date: '2026-01-16', day_type: 'HOLIDAY', label: 'Isra Mikraj Nabi Muhammad SAW', notes: 'Libur Nasional' },
      { cal_date: '2026-02-17', day_type: 'HOLIDAY', label: 'Tahun Baru Imlek 2577 Kongzili', notes: 'Libur Nasional' },
      { cal_date: '2026-03-19', day_type: 'HOLIDAY', label: 'Hari Suci Nyepi (Tahun Baru Saka 1948)', notes: 'Libur Nasional' },
      { cal_date: '2026-03-20', day_type: 'HOLIDAY', label: 'Hari Raya Idul Fitri 1447 H (Hari 1)', notes: 'Libur Nasional' },
      { cal_date: '2026-03-21', day_type: 'HOLIDAY', label: 'Hari Raya Idul Fitri 1447 H (Hari 2)', notes: 'Libur Nasional' },
      { cal_date: '2026-04-03', day_type: 'HOLIDAY', label: 'Wafat Yesus Kristus', notes: 'Libur Nasional' },
      { cal_date: '2026-05-01', day_type: 'HOLIDAY', label: 'Hari Buruh Internasional', notes: 'Libur Nasional' },
      { cal_date: '2026-05-14', day_type: 'HOLIDAY', label: 'Kenaikan Yesus Kristus', notes: 'Libur Nasional' },
      { cal_date: '2026-05-27', day_type: 'HOLIDAY', label: 'Hari Raya Idul Adha 1447 H', notes: 'Libur Nasional' },
      { cal_date: '2026-05-31', day_type: 'HOLIDAY', label: 'Hari Raya Waisak 2570 BE', notes: 'Libur Nasional' },
      { cal_date: '2026-06-01', day_type: 'HOLIDAY', label: 'Hari Lahir Pancasila', notes: 'Libur Nasional' },
      { cal_date: '2026-06-16', day_type: 'HOLIDAY', label: '1 Muharam Tahun Baru Islam 1448 H', notes: 'Libur Nasional' },
      { cal_date: '2026-08-17', day_type: 'HOLIDAY', label: 'Proklamasi Kemerdekaan RI', notes: 'Libur Nasional' },
      { cal_date: '2026-08-25', day_type: 'HOLIDAY', label: 'Maulid Nabi Muhammad SAW', notes: 'Libur Nasional' },
      { cal_date: '2026-12-25', day_type: 'HOLIDAY', label: 'Kelahiran Yesus Kristus (Natal)', notes: 'Libur Nasional' }
    ]
  };
  if (presets[y]) return presets[y];
  return [
    { cal_date: `${y}-01-01`, day_type: 'HOLIDAY', label: `Tahun Baru ${y} Masehi`, notes: 'Libur Nasional' },
    { cal_date: `${y}-05-01`, day_type: 'HOLIDAY', label: 'Hari Buruh Internasional', notes: 'Libur Nasional' },
    { cal_date: `${y}-06-01`, day_type: 'HOLIDAY', label: 'Hari Lahir Pancasila', notes: 'Libur Nasional' },
    { cal_date: `${y}-08-17`, day_type: 'HOLIDAY', label: 'Proklamasi Kemerdekaan RI', notes: 'Libur Nasional' },
    { cal_date: `${y}-12-25`, day_type: 'HOLIDAY', label: 'Hari Raya Natal', notes: 'Libur Nasional' }
  ];
}

export function parseHolidayImportRows(aoa = []) {
  if (!Array.isArray(aoa) || !aoa.length) return [];
  const headerIdx = findHeaderRowIndex(aoa, [/TANGGAL|DATE/, /KETERANGAN|NAMA|LIBUR|LABEL/]);
  const start = headerIdx >= 0 ? headerIdx + 1 : 0;
  const header = headerIdx >= 0 ? aoa[headerIdx].map(normKey) : [];
  const findCol = rx => (header.length ? header.findIndex(h => rx.test(h)) : -1);
  const cDate = findCol(/TANGGAL|DATE/);
  const cLabel = findCol(/KETERANGAN|NAMA|LIBUR|LABEL/);
  const cType = findCol(/JENIS|TIPE|TYPE/);
  const cNotes = findCol(/ALASAN|CATATAN|NOTE/);

  const rows = [];
  for (let i = start; i < aoa.length; i++) {
    const r = aoa[i];
    if (!Array.isArray(r) || !r.some(v => String(v ?? '').trim() !== '')) continue;
    const rawDate = cDate >= 0 ? r[cDate] : r[0];
    const calDate = parseExcelOrTextDate(rawDate);
    if (!calDate) continue;
    const label = String((cLabel >= 0 ? r[cLabel] : r[1]) ?? '').trim();
    const rawType = normKey(cType >= 0 ? r[cType] : (r[2] || 'HOLIDAY'));
    let dayType = 'HOLIDAY';
    if (/CUTI/.test(rawType)) dayType = 'CUTI_BERSAMA';
    else if (/WEEKEND|MINGGU/.test(rawType)) dayType = 'WEEKEND';
    else if (/WORKING|KERJA|NORMAL/.test(rawType)) dayType = 'WORKING';
    const notes = String((cNotes >= 0 ? r[cNotes] : r[3]) ?? '').trim() || 'Import Hari Besar Nasional';
    rows.push({
      cal_date: calDate,
      day_type: dayType,
      label: label || 'Hari Besar Nasional',
      notes
    });
  }
  return rows;
}

