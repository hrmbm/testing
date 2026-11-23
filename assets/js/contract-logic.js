import {
  normalizeInterviewDecision,
  normalizeLeadRecommendation,
  normalizeDisplayNik
} from './workspace-logic.js?v=20261122-hrga-workspace-16';
import {
  computeEndDate,
  formatDurationParts,
  numberToIndonesianWords,
  renderAgreementHtml
} from './hris-renderer.js?v=20261122-hrga-workspace-16';

export {
  computeEndDate,
  formatDurationParts,
  numberToIndonesianWords,
  renderAgreementHtml
};

export const CONTRACT_DOCUMENTS = [
  {
    key: '01-pkwt',
    code: '01',
    file: '01-pkwt.html',
    title: 'PKWT Employment Agreement',
    shortTitle: '01 · PKWT'
  },
  {
    key: '02-pb-pembayaran-upah',
    code: '02',
    file: '02-pb-pembayaran-upah.html',
    title: 'Joint Agreement — Wage Payment',
    shortTitle: '02 · PB Wage'
  },
  {
    key: '03-pb-pembayaran-upah-lembur',
    code: '03',
    file: '03-pb-pembayaran-upah-lembur.html',
    title: 'Joint Agreement — Overtime Rate',
    shortTitle: '03 · PB Overtime'
  },
  {
    key: '04-pb-penyelesaian-upah',
    code: '04',
    file: '04-pb-penyelesaian-upah.html',
    title: 'Joint Agreement — Wage Settlement',
    shortTitle: '04 · PB Wage Settlement'
  },
  {
    key: '05-pb-penyelesaian-lembur',
    code: '05',
    file: '05-pb-penyelesaian-lembur.html',
    title: 'Joint Agreement — Overtime Settlement',
    shortTitle: '05 · PB OT Settlement'
  }
];

export const DEFAULT_CONTRACT_SETTINGS = {
  companyId: 'comp-mbm',
  prevUmkYear: 2025,
  prevUmkAmount: 4866890,
  currUmkYear: 2026,
  currUmkAmount: 5187681,
  governorDecreeNo: '188/889/KPTS/013/2026',
  overtimeWeekdayRate: 44980,
  overtimeHolidayRate: 59973,
  paydayDay: 10,
  hrName: 'Diana Anita Sari',
  hrSignatureTitle: 'Manager HR GA',
  signingCity: 'Pasuruan',
  lastDocSequence: 0,
  defaultDocSequence: '001'
};

export function toIsoDate(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysIso(isoDate, days = 1) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || '').trim());
  if (!m) return '';
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(days || 0)));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function resolveDefaultContractStartDate(record = {}, fallbackDate = new Date()) {
  const sourceType = String(record?.sourceType || '').trim();
  if (sourceType === 'final_interview') {
    return toIsoDate(record?.contractStartDate || record?.workStartDate || fallbackDate);
  }
  const endIso = String(record?.contractEndDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(endIso)) {
    return addDaysIso(endIso, 1);
  }
  return toIsoDate(record?.contractStartDate || record?.workStartDate || fallbackDate);
}

