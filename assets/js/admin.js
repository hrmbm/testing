import { supabase, isConfigured } from './supabase.js?v=20261120-hrga-workspace-10';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEMPLATE_URL, DEFAULT_MASTER_REVISION } from './config.js?v=20261120-hrga-workspace-10';
import { $, $$, esc, idDate } from './common.js?v=20261120-hrga-workspace-10';
import { printApplication } from './print.js?v=20261120-hrga-workspace-10';
import { computeDisc } from './disc-engine.js?v=20261120-hrga-workspace-10';
import { renderAdminEditorMarkup, bindAdminEditorForm, collectAdminEditorData } from './applicant.js?v=20261120-hrga-workspace-10';
import {
  EMPLOYEE_TABLE_HEADERS,
  INTERVIEW_STAGES,
  INTERVIEW_STAGE_LABELS,
  LEAD_RECOMMENDATION_OPTIONS,
  normalizeLoginIdentifier,
  validateLoginIdentifier,
  validatePin,
  buildDuplicateCandidatePayload,
  deriveCandidateProgress,
  getLatestInterviewsByStage,
  formatEmployeeExportRow,
  formatDmyDash,
  calculateContractDates,
  maskPin
} from './workspace-logic.js?v=20261120-hrga-workspace-10';
import {
  bindSafeModalClose,
  openDuplicateCandidateModal,
  openInterviewModal,
  openFullEmployeeModal,
  openEmployeeUploadModal,
  openUserModal,
  openPinRevealPrompt
} from './admin-modals.js?v=20261120-hrga-workspace-10';

const loginView = $('#login-view');
const shell = $('#admin-shell');
const content = $('#admin-content');
const sidebarEl = $('#workspace-sidebar');
const sidebarBackdrop = $('#sidebar-backdrop');

let applicants = [];
let stage1Leads = [];
let employees = [];
let interviews = [];
let portalUsers = [];
let interviewsTableMissing = false;
let stage1HasRecommendationCol = true;
let employeesExtendedMissing = false;
let lastDataFetchedAt = 0;

let activeView = 'dashboard';
let adminDisplayName = 'HR Admin';
let currentUserId = null;
let printTemplates = [];
let editingApplicantId = null;
let stage2PositionsCache = [];
let adminEditorBinding = null;
let defaultMasterSyncPromise = null;
let pendingPrintRecord = null;
let pendingPrintSourceButton = null;

const DATA_CACHE_TTL_MS = 45000;
const SIDEBAR_STATE_KEY = 'hrga_sidebar_collapse_v1';

const TITLES = {
  dashboard: 'Dashboard',
  stage1: 'Lead Register',
  filterSettings: 'Filter Settings',
  stage2: 'Candidate List',
  stage3: 'DISC Assessment',
  interview: 'Interview Pipeline',
  tracking: 'Recruitment Tracking',
  employees: 'Employee Directory',
  print: 'Application Print',
  settings: 'Recruitment Settings',
  userManagement: 'Manajemen User',
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

const stageLabel = {
  stage1_pending: 'Lead Register',
  application_submitted: 'Form Submitted',
  disc_completed: 'DISC Completed',
  stage4_pending: 'Proses Interview',
  os_sent: 'Kirim Ke OS',
  hired: 'Employee',
  rejected: 'Ditolak'
};
const stageClass = {
  stage1_pending: 'gray',
  application_submitted: 'blue',
  disc_completed: 'green',
  stage4_pending: 'gold',
  os_sent: 'gold',
  hired: 'green',
  rejected: 'gray'
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
}

function isMissingSchemaError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();
  return ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(code) ||
    msg.includes('does not exist') ||
    msg.includes('could not find the');
}

function statusPill(stage) {
  return `<span class="status-pill ${stageClass[stage] || 'gray'}">${esc(stageLabel[stage] || stage || '—')}</span>`;
}

function fmtAge(applicant) {
  return applicant?.application_data?.umur ? `${esc(applicant.application_data.umur)} th` : '—';
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
  nama: 'Nama lengkap', nik: 'NIK', posisi: 'Posisi dilamar', tempat_lahir: 'Tempat lahir', tanggal_lahir: 'Tanggal lahir',
  gender: 'Jenis kelamin', tinggi: 'Tinggi badan (cm)', berat: 'Berat badan (kg)', gol_darah: 'Golongan darah', agama: 'Agama',
  warga_negara: 'Kewarganegaraan', telepon: 'WhatsApp / telepon', email: 'Email', alamat_provinsi: 'Provinsi KTP',
  alamat_kota_nama: 'Kabupaten / kota KTP', alamat_kecamatan: 'Kecamatan KTP', alamat_desa: 'Desa / kelurahan KTP',
  alamat_tipe: 'Jenis alamat KTP', alamat_jalan: 'Jalan / dusun KTP', alamat_rt: 'RT', alamat_rw: 'RW', alamat_kodepos: 'Kode pos',
  domisili_berbeda: 'Alamat domisili berbeda', domisili: 'Alamat domisili', status_kawin: 'Status perkawinan', hobby: 'Hobi dan minat',
  ayah_nama: 'Nama ayah', ayah_umur: 'Umur ayah', ayah_pendidikan: 'Pendidikan ayah', ayah_pekerjaan: 'Pekerjaan ayah',
  ibu_nama: 'Nama ibu', ibu_umur: 'Umur ibu', ibu_pendidikan: 'Pendidikan ibu', ibu_pekerjaan: 'Pekerjaan ibu',
  saudara_count: 'Jumlah saudara kandung', anak_count: 'Jumlah anak', bahasa_count: 'Jumlah bahasa', kerja_count: 'Jumlah pengalaman kerja',
  pendidikan_terakhir: 'Pendidikan terakhir', mulai_kerja: 'Tanggal mulai bekerja', gaji_harapan: 'Gaji yang diharapkan',
  fasilitas_harapan: 'Fasilitas yang diharapkan', referensi1_nama: 'Nama kontak darurat', referensi1_alamat: 'Alamat kontak darurat',
  referensi1_telepon: 'Telepon kontak darurat', referensi1_pekerjaan: 'Pekerjaan kontak darurat', referensi1_hubungan: 'Hubungan kontak darurat',
  jawaban1: 'Pengetahuan tentang perusahaan', jawaban2: 'Deskripsi diri', jawaban3: 'Kontribusi untuk perusahaan',
  setuju: 'Pernyataan kebenaran data'
};

function applicationFieldLabel(key) {
  if (APPLICATION_FIELD_LABELS[key]) return APPLICATION_FIELD_LABELS[key];
  const repeat = String(key).match(/^(saudara|anak|bahasa|kerja)(\d+)_(.+)$/);
  if (repeat) {
    const [, group, index, field] = repeat;
    const groups = { saudara: 'Saudara kandung', anak: 'Anak', bahasa: 'Bahasa', kerja: 'Pengalaman kerja' };
    const labels = {
      nama: 'Nama', lp: 'Jenis kelamin', umur: 'Umur', pendidikan: 'Pendidikan', pekerjaan: 'Pekerjaan',
      bicara: 'Berbicara', baca: 'Membaca', tulis: 'Menulis', lainnya: 'Keterangan bahasa',
      perusahaan: 'Nama perusahaan', periode_mulai: 'Mulai', periode_selesai: 'Selesai',
      jabatan: 'Jabatan', usaha: 'Jenis usaha', jumlah: 'Jumlah karyawan', atasan: 'Nama atasan',
      gaji: 'Gaji terakhir', alasan: 'Alasan berhenti'
    };
    const number = group === 'saudara' ? Number(index) - 1 : Number(index);
    return `${groups[group]} ${number} · ${labels[field] || field.replace(/_/g, ' ')}`;
  }
  return String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function displayApplicationValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
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
  return `<div class="disc-mini-graph"><svg viewBox="0 0 252 104" role="img" aria-label="Grafik skor DISC untuk D, I, S, C"><line x1="15" y1="49" x2="237" y2="49" stroke="#cbd4e1" stroke-dasharray="3 4"/><line x1="15" y1="15" x2="237" y2="15" stroke="#edf0f5"/><line x1="15" y1="83" x2="237" y2="83" stroke="#edf0f5"/>${lines}${['D', 'I', 'S', 'C'].map((letter, index) => `<text x="${xs[index]}" y="99" text-anchor="middle">${letter}</text>`).join('')}</svg><div class="disc-graph-legend"><span><i class="g1"></i>G1</span><span><i class="g2"></i>G2</span><span><i class="g3"></i>G3</span></div></div>`;
}

