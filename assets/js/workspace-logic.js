// Pure business logic helpers for HR&GA Workspace (unit-tested via node:test)
import { computeDisc } from './disc-engine.js?v=20261124-hrga-workspace-19';

const DISC_RESULT_CACHE = new WeakMap();

export function getMemoizedDiscResult(disc, computeFn = computeDisc) {
  if (!disc || !Array.isArray(disc.answers) || disc.answers.length !== 24) return null;
  const cached = DISC_RESULT_CACHE.get(disc);
  if (cached && cached.answersRef === disc.answers) {
    return cached.result;
  }
  let result = null;
  try {
    result = computeFn(disc.answers);
  } catch {
    result = null;
  }
  DISC_RESULT_CACHE.set(disc, { answersRef: disc.answers, result });
  return result;
}

export const PIN_REVEAL_PASSWORD = '8karakterH!';

export function normalizeCompanyEntity(value = '') {
  const upper = String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!upper) return 'MITRA';
  if (upper.includes('REHOLZ') || upper.includes('RADIN') || upper === 'RML') return 'REHOLZ';
  return 'MITRA';
}

export function isReholzCompanyEntity(value = '') {
  const upper = String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  return upper.includes('REHOLZ') || upper.includes('RADIN') || upper === 'RML';
}

export function formatCompanyEntityName(value = '') {
  return normalizeCompanyEntity(value) === 'REHOLZ'
    ? 'PT Radin Mitra Lestari'
    : 'PT. Mitra Binamandiri Makmur';
}

export function resolveCompanyMasterIdFromEntity(value = '') {
  return normalizeCompanyEntity(value) === 'REHOLZ' ? 'comp-rml' : 'comp-mbm';
}

export function normalizeHomeBase(value = '') {
  const upper = String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!upper) return 'PASURUAN';
  if (upper === 'SBY' || upper.includes('SURABAYA')) return 'SURABAYA';
  if (upper === 'JKT' || upper.includes('JAKARTA')) return 'JAKARTA';
  if (upper.includes('KILN')) return 'KILN DRY';
  if (upper.includes('PASURUAN')) return 'PASURUAN';
  return upper;
}

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
  'Agama',
  'Home Base',
  'Perusahaan'
];

export const EMPLOYEE_UI_HEADERS = [
  'Name',
  'Employee NIK',
  'Department',
  'Join Date',
  'Position',
  'Contract Start',
  'Contract End',
  'Address',
  'ID Card NIK',
  'Birth Place',
  'Birth Date',
  'Phone No.',
  'Status',
  'Education',
  'Gender',
  'Religion',
  'Home Base',
  'Company'
];

export const INVITE_SOURCES = [
  'Jobstreet',
  'Glints',
  'LinkedIn',
  'Pintarnya',
  'Threads',
  'Instagram',
  'Facebook',
  'WhatsApp Channel',
  'Other',
  'Walk In'
];

export const INVITE_STATUSES = [
  'Responded',
  'No Response'
];

export const INTERVIEW_STAGES = [
  'HR 1',
  'HR 2',
  'User 1',
  'User 2',
  'Final Interview'
];

export const INTERVIEW_STAGE_LABELS = {
  'HR 1': 'HR Interview 1',
  'HR 2': 'HR Interview 2',
  'User 1': 'User Interview 1',
  'User 2': 'User Interview 2',
  'Final Interview': 'Final Interview'
};

export const INTERVIEW_DECISIONS = [
  'Recommended',
  'Considered',
  'Not Recommended'
];

export const FINAL_INTERVIEW_DECISIONS = [
  'Accepted',
  'Rejected',
  'Holded',
  'Sent to OS'
];

export const FINAL_REJECTION_REASONS = [
  'Technical',
  'Salary',
  'Other'
];

export const CONTRACT_DURATION_OPTIONS = [
  { months: 3, label: '3 Months' },
  { months: 4, label: '4 Months' },
  { months: 5, label: '5 Months' },
  { months: 6, label: '6 Months' },
  { months: 7, label: '7 Months' },
  { months: 8, label: '8 Months' },
  { months: 9, label: '9 Months' },
  { months: 10, label: '10 Months' },
  { months: 11, label: '11 Months' },
  { months: 12, label: '1 Year (12 Months)' }
];

export const DEFAULT_INTERVIEW_PICS = {
  'HR 1': { name: 'Samsul Hariyadi' },
  'HR 2': { name: 'Diana Anita Sari' }
};

export const LEAD_RECOMMENDATION_OPTIONS = [
  'Pending',
  'Recommended',
  'Not Recommended'
];

const EN_MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function normalizeInterviewDecision(value = '') {
  const raw = String(value ?? '').trim();
  const key = raw.toLowerCase();
  if (!key) return '';
  if (key === 'direkomendasikan' || key === 'recommended') return 'Recommended';
  if (key === 'dipertimbangkan' || key === 'considered') return 'Considered';
  if (key === 'tidak direkomendasikan' || key === 'not recommended') return 'Not Recommended';
  if (key === 'diterima' || key === 'accepted') return 'Accepted';
  if (key === 'ditolak' || key === 'rejected') return 'Rejected';
  if (key === 'hold' || key === 'holded' || key === 'ditunda') return 'Holded';
  if (key === 'kirim ke os' || key === 'sent to os') return 'Sent to OS';
  return raw;
}

export function normalizeLeadRecommendation(value = '') {
  const raw = String(value ?? '').trim();
  const key = raw.toLowerCase();
  if (!key || key === 'belum ditentukan' || key === 'pending') return 'Pending';
  if (key === 'direkomendasikan' || key === 'recommended') return 'Recommended';
  if (key === 'tidak direkomendasikan' || key === 'not recommended') return 'Not Recommended';
  return raw;
}

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

export function isRootAdminAccount(profile = {}) {
  const {
    username = '',
    employeeNik = '',
    displayName = '',
    isRootAdmin = false,
    is_root_admin = false
  } = profile || {};
  if (isRootAdmin || is_root_admin) return true;
  const normUser = normalizeLoginIdentifier(username);
  const normNik = normalizeLoginIdentifier(employeeNik);
  const normDisplay = String(displayName ?? '').trim().toLowerCase();
  return normUser === 'admin' || normNik === 'admin' || normDisplay === 'administrator';
}

export function buildEmployeeUserOptionLabel(emp = {}) {
  const nik = String(emp.employee_no || '').trim();
  const name = String(emp.full_name || '').trim();
  const roleMeta = String(emp.position || emp.department || '').trim();
  const base = nik && name ? `${nik} — ${name}` : name || nik || 'Employee';
  return roleMeta ? `${base} (${roleMeta})` : base;
}