export function getExpiringContractWindow(referenceDate = new Date()) {
  const refIso = toIsoDate(referenceDate);
  const [yStr, mStr] = refIso.split('-');
  const year = Number(yStr);
  const month = Number(mStr); // 1-12

  const currentMonthKey = `${year}-${String(month).padStart(2, '0')}`;
  const currentMonthStart = `${currentMonthKey}-01`;

  const nextMonthDate = new Date(Date.UTC(year, month, 1)); // month is 0-indexed next month
  const nextYear = nextMonthDate.getUTCFullYear();
  const nextMonth = nextMonthDate.getUTCMonth() + 1;
  const nextMonthKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;

  const lastDayOfNextMonth = new Date(Date.UTC(nextYear, nextMonth, 0));
  const nextMonthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(lastDayOfNextMonth.getUTCDate()).padStart(2, '0')}`;

  return {
    referenceIso: refIso,
    currentMonthKey,
    nextMonthKey,
    currentMonthStart,
    nextMonthEnd
  };
}

export function isContractEmployee(employee) {
  const status = String(employee?.employment_status || '').trim().toUpperCase();
  if (['TETAP', 'PERMANENT', 'RESIGN', 'NONAKTIF', 'INACTIVE', 'TERMINATED'].includes(status)) {
    return false;
  }
  if (!status || status.includes('KONTRAK') || status.includes('PKWT') || status.includes('CONTRACT')) {
    return Boolean(employee?.contract_end_date);
  }
  return false;
}

export function classifyExpiringContract(employee, referenceDate = new Date()) {
  const endDate = String(employee?.contract_end_date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !isContractEmployee(employee)) {
    return { expiring: false, bucket: null, urgencyLabel: '', daysRemaining: null, endDate };
  }

  const win = getExpiringContractWindow(referenceDate);
  const endYm = endDate.slice(0, 7);
  const [ry, rm, rd] = win.referenceIso.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const refUtc = Date.UTC(ry, rm - 1, rd);
  const endUtc = Date.UTC(ey, em - 1, ed);
  const daysRemaining = Math.round((endUtc - refUtc) / 86400000);

  if (endYm === win.currentMonthKey) {
    return {
      expiring: true,
      bucket: 'current_month',
      urgencyLabel: daysRemaining < 0 ? 'Expired This Month' : 'Expiring This Month',
      daysRemaining,
      endDate
    };
  }
  if (endYm === win.nextMonthKey) {
    return {
      expiring: true,
      bucket: 'next_month',
      urgencyLabel: 'Expiring Next Month',
      daysRemaining,
      endDate
    };
  }
  return { expiring: false, bucket: null, urgencyLabel: '', daysRemaining, endDate };
}

export function parseNumericCurrency(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

export function determineRequiredContractDocuments(cashWageAmount, currUmkAmount = DEFAULT_CONTRACT_SETTINGS.currUmkAmount) {
  const wage = parseNumericCurrency(cashWageAmount);
  const umk = parseNumericCurrency(currUmkAmount);
  const meetsUmk = umk > 0 ? wage >= umk : true;
  const shortfall = meetsUmk ? 0 : Math.max(0, umk - wage);
  const documents = meetsUmk ? [CONTRACT_DOCUMENTS[0]] : [...CONTRACT_DOCUMENTS];
  return {
    wage,
    umk,
    meetsUmk,
    shortfall,
    requiredCount: documents.length,
    documents
  };
}

export function extractDocSequence(contractNumber = '', fallback = '001') {
  const raw = String(contractNumber || '').trim();
  const match = raw.match(/(\d{1,5})/);
  return match ? match[1] : String(fallback || '001');
}

export function inferDurationMonths(startIso = '', endIso = '', fallback = 12) {
  const s = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startIso || '').trim());
  const e = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(endIso || '').trim());
  if (!s || !e) return fallback;
  const sy = Number(s[1]);
  const sm = Number(s[2]);
  const sd = Number(s[3]);
  const ey = Number(e[1]);
  const em = Number(e[2]);
  const ed = Number(e[3]);
  // Add 1 day to inclusive end date to align with computeEndDate(start, months)
  const adjEnd = new Date(Date.UTC(ey, em - 1, ed + 1));
  const months = (adjEnd.getUTCFullYear() - sy) * 12 + (adjEnd.getUTCMonth() + 1 - sm);
  if (months >= 1 && months <= 60) return months;
  return fallback;
}

function buildApplicantAddress(applicant) {
  const d = applicant?.application_data || {};
  return String(d.alamat_asal || d.domisili || '').trim();
}

export function buildContractWorkspaceQueue({
  employees = [],
  interviews = [],
  applicants = [],
  referenceDate = new Date()
} = {}) {
  const appById = new Map((applicants || []).map(a => [a.id, a]));
  const empByApplicantId = new Map();
  const empByNik = new Map();
  (employees || []).forEach(emp => {
    if (emp.applicant_id) empByApplicantId.set(emp.applicant_id, emp);
    const nikKey = normalizeDisplayNik(emp.employee_no || '');
    if (nikKey) empByNik.set(nikKey, emp);
  });

  const interviewByApplicantId = new Map();
  const interviewByNik = new Map();
  (interviews || []).forEach(intv => {
    if (intv.interview_stage === 'Final Interview' && normalizeInterviewDecision(intv.decision) === 'Accepted') {
      if (intv.applicant_id && !interviewByApplicantId.has(intv.applicant_id)) {
        interviewByApplicantId.set(intv.applicant_id, intv);
      }
      const nikKey = normalizeDisplayNik(intv.assigned_nik || '');
      if (nikKey && !interviewByNik.has(nikKey)) {
        interviewByNik.set(nikKey, intv);
      }
    }
  });

  const expiringRows = [];
  const usedEmployeeIds = new Set();
  const usedApplicantIds = new Set();
  const usedNikKeys = new Set();

  (employees || []).forEach(emp => {
    const info = classifyExpiringContract(emp, referenceDate);
    if (!info.expiring) return;
    const app = emp.applicant_id ? appById.get(emp.applicant_id) : null;
    const matchedIntv = (emp.applicant_id && interviewByApplicantId.get(emp.applicant_id)) ||
      interviewByNik.get(normalizeDisplayNik(emp.employee_no || '')) ||
      null;

    usedEmployeeIds.add(emp.id);
    if (emp.applicant_id) usedApplicantIds.add(emp.applicant_id);
    const nikKey = normalizeDisplayNik(emp.employee_no || '');
    if (nikKey) usedNikKeys.add(nikKey);

    const startDate = emp.contract_start_date || emp.join_date || '';
    const endDate = emp.contract_end_date || '';
    expiringRows.push({
      queueKey: `exp:${emp.id}`,
      priorityGroup: 1,
      sourceType: 'expiring_contract',
      sourceBadge: info.urgencyLabel,
      sourceTone: info.bucket === 'current_month' ? 'gold' : 'blue',
      daysRemaining: info.daysRemaining,
      bucket: info.bucket,
      employeeId: emp.id,
      applicantId: emp.applicant_id || null,
      interviewId: matchedIntv?.id || null,
      fullName: emp.full_name || app?.full_name || '—',
      employeeNik: emp.employee_no || '',
      ktpNik: emp.ktp_nik || app?.nik || '',
      department: emp.department || '',
      position: emp.position || matchedIntv?.official_position || app?.position || '',
      address: emp.address || buildApplicantAddress(app),
      phone: emp.phone || app?.application_data?.telepon || '',
      salary: emp.salary ?? matchedIntv?.salary ?? null,
      contractStartDate: startDate,
      contractEndDate: endDate,
      durationMonths: inferDurationMonths(startDate, endDate, matchedIntv?.contract_duration_months || 12),
      contractNumber: matchedIntv?.contract_number || '',
      workStartDate: matchedIntv?.work_start_date || startDate || toIsoDate(referenceDate)
    });
  });

  expiringRows.sort((a, b) => {
    const cmpDate = String(a.contractEndDate || '').localeCompare(String(b.contractEndDate || ''));
    if (cmpDate !== 0) return cmpDate;
    return String(a.fullName || '').localeCompare(String(b.fullName || ''));
  });

  const finalInterviewRows = [];
  const seenIntvKeys = new Set();

  (interviews || []).forEach(intv => {
    if (intv.interview_stage !== 'Final Interview') return;
    if (normalizeInterviewDecision(intv.decision) !== 'Accepted') return;

    const nikKey = normalizeDisplayNik(intv.assigned_nik || '');
    if (intv.applicant_id && usedApplicantIds.has(intv.applicant_id)) return;
    if (nikKey && usedNikKeys.has(nikKey)) return;

    const dedupeKey = intv.applicant_id ? `app:${intv.applicant_id}` : (nikKey ? `nik:${nikKey}` : `intv:${intv.id}`);
    if (seenIntvKeys.has(dedupeKey)) return;
    seenIntvKeys.add(dedupeKey);

    const app = intv.applicant_id ? appById.get(intv.applicant_id) : null;
    const emp = (intv.applicant_id && empByApplicantId.get(intv.applicant_id)) ||
      (nikKey && empByNik.get(nikKey)) ||
      null;
    if (emp && usedEmployeeIds.has(emp.id)) return;

    const startDate = intv.contract_start_date || intv.work_start_date || emp?.contract_start_date || emp?.join_date || toIsoDate(referenceDate);
    const durationMonths = Number(intv.contract_duration_months) || inferDurationMonths(startDate, intv.contract_end_date || emp?.contract_end_date || '', 12);
    const endDate = intv.contract_end_date || emp?.contract_end_date || computeEndDate(startDate, durationMonths);

    finalInterviewRows.push({
      queueKey: `intv:${intv.id}`,
      priorityGroup: 2,
      sourceType: 'final_interview',
      sourceBadge: 'Final Interview Passed',
      sourceTone: 'green',
      daysRemaining: null,
      bucket: 'final_interview',
      employeeId: emp?.id || null,
      applicantId: intv.applicant_id || null,
      interviewId: intv.id,
      fullName: intv.candidate_name || emp?.full_name || app?.full_name || '—',
      employeeNik: intv.assigned_nik || emp?.employee_no || '',
      ktpNik: intv.candidate_nik || emp?.ktp_nik || app?.nik || '',
      department: emp?.department || '',
      position: intv.official_position || emp?.position || intv.applied_position || app?.position || '',
      address: emp?.address || buildApplicantAddress(app),
      phone: intv.candidate_whatsapp || emp?.phone || app?.application_data?.telepon || '',
      salary: intv.salary ?? emp?.salary ?? null,
      contractStartDate: startDate,
      contractEndDate: endDate,
      durationMonths,
      contractNumber: intv.contract_number || '',
      workStartDate: intv.work_start_date || startDate
    });
  });

  finalInterviewRows.sort((a, b) =>
    String(b.workStartDate || '').localeCompare(String(a.workStartDate || '')) ||
    String(a.fullName || '').localeCompare(String(b.fullName || ''))
  );

  return {
    rows: [...expiringRows, ...finalInterviewRows],
    expiringCount: expiringRows.length,
    finalInterviewCount: finalInterviewRows.length
  };
}

export function buildAgreementPayload(config = {}, companyMaster = null) {
  const signingDate = toIsoDate(config.signingDate || new Date());
  const durationMonths = Math.max(1, Math.round(Number(config.durationMonths) || 12));
  const endDate = config.endDate && /^\d{4}-\d{2}-\d{2}$/.test(config.endDate)
    ? config.endDate
    : computeEndDate(signingDate, durationMonths);

  return {
    docSequence: String(config.docSequence || '001').trim() || '001',
    signingDate,
    durationMonths,
    endDate,
    paydayDay: Math.min(31, Math.max(1, Math.round(Number(config.paydayDay) || 10))),
    customNote: config.includeCustomNote ? String(config.customNote || '').trim() : '',
    companyId: config.companyId || companyMaster?.id || 'comp-mbm',
    signingCity: String(config.signingCity || companyMaster?.signingCity || 'Pasuruan').trim(),
    hrName: String(config.hrName || companyMaster?.hrName || 'Diana Anita Sari').trim(),
    hrRolePkwt: String(config.hrRolePkwt || companyMaster?.hrRolePkwt || 'Manager HRD & GA').trim(),
    hrRolePb: String(config.hrRolePb || companyMaster?.hrRolePb || 'HRD').trim(),
    hrSignatureTitle: String(config.hrSignatureTitle || companyMaster?.hrSignatureTitle || 'Manager HR GA').trim(),
    employeeName: String(config.employeeName || '').trim(),
    employeeNik: config.includeNik ? String(config.employeeNik || '').trim() : '',
    employeeKtp: config.includeKtp ? String(config.employeeKtp || '').trim() : '',
    employeeDepartment: config.includeDepartment ? String(config.employeeDepartment || '').trim() : '',
    employeePosition: String(config.employeePosition || '').trim(),
    employeeAddress: String(config.employeeAddress || '').trim(),
    prevUmkYear: Number(config.prevUmkYear) || 2025,
    prevUmkAmount: parseNumericCurrency(config.prevUmkAmount),
    currUmkYear: Number(config.currUmkYear) || 2026,
    currUmkAmount: parseNumericCurrency(config.currUmkAmount),
    governorDecreeNo: String(config.governorDecreeNo || '').trim(),
    cashWageAmount: parseNumericCurrency(config.cashWageAmount),
    overtimeWeekdayRate: parseNumericCurrency(config.overtimeWeekdayRate),
    overtimeHolidayRate: parseNumericCurrency(config.overtimeHolidayRate)
  };
}

export function formatContractCode(seq, signingDate = new Date(), type = 'PKWT') {
  const iso = toIsoDate(signingDate);
  const [, mStr, ] = iso.split('-');
  const y = Number(iso.slice(0, 4)) || new Date().getFullYear();
  const m = Number(mStr) || 1;
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const padded = String(String(seq || '1').replace(/[^\d]/g, '') || '1').padStart(3, '0');
  return `${padded}/${type}/${romans[(m - 1 + 12) % 12]}/${y}`;
}

export function computeNextDocSequence({
  contractHistory = [],
  contractRequests = [],
  interviews = [],
  lastDocSequence = 0
} = {}) {
  let maxSeq = Math.max(0, Number(String(lastDocSequence || 0).replace(/[^\d]/g, '')) || 0);
  const bumpFrom = val => {
    const m = String(val || '').match(/(\d{1,6})/);
    if (m) maxSeq = Math.max(maxSeq, Number(m[1]) || 0);
  };

  (contractHistory || []).forEach(item => {
    if (item && item.status !== 'cancelled') {
      bumpFrom(item.docSequence ?? item.contractNumber);
    }
  });
  (contractRequests || []).forEach(req => {
    if (req && req.status !== 'rejected' && req.status !== 'cancelled') {
      bumpFrom(req.docSequence ?? req.contractNumber);
    }
  });
  (interviews || []).forEach(intv => {
    if (intv?.contract_number) bumpFrom(intv.contract_number);
  });

  return String(maxSeq + 1).padStart(3, '0');
}

export function createContractSnapshot(employee = null, interview = null) {
  return {
    employee: employee
      ? {
          id: employee.id,
          employee_no: employee.employee_no || '',
          department: employee.department || '',
          position: employee.position || '',
          address: employee.address || '',
          employment_status: employee.employment_status || 'KONTRAK',
          contract_start_date: employee.contract_start_date || null,
          contract_end_date: employee.contract_end_date || null,
          salary: employee.salary ?? null
        }
      : null,
    interview: interview
      ? {
          id: interview.id,
          contract_number: interview.contract_number || '',
          contract_start_date: interview.contract_start_date || null,
          contract_end_date: interview.contract_end_date || null,
          contract_duration_months: interview.contract_duration_months ?? null,
          salary: interview.salary ?? null,
          official_position: interview.official_position || ''
        }
      : null
  };
}

export function buildContractUpdateRequestPayload({
  record = {},
  config = {},
  payload = {},
  currentEmployee = null,
  currentInterview = null,
  requestedBy = 'HR Admin',
  overrides = {}
} = {}) {
  const startIso = toIsoDate(overrides.contractStartDate || payload.signingDate || new Date());
  const durationMonths = Math.max(1, Math.round(Number(overrides.durationMonths ?? payload.durationMonths ?? 12)));
  const endIso = overrides.contractEndDate && /^\d{4}-\d{2}-\d{2}$/.test(overrides.contractEndDate)
    ? overrides.contractEndDate
    : computeEndDate(startIso, durationMonths);
  const seq = String(overrides.docSequence || payload.docSequence || config.docSequence || '001').trim();
  const contractNumber = overrides.contractNumber || formatContractCode(seq, startIso, 'PKWT');
  const salary = parseNumericCurrency(overrides.salary ?? config.cashWageAmount);

  return {
    id: overrides.id || `creq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    status: 'pending',
    requestedAt: new Date().toISOString(),
    requestedBy: String(requestedBy || 'HR Admin').trim(),
    employeeId: currentEmployee?.id || record.employeeId || null,
    applicantId: record.applicantId || currentEmployee?.applicant_id || currentInterview?.applicant_id || null,
    interviewId: currentInterview?.id || record.interviewId || null,
    fullName: String(overrides.fullName ?? config.employeeName ?? record.fullName ?? '').trim(),
    employeeNik: String(overrides.employeeNik ?? config.employeeNik ?? currentEmployee?.employee_no ?? record.employeeNik ?? '').trim(),
    ktpNik: String(overrides.ktpNik ?? config.employeeKtp ?? currentEmployee?.ktp_nik ?? record.ktpNik ?? '').trim(),
    department: String(overrides.department ?? config.employeeDepartment ?? currentEmployee?.department ?? record.department ?? '').trim(),
    position: String(overrides.position ?? config.employeePosition ?? record.position ?? '').trim(),
    address: String(overrides.address ?? config.employeeAddress ?? record.address ?? '').trim(),
    phone: String(record.phone || currentEmployee?.phone || '').trim(),
    employmentStatus: String(overrides.employmentStatus || 'KONTRAK').trim(),
    contractStartDate: startIso,
    contractEndDate: endIso,
    durationMonths,
    docSequence: seq,
    contractNumber,
    salary,
    previousSnapshot: createContractSnapshot(currentEmployee, currentInterview)
  };
}

