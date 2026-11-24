import { supabase, isConfigured } from './supabase.js?v=20261123-hrga-workspace-18';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEMPLATE_URL, DEFAULT_MASTER_REVISION } from './config.js?v=20261123-hrga-workspace-18';
import { $, $$, esc, idDate } from './common.js?v=20261123-hrga-workspace-18';
import { computeDisc } from './disc-engine.js?v=20261123-hrga-workspace-18';
import { cacheGet, cacheSet, cacheDelete, clearAllWorkspaceCache } from './cache.js?v=20261123-hrga-workspace-18';
import {
  EMPLOYEE_TABLE_HEADERS,
  EMPLOYEE_UI_HEADERS,
  INTERVIEW_STAGES,
  INTERVIEW_STAGE_LABELS,
  normalizeInterviewDecision,
  normalizeLeadRecommendation,
  normalizeLoginIdentifier,
  validateLoginIdentifier,
  validatePin,
  buildDuplicateCandidatePayload,
  buildDuplicatedDiscPayload,
  buildDuplicatedInterviewPayloads,
  buildDuplicatedInvitePayload,
  deriveCandidateProgress,
  resolveLeadUnifiedStatus,
  buildInvitedCandidatesViewRows,
  aggregateCvScreeningBySource,
  buildUnifiedTrackingRows,
  buildRecruitmentConclusionSummary,
  resolveSharedDiscForApplicant,
  resolveSharedInterviewsForApplicant,
  formatEmployeeExportRow,
  formatDmyDash,
  isRootAdminAccount,
  maskPin,
  LEAD_IMPORT_HEADERS,
  LEAD_IMPORT_SAMPLE_ROW,
  parseLeadImportRows,
  CANDIDATE_IMPORT_HEADERS,
  CANDIDATE_IMPORT_SAMPLE_ROW,
  parseCandidateImportRows,
  DISC_IMPORT_HEADERS,
  DISC_IMPORT_SAMPLE_ROW,
  parseDiscImportRows,
  buildTrackingExportRows,
  buildConclusionExportRows,
  buildWorkspaceIndexes,
  getMemoizedDiscResult,
  paginateRows,
  preserveCaretCurrencyValue
} from './workspace-logic.js?v=20261123-hrga-workspace-18';
import {
  bindSafeModalClose,
  openDuplicateCandidateModal,
  openInterviewModal,
  openInvitedCandidateModal,
  openCvScreeningModal,
  openFullEmployeeModal,
  openEmployeeUploadModal,
  openUserModal,
  openPinRevealPrompt,
  openConfirmDialog
} from './admin-modals.js?v=20261123-hrga-workspace-18';
import {
  DEFAULT_CONTRACT_SETTINGS,
  buildContractWorkspaceQueue,
  buildDashboardAttentionItems,
  determineRequiredContractDocuments,
  parseNumericCurrency,
  computeNextDocSequence,
  buildDirectContractSyncPayloads,
  applyContractCancellationRollback,
  formatContractCode
} from './contract-logic.js?v=20261123-hrga-workspace-18';
import {
  DISTRICTS_BY_CITY,
  APPLY_INFO_SOURCES,
  FORM_INFO_SOURCES,
  QUESTION_TYPES,
  RECOMMENDATION_THRESHOLD,
  DEFAULT_VACANCIES,
  DEFAULT_RECRUITMENT_SCORING_CONFIG,
  normalizeVacancy,
  normalizeVacancyList,
  normalizeRecruitmentScoringConfig,
  extractActivePositionNames,
  normalizeDistrictToken,
  calculateVacancyMaxScore,
  buildShareUrl
} from './vacancy-logic.js?v=20261123-hrga-workspace-18';
import {
  APPLY_CUSTOM_FIELD_TYPES,
  FORM_CUSTOM_FIELD_TYPES,
  DEFAULT_APPLY_SCHEMA,
  DEFAULT_STAGE2_SCHEMA,
  MANDATORY_APPLY_IDS,
  MANDATORY_STAGE2_FIELDS,
  MANDATORY_STAGE2_SECTIONS,
  STEP_SECTION_DEFAULTS,
  STAGE2_SECTION_META,
  normalizeApplySchema,
  normalizeStage2Schema
} from './form-schema.js?v=20261123-hrga-workspace-18';

const CONTRACT_SETTINGS_STORAGE_KEY = 'hrga_contract_settings_v1';

function readSavedContractSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONTRACT_SETTINGS_STORAGE_KEY) || 'null');
    return parsed && typeof parsed === 'object'
      ? { ...DEFAULT_CONTRACT_SETTINGS, ...parsed }
      : { ...DEFAULT_CONTRACT_SETTINGS };
  } catch {
    return { ...DEFAULT_CONTRACT_SETTINGS };
  }
}

function writeSavedContractSettings(settings = {}) {
  try {
    const current = readSavedContractSettings();
    localStorage.setItem(CONTRACT_SETTINGS_STORAGE_KEY, JSON.stringify({
      ...current,
      companyId: settings.companyId ?? current.companyId,
      prevUmkYear: Number(settings.prevUmkYear) || current.prevUmkYear,
      prevUmkAmount: parseNumericCurrency(settings.prevUmkAmount ?? current.prevUmkAmount),
      currUmkYear: Number(settings.currUmkYear) || current.currUmkYear,
      currUmkAmount: parseNumericCurrency(settings.currUmkAmount ?? current.currUmkAmount),
      governorDecreeNo: settings.governorDecreeNo ?? current.governorDecreeNo,
      overtimeWeekdayRate: parseNumericCurrency(settings.overtimeWeekdayRate ?? current.overtimeWeekdayRate),
      overtimeHolidayRate: parseNumericCurrency(settings.overtimeHolidayRate ?? current.overtimeHolidayRate),
      paydayDay: Number(settings.paydayDay) || current.paydayDay,
      signingCity: settings.signingCity ?? current.signingCity,
      hrName: settings.hrName ?? current.hrName,
      hrSignatureTitle: settings.hrSignatureTitle ?? current.hrSignatureTitle,
      lastDocSequence: Number(settings.lastDocSequence ?? current.lastDocSequence) || 0
    }));
  } catch {}
}

let printModPromise = null;
const loadPrintModule = () => (printModPromise ??= import('./print.js?v=20261123-hrga-workspace-18'));

let applicantModPromise = null;
const loadApplicantModule = () => (applicantModPromise ??= import('./applicant.js?v=20261123-hrga-workspace-18'));

let contractModalPromise = null;
const loadContractModalModule = () => (contractModalPromise ??= import('./contract-modal.js?v=20261123-hrga-workspace-18'));

let opsViewsPromise = null;
let opsViewsModuleRef = null;
const loadOpsViewsModule = () => (opsViewsPromise ??= import('./ops-views.js?v=20261123-hrga-workspace-18').then(mod => {
  opsViewsModuleRef = mod;
  return mod;
}));

let xlsxLibPromise = null;
const loadXlsxLib = () => (xlsxLibPromise ??= import('/vendor/xlsx.mjs')
  .then(m => (m.read ? m : m.default || m))
  .catch(() => import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm')));

let idlePreloadStarted = false;
function scheduleIdleModulePreload() {
  if (idlePreloadStarted) return;
  idlePreloadStarted = true;
  const warm = () => {
    void loadPrintModule().catch(() => {});
    void loadContractModalModule().catch(() => {});
    void loadApplicantModule().catch(() => {});
    void loadOpsViewsModule().catch(() => {});
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(warm, { timeout: 2500 });
  } else {
    setTimeout(warm, 900);
  }
}

const loginView = $('#login-view');
const shell = $('#admin-shell');
const content = $('#admin-content');
const sidebarEl = $('#workspace-sidebar');
const sidebarBackdrop = $('#sidebar-backdrop');

let applicants = [];
let stage1Leads = [];
let employees = [];
let interviews = [];
let invitedCandidates = [];
let cvScreenings = [];
let portalUsers = [];
let contractSettings = readSavedContractSettings();
let contractHistory = [];
let contractTablesMissing = false;
let interviewsTableMissing = false;
let invitedTableMissing = false;
let cvScreeningsTableMissing = false;
let interviewDateColMissing = false;
let interviewContractNoColMissing = false;
let stage1HasRecommendationCol = true;
let stage1HasSourceCol = true;
let employeesExtendedMissing = false;
let lastDataFetchedAt = 0;
let inflightRefreshPromise = null;
let bgRevalidatePromise = null;

let activeView = 'dashboard';
let adminDisplayName = 'HR Admin';
let currentUserId = null;
let currentAdminProfile = {
  userId: null,
  username: '',
  employeeNik: '',
  displayName: 'HR Admin',
  role: 'Superadmin',
  isRootAdmin: false
};
let printTemplates = [];
let editingApplicantId = null;
let stage2PositionsCache = [];
let adminEditorBinding = null;
let defaultMasterSyncPromise = null;
let pendingPrintRecord = null;
let pendingPrintSourceButton = null;

const DATA_CACHE_TTL_MS = 120000;
const SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000;
const SIDEBAR_STATE_KEY = 'hrga_sidebar_collapse_v1';
const SESSION_PROFILE_KEY = 'hrga_session_profile_v1';
const PRINTED_CONTRACTS_KEY = 'hrga_printed_contracts_v1';
const DEMO_CONTRACT_HISTORY_KEY = 'hrga_contract_history_demo_v1';
const DEMO_RECRUITMENT_SETTINGS_KEY = 'hrga_demo_recruitment_v1';
const DEMO_STAGE1_LEADS_KEY = 'hrga_demo_stage1_leads_v1';
const ROOT_ADMIN_VIEWS = new Set(['userManagement', 'contractSettings', 'recruitmentSettings', 'opsSettings', 'systemImport']);
let employeeSubTab = 'directory';
let lastEmployeeDelta = null;

function loadPrintedContractsMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(PRINTED_CONTRACTS_KEY) || '{}');
    if (raw && typeof raw === 'object') {
      return new Map(Object.entries(raw));
    }
  } catch {}
  return new Map();
}

function savePrintedContractsMap() {
  try {
    localStorage.setItem(PRINTED_CONTRACTS_KEY, JSON.stringify(Object.fromEntries(printedContractsMap.entries())));
  } catch {}
}

let printedContractsMap = loadPrintedContractsMap();

const TITLES = {
  dashboard: 'Dashboard',
  invited: 'Invited',
  stage1: 'Lead Register',
  stage2: 'Candidate List',
  stage3: 'DISC Assessment',
  interview: 'Interview Pipeline',
  tracking: 'Tracking & Report',
  employees: 'Employee Directory',
  contracts: 'Contracts',
  print: 'Application Print',
  settings: 'Template & OCR Settings',
  recruitmentSettings: 'Recruitment Settings',
  opsSettings: 'Operations & Formulas',
  userManagement: 'User Management',
  contractSettings: 'Contract Settings',
  systemImport: 'Data Import',
  attendanceSuite: 'Attendance Suite',
  attendanceUpload: 'Attendance Upload Center',
  attendanceCalendar: 'Calendar Settings',
  attendanceStaffHoliday: 'Conditional Holiday Schedule',
  attendanceStaffManagement: 'Staff Attendance Management',
  attendanceStaffReports: 'Staff Reports',
  attendanceDriverSchedule: 'Manual Driver Schedule',
  attendanceDriverManagement: 'Driver Attendance Management',
  attendanceDriverReports: 'Driver Reports',
  stationeryInput: 'Stationery Stock Movement',
  stationeryStock: 'Master Stock ATK',
  stationeryReports: 'Stationery Consumption & Purchase Plan',
  vehicleManagement: 'Vehicle Management',
  vehicleDatabase: 'Vehicle Database',
  vehicleExpenses: 'Vehicle Expenses',
  vehicleReports: 'Vehicle Reports'
};

const isDemoMode = (() => {
  try {
    const q = new URLSearchParams(location.search);
    return q.get('demo') === '1' || q.get('autostart') === '1';
  } catch {
    return false;
  }
})();

function seedDemoWorkspaceData() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const pad = n => String(n).padStart(2, '0');
  const isoDay = (yr, mo, dy) => `${yr}-${pad(mo)}-${pad(dy)}`;
  const nextMDate = new Date(Date.UTC(y, m, 1));
  const ny = nextMDate.getUTCFullYear();
  const nm = nextMDate.getUTCMonth() + 1;
  const laterMDate = new Date(Date.UTC(y, m + 5, 1));
  const ly = laterMDate.getUTCFullYear();
  const lm = laterMDate.getUTCMonth() + 1;

  let storedLeads = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(DEMO_STAGE1_LEADS_KEY) || '[]');
    if (Array.isArray(parsed)) storedLeads = parsed;
  } catch {}

  stage1Leads = [
    ...storedLeads,
    {
      id: 'lead-demo-1',
      full_name: 'Rizky Pratama',
      position: 'CNC',
      source: 'Jobstreet',
      whatsapp: '081234560011',
      recommendation: 'Recommended',
      experience_details: {
        _scoring: { totalScore: 85, maxScore: 100, percentageScore: 85, threshold: 60, scoringMode: 'percentage', recommended: true }
      },
      created_at: new Date().toISOString()
    }
  ];
  invitedCandidates = [];
  applicants = [
    {
      id: 'app-demo-1',
      full_name: 'Agus Nur Wahid',
      nik: '3514000000000184',
      position: 'Foreman Packing',
      stage: 'hired',
      created_at: new Date().toISOString(),
      application_data: {
        alamat_asal: 'Dusun III Sukajai, Kec. Bumi Ratu Nuban Lampung Tengah',
        telepon: '081290001184',
        tempat_lahir: 'Lampung Tengah',
        tanggal_lahir: '1994-05-12',
        pendidikan_terakhir: 'SMA',
        gender: 'L',
        agama: 'Islam'
      }
    },
    {
      id: 'app-demo-2',
      full_name: 'Budi Santoso',
      nik: '3514000000000299',
      position: 'Spray',
      stage: 'hired',
      created_at: new Date().toISOString(),
      application_data: {
        alamat_asal: 'Ds. Randupitu RT 02 RW 05, Kec. Gempol, Kab. Pasuruan',
        telepon: '081355667788',
        tempat_lahir: 'Pasuruan',
        tanggal_lahir: '1996-08-19',
        pendidikan_terakhir: 'SMK',
        gender: 'L',
        agama: 'Islam'
      }
    },
    {
      id: 'app-demo-3',
      full_name: 'Siti Aminah',
      nik: '3514000000000311',
      position: 'QC Finishing',
      stage: 'application_submitted',
      created_at: new Date().toISOString(),
      application_data: {
        alamat_asal: 'Kec. Pandaan, Kab. Pasuruan',
        telepon: '081233445566',
        gender: 'P'
      }
    }
  ];
  employees = [
    {
      id: 'emp-demo-exp-1',
      applicant_id: null,
      employee_no: 'ST 250112',
      full_name: 'Hendra Wijaya',
      department: 'Produksi / CNC',
      position: 'Operator CNC',
      employment_status: 'KONTRAK',
      join_date: isoDay(y - 1, m, 28),
      contract_start_date: isoDay(y - 1, m, 28),
      contract_end_date: isoDay(y, m, 27),
      address: 'Jl. Raya Pandaan No. 42, Kec. Pandaan, Kab. Pasuruan',
      ktp_nik: '3514122711950002',
      phone: '081330112233',
      salary: 4400000,
      notes: 'Contract No. 088/PKWT/XI/2025'
    },
    {
      id: 'emp-demo-exp-2',
      applicant_id: null,
      employee_no: 'ST 251204',
      full_name: 'Dewi Kartika',
      department: 'Purchasing',
      position: 'Staff Purchasing',
      employment_status: 'KONTRAK',
      join_date: isoDay(y - 1, nm, 15),
      contract_start_date: isoDay(y - 1, nm, 15),
      contract_end_date: isoDay(ny, nm, 14),
      address: 'Perum Pondok Sejahtera Blok C-9, Sidoarjo',
      ktp_nik: '3515085412970001',
      phone: '081222334455',
      salary: 5500000,
      notes: 'Contract No. 112/PKWT/XII/2025'
    },
    {
      id: 'emp-demo-later',
      applicant_id: null,
      employee_no: 'ST 260801',
      full_name: 'Ahmad Fauzi',
      department: 'Maintenance',
      position: 'Teknisi Listrik',
      employment_status: 'KONTRAK',
      join_date: isoDay(y, m, 1),
      contract_start_date: isoDay(y, m, 1),
      contract_end_date: isoDay(ly, lm, 15),
      address: 'Kec. Bangil, Kab. Pasuruan',
      ktp_nik: '3514090101930005',
      phone: '081777889900',
      salary: 5300000,
      notes: ''
    },
    {
      id: 'emp-demo-pic',
      applicant_id: null,
      employee_no: 'ST 130116',
      full_name: 'Diana Anita Sari',
      department: 'HRD & GA',
      position: 'Manager HRD & GA',
      employment_status: 'TETAP',
      join_date: '2013-01-16',
      contract_start_date: null,
      contract_end_date: null,
      address: 'Pasuruan',
      ktp_nik: '3514000000000001',
      phone: '08133193313',
      salary: 12000000,
      notes: ''
    }
  ];
  interviews = [
    {
      id: 'intv-demo-1',
      source_type: 'applicant',
      applicant_id: 'app-demo-1',
      candidate_name: 'Agus Nur Wahid',
      candidate_nik: '3514000000000184',
      candidate_whatsapp: '081290001184',
      applied_position: 'Foreman Packing',
      interview_stage: 'Final Interview',
      interview_date: isoDay(y, m, 2),
      pic_name: 'Diana Anita Sari',
      decision: 'Accepted',
      work_start_date: isoDay(y, m, 2),
      salary: 4400000,
      contract_duration_months: 12,
      contract_start_date: isoDay(y, m, 2),
      contract_end_date: isoDay(y + 1, m, 1),
      official_position: 'Foreman Packing',
      assigned_nik: 'MBM-2026-0184',
      contract_number: '184/PKWT/XI/2026',
      notes: 'Below UMK sample case'
    },
    {
      id: 'intv-demo-2',
      source_type: 'applicant',
      applicant_id: 'app-demo-2',
      candidate_name: 'Budi Santoso',
      candidate_nik: '3514000000000299',
      candidate_whatsapp: '081355667788',
      applied_position: 'Spray',
      interview_stage: 'Final Interview',
      interview_date: isoDay(y, m, 10),
      pic_name: 'Diana Anita Sari',
      decision: 'Accepted',
      work_start_date: isoDay(y, m, 15),
      salary: 5400000,
      contract_duration_months: 12,
      contract_start_date: isoDay(y, m, 15),
      contract_end_date: isoDay(y + 1, m, 14),
      official_position: 'Senior Spray Finishing',
      assigned_nik: 'MBM-2026-0201',
      contract_number: '201/PKWT/XI/2026',
      notes: 'Above UMK sample case'
    }
  ];
  contractSettings = readSavedContractSettings();
  try {
    const histRaw = JSON.parse(localStorage.getItem(DEMO_CONTRACT_HISTORY_KEY) || '[]');
    contractHistory = Array.isArray(histRaw) ? histRaw : [];
  } catch { contractHistory = []; }
  workspaceIndexesCache = null;
  lastDataFetchedAt = Date.now();
}


function say(message) {
  let element = $('#admin-toast');
  if (!element) {
    element = document.createElement('div');
    element.id = 'admin-toast';
    element.className = 'admin-toast';
    document.body.append(element);
  }
  element.textContent = message;
  element.classList.remove('hidden');
  clearTimeout(element._hideTimer);
  element._hideTimer = setTimeout(() => element.classList.add('hidden'), 3600);
}

function invalidateDataCache() {
  lastDataFetchedAt = 0;
  workspaceIndexesCache = null;
  cacheDelete('workspace_snapshot').catch(() => {});
}

function isMissingSchemaError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();
  return ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(code) ||
    msg.includes('does not exist') ||
    msg.includes('could not find the');
}


function fmtAge(applicant) {
  return applicant?.application_data?.umur ? `${esc(applicant.application_data.umur)} yrs` : '—';
}

function header(_title, _subtitle, actions = '') {
  return actions ? `<div class="page-intro"><div class="page-actions">${actions}</div></div>` : '';
}

function tableToolbar(placeholder = 'Search…', title = 'List', extraHtml = '') {
  return `<div class="panel-head"><h3>${esc(title)}</h3><div class="table-search">${extraHtml}<input id="table-search" type="search" placeholder="${esc(placeholder)}"></div></div>`;
}

function emptyRow(columns, message = 'No data available') {
  return `<tr><td colspan="${columns}" class="table-empty">${esc(message)}</td></tr>`;
}

let workspaceIndexesCache = null;
function getWorkspaceIndexes() {
  if (!workspaceIndexesCache) {
    workspaceIndexesCache = buildWorkspaceIndexes({
      applicants,
      employees,
      interviews,
      invitedCandidates,
      stage1Leads
    });
  }
  return workspaceIndexesCache;
}

function debounce(fn, delay = 180) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function renderPaginationFooter(slotEl, paged, onPageChange) {
  if (!slotEl) return;
  if (!paged || paged.totalItems <= 0) {
    slotEl.innerHTML = '';
    return;
  }
  const sizeVal = paged.pageSize === 'all' ? 'all' : String(paged.pageSize);
  slotEl.innerHTML = `<div class="table-pagination">
    <div class="pagination-info">Showing ${paged.startIndex}–${paged.endIndex} of ${paged.totalItems}</div>
    <div class="pagination-controls">
      <label>Rows:
        <select class="select page-size-select" data-pg-size aria-label="Rows per page">
          <option value="25" ${sizeVal === '25' ? 'selected' : ''}>25</option>
          <option value="50" ${sizeVal === '50' ? 'selected' : ''}>50</option>
          <option value="100" ${sizeVal === '100' ? 'selected' : ''}>100</option>
          <option value="all" ${sizeVal === 'all' ? 'selected' : ''}>All</option>
        </select>
      </label>
      <button type="button" class="btn btn-sm btn-secondary" data-pg-prev ${paged.page <= 1 ? 'disabled' : ''}>Prev</button>
      <span class="pagination-page-label">Page ${paged.page} / ${paged.totalPages}</span>
      <button type="button" class="btn btn-sm btn-secondary" data-pg-next ${paged.page >= paged.totalPages ? 'disabled' : ''}>Next</button>
    </div>
  </div>`;
  slotEl.querySelector('[data-pg-size]')?.addEventListener('change', e => {
    const val = e.target.value;
    onPageChange(1, val === 'all' ? 'all' : Number(val));
  });
  slotEl.querySelector('[data-pg-prev]')?.addEventListener('click', () => {
    if (paged.page > 1) onPageChange(paged.page - 1, paged.pageSize);
  });
  slotEl.querySelector('[data-pg-next]')?.addEventListener('click', () => {
    if (paged.page < paged.totalPages) onPageChange(paged.page + 1, paged.pageSize);
  });
}

function getEmployeeForApplicant(applicant) {
  const rel = Array.isArray(applicant?.employees) ? applicant.employees[0] : applicant?.employees;
  if (rel) return rel;
  return getWorkspaceIndexes().employeeByApplicantId.get(applicant?.id) || null;
}

function getDiscForApplicant(applicant) {
  return resolveSharedDiscForApplicant(applicant, applicants, getWorkspaceIndexes());
}

function getInterviewsForApplicant(applicantId, applicantObj = null) {
  const idx = getWorkspaceIndexes();
  const target = applicantObj || idx.applicantById.get(applicantId) || null;
  if (!target) return idx.interviewsByApplicantId.get(applicantId) || [];
  return resolveSharedInterviewsForApplicant(target, applicants, interviews, idx);
}

const APPLICATION_FIELD_LABELS = {
  nama: 'Full Name', nik: 'NIK', posisi: 'Applied Position', tempat_lahir: 'Birth Place', tanggal_lahir: 'Birth Date',
  gender: 'Gender', tinggi: 'Height (cm)', berat: 'Weight (kg)', gol_darah: 'Blood Type', agama: 'Religion',
  warga_negara: 'Nationality', telepon: 'WhatsApp / Phone', email: 'Email', alamat_provinsi: 'ID Card Province',
  alamat_kota_nama: 'ID Card City / Regency', alamat_kecamatan: 'District', alamat_desa: 'Village',
  alamat_tipe: 'Address Type', alamat_jalan: 'Street / Hamlet', alamat_rt: 'RT', alamat_rw: 'RW', alamat_kodepos: 'Postal Code',
  domisili_berbeda: 'Different Domicile', domisili: 'Domicile Address', status_kawin: 'Marital Status', hobby: 'Hobbies & Interests',
  ayah_nama: "Father's Name", ayah_umur: "Father's Age", ayah_pendidikan: "Father's Education", ayah_pekerjaan: "Father's Occupation",
  ibu_nama: "Mother's Name", ibu_umur: "Mother's Age", ibu_pendidikan: "Mother's Education", ibu_pekerjaan: "Mother's Occupation",
  saudara_count: 'Siblings Count', anak_count: 'Children Count', bahasa_count: 'Languages Count', kerja_count: 'Work History Count',
  pendidikan_terakhir: 'Latest Education', mulai_kerja: 'Available Start Date', gaji_harapan: 'Expected Salary',
  fasilitas_harapan: 'Expected Benefits', referensi1_nama: 'Emergency Contact Name', referensi1_alamat: 'Emergency Contact Address',
  referensi1_telepon: 'Emergency Contact Phone', referensi1_pekerjaan: 'Emergency Contact Occupation', referensi1_hubungan: 'Emergency Contact Relationship',
  jawaban1: 'Company Knowledge', jawaban2: 'Self Description', jawaban3: 'Planned Contribution',
  setuju: 'Declaration Agreement'
};

function applicationFieldLabel(key) {
  if (APPLICATION_FIELD_LABELS[key]) return APPLICATION_FIELD_LABELS[key];
  const repeat = String(key).match(/^(saudara|anak|bahasa|kerja)(\d+)_(.+)$/);
  if (repeat) {
    const [, group, index, field] = repeat;
    const groups = { saudara: 'Sibling', anak: 'Child', bahasa: 'Language', kerja: 'Work Experience' };
    const labels = {
      nama: 'Name', lp: 'Gender', umur: 'Age', pendidikan: 'Education', pekerjaan: 'Occupation',
      bicara: 'Speaking', baca: 'Reading', tulis: 'Writing', lainnya: 'Language Note',
      perusahaan: 'Company Name', periode_mulai: 'Start', periode_selesai: 'End',
      jabatan: 'Position', usaha: 'Industry', jumlah: 'Employees', atasan: 'Supervisor',
      gaji: 'Last Salary', alasan: 'Reason for Leaving'
    };
    const number = group === 'saudara' ? Number(index) - 1 : Number(index);
    return `${groups[group]} ${number} · ${labels[field] || field.replace(/_/g, ' ')}`;
  }
  return String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function displayApplicationValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(displayApplicationValue).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${applicationFieldLabel(key)}: ${displayApplicationValue(item)}`)
      .join(' · ');
  }
  return String(value);
}

function discGraphSvg(result) {
  const series = [['G1', result.g1, '#3b68d8'], ['G2', result.g2, '#26977d'], ['G3', result.g3, '#c69b54']];
  const xs = [24, 92, 160, 228];
  const y = value => Math.round(76 - (Math.max(-8, Math.min(8, Number(value) || 0)) + 8) * 3.35);
  const lines = series.map(([_name, values, color]) => {
    const points = values.map((value, index) => `${xs[index]},${y(value)}`).join(' ');
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>${values.map((value, index) => `<circle cx="${xs[index]}" cy="${y(value)}" r="3" fill="${color}"/>`).join('')}`;
  }).join('');
  return `<div class="disc-mini-graph"><svg viewBox="0 0 252 104" role="img" aria-label="DISC score chart for D, I, S, C"><line x1="15" y1="49" x2="237" y2="49" stroke="#cbd4e1" stroke-dasharray="3 4"/><line x1="15" y1="15" x2="237" y2="15" stroke="#edf0f5"/><line x1="15" y1="83" x2="237" y2="83" stroke="#edf0f5"/>${lines}${['D', 'I', 'S', 'C'].map((letter, index) => `<text x="${xs[index]}" y="99" text-anchor="middle">${letter}</text>`).join('')}</svg><div class="disc-graph-legend"><span><i class="g1"></i>G1</span><span><i class="g2"></i>G2</span><span><i class="g3"></i>G3</span></div></div>`;
}

function applicantRows(rows, action = 'print') {
  if (!rows.length) return emptyRow(action === 'both' ? 7 : 5);
  const idx = getWorkspaceIndexes();
  return rows.map(applicant => {
    const employee = getEmployeeForApplicant(applicant);
    const disc = getDiscForApplicant(applicant);
    const progress = deriveCandidateProgress(applicant, getInterviewsForApplicant(applicant.id, applicant), employee, null, { applicants, indexes: idx, sharedDisc: disc });
    let graph = '<span class="status-pill gray">No graph yet</span>';
    let personality = '—';
    if (disc?.answers) {
      const result = getMemoizedDiscResult(disc, computeDisc);
      if (result) {
        const natural = result.pola[2];
        graph = discGraphSvg(result);
        personality = `<b>${esc(natural.title)}</b><small class="table-subline">${esc(natural.nama)} · Dominant ${esc(result.hurufDominan)}</small>`;
      } else {
        graph = '<span class="status-pill gray">Check result</span>';
        personality = 'Needs review';
      }
    }
    return `<tr><td><b class="cell-clamp-2" title="${esc(applicant.full_name)}">${esc(applicant.full_name)}</b><small class="table-subline">${esc(applicant.nik)}</small></td>
      <td><div class="cell-clamp-2" title="${esc(applicant.position || '—')}">${esc(applicant.position || '—')}</div></td><td>${fmtAge(applicant)}</td>
      <td><span class="status-pill ${progress.tone}">${esc(progress.label)}</span></td>
      ${action === 'both' ? `<td>${graph}</td><td>${personality}</td>` : ''}
      <td><div class="row-actions"><button class="icon-btn" data-print="${esc(applicant.id)}">Print</button></div></td></tr>`;
  }).join('');
}

function bindSearch(selector, rerender, delay = 180) {
  const input = $(selector);
  if (!input) return;
  const run = debounce(() => rerender(input.value.trim().toLowerCase()), delay);
  input.addEventListener('input', run);
}

async function fetchEmployeesSafe() {
  const fullCols = 'id,applicant_id,employee_no,full_name,department,position,employment_status,join_date,contract_start_date,contract_end_date,address,ktp_nik,birth_place,birth_date,phone,education,gender,religion,salary,notes,created_at,updated_at';
  let res = await supabase.from('employees').select(fullCols).order('created_at', { ascending: false }).limit(1000);
  if (res.error && isMissingSchemaError(res.error)) {
    employeesExtendedMissing = true;
    res = await supabase.from('employees')
      .select('id,applicant_id,employee_no,department,position,employment_status,join_date,notes,created_at,updated_at')
      .order('created_at', { ascending: false }).limit(1000);
  } else {
    employeesExtendedMissing = false;
  }
  if (res.error) throw res.error;
  return res.data || [];
}

async function fetchStage1Safe() {
  stage1HasSourceCol = true;
  stage1HasRecommendationCol = true;
  let res = await supabase.from('candidate_stage1_applications')
    .select('id,full_name,position,source,whatsapp,experience_details,cv_path,cv_filename,recommendation,recommendation_notes,status,created_at')
    .order('created_at', { ascending: false }).limit(500);
  if (res.error && isMissingSchemaError(res.error)) {
    stage1HasSourceCol = false;
    res = await supabase.from('candidate_stage1_applications')
      .select('id,full_name,position,whatsapp,experience_details,cv_path,cv_filename,recommendation,recommendation_notes,status,created_at')
      .order('created_at', { ascending: false }).limit(500);
    if (res.error && isMissingSchemaError(res.error)) {
      stage1HasRecommendationCol = false;
      res = await supabase.from('candidate_stage1_applications')
        .select('id,full_name,position,whatsapp,experience_details,cv_path,cv_filename,status,created_at')
        .order('created_at', { ascending: false }).limit(500);
    }
  }
  if (res.error) throw res.error;
  return (res.data || []).map(item => ({
    ...item,
    source: item.source || '',
    recommendation: normalizeLeadRecommendation(
      item.recommendation || (
        item.status === 'invited' ? 'Recommended'
          : item.status === 'rejected' ? 'Not Recommended'
            : 'Pending'
      )
    )
  }));
}

async function fetchInterviewsSafe() {
  const res = await supabase.from('candidate_interviews')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (res.error) {
    if (isMissingSchemaError(res.error)) {
      interviewsTableMissing = true;
      return [];
    }
    throw res.error;
  }
  interviewsTableMissing = false;
  return res.data || [];
}

