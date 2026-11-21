// Pure business logic helpers for HR&GA Workspace (unit-tested via node:test)

export const PIN_REVEAL_PASSWORD = '8karakterH!';

export const EMPLOYEE_TABLE_HEADERS = [
  'Nama',
  'Nik',
  'Departement',
  'Tgl Masuk',
  'Jabatan',
  'Mulai Kontrak',
  'Kontrak Berakhir',
  'Alamat',
  'Nik2',
  'Tempat Lahir',
  'Tanggal Lahir',
  'No. Telp',
  'Status',
  'Pendidikan',
  'Jenis Kelamin',
  'Agama'
];

export const INTERVIEW_STAGES = [
  'HR 1',
  'HR 2',
  'User 1',
  'User 2',
  'Final Interview'
];

export const INTERVIEW_STAGE_LABELS = {
  'HR 1': 'Interview HR 1',
  'HR 2': 'Interview HR 2',
  'User 1': 'Interview User 1',
  'User 2': 'Interview User 2',
  'Final Interview': 'Final Interview'
};

export const INTERVIEW_DECISIONS = [
  'Direkomendasikan',
  'Dipertimbangkan',
  'Tidak Direkomendasikan'
];

export const FINAL_INTERVIEW_DECISIONS = [
  'Diterima',
  'Ditolak',
  'Kirim Ke OS'
];

export const FINAL_REJECTION_REASONS = [
  'Technical',
  'Salary',
  'Other'
];

export const CONTRACT_DURATION_OPTIONS = [
  { months: 3, label: '3 Bulan' },
  { months: 4, label: '4 Bulan' },
  { months: 5, label: '5 Bulan' },
  { months: 6, label: '6 Bulan' },
  { months: 7, label: '7 Bulan' },
  { months: 8, label: '8 Bulan' },
  { months: 9, label: '9 Bulan' },
  { months: 10, label: '10 Bulan' },
  { months: 11, label: '11 Bulan' },
  { months: 12, label: '1 Tahun (12 Bulan)' }
];

export const DEFAULT_INTERVIEW_PICS = {
  'HR 1': { name: 'Samsul Haiyadi', fallbackDisplay: 'Samsul Haiyadi' },
  'HR 2': { name: 'Diana Anita Sari', fallbackDisplay: 'Diana Anita Sari' }
};

export const LEAD_RECOMMENDATION_OPTIONS = [
  'Belum Ditentukan',
  'Direkomendasikan',
  'Tidak Direkomendasikan'
];

