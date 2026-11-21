import { supabase, isConfigured } from './supabase.js?v=20261121-hrga-workspace-12';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEMPLATE_URL, DEFAULT_MASTER_REVISION } from './config.js?v=20261121-hrga-workspace-12';
import { $, $$, esc, idDate } from './common.js?v=20261121-hrga-workspace-12';
import { printApplication, invalidateMasterHtmlCache } from './print.js?v=20261121-hrga-workspace-12';
import { computeDisc } from './disc-engine.js?v=20261121-hrga-workspace-12';
import { renderAdminEditorMarkup, bindAdminEditorForm, collectAdminEditorData } from './applicant.js?v=20261121-hrga-workspace-12';
import { cacheGet, cacheSet, cacheDelete, clearAllWorkspaceCache } from './cache.js?v=20261121-hrga-workspace-12';
import {
  EMPLOYEE_TABLE_HEADERS,
  EMPLOYEE_UI_HEADERS,
  INTERVIEW_STAGES,
  INTERVIEW_STAGE_LABELS,
  LEAD_RECOMMENDATION_OPTIONS,
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
  formatEmployeeExportRow,
  formatDmyDash,
  isRootAdminAccount,
  maskPin
} from './workspace-logic.js?v=20261121-hrga-workspace-12';
import {
  bindSafeModalClose,
  openDuplicateCandidateModal,
  openInterviewModal,
  openInvitedCandidateModal,
  openCvScreeningModal,
  openFullEmployeeModal,
  openEmployeeUploadModal,
  openUserModal,
  openPinRevealPrompt
} from './admin-modals.js?v=20261121-hrga-workspace-12';

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
let interviewsTableMissing = false;
let invitedTableMissing = false;
let cvScreeningsTableMissing = false;
let interviewDateColMissing = false;
let stage1HasRecommendationCol = true;
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

const TITLES = {
  dashboard: 'Dashboard',
  invited: 'Invited',
  stage1: 'Lead Register',
  stage2: 'Candidate List',
  stage3: 'DISC Assessment',
  interview: 'Interview Pipeline',
  tracking: 'Recruitment Tracking',
  employees: 'Employee Directory',
  print: 'Application Print',
  settings: 'Recruitment Settings',
  userManagement: 'User Management',
  attendanceSuite: 'Attendance Suite',
  attendanceCalendar: 'Calendar Settings',
  attendanceStaffHoliday: 'Conditional Holiday Schedule',
  attendanceStaffManagement: 'Staff Attendance Management',
  attendanceStaffReports: 'Staff Reports',
  attendanceDriverSchedule: 'Manual Driver Schedule',
  attendanceDriverManagement: 'Driver Attendance Management',
  attendanceDriverReports: 'Driver Reports',
  vehicleManagement: 'Vehicle Management',
  vehicleDatabase: 'Vehicle Database',
  vehicleExpenses: 'Vehicle Expenses',
  vehicleReports: 'Vehicle Reports'
};


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

function getEmployeeForApplicant(applicant) {
  const rel = Array.isArray(applicant?.employees) ? applicant.employees[0] : applicant?.employees;
  if (rel) return rel;
  return employees.find(e => e.applicant_id === applicant?.id) || null;
}

function getDiscForApplicant(applicant) {
  return Array.isArray(applicant?.disc_submissions) ? applicant.disc_submissions[0] : applicant?.disc_submissions;
}