async function fetchInvitedSafe() {
  const res = await supabase.from('invited_candidates')
    .select('*')
    .order('invite_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000);
  if (res.error) {
    if (isMissingSchemaError(res.error)) {
      invitedTableMissing = true;
      return [];
    }
    throw res.error;
  }
  invitedTableMissing = false;
  return res.data || [];
}

async function fetchCvScreeningsSafe() {
  const res = await supabase.from('cv_screenings')
    .select('*')
    .order('source', { ascending: true })
    .limit(200);
  if (res.error) {
    if (isMissingSchemaError(res.error)) {
      cvScreeningsTableMissing = true;
      return [];
    }
    throw res.error;
  }
  cvScreeningsTableMissing = false;
  return res.data || [];
}

function stripEmbeddedKtpPhoto(rows = []) {
  return (rows || []).map(row => {
    if (row?.application_data && row.application_data.ktp_foto) {
      const copy = { ...row.application_data };
      delete copy.ktp_foto;
      return { ...row, application_data: copy };
    }
    return row;
  });
}

async function fetchApplicantsLean() {
  try {
    const { data, error } = await supabase.rpc('list_applicants_lean');
    if (!error && Array.isArray(data)) {
      return stripEmbeddedKtpPhoto(data);
    }
    if (error && !isMissingSchemaError(error) && !String(error.message || '').includes('list_applicants_lean')) {
      throw error;
    }
  } catch (err) {
    if (!isMissingSchemaError(err) && !String(err?.message || '').includes('list_applicants_lean')) {
      throw err;
    }
  }
  const candidateResult = await supabase.from('applicants')
    .select('id,full_name,nik,position,stage,application_data,cv_path,ktp_path,created_at,disc_submissions(id,answers,completed_at),employees(id)')
    .order('created_at', { ascending: false }).limit(1000);
  if (candidateResult.error) throw candidateResult.error;
  return stripEmbeddedKtpPhoto(candidateResult.data || []);
}

function computeSnapshotSignature() {
  const latest = list => {
    if (!Array.isArray(list) || !list.length) return '0';
    const first = list[0];
    return `${list.length}:${first?.updated_at || first?.created_at || first?.id || ''}`;
  };
  return [
    latest(applicants),
    latest(employees),
    latest(stage1Leads),
    latest(interviews),
    latest(invitedCandidates),
    latest(cvScreenings),
    interviewsTableMissing ? 1 : 0,
    invitedTableMissing ? 1 : 0,
    cvScreeningsTableMissing ? 1 : 0,
    employeesExtendedMissing ? 1 : 0
  ].join('|');
}

function hydrateSnapshotIntoMemory(snapshot, savedAt) {
  if (!snapshot) return false;
  applicants = Array.isArray(snapshot.applicants) ? snapshot.applicants : [];
  employees = Array.isArray(snapshot.employees) ? snapshot.employees : [];
  stage1Leads = Array.isArray(snapshot.stage1Leads) ? snapshot.stage1Leads : [];
  interviews = Array.isArray(snapshot.interviews) ? snapshot.interviews : [];
  invitedCandidates = Array.isArray(snapshot.invitedCandidates) ? snapshot.invitedCandidates : [];
  cvScreenings = Array.isArray(snapshot.cvScreenings) ? snapshot.cvScreenings : [];
  interviewsTableMissing = Boolean(snapshot.interviewsTableMissing);
  invitedTableMissing = Boolean(snapshot.invitedTableMissing);
  cvScreeningsTableMissing = Boolean(snapshot.cvScreeningsTableMissing);
  stage1HasRecommendationCol = snapshot.stage1HasRecommendationCol !== false;
  employeesExtendedMissing = Boolean(snapshot.employeesExtendedMissing);
  workspaceIndexesCache = null;
  lastDataFetchedAt = savedAt || Date.now();
  return true;
}

async function fetchAndCacheFreshSnapshot() {
  if (inflightRefreshPromise) return inflightRefreshPromise;
  const prevSignature = computeSnapshotSignature();
  inflightRefreshPromise = (async () => {
    const [appRows, empRows, leadRows, intRows, invRows, scrRows] = await Promise.all([
      fetchApplicantsLean(),
      fetchEmployeesSafe(),
      fetchStage1Safe(),
      fetchInterviewsSafe(),
      fetchInvitedSafe(),
      fetchCvScreeningsSafe()
    ]);
    applicants = appRows;
    employees = empRows;
    stage1Leads = leadRows;
    interviews = intRows;
    invitedCandidates = invRows;
    cvScreenings = scrRows;
    workspaceIndexesCache = null;
    lastDataFetchedAt = Date.now();
    const changed = computeSnapshotSignature() !== prevSignature;
    void cacheSet('workspace_snapshot', {
      applicants,
      employees,
      stage1Leads,
      interviews,
      invitedCandidates,
      cvScreenings,
      interviewsTableMissing,
      invitedTableMissing,
      cvScreeningsTableMissing,
      stage1HasRecommendationCol,
      employeesExtendedMissing
    }).catch(() => {});
    return { changed };
  })().finally(() => {
    inflightRefreshPromise = null;
  });
  return inflightRefreshPromise;
}

function triggerBackgroundRevalidate() {
  if (bgRevalidatePromise || inflightRefreshPromise) return;
  bgRevalidatePromise = fetchAndCacheFreshSnapshot()
    .then(result => {
      if (result && !result.changed) return;
      const activeTag = document.activeElement?.tagName;
      const isEditingInContent = Boolean(
        content?.contains(document.activeElement) &&
        (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT')
      );
      const hasOpenModal = Boolean($('.modal-backdrop:not(.hidden)'));
      const searchVal = $('#table-search')?.value?.trim();
      const autoRefreshViews = new Set(['dashboard', 'invited', 'stage1', 'stage2', 'stage3', 'interview', 'tracking', 'employees', 'contracts', 'print']);
      if (!isEditingInContent && !hasOpenModal && !searchVal && autoRefreshViews.has(activeView) && !shell.classList.contains('hidden')) {
        if (activeView === 'dashboard') renderDashboard();
        else if (activeView === 'invited') renderInvitedView();
        else if (activeView === 'stage1') renderStage1();
        else if (activeView === 'stage2') renderStage2();
        else if (activeView === 'stage3') renderStage3();
        else if (activeView === 'interview') renderInterviewView();
        else if (activeView === 'tracking') renderTrackingView();
        else if (activeView === 'employees') renderEmployees();
        else if (activeView === 'contracts') renderContractsView();
        else if (activeView === 'print') renderPrint();
      }
    })
    .catch(() => {})
    .finally(() => { bgRevalidatePromise = null; });
}

async function refreshData(force = false) {
  if (isDemoMode) {
    if (!lastDataFetchedAt || force) seedDemoWorkspaceData();
    return;
  }
  if (!force && lastDataFetchedAt && (Date.now() - lastDataFetchedAt) < DATA_CACHE_TTL_MS) {
    return;
  }
  if (!force && !lastDataFetchedAt) {
    const cached = await cacheGet('workspace_snapshot', { maxAgeMs: SNAPSHOT_MAX_AGE_MS });
    if (cached?.value && hydrateSnapshotIntoMemory(cached.value, cached.savedAt)) {
      if (cached.stale || (Date.now() - cached.savedAt) >= DATA_CACHE_TTL_MS) {
        triggerBackgroundRevalidate();
      }
      return;
    }
  }
  if (!force && lastDataFetchedAt) {
    triggerBackgroundRevalidate();
    return;
  }
  await fetchAndCacheFreshSnapshot();
}

function renderDashboard() {
  const total = applicants.length;
  const stage1 = stage1Leads.length;
  const stage2 = applicants.filter(a => a.stage === 'application_submitted').length;
  const stage3 = applicants.filter(a => a.stage === 'disc_completed').length;
  const interviewCount = new Set(interviews.map(i => i.applicant_id || i.stage1_id).filter(Boolean)).size;
  const hired = employees.length;
  const rejected = applicants.filter(a => a.stage === 'rejected').length;
  const submitted = stage2 + stage3 + applicants.filter(a => ['stage4_pending', 'os_sent', 'hired'].includes(a.stage)).length;
  const discDone = applicants.filter(a => Boolean(getDiscForApplicant(a)) || a.stage === 'disc_completed').length;
  const stages = [
    ['Lead Register', stage1, 'stage-muted'],
    ['Form Submitted', stage2, 'stage-blue'],
    ['DISC Completed', stage3, 'stage-teal'],
    ['Interview Pipeline', interviewCount, 'stage-gold'],
    ['Employees', hired, 'stage-green'],
    ['Not Proceeding', rejected, 'stage-muted']
  ];
  const positionCounts = new Map();
  applicants.forEach(item => {
    const position = String(item.position || 'Unspecified').trim();
    positionCounts.set(position, (positionCounts.get(position) || 0) + 1);
  });
  const topPositions = [...positionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxPosition = Math.max(1, ...topPositions.map(item => item[1]));
  const recent = applicants.slice(0, 7);
  const attentionItems = buildDashboardAttentionItems({
    employees,
    interviews,
    applicants,
    stage1Leads,
    invitedCandidates,
    contractRequests: [],
    isRootAdmin: isRootAdminAccount(currentAdminProfile)
  });
  const totalAttentionCount = attentionItems.reduce((sum, item) => sum + item.count, 0);
  const attentionHtml = attentionItems.length
    ? `<div class="attention-grid">${attentionItems.map(item => `
        <button type="button" class="attention-card is-${esc(item.severity)}" data-view="${esc(item.targetView)}">
          <div class="attention-card-top">
            <span class="attention-category">${esc(item.category)}</span>
            <span class="attention-count">${item.count}</span>
          </div>
          <div class="attention-title">${esc(item.title)}</div>
          <div class="attention-desc">${esc(item.description)}</div>
          <div class="attention-cta">${esc(item.ctaLabel)} <span aria-hidden="true">↗</span></div>
        </button>`).join('')}</div>`
    : `<div class="attention-empty">
        <div>
          <b>All caught up</b>
          <p>No contracts expiring within 2 months and no pending items requiring action.</p>
        </div>
        <button type="button" class="btn btn-secondary" data-view="contracts">Open Contracts ↗</button>
      </div>`;

  content.innerHTML = `
    <section class="dashboard-atelier-hero" aria-label="Workspace overview">
      <img class="atelier-hero-img" src="assets/img/interior-atelier-banner.jpg" alt="PT. Mitra Binamandiri Makmur showroom and interior studio">
      <div class="atelier-hero-scrim" aria-hidden="true"></div>
      <div class="atelier-hero-content">
        <p class="atelier-hero-kicker">PT. Mitra Binamandiri Makmur</p>
        <h1 class="atelier-hero-title">Welcome, ${esc(adminDisplayName)}</h1>
        <div class="atelier-hero-meta">
          <span><b>${total}</b> recorded candidates</span>
          <span aria-hidden="true">·</span>
          <span><b>${submitted}</b> forms submitted</span>
          <span aria-hidden="true">·</span>
          <span><b>${hired}</b> active employees</span>
        </div>
      </div>
    </section>
    <section class="workspace-modules" aria-label="Workspace modules">
      <button type="button" class="workspace-module" data-view="interview" data-module="attendance">
        <span class="workspace-module-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
        <span class="workspace-module-copy"><b>Interview Pipeline</b><span>HR 1 · HR 2 · User · Final</span></span>
        <span class="workspace-module-arrow" aria-hidden="true">↗</span>
      </button>
      <button type="button" class="workspace-module" data-view="contracts" data-module="vehicle">
        <span class="workspace-module-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg></span>
        <span class="workspace-module-copy"><b>Contracts &amp; PKWT</b><span>Expiring Renewals &amp; Final Interview</span></span>
        <span class="workspace-module-arrow" aria-hidden="true">↗</span>
      </button>
    </section>
    <section class="panel dashboard-attention-panel" aria-label="Needs Attention">
      <div class="panel-head">
        <h3>Needs Attention</h3>
        <span class="status-pill ${totalAttentionCount > 0 ? 'gold' : 'green'}">${totalAttentionCount} item${totalAttentionCount === 1 ? '' : 's'}</span>
      </div>
      ${attentionHtml}
    </section>
    <section class="dashboard-metrics" aria-label="Recruitment metrics">
      <article class="stat-card"><div class="stat-top"><span>Lead Register</span><span class="stat-icon-tile" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></span></div><div class="stat-number">${stage1}</div><div class="stat-note">Initial incoming leads</div></article>
      <article class="stat-card"><div class="stat-top"><span>Forms Submitted</span><span class="stat-icon-tile walnut" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span></div><div class="stat-number">${submitted}</div><div class="stat-note">Stage 2 applications</div></article>
      <article class="stat-card"><div class="stat-top"><span>DISC Completed</span><span class="stat-icon-tile" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></span></div><div class="stat-number">${discDone}</div><div class="stat-note">Completed DISC tests</div></article>
      <article class="stat-card"><div class="stat-top"><span>Employees</span><span class="stat-icon-tile walnut" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg></span></div><div class="stat-number">${hired}</div><div class="stat-note">Employee Directory</div></article>
    </section>
    <div id="recruitment-routemap" class="dashboard-v2-grid">
      <section class="panel dashboard-process-panel">
        <div class="panel-head"><h3>Recruitment Routemap</h3><span class="dashboard-total">${total} candidates</span></div>
        <div class="dashboard-process-list">${stages.map(([label, value, tone]) => `<div class="dashboard-process-row"><div class="dashboard-process-copy"><span>${esc(label)}</span><b>${value}</b></div><div class="dashboard-process-track"><span class="${tone}" style="width:${Math.max(0, Math.min(100, (value / Math.max(1, total, stage1)) * 100))}%"></span></div></div>`).join('')}</div>
      </section>
      <section class="panel dashboard-position-panel">
        <div class="panel-head"><h3>Applicants by Position</h3></div>
        <div class="dashboard-position-list">${topPositions.length ? topPositions.map(([name, value]) => `<div class="dashboard-position-row"><div><span>${esc(name)}</span><div class="dashboard-process-track"><span style="width:${value / maxPosition * 100}%"></span></div></div><b>${value}</b></div>`).join('') : '<div class="dashboard-empty">No position data</div>'}</div>
      </section>
    </div>
    <section class="panel table-panel dashboard-recent-panel">
      <div class="panel-head"><h3>Recent Applicants</h3><button class="btn btn-secondary" id="refresh-dashboard">Refresh ↻</button></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>APPLICANT</th><th>POSITION</th><th>AGE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${applicantRows(recent, 'print')}</tbody></table></div>
    </section>`;
  bindPrint();
  $('#refresh-dashboard')?.addEventListener('click', () => loadView('dashboard', true));
  $$('#admin-content [data-view]').forEach(button => button.addEventListener('click', () => loadView(button.dataset.view)));
  scheduleIdleModulePreload();
}

/* ============================================================================
 * LEAD REGISTER (stage1) — Connected live status synced with Candidate List
 * ============================================================================ */
function getLeadScoreDisplay(row) {
  const sc = row?.experience_details?._scoring;
  if (!sc || typeof sc !== 'object' || sc.totalScore === undefined) {
    return {
      html: '<span class="status-pill muted">—</span>',
      searchText: ''
    };
  }
  const pts = Number(sc.totalScore || 0);
  const maxPts = Number(sc.maxScore || 0);
  const pct = Number(sc.percentageScore ?? (maxPts > 0 ? Math.round((pts / maxPts) * 100) : 0));
  const qualified = Boolean(sc.recommended);
  const badgeTone = qualified ? 'green' : 'gold';
  const badgeLabel = qualified ? 'Qualified' : 'Below Min';
  return {
    html: `<div class="score-cell-stack"><span><b>${esc(pts)}</b>/${esc(maxPts)} (${esc(pct)}%)</span><span class="status-pill ${badgeTone}">${badgeLabel}</span></div>`,
    searchText: `${pts} ${maxPts} ${pct}% ${badgeLabel}`
  };
}

function renderStage1() {
  const idx = getWorkspaceIndexes();
  const entries = stage1Leads.map(row => {
    const unified = resolveLeadUnifiedStatus(row, {
      applicants,
      interviews,
      employees,
      invitedCandidates,
      indexes: idx
    });
    const scoreDisplay = getLeadScoreDisplay(row);
    return {
      row,
      unified,
      scoreDisplay,
      searchText: `${row.full_name} ${row.position} ${row.source || ''} ${row.whatsapp} ${scoreDisplay.searchText} ${unified.label}`.toLowerCase()
    };
  });

  const renderLeadRows = list => {
    if (!list.length) return emptyRow(7, 'No lead records yet');
    return list.map(({ row, unified, scoreDisplay }) => `<tr>
      <td><b>${esc(row.full_name)}</b></td>
      <td>${esc(row.position || '-')}</td>
      <td>${esc(row.source || '-')}</td>
      <td>${esc(row.whatsapp || '-')}</td>
      <td data-stage1-score="${esc(row.id)}">${scoreDisplay.html}</td>
      <td>${row.cv_path ? `<button class="icon-btn" data-stage1-cv="${esc(row.id)}">Open CV</button>` : '-'}</td>
      <td data-stage1-status="${esc(row.id)}"><span class="status-pill ${unified.tone}">${esc(unified.label)}</span></td>
    </tr>`).join('');
  };

  let currentQuery = '';
  let currentPage = 1;
  let currentPageSize = 50;

  const paint = () => {
    const filtered = currentQuery ? entries.filter(e => e.searchText.includes(currentQuery)) : entries;
    const paged = paginateRows(filtered, currentPage, currentPageSize);
    currentPage = paged.page;
    $('#stage1-rows').innerHTML = renderLeadRows(paged.items);
    renderPaginationFooter($('#stage1-pager'), paged, (nextPage, nextSize) => {
      currentPage = nextPage;
      currentPageSize = nextSize;
      paint();
    });
    bindStage1Actions(stage1Leads);
  };

  content.innerHTML = header('Lead Register', '', '<button class="btn btn-secondary" id="refresh-stage1">Refresh ↻</button>') +
    `<section class="panel table-panel">${tableToolbar('Search name / position / source / score / status…', 'Lead Register')}
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>APPLICANT NAME</th><th>POSITION</th><th>SOURCE</th><th>WHATSAPP NO.</th><th>SCORE</th><th>CV</th><th>STATUS</th></tr></thead>
        <tbody id="stage1-rows"></tbody>
      </table></div><div id="stage1-pager"></div></section>`;
  $('#refresh-stage1')?.addEventListener('click', () => loadView('stage1', true));
  paint();
  bindSearch('#table-search', query => {
    currentQuery = query;
    currentPage = 1;
    paint();
  });
}

function bindStage1Actions(rows) {
  $$('[data-stage1-cv]').forEach(button => button.addEventListener('click', () => {
    const record = rows.find(item => item.id === button.dataset.stage1Cv);
    if (!record?.cv_path) { say('CV file path not found.'); return; }
    openSignedDocumentInNewTab('candidate-stage1-cv', record.cv_path, 'CV', button);
  }));
}

async function renderSettings() {
  const [ocrResult, positions, tplError] = await Promise.all([
    supabase.from('portal_settings').select('value').eq('key', 'ktp_ocr_enabled').maybeSingle(),
    loadPositionList(),
    loadPrintTemplates()
  ]);
  if (ocrResult.error) throw ocrResult.error;
  const enabled = ocrResult.data?.value === true;
  content.innerHTML = `<div class="settings-stack">
    <section class="panel settings-panel">
      <div class="settings-row">
        <div>
          <h3 class="settings-title">ID Card Scanning (OCR)</h3>
          <p class="settings-sub">Enable automatic ID card scanning for the Stage 2 candidate application form.</p>
        </div>
        <label class="settings-toggle" for="ocr-feature-toggle">
          <span>${enabled ? 'Enabled' : 'Disabled'}</span>
          <input id="ocr-feature-toggle" type="checkbox" ${enabled ? 'checked' : ''}>
        </label>
      </div>
    </section>
    ${positionManagerHtml(positions)}
    ${templateManagerHtml(tplError)}
  </div>`;
  $('#ocr-feature-toggle').addEventListener('change', async event => {
    const value = event.target.checked;
    const { error: upsertErr } = await supabase.from('portal_settings')
      .upsert({ key: 'ktp_ocr_enabled', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (upsertErr) { event.target.checked = !value; say(upsertErr.message); }
    else { say(value ? 'OCR enabled.' : 'OCR disabled.'); loadView('settings'); }
  });
  bindPositionManager(positions);
  bindTemplateManager(Boolean(tplError));
}

/* ============================================================================
 * CANDIDATE LIST (stage2) — Live unified STATUS, Actions: Edit, Delete, Duplicate
 * ============================================================================ */
const STAGE2_FIELD_ORDER = [
  'tempat_lahir', 'tanggal_lahir', 'gender', 'gol_darah', 'agama', 'warga_negara',
  'alamat_provinsi', 'alamat_kota_nama', 'alamat_kecamatan', 'alamat_desa', 'alamat_tipe', 'alamat_jalan', 'alamat_rt', 'alamat_rw', 'alamat_kodepos', 'domisili_berbeda', 'domisili',
  'telepon', 'email', 'tinggi', 'berat',
  'ayah_nama', 'ayah_umur', 'ayah_pendidikan', 'ayah_pekerjaan', 'ibu_nama', 'ibu_umur', 'ibu_pendidikan', 'ibu_pekerjaan',
  'saudara_count', 'saudara2_nama', 'saudara2_lp', 'saudara2_umur', 'saudara2_pendidikan', 'saudara2_pekerjaan',
  'saudara3_nama', 'saudara3_lp', 'saudara3_umur', 'saudara3_pendidikan', 'saudara3_pekerjaan',
  'saudara4_nama', 'saudara4_lp', 'saudara4_umur', 'saudara4_pendidikan', 'saudara4_pekerjaan',
  'status_kawin', 'pasangan_nama', 'pasangan_lp', 'pasangan_umur', 'pasangan_pendidikan', 'pasangan_pekerjaan', 'anak_count',
  'anak1_nama', 'anak1_lp', 'anak1_umur', 'anak1_pendidikan', 'anak1_pekerjaan',
  'anak2_nama', 'anak2_lp', 'anak2_umur', 'anak2_pendidikan', 'anak2_pekerjaan',
  'anak3_nama', 'anak3_lp', 'anak3_umur', 'anak3_pendidikan', 'anak3_pekerjaan',
  'pendidikan_terakhir', 'sd_instansi', 'sd_kota', 'sd_lulus', 'smp_instansi', 'smp_kota', 'smp_lulus',
  'sma_instansi', 'sma_kota', 'sma_jurusan', 'sma_lulus', 'diploma_instansi', 'diploma_kota', 'diploma_jurusan', 'diploma_lulus',
  'universitas_instansi', 'universitas_kota', 'universitas_jurusan', 'universitas_lulus',
  'bahasa_count', 'bahasa1', 'bahasa1_bicara', 'bahasa1_baca', 'bahasa1_tulis', 'bahasa1_lainnya',
  'bahasa2', 'bahasa2_bicara', 'bahasa2_baca', 'bahasa2_tulis', 'bahasa2_lainnya',
  'bahasa3', 'bahasa3_bicara', 'bahasa3_baca', 'bahasa3_tulis', 'bahasa3_lainnya',
  'bahasa4', 'bahasa4_bicara', 'bahasa4_baca', 'bahasa4_tulis', 'bahasa4_lainnya', 'hobby', 'kerja_count',
  ...[1, 2, 3].flatMap(i => ['perusahaan', 'periode_mulai', 'periode_selesai', 'jabatan', 'usaha', 'jumlah', 'atasan', 'gaji', 'alasan'].map(key => `kerja${i}_${key}`)),
  'mulai_kerja', 'gaji_harapan', 'fasilitas_harapan',
  'referensi1_nama', 'referensi1_alamat', 'referensi1_telepon', 'referensi1_pekerjaan', 'referensi1_hubungan',
  'jawaban1', 'jawaban2', 'jawaban3', 'setuju'
];
const STAGE2_FIELD_RANK = new Map(STAGE2_FIELD_ORDER.map((key, index) => [key, index]));

function stage2FieldKeys(rows) {
  const excluded = new Set([
    'nama', 'nik', 'posisi', 'ktp_foto', 'ktp_path', 'cv_path', 'alamat_asal',
    'alamat_provinsi_id', 'alamat_kota_id', 'alamat_kecamatan_id', 'alamat_desa_id',
    'alamat_kota_jenis', 'alamat_wilayah_type', 'umur', 'nama_terang',
    'saudara1_nama', 'saudara1_lp', 'saudara1_umur', 'saudara1_pendidikan', 'saudara1_pekerjaan',
    '__form_step', '__saved_at', '__cv_filename', '__cv_path', '__duplicated_from_id', '__duplicated_from_position'
  ]);
  const keys = new Set();
  rows.forEach(row => Object.keys(row.application_data || {}).forEach(key => {
    if (excluded.has(key) || key.startsWith('__') || key.endsWith('_id')) return;
    keys.add(key);
  }));
  return [...keys].sort((a, b) => {
    const ra = STAGE2_FIELD_RANK.get(a);
    const rb = STAGE2_FIELD_RANK.get(b);
    if (ra !== undefined || rb !== undefined) return (ra ?? Number.MAX_SAFE_INTEGER) - (rb ?? Number.MAX_SAFE_INTEGER);
    const ma = a.match(/^(saudara|anak|bahasa|kerja)(\d+)_/);
    const mb = b.match(/^(saudara|anak|bahasa|kerja)(\d+)_/);
    if (ma && mb && ma[1] === mb[1] && Number(ma[2]) !== Number(mb[2])) return Number(ma[2]) - Number(mb[2]);
    return applicationFieldLabel(a).localeCompare(applicationFieldLabel(b), 'en', { numeric: true, sensitivity: 'base' });
  });
}

const STAGE2_COMPACT_FIELDS = new Set(['tanggal_lahir', 'gender', 'gol_darah', 'agama', 'warga_negara', 'tinggi', 'berat', 'alamat_rt', 'alamat_rw', 'alamat_kodepos', 'domisili_berbeda', 'saudara_count', 'anak_count', 'bahasa_count', 'kerja_count', 'setuju', 'mulai_kerja']);

function stage2CellClass(key) {
  if (STAGE2_COMPACT_FIELDS.has(key) || /^(saudara|anak)\d+_(lp|umur)$|_lulus$|_umur$|_periode_(mulai|selesai)$/.test(key)) return 'col-compact-cell';
  if (/^(telepon|email|referensi\d+_telepon)$/.test(key)) return 'col-contact-cell';
  if (/^(alamat_jalan|domisili|hobby|fasilitas_harapan|jawaban\d+|referensi\d+_alamat)$|^kerja\d+_(perusahaan|jabatan|usaha|alasan)$/.test(key)) return 'col-wide-cell';
  return '';
}

function stage2RowHtml(row, keys, idx = getWorkspaceIndexes()) {
  const data = row.application_data || {};
  const pos = row.position || data.posisi || '—';
  const progress = deriveCandidateProgress(row, getInterviewsForApplicant(row.id, row), getEmployeeForApplicant(row), null, { applicants, indexes: idx });
  return `<tr><td><b class="cell-clamp-2" title="${esc(row.full_name)}">${esc(row.full_name)}</b><small class="table-subline">${esc(row.nik)}</small></td>
    <td><div class="cell-clamp-2" title="${esc(pos)}">${esc(pos)}</div></td>
    ${keys.map(key => {
      const val = displayApplicationValue(data[key]);
      const cls = stage2CellClass(key);
      return `<td${cls ? ` class="${cls}"` : ''}><div class="cell-clamp-2" title="${esc(val)}">${esc(val)}</div></td>`;
    }).join('')}
    <td>${row.ktp_path ? `<button class="icon-btn" data-stage2-ktp="${esc(row.id)}">Open ID Card</button>` : '—'}</td>
    <td>${row.cv_path ? `<button class="icon-btn" data-stage2-cv="${esc(row.id)}">Open CV</button>` : '—'}</td>
    <td><span class="status-pill ${progress.tone}">${esc(progress.label)}</span></td>
    <td><div class="row-actions stage2-actions">
      <button class="icon-btn" data-stage2-edit="${esc(row.id)}">Edit</button>
      <button class="icon-btn" data-stage2-dup="${esc(row.id)}">Duplicate</button>
      <button class="icon-btn danger" data-stage2-delete="${esc(row.id)}">Delete</button>
    </div></td></tr>`;
}

function openSignedDocumentInNewTab(bucket, path, label, button) {
  const tab = window.open('about:blank', '_blank');
  if (!tab) { say('Document tab was blocked by your browser. Please allow pop-ups and retry.'); return; }
  try {
    tab.opener = null;
    tab.document.title = `Preparing ${label}`;
    tab.document.body.innerHTML = `<p style="font:14px Arial,sans-serif;padding:24px;color:#243238">Preparing document…</p>`;
  } catch {}
  const original = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Opening…'; }
  supabase.storage.from(bucket).createSignedUrl(path, 300).then(({ data, error }) => {
    if (error) throw error;
    if (!data?.signedUrl) throw new Error(`Unable to generate link for ${label}.`);
    tab.location.replace(data.signedUrl);
  }).catch(error => {
    try { tab.close(); } catch {}
    say(error.message || `Unable to open ${label}.`);
  }).finally(() => {
    if (button) { button.disabled = false; button.textContent = original || `Open ${label}`; }
  });
}

function bindStage2DocumentActions() {
  const bind = (selector, bucket, pathKey, label, datasetKey) => {
    $$(selector).forEach(button => button.addEventListener('click', () => {
      const record = applicants.find(item => item.id === button.dataset[datasetKey]);
      if (!record?.[pathKey]) { say(`${label} file path not found.`); return; }
      openSignedDocumentInNewTab(bucket, record[pathKey], label, button);
    }));
  };
  bind('[data-stage2-ktp]', 'candidate-identity', 'ktp_path', 'ID Card', 'stage2Ktp');
  bind('[data-stage2-cv]', 'candidate-files', 'cv_path', 'CV', 'stage2Cv');
}

async function loadPositionList() {
  if (stage2PositionsCache.length) return stage2PositionsCache;
  const cached = await cacheGet('positions_list', { maxAgeMs: 10 * 60 * 1000 });
  if (cached?.value?.length && !cached.stale) {
    stage2PositionsCache = cached.value;
    return stage2PositionsCache;
  }
  const { data, error } = await supabase.from('portal_settings').select('value').eq('key', 'application_positions').maybeSingle();
  if (error) throw error;
  const values = Array.isArray(data?.value) ? data.value : [];
  stage2PositionsCache = [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
  cacheSet('positions_list', stage2PositionsCache).catch(() => {});
  return stage2PositionsCache;
}

async function savePositionList(positions) {
  const clean = [...new Set(positions.map(value => String(value || '').trim()).filter(Boolean))];
  if (!clean.length) throw new Error('Position list cannot be empty.');
  if (clean.length !== positions.length) throw new Error('Position names must be unique and non-empty.');
  const { error } = await supabase.from('portal_settings')
    .upsert({ key: 'application_positions', value: clean, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
  stage2PositionsCache = clean;
  cacheSet('positions_list', clean).catch(() => {});
}

function positionManagerHtml(positions) {
  return `<section class="panel position-manager"><div class="panel-head"><div><h3>Open Positions</h3><p>Managed positions are shared across Application Form, Invited Candidates, and Candidate Duplication.</p></div></div>
    <div class="position-manager-body"><div id="position-rows">${positions.map((position, index) => `<div class="position-row"><input class="input" maxlength="100" data-position-index="${index}" value="${esc(position)}" aria-label="Position name ${index + 1}"><button type="button" class="icon-btn" data-position-delete="${index}" ${positions.length === 1 ? 'disabled' : ''}>Delete</button></div>`).join('')}</div>
    <div class="position-add-row"><input class="input" id="new-position" maxlength="100" placeholder="New position title"><button type="button" class="btn btn-secondary" id="add-position">Add Position</button></div>
    <div class="position-manager-foot"><small>Official position options used throughout Recruitment forms.</small><button type="button" class="btn btn-primary" id="save-positions">Save Positions</button></div></div></section>`;
}

function bindPositionManager(positions) {
  $('#add-position')?.addEventListener('click', async () => {
    const value = $('#new-position')?.value.trim() || '';
    if (!value) { say('Please enter a position title first.'); return; }
    if (positions.some(item => item.toLowerCase() === value.toLowerCase())) { say('Position title already exists.'); return; }
    try { await savePositionList([...positions, value]); say('New position added.'); loadView('settings'); }
    catch (error) { say(error.message || 'Failed to add position.'); }
  });
  $$('[data-position-delete]').forEach(button => button.addEventListener('click', async () => {
    const index = Number(button.dataset.positionDelete);
    const next = positions.filter((_, i) => i !== index);
    try { await savePositionList(next); say('Position removed.'); loadView('settings'); }
    catch (error) { say(error.message || 'Failed to remove position.'); }
  }));
  $('#save-positions')?.addEventListener('click', async () => {
    const values = $$('[data-position-index]').map(input => input.value.trim());
    if (values.some(value => !value)) { say('Position titles cannot be empty.'); return; }
    if (new Set(values.map(value => value.toLowerCase())).size !== values.length) { say('Duplicate position titles are not allowed.'); return; }
    try { await savePositionList(values); say('Position list updated.'); loadView('settings'); }
    catch (error) { say(error.message || 'Failed to save position list.'); }
  });
}

function candidateEditModal() {
  let modal = $('#candidate-edit-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'candidate-edit-modal';
  modal.className = 'modal-backdrop hidden';
  modal.innerHTML = `<section class="employee-modal-card candidate-edit-card" role="dialog" aria-modal="true" aria-labelledby="candidate-edit-title">
    <div class="employee-modal-head candidate-edit-head"><div><small>RECRUITMENT · CANDIDATE REVIEW</small><h2 id="candidate-edit-title">Edit Candidate</h2><p id="candidate-edit-summary"></p></div><button type="button" class="modal-close" id="candidate-edit-close" aria-label="Close">×</button></div>
    <div id="candidate-edit-form-slot" class="candidate-edit-form-slot"></div>
    <div id="candidate-edit-error" class="form-error candidate-edit-error" role="alert"></div>
    <div class="employee-modal-actions candidate-edit-footer"><button type="button" class="btn btn-secondary" id="candidate-edit-cancel">Cancel</button><button type="button" class="btn btn-primary" id="candidate-edit-save">Save Changes</button></div>
  </section>`;
  document.body.append(modal);
  const close = () => { modal.classList.add('hidden'); editingApplicantId = null; adminEditorBinding = null; };
  $('#candidate-edit-close', modal).addEventListener('click', close);
  $('#candidate-edit-cancel', modal).addEventListener('click', close);
  bindSafeModalClose(modal, close, { closeOnBackdrop: false });
  $('#candidate-edit-save', modal).addEventListener('click', saveStage2Candidate);
  return modal;
}

async function openStage2CandidateEditor(applicant) {
  const modal = candidateEditModal();
  editingApplicantId = applicant.id;
  adminEditorBinding = null;
  const values = {
    ...(applicant.application_data || {}),
    nama: applicant.full_name || applicant.application_data?.nama || '',
    nik: applicant.nik || applicant.application_data?.nik || '',
    posisi: applicant.position || applicant.application_data?.posisi || '',
    cv_path: applicant.cv_path || '',
    ktp_path: applicant.ktp_path || ''
  };
  $('#candidate-edit-title', modal).textContent = `Edit · ${applicant.full_name || 'Unnamed'}`;
  $('#candidate-edit-summary', modal).textContent = `${values.nik} · ${values.posisi} · Five sections matching the candidate application form`;
  $('#candidate-edit-error', modal).textContent = '';
  const { renderAdminEditorMarkup, bindAdminEditorForm } = await loadApplicantModule();
  $('#candidate-edit-form-slot', modal).innerHTML = renderAdminEditorMarkup(values, stage2PositionsCache);
  modal.classList.remove('hidden');

  const form = $('#admin-candidate-form', modal);
  $$('[data-admin-document]', modal).forEach(button => button.addEventListener('click', () => {
    const current = applicants.find(item => item.id === editingApplicantId);
    if (!current) return;
    const isKtp = button.dataset.adminDocument === 'ktp';
    const path = isKtp ? current.ktp_path : current.cv_path;
    if (!path) { say(`${isKtp ? 'ID card photo' : 'CV'} is unavailable.`); return; }
    openSignedDocumentInNewTab(isKtp ? 'candidate-identity' : 'candidate-files', path, isKtp ? 'ID Card' : 'CV', button);
  }));
  adminEditorBinding = await bindAdminEditorForm(form, values);
}

async function saveStage2Candidate() {
  const modal = $('#candidate-edit-modal');
  const errorBox = $('#candidate-edit-error', modal);
  const save = $('#candidate-edit-save', modal);
  const applicant = applicants.find(item => item.id === editingApplicantId);
  const form = $('#admin-candidate-form', modal);
  if (!applicant || !form || !adminEditorBinding) {
    errorBox.textContent = 'Editor form is not ready. Close and reopen the candidate record.';
    return;
  }
  const fullName = String(form.elements.namedItem('nama')?.value || '').trim();
  const nik = String(form.elements.namedItem('nik')?.value || '').replace(/\D/g, '');
  const position = String(form.elements.namedItem('posisi')?.value || '').trim();
  if (fullName.length < 2) { errorBox.textContent = 'Full name must be at least 2 characters.'; adminEditorBinding.goToStep(0); form.elements.namedItem('nama')?.focus(); return; }
  if (!/^\d{16}$/.test(nik)) { errorBox.textContent = 'ID Card NIK must be exactly 16 digits.'; adminEditorBinding.goToStep(0); form.elements.namedItem('nik')?.focus(); return; }
  if (!position) { errorBox.textContent = 'Applied position is required.'; adminEditorBinding.goToStep(0); form.elements.namedItem('posisi')?.focus(); return; }
  if (applicants.some(item => item.id !== applicant.id && item.nik === nik && String(item.position || '').toLowerCase() === position.toLowerCase())) {
    errorBox.textContent = 'A candidate record with this NIK and position already exists.';
    adminEditorBinding.goToStep(0);
    form.elements.namedItem('nik')?.focus();
    return;
  }
  let baseAppData = applicant.application_data || {};
  try {
    const { data: fullRow } = await supabase.from('applicants').select('application_data').eq('id', applicant.id).maybeSingle();
    if (fullRow?.application_data) baseAppData = fullRow.application_data;
  } catch {}
  const { collectAdminEditorData } = await loadApplicantModule();
  const nextData = collectAdminEditorData(form, baseAppData);
  nextData.nama = fullName;
  nextData.nik = nik;
  nextData.posisi = position;
  errorBox.textContent = '';
  save.disabled = true;
  save.textContent = 'Saving…';
  try {
    const { error } = await supabase.from('applicants').update({
      full_name: fullName,
      nik,
      position,
      application_data: nextData,
      updated_at: new Date().toISOString()
    }).eq('id', applicant.id);
    if (error) throw error;
    invalidateDataCache();
    say(`Updated record for ${fullName}.`);
    modal.classList.add('hidden');
    editingApplicantId = null;
    adminEditorBinding = null;
    await loadView('stage2', true);
  } catch (saveError) {
    errorBox.textContent = saveError.message || 'Failed to save candidate record.';
  } finally {
    save.disabled = false;
    save.textContent = 'Save Changes';
  }
}

function bindStage2CandidateActions() {
  $$('[data-stage2-edit]').forEach(button => button.addEventListener('click', async () => {
    const applicant = applicants.find(item => item.id === button.dataset.stage2Edit);
    if (!applicant) return;
    try {
      await loadPositionList();
      await openStage2CandidateEditor(applicant);
    } catch (error) {
      say(error.message || 'Unable to open candidate editor.');
    }
  }));

  $$('[data-stage2-dup]').forEach(button => button.addEventListener('click', async () => {
    const applicant = applicants.find(item => item.id === button.dataset.stage2Dup);
    if (!applicant) return;
    const positions = await loadPositionList().catch(() => stage2PositionsCache);
    openDuplicateCandidateModal({
      applicant,
      positions,
      onSave: async newPosition => {
        const payload = buildDuplicateCandidatePayload(applicant, newPosition, applicants);
        let insertRes = await supabase.from('applicants').insert(payload).select('*').single();
        if (insertRes.error && isMissingSchemaError(insertRes.error)) {
          const { duplicated_from: _drop, ...fallbackPayload } = payload;
          insertRes = await supabase.from('applicants').insert(fallbackPayload).select('*').single();
        }
        if (insertRes.error) {
          if (String(insertRes.error.message || '').includes('applicants_nik_unique')) {
            throw new Error('Database still enforces unique NIK across positions. Run SQL migration v2/v3 in Supabase SQL Editor.');
          }
          throw insertRes.error;
        }
        const inserted = insertRes.data;
        if (inserted?.id) {
          const sourceDisc = getDiscForApplicant(applicant);
          const discPayload = buildDuplicatedDiscPayload(sourceDisc, inserted.id);
          if (discPayload) {
            await supabase.from('disc_submissions').insert(discPayload).then(() => {}, () => {});
          }

          const intPayloads = buildDuplicatedInterviewPayloads(getInterviewsForApplicant(applicant.id, applicant), inserted, currentUserId);
          if (intPayloads.length && !interviewsTableMissing) {
            const prepared = intPayloads.map(({ interview_date: d, contract_number: c, ...rest }) => ({
              ...rest,
              ...(interviewDateColMissing ? {} : { interview_date: d }),
              ...(interviewContractNoColMissing ? {} : { contract_number: c })
            }));
            let { error: intErr } = await supabase.from('candidate_interviews').insert(prepared);
            if (intErr && isMissingSchemaError(intErr)) {
              const msg = String(intErr.message || '').toLowerCase();
              if (msg.includes('interview_date')) interviewDateColMissing = true;
              if (msg.includes('contract_number')) interviewContractNoColMissing = true;
              const stripped = intPayloads.map(({ interview_date: _d, contract_number: _c, ...rest }) => ({
                ...rest,
                ...(interviewDateColMissing ? {} : { interview_date: _d }),
                ...(interviewContractNoColMissing ? {} : { contract_number: _c })
              }));
              ({ error: intErr } = await supabase.from('candidate_interviews').insert(stripped));
            }
            if (intErr) console.warn('Partial interview clone skipped:', intErr);
          }

          const sourceInvite = invitedCandidates.find(inv => inv.linked_applicant_id === applicant.id);
          const invitePayload = buildDuplicatedInvitePayload(sourceInvite, inserted, currentUserId);
          if (invitePayload && !invitedTableMissing) {
            await supabase.from('invited_candidates').insert(invitePayload).then(() => {}, () => {});
          }
        }
        invalidateDataCache();
        say(`${applicant.full_name} duplicated to ${newPosition} with existing progress carried over.`);
        await loadView('stage2', true);
      }
    });
  }));

  $$('[data-stage2-delete]').forEach(button => button.addEventListener('click', async () => {
    const applicant = applicants.find(item => item.id === button.dataset.stage2Delete);
    if (!applicant) return;
    if (employees.some(employee => employee.applicant_id === applicant.id)) {
      say('Candidate is already linked to Employee Directory. Remove or update the employee record first.');
      return;
    }
    const confirmed = await openConfirmDialog({
      title: 'Delete Candidate',
      message: `Delete candidate ${applicant.full_name} (NIK ${applicant.nik})?`,
      confirmLabel: 'Delete',
      danger: true
    });
    if (!confirmed) return;
    button.disabled = true;
    button.textContent = 'Deleting…';
    try {
      const { error } = await supabase.from('applicants').delete().eq('id', applicant.id);
      if (error) throw error;
      invalidateDataCache();
      applicants = applicants.filter(item => item.id !== applicant.id);
      say(`Deleted candidate ${applicant.full_name}.`);
      await loadView('stage2', true);
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Delete';
      say(error.message || 'Failed to delete candidate.');
    }
  }));
}

function renderStage2() {
  const idx = getWorkspaceIndexes();
  const allRows = applicants.filter(row => row.stage !== 'stage1_pending');
  const keys = stage2FieldKeys(allRows);
  const indexedRows = allRows.map(row => ({
    row,
    searchText: `${row.full_name || ''} ${row.nik || ''} ${row.position || ''} ${Object.values(row.application_data || {}).join(' ')}`.toLowerCase()
  }));
  const renderRows = rows => rows.length ? rows.map(row => stage2RowHtml(row, keys, idx)).join('') : emptyRow(6 + keys.length, 'No candidate forms');
  const headerCells = [
    '<th>APPLICANT</th>',
    '<th>POSITION</th>',
    ...keys.map(key => {
      const cls = stage2CellClass(key);
      return `<th${cls ? ` class="${cls}"` : ''}>${esc(applicationFieldLabel(key).toUpperCase())}</th>`;
    }),
    '<th>ID CARD</th>', '<th>CV</th>', '<th>STATUS</th>', '<th>ACTIONS</th>'
  ].join('');
  content.innerHTML = header('Candidate List', '', '<button class="btn btn-secondary" id="refresh-stage2">Refresh ↻</button>') +
    `<section class="panel table-panel stage2-candidate-panel">${tableToolbar('Search name / NIK / position…', 'Candidate List')}
      <div class="table-wrap recruitment-data-scroll"><table class="data-table recruitment-wide-table"><thead><tr>${headerCells}</tr></thead><tbody id="candidate-rows"></tbody></table></div><div id="stage2-pager"></div></section>`;
  $('#refresh-stage2')?.addEventListener('click', () => loadView('stage2', true));

  let currentQuery = '';
  let currentPage = 1;
  let currentPageSize = 50;

  const paint = () => {
    const filtered = currentQuery
      ? indexedRows.filter(item => item.searchText.includes(currentQuery)).map(item => item.row)
      : allRows;
    const paged = paginateRows(filtered, currentPage, currentPageSize);
    currentPage = paged.page;
    $('#candidate-rows').innerHTML = renderRows(paged.items);
    renderPaginationFooter($('#stage2-pager'), paged, (nextPage, nextSize) => {
      currentPage = nextPage;
      currentPageSize = nextSize;
      paint();
    });
    bindStage2DocumentActions();
    bindStage2CandidateActions();
  };
  paint();
  bindSearch('#table-search', query => {
    currentQuery = query;
    currentPage = 1;
    paint();
  });
}

function renderStage3() {
  const rows = applicants.filter(row => getDiscForApplicant(row) || row.stage === 'disc_completed' || row.stage === 'hired');
  const indexedRows = rows.map(row => ({
    row,
    searchText: `${row.full_name || ''} ${row.nik || ''} ${row.position || ''}`.toLowerCase()
  }));
  content.innerHTML = header('DISC Assessment', '') +
    `<section class="panel table-panel">${tableToolbar('Search candidates…', 'DISC Assessment')}<div class="table-wrap recruitment-data-scroll"><table class="data-table recruitment-wide-table disc-assessment-table">
      <thead><tr><th>APPLICANT / NIK</th><th>POSITION</th><th>AGE</th><th>STATUS</th><th>DISC GRAPHS (G1 · G2 · G3)</th><th>PERSONALITY / NATURAL PATTERN</th><th>ACTIONS</th></tr></thead>
      <tbody id="candidate-rows"></tbody></table></div><div id="stage3-pager"></div></section>`;

  let currentQuery = '';
  let currentPage = 1;
  let currentPageSize = 50;

  const paint = () => {
    const filtered = currentQuery
      ? indexedRows.filter(item => item.searchText.includes(currentQuery)).map(item => item.row)
      : rows;
    const paged = paginateRows(filtered, currentPage, currentPageSize);
    currentPage = paged.page;
    $('#candidate-rows').innerHTML = applicantRows(paged.items, 'both');
    renderPaginationFooter($('#stage3-pager'), paged, (nextPage, nextSize) => {
      currentPage = nextPage;
      currentPageSize = nextSize;
      paint();
    });
    bindPrint();
  };
  paint();
  bindSearch('#table-search', query => {
    currentQuery = query;
    currentPage = 1;
    paint();
  });
}

/* ============================================================================
 * INVITED VIEW — Invited Candidates + CV Screening on 1 Page (Zero Duplicates)
 * ============================================================================ */
function invitedCandidateRowHtml(row) {
  const statusTone = row.status === 'Responded' ? 'green' : 'gray';
  return `<tr>
    <td style="white-space:nowrap"><span class="interview-date-meta">${esc(formatDmyDash(row.inviteDate || ''))}</span></td>
    <td><b>${esc(row.candidateName)}</b>${row.notes ? `<small class="table-subline">${esc(row.notes)}</small>` : ''}</td>
    <td>${esc(row.appliedPosition)}${row.isDuplicated ? '<small class="table-subline">Duplicated position</small>' : ''}</td>
    <td>${esc(row.source)}</td>
    <td><span class="status-pill ${statusTone}">${esc(row.status)}</span></td>
    <td><div class="row-actions">
      <button type="button" class="icon-btn" data-inv-edit="${esc(row.rowKey)}">Edit</button>
      ${row.isManual ? `<button type="button" class="icon-btn danger" data-inv-delete="${esc(row.manualId)}">Delete</button>` : ''}
    </div></td>
  </tr>`;
}

function renderInvitedView() {
  const allRows = buildInvitedCandidatesViewRows({
    manualInvites: invitedCandidates,
    applicants,
    stage1Leads,
    indexes: getWorkspaceIndexes()
  });
  const indexedInviteRows = allRows.map(r => ({
    row: r,
    searchText: `${r.inviteDate} ${r.candidateName} ${r.appliedPosition} ${r.source} ${r.status} ${r.notes}`.toLowerCase()
  }));
  const screeningSummary = aggregateCvScreeningBySource(cvScreenings);
  const linkedApplicantIds = new Set(invitedCandidates.map(i => i.linked_applicant_id).filter(Boolean));

  const migrationBanner = (invitedTableMissing || cvScreeningsTableMissing)
    ? `<div class="upload-preview-box" style="margin-bottom:14px;border-color:#fca5a5;background:#fef2f2;color:#991b1b">Supabase tables <code>invited_candidates</code> / <code>cv_screenings</code> are not created yet. Run <code>database/migrations/20261121_hrga_workspace_v3.sql</code> and <code>v4</code> in Supabase SQL Editor.</div>`
    : '';

  const renderInviteRows = rows => rows.length
    ? rows.map(invitedCandidateRowHtml).join('')
    : emptyRow(6, 'No invited candidates recorded yet');

  const renderScreeningRows = items => items.length
    ? items.map(item => `<tr>
        <td><b>${esc(item.position || '-')}</b></td>
        <td><b>${esc(item.source)}</b>${item.notes ? `<small class="table-subline">${esc(item.notes)}</small>` : ''}</td>
        <td><span class="status-pill blue">${item.screeningCount}</span></td>
        <td><div class="row-actions">
          <button type="button" class="icon-btn" data-scr-edit="${esc(item.rowKey)}">Edit</button>
          ${item.id ? `<button type="button" class="icon-btn danger" data-scr-delete="${esc(item.id)}">Delete</button>` : ''}
        </div></td>
      </tr>`).join('')
    : emptyRow(4, 'No CV screening counts added yet');

  content.innerHTML = header('Invited', '',
    '<button type="button" class="btn btn-secondary" id="refresh-invited">Refresh ↻</button>' +
    '<button type="button" class="btn btn-primary" id="add-invited-candidate">+ Add to List</button>'
  ) + migrationBanner + `
    <div class="invited-stack">
      <section class="panel table-panel">
        ${tableToolbar('Search date / name / position / source / status…', 'Invited Candidates')}
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>DATE</th><th>NAME</th><th>APPLIED POSITION</th><th>SOURCE</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
            <tbody id="invited-rows"></tbody>
          </table>
        </div>
        <div id="invited-pager"></div>
      </section>

      <section class="panel table-panel cv-screening-panel">
        <div class="panel-head">
          <div><h3>CV Screening</h3><small class="subtle">Total Screened Across Positions &amp; Sources: <b>${screeningSummary.totalCount}</b></small></div>
          <button type="button" class="btn btn-secondary btn-xs" id="add-cv-screening">+ Add Screening</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>POSITION</th><th>SOURCE</th><th>SCREENING COUNT</th><th>ACTIONS</th></tr></thead>
            <tbody id="screening-rows">${renderScreeningRows(screeningSummary.items)}</tbody>
          </table>
        </div>
      </section>
    </div>`;

  $('#refresh-invited')?.addEventListener('click', () => loadView('invited', true));

  const openInviteEditor = async (existingRow = null) => {
    const positions = await loadPositionList().catch(() => stage2PositionsCache);
    openInvitedCandidateModal({
      existing: existingRow,
      positions,
      applicants,
      linkedApplicantIds,
      onSave: async payload => {
        if (invitedTableMissing) {
          throw new Error('Run database/migrations/20261121_hrga_workspace_v3.sql in Supabase SQL Editor first.');
        }
        const recordPayload = {
          invite_date: payload.invite_date,
          candidate_name: payload.candidate_name,
          applied_position: payload.applied_position,
          source: payload.source,
          status: payload.status,
          linked_applicant_id: payload.linked_applicant_id,
          linked_stage1_id: payload.linked_stage1_id || null,
          notes: payload.notes,
          updated_at: new Date().toISOString()
        };
        if (payload.id) {
          const { error } = await supabase.from('invited_candidates').update(recordPayload).eq('id', payload.id);
          if (error) throw error;
          say(`Updated invite record for ${payload.candidate_name}.`);
        } else {
          const { error } = await supabase.from('invited_candidates').insert({
            ...recordPayload,
            created_by: currentUserId
          });
          if (error) throw error;
          say(`Added ${payload.candidate_name} to Invited Candidates.`);
        }
        invalidateDataCache();
        await loadView('invited', true);
      }
    });
  };

  const bindInviteRowActions = currentRows => {
    $$('[data-inv-edit]').forEach(btn => btn.addEventListener('click', () => {
      const target = currentRows.find(r => r.rowKey === btn.dataset.invEdit);
      if (target) openInviteEditor(target);
    }));
    $$('[data-inv-delete]').forEach(btn => btn.addEventListener('click', async () => {
      const manualId = btn.dataset.invDelete;
      const target = invitedCandidates.find(i => i.id === manualId);
      const ok = await openConfirmDialog({
        title: 'Delete Invited Candidate',
        message: `Delete invited record for ${target?.candidate_name || 'this candidate'}?`,
        confirmLabel: 'Delete',
        danger: true
      });
      if (!ok) return;
      try {
        const { error } = await supabase.from('invited_candidates').delete().eq('id', manualId);
        if (error) throw error;
        invalidateDataCache();
        say('Invited candidate deleted.');
        await loadView('invited', true);
      } catch (err) {
        say(err.message || 'Failed to delete invited candidate.');
      }
    }));
  };

  const openScreeningEditor = async (existing = null) => {
    const positions = await loadPositionList().catch(() => stage2PositionsCache);
    openCvScreeningModal({
      existing,
      positions,
      onSave: async payload => {
        if (cvScreeningsTableMissing) {
          throw new Error('Run database/migrations/20261121_hrga_workspace_v3.sql & v4 in Supabase SQL Editor first.');
        }
        const matchedExisting = payload.id
          ? cvScreenings.find(s => s.id === payload.id)
          : cvScreenings.find(s =>
              String(s.position || '').trim().toLowerCase() === payload.position.toLowerCase() &&
              String(s.source || '').trim().toLowerCase() === payload.source.toLowerCase()
            );
        const recordPayload = {
          position: payload.position,
          source: payload.source,
          screening_count: payload.screening_count,
          notes: payload.notes,
          updated_by: currentUserId,
          updated_at: new Date().toISOString()
        };
        if (matchedExisting?.id) {
          let { error } = await supabase.from('cv_screenings').update(recordPayload).eq('id', matchedExisting.id);
          if (error && isMissingSchemaError(error) && String(error.message || '').toLowerCase().includes('position')) {
            const { position: _dropPos, ...legacyPayload } = recordPayload;
            ({ error } = await supabase.from('cv_screenings').update(legacyPayload).eq('id', matchedExisting.id));
          }
          if (error) throw error;
        } else {
          let { error } = await supabase.from('cv_screenings').insert(recordPayload);
          if (error && isMissingSchemaError(error) && String(error.message || '').toLowerCase().includes('position')) {
            const { position: _dropPos, ...legacyPayload } = recordPayload;
            ({ error } = await supabase.from('cv_screenings').upsert(legacyPayload, { onConflict: 'source' }));
          }
          if (error) {
            const msg = String(error.message || '').toLowerCase();
            if (msg.includes('cv_screenings_source_key')) {
              throw new Error('Run database/migrations/20261121_hrga_workspace_v4.sql in Supabase SQL Editor to store screenings by Position & Source.');
            }
            throw error;
          }
        }
        invalidateDataCache();
        say(`CV screening count saved for ${payload.position} (${payload.source}).`);
        await loadView('invited', true);
      }
    });
  };

  $$('[data-scr-edit]').forEach(btn => btn.addEventListener('click', () => {
    const item = screeningSummary.items.find(s => s.rowKey === btn.dataset.scrEdit);
    if (item) openScreeningEditor(item);
  }));
  $$('[data-scr-delete]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.scrDelete;
    const ok = await openConfirmDialog({
      title: 'Delete CV Screening Entry',
      message: 'Remove this CV screening entry?',
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    try {
      const { error } = await supabase.from('cv_screenings').delete().eq('id', id);
      if (error) throw error;
      invalidateDataCache();
      say('CV screening entry removed.');
      await loadView('invited', true);
    } catch (err) {
      say(err.message || 'Failed to delete CV screening entry.');
    }
  }));

  $('#add-invited-candidate')?.addEventListener('click', () => openInviteEditor(null));
  $('#add-cv-screening')?.addEventListener('click', () => openScreeningEditor(null));

  let invQuery = '';
  let invPage = 1;
  let invPageSize = 50;

  const paintInvited = () => {
    const filtered = invQuery
      ? indexedInviteRows.filter(item => item.searchText.includes(invQuery)).map(item => item.row)
      : allRows;
    const paged = paginateRows(filtered, invPage, invPageSize);
    invPage = paged.page;
    $('#invited-rows').innerHTML = renderInviteRows(paged.items);
    renderPaginationFooter($('#invited-pager'), paged, (nextPage, nextSize) => {
      invPage = nextPage;
      invPageSize = nextSize;
      paintInvited();
    });
    bindInviteRowActions(paged.items);
  };
  paintInvited();

  bindSearch('#table-search', query => {
    invQuery = query;
    invPage = 1;
    paintInvited();
  });
}

/* ============================================================================
 * INTERVIEW PIPELINE (HR 1, HR 2, User 1, User 2, Final Interview)
 * ============================================================================ */
function buildUnifiedInterviewCandidates() {
  const fromApplicants = applicants.map(a => ({
    key: `applicant:${a.id}`,
    source_type: 'applicant',
    applicant_id: a.id,
    stage1_id: null,
    candidate_name: a.full_name,
    candidate_nik: a.nik || '',
    candidate_whatsapp: a.application_data?.telepon || '',
    applied_position: a.position || a.application_data?.posisi || '',
    applicantRef: a
  }));
  const fromLead = stage1Leads.map(s => ({
    key: `stage1:${s.id}`,
    source_type: 'stage1',
    applicant_id: null,
    stage1_id: s.id,
    candidate_name: s.full_name,
    candidate_nik: '',
    candidate_whatsapp: s.whatsapp || '',
    applied_position: s.position || '',
    applicantRef: null
  }));
  return [...fromApplicants, ...fromLead];
}

function renderInterviewStageCard(stage) {
  const isFinal = stage === 'Final Interview';
  const stageRows = interviews.filter(row => row.interview_stage === stage).slice(0, 5);
  const rowsHtml = stageRows.length
    ? stageRows.map(row => {
        const dec = normalizeInterviewDecision(row.decision);
        const tone = dec === 'Recommended' || dec === 'Accepted'
          ? 'green'
          : dec === 'Not Recommended' || dec === 'Rejected'
            ? 'gray'
            : 'gold';
        const dateLabel = formatDmyDash(row.interview_date || String(row.created_at || '').slice(0, 10));
        let extra = esc(row.notes || '-');
        if (isFinal) {
          if (dec === 'Rejected') {
            extra = `${esc(row.rejection_reason_category)}${row.rejection_reason_detail ? ` · ${esc(row.rejection_reason_detail)}` : ''}`;
          } else if (dec === 'Accepted') {
            const period = row.contract_start_date && row.contract_end_date
              ? `${formatDmyDash(row.contract_start_date)} to ${formatDmyDash(row.contract_end_date)}`
              : '-';
            const contractPart = row.contract_number ? ` · Contract ${esc(row.contract_number)}` : '';
            extra = `${esc(row.official_position || row.applied_position)} · NIK ${esc(row.assigned_nik)}${contractPart} · ${period}`;
          }
        }
        const actionHtml = isFinal && dec === 'Accepted'
          ? `<div class="row-actions">
              <button type="button" class="icon-btn" data-interview-edit="${esc(row.id)}">Edit</button>
              <button type="button" class="icon-btn pkwt-inline-btn" data-interview-pkwt="${esc(row.id)}">Print PKWT</button>
            </div>`
          : `<button type="button" class="icon-btn" data-interview-edit="${esc(row.id)}">Edit</button>`;
        return `<tr>
          <td><b>${esc(row.candidate_name)}</b><small class="table-subline">${esc(row.applied_position || '-')}</small></td>
          <td style="white-space:nowrap"><span class="interview-date-meta">${esc(dateLabel)}</span></td>
          <td>${esc(row.pic_name || '-')}</td>
          <td><span class="status-pill ${tone}">${esc(dec)}</span></td>
          <td style="max-width:210px;white-space:normal">${extra}</td>
          <td>${actionHtml}</td>
        </tr>`;
      }).join('')
    : emptyRow(6, 'No candidates recorded');

  return `<section class="panel interview-stage-card ${isFinal ? 'is-final' : ''}">
    <div class="interview-stage-head">
      <div>
        <h3>${esc(INTERVIEW_STAGE_LABELS[stage])}</h3>
      </div>
      <button type="button" class="btn btn-primary btn-xs" data-interview-add="${esc(stage)}">+ Add Candidate</button>
    </div>
    <div class="interview-stage-scroll">
      <table class="data-table interview-mini-table">
        <thead><tr><th>CANDIDATE</th><th>DATE</th><th>PIC</th><th>DECISION</th><th>NOTES</th><th>ACTION</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  </section>`;
}

function renderInterviewView() {
  const banner = interviewsTableMissing
    ? `<div class="upload-preview-box" style="margin-bottom:14px;border-color:#fca5a5;background:#fef2f2;color:#991b1b">Table <code>candidate_interviews</code> is not available in Supabase yet. Run <code>database/migrations/20261121_hrga_workspace_v3.sql</code> in Supabase SQL Editor.</div>`
    : '';
  content.innerHTML = header('Interview Pipeline', '', '<button class="btn btn-secondary" id="refresh-interview">Refresh ↻</button>') +
    banner +
    `<div class="interview-grid">${INTERVIEW_STAGES.map(stage => renderInterviewStageCard(stage)).join('')}</div>`;

  $('#refresh-interview')?.addEventListener('click', () => loadView('interview', true));

  const openForStage = (stage, existing = null) => {
    const candidates = buildUnifiedInterviewCandidates();
    openInterviewModal({
      stage,
      existing,
      candidates,
      employees,
      onPrintPkwt: (draftRow, cand) => {
        openPkwtForRecord(buildContractRecordFromInterview(draftRow, cand));
      },
      onSave: async (payload, selectedCand) => {
        if (isDemoMode) {
          const demoRow = {
            id: payload.id || `intv-demo-${Date.now()}`,
            ...payload,
            updated_at: new Date().toISOString()
          };
          const idx = interviews.findIndex(i => i.id === demoRow.id);
          if (idx >= 0) interviews[idx] = demoRow;
          else interviews.unshift(demoRow);
          say(`Saved ${INTERVIEW_STAGE_LABELS[stage]} record.`);
          await loadView('interview', false);
          return;
        }
        if (interviewsTableMissing) {
          throw new Error('Please run database/migrations/20261121_hrga_workspace_v3.sql in Supabase SQL Editor first.');
        }
        const dec = normalizeInterviewDecision(payload.decision);
        const recordPayload = {
          source_type: payload.source_type,
          applicant_id: payload.applicant_id,
          stage1_id: payload.stage1_id,
          candidate_name: payload.candidate_name,
          candidate_nik: payload.candidate_nik,
          candidate_whatsapp: payload.candidate_whatsapp,
          applied_position: payload.applied_position,
          interview_stage: payload.interview_stage,
          ...(interviewDateColMissing ? {} : { interview_date: payload.interview_date }),
          pic_employee_id: payload.pic_employee_id || null,
          pic_nik: payload.pic_nik,
          pic_name: payload.pic_name,
          notes: payload.notes,
          decision: dec,
          rejection_reason_category: payload.rejection_reason_category,
          rejection_reason_detail: payload.rejection_reason_detail,
          work_start_date: payload.work_start_date,
          salary: payload.salary,
          contract_duration_months: payload.contract_duration_months,
          contract_start_date: payload.contract_start_date,
          contract_end_date: payload.contract_end_date,
          official_position: payload.official_position,
          assigned_nik: payload.assigned_nik,
          ...(interviewContractNoColMissing ? {} : { contract_number: payload.contract_number || '' }),
          updated_at: new Date().toISOString()
        };

        const persistRecord = async body => {
          if (payload.id) {
            return supabase.from('candidate_interviews').update(body).eq('id', payload.id);
          }
          return supabase.from('candidate_interviews').insert({ ...body, created_by: currentUserId });
        };

        let { error } = await persistRecord(recordPayload);
        if (error && isMissingSchemaError(error)) {
          const msg = String(error.message || '').toLowerCase();
          if (msg.includes('interview_date')) interviewDateColMissing = true;
          if (msg.includes('contract_number')) interviewContractNoColMissing = true;
          const fallbackBody = { ...recordPayload };
          if (interviewDateColMissing) delete fallbackBody.interview_date;
          if (interviewContractNoColMissing) delete fallbackBody.contract_number;
          ({ error } = await persistRecord(fallbackBody));
        }
        if (error) throw error;

        if (stage === 'Final Interview') {
          if (dec === 'Accepted') {
            const app = selectedCand?.applicantRef || applicants.find(a => a.id === payload.applicant_id);
            const appData = app?.application_data || {};
            const genderRaw = appData.gender || '';
            const genderNormalized = genderRaw === 'L' ? 'Laki-laki' : genderRaw === 'P' ? 'Perempuan' : genderRaw;
            const contractPrefix = payload.contract_number ? `Contract No. ${payload.contract_number}` : '';
            const baseNotes = payload.notes || `Passed Final Interview (${payload.pic_name})`;
            const mergedNotes = [contractPrefix, baseNotes].filter(Boolean).join(' · ');
            const empPayload = {
              applicant_id: payload.applicant_id || null,
              employee_no: payload.assigned_nik,
              full_name: payload.candidate_name,
              department: '',
              position: payload.official_position || payload.applied_position,
              employment_status: 'KONTRAK',
              join_date: payload.work_start_date,
              contract_start_date: payload.contract_start_date,
              contract_end_date: payload.contract_end_date,
              address: appData.alamat_asal || appData.domisili || '',
              ktp_nik: payload.candidate_nik || app?.nik || appData.nik || '',
              birth_place: appData.tempat_lahir || '',
              birth_date: appData.tanggal_lahir || null,
              phone: payload.candidate_whatsapp || appData.telepon || '',
              education: appData.pendidikan_terakhir || '',
              gender: genderNormalized,
              religion: appData.agama || '',
              salary: payload.salary,
              notes: mergedNotes,
              updated_at: new Date().toISOString()
            };
            const { error: empErr } = await supabase.from('employees')
              .upsert(empPayload, { onConflict: 'employee_no' });
            if (empErr) throw empErr;
            if (payload.applicant_id) {
              await supabase.from('applicants')
                .update({ stage: 'hired', updated_at: new Date().toISOString() })
                .eq('id', payload.applicant_id);
            }
            say(`${payload.candidate_name} accepted & added to Employee Directory.`);
          } else if (dec === 'Rejected' && payload.applicant_id) {
            await supabase.from('applicants')
              .update({ stage: 'rejected', updated_at: new Date().toISOString() })
              .eq('id', payload.applicant_id);
            say(`Final Interview decision (${payload.candidate_name}: Rejected) saved.`);
          } else if (dec === 'Holded' && payload.applicant_id) {
            await supabase.from('applicants')
              .update({ stage: 'stage4_pending', updated_at: new Date().toISOString() })
              .eq('id', payload.applicant_id);
            say(`Final Interview decision (${payload.candidate_name}: Holded) saved.`);
          } else if (dec === 'Sent to OS' && payload.applicant_id) {
            const { error: osErr } = await supabase.from('applicants')
              .update({ stage: 'os_sent', updated_at: new Date().toISOString() })
              .eq('id', payload.applicant_id);
            if (osErr) {
              await supabase.from('applicants')
                .update({ stage: 'stage4_pending', updated_at: new Date().toISOString() })
                .eq('id', payload.applicant_id);
            }
            say(`${payload.candidate_name} marked as Sent to OS.`);
          } else {
            say('Final Interview result saved.');
          }
        } else {
          if (payload.applicant_id) {
            const app = applicants.find(a => a.id === payload.applicant_id);
            if (app && ['application_submitted', 'disc_completed'].includes(app.stage)) {
              await supabase.from('applicants')
                .update({ stage: 'stage4_pending', updated_at: new Date().toISOString() })
                .eq('id', payload.applicant_id);
            }
          }
          say(`Saved ${INTERVIEW_STAGE_LABELS[stage]} record.`);
        }

        invalidateDataCache();
        await loadView('interview', true);
      }
    });
  };

  $$('[data-interview-add]').forEach(btn => btn.addEventListener('click', () => {
    openForStage(btn.dataset.interviewAdd, null);
  }));
  $$('[data-interview-edit]').forEach(btn => btn.addEventListener('click', () => {
    const existing = interviews.find(item => item.id === btn.dataset.interviewEdit);
    if (existing) openForStage(existing.interview_stage, existing);
  }));
  $$('[data-interview-pkwt]').forEach(btn => btn.addEventListener('click', () => {
    const existing = interviews.find(item => item.id === btn.dataset.interviewPkwt);
    if (existing) openPkwtForRecord(buildContractRecordFromInterview(existing));
  }));
}

/* ============================================================================
 * TRACKING & REPORT — 13 Structured English Columns + 2-Page A4 Landscape Print
 * ============================================================================ */
function trackingStageCellHtml(cell) {
  if (!cell) return '<span class="status-pill gray">-</span>';
  const dec = normalizeInterviewDecision(cell.decision);
  const tone = ['Recommended', 'Accepted'].includes(dec)
    ? 'green'
    : ['Not Recommended', 'Rejected'].includes(dec)
      ? 'gray'
      : 'gold';
  const dateText = cell.date ? formatDmyDash(cell.date) : '';
  return `<div class="tracking-stage-cell">
    <span class="status-pill ${tone}" title="${esc(cell.picName || '')}">${esc(dec)}</span>
    ${dateText ? `<small class="tracking-date-sub">${esc(dateText)}</small>` : ''}
  </div>`;
}

function renderTrackingView() {
  const idx = getWorkspaceIndexes();
  const allRows = buildUnifiedTrackingRows({
    applicants,
    stage1Leads,
    interviews,
    employees,
    invitedCandidates,
    indexes: idx
  }).map(r => ({
    ...r,
    searchText: `${r.name} ${r.position} ${r.sub} ${r.inviteSource} ${r.inviteStatus} ${r.decision} ${r.rejectionReason}`.toLowerCase()
  }));

  let activeFilteredRows = allRows;
  let trkPage = 1;
  let trkPageSize = 50;

  const renderRows = rows => rows.length
    ? rows.map(r => `<tr>
        <td><b>${esc(r.name)}</b><small class="table-subline">${esc(r.sub)}</small></td>
        <td>${esc(r.inviteSource || '-')}</td>
        <td><div class="tracking-stage-cell">
          <span class="status-pill ${r.inviteStatus === 'Responded' ? 'green' : r.inviteStatus === 'Lead Register' ? 'blue' : 'gray'}">${esc(r.inviteStatus)}</span>
          ${r.inviteDate ? `<small class="tracking-date-sub">${esc(formatDmyDash(r.inviteDate))}</small>` : ''}
        </div></td>
        <td>${r.formSubmittedDate
          ? `<div class="tracking-stage-cell"><span class="status-pill green">Submitted</span><small class="tracking-date-sub">${esc(formatDmyDash(r.formSubmittedDate))}</small></div>`
          : '<span class="status-pill gray">-</span>'}</td>
        <td>${r.hrTestDone
          ? `<div class="tracking-stage-cell"><span class="status-pill green">Completed</span>${r.hrTestDate ? `<small class="tracking-date-sub">${esc(formatDmyDash(r.hrTestDate))}</small>` : ''}</div>`
          : '<span class="status-pill gray">-</span>'}</td>
        <td>${trackingStageCellHtml(r.hr1)}</td>
        <td>${trackingStageCellHtml(r.hr2)}</td>
        <td>${trackingStageCellHtml(r.user1)}</td>
        <td>${trackingStageCellHtml(r.user2)}</td>
        <td>${trackingStageCellHtml(r.finalInt)}</td>
        <td>
          <span class="status-pill ${r.decisionTone}">${esc(r.decision)}</span>
          ${r.rejectionReason ? `<small class="tracking-reason-sub">${esc(r.rejectionReason)}</small>` : ''}
        </td>
        <td style="white-space:nowrap">${r.decisionDate ? `<span class="interview-date-meta">${esc(formatDmyDash(r.decisionDate))}</span>` : '-'}</td>
        <td style="white-space:nowrap">${r.joinDate ? `<span class="interview-date-meta">${esc(formatDmyDash(r.joinDate))}</span>` : '-'}</td>
      </tr>`).join('')
    : emptyRow(13, 'No candidate tracking records yet');

  content.innerHTML = header('Tracking & Report', '',
    '<button class="btn btn-secondary" id="refresh-tracking">Refresh ↻</button>' +
    '<button type="button" class="btn btn-secondary" id="export-tracking">Export XLSX ↓</button>' +
    '<button type="button" class="btn btn-primary" id="print-tracking">Print Report ↗</button>'
  ) +
    `<section class="panel table-panel">${tableToolbar('Search name / position / source / status…', 'Tracking & Report')}
      <div class="table-wrap recruitment-data-scroll">
        <table class="data-table">
          <thead><tr>
            <th>NAME</th><th>SOURCE</th><th>INVITE</th><th>FORM SUBMITTED</th><th>HR TEST</th>
            <th>HR INTERVIEW 1</th><th>HR INTERVIEW 2</th><th>USER INTERVIEW 1</th><th>USER INTERVIEW 2</th>
            <th>FINAL INTERVIEW</th><th>DECISION</th><th>DECISION DATE</th><th>JOIN DATE</th>
          </tr></thead>
          <tbody id="tracking-rows"></tbody>
        </table>
      </div><div id="tracking-pager"></div></section>`;

  const paintTracking = () => {
    const paged = paginateRows(activeFilteredRows, trkPage, trkPageSize);
    trkPage = paged.page;
    $('#tracking-rows').innerHTML = renderRows(paged.items);
    renderPaginationFooter($('#tracking-pager'), paged, (nextPage, nextSize) => {
      trkPage = nextPage;
      trkPageSize = nextSize;
      paintTracking();
    });
  };
  paintTracking();

  $('#refresh-tracking')?.addEventListener('click', () => loadView('tracking', true));
  $('#export-tracking')?.addEventListener('click', async () => {
    const button = $('#export-tracking');
    if (button) {
      button.disabled = true;
      button.textContent = 'Preparing XLSX…';
    }
    try {
      const XLSX = await loadXlsxLib();
      const positions = await loadPositionList().catch(() => stage2PositionsCache);
      const summary = buildRecruitmentConclusionSummary({
        positions,
        cvScreenings,
        invitedCandidates,
        stage1Leads,
        applicants,
        interviews,
        employees,
        indexes: getWorkspaceIndexes()
      });
      const trackingRowsData = buildTrackingExportRows(activeFilteredRows);
      const summaryRowsData = buildConclusionExportRows(summary);
      const workbook = XLSX.utils.book_new();
      const trackingSheet = XLSX.utils.json_to_sheet(
        trackingRowsData.length ? trackingRowsData : [{ No: '', 'Candidate Name': 'No records matching filter' }]
      );
      const summarySheet = XLSX.utils.json_to_sheet(
        summaryRowsData.length ? summaryRowsData : [{ No: '', Position: 'No summary rows' }]
      );
      trackingSheet['!cols'] = [
        { wch: 6 }, { wch: 24 }, { wch: 20 }, { wch: 18 }, { wch: 15 }, { wch: 14 }, { wch: 14 },
        { wch: 15 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 },
        { wch: 22 }, { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 14 }
      ];
      summarySheet['!cols'] = [
        { wch: 8 }, { wch: 24 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
        { wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 12 }
      ];
      XLSX.utils.book_append_sheet(workbook, trackingSheet, 'Tracking');
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
      XLSX.writeFile(workbook, `Tracking_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
      say(`Exported ${trackingRowsData.length} tracking row(s) to XLSX.`);
    } catch (err) {
      say(err.message || 'Failed to export Tracking & Report XLSX.');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Export XLSX ↓';
      }
    }
  });
  $('#print-tracking')?.addEventListener('click', async () => {
    try {
      const query = $('#table-search')?.value?.trim() || '';
      const positions = await loadPositionList().catch(() => stage2PositionsCache);
      const summary = buildRecruitmentConclusionSummary({
        positions,
        cvScreenings,
        invitedCandidates,
        stage1Leads,
        applicants,
        interviews,
        employees,
        indexes: getWorkspaceIndexes()
      });
      const { printTrackingReport } = await loadPrintModule();
      printTrackingReport({ summary, rows: activeFilteredRows, filterQuery: query });
    } catch (err) {
      say(err.message || 'Unable to prepare Tracking & Report print view.');
    }
  });
  bindSearch('#table-search', query => {
    activeFilteredRows = query ? allRows.filter(r => r.searchText.includes(query)) : allRows;
    trkPage = 1;
    paintTracking();
  });
}

/* ============================================================================
 * EMPLOYEE DIRECTORY — 16 Columns + Upload XLSX/CSV
 * ============================================================================ */
function employeeRows(rows) {
  if (!rows.length) return emptyRow(17, 'No employee records found');
  const idx = getWorkspaceIndexes();
  return rows.map(employee => {
    const applicant = idx.applicantById.get(employee.applicant_id) || null;
    const formatted = formatEmployeeExportRow(employee, applicant);
    const statusUpper = String(formatted.Status || '').toUpperCase();
    const statusTone = statusUpper === 'TETAP' ? 'green' : statusUpper === 'KONTRAK' ? 'blue' : statusUpper === 'NONAKTIF' ? 'gray' : 'gold';
    return `<tr>
      <td><b>${esc(formatted.Nama || '—')}</b></td>
      <td style="font-family:var(--font-mono)">${esc(formatted.Nik || '—')}</td>
      <td>${esc(formatted.Departement || '—')}</td>
      <td>${esc(formatted['Tgl Masuk'])}</td>
      <td>${esc(formatted.Jabatan || '—')}</td>
      <td>${esc(formatted['Mulai Kontrak'])}</td>
      <td>${esc(formatted['Kontrak Berakhir'])}</td>
      <td style="max-width:240px;white-space:normal"><div class="cell-clamp-2" title="${esc(formatted.Alamat)}">${esc(formatted.Alamat || '—')}</div></td>
      <td style="font-family:var(--font-mono)">${esc(formatted.Nik2 || '—')}</td>
      <td>${esc(formatted['Tempat Lahir'] || '—')}</td>
      <td>${esc(formatted['Tanggal Lahir'])}</td>
      <td>${esc(formatted['No. Telp'] || '—')}</td>
      <td><span class="status-pill ${statusTone}">${esc(formatted.Status || '—')}</span></td>
      <td>${esc(formatted.Pendidikan || '—')}</td>
      <td>${esc(formatted['Jenis Kelamin'] || '—')}</td>
      <td>${esc(formatted.Agama || '—')}</td>
      <td><button class="icon-btn" data-edit-employee="${esc(employee.id)}">Edit</button></td>
    </tr>`;
  }).join('');
}

function renderEmployees() {
  const migrationWarn = employeesExtendedMissing
    ? `<div class="upload-preview-box" style="margin-bottom:14px;border-color:#fde68a;background:#fffbeb;color:#92400e">Extended Employee Directory columns are not migrated yet. Run <code>database/migrations/20261121_hrga_workspace_v3.sql</code> in Supabase SQL Editor.</div>`
    : '';
  const subTabsHtml = `
    <div class="ops-subtab-bar" role="tablist" aria-label="Employee Directory Modes">
      <button type="button" class="tab-btn ${employeeSubTab === 'directory' ? 'active' : ''}" data-emp-subtab="directory">Employee Directory (16 Kolom)</button>
      <button type="button" class="tab-btn ${employeeSubTab === 'delta' ? 'active' : ''}" data-emp-subtab="delta">Snapshot Delta Check</button>
      <button type="button" class="tab-btn ${employeeSubTab === 'cuti' ? 'active' : ''}" data-emp-subtab="cuti">Saldo Cuti &amp; Import Cuti.xlsx</button>
    </div>
  `;

  if (employeeSubTab !== 'directory') {
    content.innerHTML = header('Employee Directory', '', '<button id="add-employee" class="btn btn-secondary">+ Add Employee</button>') +
      subTabsHtml + '<div id="emp-ext-host"></div>';
    $$('[data-emp-subtab]').forEach(b => b.addEventListener('click', () => {
      employeeSubTab = b.dataset.empSubtab || 'directory';
      renderEmployees();
    }));
    $('#add-employee')?.addEventListener('click', () => openEmployeeEditor(null, null));
    loadOpsViewsModule().then(opsMod => opsMod.renderEmployeeExtensionsView($('#emp-ext-host'), employeeSubTab, {
      isDemoMode,
      supabase,
      profile: currentAdminProfile,
      getEmployees: () => employees,
      getLastDelta: () => lastEmployeeDelta,
      setLastDelta: d => { lastEmployeeDelta = d; }
    }));
    return;
  }

  const idx = getWorkspaceIndexes();
  const indexedEmployees = employees.map(e => {
    const a = idx.applicantById.get(e.applicant_id) || null;
    const row = formatEmployeeExportRow(e, a);
    return {
      employee: e,
      searchText: Object.values(row).join(' ').toLowerCase()
    };
  });

  content.innerHTML = header('Employee Directory', '',
    '<button id="add-employee" class="btn btn-secondary">+ Add Employee</button>' +
    '<button id="upload-employees" class="btn btn-secondary">Upload XLSX / CSV ↑</button>' +
    '<button id="export-employees" class="btn btn-primary">Download XLSX ↓</button>'
  ) + migrationWarn + subTabsHtml + `
    <section class="panel table-panel">${tableToolbar('Search name / NIK / department / position…', 'Employee Directory')}
      <div class="table-wrap recruitment-data-scroll">
        <table class="data-table">
          <thead><tr>${EMPLOYEE_UI_HEADERS.map(h => `<th>${esc(h.toUpperCase())}</th>`).join('')}<th>ACTIONS</th></tr></thead>
          <tbody id="employee-rows"></tbody>
        </table>
      </div><div id="employee-pager"></div>
    </section>`;

  $$('[data-emp-subtab]').forEach(b => b.addEventListener('click', () => {
    employeeSubTab = b.dataset.empSubtab || 'directory';
    renderEmployees();
  }));

  let empQuery = '';
  let empPage = 1;
  let empPageSize = 50;

  const paintEmployees = () => {
    const filtered = empQuery
      ? indexedEmployees.filter(item => item.searchText.includes(empQuery)).map(item => item.employee)
      : employees;
    const paged = paginateRows(filtered, empPage, empPageSize);
    empPage = paged.page;
    $('#employee-rows').innerHTML = employeeRows(paged.items);
    renderPaginationFooter($('#employee-pager'), paged, (nextPage, nextSize) => {
      empPage = nextPage;
      empPageSize = nextSize;
      paintEmployees();
    });
    bindEmployeeEdit();
  };
  paintEmployees();

  bindSearch('#table-search', query => {
    empQuery = query;
    empPage = 1;
    paintEmployees();
  });

  $('#add-employee').addEventListener('click', () => openEmployeeEditor(null, null));
  $('#upload-employees').addEventListener('click', () => {
    openEmployeeUploadModal({
      onDownloadTemplate: downloadEmployeeTemplateXlsx,
      onImport: async parsedRows => {
        if (employeesExtendedMissing) {
          throw new Error('Please run SQL migration v2/v3 first before importing the 16-column Employee Directory.');
        }
        const chunkSize = 100;
        for (let i = 0; i < parsedRows.length; i += chunkSize) {
          const batch = parsedRows.slice(i, i + chunkSize).map(r => ({
            ...r,
            updated_at: new Date().toISOString()
          }));
          const { error } = await supabase.from('employees').upsert(batch, { onConflict: 'employee_no' });
          if (error) throw error;
        }
        invalidateDataCache();
        say(`${parsedRows.length} employee records imported into Employee Directory.`);
        await loadView('employees', true);
      }
    });
  });
  $('#export-employees').addEventListener('click', exportEmployees);
}

function openEmployeeEditor(employee = null, applicant = null) {
  openFullEmployeeModal({
    employee,
    applicant,
    onSave: async fields => {
      if (fields.id) {
        const updatePayload = employeesExtendedMissing
          ? {
              employee_no: fields.employee_no,
              department: fields.department,
              position: fields.position,
              employment_status: fields.employment_status,
              join_date: fields.join_date,
              notes: fields.notes,
              updated_at: new Date().toISOString()
            }
          : { ...fields, id: undefined, updated_at: new Date().toISOString() };
        delete updatePayload.id;
        const { error } = await supabase.from('employees').update(updatePayload).eq('id', fields.id);
        if (error) throw error;
        say('Employee record updated.');
      } else if (fields.applicant_id && employeesExtendedMissing) {
        const { error } = await supabase.rpc('convert_applicant_to_employee', {
          p_applicant_id: fields.applicant_id,
          p_employee_no: fields.employee_no,
          p_department: fields.department,
          p_position: fields.position,
          p_employment_status: fields.employment_status,
          p_join_date: fields.join_date,
          p_notes: fields.notes
        });
        if (error) throw error;
        say('Candidate added to Employee Directory.');
      } else {
        const insertPayload = { ...fields };
        delete insertPayload.id;
        insertPayload.updated_at = new Date().toISOString();
        const { error } = await supabase.from('employees').upsert(insertPayload, { onConflict: 'employee_no' });
        if (error) throw error;
        if (fields.applicant_id) {
          await supabase.from('applicants').update({ stage: 'hired', updated_at: new Date().toISOString() }).eq('id', fields.applicant_id);
        }
        say('Employee record saved to Employee Directory.');
      }
      invalidateDataCache();
      await loadView('employees', true);
    }
  });
}

function bindEmployeeEdit() {
  $$('[data-edit-employee]').forEach(button => button.addEventListener('click', () => {
    const employee = employees.find(e => e.id === button.dataset.editEmployee);
    if (employee) openEmployeeEditor(employee);
  }));
}

async function downloadEmployeeTemplateXlsx() {
  try {
    const XLSX = await loadXlsxLib();
    const sample = [{
      Nama: 'ABD. KHAMID',
      Nik: 'ST 130116',
      Departement: 'PURCHASING',
      'Tgl Masuk': '05-11-2004',
      Jabatan: 'MMD',
      'Mulai Kontrak': '-',
      'Kontrak Berakhir': '-',
      Alamat: 'Subontoro Rt 16/07 Medali Puri - Mojokerto',
      Nik2: '3516112304830004',
      'Tempat Lahir': 'Mojokerto',
      'Tanggal Lahir': '31-12-1983',
      'No. Telp': '82230164498',
      Status: 'TETAP',
      Pendidikan: 'SMP',
      'Jenis Kelamin': 'Laki-laki',
      Agama: 'Islam'
    }];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sample, { header: EMPLOYEE_TABLE_HEADERS });
    ws['!cols'] = EMPLOYEE_TABLE_HEADERS.map(key => ({ wch: Math.max(15, key.length + 4) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Employee Template');
    XLSX.writeFile(wb, 'Template_Employee_Directory.xlsx');
    say('XLSX template downloaded.');
  } catch (err) {
    say(err.message || 'Failed to prepare XLSX template.');
  }
}

async function exportEmployees() {
  const button = $('#export-employees');
  button.disabled = true;
  button.textContent = 'Preparing XLSX…';
  try {
    const XLSX = await loadXlsxLib();
    const idx = getWorkspaceIndexes();
    const rowsData = employees.map(employee => {
      const applicant = idx.applicantById.get(employee.applicant_id) || null;
      return formatEmployeeExportRow(employee, applicant);
    });
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rowsData.length ? rowsData : [Object.fromEntries(EMPLOYEE_TABLE_HEADERS.map(h => [h, '']))], { header: EMPLOYEE_TABLE_HEADERS });
    sheet['!cols'] = EMPLOYEE_TABLE_HEADERS.map(key => ({ wch: Math.min(34, Math.max(14, key.length + 4)) }));
    XLSX.utils.book_append_sheet(workbook, sheet, 'Employee Directory');
    XLSX.writeFile(workbook, `Employee_Directory_${new Date().toISOString().slice(0, 10)}.xlsx`);
    say(`${employees.length} employee records exported to XLSX.`);
  } catch (error) {
    say(error.message || 'Failed to export XLSX file.');
  } finally {
    button.disabled = false;
    button.textContent = 'Download XLSX ↓';
  }
}

/* ============================================================================
 * CONTRACTS, PKWT APPROVAL WORKFLOW, SYSTEM CONTRACT SETTINGS & BULK IMPORT
 * ============================================================================ */
function readLocalJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed !== null && parsed !== undefined ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function mapDbHistoryToLocal(row = {}) {
  return {
    id: row.id,
    requestId: row.request_id ?? row.requestId ?? null,
    employeeId: row.employee_id ?? row.employeeId ?? null,
    createdEmployeeId: row.created_employee_id ?? row.createdEmployeeId ?? null,
    applicantId: row.applicant_id ?? row.applicantId ?? null,
    interviewId: row.interview_id ?? row.interviewId ?? null,
    fullName: row.full_name ?? row.fullName ?? '',
    employeeNik: row.employee_nik ?? row.employeeNik ?? '',
    position: row.position ?? '',
    contractNumber: row.contract_number ?? row.contractNumber ?? '',
    docSequence: row.doc_sequence ?? row.docSequence ?? '',
    contractStartDate: row.contract_start_date ?? row.contractStartDate ?? '',
    contractEndDate: row.contract_end_date ?? row.contractEndDate ?? '',
    salary: Number(row.salary ?? 0) || 0,
    status: row.status || 'applied',
    previousSnapshot: row.previous_snapshot ?? row.previousSnapshot ?? {},
    appliedBy: row.applied_by_name ?? row.appliedBy ?? 'Administrator',
    appliedAt: row.created_at ?? row.appliedAt ?? new Date().toISOString(),
    cancelledBy: row.cancelled_by_name ?? row.cancelledBy ?? null,
    cancelledAt: row.cancelled_at ?? row.cancelledAt ?? null
  };
}

async function loadContractWorkspaceState(force = false) {
  if (isDemoMode || !supabase) {
    contractSettings = readSavedContractSettings();
    const storedHist = readLocalJson(DEMO_CONTRACT_HISTORY_KEY, []);
    if (Array.isArray(storedHist)) contractHistory = storedHist;
    return;
  }
  if (!force && contractSettings && contractHistory.length) return;
  try {
    const [settingsRes, histSettingRes, histTableRes] = await Promise.all([
      supabase.from('portal_settings').select('value').eq('key', 'contract_settings').maybeSingle(),
      supabase.from('portal_settings').select('value').eq('key', 'contract_history').maybeSingle(),
      supabase.from('contract_history').select('*').order('created_at', { ascending: false }).limit(200)
    ]);

    if (settingsRes?.data?.value && typeof settingsRes.data.value === 'object') {
      contractSettings = { ...DEFAULT_CONTRACT_SETTINGS, ...settingsRes.data.value };
      writeSavedContractSettings(contractSettings);
    } else {
      contractSettings = readSavedContractSettings();
    }

    if (histTableRes.error) {
      contractTablesMissing = true;
      contractHistory = Array.isArray(histSettingRes?.data?.value) ? histSettingRes.data.value : [];
    } else {
      contractTablesMissing = false;
      contractHistory = (histTableRes.data || []).map(mapDbHistoryToLocal);
    }
  } catch {
    contractSettings = readSavedContractSettings();
  }
}

async function saveContractSettingsState(nextSettings) {
  contractSettings = { ...DEFAULT_CONTRACT_SETTINGS, ...contractSettings, ...nextSettings };
  writeSavedContractSettings(contractSettings);
  if (isDemoMode || !supabase) return;
  const { error } = await supabase.from('portal_settings').upsert({
    key: 'contract_settings',
    value: contractSettings,
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) throw error;
}

async function saveContractHistoryFallback() {
  if (isDemoMode || !supabase) {
    writeLocalJson(DEMO_CONTRACT_HISTORY_KEY, contractHistory);
    return;
  }
  const { error } = await supabase.from('portal_settings').upsert({
    key: 'contract_history',
    value: contractHistory,
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) throw error;
}

async function syncPrintedContractToDirectory(queueKey) {
  const printed = printedContractsMap.get(queueKey);
  if (!printed) {
    throw new Error('Print the PKWT contract first before syncing to Employee Directory.');
  }

  const queue = buildContractWorkspaceQueue({ employees, interviews, applicants });
  const rec = queue.rows.find(r => r.queueKey === queueKey) || printed.record || {};
  const currentEmployee = (rec.employeeId && employees.find(e => e.id === rec.employeeId)) ||
    (rec.applicantId && employees.find(e => e.applicant_id === rec.applicantId)) ||
    (rec.employeeNik && employees.find(e =>
      String(e.employee_no || '').trim().toUpperCase() === String(rec.employeeNik || '').trim().toUpperCase()
    )) ||
    null;
  const currentInterview = (rec.interviewId && interviews.find(i => i.id === rec.interviewId)) || null;
  const nowIso = new Date().toISOString();

  const sync = buildDirectContractSyncPayloads({
    record: { ...rec, queueKey },
    config: printed.config || {},
    payload: printed.payload || {},
    currentEmployee,
    currentInterview,
    appliedBy: currentAdminProfile?.displayName || 'HR Admin',
    appliedAt: nowIso
  });

  const empFields = {
    ...sync.employeePayload,
    updated_at: nowIso
  };

  let targetEmployeeId = currentEmployee?.id || rec.employeeId || null;
  let createdEmployeeId = null;

  if (isDemoMode || !supabase) {
    if (targetEmployeeId) {
      const idx = employees.findIndex(e => e.id === targetEmployeeId);
      if (idx >= 0) employees[idx] = { ...employees[idx], ...empFields };
    } else {
      const byNikIdx = employees.findIndex(e =>
        String(e.employee_no || '').trim().toUpperCase() === String(empFields.employee_no || '').trim().toUpperCase()
      );
      if (byNikIdx >= 0) {
        targetEmployeeId = employees[byNikIdx].id;
        employees[byNikIdx] = { ...employees[byNikIdx], ...empFields };
      } else {
        targetEmployeeId = `emp-demo-${Date.now()}`;
        createdEmployeeId = targetEmployeeId;
        employees.unshift({ id: targetEmployeeId, ...empFields });
      }
    }
    if (sync.interviewPatch?.id) {
      const iIdx = interviews.findIndex(i => i.id === sync.interviewPatch.id);
      if (iIdx >= 0) interviews[iIdx] = { ...interviews[iIdx], ...sync.interviewPatch };
    }
    if (sync.applicantId) {
      const aIdx = applicants.findIndex(a => a.id === sync.applicantId);
      if (aIdx >= 0) applicants[aIdx] = { ...applicants[aIdx], stage: 'hired' };
    }
  } else {
    if (targetEmployeeId) {
      const { error } = await supabase.from('employees').update(empFields).eq('id', targetEmployeeId);
      if (error) throw error;
    } else {
      const existingByNik = employees.find(e =>
        String(e.employee_no || '').trim().toUpperCase() === String(empFields.employee_no || '').trim().toUpperCase()
      );
      const { data: upserted, error } = await supabase.from('employees')
        .upsert(empFields, { onConflict: 'employee_no' })
        .select('id')
        .single();
      if (error) throw error;
      targetEmployeeId = upserted?.id || existingByNik?.id || null;
      if (!existingByNik && targetEmployeeId) createdEmployeeId = targetEmployeeId;
    }
    if (sync.interviewPatch?.id) {
      const patchBody = { ...sync.interviewPatch };
      delete patchBody.id;
      await supabase.from('candidate_interviews').update(patchBody).eq('id', sync.interviewPatch.id);
    }
    if (sync.applicantId) {
      await supabase.from('applicants')
        .update({ stage: 'hired', updated_at: nowIso })
        .eq('id', sync.applicantId);
    }
  }

  const historyEntry = {
    ...sync.historyEntry,
    employeeId: targetEmployeeId,
    createdEmployeeId
  };

  if (isDemoMode || !supabase || contractTablesMissing) {
    contractHistory = [historyEntry, ...contractHistory];
    await saveContractHistoryFallback();
  } else {
    const { data: hData, error: hErr } = await supabase.from('contract_history').insert({
      request_id: null,
      employee_id: targetEmployeeId,
      created_employee_id: createdEmployeeId,
      applicant_id: historyEntry.applicantId || null,
      interview_id: historyEntry.interviewId || null,
      full_name: historyEntry.fullName,
      employee_nik: historyEntry.employeeNik,
      position: historyEntry.position,
      contract_number: historyEntry.contractNumber,
      doc_sequence: historyEntry.docSequence,
      contract_start_date: historyEntry.contractStartDate || null,
      contract_end_date: historyEntry.contractEndDate || null,
      salary: historyEntry.salary || 0,
      status: 'applied',
      previous_snapshot: historyEntry.previousSnapshot || {},
      applied_by: currentUserId || null,
      applied_by_name: historyEntry.appliedBy
    }).select('*').single();

    if (hErr && isMissingSchemaError(hErr)) {
      contractTablesMissing = true;
      contractHistory = [historyEntry, ...contractHistory];
      await saveContractHistoryFallback();
    } else if (hErr) {
      throw hErr;
    } else if (hData) {
      contractHistory = [mapDbHistoryToLocal(hData), ...contractHistory];
    }
  }

  printedContractsMap.set(queueKey, { ...printed, syncedAt: nowIso });
  savePrintedContractsMap();
  invalidateDataCache();
  return historyEntry;
}

async function cancelAppliedContract(historyId) {
  if (!isRootAdminAccount(currentAdminProfile)) {
    throw new Error('Only Administrator / Root Admin can cancel applied contracts.');
  }
  const entry = contractHistory.find(h => h.id === historyId);
  if (!entry) throw new Error('Contract history record not found.');

  const rollback = applyContractCancellationRollback(entry, { employees, interviews });
  const nowIso = new Date().toISOString();

  if (isDemoMode || !supabase) {
    employees = rollback.updatedEmployees;
    if (rollback.createdEmployeeToDelete) {
      employees = employees.filter(e => e.id !== rollback.createdEmployeeToDelete);
    }
    interviews = rollback.updatedInterviews;
  } else {
    if (rollback.createdEmployeeToDelete) {
      const { error } = await supabase.from('employees').delete().eq('id', rollback.createdEmployeeToDelete);
      if (error) throw error;
    } else if (rollback.employeeId && rollback.employeeRestore) {
      const { error } = await supabase.from('employees')
        .update({ ...rollback.employeeRestore, updated_at: nowIso })
        .eq('id', rollback.employeeId);
      if (error) throw error;
    }
    if (rollback.interviewId && rollback.interviewRestore) {
      const { error } = await supabase.from('candidate_interviews')
        .update({ ...rollback.interviewRestore, updated_at: nowIso })
        .eq('id', rollback.interviewId);
      if (error) throw error;
    }
    employees = rollback.updatedEmployees;
    interviews = rollback.updatedInterviews;
  }

  entry.status = 'cancelled';
  entry.cancelledBy = currentAdminProfile?.displayName || 'Administrator';
  entry.cancelledAt = nowIso;

  if (isDemoMode || !supabase || contractTablesMissing) {
    await saveContractHistoryFallback();
  } else {
    const { error } = await supabase.from('contract_history').update({
      status: 'cancelled',
      cancelled_by: currentUserId || null,
      cancelled_by_name: entry.cancelledBy,
      cancelled_at: nowIso
    }).eq('id', entry.id);
    if (error) throw error;
  }
  invalidateDataCache();
}

function getActiveUmkThreshold() {
  const umk = parseNumericCurrency(contractSettings?.currUmkAmount);
  return umk > 0 ? umk : DEFAULT_CONTRACT_SETTINGS.currUmkAmount;
}

function buildContractRecordFromInterview(intv, cand = null) {
  const app = (intv.applicant_id && applicants.find(a => a.id === intv.applicant_id)) || cand?.applicantRef || null;
  const appData = app?.application_data || {};
  const emp = (intv.applicant_id && employees.find(e => e.applicant_id === intv.applicant_id)) ||
    (intv.assigned_nik && employees.find(e => String(e.employee_no || '').trim().toUpperCase() === String(intv.assigned_nik || '').trim().toUpperCase())) ||
    null;
  return {
    queueKey: intv?.id ? `intv:${intv.id}` : '',
    sourceType: 'final_interview',
    employeeId: emp?.id || null,
    applicantId: intv.applicant_id || null,
    interviewId: intv.id || null,
    fullName: intv.candidate_name || emp?.full_name || app?.full_name || '',
    employeeNik: intv.assigned_nik || emp?.employee_no || '',
    ktpNik: intv.candidate_nik || emp?.ktp_nik || app?.nik || '',
    department: emp?.department || '',
    position: intv.official_position || emp?.position || intv.applied_position || app?.position || '',
    address: emp?.address || appData.alamat_asal || appData.domisili || '',
    phone: intv.candidate_whatsapp || emp?.phone || appData.telepon || '',
    salary: intv.salary ?? emp?.salary ?? null,
    contractStartDate: intv.contract_start_date || intv.work_start_date || emp?.contract_start_date || '',
    contractEndDate: intv.contract_end_date || emp?.contract_end_date || '',
    durationMonths: intv.contract_duration_months || 12,
    contractNumber: intv.contract_number || '',
    workStartDate: intv.work_start_date || intv.contract_start_date || ''
  };
}

async function openPkwtForRecord(record) {
  const nextDocSequence = computeNextDocSequence({
    contractHistory,
    contractRequests: [],
    interviews,
    lastDocSequence: contractSettings?.lastDocSequence || 0
  });

  try {
    const { openPkwtConfigModal } = await loadContractModalModule();
    await openPkwtConfigModal({
      record,
      contractSettings,
      nextDocSequence,
      onAfterPrint: async ({ record: rec, config, payload }) => {
        const printedSeqNum = Number(String(payload.docSequence || '').replace(/\D/g, '')) || 0;
        if (printedSeqNum > (Number(contractSettings.lastDocSequence) || 0)) {
          await saveContractSettingsState({ lastDocSequence: printedSeqNum }).catch(() => {});
        }

        const queueKey = rec.queueKey ||
          (rec.employeeId ? `emp:${rec.employeeId}` : rec.interviewId ? `intv:${rec.interviewId}` : `name:${rec.fullName}`);

        if (queueKey) {
          printedContractsMap.set(queueKey, {
            queueKey,
            record: rec,
            config,
            payload,
            printedAt: new Date().toISOString()
          });
          savePrintedContractsMap();
        }

        say(`Contract printed for ${rec.fullName || 'employee'}. Use "Sync to Employee Directory" beside their name when ready.`);
        if (activeView === 'contracts') await renderContractsView();
      }
    });
  } catch (err) {
    say(err.message || 'Unable to open PKWT configuration.');
  }
}

function formatIdrShort(amount) {
  const n = parseNumericCurrency(amount);
  return n > 0 ? `Rp ${n.toLocaleString('id-ID')}` : 'Not Set';
}

async function renderContractsView() {
  await loadContractWorkspaceState(false);
  const queue = buildContractWorkspaceQueue({ employees, interviews, applicants });
  const activeUmk = getActiveUmkThreshold();
  let currentFilter = 'all';
  let currentQuery = '';

  const rowsHtml = list => {
    if (!list.length) return emptyRow(6, 'No expiring contracts (2-month window) or Final Interview passed candidates');
    return list.map(row => {
      const rule = determineRequiredContractDocuments(row.salary, activeUmk);
      const periodText = row.contractStartDate && row.contractEndDate
        ? `${formatDmyDash(row.contractStartDate)} → ${formatDmyDash(row.contractEndDate)}`
        : (row.contractEndDate ? `Ends ${formatDmyDash(row.contractEndDate)}` : 'Pending start date');
      const urgencySub = typeof row.daysRemaining === 'number'
        ? (row.daysRemaining < 0 ? `${Math.abs(row.daysRemaining)}d overdue` : `${row.daysRemaining}d remaining`)
        : 'New hire PKWT';
      const wageBadge = row.salary > 0
        ? `<span class="status-pill ${rule.meetsUmk ? 'green' : 'gold'}">${rule.meetsUmk ? 'PKWT Only (1 Doc)' : 'PKWT + 4 PB (5 Docs)'}</span>`
        : `<span class="status-pill gray">Set Salary in PKWT</span>`;
      const printedEntry = printedContractsMap.get(row.queueKey);
      const syncInlineHtml = printedEntry
        ? (printedEntry.syncedAt
            ? '<span class="status-pill green contracts-synced-pill">Synced</span>'
            : `<button type="button" class="btn btn-primary btn-xs contracts-sync-btn" data-sync-employee="${esc(row.queueKey)}">Sync to Employee Directory</button>`)
        : '';

      return `<tr class="${row.priorityGroup === 1 ? 'contract-priority-row ' : ''}contract-row-clickable" data-contract-row="${esc(row.queueKey)}">
        <td>
          <div class="contracts-name-row">
            <b>${esc(row.fullName)}</b>
            ${syncInlineHtml}
          </div>
          <small class="table-subline">${esc(row.employeeNik || 'No NIK assigned')}</small>
        </td>
        <td>
          <span class="status-pill ${esc(row.sourceTone)}">${esc(row.sourceBadge)}</span>
          <small class="table-subline">${esc(urgencySub)}</small>
        </td>
        <td>
          <b>${esc(row.position || '—')}</b>
          <small class="table-subline">${esc(row.department || 'No department')}</small>
        </td>
        <td>
          <span>${esc(periodText)}</span>
          ${row.contractNumber ? `<small class="table-subline">${esc(row.contractNumber)}</small>` : ''}
        </td>
        <td>
          <b>${esc(formatIdrShort(row.salary))}</b>
          <div style="margin-top:4px">${wageBadge}</div>
        </td>
        <td>
          <button type="button" class="btn btn-primary btn-xs" data-configure-pkwt="${esc(row.queueKey)}">Configure PKWT</button>
        </td>
      </tr>`;
    }).join('');
  };

  const applyFilter = () => {
    const filtered = queue.rows.filter(row => {
      if (currentFilter === 'expiring' && row.sourceType !== 'expiring_contract') return false;
      if (currentFilter === 'final' && row.sourceType !== 'final_interview') return false;
      if (!currentQuery) return true;
      return `${row.fullName} ${row.employeeNik} ${row.position} ${row.department} ${row.sourceBadge} ${row.contractNumber}`.toLowerCase().includes(currentQuery);
    });
    const tbody = $('#contract-rows');
    if (tbody) tbody.innerHTML = rowsHtml(filtered);
    $$('[data-contract-row]').forEach(tr => {
      tr.addEventListener('click', () => {
        const rec = queue.rows.find(r => r.queueKey === tr.dataset.contractRow);
        if (rec) openPkwtForRecord(rec);
      });
    });
    $$('[data-configure-pkwt]').forEach(btn => {
      btn.addEventListener('click', event => {
        event.stopPropagation();
        const rec = queue.rows.find(r => r.queueKey === btn.dataset.configurePkwt);
        if (rec) openPkwtForRecord(rec);
      });
    });
    $$('[data-sync-employee]').forEach(btn => {
      btn.addEventListener('click', async event => {
        event.stopPropagation();
        const qKey = btn.dataset.syncEmployee;
        btn.disabled = true;
        btn.textContent = 'Syncing…';
        try {
          const entry = await syncPrintedContractToDirectory(qKey);
          say(`${entry.fullName} synced to Employee Directory.`);
          await renderContractsView();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Sync to Employee Directory';
          say(err.message || 'Failed to sync contract to Employee Directory.');
        }
      });
    });
  };

  content.innerHTML = header('Contracts', '', '<button class="btn btn-secondary" id="refresh-contracts">Refresh ↻</button>') +
    `<section class="panel table-panel">
      <div class="table-toolbar contracts-toolbar">
        <div class="contracts-filter-tabs" role="tablist" aria-label="Filter contracts">
          <button type="button" class="contracts-tab is-active" data-contract-tab="all">All (${queue.rows.length})</button>
          <button type="button" class="contracts-tab" data-contract-tab="expiring">Expiring 2 Months (${queue.expiringCount})</button>
          <button type="button" class="contracts-tab" data-contract-tab="final">Final Interview Passed (${queue.finalInterviewCount})</button>
        </div>
        <div class="table-search">
          <input id="contract-search" type="search" placeholder="Search name / NIK / position…">
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>EMPLOYEE / CANDIDATE</th>
              <th>PRIORITY &amp; SOURCE</th>
              <th>POSITION &amp; DEPT</th>
              <th>CONTRACT PERIOD</th>
              <th>SALARY &amp; UMK RULE</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody id="contract-rows"></tbody>
        </table>
      </div>
    </section>`;

  $('#refresh-contracts')?.addEventListener('click', () => loadView('contracts', true));
  $$('[data-contract-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      currentFilter = tab.dataset.contractTab || 'all';
      $$('[data-contract-tab]').forEach(t => t.classList.toggle('is-active', t === tab));
      applyFilter();
    });
  });
  const onContractSearch = debounce(event => {
    currentQuery = event.target.value.trim().toLowerCase();
    applyFilter();
  }, 160);
  $('#contract-search')?.addEventListener('input', onContractSearch);
  applyFilter();
}

function formatDigitsId(n) {
  const num = parseNumericCurrency(n);
  return num > 0 ? num.toLocaleString('id-ID') : '';
}

/* ============================================================================
 * SYSTEM SETTINGS -> CONTRACT SETTINGS (A. PKWT & B. Contract Cancellation)
 * ============================================================================ */
async function renderContractSettings() {
  await loadContractWorkspaceState(false);
  const s = { ...DEFAULT_CONTRACT_SETTINGS, ...contractSettings };

  const historyRowsHtml = contractHistory.length
    ? contractHistory.map(h => {
        const isCancelled = h.status === 'cancelled';
        return `<tr>
          <td><b>${esc(h.fullName)}</b><small class="table-subline">${esc(h.employeeNik || '—')}</small></td>
          <td style="font-family:var(--font-mono)">${esc(h.contractNumber || '—')}</td>
          <td>${esc(h.position || '—')}<small class="table-subline">${esc(formatIdrShort(h.salary))}</small></td>
          <td>${esc(formatDmyDash(h.contractStartDate))} → ${esc(formatDmyDash(h.contractEndDate))}</td>
          <td>${esc(h.appliedBy || 'Administrator')}<small class="table-subline">${esc(idDate(h.appliedAt))}</small></td>
          <td><span class="status-pill ${isCancelled ? 'gray' : 'green'}">${isCancelled ? 'Cancelled' : 'Applied'}</span></td>
          <td>${isCancelled
            ? `<small class="subtle">Reverted${h.cancelledAt ? ` (${esc(idDate(h.cancelledAt))})` : ''}</small>`
            : `<button type="button" class="icon-btn danger" data-cancel-history="${esc(h.id)}">Cancel Contract</button>`}</td>
        </tr>`;
      }).join('')
    : emptyRow(7, 'No applied contract records yet');

  content.innerHTML = `<div class="system-settings-grid">
    <section class="panel">
      <div class="panel-head">
        <h3>A. PKWT</h3>
        <span class="status-pill blue">System Defaults</span>
      </div>
      <div style="padding:20px">
        <form id="contract-settings-form">
          <div class="contract-settings-form">
            <label>Previous Year UMK Year
              <input class="input" type="number" name="prevUmkYear" min="2020" max="2040" value="${esc(s.prevUmkYear)}" required>
            </label>
            <label>Previous Year UMK Amount (IDR)
              <input class="input" type="text" inputmode="numeric" name="prevUmkAmount" value="${esc(formatDigitsId(s.prevUmkAmount))}" required>
            </label>
            <label>Current Year UMK Year
              <input class="input" type="number" name="currUmkYear" min="2020" max="2040" value="${esc(s.currUmkYear)}" required>
            </label>
            <label>Current Year UMK Amount (IDR)
              <input class="input" type="text" inputmode="numeric" name="currUmkAmount" value="${esc(formatDigitsId(s.currUmkAmount))}" required>
            </label>
            <label>Payday Date (Day of Month)
              <input class="input" type="number" name="paydayDay" min="1" max="31" value="${esc(s.paydayDay)}" required>
            </label>
            <label>Signing City
              <input class="input" type="text" name="signingCity" maxlength="60" value="${esc(s.signingCity)}" required>
            </label>
            <label>Company Representative Signer Name
              <input class="input" type="text" name="hrName" maxlength="100" value="${esc(s.hrName)}" required>
            </label>
            <label>Company Representative Signer Title
              <input class="input" type="text" name="hrSignatureTitle" maxlength="100" value="${esc(s.hrSignatureTitle)}" required>
            </label>
            <label>Governor Decree No. (UMK Basis)
              <input class="input" type="text" name="governorDecreeNo" maxlength="80" value="${esc(s.governorDecreeNo)}" required>
            </label>
            <label>Weekday Overtime Rate (IDR)
              <input class="input" type="text" inputmode="numeric" name="overtimeWeekdayRate" value="${esc(formatDigitsId(s.overtimeWeekdayRate))}" required>
            </label>
            <label>Holiday Overtime Rate (IDR)
              <input class="input" type="text" inputmode="numeric" name="overtimeHolidayRate" value="${esc(formatDigitsId(s.overtimeHolidayRate))}" required>
            </label>
            <label>Last Issued Sequence No.
              <input class="input" type="number" name="lastDocSequence" min="0" value="${esc(s.lastDocSequence || 0)}">
            </label>
          </div>
          <div class="contract-settings-actions">
            <button type="submit" class="btn btn-primary" id="save-contract-settings">Save PKWT Settings</button>
          </div>
        </form>
      </div>
    </section>

    <section class="panel table-panel">
      <div class="panel-head">
        <h3>B. Contract Cancellation</h3>
        <span class="status-pill gray">${contractHistory.filter(h => h.status === 'applied').length} active</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>EMPLOYEE</th>
              <th>CONTRACT NO.</th>
              <th>POSITION &amp; SALARY</th>
              <th>PERIOD</th>
              <th>APPLIED BY</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>${historyRowsHtml}</tbody>
        </table>
      </div>
    </section>
  </div>`;

  const form = $('#contract-settings-form');
  ['prevUmkAmount', 'currUmkAmount', 'overtimeWeekdayRate', 'overtimeHolidayRate'].forEach(field => {
    const input = form.elements[field];
    if (!input) return;
    input.addEventListener('input', () => {
      const { formatted, caretPos } = preserveCaretCurrencyValue(input.value, input.selectionStart);
      if (input.value !== formatted) input.value = formatted;
      if (typeof input.setSelectionRange === 'function') {
        try { input.setSelectionRange(caretPos, caretPos); } catch {}
      }
    });
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const btn = $('#save-contract-settings');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await saveContractSettingsState({
        prevUmkYear: Number(form.elements.prevUmkYear.value) || DEFAULT_CONTRACT_SETTINGS.prevUmkYear,
        prevUmkAmount: parseNumericCurrency(form.elements.prevUmkAmount.value),
        currUmkYear: Number(form.elements.currUmkYear.value) || DEFAULT_CONTRACT_SETTINGS.currUmkYear,
        currUmkAmount: parseNumericCurrency(form.elements.currUmkAmount.value),
        paydayDay: Math.min(31, Math.max(1, Number(form.elements.paydayDay.value) || 10)),
        signingCity: form.elements.signingCity.value.trim() || 'Pasuruan',
        hrName: form.elements.hrName.value.trim() || DEFAULT_CONTRACT_SETTINGS.hrName,
        hrSignatureTitle: form.elements.hrSignatureTitle.value.trim() || DEFAULT_CONTRACT_SETTINGS.hrSignatureTitle,
        governorDecreeNo: form.elements.governorDecreeNo.value.trim() || DEFAULT_CONTRACT_SETTINGS.governorDecreeNo,
        overtimeWeekdayRate: parseNumericCurrency(form.elements.overtimeWeekdayRate.value),
        overtimeHolidayRate: parseNumericCurrency(form.elements.overtimeHolidayRate.value),
        lastDocSequence: Math.max(0, Number(form.elements.lastDocSequence.value) || 0)
      });
      say('PKWT settings saved.');
    } catch (err) {
      say(err.message || 'Failed to save PKWT settings.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save PKWT Settings';
    }
  });

  $$('[data-cancel-history]').forEach(btn => btn.addEventListener('click', async () => {
    const entry = contractHistory.find(h => h.id === btn.dataset.cancelHistory);
    if (!entry) return;
    const ok = await openConfirmDialog({
      title: 'Cancel Applied Contract',
      message: `Cancel contract ${entry.contractNumber} for ${entry.fullName} and revert Employee Directory data to its prior state?`,
      confirmLabel: 'Cancel & Revert',
      danger: true
    });
    if (!ok) return;
    btn.disabled = true;
    btn.textContent = 'Reverting…';
    try {
      await cancelAppliedContract(entry.id);
      say(`Contract ${entry.contractNumber} cancelled and employee data reverted.`);
      await renderContractSettings();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Cancel Contract';
      say(err.message || 'Failed to cancel contract.');
    }
  }));
}

/* ============================================================================
 * SYSTEM SETTINGS -> DATA IMPORT (Candidate List & Lead Register XLSX/CSV)
 * ============================================================================ */
function downloadCsvFile(headers, sampleRow, filename) {
  const escapeCell = v => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.map(escapeCell).join(','),
    headers.map(h => escapeCell(sampleRow[h] ?? '')).join(',')
  ].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseCsvTextToObjects(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const clean = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => String(h || '').trim());
  return rows.slice(1).map(cols => {
    const obj = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = cols[idx] ?? '';
    });
    return obj;
  });
}

async function readSpreadsheetFileObjects(file) {
  if (/\.csv$/i.test(file.name)) {
    return parseCsvTextToObjects(await file.text());
  }
  const XLSX = await loadXlsxLib();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) throw new Error('No worksheet found in uploaded file.');
  return XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { defval: '' });
}

async function downloadSpreadsheetTemplateXlsx(headers, sampleRow, sheetName, filename) {
  try {
    const XLSX = await loadXlsxLib();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([sampleRow], { header: headers });
    ws['!cols'] = headers.map(h => ({ wch: Math.max(16, h.length + 4) }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
    say(`Downloaded ${filename}.`);
  } catch (err) {
    say(err.message || 'Failed to generate XLSX template.');
  }
}

function renderSystemImport() {
  content.innerHTML = `<div class="import-cards-grid">
    <section class="panel">
      <div class="panel-head">
        <h3>Candidate List Import</h3>
        <span class="status-pill blue">XLSX / CSV</span>
      </div>
      <div class="import-card-body">
        <div class="import-schema-chips">
          ${CANDIDATE_IMPORT_HEADERS.map(h => `<span class="import-schema-chip">${esc(h)}</span>`).join('')}
        </div>
        <div class="row-actions">
          <button type="button" class="btn btn-secondary btn-xs" id="dl-cand-xlsx">Download XLSX Template ↓</button>
          <button type="button" class="btn btn-secondary btn-xs" id="dl-cand-csv">Download CSV Template ↓</button>
        </div>
        <div class="import-drop-row">
          <input id="import-cand-file" class="input" type="file" accept=".xlsx,.xls,.csv">
          <button type="button" class="btn btn-primary" id="import-cand-submit" disabled>Import Candidates</button>
        </div>
        <div id="import-cand-preview" class="upload-preview-box hidden"></div>
        <div id="import-cand-error" class="form-error" role="alert"></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h3>Lead Register Import</h3>
        <span class="status-pill blue">XLSX / CSV</span>
      </div>
      <div class="import-card-body">
        <div class="import-schema-chips">
          ${LEAD_IMPORT_HEADERS.map(h => `<span class="import-schema-chip">${esc(h)}</span>`).join('')}
        </div>
        <div class="row-actions">
          <button type="button" class="btn btn-secondary btn-xs" id="dl-lead-xlsx">Download XLSX Template ↓</button>
          <button type="button" class="btn btn-secondary btn-xs" id="dl-lead-csv">Download CSV Template ↓</button>
        </div>
        <div class="import-drop-row">
          <input id="import-lead-file" class="input" type="file" accept=".xlsx,.xls,.csv">
          <button type="button" class="btn btn-primary" id="import-lead-submit" disabled>Import Leads</button>
        </div>
        <div id="import-lead-preview" class="upload-preview-box hidden"></div>
        <div id="import-lead-error" class="form-error" role="alert"></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h3>DISC Assessment Import</h3>
        <span class="status-pill blue">XLSX / CSV</span>
      </div>
      <div class="import-card-body">
        <div class="import-schema-chips">
          ${DISC_IMPORT_HEADERS.slice(0, 8).map(h => `<span class="import-schema-chip">${esc(h)}</span>`).join('')}
          <span class="import-schema-chip">… Q24_P / Q24_K (${DISC_IMPORT_HEADERS.length} cols)</span>
        </div>
        <div class="row-actions">
          <button type="button" class="btn btn-secondary btn-xs" id="dl-disc-xlsx">Download XLSX Template ↓</button>
          <button type="button" class="btn btn-secondary btn-xs" id="dl-disc-csv">Download CSV Template ↓</button>
        </div>
        <div class="import-drop-row">
          <input id="import-disc-file" class="input" type="file" accept=".xlsx,.xls,.csv">
          <button type="button" class="btn btn-primary" id="import-disc-submit" disabled>Import DISC Results</button>
        </div>
        <div id="import-disc-preview" class="upload-preview-box hidden"></div>
        <div id="import-disc-error" class="form-error" role="alert"></div>
      </div>
    </section>
  </div>`;

  $('#dl-cand-xlsx').addEventListener('click', () =>
    downloadSpreadsheetTemplateXlsx(CANDIDATE_IMPORT_HEADERS, CANDIDATE_IMPORT_SAMPLE_ROW, 'Candidate List', 'Template_Candidate_List.xlsx')
  );
  $('#dl-cand-csv').addEventListener('click', () =>
    downloadCsvFile(CANDIDATE_IMPORT_HEADERS, CANDIDATE_IMPORT_SAMPLE_ROW, 'Template_Candidate_List.csv')
  );
  $('#dl-lead-xlsx').addEventListener('click', () =>
    downloadSpreadsheetTemplateXlsx(LEAD_IMPORT_HEADERS, LEAD_IMPORT_SAMPLE_ROW, 'Lead Register', 'Template_Lead_Register.xlsx')
  );
  $('#dl-lead-csv').addEventListener('click', () =>
    downloadCsvFile(LEAD_IMPORT_HEADERS, LEAD_IMPORT_SAMPLE_ROW, 'Template_Lead_Register.csv')
  );
  $('#dl-disc-xlsx').addEventListener('click', () =>
    downloadSpreadsheetTemplateXlsx(DISC_IMPORT_HEADERS, DISC_IMPORT_SAMPLE_ROW, 'DISC Assessment', 'Template_DISC_Assessment.xlsx')
  );
  $('#dl-disc-csv').addEventListener('click', () =>
    downloadCsvFile(DISC_IMPORT_HEADERS, DISC_IMPORT_SAMPLE_ROW, 'Template_DISC_Assessment.csv')
  );

  let parsedCandidates = [];
  const candFile = $('#import-cand-file');
  const candSubmit = $('#import-cand-submit');
  const candPreview = $('#import-cand-preview');
  const candError = $('#import-cand-error');

  candFile.addEventListener('change', async () => {
    parsedCandidates = [];
    candSubmit.disabled = true;
    candError.textContent = '';
    candPreview.classList.add('hidden');
    const file = candFile.files?.[0];
    if (!file) return;
    try {
      const raw = await readSpreadsheetFileObjects(file);
      const { rows, errors } = parseCandidateImportRows(raw);
      if (errors.length) candError.textContent = errors.slice(0, 3).join(' ');
      if (!rows.length) {
        if (!candError.textContent) candError.textContent = 'No valid candidate rows found.';
        return;
      }
      parsedCandidates = rows;
      candSubmit.disabled = false;
      candPreview.classList.remove('hidden');
      candPreview.innerHTML = `<b>${rows.length} candidate row(s) ready</b><div style="margin-top:6px;max-height:140px;overflow:auto">${rows.slice(0, 8).map(r => `<div>• <b>${esc(r.full_name)}</b> (${esc(r.nik)}) — ${esc(r.position)}</div>`).join('')}${rows.length > 8 ? `<div>… and ${rows.length - 8} more</div>` : ''}</div>`;
    } catch (err) {
      candError.textContent = err.message || 'Failed to parse Candidate List file.';
    }
  });

  candSubmit.addEventListener('click', async () => {
    if (!parsedCandidates.length) return;
    candSubmit.disabled = true;
    candSubmit.textContent = 'Importing…';
    candError.textContent = '';
    try {
      const existingKeys = new Set(applicants.map(a => `${String(a.nik || '').trim()}|${String(a.position || '').trim().toLowerCase()}`));
      const toInsert = parsedCandidates.filter(r => !existingKeys.has(`${r.nik}|${r.position.toLowerCase()}`));
      const skipped = parsedCandidates.length - toInsert.length;

      if (toInsert.length) {
        if (isDemoMode || !supabase) {
          const nowIso = new Date().toISOString();
          const newRows = toInsert.map((r, idx) => ({
            id: `app-imp-${Date.now()}-${idx}`,
            ...r,
            disc_submissions: [],
            created_at: nowIso
          }));
          applicants = [...newRows, ...applicants];
        } else {
          for (let i = 0; i < toInsert.length; i += 100) {
            const batch = toInsert.slice(i, i + 100);
            const { error } = await supabase.from('applicants').insert(batch);
            if (error) throw error;
          }
          invalidateDataCache();
          await fetchAndCacheFreshSnapshot();
        }
      }
      parsedCandidates = [];
      candFile.value = '';
      candPreview.classList.add('hidden');
      say(`Imported ${toInsert.length} candidate(s)${skipped ? ` (${skipped} duplicate skipped)` : ''}.`);
    } catch (err) {
      candError.textContent = err.message || 'Failed to import candidates.';
    } finally {
      candSubmit.disabled = true;
      candSubmit.textContent = 'Import Candidates';
    }
  });

  let parsedLeads = [];
  const leadFile = $('#import-lead-file');
  const leadSubmit = $('#import-lead-submit');
  const leadPreview = $('#import-lead-preview');
  const leadError = $('#import-lead-error');

  leadFile.addEventListener('change', async () => {
    parsedLeads = [];
    leadSubmit.disabled = true;
    leadError.textContent = '';
    leadPreview.classList.add('hidden');
    const file = leadFile.files?.[0];
    if (!file) return;
    try {
      const raw = await readSpreadsheetFileObjects(file);
      const { rows, errors } = parseLeadImportRows(raw);
      if (errors.length) leadError.textContent = errors.slice(0, 3).join(' ');
      if (!rows.length) {
        if (!leadError.textContent) leadError.textContent = 'No valid lead rows found.';
        return;
      }
      parsedLeads = rows;
      leadSubmit.disabled = false;
      leadPreview.classList.remove('hidden');
      leadPreview.innerHTML = `<b>${rows.length} lead row(s) ready</b><div style="margin-top:6px;max-height:140px;overflow:auto">${rows.slice(0, 8).map(r => `<div>• <b>${esc(r.full_name)}</b> — ${esc(r.position)} (${esc(r.source)})</div>`).join('')}${rows.length > 8 ? `<div>… and ${rows.length - 8} more</div>` : ''}</div>`;
    } catch (err) {
      leadError.textContent = err.message || 'Failed to parse Lead Register file.';
    }
  });

  leadSubmit.addEventListener('click', async () => {
    if (!parsedLeads.length) return;
    leadSubmit.disabled = true;
    leadSubmit.textContent = 'Importing…';
    leadError.textContent = '';
    try {
      if (isDemoMode || !supabase) {
        const nowIso = new Date().toISOString();
        const newRows = parsedLeads.map((r, idx) => ({
          id: `lead-imp-${Date.now()}-${idx}`,
          ...r,
          created_at: nowIso
        }));
        stage1Leads = [...newRows, ...stage1Leads];
      } else {
        for (let i = 0; i < parsedLeads.length; i += 100) {
          const batch = parsedLeads.slice(i, i + 100);
          const { error } = await supabase.from('candidate_stage1_applications').insert(batch);
          if (error) throw error;
        }
        invalidateDataCache();
        await fetchAndCacheFreshSnapshot();
      }
      const importedCount = parsedLeads.length;
      parsedLeads = [];
      leadFile.value = '';
      leadPreview.classList.add('hidden');
      say(`Imported ${importedCount} lead record(s) into Lead Register.`);
    } catch (err) {
      leadError.textContent = err.message || 'Failed to import leads.';
    } finally {
      leadSubmit.disabled = true;
      leadSubmit.textContent = 'Import Leads';
    }
  });

  let parsedDiscRows = [];
  const discFile = $('#import-disc-file');
  const discSubmit = $('#import-disc-submit');
  const discPreview = $('#import-disc-preview');
  const discError = $('#import-disc-error');

  discFile.addEventListener('change', async () => {
    parsedDiscRows = [];
    discSubmit.disabled = true;
    discError.textContent = '';
    discPreview.classList.add('hidden');
    const file = discFile.files?.[0];
    if (!file) return;
    try {
      const raw = await readSpreadsheetFileObjects(file);
      const { rows, errors } = parseDiscImportRows(raw);
      if (errors.length) discError.textContent = errors.slice(0, 3).join(' ');
      if (!rows.length) {
        if (!discError.textContent) discError.textContent = 'No valid DISC assessment rows found.';
        return;
      }
      parsedDiscRows = rows;
      discSubmit.disabled = false;
      discPreview.classList.remove('hidden');
      discPreview.innerHTML = `<b>${rows.length} DISC row(s) ready</b><div style="margin-top:6px;max-height:140px;overflow:auto">${rows.slice(0, 8).map(r => {
        const matched = applicants.find(a => String(a.nik || '').replace(/\D/g, '') === r.nik);
        return `<div>• <b>${esc(matched?.full_name || r.full_name || r.nik)}</b> (${esc(r.nik)}) — Dominant ${esc(r.result?.hurufDominan || '-')} ${matched ? '<span class="status-pill green">Matched</span>' : '<span class="status-pill gold">NIK not found</span>'}</div>`;
      }).join('')}${rows.length > 8 ? `<div>… and ${rows.length - 8} more</div>` : ''}</div>`;
    } catch (err) {
      discError.textContent = err.message || 'Failed to parse DISC file.';
    }
  });

  discSubmit.addEventListener('click', async () => {
    if (!parsedDiscRows.length) return;
    discSubmit.disabled = true;
    discSubmit.textContent = 'Importing…';
    discError.textContent = '';
    try {
      const appByNik = new Map();
      applicants.forEach(a => {
        const digits = String(a.nik || '').replace(/\D/g, '');
        if (digits && !appByNik.has(digits)) appByNik.set(digits, a);
      });

      const unmatched = [];
      const matchedPairs = [];
      const nowIso = new Date().toISOString();

      parsedDiscRows.forEach(row => {
        const matchedApp = appByNik.get(row.nik);
        if (!matchedApp) {
          unmatched.push(row.nik);
          return;
        }
        matchedPairs.push({ row, app: matchedApp });
      });

      if (unmatched.length) {
        discError.textContent = `Unmatched NIK (${unmatched.length}): ${unmatched.slice(0, 4).join(', ')}${unmatched.length > 4 ? '…' : ''}`;
      }
      if (!matchedPairs.length) {
        throw new Error('None of the uploaded NIKs match existing candidates in Candidate List.');
      }

      if (isDemoMode || !supabase) {
        const pairByAppId = new Map(matchedPairs.map(p => [p.app.id, p.row]));
        applicants = applicants.map(a => {
          const imported = pairByAppId.get(a.id);
          if (!imported) return a;
          return {
            ...a,
            stage: a.stage === 'application_submitted' ? 'disc_completed' : a.stage,
            disc_submissions: [{
              id: `disc-imp-${Date.now()}`,
              applicant_id: a.id,
              answers: imported.answers,
              completed_at: nowIso
            }]
          };
        });
      } else {
        const upsertRows = matchedPairs.map(({ row, app }) => ({
          applicant_id: app.id,
          answers: row.answers,
          completed_at: nowIso
        }));
        for (let i = 0; i < upsertRows.length; i += 100) {
          const batch = upsertRows.slice(i, i + 100);
          const { error } = await supabase.from('disc_submissions').upsert(batch, { onConflict: 'applicant_id' });
          if (error) throw error;
        }
        const promoteIds = matchedPairs
          .map(p => p.app)
          .filter(a => a.stage === 'application_submitted')
          .map(a => a.id);
        if (promoteIds.length) {
          await supabase.from('applicants')
            .update({ stage: 'disc_completed', updated_at: nowIso })
            .in('id', promoteIds);
        }
        invalidateDataCache();
        await fetchAndCacheFreshSnapshot();
      }

      const importedCount = matchedPairs.length;
      parsedDiscRows = [];
      discFile.value = '';
      discPreview.classList.add('hidden');
      say(`Imported ${importedCount} DISC assessment(s)${unmatched.length ? ` (${unmatched.length} unmatched NIK skipped)` : ''}.`);
    } catch (err) {
      discError.textContent = err.message || 'Failed to import DISC assessment results.';
    } finally {
      discSubmit.disabled = true;
      discSubmit.textContent = 'Import DISC Results';
    }
  });
}

/* ============================================================================
 * SYSTEM SETTINGS -> RECRUITMENT SETTINGS (/apply & /form Configuration)
 * ============================================================================ */
let recruitActiveTab = 'overview';
let recruitVacancies = normalizeVacancyList(DEFAULT_VACANCIES);
let recruitScoringConfig = normalizeRecruitmentScoringConfig(DEFAULT_RECRUITMENT_SCORING_CONFIG);
let recruitApplySchema = normalizeApplySchema(DEFAULT_APPLY_SCHEMA);
let recruitFormSchema = normalizeStage2Schema(DEFAULT_STAGE2_SCHEMA);
let recruitDraftApply = null;
let recruitDraftForm = null;
let recruitActiveFormSecTab = 'personal';
let recruitSourceFilter = '';
let recruitSearchQuery = '';
let recruitEditingVacancyId = null;
let recruitDraftVacancy = null;
let recruitPickerCityFilter = 'All';
let recruitPickerSearch = '';
let recruitConfigLoaded = false;

const RECRUIT_Q_TYPE_LABELS = {
  dropdown: 'Dropdown (Choices + Score)',
  radio: 'Radio Choice (Single + Score)',
  checkbox: 'Checkbox (Multi-Select + Score)',
  text: 'Short Text',
  textarea: 'Long Text (Paragraph)',
  number: 'Number'
};
const RECRUIT_APPLY_TYPE_LABELS = {
  system_position: 'Position Dropdown (/apply)',
  system_source: 'Information Source Dropdown',
  system_location: 'City / Regency & District',
  tel: 'Phone / WhatsApp',
  dropdown: 'Dropdown (Select)',
  radio: 'Radio Buttons',
  checkbox: 'Multiple Checkboxes',
  text: 'Short Text',
  textarea: 'Long Text (Paragraph)',
  number: 'Number',
  date: 'Date'
};
const RECRUIT_FORM_TYPE_LABELS = {
  system_form_position: 'Position Dropdown (/form)',
  system_form_source: 'Information Source Dropdown',
  system_region_province: 'Region · Province (Candidate Mobile Lookup)',
  system_region_regency: 'Region · City / Regency (Candidate Mobile Lookup)',
  system_region_district: 'Region · District (Candidate Mobile Lookup)',
  system_region_village: 'Region · Village (Candidate Mobile Lookup)',
  system_domicile: 'Domicile Toggle & Address',
  system_siblings_repeater: 'Siblings List (Dynamic)',
  system_spouse_group: 'Spouse Group (When Married)',
  system_children_repeater: 'Children List (Dynamic)',
  system_education_repeater: 'Education Level & History',
  system_languages_repeater: 'Foreign Languages List (Dynamic)',
  system_work_repeater: 'Work Experience List (Dynamic)',
  currency: 'IDR Currency Amount',
  email: 'Email',
  tel: 'Phone / WhatsApp',
  dropdown: 'Dropdown (Select)',
  select: 'Dropdown (Select)',
  radio: 'Radio Choice',
  checkbox: 'Checkbox (Multi)',
  text: 'Short Text',
  textarea: 'Long Text (Paragraph)',
  number: 'Number',
  date: 'Date'
};
const RECRUIT_FORM_CHOICE_TYPES = new Set(['select', 'radio', 'checkbox']);
const RECRUIT_FORM_GROUP_SYSTEM_TYPES = new Set([
  'system_siblings_repeater',
  'system_spouse_group',
  'system_children_repeater',
  'system_languages_repeater',
  'system_work_repeater',
  'system_domicile'
]);
const RECRUIT_FORM_NO_PH_TYPES = new Set([
  'radio', 'checkbox', 'date', 'select',
  'system_form_position', 'system_form_source',
  'system_region_province', 'system_region_regency', 'system_region_district', 'system_region_village',
  'system_domicile', 'system_siblings_repeater', 'system_spouse_group',
  'system_children_repeater', 'system_education_repeater', 'system_languages_repeater', 'system_work_repeater'
]);
const RECRUIT_STEP_GROUP_TITLES = [
  { step: 0, title: 'Step 1 · Identity' },
  { step: 1, title: 'Step 2 · Family & Education' },
  { step: 2, title: 'Step 3 · Skills & Work History' },
  { step: 3, title: 'Step 4 · Additional Information' }
];
const RECRUIT_FORM_FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text (Paragraph)' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown (Select)' },
  { value: 'radio', label: 'Radio Choice' },
  { value: 'checkbox', label: 'Checkbox (Multi)' },
  { value: 'currency', label: 'IDR Currency' },
  { value: 'tel', label: 'Phone / WhatsApp' },
  { value: 'email', label: 'Email' }
];
const RECRUIT_APPLY_FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text (Paragraph)' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown (Select)' },
  { value: 'radio', label: 'Radio Choice' },
  { value: 'checkbox', label: 'Checkbox (Multi)' },
  { value: 'tel', label: 'Phone / WhatsApp' }
];

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function readDemoRecruitmentStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(DEMO_RECRUITMENT_SETTINGS_KEY) || 'null');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeDemoRecruitmentStore(patch) {
  const prev = readDemoRecruitmentStore();
  try {
    localStorage.setItem(DEMO_RECRUITMENT_SETTINGS_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch {}
}

function getRecruitApplySources() {
  const srcField = recruitApplySchema.fields.find(f => f.id === 'infoSource');
  return Array.isArray(srcField?.options) && srcField.options.length
    ? srcField.options
    : [...APPLY_INFO_SOURCES];
}

async function loadRecruitmentConfig(force = false) {
  if (recruitConfigLoaded && !force) return;
  if (isDemoMode || !supabase) {
    const stored = readDemoRecruitmentStore();
    recruitVacancies = normalizeVacancyList(Array.isArray(stored.job_vacancies_config) && stored.job_vacancies_config.length ? stored.job_vacancies_config : DEFAULT_VACANCIES);
    recruitScoringConfig = normalizeRecruitmentScoringConfig(stored.recruitment_scoring_config || DEFAULT_RECRUITMENT_SCORING_CONFIG);
    recruitApplySchema = normalizeApplySchema(stored.apply_form_schema || DEFAULT_APPLY_SCHEMA);
    const demoForm = stored.stage2_form_schema || (Array.isArray(stored.application_positions) && stored.application_positions.length
      ? { ...structuredClone(DEFAULT_STAGE2_SCHEMA), positions: stored.application_positions }
      : DEFAULT_STAGE2_SCHEMA);
    recruitFormSchema = normalizeStage2Schema(demoForm);
    recruitDraftApply = structuredClone(recruitApplySchema);
    recruitDraftForm = structuredClone(recruitFormSchema);
    recruitConfigLoaded = true;
    return;
  }

  const { data, error } = await supabase
    .from('portal_settings')
    .select('key,value')
    .in('key', ['job_vacancies_config', 'recruitment_scoring_config', 'apply_form_schema', 'stage2_form_schema', 'application_positions']);
  if (error) throw error;

  const settingsMap = Object.fromEntries((data || []).map(row => [row.key, row.value]));
  const sbVacancies = Array.isArray(settingsMap.job_vacancies_config) ? settingsMap.job_vacancies_config : [];
  recruitVacancies = normalizeVacancyList(sbVacancies.length ? sbVacancies : DEFAULT_VACANCIES);
  recruitScoringConfig = normalizeRecruitmentScoringConfig(settingsMap.recruitment_scoring_config || DEFAULT_RECRUITMENT_SCORING_CONFIG);
  recruitApplySchema = normalizeApplySchema(settingsMap.apply_form_schema || DEFAULT_APPLY_SCHEMA);

  const sbFormPositions = Array.isArray(settingsMap.application_positions)
    ? settingsMap.application_positions.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim())
    : [];
  let baseForm = settingsMap.stage2_form_schema || structuredClone(DEFAULT_STAGE2_SCHEMA);
  if (!settingsMap.stage2_form_schema && sbFormPositions.length) {
    baseForm = { ...baseForm, positions: sbFormPositions };
  }
  recruitFormSchema = normalizeStage2Schema(baseForm);
  recruitDraftApply = structuredClone(recruitApplySchema);
  recruitDraftForm = structuredClone(recruitFormSchema);
  recruitConfigLoaded = true;
}

async function persistRecruitScoringConfig(nextScoring) {
  const clean = normalizeRecruitmentScoringConfig(nextScoring);
  if (isDemoMode || !supabase) {
    writeDemoRecruitmentStore({ recruitment_scoring_config: clean });
  } else {
    const now = new Date().toISOString();
    const { error } = await supabase.from('portal_settings').upsert(
      [{ key: 'recruitment_scoring_config', value: clean, updated_at: now }],
      { onConflict: 'key' }
    );
    if (error) throw error;
  }
  recruitScoringConfig = clean;
  return clean;
}

async function persistRecruitVacancies(nextList) {
  const clean = normalizeVacancyList(nextList);
  if (!clean.length) throw new Error('At least one vacancy is required.');
  if (!extractActivePositionNames(clean).length) {
    throw new Error('At least one vacancy must stay Active for /apply.');
  }
  if (isDemoMode || !supabase) {
    writeDemoRecruitmentStore({ job_vacancies_config: clean });
  } else {
    const now = new Date().toISOString();
    const { error } = await supabase.from('portal_settings').upsert(
      [{ key: 'job_vacancies_config', value: clean, updated_at: now }],
      { onConflict: 'key' }
    );
    if (error) throw error;
  }
  recruitVacancies = clean;
}

async function persistRecruitApplySchema(nextSchema) {
  const clean = normalizeApplySchema(nextSchema);
  if (isDemoMode || !supabase) {
    writeDemoRecruitmentStore({ apply_form_schema: clean });
  } else {
    const now = new Date().toISOString();
    const { error } = await supabase.from('portal_settings').upsert(
      [{ key: 'apply_form_schema', value: clean, updated_at: now }],
      { onConflict: 'key' }
    );
    if (error) throw error;
  }
  recruitApplySchema = clean;
  recruitDraftApply = structuredClone(clean);
}

async function persistRecruitFormSchema(nextSchema) {
  const clean = normalizeStage2Schema(nextSchema);
  if (!clean.positions.length) throw new Error('At least one /form position option is required.');
  if (!clean.infoSources.length) throw new Error('At least one /form information source is required.');

  if (isDemoMode || !supabase) {
    writeDemoRecruitmentStore({
      application_positions: clean.positions,
      stage2_form_schema: clean
    });
  } else {
    const now = new Date().toISOString();
    const { error } = await supabase.from('portal_settings').upsert(
      [
        { key: 'application_positions', value: clean.positions, updated_at: now },
        { key: 'stage2_form_schema', value: clean, updated_at: now }
      ],
      { onConflict: 'key' }
    );
    if (error) throw error;
  }
  recruitFormSchema = clean;
  recruitDraftForm = structuredClone(clean);
  stage2PositionsCache = [...clean.positions];
}

async function renderRecruitmentSettings(force = false) {
  await loadRecruitmentConfig(force);
  const tabs = [
    { id: 'overview', label: 'Overview & Share Links' },
    { id: 'apply-fields', label: '/apply Fields & Order' },
    { id: 'apply-scoring', label: '/apply Vacancies & Scoring' },
    { id: 'form-fields', label: '/form Fields & Sections' }
  ];

  content.innerHTML = `
    <div class="recruit-settings-tabs" role="tablist" aria-label="Recruitment Settings Sections">
      ${tabs.map(t => `<button type="button" class="recruit-tab-btn ${recruitActiveTab === t.id ? 'is-active' : ''}" data-recruit-tab="${esc(t.id)}" role="tab" aria-selected="${recruitActiveTab === t.id}">${esc(t.label)}</button>`).join('')}
    </div>
    <div id="recruit-tab-host"></div>
  `;

  $$('[data-recruit-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      recruitActiveTab = btn.dataset.recruitTab || 'overview';
      $$('[data-recruit-tab]').forEach(t => {
        const active = t.dataset.recruitTab === recruitActiveTab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
      });
      renderRecruitTabBody();
    });
  });

  renderRecruitTabBody();
}

function renderRecruitTabBody() {
  const host = $('#recruit-tab-host');
  if (!host) return;
  if (recruitActiveTab === 'apply-fields') renderRecruitApplyFieldsTab(host);
  else if (recruitActiveTab === 'apply-scoring') renderRecruitVacanciesTab(host);
  else if (recruitActiveTab === 'form-fields') renderRecruitFormFieldsTab(host);
  else renderRecruitOverviewTab(host);
}

function renderRecruitOverviewTab(host) {
  const activeVacancies = recruitVacancies.filter(v => v.active !== false);
  const applyVisibleCount = recruitApplySchema.fields.filter(f => f.enabled !== false).length;
  const applyCustomCount = recruitApplySchema.fields.filter(f => !f.system).length;
  const formPosCount = recruitFormSchema.positions.length;
  const formSourceCount = recruitFormSchema.infoSources.length;

  let formFieldCount = 0;
  let enabledSectionCount = 0;
  for (const meta of STAGE2_SECTION_META) {
    const sec = recruitFormSchema.sections?.[meta.id];
    const isEnabled = MANDATORY_STAGE2_SECTIONS.has(meta.id) || sec?.enabled !== false;
    if (!isEnabled) continue;
    enabledSectionCount += 1;
    formFieldCount += (sec?.fields || []).filter(f => f.enabled !== false).length;
  }

  const applyBaseUrl = new URL('apply/', location.href).href;
  const formBaseUrl = new URL('form/', location.href).href;
  const sources = getRecruitApplySources();
  const formSources = recruitFormSchema.infoSources.length ? recruitFormSchema.infoSources : [...FORM_INFO_SOURCES];
  const formShareUrl = buildShareUrl(formBaseUrl, '', recruitSourceFilter && formSources.includes(recruitSourceFilter) ? recruitSourceFilter : '');

  const shareRows = activeVacancies.length
    ? activeVacancies.map(v => {
        const shareUrl = buildShareUrl(applyBaseUrl, v.name, recruitSourceFilter);
        return `
          <div class="funnel-share-row">
            <div>
              <div class="funnel-share-title">${esc(v.name)}</div>
              <div class="funnel-share-meta">${v.primaryDistricts.length} primary districts (${v.primaryLocationScore} pts) · ${v.questions.length} question(s)</div>
            </div>
            <div class="funnel-share-url">${esc(shareUrl)}</div>
            <div class="funnel-share-btns">
              <button type="button" class="btn btn-secondary btn-xs" data-dash-copy="${esc(shareUrl)}">Copy</button>
              <a class="btn btn-primary btn-xs" href="${esc(shareUrl)}" target="_blank" rel="noopener noreferrer">Open</a>
            </div>
          </div>
        `;
      }).join('')
    : '<div class="funnel-share-row"><span class="loc-empty">No active /apply vacancies configured yet.</span></div>';

  host.innerHTML = `
    <div class="vacancy-toolbar">
      <div class="vacancy-toolbar-meta">
        <h2>Recruitment Portal Overview</h2>
        <span class="vacancy-count">Synced to /apply and /form candidate portals</span>
      </div>
      <div class="vacancy-toolbar-actions">
        <button type="button" class="btn btn-secondary" id="recruit-goto-scoring">Manage Vacancies &amp; Scoring</button>
        <button type="button" class="btn btn-primary" id="recruit-goto-form">Configure /form Sections</button>
      </div>
    </div>

    <section class="funnel-kpi-grid" aria-label="Portal Configuration Summary">
      <div class="funnel-kpi-card">
        <span class="funnel-kpi-label">Active Vacancies (/apply)</span>
        <b class="funnel-kpi-value">${activeVacancies.length}</b>
        <span class="funnel-kpi-meta">${recruitVacancies.length} total configured</span>
      </div>
      <div class="funnel-kpi-card">
        <span class="funnel-kpi-label">Visible Fields (/apply)</span>
        <b class="funnel-kpi-value">${applyVisibleCount}</b>
        <span class="funnel-kpi-meta">${applyCustomCount} custom field(s)</span>
      </div>
      <div class="funnel-kpi-card">
        <span class="funnel-kpi-label">Positions (/form)</span>
        <b class="funnel-kpi-value">${formPosCount}</b>
        <span class="funnel-kpi-meta">${formSourceCount} info source(s)</span>
      </div>
      <div class="funnel-kpi-card">
        <span class="funnel-kpi-label">Visible Fields (/form)</span>
        <b class="funnel-kpi-value">${formFieldCount}</b>
        <span class="funnel-kpi-meta">${enabledSectionCount} of ${STAGE2_SECTION_META.length} active sections</span>
      </div>
    </section>

    <section class="funnel-dash-section">
      <div class="funnel-dash-head">
        <h3>Shareable Candidate Portal Links (/apply &amp; /form)</h3>
        <div class="funnel-dash-head-actions">
          <select id="dash-source-filter" class="select" aria-label="Filter Share Link Source">
            <option value="">All Sources (No Tag)</option>
            ${sources.map(src => `<option value="${esc(src)}" ${recruitSourceFilter === src ? 'selected' : ''}>Source: ${esc(src)}</option>`).join('')}
          </select>
          <button type="button" class="btn btn-secondary btn-xs" id="dash-copy-form-link">Copy /form Link</button>
          <a class="btn btn-secondary btn-xs" href="${esc(formShareUrl)}" target="_blank" rel="noopener noreferrer">Open /form</a>
        </div>
      </div>
      <div class="funnel-share-list">${shareRows}</div>
    </section>
  `;

  $('#recruit-goto-scoring', host)?.addEventListener('click', () => {
    recruitActiveTab = 'apply-scoring';
    renderRecruitmentSettings(false);
  });
  $('#recruit-goto-form', host)?.addEventListener('click', () => {
    recruitActiveTab = 'form-fields';
    renderRecruitmentSettings(false);
  });
  $('#dash-source-filter', host)?.addEventListener('change', event => {
    recruitSourceFilter = event.target.value;
    renderRecruitOverviewTab(host);
  });
  $('#dash-copy-form-link', host)?.addEventListener('click', async () => {
    try {
      await copyToClipboard(formShareUrl);
      say('/form link copied to clipboard.');
    } catch {
      say('Failed to copy link.');
    }
  });
  $$('[data-dash-copy]', host).forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await copyToClipboard(btn.dataset.dashCopy || '');
        say('Vacancy share link copied.');
      } catch {
        say('Failed to copy link.');
      }
    });
  });
}

function syncRecruitApplyDraftFromDom(host) {
  if (!recruitDraftApply) return;
  $$('.schema-field-card[data-apply-idx]', host).forEach(card => {
    const idx = Number(card.dataset.applyIdx);
    const field = recruitDraftApply.fields[idx];
    if (!field) return;

    const labelEl = card.querySelector('[data-apply-prop="label"]');
    if (labelEl) field.label = labelEl.value.trim() || field.label;

    const phEl = card.querySelector('[data-apply-prop="placeholder"]');
    if (phEl) field.placeholder = phEl.value.trim();

    if (!field.system) {
      const typeEl = card.querySelector('[data-apply-prop="type"]');
      if (typeEl && APPLY_CUSTOM_FIELD_TYPES.some(t => t.value === typeEl.value)) {
        field.type = typeEl.value;
      }
    }

    const reqEl = card.querySelector('[data-apply-prop="required"]');
    const enEl = card.querySelector('[data-apply-prop="enabled"]');
    if (MANDATORY_APPLY_IDS.has(field.id)) {
      field.enabled = true;
      field.required = true;
    } else {
      if (enEl) field.enabled = enEl.checked;
      if (reqEl) field.required = field.enabled ? reqEl.checked : false;
    }

    const optInputs = card.querySelectorAll('.schema-option-input');
    if (optInputs.length || field.type === 'system_source' || ['dropdown', 'radio', 'checkbox'].includes(field.type)) {
      field.options = [...optInputs].map(el => el.value.trim()).filter(Boolean);
    }
  });
}

function renderRecruitApplyFieldsTab(host) {
  if (!recruitDraftApply) recruitDraftApply = structuredClone(recruitApplySchema);
  const list = recruitDraftApply.fields;

  const cardsHtml = list.map((field, idx) => {
    const mandatory = MANDATORY_APPLY_IDS.has(field.id);
    const hasOptions = field.type === 'system_source' || ['dropdown', 'radio', 'checkbox'].includes(field.type);
    const typeControl = field.system
      ? `<input class="input" value="${esc(RECRUIT_APPLY_TYPE_LABELS[field.type] || field.type)}" disabled>`
      : `<select class="select" data-apply-prop="type">
          ${RECRUIT_APPLY_FIELD_TYPE_OPTIONS.map(t => `<option value="${esc(t.value)}" ${field.type === t.value ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
        </select>`;
    const showPlaceholder = field.type !== 'system_location' && field.type !== 'checkbox' && field.type !== 'radio';

    return `
      <div class="schema-field-card" data-apply-idx="${idx}">
        <div class="schema-field-top">
          <div class="schema-field-ident">
            <span class="schema-order-num">#${idx + 1}</span>
            <span class="schema-field-badge ${field.system ? '' : 'custom'}">${field.system ? 'System' : 'Custom'}</span>
            ${mandatory ? '<span class="schema-field-lock">Core Required</span>' : ''}
          </div>
          <div class="schema-row-btns">
            <button type="button" class="icon-btn" data-apply-move="-1" ${idx === 0 ? 'disabled' : ''} title="Move Up">↑</button>
            <button type="button" class="icon-btn" data-apply-move="1" ${idx === list.length - 1 ? 'disabled' : ''} title="Move Down">↓</button>
            ${field.system ? '' : '<button type="button" class="icon-btn danger-action" data-apply-del>Delete</button>'}
          </div>
        </div>

        <div class="schema-field-grid ${showPlaceholder ? '' : 'schema-field-grid-3'}">
          <div class="v-field">
            <label>Field Label</label>
            <input class="input" data-apply-prop="label" value="${esc(field.label)}">
          </div>
          ${showPlaceholder ? `
            <div class="v-field">
              <label>Placeholder</label>
              <input class="input" data-apply-prop="placeholder" value="${esc(field.placeholder || '')}">
            </div>
          ` : ''}
          <div class="v-field">
            <label>Input Type</label>
            ${typeControl}
          </div>
          <div class="schema-check-group">
            <label><input type="checkbox" data-apply-prop="required" ${field.required !== false ? 'checked' : ''} ${mandatory ? 'disabled' : ''}> Required</label>
            <label><input type="checkbox" data-apply-prop="enabled" ${field.enabled !== false ? 'checked' : ''} ${mandatory ? 'disabled' : ''}> Visible</label>
          </div>
        </div>

        ${hasOptions ? `
          <div class="schema-options-wrap">
            <span class="schema-options-label">Choice Options (${esc(field.label)})</span>
            <div class="schema-option-chips">
              ${(field.options || []).map((opt, optIdx) => `
                <div class="schema-option-item">
                  <input class="input schema-option-input" value="${esc(opt)}" placeholder="Option label">
                  <button type="button" class="q-option-del" data-apply-del-opt="${optIdx}" aria-label="Remove option">&times;</button>
                </div>
              `).join('')}
            </div>
            <div class="schema-add-bar" style="margin-bottom:0">
              <input class="input" data-apply-new-opt placeholder="Add new option...">
              <button type="button" class="btn btn-secondary btn-xs" data-apply-add-opt>+ Add</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  host.innerHTML = `
    <div class="vacancy-toolbar">
      <div class="vacancy-toolbar-meta">
        <h2>/apply Step 1 Field Order &amp; Schema</h2>
        <span class="vacancy-count">${list.filter(f => f.enabled !== false).length} visible · ${list.length} total</span>
      </div>
      <div class="vacancy-toolbar-actions">
        <button type="button" class="btn btn-secondary" id="apply-reset-btn">Reset Default</button>
        <button type="button" class="btn btn-primary" id="apply-save-btn">Save Changes</button>
      </div>
    </div>

    <div class="schema-panel">
      <div class="schema-field-list">${cardsHtml}</div>
    </div>

    <div class="schema-panel">
      <div class="schema-panel-head">
        <h3>Add Custom Field to Step 1 (/apply)</h3>
      </div>
      <div class="schema-add-bar" style="margin-bottom:0">
        <input id="apply-new-label" class="input" placeholder="Example: Age / Previous factory employer?">
        <select id="apply-new-type" class="select" style="max-width:220px">
          ${RECRUIT_APPLY_FIELD_TYPE_OPTIONS.map(t => `<option value="${esc(t.value)}">${esc(t.label)}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-secondary" id="apply-add-custom">+ Add Field</button>
      </div>
    </div>
  `;

  $$('[data-apply-prop="required"]', host).forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        const card = cb.closest('[data-apply-idx]');
        const enCb = card?.querySelector('[data-apply-prop="enabled"]');
        if (enCb && !enCb.checked) enCb.checked = true;
      }
    });
  });

  $$('[data-apply-prop="enabled"]', host).forEach(cb => {
    cb.addEventListener('change', () => {
      if (!cb.checked) {
        const card = cb.closest('[data-apply-idx]');
        const reqCb = card?.querySelector('[data-apply-prop="required"]');
        if (reqCb) reqCb.checked = false;
      }
    });
  });

  $$('[data-apply-move]', host).forEach(btn => {
    btn.addEventListener('click', () => {
      syncRecruitApplyDraftFromDom(host);
      const idx = Number(btn.closest('[data-apply-idx]').dataset.applyIdx);
      const target = idx + Number(btn.dataset.applyMove);
      if (target < 0 || target >= recruitDraftApply.fields.length) return;
      [recruitDraftApply.fields[idx], recruitDraftApply.fields[target]] = [recruitDraftApply.fields[target], recruitDraftApply.fields[idx]];
      renderRecruitApplyFieldsTab(host);
    });
  });

  $$('[data-apply-del]', host).forEach(btn => {
    btn.addEventListener('click', () => {
      syncRecruitApplyDraftFromDom(host);
      const idx = Number(btn.closest('[data-apply-idx]').dataset.applyIdx);
      recruitDraftApply.fields.splice(idx, 1);
      renderRecruitApplyFieldsTab(host);
    });
  });

  $$('.schema-field-card[data-apply-idx] [data-apply-prop="type"]', host).forEach(sel => {
    sel.addEventListener('change', () => {
      syncRecruitApplyDraftFromDom(host);
      const idx = Number(sel.closest('[data-apply-idx]').dataset.applyIdx);
      const field = recruitDraftApply.fields[idx];
      if (field && ['dropdown', 'radio', 'checkbox'].includes(field.type) && !field.options?.length) {
        field.options = ['Option 1', 'Option 2'];
      }
      renderRecruitApplyFieldsTab(host);
    });
  });

  $$('[data-apply-add-opt]', host).forEach(btn => {
    btn.addEventListener('click', () => {
      syncRecruitApplyDraftFromDom(host);
      const card = btn.closest('[data-apply-idx]');
      const idx = Number(card.dataset.applyIdx);
      const input = card.querySelector('[data-apply-new-opt]');
      const val = input.value.trim();
      if (!val) return;
      if (!recruitDraftApply.fields[idx].options.includes(val)) {
        recruitDraftApply.fields[idx].options.push(val);
      }
      renderRecruitApplyFieldsTab(host);
    });
  });

  $$('[data-apply-new-opt]', host).forEach(input => {
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      input.closest('.schema-add-bar')?.querySelector('[data-apply-add-opt]')?.click();
    });
  });

  $$('[data-apply-del-opt]', host).forEach(btn => {
    btn.addEventListener('click', () => {
      syncRecruitApplyDraftFromDom(host);
      const idx = Number(btn.closest('[data-apply-idx]').dataset.applyIdx);
      const optIdx = Number(btn.dataset.applyDelOpt);
      recruitDraftApply.fields[idx].options.splice(optIdx, 1);
      renderRecruitApplyFieldsTab(host);
    });
  });

  $('#apply-add-custom', host).addEventListener('click', () => {
    syncRecruitApplyDraftFromDom(host);
    const labelInput = $('#apply-new-label', host);
    const typeSelect = $('#apply-new-type', host);
    const label = labelInput.value.trim();
    if (!label) {
      say('Enter a field label first.');
      labelInput.focus();
      return;
    }
    const type = typeSelect.value;
    recruitDraftApply.fields.push({
      id: `custom_${Date.now().toString(36)}`,
      label,
      type,
      required: false,
      enabled: true,
      system: false,
      placeholder: '',
      options: ['dropdown', 'radio', 'checkbox'].includes(type) ? ['Option 1', 'Option 2'] : []
    });
    renderRecruitApplyFieldsTab(host);
  });

  $('#apply-new-label', host).addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    $('#apply-add-custom', host).click();
  });

  $('#apply-reset-btn', host).addEventListener('click', () => {
    recruitDraftApply = normalizeApplySchema(DEFAULT_APPLY_SCHEMA);
    renderRecruitApplyFieldsTab(host);
    say('Reset /apply draft to defaults (unsaved).');
  });

  $('#apply-save-btn', host).addEventListener('click', async () => {
    syncRecruitApplyDraftFromDom(host);
    const btn = $('#apply-save-btn', host);
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await persistRecruitApplySchema(recruitDraftApply);
      renderRecruitApplyFieldsTab(host);
      say('/apply field configuration saved.');
    } catch (error) {
      say(error.message || 'Failed to save /apply field configuration.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  });
}

function renderRecruitQuestionSummary(questions = []) {
  if (!questions.length) {
    return '<span class="loc-empty">No position-specific questions</span>';
  }
  return `<ul class="q-summary-list">${questions.map((q, idx) => {
    const typeLabel = RECRUIT_Q_TYPE_LABELS[q.type] || q.type;
    let scoreText = '';
    if (['dropdown', 'radio', 'checkbox'].includes(q.type)) {
      const opts = (q.options || []).map(o => `${esc(o.label)} (${o.score})`).join(' · ');
      scoreText = opts || 'No options configured';
    } else {
      scoreText = q.filledScore ? `Filled score: ${q.filledScore} pts` : 'Unscored text response';
    }
    return `
      <li class="q-summary-item">
        <div class="q-summary-head">
          <b>${idx + 1}. ${esc(q.label)}</b>
          <span class="q-summary-type">${esc(typeLabel)}</span>
        </div>
        <div class="q-summary-scores">${scoreText}</div>
      </li>
    `;
  }).join('')}</ul>`;
}

function renderRecruitDistrictSummary(list = []) {
  if (!list.length) return '<span class="loc-empty">None specified</span>';
  return `<div class="loc-district-list">${list.map(d => esc(d)).join(', ')}</div>`;
}

function renderRecruitVacanciesTab(host) {
  const activeCount = recruitVacancies.filter(v => v.active !== false).length;
  const gModeLabel = recruitScoringConfig.scoringMode === 'points' ? 'pts' : '%';

  const buildVacancyRowsHtml = () => {
    const term = recruitSearchQuery.trim().toLowerCase();
    const filtered = term
      ? recruitVacancies.filter(v =>
          v.name.toLowerCase().includes(term) ||
          v.primaryDistricts.some(d => d.toLowerCase().includes(term)) ||
          v.questions.some(q => q.label.toLowerCase().includes(term))
        )
      : recruitVacancies;
    return filtered.length
      ? filtered.map(v => {
          const maxScore = calculateVacancyMaxScore(v);
          const effMode = v.minScoreMode !== 'inherit' ? (v.minScoreMode === 'points' ? 'pts' : '%') : gModeLabel;
          const effMin = v.minScore !== null && v.minScore !== undefined ? v.minScore : recruitScoringConfig.defaultMinScore;
          return `
          <tr data-vacancy-id="${esc(v.id)}">
            <td class="col-pos">
              <div class="pos-name-title">${esc(v.name)}</div>
              <div class="pos-state-line ${v.active === false ? 'inactive' : ''}">${v.active === false ? 'Inactive' : 'Active on /apply'} · Max ${esc(maxScore)} pts · Min ${esc(effMin)}${effMode}</div>
            </td>
            <td class="col-loc">${renderRecruitDistrictSummary(v.primaryDistricts)}</td>
            <td class="col-score">${esc(v.primaryLocationScore)}</td>
            <td class="col-other">${esc(v.otherLocationLabel)}</td>
            <td class="col-score">${esc(v.otherLocationScore)}</td>
            <td class="col-questions">${renderRecruitQuestionSummary(v.questions)}</td>
            <td class="col-actions">
              <div class="vacancy-row-actions">
                <button type="button" class="icon-btn primary-action" data-vac-action="edit" data-id="${esc(v.id)}">Edit</button>
                <button type="button" class="icon-btn" data-vac-action="share" data-id="${esc(v.id)}">Share</button>
                <button type="button" class="icon-btn" data-vac-action="duplicate" data-id="${esc(v.id)}">Duplicate</button>
                <button type="button" class="icon-btn danger" data-vac-action="delete" data-id="${esc(v.id)}">Delete</button>
              </div>
            </td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="7" class="table-empty">No vacancies match your search.</td></tr>';
  };

  host.innerHTML = `
    <div class="card ops-card" style="margin-bottom:16px">
      <div class="ops-head">
        <div>
          <h3>Global Qualification Threshold &amp; WhatsApp Gate (/apply)</h3>
          <p class="ops-sub">Jika kandidat memenuhi skor minimal, tombol Konfirmasi WhatsApp akan tampil. Jika di bawah skor minimal, lamaran tetap tersimpan di database tanpa tombol WA.</p>
        </div>
        <button type="button" class="btn btn-primary" id="recruit-save-scoring">Save Threshold Rules</button>
      </div>
      <div class="ops-form-grid">
        <label class="ops-field">
          <span>Default Minimum Score</span>
          <input id="recruit-def-min" type="number" step="0.5" min="0" class="input" value="${esc(recruitScoringConfig.defaultMinScore)}">
        </label>
        <label class="ops-field">
          <span>Scoring Basis</span>
          <select id="recruit-def-mode" class="input">
            <option value="percentage" ${recruitScoringConfig.scoringMode === 'percentage' ? 'selected' : ''}>Percentage (% of Max Score)</option>
            <option value="points" ${recruitScoringConfig.scoringMode === 'points' ? 'selected' : ''}>Raw Points</option>
          </select>
        </label>
        <label class="ops-check">
          <input id="recruit-req-wa" type="checkbox" ${recruitScoringConfig.requireQualificationForWa ? 'checked' : ''}>
          <span>Hide WhatsApp CTA if below minimum score</span>
        </label>
        <label class="ops-field" style="grid-column:1 / -1">
          <span>Non-Qualified Confirmation Message (/apply)</span>
          <input id="recruit-nonqual-msg" type="text" class="input" value="${esc(recruitScoringConfig.nonQualifiedMessage)}">
        </label>
      </div>
    </div>

    <div class="vacancy-toolbar">
      <div class="vacancy-toolbar-meta">
        <h2>/apply Vacancies &amp; Scoring Rules</h2>
        <span class="vacancy-count">${recruitVacancies.length} position(s) · ${activeCount} active · Global min threshold ≥ ${esc(recruitScoringConfig.defaultMinScore)} ${gModeLabel}</span>
      </div>
      <div class="vacancy-toolbar-actions">
        <input id="vacancy-search" class="vacancy-search" type="search" value="${esc(recruitSearchQuery)}" placeholder="Search position, district, question…">
        <button id="add-vacancy-btn" class="btn btn-primary" type="button">+ Add Vacancy</button>
      </div>
    </div>

    <section class="panel table-panel">
      <div class="table-wrap">
        <table class="data-table vacancy-table">
          <thead>
            <tr>
              <th>POSITION</th>
              <th>PRIMARY DISTRICTS</th>
              <th>SCORE</th>
              <th>OTHER LOCATION</th>
              <th>SCORE</th>
              <th>QUESTIONS &amp; WEIGHTS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody id="vacancy-tbody"></tbody>
        </table>
      </div>
    </section>
  `;

  const paintVacancyTable = () => {
    const tbody = $('#vacancy-tbody', host);
    if (tbody) tbody.innerHTML = buildVacancyRowsHtml();
    $$('[data-vac-action]', host).forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const action = btn.dataset.vacAction;
        if (action === 'edit') openRecruitVacancyModal(id, host);
        else if (action === 'duplicate') duplicateRecruitVacancy(id, host);
        else if (action === 'delete') deleteRecruitVacancy(id, host);
        else if (action === 'share') openRecruitShareModal(id);
      });
    });
  };

  paintVacancyTable();

  $('#recruit-save-scoring', host).addEventListener('click', async () => {
    try {
      await persistRecruitScoringConfig({
        defaultMinScore: $('#recruit-def-min', host).value,
        scoringMode: $('#recruit-def-mode', host).value,
        requireQualificationForWa: $('#recruit-req-wa', host).checked,
        nonQualifiedMessage: $('#recruit-nonqual-msg', host).value
      });
      renderRecruitVacanciesTab(host);
      say(`Threshold updated: min ${recruitScoringConfig.defaultMinScore}${recruitScoringConfig.scoringMode === 'points' ? ' pts' : '%'}.`);
    } catch (err) {
      say(err.message || 'Failed to save scoring configuration.');
    }
  });

  const onVacancySearch = debounce(event => {
    recruitSearchQuery = event.target.value;
    paintVacancyTable();
  }, 140);
  $('#vacancy-search', host).addEventListener('input', onVacancySearch);

  $('#add-vacancy-btn', host).addEventListener('click', () => openRecruitVacancyModal(null, host));
}

async function duplicateRecruitVacancy(id, host) {
  const source = recruitVacancies.find(v => v.id === id);
  if (!source) return;
  let copyName = `${source.name} (Copy)`;
  let suffix = 2;
  while (recruitVacancies.some(v => v.name.toLowerCase() === copyName.toLowerCase())) {
    copyName = `${source.name} (Copy ${suffix++})`;
  }
  const copy = normalizeVacancy({
    ...structuredClone(source),
    id: '',
    name: copyName
  }, recruitVacancies.length);

  try {
    await persistRecruitVacancies([...recruitVacancies, copy]);
    renderRecruitVacanciesTab(host);
    say(`Vacancy "${copy.name}" created.`);
  } catch (error) {
    say(error.message || 'Failed to duplicate vacancy.');
  }
}

async function deleteRecruitVacancy(id, host) {
  const target = recruitVacancies.find(v => v.id === id);
  if (!target) return;
  if (recruitVacancies.length <= 1) {
    say('At least one vacancy must remain configured.');
    return;
  }
  const remaining = recruitVacancies.filter(v => v.id !== id);
  if (!extractActivePositionNames(remaining).length) {
    say('Cannot delete the only Active vacancy.');
    return;
  }
  const ok = await openConfirmDialog({
    title: 'Delete Vacancy',
    message: `Remove "${target.name}" from /apply vacancy list and scoring rules?`,
    confirmLabel: 'Delete',
    danger: true
  });
  if (!ok) return;
  try {
    await persistRecruitVacancies(remaining);
    renderRecruitVacanciesTab(host);
    say(`Vacancy "${target.name}" deleted.`);
  } catch (error) {
    say(error.message || 'Failed to delete vacancy.');
  }
}

function getRecruitCatalogDistrictTokens() {
  const tokens = [];
  for (const [city, districts] of Object.entries(DISTRICTS_BY_CITY)) {
    for (const d of districts) {
      tokens.push({ city, district: d, token: normalizeDistrictToken(city, d) });
    }
  }
  return tokens;
}

function renderRecruitDistrictPicker(modal) {
  if (!modal || !recruitDraftVacancy) return;
  const listEl = $('#district-picker-list', modal);
  const search = recruitPickerSearch.trim().toLowerCase();

  const items = getRecruitCatalogDistrictTokens().filter(item => {
    if (recruitPickerCityFilter !== 'All' && item.city !== recruitPickerCityFilter) return false;
    if (search && !item.token.toLowerCase().includes(search)) return false;
    return true;
  });

  listEl.innerHTML = items.length
    ? items.map(item => {
        const checked = recruitDraftVacancy.primaryDistricts.includes(item.token);
        return `
          <label class="district-chip">
            <input type="checkbox" value="${esc(item.token)}" ${checked ? 'checked' : ''}>
            <span>${esc(item.token)}</span>
          </label>
        `;
      }).join('')
    : '<div class="loc-empty" style="grid-column:1/-1;padding:8px">No matching districts found.</div>';

  $$('input[type="checkbox"]', listEl).forEach(cb => {
    cb.addEventListener('change', () => {
      const token = cb.value;
      if (cb.checked) {
        if (!recruitDraftVacancy.primaryDistricts.includes(token)) {
          recruitDraftVacancy.primaryDistricts.push(token);
        }
      } else {
        recruitDraftVacancy.primaryDistricts = recruitDraftVacancy.primaryDistricts.filter(x => x !== token);
      }
      renderRecruitSelectedDistrictTags(modal);
    });
  });

  renderRecruitSelectedDistrictTags(modal);
}

function renderRecruitSelectedDistrictTags(modal) {
  if (!modal || !recruitDraftVacancy) return;
  const tagsEl = $('#district-selected-tags', modal);
  tagsEl.innerHTML = recruitDraftVacancy.primaryDistricts.map(token => `
    <span class="district-selected-tag">
      ${esc(token)}
      <button type="button" data-remove-district="${esc(token)}" aria-label="Remove ${esc(token)}">&times;</button>
    </span>
  `).join('');

  $$('[data-remove-district]', tagsEl).forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.removeDistrict;
      recruitDraftVacancy.primaryDistricts = recruitDraftVacancy.primaryDistricts.filter(x => x !== val);
      renderRecruitDistrictPicker(modal);
    });
  });
}

function syncRecruitQuestionsFromDom(modal) {
  if (!modal || !recruitDraftVacancy) return;
  const items = $$('.q-builder-item', modal);
  if (!items.length) return;

  recruitDraftVacancy.questions = items.map((itemEl, idx) => {
    const existing = recruitDraftVacancy.questions[idx] || {};
    const label = itemEl.querySelector('[data-q-prop="label"]')?.value || '';
    const type = itemEl.querySelector('[data-q-prop="type"]')?.value || 'text';
    const required = itemEl.querySelector('[data-q-prop="required"]')?.checked !== false;
    const placeholder = itemEl.querySelector('[data-q-prop="placeholder"]')?.value || '';
    const filledScore = Number(itemEl.querySelector('[data-q-prop="filledScore"]')?.value || 0);
    const hasOptions = ['dropdown', 'radio', 'checkbox'].includes(type);

    const options = hasOptions
      ? $$('.q-option-row', itemEl).map(row => ({
          label: row.querySelector('[data-opt-label]')?.value || '',
          score: Number(row.querySelector('[data-opt-score]')?.value || 0)
        }))
      : [];

    return {
      id: existing.id || `q_${idx + 1}`,
      label,
      type,
      required,
      placeholder,
      filledScore: Number.isFinite(filledScore) ? filledScore : 0,
      options
    };
  });
}

function renderRecruitQuestionBuilder(modal) {
  if (!modal || !recruitDraftVacancy) return;
  const bodyEl = $('.vacancy-modal-body', modal);
  const prevScrollTop = bodyEl ? bodyEl.scrollTop : 0;
  const host = $('#q-builder-list', modal);

  if (!recruitDraftVacancy.questions.length) {
    host.innerHTML = '<div class="loc-empty" style="padding:10px 0">No questions added. Click "+ Add Question" to add position-specific screening prompts.</div>';
    return;
  }

  host.innerHTML = recruitDraftVacancy.questions.map((q, idx) => {
    const hasOptions = ['dropdown', 'radio', 'checkbox'].includes(q.type);
    const optionRows = (q.options || []).map((opt, optIdx) => `
      <div class="q-option-row" data-opt-index="${optIdx}">
        <input class="input" data-opt-label value="${esc(opt.label)}" placeholder="Answer ${String.fromCharCode(65 + (optIdx % 26))}">
        <input class="input" data-opt-score type="number" step="0.5" value="${esc(opt.score)}" placeholder="Score">
        <button type="button" class="q-option-del" data-del-opt="${optIdx}" aria-label="Remove choice">&times;</button>
      </div>
    `).join('');

    return `
      <div class="q-builder-item" data-q-index="${idx}">
        <div class="q-builder-top">
          <span class="q-builder-index">Question ${idx + 1}</span>
          <div class="q-builder-controls">
            <button type="button" class="icon-btn" data-move-q="-1" ${idx === 0 ? 'disabled' : ''} title="Move Up">↑</button>
            <button type="button" class="icon-btn" data-move-q="1" ${idx === recruitDraftVacancy.questions.length - 1 ? 'disabled' : ''} title="Move Down">↓</button>
            <button type="button" class="icon-btn danger-action" data-del-q>Delete</button>
          </div>
        </div>

        <div class="q-builder-fields">
          <div class="v-field">
            <label>Question Prompt (Shown to Indonesian Candidate)</label>
            <input class="input" data-q-prop="label" value="${esc(q.label)}" placeholder="Example: Pernah nyepray apa?">
          </div>
          <div class="v-field">
            <label>Input Type</label>
            <select class="select" data-q-prop="type">
              ${QUESTION_TYPES.map(t => `<option value="${esc(t.value)}" ${q.type === t.value ? 'selected' : ''}>${esc(RECRUIT_Q_TYPE_LABELS[t.value] || t.label)}</option>`).join('')}
            </select>
          </div>
          <label class="v-check-inline">
            <input type="checkbox" data-q-prop="required" ${q.required !== false ? 'checked' : ''}>
            <span>Required</span>
          </label>
        </div>

        ${hasOptions ? `
          <div class="q-options-box">
            <div class="q-options-head"><span>Choice Label</span><span>Score</span><span></span></div>
            ${optionRows}
            <button type="button" class="btn btn-secondary btn-xs" data-add-opt style="margin-top:4px">+ Add Option</button>
          </div>
        ` : `
          <div class="q-nonoption-box">
            <div class="v-field">
              <label>Input Placeholder</label>
              <input class="input" data-q-prop="placeholder" value="${esc(q.placeholder || '')}" placeholder="Example: Factory name or task description">
            </div>
            <div class="v-field">
              <label>Score If Filled</label>
              <input class="input" data-q-prop="filledScore" type="number" step="0.5" value="${esc(q.filledScore ?? 0)}">
            </div>
          </div>
        `}
      </div>
    `;
  }).join('');

  $$('.q-builder-item', host).forEach((itemEl, idx) => {
    itemEl.querySelector('[data-q-prop="type"]').addEventListener('change', event => {
      syncRecruitQuestionsFromDom(modal);
      const nextType = event.target.value;
      const target = recruitDraftVacancy.questions[idx];
      target.type = nextType;
      if (['dropdown', 'radio', 'checkbox'].includes(nextType) && !target.options.length) {
        target.options = [
          { label: 'Option A', score: 10 },
          { label: 'Option B', score: 5 }
        ];
      }
      renderRecruitQuestionBuilder(modal);
    });

    itemEl.querySelector('[data-del-q]').addEventListener('click', () => {
      syncRecruitQuestionsFromDom(modal);
      recruitDraftVacancy.questions.splice(idx, 1);
      renderRecruitQuestionBuilder(modal);
    });

    itemEl.querySelectorAll('[data-move-q]').forEach(btn => {
      btn.addEventListener('click', () => {
        syncRecruitQuestionsFromDom(modal);
        const swapIdx = idx + Number(btn.dataset.moveQ);
        if (swapIdx < 0 || swapIdx >= recruitDraftVacancy.questions.length) return;
        [recruitDraftVacancy.questions[idx], recruitDraftVacancy.questions[swapIdx]] = [
          recruitDraftVacancy.questions[swapIdx],
          recruitDraftVacancy.questions[idx]
        ];
        renderRecruitQuestionBuilder(modal);
      });
    });

    itemEl.querySelector('[data-add-opt]')?.addEventListener('click', () => {
      syncRecruitQuestionsFromDom(modal);
      const target = recruitDraftVacancy.questions[idx];
      const nextLetter = String.fromCharCode(65 + ((target.options?.length || 0) % 26));
      target.options.push({ label: `Option ${nextLetter}`, score: 0 });
      renderRecruitQuestionBuilder(modal);
    });

    itemEl.querySelectorAll('[data-del-opt]').forEach(btn => {
      btn.addEventListener('click', () => {
        syncRecruitQuestionsFromDom(modal);
        recruitDraftVacancy.questions[idx].options.splice(Number(btn.dataset.delOpt), 1);
        renderRecruitQuestionBuilder(modal);
      });
    });
  });

  if (bodyEl) bodyEl.scrollTop = prevScrollTop;
}

function openRecruitVacancyModal(id, host) {
  let backdrop = $('#vacancy-modal');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'vacancy-modal';
    backdrop.className = 'modal-backdrop hidden';
    backdrop.innerHTML = `
      <div class="employee-modal-card vacancy-modal-card" role="dialog" aria-modal="true" aria-labelledby="v-modal-title">
        <div class="employee-modal-head">
          <div>
            <small id="v-modal-kicker">VACANCY &amp; SCORING (/apply)</small>
            <h2 id="v-modal-title">Edit Vacancy</h2>
          </div>
          <button type="button" class="modal-close" id="v-modal-close" aria-label="Close">&times;</button>
        </div>

        <form id="v-modal-form" class="vacancy-modal-form" novalidate>
          <div class="vacancy-modal-body">
            <div class="v-form-section">
              <div class="v-form-section-head"><h3>Position Information</h3></div>
              <div class="v-grid-eq">
                <div class="v-field">
                  <label for="v-name">Position Name</label>
                  <input id="v-name" class="input" required placeholder="Example: Spray, QC Staff, Warehouse Admin">
                </div>
                <div class="v-field">
                  <label>Visibility on /apply</label>
                  <label class="v-check-inline">
                    <input id="v-active" type="checkbox" checked>
                    <span>Active (Show in candidate vacancy dropdown)</span>
                  </label>
                </div>
                <div class="v-field">
                  <label for="v-min-score">Min Qualification Override (Blank = Global Default)</label>
                  <input id="v-min-score" class="input" type="number" step="0.5" min="0" placeholder="Inherit global">
                </div>
                <div class="v-field">
                  <label for="v-min-mode">Threshold Mode</label>
                  <select id="v-min-mode" class="select">
                    <option value="inherit">Inherit Global Setting</option>
                    <option value="percentage">Percentage (%)</option>
                    <option value="points">Raw Points</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="v-form-section">
              <div class="v-form-section-head"><h3>Primary Location Criteria &amp; Scoring</h3></div>
              <div class="v-grid-2" style="margin-bottom:14px">
                <div class="v-field">
                  <label>Primary Districts (Static Catalog Picker)</label>
                  <div class="district-picker-controls">
                    <select id="district-city-filter" class="select">
                      <option value="All">All Cities / Regencies</option>
                      ${Object.keys(DISTRICTS_BY_CITY).map(city => `<option value="${esc(city)}">${esc(city)}</option>`).join('')}
                    </select>
                    <input id="district-search" class="input" type="search" placeholder="Filter district…">
                    <button type="button" class="btn btn-secondary btn-xs" id="district-clear-all">Clear</button>
                  </div>
                  <div id="district-picker-list" class="district-picker-list"></div>
                  <div class="district-custom-row">
                    <input id="district-custom-input" class="input" placeholder="Add custom district / area…">
                    <button type="button" class="btn btn-secondary btn-xs" id="district-custom-add">Add</button>
                  </div>
                  <div id="district-selected-tags" class="district-selected-tags"></div>
                </div>
                <div class="v-field">
                  <label for="v-primary-score">Primary Location Score</label>
                  <input id="v-primary-score" class="input" type="number" step="0.5" value="10">
                </div>
              </div>

              <div class="v-grid-2">
                <div class="v-field">
                  <label for="v-other-label">Other Location Label</label>
                  <input id="v-other-label" class="input" value="Area selain lokasi utama">
                </div>
                <div class="v-field">
                  <label for="v-other-score">Other Location Score</label>
                  <input id="v-other-score" class="input" type="number" step="0.5" value="5">
                </div>
              </div>
            </div>

            <div class="v-form-section">
              <div class="v-form-section-head">
                <h3>Screening Questions &amp; Score Weights</h3>
                <button type="button" class="btn btn-secondary btn-xs" id="add-question-btn">+ Add Question</button>
              </div>
              <div id="q-builder-list" class="q-builder-list"></div>
            </div>
          </div>

          <div class="vacancy-modal-footer">
            <div id="v-modal-error" class="form-error" role="alert"></div>
            <div class="employee-modal-actions">
              <button type="button" class="btn btn-secondary" id="v-modal-cancel">Cancel</button>
              <button type="submit" class="btn btn-primary" id="v-modal-save">Save Vacancy</button>
            </div>
          </div>
        </form>
      </div>
    `;
    document.body.append(backdrop);

    const closeModal = () => {
      backdrop.classList.add('hidden');
      recruitEditingVacancyId = null;
      recruitDraftVacancy = null;
    };
    $('#v-modal-close', backdrop).addEventListener('click', closeModal);
    $('#v-modal-cancel', backdrop).addEventListener('click', closeModal);
    bindSafeModalClose(backdrop, closeModal);

    $('#district-city-filter', backdrop).addEventListener('change', event => {
      recruitPickerCityFilter = event.target.value;
      renderRecruitDistrictPicker(backdrop);
    });
    const onDistrictSearch = debounce(event => {
      recruitPickerSearch = event.target.value;
      renderRecruitDistrictPicker(backdrop);
    }, 140);
    $('#district-search', backdrop).addEventListener('input', onDistrictSearch);
    $('#district-clear-all', backdrop).addEventListener('click', () => {
      if (!recruitDraftVacancy) return;
      recruitDraftVacancy.primaryDistricts = [];
      renderRecruitDistrictPicker(backdrop);
    });
    $('#district-custom-add', backdrop).addEventListener('click', () => {
      const input = $('#district-custom-input', backdrop);
      const val = input.value.trim();
      if (!val || !recruitDraftVacancy) return;
      if (!recruitDraftVacancy.primaryDistricts.includes(val)) {
        recruitDraftVacancy.primaryDistricts.push(val);
      }
      input.value = '';
      renderRecruitDistrictPicker(backdrop);
    });
    $('#district-custom-input', backdrop).addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      $('#district-custom-add', backdrop).click();
    });
    $('#add-question-btn', backdrop).addEventListener('click', () => {
      syncRecruitQuestionsFromDom(backdrop);
      recruitDraftVacancy.questions.push({
        id: `q_${Date.now().toString(36)}`,
        label: '',
        type: 'dropdown',
        required: true,
        placeholder: '',
        filledScore: 0,
        options: [
          { label: 'Ya', score: 10 },
          { label: 'Tidak', score: 0 }
        ]
      });
      renderRecruitQuestionBuilder(backdrop);
      $('#q-builder-list', backdrop).lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  $('#v-modal-form', backdrop).onsubmit = async event => {
    event.preventDefault();
    const errorBox = $('#v-modal-error', backdrop);
    errorBox.textContent = '';

    syncRecruitQuestionsFromDom(backdrop);
    recruitDraftVacancy.name = $('#v-name', backdrop).value.trim();
    recruitDraftVacancy.active = $('#v-active', backdrop).checked;
    const minScoreStr = $('#v-min-score', backdrop).value.trim();
    recruitDraftVacancy.minScore = minScoreStr === '' ? null : Number(minScoreStr);
    recruitDraftVacancy.minScoreMode = $('#v-min-mode', backdrop).value || 'inherit';
    recruitDraftVacancy.primaryLocationScore = Number($('#v-primary-score', backdrop).value || 0);
    recruitDraftVacancy.otherLocationLabel = $('#v-other-label', backdrop).value.trim() || 'Area selain lokasi utama';
    recruitDraftVacancy.otherLocationScore = Number($('#v-other-score', backdrop).value || 0);

    if (!recruitDraftVacancy.name) {
      errorBox.textContent = 'Position name is required.';
      $('#v-name', backdrop).focus();
      return;
    }
    const dup = recruitVacancies.find(
      v => v.id !== recruitEditingVacancyId && v.name.toLowerCase() === recruitDraftVacancy.name.toLowerCase()
    );
    if (dup) {
      errorBox.textContent = `Position "${recruitDraftVacancy.name}" already exists.`;
      $('#v-name', backdrop).focus();
      return;
    }

    for (let i = 0; i < recruitDraftVacancy.questions.length; i++) {
      const q = recruitDraftVacancy.questions[i];
      if (!q.label.trim()) {
        errorBox.textContent = `Question #${i + 1} prompt cannot be empty.`;
        return;
      }
      if (['dropdown', 'radio', 'checkbox'].includes(q.type)) {
        q.options = (q.options || []).filter(opt => opt.label.trim());
        if (!q.options.length) {
          errorBox.textContent = `Question "${q.label}" requires at least 1 answer option.`;
          return;
        }
      }
    }

    const normalized = normalizeVacancy(recruitDraftVacancy, recruitVacancies.length);
    const nextList = recruitEditingVacancyId
      ? recruitVacancies.map(v => (v.id === recruitEditingVacancyId ? normalized : v))
      : [...recruitVacancies, normalized];

    const saveBtn = $('#v-modal-save', backdrop);
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await persistRecruitVacancies(nextList);
      backdrop.classList.add('hidden');
      recruitEditingVacancyId = null;
      recruitDraftVacancy = null;
      renderRecruitVacanciesTab(host);
      say(`Vacancy "${normalized.name}" saved.`);
    } catch (error) {
      errorBox.textContent = error.message || 'Failed to save vacancy.';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Vacancy';
    }
  };

  recruitEditingVacancyId = id;
  recruitPickerCityFilter = 'All';
  recruitPickerSearch = '';

  const source = id ? recruitVacancies.find(v => v.id === id) : null;
  recruitDraftVacancy = source
    ? structuredClone(source)
    : {
        id: '',
        name: '',
        active: true,
        primaryDistricts: ['Pasuruan - Purwosari', 'Pasuruan - Purwodadi', 'Pasuruan - Sukorejo', 'Pasuruan - Pandaan', 'Pasuruan - Prigen'],
        primaryLocationScore: 20,
        otherLocationLabel: 'Area selain lokasi utama',
        otherLocationScore: 10,
        questions: [
          {
            id: 'pengalaman',
            label: 'Berapa lama pengalaman?',
            type: 'dropdown',
            required: true,
            placeholder: '',
            filledScore: 0,
            options: [
              { label: 'Lebih dari 6 bulan', score: 60 },
              { label: 'Kurang dari 6 bulan', score: 20 }
            ]
          },
          {
            id: 'penjelasan',
            label: 'Jelaskan pengalaman kerja yang relevan',
            type: 'textarea',
            required: true,
            placeholder: 'Uraikan tugas, alat, atau keahlian yang dikuasai',
            filledScore: 20,
            options: []
          }
        ]
      };

  $('#v-modal-title', backdrop).textContent = source ? `Edit Vacancy: ${source.name}` : 'Add New Vacancy';
  $('#v-name', backdrop).value = recruitDraftVacancy.name;
  $('#v-active', backdrop).checked = recruitDraftVacancy.active !== false;
  $('#v-min-score', backdrop).value = recruitDraftVacancy.minScore ?? '';
  $('#v-min-mode', backdrop).value = recruitDraftVacancy.minScoreMode || 'inherit';
  $('#v-primary-score', backdrop).value = recruitDraftVacancy.primaryLocationScore ?? 20;
  $('#v-other-label', backdrop).value = recruitDraftVacancy.otherLocationLabel || 'Area selain lokasi utama';
  $('#v-other-score', backdrop).value = recruitDraftVacancy.otherLocationScore ?? 10;
  $('#district-city-filter', backdrop).value = 'All';
  $('#district-search', backdrop).value = '';
  $('#district-custom-input', backdrop).value = '';
  $('#v-modal-error', backdrop).textContent = '';

  renderRecruitDistrictPicker(backdrop);
  renderRecruitQuestionBuilder(backdrop);

  backdrop.classList.remove('hidden');
  $('.vacancy-modal-body', backdrop).scrollTop = 0;
  $('#v-name', backdrop).focus();
}

function openRecruitShareModal(id) {
  const vacancy = recruitVacancies.find(v => v.id === id);
  if (!vacancy) return;

  let backdrop = $('#share-modal');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'share-modal';
    backdrop.className = 'modal-backdrop hidden';
    backdrop.innerHTML = `
      <div class="employee-modal-card share-modal-card" role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
        <div class="employee-modal-head">
          <div>
            <small>SHARE VACANCY LINK (/apply)</small>
            <h2 id="share-modal-title">Vacancy Link</h2>
          </div>
          <button type="button" class="modal-close" id="share-modal-close" aria-label="Close">&times;</button>
        </div>

        <div class="v-field" style="margin-top:14px">
          <label for="share-source">Source Tag (Pre-selected for candidates)</label>
          <select id="share-source" class="select"></select>
        </div>

        <div class="v-field" style="margin-top:14px">
          <label>Shareable Portal URL</label>
          <div id="share-url-preview" class="share-preview-box"></div>
        </div>

        <div class="share-actions-row">
          <button type="button" class="btn btn-primary" id="share-copy-btn">Copy Link</button>
          <a id="share-open-btn" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">Open Portal</a>
        </div>
      </div>
    `;
    document.body.append(backdrop);
    const closeModal = () => backdrop.classList.add('hidden');
    $('#share-modal-close', backdrop).addEventListener('click', closeModal);
    bindSafeModalClose(backdrop, closeModal);
  }

  const baseApplyUrl = new URL('apply/', location.href).href;
  const sourceSelect = $('#share-source', backdrop);
  const sources = getRecruitApplySources();

  sourceSelect.innerHTML = [
    '<option value="">All Sources (No Tag)</option>',
    ...sources.map(src => `<option value="${esc(src)}">${esc(src)}</option>`)
  ].join('');
  sourceSelect.value = '';
  $('#share-modal-title', backdrop).textContent = `Share Vacancy: ${vacancy.name}`;

  const updateUrl = () => {
    const url = buildShareUrl(baseApplyUrl, vacancy.name, sourceSelect.value);
    $('#share-url-preview', backdrop).textContent = url;
    $('#share-open-btn', backdrop).href = url;
  };
  sourceSelect.onchange = updateUrl;
  updateUrl();

  $('#share-copy-btn', backdrop).onclick = async () => {
    try {
      await copyToClipboard($('#share-url-preview', backdrop).textContent);
      say('Vacancy share link copied.');
    } catch {
      say('Failed to copy link.');
    }
  };

  backdrop.classList.remove('hidden');
}

function syncRecruitFormDraftFromDom(host) {
  if (!recruitDraftForm) return;
  const posInputs = $$('.schema-pos-input[data-pos-list="positions"]', host);
  if (posInputs.length) {
    recruitDraftForm.positions = posInputs.map(el => el.value.trim()).filter(Boolean);
  }
  const srcInputs = $$('.schema-pos-input[data-pos-list="infoSources"]', host);
  if (srcInputs.length) {
    recruitDraftForm.infoSources = srcInputs.map(el => el.value.trim()).filter(Boolean);
  }
  const consentEl = $('#form-consent-text', host);
  if (consentEl) {
    recruitDraftForm.consentText = consentEl.value.trim() || DEFAULT_STAGE2_SCHEMA.consentText;
  }

  const secObj = recruitDraftForm.sections[recruitActiveFormSecTab];
  if (secObj) {
    const titleEl = $('#form-sec-title', host);
    if (titleEl) secObj.title = titleEl.value.trim() || secObj.title;
    const secEnabledEl = $('#form-sec-enabled', host);
    if (secEnabledEl) {
      secObj.enabled = MANDATORY_STAGE2_SECTIONS.has(recruitActiveFormSecTab) ? true : secEnabledEl.checked;
    }

    $$('.schema-field-card[data-f2-idx]', host).forEach(card => {
      const idx = Number(card.dataset.f2Idx);
      const field = secObj.fields[idx];
      if (!field) return;

      const labelEl = card.querySelector('[data-f2-prop="label"]');
      if (labelEl) field.label = labelEl.value.trim() || field.label;

      const phEl = card.querySelector('[data-f2-prop="placeholder"]');
      if (phEl) field.placeholder = phEl.value.trim();

      if (!field.system) {
        const typeEl = card.querySelector('[data-f2-prop="type"]');
        if (typeEl && FORM_CUSTOM_FIELD_TYPES.some(t => t.value === typeEl.value)) {
          field.type = typeEl.value;
        }
      }

      const reqEl = card.querySelector('[data-f2-prop="required"]');
      const enEl = card.querySelector('[data-f2-prop="enabled"]');
      const wideEl = card.querySelector('[data-f2-prop="wide"]');

      if (MANDATORY_STAGE2_FIELDS.has(field.name)) {
        field.enabled = true;
        field.required = true;
      } else {
        if (enEl) field.enabled = enEl.checked;
        if (reqEl) {
          field.required = (RECRUIT_FORM_GROUP_SYSTEM_TYPES.has(field.type) || !field.enabled) ? false : reqEl.checked;
        }
      }
      if (wideEl) field.wide = wideEl.checked;

      const optInputs = card.querySelectorAll('.schema-f2-option-input');
      if (optInputs.length || RECRUIT_FORM_CHOICE_TYPES.has(field.type)) {
        field.options = [...optInputs].map(el => el.value.trim()).filter(Boolean);
      }
    });
  }
}

function renderRecruitFormFieldsTab(host) {
  if (!recruitDraftForm) recruitDraftForm = structuredClone(recruitFormSchema);
  if (!STAGE2_SECTION_META.some(m => m.id === recruitActiveFormSecTab)) {
    recruitActiveFormSecTab = 'personal';
  }
  const activeMeta = STAGE2_SECTION_META.find(m => m.id === recruitActiveFormSecTab);
  const currentSec = recruitDraftForm.sections[recruitActiveFormSecTab] || { title: activeMeta.defaultTitle, enabled: true, fields: [] };
  const mandatorySec = MANDATORY_STAGE2_SECTIONS.has(recruitActiveFormSecTab);

  const positionsRows = recruitDraftForm.positions.map((pos, idx) => `
    <div class="schema-pos-row">
      <span class="schema-order-num">${idx + 1}</span>
      <input class="input schema-pos-input" data-pos-list="positions" value="${esc(pos)}" placeholder="Position name">
      <div class="schema-row-btns">
        <button type="button" class="icon-btn" data-pos-move="positions:${idx}:-1" ${idx === 0 ? 'disabled' : ''} title="Move Up">↑</button>
        <button type="button" class="icon-btn" data-pos-move="positions:${idx}:1" ${idx === recruitDraftForm.positions.length - 1 ? 'disabled' : ''} title="Move Down">↓</button>
        <button type="button" class="icon-btn danger-action" data-pos-del="positions:${idx}" ${recruitDraftForm.positions.length <= 1 ? 'disabled' : ''}>&times;</button>
      </div>
    </div>
  `).join('');

  const sourceRows = recruitDraftForm.infoSources.map((src, idx) => `
    <div class="schema-pos-row">
      <span class="schema-order-num">${idx + 1}</span>
      <input class="input schema-pos-input" data-pos-list="infoSources" value="${esc(src)}" placeholder="Information source">
      <div class="schema-row-btns">
        <button type="button" class="icon-btn" data-pos-move="infoSources:${idx}:-1" ${idx === 0 ? 'disabled' : ''} title="Move Up">↑</button>
        <button type="button" class="icon-btn" data-pos-move="infoSources:${idx}:1" ${idx === recruitDraftForm.infoSources.length - 1 ? 'disabled' : ''} title="Move Down">↓</button>
        <button type="button" class="icon-btn danger-action" data-pos-del="infoSources:${idx}" ${recruitDraftForm.infoSources.length <= 1 ? 'disabled' : ''}>&times;</button>
      </div>
    </div>
  `).join('');

  const stepOrderHtml = RECRUIT_STEP_GROUP_TITLES.map(({ step, title }) => {
    const order = recruitDraftForm.stepSectionOrder?.[step] || STEP_SECTION_DEFAULTS[step] || [];
    const items = order.map((secId, idx) => {
      const meta = STAGE2_SECTION_META.find(m => m.id === secId);
      const sec = recruitDraftForm.sections?.[secId];
      const secOn = MANDATORY_STAGE2_SECTIONS.has(secId) || sec?.enabled !== false;
      return `
        <div class="schema-pos-row">
          <span class="schema-order-num">${idx + 1}</span>
          <span class="schema-step-sec-label">
            <b>${esc(meta?.code || '')} · ${esc(sec?.title || meta?.defaultTitle || secId)}</b>
            ${secOn ? '' : '<span class="schema-sec-off-tag">Hidden</span>'}
          </span>
          <div class="schema-row-btns">
            <button type="button" class="icon-btn" data-step-move-sec="${step}:${idx}:-1" ${idx === 0 ? 'disabled' : ''} title="Move Up">↑</button>
            <button type="button" class="icon-btn" data-step-move-sec="${step}:${idx}:1" ${idx === order.length - 1 ? 'disabled' : ''} title="Move Down">↓</button>
          </div>
        </div>
      `;
    }).join('');
    return `
      <div class="schema-step-order-card">
        <div class="schema-step-order-title">${esc(title)}</div>
        <div class="schema-pos-list">${items}</div>
      </div>
    `;
  }).join('');

  const sectionTabsHtml = STAGE2_SECTION_META.map(meta => {
    const sec = recruitDraftForm.sections?.[meta.id];
    const secOn = MANDATORY_STAGE2_SECTIONS.has(meta.id) || sec?.enabled !== false;
    const isActive = recruitActiveFormSecTab === meta.id;
    return `
      <button type="button" class="schema-section-tab ${isActive ? 'active' : ''} ${secOn ? '' : 'is-off'}" data-f2-tab="${esc(meta.id)}">
        ${esc(meta.code)} · ${esc(sec?.title || meta.defaultTitle)}
      </button>
    `;
  }).join('');

  const fieldsHtml = currentSec.fields.map((field, idx) => {
    const mandatoryField = MANDATORY_STAGE2_FIELDS.has(field.name);
    const isGroupSystem = RECRUIT_FORM_GROUP_SYSTEM_TYPES.has(field.type);
    const hasOptions = RECRUIT_FORM_CHOICE_TYPES.has(field.type);
    const hidePlaceholder = RECRUIT_FORM_NO_PH_TYPES.has(field.type);
    const typeControl = field.system
      ? `<input class="input" value="${esc(RECRUIT_FORM_TYPE_LABELS[field.type] || field.type)}" disabled>`
      : `<select class="select" data-f2-prop="type">
          ${RECRUIT_FORM_FIELD_TYPE_OPTIONS.map(t => `<option value="${esc(t.value)}" ${field.type === t.value ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
        </select>`;

    return `
      <div class="schema-field-card" data-f2-idx="${idx}">
        <div class="schema-field-top">
          <div class="schema-field-ident">
            <span class="schema-order-num">#${idx + 1}</span>
            <span class="schema-field-badge ${field.system ? '' : 'custom'}">${field.system ? 'System' : 'Custom'}</span>
            ${mandatoryField ? '<span class="schema-field-lock">Core Required</span>' : ''}
          </div>
          <div class="schema-row-btns">
            <button type="button" class="icon-btn" data-f2-move="-1" ${idx === 0 ? 'disabled' : ''} title="Move Up">↑</button>
            <button type="button" class="icon-btn" data-f2-move="1" ${idx === currentSec.fields.length - 1 ? 'disabled' : ''} title="Move Down">↓</button>
            ${field.system ? '' : '<button type="button" class="icon-btn danger-action" data-f2-del>Delete</button>'}
          </div>
        </div>

        <div class="schema-field-grid ${hidePlaceholder ? 'schema-field-grid-3' : ''}">
          <div class="v-field">
            <label>Field Label (Shown to Indonesian Candidate)</label>
            <input class="input" data-f2-prop="label" value="${esc(field.label)}">
          </div>
          ${hidePlaceholder ? '' : `
            <div class="v-field">
              <label>Placeholder</label>
              <input class="input" data-f2-prop="placeholder" value="${esc(field.placeholder || '')}">
            </div>
          `}
          <div class="v-field">
            <label>Input Type</label>
            ${typeControl}
          </div>
          <div class="schema-check-group">
            ${isGroupSystem ? '' : `<label><input type="checkbox" data-f2-prop="required" ${field.required === true ? 'checked' : ''} ${mandatoryField ? 'disabled' : ''}> Required</label>`}
            <label><input type="checkbox" data-f2-prop="enabled" ${field.enabled !== false ? 'checked' : ''} ${mandatoryField ? 'disabled' : ''}> Visible</label>
            ${isGroupSystem ? '' : `<label><input type="checkbox" data-f2-prop="wide" ${field.wide === true ? 'checked' : ''}> Full Width</label>`}
          </div>
        </div>

        ${hasOptions ? `
          <div class="schema-options-wrap">
            <span class="schema-options-label">Choice Options (${esc(field.label)})</span>
            <div class="schema-option-chips">
              ${(field.options || []).map((opt, optIdx) => `
                <div class="schema-option-item">
                  <input class="input schema-f2-option-input" value="${esc(opt)}" placeholder="Option label">
                  <button type="button" class="q-option-del" data-f2-del-opt="${optIdx}" aria-label="Remove option">&times;</button>
                </div>
              `).join('')}
            </div>
            <div class="schema-add-bar" style="margin-bottom:0">
              <input class="input" data-f2-new-opt placeholder="Add new option...">
              <button type="button" class="btn btn-secondary btn-xs" data-f2-add-opt>+ Add</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  host.innerHTML = `
    <div class="vacancy-toolbar">
      <div class="vacancy-toolbar-meta">
        <h2>/form Stage 2 Sections &amp; Field Builder</h2>
        <span class="vacancy-count">${recruitDraftForm.positions.length} position(s) · ${STAGE2_SECTION_META.length} sections</span>
      </div>
      <div class="vacancy-toolbar-actions">
        <button type="button" class="btn btn-secondary" id="form-reset-btn">Reset Default</button>
        <button type="button" class="btn btn-primary" id="form-save-btn">Save Changes</button>
      </div>
    </div>

    <div class="schema-grid-2">
      <div class="schema-panel">
        <div class="schema-panel-head">
          <h3>/form Position Dropdown</h3>
          <span class="schema-panel-meta">${recruitDraftForm.positions.length} options</span>
        </div>
        <div class="schema-add-bar">
          <input id="new-form-pos-input" class="input" placeholder="Add new /form position...">
          <button type="button" class="btn btn-secondary btn-xs" id="add-form-pos-btn">+ Add</button>
        </div>
        <div class="schema-pos-list">${positionsRows}</div>
      </div>

      <div class="schema-panel">
        <div class="schema-panel-head">
          <h3>/form Information Sources</h3>
          <span class="schema-panel-meta">${recruitDraftForm.infoSources.length} sources</span>
        </div>
        <div class="schema-add-bar">
          <input id="new-form-src-input" class="input" placeholder="Add new information source...">
          <button type="button" class="btn btn-secondary btn-xs" id="add-form-src-btn">+ Add</button>
        </div>
        <div class="schema-pos-list">${sourceRows}</div>
      </div>
    </div>

    <div class="schema-panel">
      <div class="schema-panel-head">
        <h3>Step Section Ordering &amp; Final Statement</h3>
        <span class="schema-panel-meta">Steps with no visible sections are automatically skipped on /form</span>
      </div>
      <div class="schema-step-order-grid">${stepOrderHtml}</div>
      <div class="v-field" style="margin-top:14px">
        <label for="form-consent-text">Candidate Declaration Statement (Final Step · J)</label>
        <input id="form-consent-text" class="input" value="${esc(recruitDraftForm.consentText || DEFAULT_STAGE2_SCHEMA.consentText)}">
      </div>
    </div>

    <div class="schema-panel">
      <div class="schema-panel-head">
        <h3>Sections &amp; Field Ordering (/form)</h3>
        <span class="schema-panel-meta">${esc(activeMeta.stepLabel)} · ${currentSec.fields.filter(f => f.enabled !== false).length} visible</span>
      </div>

      <div class="schema-section-tabs" role="tablist">${sectionTabsHtml}</div>

      <div class="schema-section-settings">
        <div class="v-field">
          <label for="form-sec-title">Section Heading (${esc(activeMeta.code)})</label>
          <input id="form-sec-title" class="input" value="${esc(currentSec.title || activeMeta.defaultTitle)}">
        </div>
        <label class="schema-section-toggle">
          <input type="checkbox" id="form-sec-enabled" ${mandatorySec || currentSec.enabled !== false ? 'checked' : ''} ${mandatorySec ? 'disabled' : ''}>
          <span>${mandatorySec ? 'Core Required Section' : 'Show This Section on /form'}</span>
        </label>
      </div>

      <div class="schema-field-list">${fieldsHtml}</div>

      <div class="schema-options-wrap" style="margin-top:14px">
        <span class="schema-options-label">Add Custom Field to Section ${esc(activeMeta.code)} · ${esc(currentSec.title)}</span>
        <div class="schema-add-bar" style="margin-bottom:0">
          <input id="form-new-field-label" class="input" placeholder="Example: Nomor SIM / Pengalaman Organisasi">
          <select id="form-new-field-type" class="select" style="max-width:210px">
            ${RECRUIT_FORM_FIELD_TYPE_OPTIONS.map(t => `<option value="${esc(t.value)}">${esc(t.label)}</option>`).join('')}
          </select>
          <button type="button" class="btn btn-secondary" id="form-add-custom-field">+ Add Field</button>
        </div>
      </div>
    </div>
  `;

  $('#add-form-pos-btn', host).addEventListener('click', () => {
    syncRecruitFormDraftFromDom(host);
    const input = $('#new-form-pos-input', host);
    const name = input.value.trim();
    if (!name) return;
    if (recruitDraftForm.positions.some(p => p.toLowerCase() === name.toLowerCase())) {
      say(`Position "${name}" already exists.`);
      return;
    }
    recruitDraftForm.positions.push(name);
    renderRecruitFormFieldsTab(host);
  });

  $('#new-form-pos-input', host).addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    $('#add-form-pos-btn', host).click();
  });

  $('#add-form-src-btn', host).addEventListener('click', () => {
    syncRecruitFormDraftFromDom(host);
    const input = $('#new-form-src-input', host);
    const name = input.value.trim();
    if (!name) return;
    if (recruitDraftForm.infoSources.some(s => s.toLowerCase() === name.toLowerCase())) {
      say(`Source "${name}" already exists.`);
      return;
    }
    recruitDraftForm.infoSources.push(name);
    renderRecruitFormFieldsTab(host);
  });

  $('#new-form-src-input', host).addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    $('#add-form-src-btn', host).click();
  });

  $$('[data-pos-move]', host).forEach(btn => {
    btn.addEventListener('click', () => {
      syncRecruitFormDraftFromDom(host);
      const [listName, rawIdx, rawDelta] = btn.dataset.posMove.split(':');
      const idx = Number(rawIdx);
      const target = idx + Number(rawDelta);
      const arr = recruitDraftForm[listName];
      if (!Array.isArray(arr) || target < 0 || target >= arr.length) return;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      renderRecruitFormFieldsTab(host);
    });
  });

  $$('[data-pos-del]', host).forEach(btn => {
    btn.addEventListener('click', () => {
      syncRecruitFormDraftFromDom(host);
      const [listName, rawIdx] = btn.dataset.posDel.split(':');
      const idx = Number(rawIdx);
      const arr = recruitDraftForm[listName];
      if (!Array.isArray(arr) || arr.length <= 1) return;
      arr.splice(idx, 1);
      renderRecruitFormFieldsTab(host);
    });
  });

  $$('[data-step-move-sec]', host).forEach(btn => {
    btn.addEventListener('click', () => {
      syncRecruitFormDraftFromDom(host);
      const [rawStep, rawIdx, rawDelta] = btn.dataset.stepMoveSec.split(':');
      const step = Number(rawStep);
      const idx = Number(rawIdx);
      const target = idx + Number(rawDelta);
      const order = recruitDraftForm.stepSectionOrder?.[step];
      if (!Array.isArray(order) || target < 0 || target >= order.length) return;
      [order[idx], order[target]] = [order[target], order[idx]];
      if (step === 0) recruitDraftForm.step0SectionOrder = [...order];
      renderRecruitFormFieldsTab(host);
    });
  });

  $$('[data-f2-tab]', host).forEach(tab => {
    tab.addEventListener('click', () => {
      syncRecruitFormDraftFromDom(host);
      recruitActiveFormSecTab = tab.dataset.f2Tab;
      renderRecruitFormFieldsTab(host);
    });
  });

  $('#form-sec-enabled', host)?.addEventListener('change', () => {
    syncRecruitFormDraftFromDom(host);
    renderRecruitFormFieldsTab(host);
  });

  $$('[data-f2-prop="required"]', host).forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        const card = cb.closest('[data-f2-idx]');
        const enCb = card?.querySelector('[data-f2-prop="enabled"]');
        if (enCb && !enCb.checked) enCb.checked = true;
      }
    });
  });

  $$('[data-f2-prop="enabled"]', host).forEach(cb => {
    cb.addEventListener('change', () => {
      if (!cb.checked) {
        const card = cb.closest('[data-f2-idx]');
        const reqCb = card?.querySelector('[data-f2-prop="required"]');
        if (reqCb) reqCb.checked = false;
      }
    });
  });

  $$('[data-f2-move]', host).forEach(btn => {
    btn.addEventListener('click', () => {
      syncRecruitFormDraftFromDom(host);
      const idx = Number(btn.closest('[data-f2-idx]').dataset.f2Idx);
      const target = idx + Number(btn.dataset.f2Move);
      const list = recruitDraftForm.sections[recruitActiveFormSecTab].fields;
      if (target < 0 || target >= list.length) return;
      [list[idx], list[target]] = [list[target], list[idx]];
      renderRecruitFormFieldsTab(host);
    });
  });

  $$('[data-f2-del]', host).forEach(btn => {
    btn.addEventListener('click', () => {
      syncRecruitFormDraftFromDom(host);
      const idx = Number(btn.closest('[data-f2-idx]').dataset.f2Idx);
      recruitDraftForm.sections[recruitActiveFormSecTab].fields.splice(idx, 1);
      renderRecruitFormFieldsTab(host);
    });
  });

  $$('.schema-field-card[data-f2-idx] [data-f2-prop="type"]', host).forEach(sel => {
    sel.addEventListener('change', () => {
      syncRecruitFormDraftFromDom(host);
      const idx = Number(sel.closest('[data-f2-idx]').dataset.f2Idx);
      const field = recruitDraftForm.sections[recruitActiveFormSecTab].fields[idx];
      if (field && RECRUIT_FORM_CHOICE_TYPES.has(field.type) && !field.options?.length) {
        field.options = ['Option 1', 'Option 2'];
      }
      renderRecruitFormFieldsTab(host);
    });
  });

  $$('[data-f2-add-opt]', host).forEach(btn => {
    btn.addEventListener('click', () => {
      syncRecruitFormDraftFromDom(host);
      const card = btn.closest('[data-f2-idx]');
      const idx = Number(card.dataset.f2Idx);
      const input = card.querySelector('[data-f2-new-opt]');
      const val = input.value.trim();
      if (!val) return;
      const field = recruitDraftForm.sections[recruitActiveFormSecTab].fields[idx];
      if (!Array.isArray(field.options)) field.options = [];
      if (!field.options.includes(val)) field.options.push(val);
      renderRecruitFormFieldsTab(host);
    });
  });

  $$('[data-f2-new-opt]', host).forEach(input => {
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      input.closest('.schema-add-bar')?.querySelector('[data-f2-add-opt]')?.click();
    });
  });

  $$('[data-f2-del-opt]', host).forEach(btn => {
    btn.addEventListener('click', () => {
      syncRecruitFormDraftFromDom(host);
      const idx = Number(btn.closest('[data-f2-idx]').dataset.f2Idx);
      const optIdx = Number(btn.dataset.f2DelOpt);
      recruitDraftForm.sections[recruitActiveFormSecTab].fields[idx].options.splice(optIdx, 1);
      renderRecruitFormFieldsTab(host);
    });
  });

  $('#form-add-custom-field', host).addEventListener('click', () => {
    syncRecruitFormDraftFromDom(host);
    const labelInput = $('#form-new-field-label', host);
    const typeSelect = $('#form-new-field-type', host);
    const label = labelInput.value.trim();
    if (!label) {
      say('Enter a field label first.');
      labelInput.focus();
      return;
    }
    const type = typeSelect.value;
    recruitDraftForm.sections[recruitActiveFormSecTab].fields.push({
      name: `custom_${Date.now().toString(36)}`,
      label,
      placeholder: '',
      type,
      required: false,
      enabled: true,
      system: false,
      wide: type === 'textarea' || type === 'radio' || type === 'checkbox',
      options: RECRUIT_FORM_CHOICE_TYPES.has(type) ? ['Option 1', 'Option 2'] : []
    });
    renderRecruitFormFieldsTab(host);
  });

  $('#form-new-field-label', host).addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    $('#form-add-custom-field', host).click();
  });

  $('#form-reset-btn', host).addEventListener('click', () => {
    recruitDraftForm = normalizeStage2Schema(DEFAULT_STAGE2_SCHEMA);
    renderRecruitFormFieldsTab(host);
    say('Reset /form draft to defaults (unsaved).');
  });

  $('#form-save-btn', host).addEventListener('click', async () => {
    syncRecruitFormDraftFromDom(host);
    const btn = $('#form-save-btn', host);
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await persistRecruitFormSchema(recruitDraftForm);
      renderRecruitFormFieldsTab(host);
      say('/form schema configuration saved.');
    } catch (error) {
      say(error.message || 'Failed to save /form schema configuration.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  });
}

/* ============================================================================
 * USER MANAGEMENT (NIK, Employee Name, Role Superadmin, PIN + Eye 8karakterH!)
 * ============================================================================ */
async function renderUserManagement() {
  const canManageUsers = isRootAdminAccount(currentAdminProfile);
  let migrationMissing = false;
  let rows = [];
  try {
    const [{ data, error }, empList] = await Promise.all([
      supabase.rpc('list_portal_users'),
      employees.length ? Promise.resolve(employees) : fetchEmployeesSafe().catch(() => [])
    ]);
    if (Array.isArray(empList) && empList.length) employees = empList;
    if (error) {
      if (isMissingSchemaError(error) || String(error.message || '').includes('list_portal_users')) {
        migrationMissing = true;
      } else {
        throw error;
      }
    } else {
      rows = data || [];
    }
  } catch (err) {
    if (isMissingSchemaError(err) || String(err.message || '').includes('list_portal_users')) {
      migrationMissing = true;
    } else {
      throw err;
    }
  }
  portalUsers = rows;

  const migrationNotice = migrationMissing
    ? `<div class="upload-preview-box" style="margin-bottom:14px;border-color:#fca5a5;background:#fef2f2;color:#991b1b">User Management RPCs are not active in Supabase yet. Run <code>database/migrations/20261121_hrga_workspace_v3.sql</code> in Supabase SQL Editor.</div>`
    : '';

  const accessNotice = !canManageUsers
    ? `<div class="upload-preview-box" style="margin-bottom:14px;border-color:#fde68a;background:#fffbeb;color:#92400e">Read-only access: Only the root <b>Admin</b> account can add, edit, delete, or reveal user PINs.</div>`
    : '';

  const renderRowsHtml = list => list.length
    ? list.map(u => `<tr>
        <td style="font-family:var(--font-mono)"><b>${esc(u.employee_nik || u.username)}</b></td>
        <td>${esc(u.display_name || '—')}</td>
        <td><span class="status-pill blue">${esc(u.role || 'Superadmin')}</span></td>
        <td>
          <div class="pin-cell-wrap">
            <span data-pin-mask="${esc(u.username)}">${esc(maskPin())}</span>
            ${canManageUsers ? `<button type="button" class="pin-eye-btn" data-pin-reveal="${esc(u.username)}" data-pin-label="${esc(u.employee_nik || u.username)}" aria-label="Reveal PIN for ${esc(u.display_name || u.username)}" title="Reveal PIN">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>` : ''}
          </div>
        </td>
        <td>${u.last_login ? esc(idDate(u.last_login)) : '—'}</td>
        <td>${canManageUsers
          ? `<div class="row-actions">
              <button type="button" class="icon-btn" data-user-edit="${esc(u.username)}">Edit</button>
              ${String(u.username || '').toLowerCase() === 'admin' ? '' : `<button type="button" class="icon-btn danger" data-user-delete="${esc(u.username)}">Delete</button>`}
            </div>`
          : '<span class="subtle">Admin Only</span>'}</td>
      </tr>`).join('')
    : emptyRow(6, 'No user accounts found');

  const addButtonHtml = canManageUsers
    ? '<button id="add-portal-user" class="btn btn-primary">+ Add User</button>'
    : '';

  content.innerHTML = header('User Management', '', addButtonHtml) +
    migrationNotice +
    accessNotice +
    `<section class="panel table-panel">${tableToolbar('Search NIK / employee name…', 'Workspace Users')}
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>NIK</th><th>EMPLOYEE NAME</th><th>ROLE</th><th>PIN</th><th>LAST LOGIN</th><th>ACTIONS</th></tr></thead>
        <tbody id="user-rows">${renderRowsHtml(rows)}</tbody>
      </table></div></section>`;

  const bindUserActions = () => {
    if (!canManageUsers) return;
    $$('[data-pin-reveal]').forEach(btn => btn.addEventListener('click', () => {
      const username = btn.dataset.pinReveal;
      const maskEl = $(`[data-pin-mask="${CSS.escape(username)}"]`);
      if (maskEl && maskEl.dataset.revealed === 'true') {
        maskEl.textContent = maskPin();
        maskEl.dataset.revealed = 'false';
        return;
      }
      openPinRevealPrompt({
        label: btn.dataset.pinLabel,
        onUnlocked: async password => {
          const { data: revealedPin, error } = await supabase.rpc('reveal_portal_user_pin', {
            p_username: username,
            p_password: password
          });
          if (error) throw error;
          if (maskEl) {
            maskEl.textContent = revealedPin || '—';
            maskEl.dataset.revealed = 'true';
          }
          say('PIN revealed.');
        }
      });
    }));

    $$('[data-user-edit]').forEach(btn => btn.addEventListener('click', () => {
      const user = portalUsers.find(item => item.username === btn.dataset.userEdit);
      if (!user) return;
      openUserModal({
        existing: user,
        employees,
        onSave: async fields => {
          const { error } = await supabase.rpc('upsert_portal_user', {
            p_nik: fields.nik,
            p_full_name: fields.full_name,
            p_role: fields.role,
            p_pin: fields.pin || null
          });
          if (error) throw error;
          say(`Updated user ${fields.full_name}.`);
          await loadView('userManagement');
        }
      });
    }));

    $$('[data-user-delete]').forEach(btn => btn.addEventListener('click', async () => {
      const username = btn.dataset.userDelete;
      const user = portalUsers.find(item => item.username === username);
      const ok = await openConfirmDialog({
        title: 'Remove User Access',
        message: `Remove user access for ${user?.display_name || username}?`,
        confirmLabel: 'Remove',
        danger: true
      });
      if (!ok) return;
      try {
        const { error } = await supabase.rpc('delete_portal_user', { p_username: username });
        if (error) throw error;
        say('User removed.');
        await loadView('userManagement');
      } catch (err) {
        say(err.message || 'Failed to remove user.');
      }
    }));
  };

  if (canManageUsers) {
    $('#add-portal-user')?.addEventListener('click', () => {
      openUserModal({
        existing: null,
        employees,
        onSave: async fields => {
          if (migrationMissing) {
            throw new Error('Run SQL migration v2/v3 in Supabase SQL Editor first.');
          }
          const { error } = await supabase.rpc('upsert_portal_user', {
            p_nik: fields.nik,
            p_full_name: fields.full_name,
            p_role: fields.role,
            p_pin: fields.pin
          });
          if (error) throw error;
          say(`Added user ${fields.full_name}.`);
          await loadView('userManagement');
        }
      });
    });
  }

  bindSearch('#table-search', query => {
    const filtered = rows.filter(u => `${u.employee_nik} ${u.username} ${u.display_name} ${u.role}`.toLowerCase().includes(query));
    $('#user-rows').innerHTML = renderRowsHtml(filtered);
    bindUserActions();
  });
  bindUserActions();
}

/* ============================================================================
 * APPLICATION PRINT & TEMPLATES (No DISC column in Application Print)
 * ============================================================================ */
function renderPrintRows(rows) {
  if (!rows.length) return emptyRow(4);
  const idx = getWorkspaceIndexes();
  return rows.map(applicant => {
    const progress = deriveCandidateProgress(
      applicant,
      getInterviewsForApplicant(applicant.id, applicant),
      getEmployeeForApplicant(applicant),
      null,
      { applicants, indexes: idx }
    );
    return `<tr><td><b>${esc(applicant.full_name)}</b><small class="table-subline">${esc(applicant.nik)}</small></td>
      <td>${esc(applicant.position || '—')}</td>
      <td><span class="status-pill ${progress.tone}">${esc(progress.label)}</span></td>
      <td><button class="icon-btn" data-print="${esc(applicant.id)}">Print Application · CV · DISC</button></td></tr>`;
  }).join('');
}

async function loadPrintTemplates() {
  await syncDefaultPrintMaster().catch(error => {
    console.warn('Automatic default template sync skipped:', error);
  });
  const { data, error } = await supabase.from('print_templates')
    .select('id,source_filename,schema_version,is_active,created_at')
    .order('created_at', { ascending: false }).limit(30);
  if (error) { printTemplates = []; return error; }
  printTemplates = data || [];
  return null;
}

function templateManagerHtml(migrationError = null) {
  const active = printTemplates.find(t => t.is_active);
  const currentName = active?.source_filename || 'Built-in repository master';
  const isRepoDefault = !active || active.source_filename === 'Master bawaan repository' || active.source_filename === 'Built-in repository master';
  const currentMeta = isRepoDefault
    ? 'Default Mitra & ReHolz print masters ready'
    : `Updated ${idDate(active.created_at)}`;
  const history = printTemplates.length ? printTemplates.map(template => `<tr>
    <td><b>${esc(template.source_filename)}</b><small class="table-subline">${esc(template.schema_version || '—')}</small></td>
    <td data-sort-value="${esc(template.created_at || '')}">${idDate(template.created_at)}</td>
    <td>${template.is_active ? '<span class="status-pill green">Active</span>' : '<span class="status-pill gray">Archived</span>'}</td>
    <td>${template.is_active ? '' : `<button class="icon-btn" data-template-activate="${esc(template.id)}">Activate</button>`}</td>
  </tr>`).join('') : emptyRow(4, 'No custom template versions yet.');
  const controls = migrationError
    ? `<div class="form-error template-error">Template version history is unavailable.</div>`
    : `<div class="template-current"><div><small>ACTIVE MASTER</small><b>${esc(currentName)}</b><span>${esc(currentMeta)}</span></div>
        <button class="btn btn-secondary" id="restore-template">Restore Default Master</button></div>
      <form id="template-upload-form" class="template-upload">
        <div class="template-upload-copy"><b>Upload custom master</b><span>Upload HTML file. Existing form field <code>name</code> attributes must remain intact.</span></div>
        <input id="template-file" class="input" type="file" accept=".html,text/html" required>
        <button class="btn btn-primary" type="submit">Save &amp; Activate</button>
      </form>
      <div class="template-history"><div class="template-history-title">Saved template history</div><div class="table-wrap"><table class="data-table"><thead><tr><th>MASTER FILE</th><th>DATE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${history}</tbody></table></div></div>`;
  return `<section class="panel template-manager">
    <div class="panel-head"><div><h3>Application Master HTML</h3><p>Customize print layout without altering candidate field structure</p></div><span class="status-pill ${active ? 'green' : 'blue'}">${isRepoDefault ? 'Built-in Master · Active' : 'Saved Version'}</span></div>
    <div class="template-manager-body">${controls}</div>
  </section>`;
}

function renderPrint() {
  const indexedPrint = applicants.map(a => ({
    applicant: a,
    searchText: `${a.full_name} ${a.nik} ${a.position}`.toLowerCase()
  }));

  content.innerHTML = header('Application Print', '') + `
    <section class="panel table-panel">${tableToolbar('Search candidates…', 'Application Print')}<div class="table-wrap"><table class="data-table">
      <thead><tr><th>APPLICANT</th><th>POSITION</th><th>STAGE</th><th>DOCUMENTS</th></tr></thead>
      <tbody id="candidate-rows"></tbody>
    </table></div><div id="print-pager"></div></section>`;

  let printQuery = '';
  let printPage = 1;
  let printPageSize = 50;

  const paintPrint = () => {
    const filtered = printQuery
      ? indexedPrint.filter(item => item.searchText.includes(printQuery)).map(item => item.applicant)
      : applicants;
    const paged = paginateRows(filtered, printPage, printPageSize);
    printPage = paged.page;
    $('#candidate-rows').innerHTML = renderPrintRows(paged.items);
    bindPrint();
    renderPaginationFooter($('#print-pager'), paged, (nextPage, nextSize) => {
      printPage = nextPage;
      printPageSize = nextSize;
      paintPrint();
    });
  };

  paintPrint();
  bindSearch('#table-search', query => {
    printQuery = query;
    printPage = 1;
    paintPrint();
  });
}

function renderPlaceholder(title) {
  content.innerHTML = `<section class="panel placeholder-panel"><div><div class="placeholder-symbol" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg></div><h2>${esc(title || 'Module In Development')}</h2><p>This module is prepared for integrated HR&amp;GA operations.</p></div></section>`;
}

function printBrandModal() {
  let modal = $('#print-brand-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'print-brand-modal';
  modal.className = 'modal-backdrop hidden';
  modal.innerHTML = `<section class="print-brand-modal-card" role="dialog" aria-modal="true" aria-labelledby="print-brand-modal-title">
    <div class="employee-modal-head">
      <div><small>DOCUMENT PRINT EDITION</small><h2 id="print-brand-modal-title">Select company template for printing</h2></div>
      <button type="button" class="modal-close" id="print-brand-close" aria-label="Close">×</button>
    </div>
    <div class="print-brand-candidate" id="print-brand-candidate"></div>
    <div class="print-brand-grid">
      <button type="button" class="print-brand-option" data-print-brand="mitra">
        <div class="print-brand-option-banner"><img src="./assets/img/logo-mitra.png" alt="PT. Mitra Binamandiri Makmur"><span class="print-brand-option-tag">Executive Navy</span></div>
        <div class="print-brand-option-body"><b>PT. Mitra Binamandiri Makmur</b><small>Official Mitra application form, attached CV, and D.I.S.C. Assessment Report.</small><span class="print-brand-cta">Print Mitra Edition ↗</span></div>
      </button>
      <button type="button" class="print-brand-option" data-print-brand="reholz">
        <div class="print-brand-option-banner"><img src="./assets/img/logo-reholz-light.png" alt="ReHolz · PT Radin Mitra Lestari"><span class="print-brand-option-tag">Forest &amp; Amber</span></div>
        <div class="print-brand-option-body"><b>PT Radin Mitra Lestari (ReHolz)</b><small>Official ReHolz application form, attached CV, and D.I.S.C. Assessment Report.</small><span class="print-brand-cta">Print ReHolz Edition ↗</span></div>
      </button>
    </div>
  </section>`;
  document.body.append(modal);
  const close = () => { modal.classList.add('hidden'); pendingPrintRecord = null; pendingPrintSourceButton = null; };
  $('#print-brand-close', modal).addEventListener('click', close);
  bindSafeModalClose(modal, close, { closeOnBackdrop: true });
  $$('[data-print-brand]', modal).forEach(optionBtn => {
    optionBtn.addEventListener('click', () => {
      const record = pendingPrintRecord;
      const sourceBtn = pendingPrintSourceButton;
      const brand = optionBtn.dataset.printBrand === 'reholz' ? 'reholz' : 'mitra';
      if (!record) return;
      modal.classList.add('hidden');
      pendingPrintRecord = null;
      pendingPrintSourceButton = null;
      const originalText = sourceBtn?.textContent || '';
      if (sourceBtn) { sourceBtn.disabled = true; sourceBtn.textContent = 'Preparing…'; }
      loadPrintModule()
        .then(({ printApplication }) => printApplication(record, { brand }))
        .catch(error => say(error.message || 'Unable to prepare document.'))
        .finally(() => { if (sourceBtn) { sourceBtn.disabled = false; sourceBtn.textContent = originalText; } });
    });
  });
  return modal;
}

function openPrintBrandModal(record, sourceButton = null) {
  const modal = printBrandModal();
  pendingPrintRecord = record;
  pendingPrintSourceButton = sourceButton;
  const candidateEl = $('#print-brand-candidate', modal);
  if (candidateEl) {
    candidateEl.innerHTML = `<div><b>${esc(record.full_name || '—')}</b><span>${esc(record.position || 'Position unspecified')}</span></div><span class="print-brand-nik">${esc(record.nik || '—')}</span>`;
  }
  modal.classList.remove('hidden');
  $('[data-print-brand="mitra"]', modal)?.focus();
}

function bindPrint() {
  $$('[data-print]').forEach(button => {
    button.addEventListener('click', () => {
      const record = applicants.find(a => a.id === button.dataset.print);
      if (!record) return;
      const sharedDisc = getDiscForApplicant(record);
      const printRecord = sharedDisc ? { ...record, disc_submissions: [sharedDisc] } : record;
      openPrintBrandModal(printRecord, button);
    });
  });
}

function sanitizeAndValidateTemplate(html, baselineHtml) {
  const parser = new DOMParser();
  const candidateDoc = parser.parseFromString(html, 'text/html');
  const baselineDoc = parser.parseFromString(baselineHtml, 'text/html');
  const form = candidateDoc.querySelector('#applicationForm');
  if (!form) throw new Error('Master HTML must contain a form element with id="applicationForm".');
  const baselineNames = new Set([...baselineDoc.querySelectorAll('#applicationForm [name]')].map(el => el.getAttribute('name')).filter(Boolean));
  const newNames = new Set([...form.querySelectorAll('[name]')].map(el => el.getAttribute('name')).filter(Boolean));
  const missing = [...baselineNames].filter(name => !newNames.has(name));
  if (missing.length) {
    throw new Error(`Uploaded master removes ${missing.length} required field(s). All name attributes must be preserved.`);
  }
  candidateDoc.querySelectorAll('script,iframe,object,embed,base,meta[http-equiv=refresh]').forEach(el => el.remove());
  candidateDoc.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      if (['href', 'src', 'action', 'formaction'].includes(attr.name.toLowerCase()) && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
    });
  });
  candidateDoc.querySelectorAll('form').forEach(el => el.removeAttribute('action'));
  return {
    html: '<!doctype html>\n' + candidateDoc.documentElement.outerHTML,
    schemaVersion: candidateDoc.querySelector('meta[name="form-schema-version"]')?.content || 'custom'
  };
}

function versionedTemplateUrl() {
  const sep = TEMPLATE_URL.includes('?') ? '&' : '?';
  return `${TEMPLATE_URL}${sep}v=${encodeURIComponent(DEFAULT_MASTER_REVISION)}`;
}

async function markDefaultMasterSynced() {
  if (!supabase || !currentUserId) return;
  try {
    await supabase.from('portal_settings').upsert({
      key: 'default_master_revision',
      value: DEFAULT_MASTER_REVISION,
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });
  } catch {}
}

async function syncDefaultPrintMaster() {
  if (!supabase || !currentUserId) return;
  if (defaultMasterSyncPromise) return defaultMasterSyncPromise;
  defaultMasterSyncPromise = (async () => {
    const { data: setting, error: settingError } = await supabase
      .from('portal_settings').select('value').eq('key', 'default_master_revision').maybeSingle();
    if (settingError || setting?.value === DEFAULT_MASTER_REVISION) return;
    const response = await fetch(versionedTemplateUrl(), { cache: 'no-store' });
    if (!response.ok) return;
    await storeAndActivateTemplate(await response.text(), 'Master bawaan repository');
    await markDefaultMasterSynced();
  })().catch(() => { defaultMasterSyncPromise = null; });
  return defaultMasterSyncPromise;
}

async function storeAndActivateTemplate(html, filename) {
  const baselineResponse = await fetch(versionedTemplateUrl(), { cache: 'no-store' });
  if (!baselineResponse.ok) throw new Error('Unable to load default master for field validation.');
  const validated = sanitizeAndValidateTemplate(html, await baselineResponse.text());
  const { data, error } = await supabase.from('print_templates').insert({
    source_filename: filename,
    schema_version: validated.schemaVersion,
    html_content: validated.html,
    is_active: false,
    uploaded_by: currentUserId
  }).select('id').single();
  if (error) throw error;
  const { error: activateError } = await supabase.rpc('activate_print_template', { p_template_id: data.id });
  if (activateError) throw activateError;
}

function bindTemplateManager(migrationMissing) {
  if (migrationMissing) return;
  $('#template-upload-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const file = $('#template-file').files?.[0];
    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (!file) return;
    button.disabled = true;
    button.textContent = 'Validating…';
    try {
      await storeAndActivateTemplate(await file.text(), file.name);
      await markDefaultMasterSynced();
      const { invalidateMasterHtmlCache } = await loadPrintModule();
      await invalidateMasterHtmlCache();
      say('New Master HTML activated.');
      await loadView('settings');
    } catch (error) { say(error.message || 'Failed to save Master HTML.'); }
    finally { button.disabled = false; button.textContent = 'Save & Activate'; }
  });
  $('#restore-template')?.addEventListener('click', async () => {
    const button = $('#restore-template');
    button.disabled = true;
    button.textContent = 'Restoring…';
    try {
      const response = await fetch(versionedTemplateUrl(), { cache: 'no-store' });
      if (!response.ok) throw new Error('Default master file not found.');
      await storeAndActivateTemplate(await response.text(), 'Master bawaan repository');
      await markDefaultMasterSynced();
      const { invalidateMasterHtmlCache } = await loadPrintModule();
      await invalidateMasterHtmlCache();
      say('Default master restored and activated.');
      await loadView('settings');
    } catch (error) { say(error.message || 'Failed to restore default master.'); }
    finally { button.disabled = false; button.textContent = 'Restore Default Master'; }
  });
  $$('[data-template-activate]').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const { error } = await supabase.rpc('activate_print_template', { p_template_id: button.dataset.templateActivate });
      if (error) throw error;
      await markDefaultMasterSynced();
      const { invalidateMasterHtmlCache } = await loadPrintModule();
      await invalidateMasterHtmlCache();
      say('Selected master version activated.');
      await loadView('settings');
    } catch (error) { say(error.message || 'Failed to activate template version.'); button.disabled = false; }
  }));
}

/* ============================================================================
 * ROUTING, COLLAPSIBLE SIDEBAR & AUTH
 * ============================================================================ */
function setMobileSidebarOpen(open) {
  if (!sidebarEl || !sidebarBackdrop) return;
  sidebarEl.classList.toggle('is-open', open);
  sidebarBackdrop.classList.toggle('hidden', !open);
  $('#mobile-nav-toggle')?.setAttribute('aria-expanded', String(open));
}

function initSidebarAccordions() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SIDEBAR_STATE_KEY) || '{}') || {}; } catch {}

  $$('[data-collapse-target]').forEach(toggle => {
    const targetId = toggle.dataset.collapseTarget;
    const body = document.getElementById(targetId);
    if (!body) return;
    const isCollapsed = saved[targetId] === true;
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
    body.hidden = isCollapsed;

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      const nextExpanded = !expanded;
      toggle.setAttribute('aria-expanded', String(nextExpanded));
      body.hidden = !nextExpanded;
      saved[targetId] = !nextExpanded;
      try { localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify(saved)); } catch {}
    });
  });

  $('#mobile-nav-toggle')?.addEventListener('click', () => {
    setMobileSidebarOpen(!sidebarEl?.classList.contains('is-open'));
  });
  $('#mobile-nav-close')?.addEventListener('click', () => setMobileSidebarOpen(false));
  sidebarBackdrop?.addEventListener('click', () => setMobileSidebarOpen(false));
}

async function loadView(view, forceRefresh = false) {
  activeView = view;
  setMobileSidebarOpen(false);
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#page-title').textContent = TITLES[view] || 'Dashboard';

  if (ROOT_ADMIN_VIEWS.has(view) && !isRootAdminAccount(currentAdminProfile)) {
    content.innerHTML = `<section class="panel placeholder-panel"><div>
      <div class="placeholder-symbol" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
      <h2>Access Restricted</h2>
      <p>System Settings can only be accessed by Root Administrator accounts.</p>
    </div></section>`;
    return;
  }

  const dataViews = new Set(['dashboard', 'invited', 'stage1', 'stage2', 'stage3', 'interview', 'tracking', 'employees', 'contracts', 'contractSettings', 'systemImport', 'print']);
  if (dataViews.has(view) && (!lastDataFetchedAt || forceRefresh)) {
    let hasCached = false;
    if (!forceRefresh && !isDemoMode) {
      const cached = await cacheGet('workspace_snapshot', { maxAgeMs: SNAPSHOT_MAX_AGE_MS });
      if (cached?.value && hydrateSnapshotIntoMemory(cached.value, cached.savedAt)) {
        hasCached = true;
      }
    }
    if (!hasCached && !isDemoMode) {
      content.innerHTML = '<section class="panel placeholder-panel"><div><div class="placeholder-symbol" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div><h2>Loading data…</h2></div></section>';
    }
  }

  const opsCtx = {
    isDemoMode,
    supabase,
    profile: currentAdminProfile,
    getEmployees: () => employees,
    getLastDelta: () => lastEmployeeDelta,
    setLastDelta: d => { lastEmployeeDelta = d; }
  };

  try {
    if (dataViews.has(view)) await refreshData(forceRefresh);
    if (view === 'dashboard') renderDashboard();
    else if (view === 'invited') renderInvitedView();
    else if (view === 'stage1') renderStage1();
    else if (view === 'stage2') renderStage2();
    else if (view === 'stage3') renderStage3();
    else if (view === 'interview') renderInterviewView();
    else if (view === 'tracking') renderTrackingView();
    else if (view === 'employees') renderEmployees();
    else if (view === 'contracts') await renderContractsView();
    else if (view === 'contractSettings') await renderContractSettings();
    else if (view === 'recruitmentSettings') await renderRecruitmentSettings(forceRefresh);
    else if (view === 'opsSettings') await (await loadOpsViewsModule()).renderOpsSettingsView(content, opsCtx);
    else if (view === 'attendanceUpload') await (await loadOpsViewsModule()).renderAttendanceUploadView(content, opsCtx);
    else if (view === 'attendanceCalendar') await (await loadOpsViewsModule()).renderAttendanceCalendarView(content, opsCtx);
    else if (view === 'attendanceStaffHoliday') await (await loadOpsViewsModule()).renderStaffHolidayView(content, opsCtx);
    else if (view === 'attendanceStaffManagement') await (await loadOpsViewsModule()).renderStaffManagementView(content, opsCtx);
    else if (view === 'attendanceStaffReports') await (await loadOpsViewsModule()).renderStaffReportsView(content, opsCtx);
    else if (view === 'attendanceDriverSchedule') await (await loadOpsViewsModule()).renderDriverScheduleView(content, opsCtx);
    else if (view === 'attendanceDriverManagement') await (await loadOpsViewsModule()).renderDriverManagementView(content, opsCtx);
    else if (view === 'attendanceDriverReports') await (await loadOpsViewsModule()).renderDriverReportsView(content, opsCtx);
    else if (view === 'stationeryInput') await (await loadOpsViewsModule()).renderStationeryInputView(content, opsCtx);
    else if (view === 'stationeryStock') await (await loadOpsViewsModule()).renderStationeryStockView(content, opsCtx);
    else if (view === 'stationeryReports') await (await loadOpsViewsModule()).renderStationeryReportsView(content, opsCtx);
    else if (view === 'systemImport') renderSystemImport();
    else if (view === 'print') renderPrint();
    else if (view === 'settings') await renderSettings();
    else if (view === 'userManagement') await renderUserManagement();
    else if (TITLES[view]) renderPlaceholder(TITLES[view]);
    else renderPlaceholder('Page not found');
  } catch (error) {
    content.innerHTML = `<section class="panel placeholder-panel"><div><div class="placeholder-symbol" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><h2>Unable to load data</h2><p>${esc(error.message || 'Check your Supabase connection.')}</p><button id="retry-load" class="btn btn-secondary" style="margin-top:18px">Retry</button></div></section>`;
    $('#retry-load')?.addEventListener('click', () => loadView(view, true));
  }
}

function readCachedSessionProfile() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_PROFILE_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeCachedSessionProfile(profile) {
  try {
    localStorage.setItem(SESSION_PROFILE_KEY, JSON.stringify(profile));
  } catch {}
}

function applyAdminProfileUi(profile) {
  currentAdminProfile = profile;
  currentUserId = profile.userId;
  adminDisplayName = profile.displayName || 'HR Admin';
  const nameEl = $('#admin-name');
  if (nameEl) nameEl.textContent = adminDisplayName;
  const roleEl = $('#admin-role-label');
  if (roleEl) roleEl.textContent = profile.isRootAdmin ? 'Root Admin' : (profile.role || 'Superadmin');
  const accessGroup = sidebarEl?.querySelector('[data-group-id="access"]');
  if (accessGroup) {
    accessGroup.classList.toggle('hidden', !profile.isRootAdmin);
  }
}

async function resolveAdminProfileFromServer(session) {
  const meta = session?.user?.user_metadata || {};
  let username = meta.username || '';
  let employeeNik = meta.employee_nik || '';
  let displayName = meta.display_name || '';
  let role = 'Superadmin';
  let isRootAdmin = false;

  const rpcProfile = await supabase.rpc('get_my_admin_profile').then(res => res, () => ({ data: null, error: true }));
  const rpcProfileRow = !rpcProfile.error && rpcProfile.data
    ? (Array.isArray(rpcProfile.data) ? rpcProfile.data[0] : (typeof rpcProfile.data === 'object' ? rpcProfile.data : null))
    : null;
  if (rpcProfileRow) {
    username = rpcProfileRow.username || username;
    employeeNik = rpcProfileRow.employee_nik || employeeNik;
    displayName = rpcProfileRow.display_name || displayName;
    role = rpcProfileRow.role || role;
    isRootAdmin = Boolean(rpcProfileRow.is_root_admin);
  }

  if (rpcProfile.error || !displayName) {
    const userRow = await supabase
      .from('admin_users')
      .select('display_name,role')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(res => res, () => ({ data: null }));
    if (!displayName && userRow?.data?.display_name) {
      displayName = userRow.data.display_name;
    }
    if (userRow?.data?.role && role === 'Superadmin') {
      role = userRow.data.role;
    }
  }

  displayName = displayName || session.user.email || 'HR Admin';
  isRootAdmin = isRootAdmin || isRootAdminAccount({ username, employeeNik, displayName });

  return {
    userId: session.user.id,
    username,
    employeeNik,
    displayName,
    role,
    isRootAdmin
  };
}

function verifyAdminAccessInBackground(session) {
  Promise.all([
    supabase.rpc('is_portal_admin'),
    resolveAdminProfileFromServer(session)
  ]).then(async ([adminCheck, freshProfile]) => {
    if (adminCheck?.error || !adminCheck?.data) {
      await supabase.auth.signOut().catch(() => {});
      localStorage.removeItem(SESSION_PROFILE_KEY);
      shell.classList.add('hidden');
      loginView.classList.remove('hidden');
      $('#login-error').textContent = 'Admin session expired or access is inactive. Please sign in again.';
      return;
    }
    writeCachedSessionProfile(freshProfile);
    const changed = JSON.stringify(freshProfile) !== JSON.stringify(currentAdminProfile);
    applyAdminProfileUi(freshProfile);
    if (changed && activeView === 'userManagement') {
      renderUserManagement().catch(() => {});
    }
  }).catch(() => {});
}

async function openAdmin(session, { fromSessionRestore = false } = {}) {
  const cachedProfile = readCachedSessionProfile();
  if (fromSessionRestore && cachedProfile?.userId === session.user.id) {
    applyAdminProfileUi(cachedProfile);
    loginView.classList.add('hidden');
    shell.classList.remove('hidden');
    await loadView(activeView || 'dashboard', false);
    verifyAdminAccessInBackground(session);
    return;
  }

  const [{ data: isAdmin, error }, profile] = await Promise.all([
    supabase.rpc('is_portal_admin'),
    resolveAdminProfileFromServer(session)
  ]);
  if (error) {
    await supabase.auth.signOut();
    throw new Error('Signed in, but admin access verification failed.');
  }
  if (!isAdmin) {
    await supabase.auth.signOut();
    throw new Error('Signed in, but HR workspace privileges are not active for this account.');
  }
  writeCachedSessionProfile(profile);
  applyAdminProfileUi(profile);
  loginView.classList.add('hidden');
  shell.classList.remove('hidden');
  await loadView(activeView || 'dashboard', false);
}

$('#toggle-pin-visibility')?.addEventListener('click', () => {
  const input = $('#login-pin');
  const btn = $('#toggle-pin-visibility');
  if (!input || !btn) return;
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  btn.setAttribute('aria-pressed', String(!visible));
  btn.setAttribute('aria-label', visible ? 'Show PIN' : 'Hide PIN');
  btn.innerHTML = visible
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
});

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const rawUser = $('#login-user').value.trim();
  const pin = $('#login-pin').value.trim();
  const errorBox = $('#login-error');
  const button = event.currentTarget.querySelector('button[type="submit"]');
  errorBox.textContent = '';

  if (!isConfigured) { errorBox.textContent = 'Supabase configuration is missing.'; return; }
  if (!validateLoginIdentifier(rawUser)) {
    errorBox.textContent = 'Please enter a valid Employee NIK (at least 3 characters).';
    return;
  }
  if (!validatePin(pin)) {
    errorBox.textContent = 'PIN must be 4–12 numeric digits.';
    return;
  }

  const normalizedUser = normalizeLoginIdentifier(rawUser);
  button.disabled = true;
  button.textContent = 'Checking…';
  try {
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/admin-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY
      },
      body: JSON.stringify({ username: normalizedUser, pin })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.session?.access_token || !result.session?.refresh_token) {
      throw new Error(result.error || 'Invalid Employee NIK or PIN.');
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token
    });
    if (error) throw error;
    await openAdmin(data.session, { fromSessionRestore: false });
    $('#login-pin').value = '';
  } catch (error) {
    console.error('NIK/PIN login failed:', error);
    errorBox.textContent = error.message || 'Sign in failed. Please check your Employee NIK and PIN.';
  } finally {
    button.disabled = false;
    button.textContent = 'Sign In ↗';
  }
});

$('#admin-nav').addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (button) loadView(button.dataset.view);
});

$('#logout-btn').addEventListener('click', () => {
  localStorage.removeItem(SESSION_PROFILE_KEY);
  invalidateDataCache();
  workspaceIndexesCache = null;
  opsViewsModuleRef?.invalidateOpsStateCache?.();
  currentAdminProfile = null;
  currentUserId = null;
  applicants = [];
  stage1Leads = [];
  employees = [];
  interviews = [];
  invitedCandidates = [];
  cvScreenings = [];
  portalUsers = [];
  contractHistory = [];
  activeView = 'dashboard';
  shell.classList.add('hidden');
  loginView.classList.remove('hidden');
  $('#login-pin').value = '';
  const loginButton = $('#login-form button[type="submit"]');
  if (loginButton) { loginButton.disabled = false; loginButton.textContent = 'Sign In ↗'; }
  supabase?.auth.signOut({ scope: 'local' }).catch(() => {});
  clearAllWorkspaceCache().catch(() => {});
});

async function init() {
  initSidebarAccordions();
  if (isDemoMode) {
    const demoNonRoot = (() => {
      try { return new URLSearchParams(location.search).get('nonroot') === '1'; }
      catch { return false; }
    })();
    applyAdminProfileUi(demoNonRoot
      ? {
          userId: 'demo-staff',
          username: 'ST 250112',
          employeeNik: 'ST 250112',
          displayName: 'Hendra Wijaya',
          role: 'HR Staff',
          isRootAdmin: false
        }
      : {
          userId: 'demo-admin',
          username: 'ST 130116',
          employeeNik: 'ST 130116',
          displayName: 'Diana Anita Sari',
          role: 'Superadmin',
          isRootAdmin: true
        });
    seedDemoWorkspaceData();
    loginView.classList.add('hidden');
    shell.classList.remove('hidden');
    await loadView(activeView || 'dashboard', false);
    return;
  }
  if (!isConfigured) {
    $('#login-error').textContent = 'Set Project URL and Publishable key in assets/js/config.js.';
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    try { await openAdmin(session, { fromSessionRestore: true }); }
    catch (error) { $('#login-error').textContent = error.message; }
  }
}

init().finally(() => {
  document.documentElement.dataset.adminReady = 'true';
});