export function applyContractCancellationRollback(historyEntry, {
  employees = [],
  interviews = []
} = {}) {
  if (!historyEntry || historyEntry.status === 'cancelled') {
    throw new Error('This contract record has already been cancelled.');
  }
  const prevEmp = historyEntry.previousSnapshot?.employee || null;
  const prevIntv = historyEntry.previousSnapshot?.interview || null;

  const updatedEmployees = (employees || []).map(emp => {
    if (emp.id !== historyEntry.employeeId) return emp;
    if (!prevEmp) return emp;
    return {
      ...emp,
      position: prevEmp.position ?? emp.position,
      department: prevEmp.department ?? emp.department,
      address: prevEmp.address ?? emp.address,
      employment_status: prevEmp.employment_status ?? emp.employment_status,
      contract_start_date: prevEmp.contract_start_date ?? null,
      contract_end_date: prevEmp.contract_end_date ?? null,
      salary: prevEmp.salary ?? null
    };
  });

  const updatedInterviews = (interviews || []).map(intv => {
    if (intv.id !== historyEntry.interviewId) return intv;
    if (!prevIntv) return intv;
    return {
      ...intv,
      contract_number: prevIntv.contract_number ?? '',
      contract_start_date: prevIntv.contract_start_date ?? null,
      contract_end_date: prevIntv.contract_end_date ?? null,
      contract_duration_months: prevIntv.contract_duration_months ?? null,
      salary: prevIntv.salary ?? null,
      official_position: prevIntv.official_position ?? intv.official_position
    };
  });

  return {
    employeeId: historyEntry.employeeId || null,
    employeeRestore: prevEmp
      ? {
          position: prevEmp.position,
          department: prevEmp.department,
          address: prevEmp.address,
          employment_status: prevEmp.employment_status,
          contract_start_date: prevEmp.contract_start_date,
          contract_end_date: prevEmp.contract_end_date,
          salary: prevEmp.salary
        }
      : null,
    createdEmployeeToDelete: (!prevEmp && historyEntry.createdEmployeeId) ? historyEntry.createdEmployeeId : null,
    interviewId: historyEntry.interviewId || null,
    interviewRestore: prevIntv
      ? {
          contract_number: prevIntv.contract_number,
          contract_start_date: prevIntv.contract_start_date,
          contract_end_date: prevIntv.contract_end_date,
          contract_duration_months: prevIntv.contract_duration_months,
          salary: prevIntv.salary,
          official_position: prevIntv.official_position
        }
      : null,
    updatedEmployees,
    updatedInterviews
  };
}