const ID_MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export function normalizeLoginIdentifier(value = '') {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

export function normalizeDisplayNik(value = '') {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function validateLoginIdentifier(value = '') {
  const raw = String(value ?? '').trim();
  if (raw.length < 3 || raw.length > 40) return false;
  return /^[A-Za-z0-9][A-Za-z0-9 ._-]{2,39}$/.test(raw);
}

export function validatePin(value = '') {
  return /^\d{4,12}$/.test(String(value ?? '').trim());
}

export function verifyPinRevealPassword(input = '') {
  return String(input ?? '') === PIN_REVEAL_PASSWORD;
}

export function maskPin(pin = '') {
  const len = Math.max(4, Math.min(12, String(pin || '').length || 4));
  return '•'.repeat(len);
}

export function formatIndonesianDateLong(isoDate = '') {
  const match = String(isoDate ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${day} ${ID_MONTHS_LONG[month - 1]} ${year}`;
}

export function formatDmyDash(isoDate = '') {
  const raw = String(isoDate ?? '').trim();
  if (!raw || raw === '-') return '-';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function calculateContractDates(startDateIso = '', durationMonths = 12) {
  const match = String(startDateIso ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const months = Number(durationMonths);
  if (!match || !Number.isInteger(months) || months < 3 || months > 12) {
    return null;
  }
  const startYear = Number(match[1]);
  const startMonth = Number(match[2]) - 1;
  const startDay = Number(match[3]);
  const startUtc = new Date(Date.UTC(startYear, startMonth, startDay));
  if (
    startUtc.getUTCFullYear() !== startYear ||
    startUtc.getUTCMonth() !== startMonth ||
    startUtc.getUTCDate() !== startDay
  ) {
    return null;
  }

  // Add N calendar months while clamping day-of-month, then subtract 1 day.
  // Example: 2026-03-17 + 12 months - 1 day = 2027-03-16.
  const targetMonthIndex = startMonth + months;
  const targetYear = startYear + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(startDay, lastDayOfTargetMonth);
  const endUtc = new Date(Date.UTC(targetYear, targetMonth, clampedDay));
  endUtc.setUTCDate(endUtc.getUTCDate() - 1);

  const endIso = `${endUtc.getUTCFullYear()}-${String(endUtc.getUTCMonth() + 1).padStart(2, '0')}-${String(endUtc.getUTCDate()).padStart(2, '0')}`;
  const startLabel = formatIndonesianDateLong(startDateIso);
  const endLabel = formatIndonesianDateLong(endIso);
  return {
    startIso: startDateIso,
    endIso,
    months,
    displayRange: `${startLabel} - ${endLabel}`
  };
}

export function buildDuplicateCandidatePayload(applicant, newPosition) {
  if (!applicant || !applicant.id) {
    throw new Error('Data kandidat sumber tidak valid.');
  }
  const nextPosition = String(newPosition ?? '').trim();
  const currentPosition = String(applicant.position || applicant.application_data?.posisi || '').trim();
  if (!nextPosition) {
    throw new Error('Pilih posisi baru untuk duplikasi kandidat.');
  }
  if (nextPosition.toLocaleLowerCase('id') === currentPosition.toLocaleLowerCase('id')) {
    throw new Error('Posisi duplikasi harus berbeda dari posisi kandidat sebelumnya.');
  }
  const sourceData = { ...(applicant.application_data || {}) };
  delete sourceData.ktp_foto;
  sourceData.posisi = nextPosition;
  sourceData.nama = applicant.full_name || sourceData.nama || '';
  sourceData.nik = applicant.nik || sourceData.nik || '';
  sourceData.__duplicated_from_id = applicant.id;
  sourceData.__duplicated_from_position = currentPosition;

  return {
    full_name: String(applicant.full_name || sourceData.nama || '').trim(),
    nik: String(applicant.nik || sourceData.nik || '').trim(),
    position: nextPosition,
    stage: 'application_submitted',
    application_data: sourceData,
    cv_path: applicant.cv_path || null,
    ktp_path: applicant.ktp_path || null,
    background_check_status: 'pending',
    disc_invited: false,
    duplicated_from: applicant.id
  };
}

export function getLatestInterviewsByStage(interviews = []) {
  const byStage = {};
  for (const stage of INTERVIEW_STAGES) {
    byStage[stage] = null;
  }
  const sorted = [...(interviews || [])].sort((a, b) => {
    const timeA = Date.parse(a.updated_at || a.created_at || '') || 0;
    const timeB = Date.parse(b.updated_at || b.created_at || '') || 0;
    return timeB - timeA;
  });
  for (const row of sorted) {
    if (byStage[row.interview_stage] === null) {
      byStage[row.interview_stage] = row;
    }
  }
  return byStage;
}

export function deriveCandidateProgress(applicant, candidateInterviews = [], employeeRecord = null) {
  if (employeeRecord || applicant?.stage === 'hired') {
    return { label: 'Diterima · Karyawan', tone: 'green', stageKey: 'hired' };
  }
  const byStage = getLatestInterviewsByStage(candidateInterviews);
  const finalInt = byStage['Final Interview'];
  if (finalInt) {
    if (finalInt.decision === 'Diterima') return { label: 'Diterima · Karyawan', tone: 'green', stageKey: 'hired' };
    if (finalInt.decision === 'Ditolak') return { label: 'Final Interview · Ditolak', tone: 'gray', stageKey: 'rejected' };
    if (finalInt.decision === 'Kirim Ke OS') return { label: 'Final Interview · Kirim Ke OS', tone: 'gold', stageKey: 'os' };
  }
  if (applicant?.stage === 'rejected') {
    return { label: 'Tidak Dilanjutkan', tone: 'gray', stageKey: 'rejected' };
  }
  const activeStageOrder = ['User 2', 'User 1', 'HR 2', 'HR 1'];
  for (const stageName of activeStageOrder) {
    const item = byStage[stageName];
    if (item) {
      const tone = item.decision === 'Direkomendasikan'
        ? 'green'
        : item.decision === 'Tidak Direkomendasikan'
          ? 'gray'
          : 'gold';
      return {
        label: `Interview ${stageName} · ${item.decision || 'Proses'}`,
        tone,
        stageKey: stageName
      };
    }
  }
  const hasDisc = Boolean(
    (Array.isArray(applicant?.disc_submissions) ? applicant.disc_submissions[0] : applicant?.disc_submissions) ||
    applicant?.stage === 'disc_completed'
  );
  if (hasDisc) {
    return { label: 'DISC Selesai', tone: 'green', stageKey: 'disc_completed' };
  }
  if (applicant?.stage === 'stage4_pending') {
    return { label: 'Proses Interview', tone: 'gold', stageKey: 'stage4_pending' };
  }
  if (applicant?.stage === 'application_submitted') {
    return { label: 'Formulir Masuk', tone: 'blue', stageKey: 'application_submitted' };
  }
  return { label: 'Lead Register', tone: 'gray', stageKey: 'stage1_pending' };
}

export function findDefaultInterviewer(stage, employees = []) {
  const def = DEFAULT_INTERVIEW_PICS[stage];
  if (!def) return null;
  const target = def.name.toLowerCase();
  const match = (employees || []).find(emp => {
    const empName = String(emp.full_name || emp.applicant?.full_name || '').toLowerCase();
    return empName.includes(target);
  });
  if (match) {
    return {
      employeeId: match.id,
      nik: match.employee_no || '',
      name: match.full_name || def.name
    };
  }
  return {
    employeeId: '',
    nik: '',
    name: def.fallbackDisplay
  };
}

export function parseSpreadsheetDateToIso(raw) {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
    const d = String(raw.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 1000 && raw < 100000) {
    // Excel serial date (epoch 1899-12-30)
    const utcMs = Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000;
    const dt = new Date(utcMs);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }
  const str = String(raw).trim();
  if (!str || str === '-' || str === '—') return null;
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }
  return null;
}

function normalizeHeaderKey(key = '') {
  return String(key ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.\s_-]+/g, '');
}

const EMPLOYEE_HEADER_MAP = {
  nama: 'full_name',
  namalengkap: 'full_name',
  nik: 'employee_no',
  nokaryawan: 'employee_no',
  nomorkaryawan: 'employee_no',
  departement: 'department',
  departemen: 'department',
  tglmasuk: 'join_date',
  tanggalmasuk: 'join_date',
  jabatan: 'position',
  posisi: 'position',
  mulaikontrak: 'contract_start_date',
  kontrakberakhir: 'contract_end_date',
  alamat: 'address',
  nik2: 'ktp_nik',
  nikktp: 'ktp_nik',
  noktp: 'ktp_nik',
  tempatlahir: 'birth_place',
  tanggallahir: 'birth_date',
  tgllahir: 'birth_date',
  notelp: 'phone',
  telepon: 'phone',
  hp: 'phone',
  status: 'employment_status',
  statuskaryawan: 'employment_status',
  pendidikan: 'education',
  jeniskelamin: 'gender',
  kelamin: 'gender',
  agama: 'religion'
};

export function normalizeEmploymentStatus(value = '') {
  const upper = String(value ?? '').trim().toUpperCase();
  if (!upper) return 'KONTRAK';
  if (['TETAP', 'KONTRAK', 'HARIAN', 'PROBATION', 'AKTIF', 'NONAKTIF'].includes(upper)) {
    return upper;
  }
  return upper.slice(0, 30);
}

export function parseEmployeeSpreadsheetRows(rawRows = []) {
  const parsed = [];
  const errors = [];

  (rawRows || []).forEach((row, index) => {
    const mapped = {};
    for (const [rawKey, rawValue] of Object.entries(row || {})) {
      const target = EMPLOYEE_HEADER_MAP[normalizeHeaderKey(rawKey)];
      if (target) mapped[target] = rawValue;
    }
    const fullName = String(mapped.full_name ?? '').trim();
    const employeeNo = normalizeDisplayNik(mapped.employee_no ?? '');
    if (!fullName && !employeeNo) return;
    if (!employeeNo) {
      errors.push(`Baris ${index + 2}: kolom Nik wajib diisi (${fullName || 'tanpa nama'}).`);
      return;
    }
    if (!fullName) {
      errors.push(`Baris ${index + 2}: kolom Nama wajib diisi (Nik ${employeeNo}).`);
      return;
    }
    const ktpNikRaw = String(mapped.ktp_nik ?? '').replace(/\D/g, '');
    parsed.push({
      full_name: fullName,
      employee_no: employeeNo,
      department: String(mapped.department ?? '').trim(),
      join_date: parseSpreadsheetDateToIso(mapped.join_date),
      position: String(mapped.position ?? '').trim(),
      contract_start_date: parseSpreadsheetDateToIso(mapped.contract_start_date),
      contract_end_date: parseSpreadsheetDateToIso(mapped.contract_end_date),
      address: String(mapped.address ?? '').trim(),
      ktp_nik: ktpNikRaw || String(mapped.ktp_nik ?? '').trim(),
      birth_place: String(mapped.birth_place ?? '').trim(),
      birth_date: parseSpreadsheetDateToIso(mapped.birth_date),
      phone: String(mapped.phone ?? '').trim(),
      employment_status: normalizeEmploymentStatus(mapped.employment_status),
      education: String(mapped.education ?? '').trim(),
      gender: String(mapped.gender ?? '').trim(),
      religion: String(mapped.religion ?? '').trim()
    });
  });

  return { rows: parsed, errors };
}

export function formatEmployeeExportRow(employee, applicant = null) {
  const appData = applicant?.application_data || {};
  const genderRaw = employee.gender || appData.gender || '';
  const genderLabel = genderRaw === 'L' ? 'Laki-laki' : genderRaw === 'P' ? 'Perempuan' : genderRaw;
  return {
    Nama: employee.full_name || applicant?.full_name || appData.nama || '',
    Nik: employee.employee_no || '',
    Departement: employee.department || '',
    'Tgl Masuk': formatDmyDash(employee.join_date || ''),
    Jabatan: employee.position || applicant?.position || '',
    'Mulai Kontrak': formatDmyDash(employee.contract_start_date || ''),
    'Kontrak Berakhir': formatDmyDash(employee.contract_end_date || ''),
    Alamat: employee.address || appData.alamat_asal || appData.domisili || '',
    Nik2: employee.ktp_nik || applicant?.nik || appData.nik || '',
    'Tempat Lahir': employee.birth_place || appData.tempat_lahir || '',
    'Tanggal Lahir': formatDmyDash(employee.birth_date || appData.tanggal_lahir || ''),
    'No. Telp': employee.phone || appData.telepon || '',
    Status: employee.employment_status || '',
    Pendidikan: employee.education || appData.pendidikan_terakhir || '',
    'Jenis Kelamin': genderLabel,
    Agama: employee.religion || appData.agama || ''
  };
}