function applicantRows(rows, action = 'print') {
  if (!rows.length) return emptyRow(action === 'both' ? 7 : 5);
  return rows.map(applicant => {
    const employee = getEmployeeForApplicant(applicant);
    const disc = getDiscForApplicant(applicant);
    const progress = deriveCandidateProgress(applicant, getInterviewsForApplicant(applicant.id), employee);
    let graph = '<span class="status-pill gray">Belum ada grafik</span>';
    let personality = '—';
    if (disc?.answers) {
      try {
        const result = computeDisc(disc.answers);
        const natural = result.pola[2];
        graph = discGraphSvg(result);
        personality = `<b>${esc(natural.title)}</b><small class="table-subline">${esc(natural.nama)} · Dominan ${esc(result.hurufDominan)}</small>`;
      } catch {
        graph = '<span class="status-pill gray">Hasil perlu diperiksa</span>';
        personality = 'Perlu diperiksa';
      }
    }
    return `<tr><td><b class="cell-clamp-2" title="${esc(applicant.full_name)}">${esc(applicant.full_name)}</b><small class="table-subline">${esc(applicant.nik)}</small></td>
      <td><div class="cell-clamp-2" title="${esc(applicant.position || '—')}">${esc(applicant.position || '—')}</div></td><td>${fmtAge(applicant)}</td>
      <td><span class="status-pill ${progress.tone}">${esc(progress.label)}</span></td>
      ${action === 'both' ? `<td>${graph}</td><td>${personality}</td>` : ''}
      <td><div class="row-actions">${action === 'both' && !employee ? `<button class="icon-btn" data-hire="${esc(applicant.id)}">Jadikan karyawan</button>` : ''}
      <button class="icon-btn" data-print="${esc(applicant.id)}">Cetak</button></div></td></tr>`;
  }).join('');
}