export function buildDashboardAttentionItems({
  employees = [],
  interviews = [],
  applicants = [],
  stage1Leads = [],
  invitedCandidates = [],
  contractRequests = [],
  isRootAdmin = false,
  referenceDate = new Date()
} = {}) {
  const queue = buildContractWorkspaceQueue({ employees, interviews, applicants, referenceDate });

  const invitedAppIds = new Set((invitedCandidates || []).map(i => i.linked_applicant_id || i.applicant_id).filter(Boolean));
  const invitedStage1Ids = new Set((invitedCandidates || []).map(i => i.linked_stage1_id || i.stage1_id).filter(Boolean));
  const interviewAppIds = new Set((interviews || []).map(i => i.applicant_id).filter(Boolean));

  const recommendedLeadsPending = (stage1Leads || []).filter(lead => {
    if (normalizeLeadRecommendation(lead.recommendation) !== 'Recommended') return false;
    return !invitedStage1Ids.has(lead.id);
  }).length;

  const awaitingDisc = (applicants || []).filter(a => a.stage === 'application_submitted').length;
  const awaitingInterview = (applicants || []).filter(a =>
    a.stage === 'disc_completed' && !interviewAppIds.has(a.id)
  ).length;
  const uninvitedFormCandidates = (applicants || []).filter(a =>
    ['application_submitted', 'disc_completed'].includes(a.stage) && !invitedAppIds.has(a.id)
  ).length;

  const incompleteContractEmployees = (employees || []).filter(emp =>
    isContractEmployee(emp) && (!emp.contract_end_date || !String(emp.address || '').trim())
  ).length;

  const items = [];

  if (queue.expiringCount > 0) {
    items.push({
      id: 'pkwt-expiring',
      category: 'PKWT & Contracts',
      title: 'Contracts Expiring (Current & Next Month)',
      description: `${queue.expiringCount} contract employee${queue.expiringCount === 1 ? '' : 's'} require PKWT renewal.`,
      count: queue.expiringCount,
      severity: 'urgent',
      targetView: 'contracts',
      ctaLabel: 'Open Contracts'
    });
  }

  if (queue.finalInterviewCount > 0) {
    items.push({
      id: 'pkwt-final-interview',
      category: 'PKWT & Contracts',
      title: 'Passed Final Interview — PKWT Setup',
      description: `${queue.finalInterviewCount} accepted candidate${queue.finalInterviewCount === 1 ? '' : 's'} ready for PKWT setup.`,
      count: queue.finalInterviewCount,
      severity: 'warning',
      targetView: 'contracts',
      ctaLabel: 'Configure PKWT'
    });
  }

  if (recommendedLeadsPending > 0) {
    items.push({
      id: 'leads-recommended',
      category: 'Lead Register',
      title: 'Recommended Leads Not Yet Invited',
      description: `${recommendedLeadsPending} recommended lead${recommendedLeadsPending === 1 ? '' : 's'} awaiting Stage 2 invitation.`,
      count: recommendedLeadsPending,
      severity: 'info',
      targetView: 'stage1',
      ctaLabel: 'Open Lead Register'
    });
  }

  if (awaitingDisc > 0) {
    items.push({
      id: 'candidates-awaiting-disc',
      category: 'Candidate List',
      title: 'Forms Submitted Awaiting DISC',
      description: `${awaitingDisc} candidate${awaitingDisc === 1 ? ' has' : 's have'} not completed DISC.`,
      count: awaitingDisc,
      severity: 'info',
      targetView: 'stage2',
      ctaLabel: 'Open Candidate List'
    });
  }

  if (awaitingInterview > 0) {
    items.push({
      id: 'candidates-awaiting-interview',
      category: 'Interview Pipeline',
      title: 'DISC Completed Awaiting Interview',
      description: `${awaitingInterview} candidate${awaitingInterview === 1 ? '' : 's'} awaiting interview scheduling.`,
      count: awaitingInterview,
      severity: 'warning',
      targetView: 'interview',
      ctaLabel: 'Open Interviews'
    });
  } else if (uninvitedFormCandidates > 0) {
    items.push({
      id: 'invited-sync',
      category: 'Invited',
      title: 'Candidates Missing Invite Log',
      description: `${uninvitedFormCandidates} candidate${uninvitedFormCandidates === 1 ? '' : 's'} not yet tracked in Invited.`,
      count: uninvitedFormCandidates,
      severity: 'info',
      targetView: 'invited',
      ctaLabel: 'Open Invited'
    });
  }

  if (incompleteContractEmployees > 0) {
    items.push({
      id: 'directory-incomplete',
      category: 'Employee Directory',
      title: 'Contract Records Missing End Date or Address',
      description: `${incompleteContractEmployees} contract employee${incompleteContractEmployees === 1 ? '' : 's'} missing required PKWT fields.`,
      count: incompleteContractEmployees,
      severity: 'info',
      targetView: 'employees',
      ctaLabel: 'Update Directory'
    });
  }

  return items;
}