function getInterviewsForApplicant(applicantId) {
  return interviews.filter(i => i.applicant_id === applicantId);
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
  return rows.map(applicant => {
    const employee = getEmployeeForApplicant(applicant);
    const disc = getDiscForApplicant(applicant);
    const progress = deriveCandidateProgress(applicant, getInterviewsForApplicant(applicant.id), employee);
    let graph = '<span class="status-pill gray">No graph yet</span>';
    let personality = '—';
    if (disc?.answers) {
      try {
        const result = computeDisc(disc.answers);
        const natural = result.pola[2];
        graph = discGraphSvg(result);
        personality = `<b>${esc(natural.title)}</b><small class="table-subline">${esc(natural.nama)} · Dominant ${esc(result.hurufDominan)}</small>`;
      } catch {
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

function bindSearch(selector, rerender) {
  const input = $(selector);
  if (!input) return;
  input.addEventListener('input', () => rerender(input.value.trim().toLowerCase()));
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
  let res = await supabase.from('candidate_stage1_applications')
    .select('id,full_name,position,whatsapp,cv_path,cv_filename,recommendation,recommendation_notes,status,created_at')
    .order('created_at', { ascending: false }).limit(500);
  if (res.error && isMissingSchemaError(res.error)) {
    stage1HasRecommendationCol = false;
    res = await supabase.from('candidate_stage1_applications')
      .select('id,full_name,position,whatsapp,cv_path,cv_filename,status,created_at')
      .order('created_at', { ascending: false }).limit(500);
  } else {
    stage1HasRecommendationCol = true;
  }
  if (res.error) throw res.error;
  return (res.data || []).map(item => ({
    ...item,
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
  lastDataFetchedAt = savedAt || Date.now();
  return true;
}

async function fetchAndCacheFreshSnapshot() {
  if (inflightRefreshPromise) return inflightRefreshPromise;
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
    lastDataFetchedAt = Date.now();
    await cacheSet('workspace_snapshot', {
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
    });
  })().finally(() => {
    inflightRefreshPromise = null;
  });
  return inflightRefreshPromise;
}

function triggerBackgroundRevalidate() {
  if (bgRevalidatePromise || inflightRefreshPromise) return;
  bgRevalidatePromise = fetchAndCacheFreshSnapshot()
    .then(() => {
      const hasOpenModal = Boolean($('.modal-backdrop:not(.hidden)'));
      const searchVal = $('#table-search')?.value?.trim();
      const autoRefreshViews = new Set(['dashboard', 'invited', 'stage1', 'stage2', 'stage3', 'interview', 'tracking', 'employees', 'print']);
      if (!hasOpenModal && !searchVal && autoRefreshViews.has(activeView) && !shell.classList.contains('hidden')) {
        if (activeView === 'dashboard') renderDashboard();
        else if (activeView === 'invited') renderInvitedView();
        else if (activeView === 'stage1') renderStage1();
        else if (activeView === 'stage2') renderStage2();
        else if (activeView === 'stage3') renderStage3();
        else if (activeView === 'interview') renderInterviewView();
        else if (activeView === 'tracking') renderTrackingView();
        else if (activeView === 'employees') renderEmployees();
        else if (activeView === 'print') renderPrint();
      }
    })
    .catch(() => {})
    .finally(() => { bgRevalidatePromise = null; });
}

async function refreshData(force = false) {
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
  const discDone = stage3 + applicants.filter(a => Boolean(getDiscForApplicant(a)) && a.stage !== 'disc_completed').length;
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
      <button type="button" class="workspace-module" data-view="employees" data-module="vehicle">
        <span class="workspace-module-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
        <span class="workspace-module-copy"><b>Employee Directory</b><span>Employee Records &amp; Import</span></span>
        <span class="workspace-module-arrow" aria-hidden="true">↗</span>
      </button>
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
}

/* ============================================================================
 * LEAD REGISTER (stage1) — Connected live status synced with Candidate List
 * ============================================================================ */
function stage1RowsHtml(rows) {
  if (!rows.length) return emptyRow(6, 'No lead records yet');
  return rows.map(row => {
    const rec = normalizeLeadRecommendation(row.recommendation);
    const unified = resolveLeadUnifiedStatus(row, {
      applicants,
      interviews,
      employees,
      invitedCandidates
    });
    return `<tr>
      <td><b>${esc(row.full_name)}</b></td>
      <td>${esc(row.position || '—')}</td>
      <td>${esc(row.whatsapp || '—')}</td>
      <td>${row.cv_path ? `<button class="icon-btn" data-stage1-cv="${esc(row.id)}">Open CV</button>` : '—'}</td>
      <td>
        <select class="select" style="min-width:170px" data-stage1-rec="${esc(row.id)}" aria-label="Recommendation remarks for ${esc(row.full_name)}">
          ${LEAD_RECOMMENDATION_OPTIONS.map(opt => `<option value="${esc(opt)}" ${rec === opt ? 'selected' : ''}>${esc(opt)}</option>`).join('')}
        </select>
      </td>
      <td data-stage1-status="${esc(row.id)}"><span class="status-pill ${unified.tone}">${esc(unified.label)}</span></td>
    </tr>`;
  }).join('');
}

function renderStage1() {
  const rows = stage1Leads;
  const paint = query => {
    const filtered = rows.filter(row => {
      const unified = resolveLeadUnifiedStatus(row, { applicants, interviews, employees, invitedCandidates });
      return `${row.full_name} ${row.position} ${row.whatsapp} ${row.recommendation || ''} ${unified.label}`.toLowerCase().includes(query);
    });
    $('#stage1-rows').innerHTML = stage1RowsHtml(filtered);
    bindStage1Actions(rows);
  };
  content.innerHTML = header('Lead Register', '', '<button class="btn btn-secondary" id="refresh-stage1">Refresh ↻</button>') +
    `<section class="panel table-panel">${tableToolbar('Search name / position / WhatsApp / status…', 'Lead Register')}
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>APPLICANT NAME</th><th>POSITION</th><th>WHATSAPP NO.</th><th>CV</th><th>REMARKS</th><th>STATUS</th></tr></thead>
        <tbody id="stage1-rows">${stage1RowsHtml(rows)}</tbody>
      </table></div></section>`;
  $('#refresh-stage1')?.addEventListener('click', () => loadView('stage1', true));
  bindSearch('#table-search', paint);
  bindStage1Actions(rows);
}

function bindStage1Actions(rows) {
  $$('[data-stage1-rec]').forEach(select => select.addEventListener('change', async () => {
    const id = select.dataset.stage1Rec;
    const value = normalizeLeadRecommendation(select.value);
    const legacyRec = value === 'Recommended' ? 'Direkomendasikan' : value === 'Not Recommended' ? 'Tidak Direkomendasikan' : 'Belum Ditentukan';
    const nextStatus = value === 'Recommended' ? 'invited' : value === 'Not Recommended' ? 'rejected' : 'reviewed';
    select.disabled = true;
    try {
      const payload = stage1HasRecommendationCol
        ? { recommendation: value, status: nextStatus, updated_at: new Date().toISOString() }
        : { status: nextStatus, updated_at: new Date().toISOString() };
      let { error } = await supabase.from('candidate_stage1_applications').update(payload).eq('id', id);
      if (error && stage1HasRecommendationCol && String(error.message || '').toLowerCase().includes('check')) {
        ({ error } = await supabase.from('candidate_stage1_applications').update({
          recommendation: legacyRec,
          status: nextStatus,
          updated_at: new Date().toISOString()
        }).eq('id', id));
      }
      if (error) throw error;
      const target = stage1Leads.find(item => item.id === id);
      if (target) {
        target.recommendation = value;
        target.status = nextStatus;
        const statusCell = $(`[data-stage1-status="${CSS.escape(id)}"]`);
        if (statusCell) {
          const unified = resolveLeadUnifiedStatus(target, { applicants, interviews, employees, invitedCandidates });
          statusCell.innerHTML = `<span class="status-pill ${unified.tone}">${esc(unified.label)}</span>`;
        }
      }
      invalidateDataCache();
      say(`Remarks updated: ${value}.`);
    } catch (err) {
      say(err.message || 'Failed to update remarks.');
    } finally {
      select.disabled = false;
    }
  }));

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

function stage2RowHtml(row, keys) {
  const data = row.application_data || {};
  const pos = row.position || data.posisi || '—';
  const progress = deriveCandidateProgress(row, getInterviewsForApplicant(row.id), getEmployeeForApplicant(row));
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
        const payload = buildDuplicateCandidatePayload(applicant, newPosition);
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

          const intPayloads = buildDuplicatedInterviewPayloads(getInterviewsForApplicant(applicant.id), inserted, currentUserId);
          if (intPayloads.length && !interviewsTableMissing) {
            let { error: intErr } = await supabase.from('candidate_interviews').insert(intPayloads);
            if (intErr && isMissingSchemaError(intErr) && String(intErr.message || '').toLowerCase().includes('interview_date')) {
              const stripped = intPayloads.map(({ interview_date: _d, ...rest }) => rest);
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
    const confirmed = window.confirm(`Delete candidate ${applicant.full_name} (NIK ${applicant.nik})?`);
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
  const allRows = applicants.filter(row => row.stage !== 'stage1_pending');
  const keys = stage2FieldKeys(allRows);
  const renderRows = rows => rows.length ? rows.map(row => stage2RowHtml(row, keys)).join('') : emptyRow(6 + keys.length, 'No candidate forms');
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
      <div class="table-wrap recruitment-data-scroll"><table class="data-table recruitment-wide-table"><thead><tr>${headerCells}</tr></thead><tbody id="candidate-rows">${renderRows(allRows)}</tbody></table></div></section>`;
  $('#refresh-stage2')?.addEventListener('click', () => loadView('stage2', true));
  const repaint = query => {
    const filtered = allRows.filter(row => `${row.full_name} ${row.nik} ${row.position} ${JSON.stringify(row.application_data || {})}`.toLowerCase().includes(query));
    $('#candidate-rows').innerHTML = renderRows(filtered);
    bindStage2DocumentActions();
    bindStage2CandidateActions();
  };
  bindSearch('#table-search', repaint);
  bindStage2DocumentActions();
  bindStage2CandidateActions();
}

function renderStage3() {
  const rows = applicants.filter(row => getDiscForApplicant(row) || row.stage === 'disc_completed' || row.stage === 'hired');
  content.innerHTML = header('DISC Assessment', '') +
    `<section class="panel table-panel">${tableToolbar('Search candidates…', 'DISC Assessment')}<div class="table-wrap recruitment-data-scroll"><table class="data-table recruitment-wide-table disc-assessment-table">
      <thead><tr><th>APPLICANT / NIK</th><th>POSITION</th><th>AGE</th><th>STATUS</th><th>DISC GRAPHS (G1 · G2 · G3)</th><th>PERSONALITY / NATURAL PATTERN</th><th>ACTIONS</th></tr></thead>
      <tbody id="candidate-rows">${applicantRows(rows, 'both')}</tbody></table></div></section>`;
  const repaint = query => {
    $('#candidate-rows').innerHTML = applicantRows(rows.filter(row => `${row.full_name} ${row.nik} ${row.position}`.toLowerCase().includes(query)), 'both');
    bindPrint();
  };
  bindSearch('#table-search', repaint);
  bindPrint();
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
  const allRows = buildInvitedCandidatesViewRows({ manualInvites: invitedCandidates, applicants });
  const respondedCount = allRows.filter(r => r.status === 'Responded').length;
  const noResponseCount = allRows.filter(r => r.status === 'No Response').length;
  const screeningSummary = aggregateCvScreeningBySource(cvScreenings);
  const linkedApplicantIds = new Set(invitedCandidates.map(i => i.linked_applicant_id).filter(Boolean));

  const migrationBanner = (invitedTableMissing || cvScreeningsTableMissing)
    ? `<div class="upload-preview-box" style="margin-bottom:14px;border-color:#fca5a5;background:#fef2f2;color:#991b1b">Supabase tables <code>invited_candidates</code> / <code>cv_screenings</code> are not created yet. Run <code>database/migrations/20261121_hrga_workspace_v3.sql</code> in Supabase SQL Editor.</div>`
    : '';

  const renderInviteRows = rows => rows.length
    ? rows.map(invitedCandidateRowHtml).join('')
    : emptyRow(6, 'No invited candidates recorded yet');

  const renderScreeningRows = items => items.length
    ? items.map(item => `<tr>
        <td><b>${esc(item.source)}</b>${item.notes ? `<small class="table-subline">${esc(item.notes)}</small>` : ''}</td>
        <td><span class="status-pill blue">${item.screeningCount}</span></td>
        <td><div class="row-actions">
          <button type="button" class="icon-btn" data-scr-edit="${esc(item.source)}">Edit</button>
          ${item.id ? `<button type="button" class="icon-btn danger" data-scr-delete="${esc(item.id)}">Delete</button>` : ''}
        </div></td>
      </tr>`).join('')
    : emptyRow(3, 'No CV screening counts added yet');

  content.innerHTML = header('Invited', '',
    '<button type="button" class="btn btn-secondary" id="refresh-invited">Refresh ↻</button>' +
    '<button type="button" class="btn btn-primary" id="add-invited-candidate">+ Add to List</button>'
  ) + migrationBanner + `
    <div class="invited-stack">
      <div class="invited-kpis">
        <article class="invited-kpi-card"><small>Total Recorded</small><b>${allRows.length}</b></article>
        <article class="invited-kpi-card"><small>Responded</small><b>${respondedCount}</b></article>
        <article class="invited-kpi-card"><small>No Response</small><b>${noResponseCount}</b></article>
      </div>

      <section class="panel table-panel">
        ${tableToolbar('Search date / name / position / source / status…', 'Invited Candidates')}
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>DATE</th><th>NAME</th><th>APPLIED POSITION</th><th>SOURCE</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
            <tbody id="invited-rows">${renderInviteRows(allRows)}</tbody>
          </table>
        </div>
      </section>

      <section class="panel table-panel cv-screening-panel">
        <div class="panel-head">
          <div><h3>CV Screening</h3><small class="subtle">Total Screened Across Sources: <b>${screeningSummary.totalCount}</b></small></div>
          <button type="button" class="btn btn-secondary btn-xs" id="add-cv-screening">+ Add Screening</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>SOURCE</th><th>SCREENING COUNT</th><th>ACTIONS</th></tr></thead>
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
      if (!window.confirm(`Delete invited record for ${target?.candidate_name || 'this candidate'}?`)) return;
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

  const openScreeningEditor = (existing = null) => {
    openCvScreeningModal({
      existing,
      onSave: async payload => {
        if (cvScreeningsTableMissing) {
          throw new Error('Run database/migrations/20261121_hrga_workspace_v3.sql in Supabase SQL Editor first.');
        }
        const recordPayload = {
          source: payload.source,
          screening_count: payload.screening_count,
          notes: payload.notes,
          updated_by: currentUserId,
          updated_at: new Date().toISOString()
        };
        if (payload.id) {
          const { error } = await supabase.from('cv_screenings').update(recordPayload).eq('id', payload.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('cv_screenings').upsert(recordPayload, { onConflict: 'source' });
          if (error) throw error;
        }
        invalidateDataCache();
        say(`CV screening count saved for ${payload.source}.`);
        await loadView('invited', true);
      }
    });
  };

  $$('[data-scr-edit]').forEach(btn => btn.addEventListener('click', () => {
    const item = screeningSummary.items.find(s => s.source === btn.dataset.scrEdit);
    if (item) openScreeningEditor(item);
  }));
  $$('[data-scr-delete]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.scrDelete;
    if (!window.confirm('Remove this CV screening source entry?')) return;
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

  bindSearch('#table-search', query => {
    const filtered = allRows.filter(r =>
      `${r.inviteDate} ${r.candidateName} ${r.appliedPosition} ${r.source} ${r.status} ${r.notes}`.toLowerCase().includes(query)
    );
    $('#invited-rows').innerHTML = renderInviteRows(filtered);
    bindInviteRowActions(filtered);
  });
  bindInviteRowActions(allRows);
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
        let extra = esc(row.notes || '—');
        if (isFinal) {
          if (dec === 'Rejected') {
            extra = `${esc(row.rejection_reason_category)}${row.rejection_reason_detail ? ` · ${esc(row.rejection_reason_detail)}` : ''}`;
          } else if (dec === 'Accepted') {
            const period = row.contract_start_date && row.contract_end_date
              ? `${formatDmyDash(row.contract_start_date)} to ${formatDmyDash(row.contract_end_date)}`
              : '—';
            extra = `${esc(row.official_position || row.applied_position)} · NIK ${esc(row.assigned_nik)} · ${period}`;
          }
        }
        return `<tr>
          <td><b>${esc(row.candidate_name)}</b><small class="table-subline">${esc(row.applied_position || '—')}</small></td>
          <td style="white-space:nowrap"><span class="interview-date-meta">${esc(dateLabel)}</span></td>
          <td>${esc(row.pic_name || '—')}</td>
          <td><span class="status-pill ${tone}">${esc(dec)}</span></td>
          <td style="max-width:210px;white-space:normal">${extra}</td>
          <td><button type="button" class="icon-btn" data-interview-edit="${esc(row.id)}">Edit</button></td>
        </tr>`;
      }).join('')
    : emptyRow(6, 'No candidates recorded');

  return `<section class="panel interview-stage-card ${isFinal ? 'is-final' : ''}">
    <div class="interview-stage-head">
      <div>
        <h3>${esc(INTERVIEW_STAGE_LABELS[stage])}</h3>
        <small>Latest 5 candidates${stage === 'HR 1' ? ' · Default PIC: Samsul Hariyadi (Employee Directory)' : stage === 'HR 2' ? ' · Default PIC: Diana Anita Sari (Employee Directory)' : ''}</small>
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
      onSave: async (payload, selectedCand) => {
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
          updated_at: new Date().toISOString()
        };

        const persistRecord = async body => {
          if (payload.id) {
            return supabase.from('candidate_interviews').update(body).eq('id', payload.id);
          }
          return supabase.from('candidate_interviews').insert({ ...body, created_by: currentUserId });
        };

        let { error } = await persistRecord(recordPayload);
        if (error && isMissingSchemaError(error) && String(error.message || '').toLowerCase().includes('interview_date')) {
          interviewDateColMissing = true;
          const { interview_date: _dropDate, ...fallbackBody } = recordPayload;
          ({ error } = await persistRecord(fallbackBody));
        }
        if (error) throw error;

        if (stage === 'Final Interview') {
          if (dec === 'Accepted') {
            const app = selectedCand?.applicantRef || applicants.find(a => a.id === payload.applicant_id);
            const appData = app?.application_data || {};
            const genderRaw = appData.gender || '';
            const genderNormalized = genderRaw === 'L' ? 'Laki-laki' : genderRaw === 'P' ? 'Perempuan' : genderRaw;
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
              notes: payload.notes || `Passed Final Interview (${payload.pic_name})`,
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
}

/* ============================================================================
 * RECRUITMENT TRACKING — 12 Structured English Columns
 * ============================================================================ */
function trackingStageCellHtml(cell) {
  if (!cell) return '<span class="status-pill gray">—</span>';
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
  const allRows = buildUnifiedTrackingRows({
    applicants,
    stage1Leads,
    interviews,
    employees,
    invitedCandidates
  }).map(r => ({
    ...r,
    searchText: `${r.name} ${r.sub} ${r.inviteSource} ${r.inviteStatus} ${r.decision} ${r.rejectionReason}`.toLowerCase()
  }));

  const renderRows = rows => rows.length
    ? rows.map(r => `<tr>
        <td><b>${esc(r.name)}</b><small class="table-subline">${esc(r.sub)}</small></td>
        <td><div class="tracking-stage-cell">
          <span class="status-pill ${r.inviteStatus === 'Responded' ? 'green' : r.inviteStatus === 'Lead Register' ? 'blue' : 'gray'}">${esc(r.inviteStatus)}</span>
          ${r.inviteDate ? `<small class="tracking-date-sub">${esc(formatDmyDash(r.inviteDate))}</small>` : ''}
        </div></td>
        <td>${r.formSubmittedDate
          ? `<div class="tracking-stage-cell"><span class="status-pill green">Submitted</span><small class="tracking-date-sub">${esc(formatDmyDash(r.formSubmittedDate))}</small></div>`
          : '<span class="status-pill gray">—</span>'}</td>
        <td>${r.hrTestDone
          ? `<div class="tracking-stage-cell"><span class="status-pill green">Completed</span>${r.hrTestDate ? `<small class="tracking-date-sub">${esc(formatDmyDash(r.hrTestDate))}</small>` : ''}</div>`
          : '<span class="status-pill gray">Pending</span>'}</td>
        <td>${trackingStageCellHtml(r.hr1)}</td>
        <td>${trackingStageCellHtml(r.hr2)}</td>
        <td>${trackingStageCellHtml(r.user1)}</td>
        <td>${trackingStageCellHtml(r.user2)}</td>
        <td>${trackingStageCellHtml(r.finalInt)}</td>
        <td>
          <span class="status-pill ${r.decisionTone}">${esc(r.decision)}</span>
          ${r.rejectionReason ? `<small class="tracking-reason-sub">${esc(r.rejectionReason)}</small>` : ''}
        </td>
        <td style="white-space:nowrap">${r.decisionDate ? `<span class="interview-date-meta">${esc(formatDmyDash(r.decisionDate))}</span>` : '—'}</td>
        <td style="white-space:nowrap">${r.joinDate ? `<span class="interview-date-meta">${esc(formatDmyDash(r.joinDate))}</span>` : '—'}</td>
      </tr>`).join('')
    : emptyRow(12, 'No candidate tracking records yet');

  content.innerHTML = header('Recruitment Tracking', '', '<button class="btn btn-secondary" id="refresh-tracking">Refresh ↻</button>') +
    `<section class="panel table-panel">${tableToolbar('Search name / position / status…', 'Recruitment Progress Tracking')}
      <div class="table-wrap recruitment-data-scroll">
        <table class="data-table">
          <thead><tr>
            <th>NAME</th><th>INVITE</th><th>FORM SUBMITTED</th><th>HR TEST</th>
            <th>HR INTERVIEW 1</th><th>HR INTERVIEW 2</th><th>USER INTERVIEW 1</th><th>USER INTERVIEW 2</th>
            <th>FINAL INTERVIEW</th><th>DECISION</th><th>DECISION DATE</th><th>JOIN DATE</th>
          </tr></thead>
          <tbody id="tracking-rows">${renderRows(allRows)}</tbody>
        </table>
      </div></section>`;

  $('#refresh-tracking')?.addEventListener('click', () => loadView('tracking', true));
  bindSearch('#table-search', query => {
    $('#tracking-rows').innerHTML = renderRows(allRows.filter(r => r.searchText.includes(query)));
  });
}

/* ============================================================================
 * EMPLOYEE DIRECTORY — 16 Columns + Upload XLSX/CSV
 * ============================================================================ */
function employeeRows(rows) {
  if (!rows.length) return emptyRow(17, 'No employee records found');
  return rows.map(employee => {
    const applicant = applicants.find(a => a.id === employee.applicant_id);
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
  content.innerHTML = header('Employee Directory', '',
    '<button id="add-employee" class="btn btn-secondary">+ Add Employee</button>' +
    '<button id="upload-employees" class="btn btn-secondary">Upload XLSX / CSV ↑</button>' +
    '<button id="export-employees" class="btn btn-primary">Download XLSX ↓</button>'
  ) + migrationWarn + `
    <section class="panel table-panel">${tableToolbar('Search name / NIK / department / position…', 'Employee Directory')}
      <div class="table-wrap recruitment-data-scroll">
        <table class="data-table">
          <thead><tr>${EMPLOYEE_UI_HEADERS.map(h => `<th>${esc(h.toUpperCase())}</th>`).join('')}<th>ACTIONS</th></tr></thead>
          <tbody id="employee-rows">${employeeRows(employees)}</tbody>
        </table>
      </div>
    </section>`;

  bindSearch('#table-search', query => {
    const filtered = employees.filter(e => {
      const a = applicants.find(x => x.id === e.applicant_id);
      const row = formatEmployeeExportRow(e, a);
      return Object.values(row).join(' ').toLowerCase().includes(query);
    });
    $('#employee-rows').innerHTML = employeeRows(filtered);
    bindEmployeeEdit();
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
  bindEmployeeEdit();
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
    const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
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
    const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
    const rowsData = employees.map(employee => {
      const applicant = applicants.find(a => a.id === employee.applicant_id);
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
      if (!window.confirm(`Remove user access for ${user?.display_name || username}?`)) return;
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
  return rows.map(applicant => {
    const progress = deriveCandidateProgress(applicant, getInterviewsForApplicant(applicant.id), getEmployeeForApplicant(applicant));
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
  content.innerHTML = header('Application Print', '') + `
    <section class="panel table-panel">${tableToolbar('Search candidates…', 'Application Print')}<div class="table-wrap"><table class="data-table">
      <thead><tr><th>APPLICANT</th><th>POSITION</th><th>STAGE</th><th>DOCUMENTS</th></tr></thead>
      <tbody id="candidate-rows">${renderPrintRows(applicants)}</tbody>
    </table></div></section>`;
  bindSearch('#table-search', query => {
    $('#candidate-rows').innerHTML = renderPrintRows(applicants.filter(a => `${a.full_name} ${a.nik} ${a.position}`.toLowerCase().includes(query)));
    bindPrint();
  });
  bindPrint();
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
      Promise.resolve().then(() => printApplication(record, { brand }))
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
      openPrintBrandModal(record, button);
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

  const dataViews = new Set(['dashboard', 'invited', 'stage1', 'stage2', 'stage3', 'interview', 'tracking', 'employees', 'print']);
  if (dataViews.has(view) && (!lastDataFetchedAt || forceRefresh)) {
    let hasCached = false;
    if (!forceRefresh) {
      const cached = await cacheGet('workspace_snapshot', { maxAgeMs: SNAPSHOT_MAX_AGE_MS });
      if (cached?.value && hydrateSnapshotIntoMemory(cached.value, cached.savedAt)) {
        hasCached = true;
      }
    }
    if (!hasCached) {
      content.innerHTML = '<section class="panel placeholder-panel"><div><div class="placeholder-symbol" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div><h2>Loading data…</h2></div></section>';
    }
  }

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
}

async function resolveAdminProfileFromServer(session) {
  const meta = session?.user?.user_metadata || {};
  let username = meta.username || '';
  let employeeNik = meta.employee_nik || '';
  let displayName = meta.display_name || '';
  let role = 'Superadmin';
  let isRootAdmin = false;

  const [rpcProfile, userRow] = await Promise.all([
    supabase.rpc('get_my_admin_profile').then(res => res, () => ({ data: null, error: true })),
    supabase.from('admin_users').select('display_name,role').eq('user_id', session.user.id).maybeSingle()
  ]);

  if (!rpcProfile.error && Array.isArray(rpcProfile.data) && rpcProfile.data[0]) {
    const p = rpcProfile.data[0];
    username = p.username || username;
    employeeNik = p.employee_nik || employeeNik;
    displayName = p.display_name || displayName;
    role = p.role || role;
    isRootAdmin = Boolean(p.is_root_admin);
  }
  if (!displayName && userRow?.data?.display_name) {
    displayName = userRow.data.display_name;
  }
  if (userRow?.data?.role && role === 'Superadmin') {
    role = userRow.data.role;
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
  currentAdminProfile = null;
  currentUserId = null;
  applicants = [];
  stage1Leads = [];
  employees = [];
  interviews = [];
  invitedCandidates = [];
  cvScreenings = [];
  portalUsers = [];
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