function bindSearch(selector, rerender) {
  const input = $(selector);
  if (!input) return;
  input.addEventListener('input', () => rerender(input.value.trim().toLocaleLowerCase('id')));
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
    recommendation: item.recommendation || (
      item.status === 'invited' ? 'Direkomendasikan'
        : item.status === 'rejected' ? 'Tidak Direkomendasikan'
          : 'Belum Ditentukan'
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

async function refreshData(force = false) {
  if (!force && lastDataFetchedAt && (Date.now() - lastDataFetchedAt) < DATA_CACHE_TTL_MS) {
    return;
  }
  const [candidateResult, empRows, leadRows, intRows] = await Promise.all([
    supabase.from('applicants')
      .select('id,full_name,nik,position,stage,application_data,cv_path,ktp_path,created_at,disc_submissions(id,answers,completed_at),employees(id)')
      .order('created_at', { ascending: false }).limit(1000),
    fetchEmployeesSafe(),
    fetchStage1Safe(),
    fetchInterviewsSafe()
  ]);
  if (candidateResult.error) throw candidateResult.error;
  // Strip embedded base64 ktp_foto from memory so filtering & table renders stay fast
  applicants = (candidateResult.data || []).map(row => {
    if (row.application_data && row.application_data.ktp_foto) {
      const copy = { ...row.application_data };
      delete copy.ktp_foto;
      return { ...row, application_data: copy };
    }
    return row;
  });
  employees = empRows;
  stage1Leads = leadRows;
  interviews = intRows;
  lastDataFetchedAt = Date.now();
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
    <section class="dashboard-atelier-hero" aria-label="Ringkasan ruang kerja">
      <img class="atelier-hero-img" src="assets/img/interior-atelier-banner.jpg" alt="Showroom dan studio interior PT. Mitra Binamandiri Makmur">
      <div class="atelier-hero-scrim" aria-hidden="true"></div>
      <div class="atelier-hero-content">
        <p class="atelier-hero-kicker">PT. Mitra Binamandiri Makmur</p>
        <h1 class="atelier-hero-title">Selamat datang, ${esc(adminDisplayName)}</h1>
        <div class="atelier-hero-meta">
          <span><b>${total}</b> kandidat tercatat</span>
          <span aria-hidden="true">·</span>
          <span><b>${submitted}</b> formulir masuk</span>
          <span aria-hidden="true">·</span>
          <span><b>${hired}</b> karyawan aktif</span>
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
        <span class="workspace-module-copy"><b>Employee Directory</b><span>Data &amp; Upload Karyawan</span></span>
        <span class="workspace-module-arrow" aria-hidden="true">↗</span>
      </button>
    </section>
    <section class="dashboard-metrics" aria-label="Recruitment metrics">
      <article class="stat-card"><div class="stat-top"><span>Lead Register</span><span class="stat-icon-tile" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></span></div><div class="stat-number">${stage1}</div><div class="stat-note">Pelamar awal masuk</div></article>
      <article class="stat-card"><div class="stat-top"><span>Forms Submitted</span><span class="stat-icon-tile walnut" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span></div><div class="stat-number">${submitted}</div><div class="stat-note">Formulir Tahap 2</div></article>
      <article class="stat-card"><div class="stat-top"><span>DISC Completed</span><span class="stat-icon-tile" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></span></div><div class="stat-number">${discDone}</div><div class="stat-note">Asesmen DISC selesai</div></article>
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
 * LEAD REGISTER (stage1) — Hanya 5 kolom:
 * Nama Pelamar | Posisi | No. Whatsapp | CV | Keterangan
 * ============================================================================ */
function stage1RowsHtml(rows) {
  if (!rows.length) return emptyRow(5, 'Belum ada data pelamar');
  return rows.map(row => {
    const rec = row.recommendation || 'Belum Ditentukan';
    return `<tr>
      <td><b>${esc(row.full_name)}</b></td>
      <td>${esc(row.position || '—')}</td>
      <td>${esc(row.whatsapp || '—')}</td>
      <td>${row.cv_path ? `<button class="icon-btn" data-stage1-cv="${esc(row.id)}">Buka CV</button>` : '—'}</td>
      <td>
        <select class="select" style="min-width:190px" data-stage1-rec="${esc(row.id)}" aria-label="Keterangan rekomendasi ${esc(row.full_name)}">
          ${LEAD_RECOMMENDATION_OPTIONS.map(opt => `<option value="${esc(opt)}" ${rec === opt ? 'selected' : ''}>${esc(opt)}</option>`).join('')}
        </select>
      </td>
    </tr>`;
  }).join('');
}

function renderStage1() {
  const rows = stage1Leads;
  const paint = query => {
    const filtered = rows.filter(row => `${row.full_name} ${row.position} ${row.whatsapp} ${row.recommendation || ''}`.toLocaleLowerCase('id').includes(query));
    $('#stage1-rows').innerHTML = stage1RowsHtml(filtered);
    bindStage1Actions(rows);
  };
  content.innerHTML = header('Lead Register', '', '<button class="btn btn-secondary" id="refresh-stage1">Refresh ↻</button>') +
    `<section class="panel table-panel">${tableToolbar('Cari nama / posisi / WhatsApp / keterangan…', 'Lead Register')}
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>NAMA PELAMAR</th><th>POSISI</th><th>NO. WHATSAPP</th><th>CV</th><th>KETERANGAN</th></tr></thead>
        <tbody id="stage1-rows">${stage1RowsHtml(rows)}</tbody>
      </table></div></section>`;
  $('#refresh-stage1')?.addEventListener('click', () => loadView('stage1', true));
  bindSearch('#table-search', paint);
  bindStage1Actions(rows);
}

function bindStage1Actions(rows) {
  $$('[data-stage1-rec]').forEach(select => select.addEventListener('change', async () => {
    const id = select.dataset.stage1Rec;
    const value = select.value;
    select.disabled = true;
    try {
      const payload = stage1HasRecommendationCol
        ? {
            recommendation: value,
            status: value === 'Direkomendasikan' ? 'invited' : value === 'Tidak Direkomendasikan' ? 'rejected' : 'reviewed',
            updated_at: new Date().toISOString()
          }
        : {
            status: value === 'Direkomendasikan' ? 'invited' : value === 'Tidak Direkomendasikan' ? 'rejected' : 'reviewed',
            updated_at: new Date().toISOString()
          };
      const { error } = await supabase.from('candidate_stage1_applications').update(payload).eq('id', id);
      if (error) throw error;
      const target = stage1Leads.find(item => item.id === id);
      if (target) {
        target.recommendation = value;
        target.status = payload.status;
      }
      say(`Keterangan disimpan: ${value}.`);
    } catch (err) {
      say(err.message || 'Gagal memperbarui keterangan.');
    } finally {
      select.disabled = false;
    }
  }));

  $$('[data-stage1-cv]').forEach(button => button.addEventListener('click', () => {
    const record = rows.find(item => item.id === button.dataset.stage1Cv);
    if (!record?.cv_path) { say('Path CV tidak ditemukan.'); return; }
    openSignedDocumentInNewTab('candidate-stage1-cv', record.cv_path, 'CV', button);
  }));
}

async function renderSettings() {
  const { data, error } = await supabase.from('portal_settings').select('value').eq('key', 'ktp_ocr_enabled').maybeSingle();
  if (error) throw error;
  const enabled = data?.value === true;
  content.innerHTML = `<section class="panel settings-panel">
    <div class="settings-row">
      <div>
        <h3 class="settings-title">ID Card Scanning (OCR)</h3>
        <p class="settings-sub">Aktifkan pemindaian KTP otomatis untuk formulir kandidat Tahap 2.</p>
      </div>
      <label class="settings-toggle" for="ocr-feature-toggle">
        <span>${enabled ? 'Enabled' : 'Disabled'}</span>
        <input id="ocr-feature-toggle" type="checkbox" ${enabled ? 'checked' : ''}>
      </label>
    </div>
  </section>`;
  $('#ocr-feature-toggle').addEventListener('change', async event => {
    const value = event.target.checked;
    const { error: upsertErr } = await supabase.from('portal_settings')
      .upsert({ key: 'ktp_ocr_enabled', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (upsertErr) { event.target.checked = !value; say(upsertErr.message); }
    else { say(value ? 'OCR enabled.' : 'OCR disabled.'); loadView('settings'); }
  });
}

/* ============================================================================
 * CANDIDATE LIST (stage2) — Tanpa Background Check, Form Status dinamis,
 * Actions: Edit, Delete, Duplikasi
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
    return applicationFieldLabel(a).localeCompare(applicationFieldLabel(b), 'id', { numeric: true, sensitivity: 'base' });
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
    <td>${row.ktp_path ? `<button class="icon-btn" data-stage2-ktp="${esc(row.id)}">Buka KTP</button>` : '—'}</td>
    <td>${row.cv_path ? `<button class="icon-btn" data-stage2-cv="${esc(row.id)}">Buka CV</button>` : '—'}</td>
    <td><span class="status-pill ${progress.tone}">${esc(progress.label)}</span></td>
    <td><div class="row-actions stage2-actions">
      <button class="icon-btn" data-stage2-edit="${esc(row.id)}">Edit</button>
      <button class="icon-btn" data-stage2-dup="${esc(row.id)}">Duplikasi</button>
      <button class="icon-btn danger" data-stage2-delete="${esc(row.id)}">Delete</button>
    </div></td></tr>`;
}

function openSignedDocumentInNewTab(bucket, path, label, button) {
  const tab = window.open('about:blank', '_blank');
  if (!tab) { say('Tab dokumen diblokir browser. Izinkan pop-up lalu coba lagi.'); return; }
  try {
    tab.opener = null;
    tab.document.title = `Menyiapkan ${label}`;
    tab.document.body.innerHTML = `<p style="font:14px Arial,sans-serif;padding:24px;color:#243238">Menyiapkan dokumen…</p>`;
  } catch {}
  const original = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Membuka…'; }
  supabase.storage.from(bucket).createSignedUrl(path, 300).then(({ data, error }) => {
    if (error) throw error;
    if (!data?.signedUrl) throw new Error(`Tautan ${label} tidak berhasil dibuat.`);
    tab.location.replace(data.signedUrl);
  }).catch(error => {
    try { tab.close(); } catch {}
    say(error.message || `${label} tidak dapat dibuka.`);
  }).finally(() => {
    if (button) { button.disabled = false; button.textContent = original || `Buka ${label}`; }
  });
}

function bindStage2DocumentActions() {
  const bind = (selector, bucket, pathKey, label, datasetKey) => {
    $$(selector).forEach(button => button.addEventListener('click', () => {
      const record = applicants.find(item => item.id === button.dataset[datasetKey]);
      if (!record?.[pathKey]) { say(`Path ${label} tidak ditemukan.`); return; }
      openSignedDocumentInNewTab(bucket, record[pathKey], label, button);
    }));
  };
  bind('[data-stage2-ktp]', 'candidate-identity', 'ktp_path', 'KTP', 'stage2Ktp');
  bind('[data-stage2-cv]', 'candidate-files', 'cv_path', 'CV', 'stage2Cv');
}

async function loadPositionList() {
  if (stage2PositionsCache.length) return stage2PositionsCache;
  const { data, error } = await supabase.from('portal_settings').select('value').eq('key', 'application_positions').maybeSingle();
  if (error) throw error;
  const values = Array.isArray(data?.value) ? data.value : [];
  stage2PositionsCache = [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
  return stage2PositionsCache;
}

async function savePositionList(positions) {
  const clean = [...new Set(positions.map(value => String(value || '').trim()).filter(Boolean))];
  if (!clean.length) throw new Error('Daftar posisi tidak boleh kosong.');
  if (clean.length !== positions.length) throw new Error('Nama posisi kosong atau duplikat.');
  const { error } = await supabase.from('portal_settings')
    .upsert({ key: 'application_positions', value: clean, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
  stage2PositionsCache = clean;
}

function positionManagerHtml(positions) {
  return `<section class="panel position-manager"><div class="panel-head"><div><h3>Daftar Lowongan</h3><p>Perubahan digunakan oleh pilihan posisi di /form dan /apply.</p></div></div>
    <div class="position-manager-body"><div id="position-rows">${positions.map((position, index) => `<div class="position-row"><input class="input" maxlength="100" data-position-index="${index}" value="${esc(position)}" aria-label="Nama posisi ${index + 1}"><button type="button" class="icon-btn" data-position-delete="${index}" ${positions.length === 1 ? 'disabled' : ''}>Delete</button></div>`).join('')}</div>
    <div class="position-add-row"><input class="input" id="new-position" maxlength="100" placeholder="Nama posisi baru"><button type="button" class="btn btn-secondary" id="add-position">Tambah posisi</button></div>
    <div class="position-manager-foot"><small>Nama posisi akan menjadi pilihan resmi kandidat.</small><button type="button" class="btn btn-primary" id="save-positions">Simpan daftar posisi</button></div></div></section>`;
}

function bindPositionManager(positions) {
  $('#add-position')?.addEventListener('click', async () => {
    const value = $('#new-position')?.value.trim() || '';
    if (!value) { say('Isi nama posisi terlebih dahulu.'); return; }
    if (positions.some(item => item.toLocaleLowerCase('id') === value.toLocaleLowerCase('id'))) { say('Nama posisi sudah ada.'); return; }
    try { await savePositionList([...positions, value]); say('Posisi baru ditambahkan.'); loadView('stage2'); }
    catch (error) { say(error.message || 'Posisi gagal ditambahkan.'); }
  });
  $$('[data-position-delete]').forEach(button => button.addEventListener('click', async () => {
    const index = Number(button.dataset.positionDelete);
    const next = positions.filter((_, i) => i !== index);
    try { await savePositionList(next); say('Posisi dihapus dari daftar kandidat.'); loadView('stage2'); }
    catch (error) { say(error.message || 'Posisi gagal dihapus.'); }
  }));
  $('#save-positions')?.addEventListener('click', async () => {
    const values = $$('[data-position-index]').map(input => input.value.trim());
    if (values.some(value => !value)) { say('Nama posisi tidak boleh kosong.'); return; }
    if (new Set(values.map(value => value.toLocaleLowerCase('id'))).size !== values.length) { say('Nama posisi tidak boleh duplikat.'); return; }
    try { await savePositionList(values); say('Daftar posisi diperbarui.'); loadView('stage2'); }
    catch (error) { say(error.message || 'Daftar posisi gagal disimpan.'); }
  });
}

function candidateEditModal() {
  let modal = $('#candidate-edit-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'candidate-edit-modal';
  modal.className = 'modal-backdrop hidden';
  modal.innerHTML = `<section class="employee-modal-card candidate-edit-card" role="dialog" aria-modal="true" aria-labelledby="candidate-edit-title">
    <div class="employee-modal-head candidate-edit-head"><div><small>RECRUITMENT · CANDIDATE REVIEW</small><h2 id="candidate-edit-title">Edit Candidate</h2><p id="candidate-edit-summary"></p></div><button type="button" class="modal-close" id="candidate-edit-close" aria-label="Tutup">×</button></div>
    <div id="candidate-edit-form-slot" class="candidate-edit-form-slot"></div>
    <div id="candidate-edit-error" class="form-error candidate-edit-error" role="alert"></div>
    <div class="employee-modal-actions candidate-edit-footer"><button type="button" class="btn btn-secondary" id="candidate-edit-cancel">Batal</button><button type="button" class="btn btn-primary" id="candidate-edit-save">Simpan perubahan</button></div>
  </section>`;
  document.body.append(modal);
  const close = () => { modal.classList.add('hidden'); editingApplicantId = null; adminEditorBinding = null; };
  $('#candidate-edit-close', modal).addEventListener('click', close);
  $('#candidate-edit-cancel', modal).addEventListener('click', close);
  // Prevent closing modal when user blocks/highlights text and releases mouse outside card
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
  $('#candidate-edit-title', modal).textContent = `Koreksi · ${applicant.full_name || 'Tanpa nama'}`;
  $('#candidate-edit-summary', modal).textContent = `${values.nik} · ${values.posisi} · Lima bagian mengikuti formulir kandidat`;
  $('#candidate-edit-error', modal).textContent = '';
  $('#candidate-edit-form-slot', modal).innerHTML = renderAdminEditorMarkup(values, stage2PositionsCache);
  modal.classList.remove('hidden');

  const form = $('#admin-candidate-form', modal);
  $$('[data-admin-document]', modal).forEach(button => button.addEventListener('click', () => {
    const current = applicants.find(item => item.id === editingApplicantId);
    if (!current) return;
    const isKtp = button.dataset.adminDocument === 'ktp';
    const path = isKtp ? current.ktp_path : current.cv_path;
    if (!path) { say(`${isKtp ? 'Foto KTP' : 'CV'} tidak tersedia.`); return; }
    openSignedDocumentInNewTab(isKtp ? 'candidate-identity' : 'candidate-files', path, isKtp ? 'KTP' : 'CV', button);
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
    errorBox.textContent = 'Form koreksi belum siap. Tutup lalu buka kembali data kandidat.';
    return;
  }
  const fullName = String(form.elements.namedItem('nama')?.value || '').trim();
  const nik = String(form.elements.namedItem('nik')?.value || '').replace(/\D/g, '');
  const position = String(form.elements.namedItem('posisi')?.value || '').trim();
  if (fullName.length < 2) { errorBox.textContent = 'Nama lengkap minimal 2 karakter.'; adminEditorBinding.goToStep(0); form.elements.namedItem('nama')?.focus(); return; }
  if (!/^\d{16}$/.test(nik)) { errorBox.textContent = 'NIK harus tepat 16 angka.'; adminEditorBinding.goToStep(0); form.elements.namedItem('nik')?.focus(); return; }
  if (!position) { errorBox.textContent = 'Posisi dilamar wajib dipilih.'; adminEditorBinding.goToStep(0); form.elements.namedItem('posisi')?.focus(); return; }
  if (applicants.some(item => item.id !== applicant.id && item.nik === nik && String(item.position || '').toLocaleLowerCase('id') === position.toLocaleLowerCase('id'))) {
    errorBox.textContent = 'NIK dan posisi yang sama sudah terdaftar.';
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
  save.textContent = 'Menyimpan…';
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
    say(`Data ${fullName} berhasil diperbarui.`);
    modal.classList.add('hidden');
    editingApplicantId = null;
    adminEditorBinding = null;
    await loadView('stage2', true);
  } catch (saveError) {
    errorBox.textContent = saveError.message || 'Data kandidat gagal disimpan.';
  } finally {
    save.disabled = false;
    save.textContent = 'Simpan perubahan';
  }
}

function bindStage2CandidateActions() {
  $$('[data-stage2-edit]').forEach(button => button.addEventListener('click', () => {
    const applicant = applicants.find(item => item.id === button.dataset.stage2Edit);
    if (applicant) openStage2CandidateEditor(applicant).catch(error => say(error.message || 'Form koreksi gagal dibuka.'));
  }));

  $$('[data-stage2-dup]').forEach(button => button.addEventListener('click', () => {
    const applicant = applicants.find(item => item.id === button.dataset.stage2Dup);
    if (!applicant) return;
    openDuplicateCandidateModal({
      applicant,
      positions: stage2PositionsCache,
      onSave: async newPosition => {
        const payload = buildDuplicateCandidatePayload(applicant, newPosition);
        let { error } = await supabase.from('applicants').insert(payload);
        if (error && isMissingSchemaError(error)) {
          const { duplicated_from: _drop, ...fallbackPayload } = payload;
          ({ error } = await supabase.from('applicants').insert(fallbackPayload));
        }
        if (error) {
          if (String(error.message || '').includes('applicants_nik_unique')) {
            throw new Error('Database masih membatasi 1 NIK = 1 posisi. Jalankan file migrasi SQL v2 pada Supabase SQL Editor terlebih dahulu.');
          }
          throw error;
        }
        invalidateDataCache();
        say(`${applicant.full_name} berhasil diduplikasi ke posisi ${newPosition}.`);
        await loadView('stage2', true);
      }
    });
  }));

  $$('[data-stage2-delete]').forEach(button => button.addEventListener('click', async () => {
    const applicant = applicants.find(item => item.id === button.dataset.stage2Delete);
    if (!applicant) return;
    if (employees.some(employee => employee.applicant_id === applicant.id)) {
      say('Kandidat sudah terhubung dengan Employee Directory. Kelola data karyawan terlebih dahulu.');
      return;
    }
    const confirmed = window.confirm(`Hapus kandidat ${applicant.full_name} (NIK ${applicant.nik})?`);
    if (!confirmed) return;
    button.disabled = true;
    button.textContent = 'Menghapus…';
    try {
      const { error } = await supabase.from('applicants').delete().eq('id', applicant.id);
      if (error) throw error;
      invalidateDataCache();
      applicants = applicants.filter(item => item.id !== applicant.id);
      say(`Kandidat ${applicant.full_name} berhasil dihapus.`);
      await loadView('stage2', true);
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Delete';
      say(error.message || 'Kandidat gagal dihapus.');
    }
  }));
}

async function renderStage2() {
  const allRows = applicants.filter(row => row.stage !== 'stage1_pending');
  const positions = await loadPositionList();
  const keys = stage2FieldKeys(allRows);
  const renderRows = rows => rows.length ? rows.map(row => stage2RowHtml(row, keys)).join('') : emptyRow(6 + keys.length, 'No candidate forms');
  const headerCells = [
    '<th>APPLICANT</th>',
    '<th>POSITION</th>',
    ...keys.map(key => {
      const cls = stage2CellClass(key);
      return `<th${cls ? ` class="${cls}"` : ''}>${esc(applicationFieldLabel(key).toLocaleUpperCase('id'))}</th>`;
    }),
    '<th>ID CARD</th>', '<th>CV</th>', '<th>FORM STATUS</th>', '<th>ACTIONS</th>'
  ].join('');
  content.innerHTML = header('Candidate List', '', '<button class="btn btn-secondary" id="refresh-stage2">Refresh ↻</button>') +
    `<section class="panel table-panel stage2-candidate-panel">${tableToolbar('Search name / NIK / position…', 'Candidate List')}
      <div class="table-wrap recruitment-data-scroll"><table class="data-table recruitment-wide-table"><thead><tr>${headerCells}</tr></thead><tbody id="candidate-rows">${renderRows(allRows)}</tbody></table></div></section>` +
    positionManagerHtml(positions);
  bindPositionManager(positions);
  $('#refresh-stage2')?.addEventListener('click', () => loadView('stage2', true));
  const repaint = query => {
    const filtered = allRows.filter(row => `${row.full_name} ${row.nik} ${row.position} ${JSON.stringify(row.application_data || {})}`.toLocaleLowerCase('id').includes(query));
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
    $('#candidate-rows').innerHTML = applicantRows(rows.filter(row => `${row.full_name} ${row.nik} ${row.position}`.toLocaleLowerCase('id').includes(query)), 'both');
    bindPrint();
    bindHire();
  };
  bindSearch('#table-search', repaint);
  bindPrint();
  bindHire();
}

/* ============================================================================
 * INTERVIEW PIPELINE (HR 1, HR 2, User 1, User 2, Final Interview)
 * 1 halaman ringkas dengan scroll, maksimal 5 kandidat terbaru per tahap
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
        const tone = row.decision === 'Direkomendasikan' || row.decision === 'Diterima'
          ? 'green'
          : row.decision === 'Tidak Direkomendasikan' || row.decision === 'Ditolak'
            ? 'gray'
            : 'gold';
        let extra = esc(row.notes || '—');
        if (isFinal) {
          if (row.decision === 'Ditolak') {
            extra = `${esc(row.rejection_reason_category)}${row.rejection_reason_detail ? ` · ${esc(row.rejection_reason_detail)}` : ''}`;
          } else if (row.decision === 'Diterima') {
            const period = row.contract_start_date && row.contract_end_date
              ? `${formatDmyDash(row.contract_start_date)} s/d ${formatDmyDash(row.contract_end_date)}`
              : '—';
            extra = `${esc(row.official_position || row.applied_position)} · NIK ${esc(row.assigned_nik)} · ${period}`;
          }
        }
        return `<tr>
          <td><b>${esc(row.candidate_name)}</b><small class="table-subline">${esc(row.applied_position || '—')}</small></td>
          <td>${esc(row.pic_name || '—')}</td>
          <td><span class="status-pill ${tone}">${esc(row.decision)}</span></td>
          <td style="max-width:220px;white-space:normal">${extra}</td>
          <td><button type="button" class="icon-btn" data-interview-edit="${esc(row.id)}">Edit</button></td>
        </tr>`;
      }).join('')
    : emptyRow(5, 'Belum ada kandidat');

  return `<section class="panel interview-stage-card ${isFinal ? 'is-final' : ''}">
    <div class="interview-stage-head">
      <div>
        <h3>${esc(INTERVIEW_STAGE_LABELS[stage])}</h3>
        <small>Maksimal 5 kandidat terbaru${stage === 'HR 1' ? ' · Default PIC: Samsul Haiyadi' : stage === 'HR 2' ? ' · Default PIC: Diana Anita Sari' : ''}</small>
      </div>
      <button type="button" class="btn btn-primary btn-xs" data-interview-add="${esc(stage)}">+ Tambah Kandidat</button>
    </div>
    <div class="interview-stage-scroll">
      <table class="data-table interview-mini-table">
        <thead><tr><th>KANDIDAT</th><th>PIC</th><th>KEPUTUSAN</th><th>KETERANGAN</th><th>AKSI</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  </section>`;
}

function renderInterviewView() {
  const banner = interviewsTableMissing
    ? `<div class="upload-preview-box" style="margin-bottom:14px;border-color:#fca5a5;background:#fef2f2;color:#991b1b">Tabel <code>candidate_interviews</code> belum tersedia di Supabase. Jalankan file migrasi <code>database/migrations/20261120_hrga_workspace_v2.sql</code> di Supabase SQL Editor agar seluruh proses interview tersimpan.</div>`
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
          throw new Error('Jalankan file migrasi SQL v2 di Supabase SQL Editor terlebih dahulu.');
        }
        const recordPayload = {
          source_type: payload.source_type,
          applicant_id: payload.applicant_id,
          stage1_id: payload.stage1_id,
          candidate_name: payload.candidate_name,
          candidate_nik: payload.candidate_nik,
          candidate_whatsapp: payload.candidate_whatsapp,
          applied_position: payload.applied_position,
          interview_stage: payload.interview_stage,
          pic_employee_id: payload.pic_employee_id || null,
          pic_nik: payload.pic_nik,
          pic_name: payload.pic_name,
          notes: payload.notes,
          decision: payload.decision,
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

        if (payload.id) {
          const { error } = await supabase.from('candidate_interviews').update(recordPayload).eq('id', payload.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('candidate_interviews').insert({
            ...recordPayload,
            created_by: currentUserId
          });
          if (error) throw error;
        }

        // Sync Final Interview decisions with Applicants & Employee Directory
        if (stage === 'Final Interview') {
          if (payload.decision === 'Diterima') {
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
              notes: payload.notes || `Lulus Final Interview (${payload.pic_name})`,
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
            say(`${payload.candidate_name} diterima & otomatis masuk ke Employee Directory!`);
          } else if (payload.decision === 'Ditolak' && payload.applicant_id) {
            await supabase.from('applicants')
              .update({ stage: 'rejected', updated_at: new Date().toISOString() })
              .eq('id', payload.applicant_id);
            say(`Keputusan Final Interview (${payload.candidate_name}: Ditolak) disimpan.`);
          } else if (payload.decision === 'Kirim Ke OS' && payload.applicant_id) {
            const { error: osErr } = await supabase.from('applicants')
              .update({ stage: 'os_sent', updated_at: new Date().toISOString() })
              .eq('id', payload.applicant_id);
            if (osErr) {
              await supabase.from('applicants')
                .update({ stage: 'stage4_pending', updated_at: new Date().toISOString() })
                .eq('id', payload.applicant_id);
            }
            say(`${payload.candidate_name} ditandai Kirim Ke OS.`);
          } else {
            say('Hasil Final Interview disimpan.');
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
          say(`Data ${INTERVIEW_STAGE_LABELS[stage]} disimpan.`);
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
 * TRACKING VIEW — Rapi & terstruktur dari Lead Register -> Final / Karyawan
 * ============================================================================ */
function buildTrackingEntries() {
  const rows = [];
  for (const a of applicants) {
    const ints = getInterviewsForApplicant(a.id);
    const byStage = getLatestInterviewsByStage(ints);
    const emp = getEmployeeForApplicant(a);
    const progress = deriveCandidateProgress(a, ints, emp);
    const hasDisc = Boolean(getDiscForApplicant(a) || a.stage === 'disc_completed');
    rows.push({
      name: a.full_name,
      sub: a.nik || '—',
      position: a.position || '—',
      leadStatus: 'Terdaftar',
      formStatus: 'Selesai',
      discStatus: hasDisc ? 'Selesai' : 'Menunggu',
      byStage,
      finalProgress: progress,
      searchText: `${a.full_name} ${a.nik} ${a.position} ${progress.label}`.toLocaleLowerCase('id')
    });
  }
  for (const s of stage1Leads) {
    const ints = interviews.filter(i => i.stage1_id === s.id);
    if (!ints.length && applicants.some(a => a.full_name?.toLowerCase() === s.full_name?.toLowerCase())) continue;
    const byStage = getLatestInterviewsByStage(ints);
    const progress = deriveCandidateProgress({ stage: 'stage1_pending' }, ints, null);
    rows.push({
      name: s.full_name,
      sub: s.whatsapp || 'Lead Register',
      position: s.position || '—',
      leadStatus: s.recommendation || 'Masuk',
      formStatus: 'Belum',
      discStatus: 'Belum',
      byStage,
      finalProgress: progress,
      searchText: `${s.full_name} ${s.whatsapp} ${s.position} ${s.recommendation || ''} ${progress.label}`.toLocaleLowerCase('id')
    });
  }
  return rows;
}

function trackingStageBadge(item) {
  if (!item) return '<span class="status-pill gray">—</span>';
  const tone = ['Direkomendasikan', 'Diterima'].includes(item.decision)
    ? 'green'
    : ['Tidak Direkomendasikan', 'Ditolak'].includes(item.decision)
      ? 'gray'
      : 'gold';
  return `<span class="status-pill ${tone}" title="${esc(item.pic_name || '')}">${esc(item.decision)}</span>`;
}

function renderTrackingView() {
  const allRows = buildTrackingEntries();
  const renderRows = rows => rows.length
    ? rows.map(r => `<tr>
        <td><b>${esc(r.name)}</b><small class="table-subline">${esc(r.sub)}</small></td>
        <td>${esc(r.position)}</td>
        <td><span class="status-pill blue">${esc(r.leadStatus)}</span></td>
        <td><span class="status-pill ${r.formStatus === 'Selesai' ? 'green' : 'gray'}">${esc(r.formStatus)}</span></td>
        <td><span class="status-pill ${r.discStatus === 'Selesai' ? 'green' : 'gray'}">${esc(r.discStatus)}</span></td>
        <td>${trackingStageBadge(r.byStage['HR 1'])}</td>
        <td>${trackingStageBadge(r.byStage['HR 2'])}</td>
        <td>${trackingStageBadge(r.byStage['User 1'])}</td>
        <td>${trackingStageBadge(r.byStage['User 2'])}</td>
        <td>${trackingStageBadge(r.byStage['Final Interview'])}</td>
        <td><span class="status-pill ${r.finalProgress.tone}">${esc(r.finalProgress.label)}</span></td>
      </tr>`).join('')
    : emptyRow(11, 'Belum ada data tracking kandidat');

  content.innerHTML = header('Recruitment Tracking', '', '<button class="btn btn-secondary" id="refresh-tracking">Refresh ↻</button>') +
    `<section class="panel table-panel">${tableToolbar('Cari nama / posisi / status…', 'Progress Tracking Kandidat')}
      <div class="table-wrap recruitment-data-scroll">
        <table class="data-table">
          <thead><tr>
            <th>KANDIDAT</th><th>POSISI</th><th>LEAD REGISTER</th><th>FORM TAHAP 2</th><th>DISC</th>
            <th>HR 1</th><th>HR 2</th><th>USER 1</th><th>USER 2</th><th>FINAL</th><th>STATUS AKHIR</th>
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
 * EMPLOYEE DIRECTORY — Sesuai 16 Kolom Format Tabel + Upload XLSX/CSV
 * ============================================================================ */
function employeeRows(rows) {
  if (!rows.length) return emptyRow(17, 'Belum ada data karyawan');
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
    ? `<div class="upload-preview-box" style="margin-bottom:14px;border-color:#fde68a;background:#fffbeb;color:#92400e">Sebagian kolom baru Employee Directory belum diterapkan di database. Jalankan file migrasi <code>database/migrations/20261120_hrga_workspace_v2.sql</code> di Supabase SQL Editor.</div>`
    : '';
  content.innerHTML = header('Employee Directory', '',
    '<button id="add-employee" class="btn btn-secondary">+ Tambah Karyawan</button>' +
    '<button id="upload-employees" class="btn btn-secondary">Upload XLSX / CSV ↑</button>' +
    '<button id="export-employees" class="btn btn-primary">Unduh XLSX ↓</button>'
  ) + migrationWarn + `
    <section class="panel table-panel">${tableToolbar('Cari nama / NIK / departemen / jabatan…', 'Employee Directory')}
      <div class="table-wrap recruitment-data-scroll">
        <table class="data-table">
          <thead><tr>${EMPLOYEE_TABLE_HEADERS.map(h => `<th>${esc(h.toUpperCase())}</th>`).join('')}<th>AKSI</th></tr></thead>
          <tbody id="employee-rows">${employeeRows(employees)}</tbody>
        </table>
      </div>
    </section>`;

  bindSearch('#table-search', query => {
    const filtered = employees.filter(e => {
      const a = applicants.find(x => x.id === e.applicant_id);
      const row = formatEmployeeExportRow(e, a);
      return Object.values(row).join(' ').toLocaleLowerCase('id').includes(query);
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
          throw new Error('Jalankan file migrasi SQL v2 terlebih dahulu sebelum mengimpor 16 kolom Employee Directory.');
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
        say(`${parsedRows.length} data karyawan berhasil diimpor ke Employee Directory.`);
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
        say('Data karyawan diperbarui.');
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
        say('Kandidat ditambahkan ke Employee Directory.');
      } else {
        const insertPayload = { ...fields };
        delete insertPayload.id;
        insertPayload.updated_at = new Date().toISOString();
        const { error } = await supabase.from('employees').upsert(insertPayload, { onConflict: 'employee_no' });
        if (error) throw error;
        if (fields.applicant_id) {
          await supabase.from('applicants').update({ stage: 'hired', updated_at: new Date().toISOString() }).eq('id', fields.applicant_id);
        }
        say('Data karyawan disimpan ke Employee Directory.');
      }
      invalidateDataCache();
      await loadView(activeView === 'employees' ? 'employees' : 'stage3', true);
    }
  });
}

function bindHire() {
  $$('[data-hire]').forEach(button => button.addEventListener('click', () => {
    const applicant = applicants.find(a => a.id === button.dataset.hire);
    if (applicant) openEmployeeEditor(null, applicant);
  }));
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
    XLSX.utils.book_append_sheet(wb, ws, 'Template Karyawan');
    XLSX.writeFile(wb, 'Template_Employee_Directory.xlsx');
    say('Template XLSX diunduh.');
  } catch (err) {
    say(err.message || 'Gagal menyiapkan template XLSX.');
  }
}

async function exportEmployees() {
  const button = $('#export-employees');
  button.disabled = true;
  button.textContent = 'Menyiapkan XLSX…';
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
    say(`${employees.length} data karyawan diekspor ke XLSX.`);
  } catch (error) {
    say(error.message || 'File XLSX gagal dibuat.');
  } finally {
    button.disabled = false;
    button.textContent = 'Unduh XLSX ↓';
  }
}

/* ============================================================================
 * MANAJEMEN USER (NIK, Nama Karyawan, Role Superadmin, PIN + Eye 8karakterH!)
 * ============================================================================ */
async function renderUserManagement() {
  let migrationMissing = false;
  let rows = [];
  try {
    const { data, error } = await supabase.rpc('list_portal_users');
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
    ? `<div class="upload-preview-box" style="margin-bottom:14px;border-color:#fca5a5;background:#fef2f2;color:#991b1b">RPC Manajemen User belum aktif di Supabase. Jalankan file migrasi <code>database/migrations/20261120_hrga_workspace_v2.sql</code> di Supabase SQL Editor untuk mengaktifkan Tambah User &amp; Intip PIN.</div>`
    : '';

  const renderRowsHtml = list => list.length
    ? list.map(u => `<tr>
        <td style="font-family:var(--font-mono)"><b>${esc(u.employee_nik || u.username)}</b></td>
        <td>${esc(u.display_name || '—')}</td>
        <td><span class="status-pill blue">${esc(u.role || 'Superadmin')}</span></td>
        <td>
          <div class="pin-cell-wrap">
            <span data-pin-mask="${esc(u.username)}">${esc(maskPin())}</span>
            <button type="button" class="pin-eye-btn" data-pin-reveal="${esc(u.username)}" data-pin-label="${esc(u.employee_nik || u.username)}" aria-label="Intip PIN ${esc(u.display_name || u.username)}" title="Intip PIN">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </td>
        <td>${u.last_login ? esc(idDate(u.last_login)) : '—'}</td>
        <td><div class="row-actions">
          <button type="button" class="icon-btn" data-user-edit="${esc(u.username)}">Edit</button>
          <button type="button" class="icon-btn danger" data-user-delete="${esc(u.username)}">Delete</button>
        </div></td>
      </tr>`).join('')
    : emptyRow(6, 'Belum ada data user');

  content.innerHTML = header('Manajemen User', '', '<button id="add-portal-user" class="btn btn-primary">+ Tambah User</button>') +
    migrationNotice +
    `<section class="panel table-panel">${tableToolbar('Cari NIK / nama karyawan…', 'Daftar User Workspace')}
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>NIK</th><th>NAMA KARYAWAN</th><th>ROLE</th><th>PIN</th><th>LOGIN TERAKHIR</th><th>AKSI</th></tr></thead>
        <tbody id="user-rows">${renderRowsHtml(rows)}</tbody>
      </table></div></section>`;

  const bindUserActions = () => {
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
          say('PIN berhasil ditampilkan.');
        }
      });
    }));

    $$('[data-user-edit]').forEach(btn => btn.addEventListener('click', () => {
      const user = portalUsers.find(item => item.username === btn.dataset.userEdit);
      if (!user) return;
      openUserModal({
        existing: user,
        onSave: async fields => {
          const { error } = await supabase.rpc('upsert_portal_user', {
            p_nik: fields.nik,
            p_full_name: fields.full_name,
            p_role: fields.role,
            p_pin: fields.pin || null
          });
          if (error) throw error;
          say(`Data user ${fields.full_name} diperbarui.`);
          await loadView('userManagement');
        }
      });
    }));

    $$('[data-user-delete]').forEach(btn => btn.addEventListener('click', async () => {
      const username = btn.dataset.userDelete;
      const user = portalUsers.find(item => item.username === username);
      if (!window.confirm(`Hapus akses user ${user?.display_name || username}?`)) return;
      try {
        const { error } = await supabase.rpc('delete_portal_user', { p_username: username });
        if (error) throw error;
        say('User berhasil dihapus.');
        await loadView('userManagement');
      } catch (err) {
        say(err.message || 'Gagal menghapus user.');
      }
    }));
  };

  $('#add-portal-user').addEventListener('click', () => {
    openUserModal({
      existing: null,
      onSave: async fields => {
        if (migrationMissing) {
          throw new Error('Jalankan file migrasi SQL v2 di Supabase SQL Editor terlebih dahulu.');
        }
        const { error } = await supabase.rpc('upsert_portal_user', {
          p_nik: fields.nik,
          p_full_name: fields.full_name,
          p_role: fields.role,
          p_pin: fields.pin
        });
        if (error) throw error;
        say(`User ${fields.full_name} berhasil ditambahkan.`);
        await loadView('userManagement');
      }
    });
  });

  bindSearch('#table-search', query => {
    const filtered = rows.filter(u => `${u.employee_nik} ${u.username} ${u.display_name} ${u.role}`.toLocaleLowerCase('id').includes(query));
    $('#user-rows').innerHTML = renderRowsHtml(filtered);
    bindUserActions();
  });
  bindUserActions();
}

/* ============================================================================
 * APPLICATION PRINT & TEMPLATES
 * ============================================================================ */
function renderPrintRows(rows) {
  if (!rows.length) return emptyRow(5);
  return rows.map(applicant => {
    const disc = getDiscForApplicant(applicant);
    return `<tr><td><b>${esc(applicant.full_name)}</b><small class="table-subline">${esc(applicant.nik)}</small></td>
      <td>${esc(applicant.position || '—')}</td><td>${statusPill(applicant.stage)}</td>
      <td>${disc ? '<span class="status-pill green">Lengkap</span>' : '<span class="status-pill gray">Belum ada</span>'}</td>
      <td><button class="icon-btn" data-print="${esc(applicant.id)}">Cetak Lamaran · CV · DISC</button></td></tr>`;
  }).join('');
}

async function loadPrintTemplates() {
  await syncDefaultPrintMaster().catch(error => {
    console.warn('Sinkronisasi otomatis master bawaan dilewati:', error);
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
  const currentName = active?.source_filename || 'Master bawaan repository';
  const isRepoDefault = !active || active.source_filename === 'Master bawaan repository';
  const currentMeta = isRepoDefault
    ? 'Master bawaan Mitra & ReHolz siap dipilih saat mencetak'
    : `Diperbarui ${idDate(active.created_at)}`;
  const history = printTemplates.length ? printTemplates.map(template => `<tr>
    <td><b>${esc(template.source_filename)}</b><small class="table-subline">${esc(template.schema_version || '—')}</small></td>
    <td data-sort-value="${esc(template.created_at || '')}">${idDate(template.created_at)}</td>
    <td>${template.is_active ? '<span class="status-pill green">Aktif</span>' : '<span class="status-pill gray">Arsip</span>'}</td>
    <td>${template.is_active ? '' : `<button class="icon-btn" data-template-activate="${esc(template.id)}">Jadikan aktif</button>`}</td>
  </tr>`).join('') : emptyRow(4, 'Belum ada versi master tambahan.');
  const controls = migrationError
    ? `<div class="form-error template-error">Riwayat master belum tersedia.</div>`
    : `<div class="template-current"><div><small>MASTER AKTIF</small><b>${esc(currentName)}</b><span>${esc(currentMeta)}</span></div>
        <button class="btn btn-secondary" id="restore-template">Pulihkan master bawaan</button></div>
      <form id="template-upload-form" class="template-upload">
        <div class="template-upload-copy"><b>Ganti desain master</b><span>Unggah HTML baru. Field <code>name</code> wajib dipertahankan.</span></div>
        <input id="template-file" class="input" type="file" accept=".html,text/html" required>
        <button class="btn btn-primary" type="submit">Simpan &amp; aktifkan</button>
      </form>
      <div class="template-history"><div class="template-history-title">Riwayat versi tersimpan</div><div class="table-wrap"><table class="data-table"><thead><tr><th>MASTER FILE</th><th>DATE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${history}</tbody></table></div></div>`;
  return `<section class="panel template-manager">
    <div class="panel-head"><div><h3>Master HTML lamaran</h3><p>Desain dapat diganti tanpa mengubah struktur data formulir</p></div><span class="status-pill ${active ? 'green' : 'blue'}">${isRepoDefault ? 'Master bawaan · Aktif' : 'Versi tersimpan'}</span></div>
    <div class="template-manager-body">${controls}</div>
  </section>`;
}

function renderPrint() {
  content.innerHTML = header('Application Print', '') + `
    <section class="panel table-panel">${tableToolbar('Cari kandidat…', 'Application Print')}<div class="table-wrap"><table class="data-table">
      <thead><tr><th>APPLICANT</th><th>POSITION</th><th>STAGE</th><th>DISC</th><th>DOCUMENTS</th></tr></thead>
      <tbody id="candidate-rows">${renderPrintRows(applicants)}</tbody>
    </table></div></section>
    <div id="template-manager-slot"></div>`;
  bindSearch('#table-search', query => {
    $('#candidate-rows').innerHTML = renderPrintRows(applicants.filter(a => `${a.full_name} ${a.nik} ${a.position}`.toLocaleLowerCase('id').includes(query)));
    bindPrint();
  });
  bindPrint();
  loadPrintTemplates().then(error => {
    const slot = $('#template-manager-slot');
    if (!slot) return;
    slot.innerHTML = templateManagerHtml(error);
    bindTemplateManager(Boolean(error));
  });
}

function renderPlaceholder(title) {
  content.innerHTML = `<section class="panel placeholder-panel"><div><div class="placeholder-symbol" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg></div><h2>${esc(title || 'Modul Dalam Pengembangan')}</h2><p>Modul ini disiapkan untuk pengelolaan operasional terintegrasi.</p></div></section>`;
}

function printBrandModal() {
  let modal = $('#print-brand-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'print-brand-modal';
  modal.className = 'modal-backdrop hidden';
  modal.innerHTML = `<section class="print-brand-modal-card" role="dialog" aria-modal="true" aria-labelledby="print-brand-modal-title">
    <div class="employee-modal-head">
      <div><small>FORMAT CETAK DOKUMEN</small><h2 id="print-brand-modal-title">Pilih versi perusahaan untuk cetak</h2></div>
      <button type="button" class="modal-close" id="print-brand-close" aria-label="Tutup">×</button>
    </div>
    <div class="print-brand-candidate" id="print-brand-candidate"></div>
    <div class="print-brand-grid">
      <button type="button" class="print-brand-option" data-print-brand="mitra">
        <div class="print-brand-option-banner"><img src="./assets/img/logo-mitra.png" alt="PT. Mitra Binamandiri Makmur"><span class="print-brand-option-tag">Executive Navy</span></div>
        <div class="print-brand-option-body"><b>PT. Mitra Binamandiri Makmur</b><small>Formulir lamaran kerja resmi Mitra, lampiran CV, dan Laporan Hasil Tes D.I.S.C. edisi Mitra.</small><span class="print-brand-cta">Cetak versi Mitra ↗</span></div>
      </button>
      <button type="button" class="print-brand-option" data-print-brand="reholz">
        <div class="print-brand-option-banner"><img src="./assets/img/logo-reholz-light.png" alt="ReHolz · PT Radin Mitra Lestari"><span class="print-brand-option-tag">Forest &amp; Amber</span></div>
        <div class="print-brand-option-body"><b>PT Radin Mitra Lestari (ReHolz)</b><small>Formulir lamaran kerja ReHolz, lampiran CV, dan Laporan Hasil Tes D.I.S.C. edisi ReHolz.</small><span class="print-brand-cta">Cetak versi ReHolz ↗</span></div>
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
      if (sourceBtn) { sourceBtn.disabled = true; sourceBtn.textContent = 'Menyiapkan…'; }
      Promise.resolve().then(() => printApplication(record, { brand }))
        .catch(error => say(error.message || 'Dokumen tidak dapat disiapkan.'))
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
    candidateEl.innerHTML = `<div><b>${esc(record.full_name || '—')}</b><span>${esc(record.position || 'Posisi belum diisi')}</span></div><span class="print-brand-nik">${esc(record.nik || '—')}</span>`;
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
  if (!form) throw new Error('Master HTML wajib memiliki form dengan id="applicationForm".');
  const baselineNames = new Set([...baselineDoc.querySelectorAll('#applicationForm [name]')].map(el => el.getAttribute('name')).filter(Boolean));
  const newNames = new Set([...form.querySelectorAll('[name]')].map(el => el.getAttribute('name')).filter(Boolean));
  const missing = [...baselineNames].filter(name => !newNames.has(name));
  if (missing.length) {
    throw new Error(`Master baru menghilangkan ${missing.length} field lama. Semua atribut name harus dipertahankan.`);
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
  if (!baselineResponse.ok) throw new Error('Master bawaan tidak dapat dimuat untuk validasi field.');
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
    button.textContent = 'Memvalidasi…';
    try {
      await storeAndActivateTemplate(await file.text(), file.name);
      await markDefaultMasterSynced();
      say('Master HTML baru berhasil diaktifkan.');
      await loadView('print');
    } catch (error) { say(error.message || 'Master HTML gagal disimpan.'); }
    finally { button.disabled = false; button.textContent = 'Simpan & aktifkan'; }
  });
  $('#restore-template')?.addEventListener('click', async () => {
    const button = $('#restore-template');
    button.disabled = true;
    button.textContent = 'Memulihkan…';
    try {
      const response = await fetch(versionedTemplateUrl(), { cache: 'no-store' });
      if (!response.ok) throw new Error('Master bawaan tidak ditemukan.');
      await storeAndActivateTemplate(await response.text(), 'Master bawaan repository');
      await markDefaultMasterSynced();
      say('Master bawaan berhasil diaktifkan.');
      await loadView('print');
    } catch (error) { say(error.message || 'Master bawaan gagal diaktifkan.'); }
    finally { button.disabled = false; button.textContent = 'Pulihkan master bawaan'; }
  });
  $$('[data-template-activate]').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const { error } = await supabase.rpc('activate_print_template', { p_template_id: button.dataset.templateActivate });
      if (error) throw error;
      await markDefaultMasterSynced();
      say('Versi master berhasil diaktifkan.');
      await loadView('print');
    } catch (error) { say(error.message || 'Versi master gagal diaktifkan.'); button.disabled = false; }
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

  const dataViews = new Set(['dashboard', 'stage1', 'stage2', 'stage3', 'interview', 'tracking', 'employees', 'print']);
  if (dataViews.has(view) && (!lastDataFetchedAt || forceRefresh)) {
    content.innerHTML = '<section class="panel placeholder-panel"><div><div class="placeholder-symbol" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div><h2>Memuat data</h2></div></section>';
  }

  try {
    if (dataViews.has(view)) await refreshData(forceRefresh);
    if (view === 'dashboard') renderDashboard();
    else if (view === 'stage1') renderStage1();
    else if (view === 'stage2') await renderStage2();
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
    content.innerHTML = `<section class="panel placeholder-panel"><div><div class="placeholder-symbol" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><h2>Data tidak dapat dimuat</h2><p>${esc(error.message || 'Periksa koneksi Supabase.')}</p><button id="retry-load" class="btn btn-secondary" style="margin-top:18px">Coba lagi</button></div></section>`;
    $('#retry-load')?.addEventListener('click', () => loadView(view, true));
  }
}

async function openAdmin(session) {
  const { data: isAdmin, error } = await supabase.rpc('is_portal_admin');
  if (error) {
    await supabase.auth.signOut();
    throw new Error('Login berhasil, tetapi pemeriksaan akses admin gagal.');
  }
  if (!isAdmin) {
    await supabase.auth.signOut();
    throw new Error('Akun berhasil login, tetapi hak akses HR belum aktif.');
  }
  currentUserId = session.user.id;
  const { data: profile } = await supabase.from('admin_users').select('display_name').eq('user_id', session.user.id).maybeSingle();
  adminDisplayName = profile?.display_name || session.user.email || 'HR Admin';
  $('#admin-name').textContent = adminDisplayName;
  loginView.classList.add('hidden');
  shell.classList.remove('hidden');
  await loadView('dashboard', true);
}

$('#toggle-pin-visibility')?.addEventListener('click', () => {
  const input = $('#login-pin');
  const btn = $('#toggle-pin-visibility');
  if (!input || !btn) return;
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  btn.setAttribute('aria-pressed', String(!visible));
  btn.setAttribute('aria-label', visible ? 'Tampilkan PIN' : 'Sembunyikan PIN');
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

  if (!isConfigured) { errorBox.textContent = 'Konfigurasi Supabase belum diisi.'; return; }
  if (!validateLoginIdentifier(rawUser)) {
    errorBox.textContent = 'Masukkan NIK Karyawan yang valid (minimal 3 karakter).';
    return;
  }
  if (!validatePin(pin)) {
    errorBox.textContent = 'PIN harus terdiri dari 4–12 angka.';
    return;
  }

  const normalizedUser = normalizeLoginIdentifier(rawUser);
  button.disabled = true;
  button.textContent = 'Memeriksa…';
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
      throw new Error(result.error || 'NIK Karyawan atau PIN tidak sesuai.');
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token
    });
    if (error) throw error;
    await openAdmin(data.session);
    $('#login-pin').value = '';
  } catch (error) {
    console.error('NIK/PIN login failed:', error);
    errorBox.textContent = error.message || 'Sign-in gagal. Periksa NIK Karyawan dan PIN Anda.';
    button.disabled = false;
    button.textContent = 'Sign In ↗';
  }
});

$('#admin-nav').addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (button) loadView(button.dataset.view);
});

$('#logout-btn').addEventListener('click', async () => {
  await supabase?.auth.signOut();
  invalidateDataCache();
  shell.classList.add('hidden');
  loginView.classList.remove('hidden');
  $('#login-pin').value = '';
  const loginButton = $('#login-form button[type="submit"]');
  if (loginButton) { loginButton.disabled = false; loginButton.textContent = 'Sign In ↗'; }
  currentUserId = null;
});

async function init() {
  initSidebarAccordions();
  if (!isConfigured) {
    $('#login-error').textContent = 'Isi Project URL dan Publishable key di assets/js/config.js.';
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    try { await openAdmin(session); }
    catch (error) { $('#login-error').textContent = error.message; }
  }
}

init();