function escapeHtmlBasic(str = '') {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPkwtPrintPackageHtml(renderedDocs = [], {
  title = 'PKWT Agreement Package',
  autoPrint = true
} = {}) {
  const docs = Array.isArray(renderedDocs) ? renderedDocs.filter(Boolean) : [];
  const seenStyles = new Set();
  const collectedStyles = [];
  const sheets = [];

  docs.forEach(rawHtml => {
    const html = String(rawHtml || '');
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let m;
    while ((m = styleRegex.exec(html)) !== null) {
      const css = (m[1] || '').trim();
      if (css && !seenStyles.has(css)) {
        seenStyles.add(css);
        collectedStyles.push(css);
      }
    }
    const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
    const bodyInner = (bodyMatch ? bodyMatch[1] : html)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .trim();
    if (bodyInner) {
      sheets.push(`<section class="pkwt-print-sheet">${bodyInner}</section>`);
    }
  });

  const safeTitle = escapeHtmlBasic(title || 'PKWT Agreement Package');
  const autoPrintScript = autoPrint
    ? `<script>
      (function () {
        var fontWait = (document.fonts && document.fonts.ready)
          ? document.fonts.ready.catch(function () {})
          : Promise.resolve();
        Promise.race([
          fontWait,
          new Promise(function (resolve) { setTimeout(resolve, 200); })
        ]).then(function () {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              try { window.print(); } catch (_) {}
            });
          });
        });
      })();
    </script>`
    : '';

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    ${collectedStyles.join('\n')}
    html, body {
      background: #1e293b;
      margin: 0;
      padding: 0;
    }
    .pkwt-print-toolbar {
      position: sticky;
      top: 0;
      z-index: 80;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 22px;
      background: #0f172a;
      color: #f8fafc;
      border-bottom: 1px solid rgba(255, 255, 255, 0.14);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    }
    .pkwt-print-toolbar-title {
      font-size: 13px;
      font-weight: 600;
    }
    .pkwt-print-toolbar-actions {
      display: flex;
      gap: 8px;
    }
    .pkwt-print-toolbar button {
      border: 1px solid rgba(255, 255, 255, 0.24);
      border-radius: 7px;
      padding: 7px 14px;
      font: 600 12.5px inherit;
      cursor: pointer;
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
    }
    .pkwt-print-toolbar button.primary {
      background: #0d5c6b;
      border-color: #0d5c6b;
    }
    .pkwt-print-sheets {
      padding: 18px 0 36px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
    }
    .pkwt-print-sheet {
      width: 100%;
    }
    .pkwt-print-sheets .a4-page {
      margin: 0 auto 18px auto;
      box-shadow: 0 18px 46px rgba(0, 0, 0, 0.38);
    }
    .pkwt-print-sheets .a4-page:last-child {
      margin-bottom: 0;
    }
    @media print {
      html, body {
        background: #ffffff !important;
      }
      .pkwt-print-toolbar {
        display: none !important;
      }
      .pkwt-print-sheets {
        padding: 0 !important;
        margin: 0 !important;
        display: block !important;
        gap: 0 !important;
      }
      .pkwt-print-sheet:not(:last-child) {
        break-after: page;
        page-break-after: always;
      }
      .pkwt-print-sheet:last-child {
        break-after: auto;
        page-break-after: auto;
      }
    }
  </style>
</head>
<body>
  <div class="pkwt-print-toolbar">
    <span class="pkwt-print-toolbar-title">${safeTitle} (${docs.length} Document${docs.length === 1 ? '' : 's'})</span>
    <div class="pkwt-print-toolbar-actions">
      <button type="button" onclick="window.close()">Close</button>
      <button type="button" class="primary" onclick="window.print()">Print / Save PDF ↗</button>
    </div>
  </div>
  <main class="pkwt-print-sheets">
    ${sheets.join('\n')}
  </main>
  ${autoPrintScript}
</body>
</html>`;
}

export function buildDirectContractSyncPayloads({
  record = {},
  config = {},
  payload = {},
  currentEmployee = null,
  currentInterview = null,
  appliedBy = 'HR Admin',
  appliedAt = new Date().toISOString()
} = {}) {
  const fullName = String(config.employeeName || record.fullName || currentEmployee?.full_name || '').trim();
  const assignedNik = String(config.employeeNo || config.employeeNik || record.employeeNik || currentEmployee?.employee_no || '').trim();
  const ktpNik = String(config.employeeKtpNik || config.ktpNik || record.ktpNik || currentEmployee?.ktp_nik || '').replace(/\D/g, '');
  const position = String(config.employeePosition || record.position || currentEmployee?.position || '').trim();
  const department = String(config.employeeDepartment || record.department || currentEmployee?.department || '').trim();
  const address = String(config.employeeAddress || record.address || currentEmployee?.address || '').trim();
  const salary = parseNumericCurrency(config.cashWageAmount ?? currentEmployee?.salary ?? currentInterview?.salary);
  const startDate = toIsoDate(config.signingDate) || currentEmployee?.contract_start_date || currentEmployee?.join_date || toIsoDate(new Date());
  const durationMonths = Number(config.durationMonths) || Number(currentInterview?.contract_duration_months) || 6;
  const endDate = computeEndDate(startDate, durationMonths) || currentEmployee?.contract_end_date || null;
  const employmentStatus = String(currentEmployee?.employment_status || '').trim() || 'KONTRAK';
  const docSequence = String(config.docSequence || payload.docSequence || '').trim();
  const contractNo = String(payload.no_pkwt || config.contractNumber || config.pkwtNumber || (docSequence ? formatContractCode(docSequence, startDate, 'PKWT') : '')).trim();
  const resolvedEmpNo = assignedNik || ktpNik || `EMP-${Date.now().toString().slice(-6)}`;
  const contractNote = contractNo ? `Contract No. ${contractNo}` : (currentEmployee?.notes || '');

  const employeePayload = {
    applicant_id: record.applicantId || currentEmployee?.applicant_id || null,
    employee_no: resolvedEmpNo,
    full_name: fullName,
    department,
    join_date: currentEmployee?.join_date || startDate,
    position,
    contract_start_date: startDate,
    contract_end_date: endDate,
    address,
    ktp_nik: ktpNik || '',
    birth_place: currentEmployee?.birth_place || null,
    birth_date: currentEmployee?.birth_date || null,
    phone: currentEmployee?.phone || record.phone || '',
    employment_status: /tetap/i.test(employmentStatus) ? 'KONTRAK' : employmentStatus,
    education: currentEmployee?.education || null,
    gender: currentEmployee?.gender || null,
    religion: currentEmployee?.religion || null,
    salary,
    notes: contractNote
  };

  const interviewPatch = (record.interviewId || currentInterview?.id)
    ? {
        id: record.interviewId || currentInterview.id,
        official_position: position,
        assigned_nik: resolvedEmpNo,
        contract_number: contractNo,
        contract_start_date: startDate,
        contract_end_date: endDate,
        contract_duration_months: durationMonths,
        salary,
        updated_at: appliedAt
      }
    : null;

  const historyEntry = {
    id: `chist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queueKey: record.queueKey || '',
    sourceType: record.sourceType || (currentEmployee ? 'expiring_contract' : 'final_interview'),
    requestId: null,
    employeeId: currentEmployee?.id || record.employeeId || null,
    createdEmployeeId: null,
    interviewId: interviewPatch?.id || null,
    applicantId: record.applicantId || null,
    fullName,
    employeeName: fullName,
    employeeNik: resolvedEmpNo,
    employeeNo: resolvedEmpNo,
    contractNumber: contractNo,
    docSequence,
    position,
    department,
    contractStartDate: startDate,
    contractEndDate: endDate,
    startDate,
    endDate,
    durationMonths,
    salary,
    appliedAt,
    appliedBy,
    status: 'applied',
    previousSnapshot: createContractSnapshot(currentEmployee, currentInterview)
  };

  return {
    employeePayload,
    interviewPatch,
    applicantId: record.applicantId || null,
    historyEntry
  };
}