export function formatEnglishDateLong(isoDate = '') {
  const match = String(isoDate ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${day} ${EN_MONTHS_LONG[month - 1]} ${year}`;
}

export function formatIndonesianDateLong(isoDate = '') {
  return formatEnglishDateLong(isoDate);
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
  const startLabel = formatEnglishDateLong(startDateIso);
  const endLabel = formatEnglishDateLong(endIso);
  return {
    startIso: startDateIso,
    endIso,
    months,
    displayRange: `${startLabel} - ${endLabel}`
  };
}

export function normalizeNikKey(value = '') {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length >= 8) return digits;
  const trimmed = String(value ?? '').trim().toLowerCase();
  return trimmed.length >= 6 ? trimmed : '';
}

export function extractDirectDisc(applicant) {
  if (!applicant) return null;
  return (Array.isArray(applicant.disc_submissions)
    ? applicant.disc_submissions[0]
    : applicant.disc_submissions) || null;
}

export function buildWorkspaceIndexes({
  applicants = [],
  employees = [],
  interviews = [],
  invitedCandidates = [],
  stage1Leads = []
} = {}) {
  const applicantById = new Map();
  const applicantOrder = new Map();
  const applicantsByNik = new Map();
  const applicantsByDuplicatedFrom = new Map();
  const applicantsByPhone = new Map();
  const applicantsByName = new Map();

  const pushMap = (map, key, val) => {
    if (!key) return;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = [];
      map.set(key, bucket);
    }
    bucket.push(val);
  };

  (applicants || []).forEach((app, idx) => {
    if (!app) return;
    applicantOrder.set(app, idx);
    if (app.id) applicantById.set(app.id, app);
    const nikKey = normalizeNikKey(app.nik || app.application_data?.nik);
    if (nikKey) pushMap(applicantsByNik, nikKey, app);
    if (app.duplicated_from) pushMap(applicantsByDuplicatedFrom, app.duplicated_from, app);
    if (app.stage !== 'stage1_pending') {
      const phoneKey = normalizePhoneDigits(app.application_data?.telepon);
      if (phoneKey) pushMap(applicantsByPhone, phoneKey, app);
      const nameKey = normalizePersonName(app.full_name || app.application_data?.nama);
      if (nameKey) pushMap(applicantsByName, nameKey, app);
    }
  });

  const employeeByApplicantId = new Map();
  const employeeByNik = new Map();
  (employees || []).forEach(emp => {
    if (!emp) return;
    if (emp.applicant_id && !employeeByApplicantId.has(emp.applicant_id)) {
      employeeByApplicantId.set(emp.applicant_id, emp);
    }
    const ktpNik = normalizeNikKey(emp.ktp_nik || emp.applicant?.nik);
    if (ktpNik && !employeeByNik.has(ktpNik)) {
      employeeByNik.set(ktpNik, emp);
    }
  });

  const interviewsByApplicantId = new Map();
  const interviewsByStage1Id = new Map();
  const interviewsByNik = new Map();
  (interviews || []).forEach(row => {
    if (!row) return;
    if (row.applicant_id) pushMap(interviewsByApplicantId, row.applicant_id, row);
    if (row.stage1_id) pushMap(interviewsByStage1Id, row.stage1_id, row);
    const nikKey = normalizeNikKey(row.candidate_nik);
    if (nikKey) pushMap(interviewsByNik, nikKey, row);
  });

  const inviteByApplicantId = new Map();
  const inviteByStage1Id = new Map();
  (invitedCandidates || []).forEach(inv => {
    if (!inv) return;
    if (inv.linked_applicant_id && !inviteByApplicantId.has(inv.linked_applicant_id)) {
      inviteByApplicantId.set(inv.linked_applicant_id, inv);
    }
    if (inv.linked_stage1_id && !inviteByStage1Id.has(inv.linked_stage1_id)) {
      inviteByStage1Id.set(inv.linked_stage1_id, inv);
    }
  });

  const stage1ById = new Map();
  (stage1Leads || []).forEach(lead => {
    if (lead?.id) stage1ById.set(lead.id, lead);
  });

  return {
    applicantById,
    applicantOrder,
    applicantsByNik,
    applicantsByDuplicatedFrom,
    applicantsByPhone,
    applicantsByName,
    employeeByApplicantId,
    employeeByNik,
    interviewsByApplicantId,
    interviewsByStage1Id,
    interviewsByNik,
    inviteByApplicantId,
    inviteByStage1Id,
    stage1ById
  };
}

export function collectSiblingApplicants(applicant, applicants = [], indexes = null) {
  if (!applicant) return [];
  const targetNik = normalizeNikKey(applicant.nik || applicant.application_data?.nik);
  const directLinks = new Set([applicant.id, applicant.duplicated_from].filter(Boolean));
  const seen = new Set();
  const result = [];
  const pushUnique = item => {
    if (!item || (item.id && seen.has(item.id))) return;
    if (item.id) seen.add(item.id);
    result.push(item);
  };
  pushUnique(applicant);

  if (indexes) {
    if (targetNik) {
      for (const cand of (indexes.applicantsByNik.get(targetNik) || [])) {
        if (cand.id !== applicant.id) pushUnique(cand);
      }
    }
    if (applicant.duplicated_from) {
      const parent = indexes.applicantById.get(applicant.duplicated_from);
      if (parent && parent.id !== applicant.id) pushUnique(parent);
      for (const cand of (indexes.applicantsByDuplicatedFrom.get(applicant.duplicated_from) || [])) {
        if (cand.id !== applicant.id) pushUnique(cand);
      }
    }
    if (applicant.id) {
      for (const cand of (indexes.applicantsByDuplicatedFrom.get(applicant.id) || [])) {
        if (cand.id !== applicant.id) pushUnique(cand);
      }
    }
    return result;
  }

  for (const cand of (applicants || [])) {
    if (!cand || cand.id === applicant.id) continue;
    const candNik = normalizeNikKey(cand.nik || cand.application_data?.nik);
    const sameNik = Boolean(targetNik && candNik && candNik === targetNik);
    const linkedChain = Boolean(
      (cand.id && directLinks.has(cand.id)) ||
      (cand.duplicated_from && directLinks.has(cand.duplicated_from)) ||
      (cand.duplicated_from && applicant.id && cand.duplicated_from === applicant.id)
    );
    if (sameNik || linkedChain) {
      pushUnique(cand);
    }
  }
  return result;
}

export function resolveSharedDiscForApplicant(applicant, applicants = [], indexes = null) {
  const direct = extractDirectDisc(applicant);
  if (direct && (Array.isArray(direct.answers) ? direct.answers.length === 24 : true)) {
    return direct;
  }
  const siblings = collectSiblingApplicants(applicant, applicants, indexes);
  let fallback = direct;
  for (const sib of siblings) {
    if (sib === applicant) continue;
    const disc = extractDirectDisc(sib);
    if (!disc) continue;
    if (Array.isArray(disc.answers) && disc.answers.length === 24) {
      return disc;
    }
    if (!fallback) fallback = disc;
  }
  return fallback || null;
}

export function resolveSharedInterviewsForApplicant(applicant, applicants = [], interviews = [], indexes = null) {
  if (!applicant && !interviews?.length) return [];
  const siblings = collectSiblingApplicants(applicant, applicants, indexes);
  const siblingIds = new Set(siblings.map(s => s.id).filter(Boolean));
  if (applicant?.id) siblingIds.add(applicant.id);
  const targetNik = normalizeNikKey(applicant?.nik || applicant?.application_data?.nik);

  let matching;
  if (indexes) {
    const matchedSet = new Set();
    for (const sid of siblingIds) {
      for (const row of (indexes.interviewsByApplicantId.get(sid) || [])) {
        matchedSet.add(row);
      }
    }
    if (targetNik) {
      for (const row of (indexes.interviewsByNik.get(targetNik) || [])) {
        matchedSet.add(row);
      }
    }
    matching = [...matchedSet];
  } else {
    matching = (interviews || []).filter(row => {
      if (!row) return false;
      if (row.applicant_id && siblingIds.has(row.applicant_id)) return true;
      if (targetNik && normalizeNikKey(row.candidate_nik) === targetNik) return true;
      return false;
    });
  }

  if (!matching.length) return [];

  const direct = matching.filter(row => row.applicant_id === applicant?.id);
  const siblingOnly = matching.filter(row => row.applicant_id !== applicant?.id);

  // Per interview stage, prefer direct records on this applicant; fill missing stages from sibling NIK records.
  const directByStage = getLatestInterviewsByStage(direct);
  const siblingByStage = getLatestInterviewsByStage(siblingOnly);

  const combined = [...direct];
  for (const stage of INTERVIEW_STAGES) {
    if (!directByStage[stage] && siblingByStage[stage]) {
      combined.push(siblingByStage[stage]);
    }
  }
  return combined;
}

export function buildDuplicateCandidatePayload(applicant, newPosition, applicants = []) {
  if (!applicant || !applicant.id) {
    throw new Error('Invalid source candidate record.');
  }
  const nextPosition = String(newPosition ?? '').trim();
  const currentPosition = String(applicant.position || applicant.application_data?.posisi || '').trim();
  if (!nextPosition) {
    throw new Error('Please select a new target position for duplication.');
  }
  if (nextPosition.toLowerCase() === currentPosition.toLowerCase()) {
    throw new Error('New position must be different from the current candidate position.');
  }
  const sourceData = { ...(applicant.application_data || {}) };
  delete sourceData.ktp_foto;
  sourceData.posisi = nextPosition;
  sourceData.nama = applicant.full_name || sourceData.nama || '';
  sourceData.nik = applicant.nik || sourceData.nik || '';
  sourceData.__duplicated_from_id = applicant.id;
  sourceData.__duplicated_from_position = currentPosition;

  const resolvedDisc = resolveSharedDiscForApplicant(applicant, applicants);
  const hasDisc = Boolean(resolvedDisc?.answers);
  const rawStage = applicant.stage || 'application_submitted';
  let preservedStage = rawStage;
  if (rawStage === 'hired') {
    preservedStage = 'stage4_pending';
  } else if (hasDisc && rawStage === 'application_submitted') {
    preservedStage = 'disc_completed';
  }

  return {
    full_name: String(applicant.full_name || sourceData.nama || '').trim(),
    nik: String(applicant.nik || sourceData.nik || '').trim(),
    position: nextPosition,
    stage: preservedStage,
    application_data: sourceData,
    cv_path: applicant.cv_path || null,
    ktp_path: applicant.ktp_path || null,
    background_check_status: applicant.background_check_status || 'pending',
    disc_invited: Boolean(applicant.disc_invited || hasDisc),
    duplicated_from: applicant.id
  };
}

export function buildDuplicatedDiscPayload(sourceDisc, targetApplicantId) {
  if (!targetApplicantId || !sourceDisc || !Array.isArray(sourceDisc.answers) || sourceDisc.answers.length !== 24) {
    return null;
  }
  return {
    applicant_id: targetApplicantId,
    answers: sourceDisc.answers.map(a => ({ ...a })),
    completed_at: sourceDisc.completed_at || new Date().toISOString()
  };
}

export function buildDuplicatedInterviewPayloads(sourceInterviews = [], targetApplicant, createdBy = null) {
  if (!targetApplicant?.id || !Array.isArray(sourceInterviews) || !sourceInterviews.length) {
    return [];
  }
  return sourceInterviews.map(row => ({
    source_type: 'applicant',
    applicant_id: targetApplicant.id,
    stage1_id: null,
    candidate_name: targetApplicant.full_name || row.candidate_name || '',
    candidate_nik: targetApplicant.nik || row.candidate_nik || '',
    candidate_whatsapp: targetApplicant.application_data?.telepon || row.candidate_whatsapp || '',
    applied_position: targetApplicant.position || row.applied_position || '',
    interview_stage: row.interview_stage,
    interview_date: row.interview_date || (row.created_at ? String(row.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10)),
    pic_employee_id: row.pic_employee_id || null,
    pic_nik: row.pic_nik || '',
    pic_name: row.pic_name || '',
    notes: row.notes || '',
    decision: normalizeInterviewDecision(row.decision),
    rejection_reason_category: row.rejection_reason_category || '',
    rejection_reason_detail: row.rejection_reason_detail || '',
    work_start_date: row.work_start_date || null,
    salary: row.salary ?? null,
    contract_duration_months: row.contract_duration_months ?? null,
    contract_start_date: row.contract_start_date || null,
    contract_end_date: row.contract_end_date || null,
    official_position: row.official_position || '',
    assigned_nik: row.assigned_nik || '',
    contract_number: row.contract_number || '',
    created_by: createdBy || row.created_by || null,
    updated_at: new Date().toISOString()
  }));
}

export function buildDuplicatedInvitePayload(sourceInvite, targetApplicant, createdBy = null) {
  if (!sourceInvite || !targetApplicant?.id) return null;
  return {
    invite_date: sourceInvite.invite_date || new Date().toISOString().slice(0, 10),
    candidate_name: targetApplicant.full_name || sourceInvite.candidate_name || '',
    applied_position: targetApplicant.position || sourceInvite.applied_position || '',
    source: sourceInvite.source || 'Other',
    status: 'Responded',
    linked_applicant_id: targetApplicant.id,
    linked_stage1_id: sourceInvite.linked_stage1_id || null,
    notes: sourceInvite.notes || '',
    created_by: createdBy || null,
    updated_at: new Date().toISOString()
  };
}

export function getLatestInterviewsByStage(interviews = []) {
  const byStage = {};
  for (const stage of INTERVIEW_STAGES) {
    byStage[stage] = null;
  }
  const sorted = [...(interviews || [])].sort((a, b) => {
    const timeA = Date.parse(a.updated_at || a.interview_date || a.created_at || '') || 0;
    const timeB = Date.parse(b.updated_at || b.interview_date || b.created_at || '') || 0;
    return timeB - timeA;
  });
  for (const row of sorted) {
    if (byStage[row.interview_stage] === null) {
      byStage[row.interview_stage] = {
        ...row,
        decision: normalizeInterviewDecision(row.decision)
      };
    }
  }
  return byStage;
}

export function deriveCandidateProgress(applicant, candidateInterviews = [], employeeRecord = null, stage1Lead = null, options = {}) {
  if (employeeRecord || applicant?.stage === 'hired') {
    return { label: 'Hired · Employee', tone: 'green', stageKey: 'hired' };
  }
  const byStage = getLatestInterviewsByStage(candidateInterviews);
  const finalInt = byStage['Final Interview'];
  if (finalInt) {
    const dec = normalizeInterviewDecision(finalInt.decision);
    if (dec === 'Accepted') return { label: 'Hired · Employee', tone: 'green', stageKey: 'hired' };
    if (dec === 'Rejected') return { label: 'Final Interview · Rejected', tone: 'gray', stageKey: 'rejected' };
    if (dec === 'Holded') return { label: 'Final Interview · Holded', tone: 'gold', stageKey: 'holded' };
    if (dec === 'Sent to OS') return { label: 'Final Interview · Sent to OS', tone: 'gold', stageKey: 'os' };
  }
  if (applicant?.stage === 'rejected') {
    return { label: 'Not Proceeding', tone: 'gray', stageKey: 'rejected' };
  }
  const activeStageOrder = ['User 2', 'User 1', 'HR 2', 'HR 1'];
  for (const stageName of activeStageOrder) {
    const item = byStage[stageName];
    if (item) {
      const dec = normalizeInterviewDecision(item.decision);
      const tone = dec === 'Recommended'
        ? 'green'
        : dec === 'Not Recommended'
          ? 'gray'
          : 'gold';
      return {
        label: `${stageName} Interview · ${dec || 'In Progress'}`,
        tone,
        stageKey: stageName
      };
    }
  }
  const sharedDisc = options?.sharedDisc || (
    options?.indexes
      ? resolveSharedDiscForApplicant(applicant, options?.applicants || [], options.indexes)
      : (Array.isArray(options?.applicants)
          ? resolveSharedDiscForApplicant(applicant, options.applicants)
          : extractDirectDisc(applicant))
  );
  const hasDisc = Boolean(sharedDisc || applicant?.stage === 'disc_completed');
  if (hasDisc) {
    return { label: 'DISC Completed', tone: 'green', stageKey: 'disc_completed' };
  }
  if (applicant?.stage === 'stage4_pending') {
    return { label: 'Interview In Progress', tone: 'gold', stageKey: 'stage4_pending' };
  }
  if (applicant?.stage === 'application_submitted') {
    return { label: 'Form Submitted', tone: 'blue', stageKey: 'application_submitted' };
  }
  if (stage1Lead) {
    const rec = normalizeLeadRecommendation(stage1Lead.recommendation);
    if (rec === 'Recommended') {
      return { label: 'Lead Register · Recommended', tone: 'blue', stageKey: 'stage1_pending' };
    }
    if (rec === 'Not Recommended') {
      return { label: 'Lead Register · Not Recommended', tone: 'gray', stageKey: 'stage1_pending' };
    }
    return { label: 'Lead Register · Pending', tone: 'gray', stageKey: 'stage1_pending' };
  }
  return { label: 'Lead Register', tone: 'gray', stageKey: 'stage1_pending' };
}

function normalizePhoneDigits(phone = '') {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-9) : '';
}

function normalizePersonName(name = '') {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function findMatchingApplicantForLead(lead, { applicants = [], interviews = [], invitedCandidates = [], indexes = null } = {}) {
  if (!lead) return null;
  if (indexes) {
    const invMatch = indexes.inviteByStage1Id.get(lead.id);
    if (invMatch?.linked_applicant_id) {
      const app = indexes.applicantById.get(invMatch.linked_applicant_id);
      if (app) return app;
    }
    const intList = indexes.interviewsByStage1Id.get(lead.id) || [];
    for (const row of intList) {
      if (row.applicant_id) {
        const app = indexes.applicantById.get(row.applicant_id);
        if (app) return app;
      }
    }
    const leadPhone = normalizePhoneDigits(lead.whatsapp);
    const leadName = normalizePersonName(lead.full_name);
    const leadPos = String(lead.position || '').trim().toLowerCase();

    const phoneCandidates = leadPhone ? (indexes.applicantsByPhone.get(leadPhone) || []) : [];
    const nameCandidates = leadName ? (indexes.applicantsByName.get(leadName) || []) : [];
    if (!phoneCandidates.length && !nameCandidates.length) return null;

    const matchSet = new Set([...phoneCandidates, ...nameCandidates]);
    const matches = [...matchSet].sort((a, b) => (indexes.applicantOrder.get(a) ?? 0) - (indexes.applicantOrder.get(b) ?? 0));
    const exactPos = matches.find(a => String(a.position || '').trim().toLowerCase() === leadPos);
    return exactPos || matches[0] || null;
  }

  const invMatch = (invitedCandidates || []).find(inv => inv.linked_stage1_id === lead.id && inv.linked_applicant_id);
  if (invMatch) {
    const app = applicants.find(a => a.id === invMatch.linked_applicant_id);
    if (app) return app;
  }
  const intMatch = (interviews || []).find(i => i.stage1_id === lead.id && i.applicant_id);
  if (intMatch) {
    const app = applicants.find(a => a.id === intMatch.applicant_id);
    if (app) return app;
  }
  const leadPhone = normalizePhoneDigits(lead.whatsapp);
  const leadName = normalizePersonName(lead.full_name);
  const leadPos = String(lead.position || '').trim().toLowerCase();

  const matches = (applicants || []).filter(a => {
    if (a.stage === 'stage1_pending') return false;
    const appPhone = normalizePhoneDigits(a.application_data?.telepon);
    const appName = normalizePersonName(a.full_name || a.application_data?.nama);
    if (leadPhone && appPhone && leadPhone === appPhone) return true;
    return Boolean(leadName && appName && leadName === appName);
  });
  if (!matches.length) return null;
  const exactPos = matches.find(a => String(a.position || '').trim().toLowerCase() === leadPos);
  return exactPos || matches[0];
}

export function resolveLeadUnifiedStatus(lead, { applicants = [], interviews = [], employees = [], invitedCandidates = [], indexes = null } = {}) {
  const linkedApplicant = findMatchingApplicantForLead(lead, { applicants, interviews, invitedCandidates, indexes });
  const stage1Ints = indexes
    ? (indexes.interviewsByStage1Id.get(lead?.id) || [])
    : (interviews || []).filter(i => i.stage1_id === lead?.id);
  const appInts = linkedApplicant ? resolveSharedInterviewsForApplicant(linkedApplicant, applicants, interviews, indexes) : [];
  const mergedMap = new Map();
  [...stage1Ints, ...appInts].forEach(i => {
    mergedMap.set(i.id || `${i.interview_stage}:${i.updated_at || i.created_at}`, i);
  });
  const emp = linkedApplicant
    ? ((Array.isArray(linkedApplicant.employees) ? linkedApplicant.employees[0] : linkedApplicant.employees) ||
        (indexes
          ? (indexes.employeeByApplicantId.get(linkedApplicant.id) || null)
          : (employees || []).find(e => e.applicant_id === linkedApplicant.id)) || null)
    : null;
  const progress = deriveCandidateProgress(
    linkedApplicant || { stage: 'stage1_pending' },
    [...mergedMap.values()],
    emp,
    lead,
    { applicants, indexes }
  );
  return { ...progress, linkedApplicant };
}

export function buildInvitedCandidatesViewRows({ manualInvites = [], applicants = [], stage1Leads = [], indexes = null } = {}) {
  const idx = indexes || buildWorkspaceIndexes({ applicants, invitedCandidates: manualInvites, stage1Leads });
  const linkedIds = new Set();
  const linkedStage1Ids = new Set();
  (manualInvites || []).forEach(inv => {
    if (inv.linked_applicant_id) linkedIds.add(inv.linked_applicant_id);
    if (inv.linked_stage1_id) linkedStage1Ids.add(inv.linked_stage1_id);
  });

  const matchedLeadByApplicantId = new Map();
  const matchedStage1Ids = new Set();

  for (const lead of (stage1Leads || [])) {
    const matchedApp = findMatchingApplicantForLead(lead, { applicants, invitedCandidates: manualInvites, indexes: idx });
    if (matchedApp) {
      matchedStage1Ids.add(lead.id);
      const existingLead = matchedLeadByApplicantId.get(matchedApp.id);
      if (!existingLead || (!String(existingLead.source || '').trim() && String(lead.source || '').trim())) {
        matchedLeadByApplicantId.set(matchedApp.id, lead);
      }
    }
  }

  const rows = [];

  for (const inv of (manualInvites || [])) {
    const linkedApp = inv.linked_applicant_id
      ? (idx.applicantById.get(inv.linked_applicant_id) || null)
      : null;
    const linkedLead = inv.linked_stage1_id ? (idx.stage1ById.get(inv.linked_stage1_id) || null) : null;
    const resolvedStatus = (linkedApp || linkedLead)
      ? 'Responded'
      : (inv.status === 'Responded' ? 'Responded' : 'No Response');
    const fallbackLeadSource = linkedApp
      ? String(matchedLeadByApplicantId.get(linkedApp.id)?.source || '').trim()
      : String(linkedLead?.source || '').trim();

    rows.push({
      rowKey: `manual:${inv.id}`,
      manualId: inv.id,
      linkedApplicantId: inv.linked_applicant_id || null,
      linkedStage1Id: inv.linked_stage1_id || null,
      isManual: true,
      isAutoOnly: false,
      inviteDate: inv.invite_date || String(inv.created_at || '').slice(0, 10),
      candidateName: linkedApp?.full_name || linkedLead?.full_name || inv.candidate_name || '—',
      appliedPosition: inv.applied_position || linkedApp?.position || linkedLead?.position || '—',
      source: inv.source || fallbackLeadSource || (linkedApp ? 'Jobstreet' : 'Lead Register'),
      status: resolvedStatus,
      notes: inv.notes || '',
      isDuplicated: Boolean(linkedApp?.duplicated_from),
      applicantRef: linkedApp
    });
  }

  for (const app of (applicants || [])) {
    if (app.stage === 'stage1_pending') continue;
    if (linkedIds.has(app.id)) continue;
    const leadSource = String(matchedLeadByApplicantId.get(app.id)?.source || '').trim();
    rows.push({
      rowKey: `app:${app.id}`,
      manualId: null,
      linkedApplicantId: app.id,
      linkedStage1Id: matchedLeadByApplicantId.get(app.id)?.id || null,
      isManual: false,
      isAutoOnly: true,
      inviteDate: String(app.created_at || '').slice(0, 10),
      candidateName: app.full_name || app.application_data?.nama || '—',
      appliedPosition: app.position || app.application_data?.posisi || '—',
      source: leadSource || 'Jobstreet',
      status: 'Responded',
      notes: '',
      isDuplicated: Boolean(app.duplicated_from),
      applicantRef: app
    });
  }

  for (const lead of (stage1Leads || [])) {
    if (linkedStage1Ids.has(lead.id) || matchedStage1Ids.has(lead.id)) continue;
    const leadSource = String(lead.source || '').trim();
    rows.push({
      rowKey: `stage1:${lead.id}`,
      manualId: null,
      linkedApplicantId: null,
      linkedStage1Id: lead.id,
      isManual: false,
      isAutoOnly: true,
      inviteDate: String(lead.created_at || '').slice(0, 10),
      candidateName: lead.full_name || '—',
      appliedPosition: lead.position || '—',
      source: leadSource || 'Lead Register',
      status: 'Responded',
      notes: 'Lead Register',
      isDuplicated: false,
      applicantRef: null,
      stage1Ref: lead
    });
  }

  return rows.sort((a, b) => {
    const dateDiff = String(b.inviteDate || '').localeCompare(String(a.inviteDate || ''));
    if (dateDiff !== 0) return dateDiff;
    return String(a.candidateName || '').localeCompare(String(b.candidateName || ''), 'en');
  });
}

export function aggregateCvScreeningBySource(screenings = []) {
  const byKey = new Map();
  for (const row of (screenings || [])) {
    const position = String(row.position || '').trim();
    const source = String(row.source || '').trim();
    if (!source) continue;
    const key = `${position.toLowerCase()}||${source.toLowerCase()}`;
    const count = Math.max(0, Number.parseInt(row.screening_count, 10) || 0);
    const prev = byKey.get(key);
    if (prev) {
      prev.screeningCount += count;
      if (row.notes && !prev.notes) prev.notes = row.notes;
    } else {
      byKey.set(key, {
        id: row.id || null,
        rowKey: key,
        position,
        source,
        screeningCount: count,
        notes: row.notes || '',
        updatedAt: row.updated_at || row.created_at || ''
      });
    }
  }
  const items = [...byKey.values()].sort((a, b) => {
    const posCmp = (a.position || '\uffff').localeCompare(b.position || '\uffff', 'en');
    if (posCmp !== 0) return posCmp;
    const idxA = INVITE_SOURCES.indexOf(a.source);
    const idxB = INVITE_SOURCES.indexOf(b.source);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.source.localeCompare(b.source, 'en');
  });
  const totalCount = items.reduce((sum, item) => sum + item.screeningCount, 0);
  return { items, totalCount };
}

export function buildUnifiedTrackingRows({
  applicants = [],
  stage1Leads = [],
  interviews = [],
  employees = [],
  invitedCandidates = [],
  indexes = null
} = {}) {
  const idx = indexes || buildWorkspaceIndexes({ applicants, employees, interviews, invitedCandidates, stage1Leads });
  const rows = [];
  const inviteByApplicantId = idx.inviteByApplicantId;
  const inviteByStage1Id = idx.inviteByStage1Id;

  const leadByApplicantId = new Map();
  const matchedStage1Set = new Set();
  const seenStage1Ids = new Set();
  for (const s of (stage1Leads || [])) {
    seenStage1Ids.add(s.id);
    const matched = findMatchingApplicantForLead(s, { applicants, interviews, invitedCandidates, indexes: idx });
    if (matched) {
      matchedStage1Set.add(s.id);
      if (!leadByApplicantId.has(matched.id) && String(s.source || '').trim()) {
        leadByApplicantId.set(matched.id, s);
      }
    }
  }

  const getDisc = a => resolveSharedDiscForApplicant(a, applicants, idx);
  const getEmp = a => (Array.isArray(a.employees) ? a.employees[0] : a.employees) ||
    idx.employeeByApplicantId.get(a.id) || null;

  const formatInterviewStageCell = item => {
    if (!item) return null;
    const dec = normalizeInterviewDecision(item.decision);
    return {
      date: item.interview_date || String(item.created_at || '').slice(0, 10),
      decision: dec,
      picName: item.pic_name || '',
      notes: item.notes || ''
    };
  };

  const resolveLatestStageDecision = byStage => {
    for (const st of ['User 2', 'User 1', 'HR 2', 'HR 1']) {
      if (byStage[st]) return byStage[st];
    }
    return null;
  };

  for (const a of (applicants || [])) {
    if (a.stage === 'stage1_pending') continue;
    const ints = resolveSharedInterviewsForApplicant(a, applicants, interviews, idx);
    const byStage = getLatestInterviewsByStage(ints);
    const emp = getEmp(a);
    const disc = getDisc(a);
    const linkedInv = inviteByApplicantId.get(a.id) || null;
    const matchedLead = leadByApplicantId.get(a.id) || null;
    const finalInt = byStage['Final Interview'];
    const finalDec = finalInt ? normalizeInterviewDecision(finalInt.decision) : '';
    const latestPreFinal = resolveLatestStageDecision(byStage);
    const latestPreFinalDec = latestPreFinal ? normalizeInterviewDecision(latestPreFinal.decision) : '';
    const leadRec = matchedLead ? normalizeLeadRecommendation(matchedLead.recommendation) : '';

    let decisionLabel = 'In Progress';
    let decisionTone = 'gold';
    let rejectionReason = '';
    let decisionDate = '';
    if (emp || a.stage === 'hired' || finalDec === 'Accepted') {
      decisionLabel = 'Accepted';
      decisionTone = 'green';
      decisionDate = finalInt
        ? (finalInt.interview_date || String(finalInt.updated_at || finalInt.created_at || '').slice(0, 10))
        : '';
    } else if (finalDec === 'Rejected' || a.stage === 'rejected') {
      decisionLabel = 'Rejected';
      decisionTone = 'gray';
      rejectionReason = [finalInt?.rejection_reason_category, finalInt?.rejection_reason_detail]
        .filter(Boolean).join(' · ');
      decisionDate = finalInt
        ? (finalInt.interview_date || String(finalInt.updated_at || finalInt.created_at || '').slice(0, 10))
        : '';
    } else if (finalDec === 'Holded') {
      decisionLabel = 'Holded';
      decisionTone = 'gold';
      decisionDate = finalInt
        ? (finalInt.interview_date || String(finalInt.updated_at || finalInt.created_at || '').slice(0, 10))
        : '';
    } else if (finalDec === 'Sent to OS' || a.stage === 'os_sent') {
      decisionLabel = 'Sent to OS';
      decisionTone = 'gold';
      decisionDate = finalInt
        ? (finalInt.interview_date || String(finalInt.updated_at || finalInt.created_at || '').slice(0, 10))
        : '';
    } else if (latestPreFinalDec === 'Not Recommended' || (!latestPreFinal && leadRec === 'Not Recommended')) {
      decisionLabel = 'Not Recommended';
      decisionTone = 'gray';
      decisionDate = latestPreFinal
        ? (latestPreFinal.interview_date || String(latestPreFinal.updated_at || latestPreFinal.created_at || '').slice(0, 10))
        : '';
    }

    const joinDate = emp?.join_date || finalInt?.work_start_date || '';
    const resolvedSource = linkedInv?.source || String(matchedLead?.source || '').trim() || 'Jobstreet';

    rows.push({
      id: `app:${a.id}`,
      name: a.full_name || '—',
      position: a.position || '',
      sub: `${a.position || '—'}${a.nik ? ` · ${a.nik}` : ''}`,
      inviteDate: linkedInv?.invite_date || String(a.created_at || '').slice(0, 10),
      inviteStatus: 'Responded',
      inviteSource: resolvedSource,
      formSubmittedDate: String(a.created_at || '').slice(0, 10),
      hrTestDate: disc?.completed_at ? String(disc.completed_at).slice(0, 10) : '',
      hrTestDone: Boolean(disc || a.stage === 'disc_completed'),
      hr1: formatInterviewStageCell(byStage['HR 1']),
      hr2: formatInterviewStageCell(byStage['HR 2']),
      user1: formatInterviewStageCell(byStage['User 1']),
      user2: formatInterviewStageCell(byStage['User 2']),
      finalInt: formatInterviewStageCell(finalInt),
      decision: decisionLabel,
      decisionTone,
      rejectionReason,
      decisionDate,
      joinDate
    });
  }

  for (const s of (stage1Leads || [])) {
    if (matchedStage1Set.has(s.id)) continue;
    const ints = idx.interviewsByStage1Id.get(s.id) || [];
    const byStage = getLatestInterviewsByStage(ints);
    const linkedInv = inviteByStage1Id.get(s.id) || null;
    const invStatus = linkedInv ? (linkedInv.status === 'Responded' ? 'Responded' : 'No Response') : 'Responded';
    const finalInt = byStage['Final Interview'];
    const finalDec = finalInt ? normalizeInterviewDecision(finalInt.decision) : '';
    const latestPreFinal = resolveLatestStageDecision(byStage);
    const latestPreFinalDec = latestPreFinal ? normalizeInterviewDecision(latestPreFinal.decision) : '';
    const leadRec = normalizeLeadRecommendation(s.recommendation);
    let decisionLabel = 'In Progress';
    let decisionTone = 'gold';
    let rejectionReason = '';
    let decisionDate = '';
    if (finalDec === 'Accepted') {
      decisionLabel = 'Accepted';
      decisionTone = 'green';
      decisionDate = finalInt ? (finalInt.interview_date || String(finalInt.updated_at || finalInt.created_at || '').slice(0, 10)) : '';
    } else if (finalDec === 'Rejected') {
      decisionLabel = 'Rejected';
      decisionTone = 'gray';
      rejectionReason = [finalInt?.rejection_reason_category, finalInt?.rejection_reason_detail].filter(Boolean).join(' · ');
      decisionDate = finalInt ? (finalInt.interview_date || String(finalInt.updated_at || finalInt.created_at || '').slice(0, 10)) : '';
    } else if (finalDec === 'Holded') {
      decisionLabel = 'Holded';
      decisionTone = 'gold';
      decisionDate = finalInt ? (finalInt.interview_date || String(finalInt.updated_at || finalInt.created_at || '').slice(0, 10)) : '';
    } else if (finalDec === 'Sent to OS') {
      decisionLabel = 'Sent to OS';
      decisionTone = 'gold';
      decisionDate = finalInt ? (finalInt.interview_date || String(finalInt.updated_at || finalInt.created_at || '').slice(0, 10)) : '';
    } else if (latestPreFinalDec === 'Not Recommended' || (!latestPreFinal && leadRec === 'Not Recommended')) {
      decisionLabel = 'Not Recommended';
      decisionTone = 'gray';
      decisionDate = latestPreFinal ? (latestPreFinal.interview_date || String(latestPreFinal.updated_at || latestPreFinal.created_at || '').slice(0, 10)) : '';
    } else if (invStatus === 'No Response') {
      decisionLabel = 'No Response';
      decisionTone = 'gray';
    }

    const leadSource = String(linkedInv?.source || s.source || '').trim();

    rows.push({
      id: `stage1:${s.id}`,
      name: s.full_name || '—',
      position: s.position || '',
      sub: `${s.position || '—'}${s.whatsapp ? ` · ${s.whatsapp}` : ''}`,
      inviteDate: String(s.created_at || '').slice(0, 10),
      inviteStatus: invStatus,
      inviteSource: leadSource || 'Lead Register',
      formSubmittedDate: '',
      hrTestDate: '',
      hrTestDone: false,
      hr1: formatInterviewStageCell(byStage['HR 1']),
      hr2: formatInterviewStageCell(byStage['HR 2']),
      user1: formatInterviewStageCell(byStage['User 1']),
      user2: formatInterviewStageCell(byStage['User 2']),
      finalInt: formatInterviewStageCell(finalInt),
      decision: decisionLabel,
      decisionTone,
      rejectionReason,
      decisionDate,
      joinDate: finalInt?.work_start_date || ''
    });
  }

  for (const inv of (invitedCandidates || [])) {
    if (inv.linked_applicant_id) continue;
    if (inv.linked_stage1_id && seenStage1Ids.has(inv.linked_stage1_id)) continue;
    const isResponded = inv.status === 'Responded';
    rows.push({
      id: `inv:${inv.id}`,
      name: inv.candidate_name || '—',
      position: inv.applied_position || '',
      sub: `${inv.applied_position || '—'} · ${inv.source || '—'}`,
      inviteDate: inv.invite_date || String(inv.created_at || '').slice(0, 10),
      inviteStatus: isResponded ? 'Responded' : 'No Response',
      inviteSource: inv.source || '—',
      formSubmittedDate: '',
      hrTestDate: '',
      hrTestDone: false,
      hr1: null,
      hr2: null,
      user1: null,
      user2: null,
      finalInt: null,
      decision: isResponded ? 'In Progress' : 'No Response',
      decisionTone: isResponded ? 'gold' : 'gray',
      rejectionReason: '',
      decisionDate: '',
      joinDate: ''
    });
  }

  return rows;
}

export function buildRecruitmentConclusionSummary({
  positions = [],
  cvScreenings = [],
  invitedCandidates = [],
  stage1Leads = [],
  applicants = [],
  interviews = [],
  employees = [],
  indexes = null
} = {}) {
  const idx = indexes || buildWorkspaceIndexes({ applicants, employees, interviews, invitedCandidates, stage1Leads });
  const buckets = new Map();
  const ensureBucket = (rawPos = '') => {
    const clean = String(rawPos || '').trim();
    const display = clean && clean !== '—' ? clean : 'Unspecified';
    const key = display.toLowerCase();
    if (!buckets.has(key)) {
      buckets.set(key, {
        position: display,
        cvScreeningCount: 0,
        invitedCount: 0,
        hrTestCount: 0,
        hrCandidates: new Set(),
        userCandidates: new Set(),
        finalCandidates: new Set(),
        acceptedCandidates: new Set()
      });
    }
    return buckets.get(key);
  };

  for (const pos of (positions || [])) {
    if (String(pos || '').trim()) ensureBucket(pos);
  }

  const applicantById = idx.applicantById;
  const leadById = idx.stage1ById;
  const matchedAppByStage1Id = new Map();
  for (const lead of (stage1Leads || [])) {
    const matched = findMatchingApplicantForLead(lead, { applicants, interviews, invitedCandidates, indexes: idx });
    if (matched) matchedAppByStage1Id.set(lead.id, matched);
  }

  // 1. CV Screening tally per Position
  for (const scr of (cvScreenings || [])) {
    const b = ensureBucket(scr.position);
    b.cvScreeningCount += Math.max(0, Number.parseInt(scr.screening_count, 10) || 0);
  }

  // 2. Invited count per Position (deduplicated view rows)
  const invitedRows = buildInvitedCandidatesViewRows({ manualInvites: invitedCandidates, applicants, stage1Leads, indexes: idx });
  for (const row of invitedRows) {
    const pos = String(row.appliedPosition || '').trim();
    if (!pos || pos === '—') continue;
    ensureBucket(pos).invitedCount += 1;
  }

  // 3. HR Test (DISC completed) & Interview / Accepted from applicants (including shared same-NIK continuity)
  const hiredApplicantIds = new Set((employees || []).map(e => e.applicant_id).filter(Boolean));
  const coveredDirectInterviewIds = new Set();

  for (const app of (applicants || [])) {
    if (app.stage === 'stage1_pending') continue;
    const pos = String(app.position || app.application_data?.posisi || '').trim();
    if (!pos) continue;
    const bucket = ensureBucket(pos);
    const resolvedDisc = resolveSharedDiscForApplicant(app, applicants, idx);
    const hasDisc = Boolean(resolvedDisc || app.stage === 'disc_completed');
    if (hasDisc) bucket.hrTestCount += 1;
    if (app.stage === 'hired' || hiredApplicantIds.has(app.id)) {
      bucket.acceptedCandidates.add(`app:${app.id}`);
    }

    const sharedInts = resolveSharedInterviewsForApplicant(app, applicants, interviews, idx);
    const candKey = `app:${app.id}`;
    for (const row of sharedInts) {
      if (row.applicant_id === app.id && row.id) coveredDirectInterviewIds.add(row.id);
      if (row.interview_stage === 'HR 1' || row.interview_stage === 'HR 2') {
        bucket.hrCandidates.add(candKey);
      } else if (row.interview_stage === 'User 1' || row.interview_stage === 'User 2') {
        bucket.userCandidates.add(candKey);
      } else if (row.interview_stage === 'Final Interview') {
        bucket.finalCandidates.add(candKey);
        if (normalizeInterviewDecision(row.decision) === 'Accepted') {
          bucket.acceptedCandidates.add(candKey);
        }
      }
    }
  }

  // 4. Remaining standalone/stage1 interviews not covered by applicant buckets
  for (const row of (interviews || [])) {
    if (row.id && coveredDirectInterviewIds.has(row.id)) continue;
    if (row.applicant_id && applicantById.has(row.applicant_id)) continue;
    const linkedApp = row.stage1_id ? matchedAppByStage1Id.get(row.stage1_id) : null;
    if (linkedApp) continue;
    const linkedLead = row.stage1_id ? leadById.get(row.stage1_id) : null;
    const rawPos = String(linkedLead?.position || row.applied_position || '').trim();
    if (!rawPos) continue;

    const bucket = ensureBucket(rawPos);
    const candKey = row.applicant_id
      ? `app:${row.applicant_id}`
      : row.stage1_id
        ? `stage1:${row.stage1_id}`
        : `name:${normalizePersonName(row.candidate_name)}`;

    if (row.interview_stage === 'HR 1' || row.interview_stage === 'HR 2') {
      bucket.hrCandidates.add(candKey);
    } else if (row.interview_stage === 'User 1' || row.interview_stage === 'User 2') {
      bucket.userCandidates.add(candKey);
    } else if (row.interview_stage === 'Final Interview') {
      bucket.finalCandidates.add(candKey);
      if (normalizeInterviewDecision(row.decision) === 'Accepted') {
        bucket.acceptedCandidates.add(candKey);
      }
    }
  }

  const ordered = [...buckets.values()].filter(b => {
    if (b.position !== 'Unspecified') return true;
    return b.cvScreeningCount > 0 || b.invitedCount > 0 || b.hrTestCount > 0 ||
      b.hrCandidates.size > 0 || b.userCandidates.size > 0 || b.finalCandidates.size > 0 || b.acceptedCandidates.size > 0;
  });

  const rows = ordered.map((b, idx) => ({
    no: idx + 1,
    position: b.position,
    cvScreeningCount: b.cvScreeningCount,
    invitedCount: b.invitedCount,
    hrTestCount: b.hrTestCount,
    hrInterviewCount: b.hrCandidates.size,
    userInterviewCount: b.userCandidates.size,
    finalInterviewCount: b.finalCandidates.size,
    acceptedCount: b.acceptedCandidates.size
  }));

  const totals = rows.reduce((acc, r) => ({
    cvScreeningCount: acc.cvScreeningCount + r.cvScreeningCount,
    invitedCount: acc.invitedCount + r.invitedCount,
    hrTestCount: acc.hrTestCount + r.hrTestCount,
    hrInterviewCount: acc.hrInterviewCount + r.hrInterviewCount,
    userInterviewCount: acc.userInterviewCount + r.userInterviewCount,
    finalInterviewCount: acc.finalInterviewCount + r.finalInterviewCount,
    acceptedCount: acc.acceptedCount + r.acceptedCount
  }), {
    cvScreeningCount: 0,
    invitedCount: 0,
    hrTestCount: 0,
    hrInterviewCount: 0,
    userInterviewCount: 0,
    finalInterviewCount: 0,
    acceptedCount: 0
  });

  return { rows, totals };
}

export function findDefaultInterviewer(stage, employees = []) {
  const def = DEFAULT_INTERVIEW_PICS[stage];
  if (!def) return null;
  const target = def.name.toLowerCase();
  const match = (employees || []).find(emp => {
    const empName = String(emp.full_name || emp.applicant?.full_name || '').toLowerCase();
    return empName.includes(target);
  });
  if (!match) return null;
  return {
    employeeId: match.id,
    nik: match.employee_no || '',
    name: match.full_name || def.name
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
    .replace(/[^a-z0-9]+/g, '');
}

const EMPLOYEE_HEADER_MAP = {
  nama: 'full_name',
  name: 'full_name',
  fullname: 'full_name',
  namalengkap: 'full_name',
  nik: 'employee_no',
  employeenik: 'employee_no',
  employeeno: 'employee_no',
  nokaryawan: 'employee_no',
  nomorkaryawan: 'employee_no',
  departement: 'department',
  departemen: 'department',
  department: 'department',
  tglmasuk: 'join_date',
  tanggalmasuk: 'join_date',
  joindate: 'join_date',
  jabatan: 'position',
  posisi: 'position',
  position: 'position',
  mulaikontrak: 'contract_start_date',
  contractstart: 'contract_start_date',
  kontrakberakhir: 'contract_end_date',
  contractend: 'contract_end_date',
  alamat: 'address',
  address: 'address',
  nik2: 'ktp_nik',
  idcardnik: 'ktp_nik',
  nikktp: 'ktp_nik',
  noktp: 'ktp_nik',
  tempatlahir: 'birth_place',
  birthplace: 'birth_place',
  tanggallahir: 'birth_date',
  tgllahir: 'birth_date',
  birthdate: 'birth_date',
  notelp: 'phone',
  phoneno: 'phone',
  phone: 'phone',
  telepon: 'phone',
  hp: 'phone',
  status: 'employment_status',
  statuskaryawan: 'employment_status',
  pendidikan: 'education',
  education: 'education',
  jeniskelamin: 'gender',
  kelamin: 'gender',
  gender: 'gender',
  agama: 'religion',
  religion: 'religion',
  homebase: 'home_base',
  lokasi: 'home_base',
  location: 'home_base',
  perusahaan: 'company_entity',
  company: 'company_entity',
  companyentity: 'company_entity',
  pt: 'company_entity',
  entity: 'company_entity'
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
      errors.push(`Row ${index + 2}: NIK column is required (${fullName || 'unnamed'}).`);
      return;
    }
    if (!fullName) {
      errors.push(`Row ${index + 2}: Name column is required (NIK ${employeeNo}).`);
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
      religion: String(mapped.religion ?? '').trim(),
      home_base: normalizeHomeBase(mapped.home_base ?? 'PASURUAN'),
      company_entity: normalizeCompanyEntity(mapped.company_entity ?? 'MITRA')
    });
  });

  return { rows: parsed, errors };
}

export function parseEmployeeWorksheetAoa(aoa = []) {
  if (!Array.isArray(aoa) || !aoa.length) return { rows: [], errors: [], headerRowIndex: -1 };
  let headerIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const row = Array.isArray(aoa[i]) ? aoa[i] : [];
    const keys = new Set(row.map(c => normalizeHeaderKey(c)).filter(Boolean));
    if ((keys.has('nama') || keys.has('name') || keys.has('fullname')) &&
        (keys.has('nik') || keys.has('employeenik') || keys.has('employeeno'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    return { rows: [], errors: ['Header kolom Nama & Nik tidak ditemukan pada worksheet.'], headerRowIndex: -1 };
  }
  const headers = (aoa[headerIdx] || []).map(h => String(h ?? '').trim());
  const objects = [];
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const rowArr = aoa[r];
    if (!Array.isArray(rowArr) || !rowArr.some(v => String(v ?? '').trim() !== '')) continue;
    const obj = {};
    headers.forEach((h, colIdx) => {
      if (h) obj[h] = rowArr[colIdx] ?? '';
    });
    objects.push(obj);
  }
  const res = parseEmployeeSpreadsheetRows(objects);
  return { ...res, headerRowIndex: headerIdx };
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
    Agama: employee.religion || appData.agama || '',
    'Home Base': normalizeHomeBase(employee.home_base || ''),
    Perusahaan: normalizeCompanyEntity(employee.company_entity || '')
  };
}

export const LEAD_IMPORT_HEADERS = [
  'Applicant Name',
  'Position',
  'Source',
  'WhatsApp No.',
  'Recommendation'
];

export const LEAD_IMPORT_SAMPLE_ROW = {
  'Applicant Name': 'Rizky Pratama',
  Position: 'CNC',
  Source: 'Jobstreet',
  'WhatsApp No.': '081234567890',
  Recommendation: 'Recommended'
};

const LEAD_IMPORT_HEADER_MAP = {
  applicantname: 'full_name',
  fullname: 'full_name',
  name: 'full_name',
  nama: 'full_name',
  namalengkap: 'full_name',
  namapelamar: 'full_name',
  position: 'position',
  posisi: 'position',
  jabatan: 'position',
  source: 'source',
  sumber: 'source',
  whatsapp: 'whatsapp',
  whatsappno: 'whatsapp',
  nowhatsapp: 'whatsapp',
  notelp: 'whatsapp',
  telepon: 'whatsapp',
  phone: 'whatsapp',
  hp: 'whatsapp',
  recommendation: 'recommendation',
  rekomendasi: 'recommendation',
  remarks: 'recommendation'
};

export function parseLeadImportRows(rawRows = []) {
  const rows = [];
  const errors = [];

  (rawRows || []).forEach((rawRow, idx) => {
    const mapped = {};
    for (const [key, val] of Object.entries(rawRow || {})) {
      const target = LEAD_IMPORT_HEADER_MAP[normalizeHeaderKey(key)];
      if (target) mapped[target] = val;
    }

    const fullName = String(mapped.full_name ?? '').trim();
    const position = String(mapped.position ?? '').trim();
    if (!fullName && !position) return;
    if (!fullName) {
      errors.push(`Row ${idx + 2}: Applicant Name is required.`);
      return;
    }
    if (!position) {
      errors.push(`Row ${idx + 2}: Position is required (${fullName}).`);
      return;
    }

    const rawPhone = String(mapped.whatsapp ?? '').trim();
    const digits = rawPhone.replace(/\D/g, '');
    const whatsapp = digits.startsWith('62')
      ? `0${digits.slice(2)}`
      : (digits.startsWith('8') ? `0${digits}` : (digits || rawPhone));

    const rec = normalizeLeadRecommendation(mapped.recommendation || 'Pending');
    const status = rec === 'Recommended' ? 'invited' : rec === 'Not Recommended' ? 'rejected' : 'reviewed';

    rows.push({
      full_name: fullName,
      position,
      source: String(mapped.source ?? '').trim() || 'Jobstreet',
      whatsapp,
      recommendation: rec,
      status
    });
  });

  return { rows, errors };
}

export const CANDIDATE_IMPORT_HEADERS = [
  'Full Name',
  'NIK (16 Digits)',
  'Position',
  'Stage',
  'Phone / WhatsApp',
  'Email',
  'Gender',
  'Birth Place',
  'Birth Date',
  'Domicile Address',
  'Last Education',
  'Marital Status',
  'Religion',
  'Source'
];

export const CANDIDATE_IMPORT_SAMPLE_ROW = {
  'Full Name': 'Budi Santoso',
  'NIK (16 Digits)': '3514122006840004',
  Position: 'Spray',
  Stage: 'application_submitted',
  'Phone / WhatsApp': '081234567891',
  Email: 'budi.santoso@example.com',
  Gender: 'Laki-laki',
  'Birth Place': 'Pasuruan',
  'Birth Date': '20-06-1994',
  'Domicile Address': 'Ds. Randupitu RT 02 RW 05, Kec. Gempol, Kab. Pasuruan',
  'Last Education': 'SMK',
  'Marital Status': 'Menikah',
  Religion: 'Islam',
  Source: 'Jobstreet'
};

const CANDIDATE_IMPORT_HEADER_MAP = {
  fullname: 'full_name',
  name: 'full_name',
  nama: 'full_name',
  namalengkap: 'full_name',
  nik: 'nik',
  nik16digits: 'nik',
  noktp: 'nik',
  ktp: 'nik',
  position: 'position',
  posisi: 'position',
  jabatan: 'position',
  stage: 'stage',
  tahap: 'stage',
  status: 'stage',
  phonewhatsapp: 'phone',
  phone: 'phone',
  whatsapp: 'phone',
  telepon: 'phone',
  notelp: 'phone',
  hp: 'phone',
  email: 'email',
  gender: 'gender',
  jeniskelamin: 'gender',
  kelamin: 'gender',
  birthplace: 'birth_place',
  tempatlahir: 'birth_place',
  birthdate: 'birth_date',
  tanggallahir: 'birth_date',
  tgllahir: 'birth_date',
  domicileaddress: 'address',
  domisili: 'address',
  alamat: 'address',
  address: 'address',
  lasteducation: 'education',
  pendidikan: 'education',
  pendidikanterakhir: 'education',
  maritalstatus: 'marital_status',
  statuskawin: 'marital_status',
  statuspernikahan: 'marital_status',
  religion: 'religion',
  agama: 'religion',
  source: 'source',
  sumber: 'source'
};

const VALID_APPLICANT_STAGES = new Set([
  'application_submitted',
  'disc_completed',
  'stage4_pending',
  'os_sent',
  'hired',
  'rejected'
]);

function normalizeCandidateStageImport(raw) {
  const val = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (VALID_APPLICANT_STAGES.has(val)) return val;
  if (val.includes('disc')) return 'disc_completed';
  if (val.includes('hired') || val.includes('karyawan') || val.includes('accepted')) return 'hired';
  if (val.includes('reject') || val.includes('tolak')) return 'rejected';
  if (val.includes('os')) return 'os_sent';
  if (val.includes('interview') || val.includes('stage4')) return 'stage4_pending';
  return 'application_submitted';
}

export function parseCandidateImportRows(rawRows = []) {
  const rows = [];
  const errors = [];

  (rawRows || []).forEach((rawRow, idx) => {
    const mapped = {};
    for (const [key, val] of Object.entries(rawRow || {})) {
      const target = CANDIDATE_IMPORT_HEADER_MAP[normalizeHeaderKey(key)];
      if (target) mapped[target] = val;
    }

    const fullName = String(mapped.full_name ?? '').trim();
    const nikDigits = String(mapped.nik ?? '').replace(/\D/g, '');
    const position = String(mapped.position ?? '').trim();
    if (!fullName && !nikDigits && !position) return;

    if (!fullName) {
      errors.push(`Row ${idx + 2}: Full Name is required.`);
      return;
    }
    if (nikDigits.length !== 16) {
      errors.push(`Row ${idx + 2}: NIK must contain exactly 16 digits (${fullName}).`);
      return;
    }
    if (!position) {
      errors.push(`Row ${idx + 2}: Position is required (${fullName}).`);
      return;
    }

    const rawPhone = String(mapped.phone ?? '').trim();
    const phoneDigits = rawPhone.replace(/\D/g, '');
    const phone = phoneDigits.startsWith('62')
      ? `0${phoneDigits.slice(2)}`
      : (phoneDigits.startsWith('8') ? `0${phoneDigits}` : (phoneDigits || rawPhone));

    const birthDateIso = parseSpreadsheetDateToIso(mapped.birth_date) || '';
    const address = String(mapped.address ?? '').trim();
    const genderRaw = String(mapped.gender ?? '').trim();
    const gender = /^l/i.test(genderRaw) ? 'L' : (/^(p|w|f)/i.test(genderRaw) ? 'P' : genderRaw);
    const stage = normalizeCandidateStageImport(mapped.stage);

    rows.push({
      full_name: fullName,
      nik: nikDigits,
      position,
      stage,
      application_data: {
        nama: fullName,
        nik: nikDigits,
        posisi: position,
        telepon: phone,
        email: String(mapped.email ?? '').trim(),
        gender,
        tempat_lahir: String(mapped.birth_place ?? '').trim(),
        tanggal_lahir: birthDateIso,
        domisili: address,
        alamat_asal: address,
        pendidikan_terakhir: String(mapped.education ?? '').trim(),
        status_kawin: String(mapped.marital_status ?? '').trim(),
        agama: String(mapped.religion ?? '').trim(),
        sumber_info: String(mapped.source ?? '').trim() || 'Jobstreet',
        setuju: true
      }
    });
  });

  return { rows, errors };
}

export const DISC_IMPORT_HEADERS = [
  'NIK (16 Digits)',
  'Full Name',
  ...Array.from({ length: 24 }, (_, i) => [`Q${i + 1}_P`, `Q${i + 1}_K`]).flat()
];

export const DISC_IMPORT_SAMPLE_ROW = (() => {
  const sample = {
    'NIK (16 Digits)': '3514122006840004',
    'Full Name': 'Budi Santoso'
  };
  for (let i = 1; i <= 24; i++) {
    sample[`Q${i}_P`] = 'A';
    sample[`Q${i}_K`] = 'B';
  }
  return sample;
})();

function parseDiscChoiceIndex(raw) {
  if (raw === null || raw === undefined) return -1;
  const str = String(raw).trim().toUpperCase();
  if (!str) return -1;
  if (str === 'A' || str === '0') return 0;
  if (str === 'B' || str === '1') return 1;
  if (str === 'C' || str === '2') return 2;
  if (str === 'D' || str === '3') return 3;
  const num = Number(str);
  if (Number.isInteger(num) && num >= 1 && num <= 4) return num - 1;
  return -1;
}

export function parseDiscImportRows(rawRows = []) {
  const rows = [];
  const errors = [];

  (rawRows || []).forEach((rawRow, idx) => {
    const normalized = {};
    for (const [key, val] of Object.entries(rawRow || {})) {
      normalized[normalizeHeaderKey(key)] = val;
    }

    const rawNik = normalized.nik16digits ?? normalized.nik ?? normalized.noktp ?? normalized.ktp ?? '';
    const nikDigits = String(rawNik).replace(/\D/g, '');
    const fullName = String(normalized.fullname ?? normalized.name ?? normalized.nama ?? normalized.namalengkap ?? '').trim();

    if (!nikDigits && !fullName && !normalized.q1p && !normalized.answers) return;

    if (nikDigits.length !== 16) {
      errors.push(`Row ${idx + 2}: NIK must contain exactly 16 digits.`);
      return;
    }

    let answers = null;
    if (normalized.answers !== undefined && String(normalized.answers).trim() !== '') {
      try {
        const parsed = typeof normalized.answers === 'string' ? JSON.parse(normalized.answers) : normalized.answers;
        if (Array.isArray(parsed) && parsed.length === 24) {
          answers = parsed.map(item => ({
            most: parseDiscChoiceIndex(item?.most ?? item?.p ?? item?.P),
            least: parseDiscChoiceIndex(item?.least ?? item?.k ?? item?.K)
          }));
        }
      } catch {}
    }

    if (!answers) {
      answers = [];
      for (let q = 1; q <= 24; q++) {
        const rawMost = normalized[`q${q}p`] ?? normalized[`q${q}most`] ?? normalized[`p${q}`] ?? normalized[`soal${q}p`];
        const rawLeast = normalized[`q${q}k`] ?? normalized[`q${q}least`] ?? normalized[`k${q}`] ?? normalized[`soal${q}k`];
        answers.push({
          most: parseDiscChoiceIndex(rawMost),
          least: parseDiscChoiceIndex(rawLeast)
        });
      }
    }

    try {
      const result = computeDisc(answers);
      rows.push({
        nik: nikDigits,
        full_name: fullName,
        answers,
        result
      });
    } catch (err) {
      errors.push(`Row ${idx + 2} (${nikDigits}): ${err.message || 'Invalid DISC answers.'}`);
    }
  });

  return { rows, errors };
}

export function buildTrackingExportRows(rows = []) {
  return (rows || []).map((row, idx) => {
    const subParts = String(row.sub || '').split('·').map(s => s.trim()).filter(Boolean);
    const extractedNikOrPhone = row.nik || (subParts.length > 1 ? subParts[1] : '');
    const formSubmitted = row.formSubmittedDate
      ? formatDmyDash(row.formSubmittedDate)
      : (row.formSubmitted ? 'Submitted' : '-');
    const hrTest = row.hrTestDone
      ? (row.hrTestDate ? `Completed (${formatDmyDash(row.hrTestDate)})` : 'Completed')
      : (row.discTrait ? `${row.discTrait}${row.discPattern ? ` (${row.discPattern})` : ''}` : '-');
    const fmtStage = cell => cell ? `${cell.decision || ''}${cell.date ? ` (${formatDmyDash(cell.date)})` : ''}`.trim() : '-';

    return {
      No: idx + 1,
      'Candidate Name': row.name || row.fullName || '',
      Position: row.position || '',
      'NIK / Phone': extractedNikOrPhone,
      Source: row.inviteSource || row.source || '',
      'Invite Status': row.inviteStatus || row.inviteNote || '',
      'Invite Date': (row.inviteDate || row.invitedAt) ? formatDmyDash(row.inviteDate || row.invitedAt) : '',
      'Form Submitted': formSubmitted,
      'HR Test (DISC)': hrTest,
      'HR Interview 1': fmtStage(row.hr1),
      'HR Interview 2': fmtStage(row.hr2),
      'User Interview 1': fmtStage(row.user1),
      'User Interview 2': fmtStage(row.user2),
      'Final Interview': row.finalInt ? fmtStage(row.finalInt) : (row.finalRow?.final_decision || '-'),
      Decision: row.decision || row.progress?.label || '',
      'Rejection Reason': row.rejectionReason || row.finalRow?.rejection_reason || '',
      'Decision Date': row.decisionDate ? formatDmyDash(row.decisionDate) : '',
      'Join Date': row.joinDate
        ? formatDmyDash(row.joinDate)
        : (row.finalRow?.contract_start_date ? formatDmyDash(row.finalRow.contract_start_date) : '')
    };
  });
}

export function buildConclusionExportRows(summary = {}) {
  if (Array.isArray(summary.rows)) {
    const mapped = summary.rows.map(r => ({
      No: r.no,
      Position: r.position || '',
      'CV Screening': r.cvScreeningCount || 0,
      Invited: r.invitedCount || 0,
      'HR Test': r.hrTestCount || 0,
      'HR Interview': r.hrInterviewCount || 0,
      'User Interview': r.userInterviewCount || 0,
      'Final Interview': r.finalInterviewCount || 0,
      Accepted: r.acceptedCount || 0
    }));
    if (summary.totals) {
      mapped.push({
        No: 'TOTAL',
        Position: 'All Positions',
        'CV Screening': summary.totals.cvScreeningCount || 0,
        Invited: summary.totals.invitedCount || 0,
        'HR Test': summary.totals.hrTestCount || 0,
        'HR Interview': summary.totals.hrInterviewCount || 0,
        'User Interview': summary.totals.userInterviewCount || 0,
        'Final Interview': summary.totals.finalInterviewCount || 0,
        Accepted: summary.totals.acceptedCount || 0
      });
    }
    return mapped;
  }

  return (summary.categories || []).map(cat => ({
    Category: cat.label,
    Count: cat.count,
    Share: summary.totalCandidates > 0
      ? `${Math.round((cat.count / summary.totalCandidates) * 100)}%`
      : '0%'
  }));
}

export function paginateRows(rows = [], page = 1, pageSize = 50) {
  const list = Array.isArray(rows) ? rows : [];
  const totalItems = list.length;
  if (pageSize === 'all' || String(pageSize).toLowerCase() === 'all' || Number(pageSize) <= 0) {
    return {
      items: list,
      totalItems,
      page: 1,
      pageSize: 'all',
      totalPages: 1,
      startIndex: totalItems ? 1 : 0,
      endIndex: totalItems
    };
  }
  const size = Math.max(1, Number.parseInt(pageSize, 10) || 50);
  const totalPages = Math.max(1, Math.ceil(totalItems / size));
  const safePage = Math.min(Math.max(1, Number.parseInt(page, 10) || 1), totalPages);
  const offset = (safePage - 1) * size;
  const items = list.slice(offset, offset + size);
  return {
    items,
    totalItems,
    page: safePage,
    pageSize: size,
    totalPages,
    startIndex: totalItems ? offset + 1 : 0,
    endIndex: offset + items.length
  };
}

export function preserveCaretCurrencyValue(rawValue = '', selectionStart = null) {
  const raw = String(rawValue ?? '');
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) {
    return { formatted: '', digits: '', caretPos: 0 };
  }
  const formatted = Number(digits).toLocaleString('id-ID');
  if (selectionStart === null || selectionStart === undefined || !Number.isFinite(Number(selectionStart))) {
    return { formatted, digits, caretPos: formatted.length };
  }
  const clampedStart = Math.max(0, Math.min(raw.length, Number(selectionStart)));
  let digitsBeforeCaret = 0;
  for (let i = 0; i < clampedStart; i++) {
    if (/\d/.test(raw[i])) digitsBeforeCaret += 1;
  }
  if (digitsBeforeCaret <= 0) {
    return { formatted, digits, caretPos: 0 };
  }
  let seen = 0;
  let caretPos = formatted.length;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      seen += 1;
      if (seen === digitsBeforeCaret) {
        caretPos = i + 1;
        break;
      }
    }
  }
  return { formatted, digits, caretPos };
}




