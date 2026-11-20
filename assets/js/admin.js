import { supabase, isConfigured } from './supabase.js?v=20261120-hrga-workspace-02';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEMPLATE_URL } from './config.js?v=20261120-hrga-workspace-02';
import { $, $$, esc, idDate, stageUrl } from './common.js?v=20261120-hrga-workspace-02';
import { printApplication } from './print.js?v=20261120-hrga-workspace-04';
import { computeDisc } from './disc-engine.js?v=20261120-hrga-workspace-02';
import { renderAdminEditorMarkup, bindAdminEditorForm, collectAdminEditorData } from './applicant.js?v=20261120-hrga-workspace-02';

const loginView = $('#login-view');
const shell = $('#admin-shell');
const content = $('#admin-content');
let applicants = [];
let employees = [];
let activeView = 'dashboard';
let adminDisplayName = 'HR Admin';
let currentUserId = null;
let printTemplates = [];
let editingEmployeeId = null;
let hiringApplicantId = null;
let editingApplicantId = null;
let stage2PositionsCache = [];
let adminEditorBinding = null;

const TITLES = {
  dashboard: 'Dashboard', stage1: 'Lead Register', filterSettings: 'Filter Settings',
  stage2: 'Candidate List', stage3: 'DISC Assessment', tracking: 'Recruitment Tracking',
  employees: 'Employee Directory', print: 'Application Print', reports: 'Recruitment Reports',
  settings: 'Recruitment Settings', attendanceSuite: 'Attendance Suite',
  attendanceCalendar: 'Calendar Settings', attendanceStaffHoliday: 'Conditional Holiday Schedule',
  attendanceStaffManagement: 'Staff Attendance Management', attendanceStaffReports: 'Staff Reports',
  attendanceDriverSchedule: 'Manual Driver Schedule', attendanceDriverManagement: 'Driver Attendance Management',
  attendanceDriverReports: 'Driver Reports', vehicleManagement: 'Vehicle Management',
  vehicleDatabase: 'Vehicle Database', vehicleExpenses: 'Vehicle Expenses', vehicleReports: 'Vehicle Reports'
};
const stageLabel = {
  stage1_pending: 'Lead Register', application_submitted: 'Form Submitted', disc_completed: 'DISC Completed',
  stage4_pending: 'Further Review', hired: 'Employee', rejected: 'Not Proceeding'
};
const stageClass = {
  stage1_pending: 'gray', application_submitted: 'blue', disc_completed: 'green',
  stage4_pending: 'gold', hired: 'green', rejected: 'gray'
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

function statusPill(stage) {
  return `<span class="status-pill ${stageClass[stage] || 'gray'}">${esc(stageLabel[stage] || stage || '—')}</span>`;
}
function fmtAge(applicant) {
  return applicant?.application_data?.umur ? `${esc(applicant.application_data.umur)} th` : '—';
}
function header(_title, _subtitle, actions = '') {
  return actions ? `<div class="page-intro"><div class="page-actions">${actions}</div></div>` : '';
}
function tableToolbar(placeholder = 'Search candidates…', title = 'Candidate List', _subtitle = '') {
  return `<div class="panel-head"><h3>${esc(title)}</h3><div class="table-search"><input id="table-search" type="search" placeholder="${esc(placeholder)}"></div></div>`;
}
function emptyRow(columns, message = 'No data available') {
  return `<tr><td colspan="${columns}" class="table-empty">${esc(message)}</td></tr>`;
}
function getEmployeeForApplicant(applicant) {
  return Array.isArray(applicant?.employees) ? applicant.employees[0] : applicant?.employees;
}
function getDiscForApplicant(applicant) {
  return Array.isArray(applicant?.disc_submissions) ? applicant.disc_submissions[0] : applicant?.disc_submissions;
}

const APPLICATION_FIELD_LABELS = {
 nama:'Nama lengkap',nik:'NIK',posisi:'Posisi dilamar',tempat_lahir:'Tempat lahir',tanggal_lahir:'Tanggal lahir',
 gender:'Jenis kelamin',tinggi:'Tinggi badan (cm)',berat:'Berat badan (kg)',gol_darah:'Golongan darah',agama:'Agama',
 warga_negara:'Kewarganegaraan',telepon:'WhatsApp / telepon',email:'Email',alamat_provinsi:'Provinsi KTP',
 alamat_kota_nama:'Kabupaten / kota KTP',alamat_kecamatan:'Kecamatan KTP',alamat_desa:'Desa / kelurahan KTP',
 alamat_tipe:'Jenis alamat KTP',alamat_jalan:'Jalan / dusun KTP',alamat_rt:'RT',alamat_rw:'RW',alamat_kodepos:'Kode pos',
 domisili_berbeda:'Alamat domisili berbeda',domisili:'Alamat domisili',status_kawin:'Status perkawinan',hobby:'Hobi dan minat',
 ayah_nama:'Nama ayah',ayah_umur:'Umur ayah',ayah_pendidikan:'Pendidikan ayah',ayah_pekerjaan:'Pekerjaan ayah',
 ibu_nama:'Nama ibu',ibu_umur:'Umur ibu',ibu_pendidikan:'Pendidikan ibu',ibu_pekerjaan:'Pekerjaan ibu',
 saudara_count:'Jumlah saudara kandung',anak_count:'Jumlah anak',bahasa_count:'Jumlah bahasa',kerja_count:'Jumlah pengalaman kerja',
 pendidikan_terakhir:'Pendidikan terakhir',mulai_kerja:'Tanggal mulai bekerja',gaji_harapan:'Gaji yang diharapkan',
 fasilitas_harapan:'Fasilitas yang diharapkan',referensi1_nama:'Nama kontak darurat',referensi1_alamat:'Alamat kontak darurat',
 referensi1_telepon:'Telepon kontak darurat',referensi1_pekerjaan:'Pekerjaan kontak darurat',referensi1_hubungan:'Hubungan kontak darurat',
 mulai_kerja:'Tanggal bisa mulai bekerja',gaji_harapan:'Gaji yang diharapkan',fasilitas_harapan:'Fasilitas yang diharapkan',
 jawaban1:'Pengetahuan tentang perusahaan',jawaban2:'Deskripsi diri',jawaban3:'Kontribusi untuk perusahaan',
 setuju:'Pernyataan kebenaran data'
};
function applicationFieldLabel(key){
 if(APPLICATION_FIELD_LABELS[key])return APPLICATION_FIELD_LABELS[key];
 const repeat=String(key).match(/^(saudara|anak|bahasa|kerja)(\d+)_(.+)$/);
 if(repeat){
  const [,group,index,field]=repeat;
  const groups={saudara:'Saudara kandung',anak:'Anak',bahasa:'Bahasa',kerja:'Pengalaman kerja'};
  const labels={nama:'Nama',lp:'Jenis kelamin',umur:'Umur',pendidikan:'Pendidikan',pekerjaan:'Pekerjaan',bicara:'Berbicara',baca:'Membaca',tulis:'Menulis',lainnya:'Keterangan bahasa',perusahaan:'Nama perusahaan',periode_mulai:'Mulai',periode_selesai:'Selesai',jabatan:'Jabatan',usaha:'Jenis usaha',jumlah:'Jumlah karyawan',atasan:'Nama atasan',gaji:'Gaji terakhir',alasan:'Alasan berhenti'};
  const number=group==='saudara'?Number(index)-1:Number(index);
  return `${groups[group]} ${number} · ${labels[field]||field.replace(/_/g,' ')}`;
 }
 return String(key).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ')
   .replace(/\b\w/g,char=>char.toUpperCase());
}
function displayApplicationValue(value){
 if(value===null||value===undefined||value==='')return '—';
 if(typeof value==='boolean')return value?'Ya':'Tidak';
 if(Array.isArray(value))return value.map(displayApplicationValue).join(', ');
 if(typeof value==='object')return Object.entries(value).map(([key,item])=>`${applicationFieldLabel(key)}: ${displayApplicationValue(item)}`).join(' · ');
 return String(value);
}
function discGraphSvg(result){
 const series=[['G1',result.g1,'#3b68d8'],['G2',result.g2,'#26977d'],['G3',result.g3,'#c69b54']];
 const xs=[24,92,160,228],y=value=>Math.round(76-(Math.max(-8,Math.min(8,Number(value)||0))+8)*3.35);
 const lines=series.map(([name,values,color])=>{
  const points=values.map((value,index)=>`${xs[index]},${y(value)}`).join(' ');
  return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>${values.map((value,index)=>`<circle cx="${xs[index]}" cy="${y(value)}" r="3" fill="${color}"/>`).join('')}`;
 }).join('');
 return `<div class="disc-mini-graph"><svg viewBox="0 0 252 104" role="img" aria-label="Grafik skor DISC untuk D, I, S, C"><line x1="15" y1="49" x2="237" y2="49" stroke="#cbd4e1" stroke-dasharray="3 4"/><line x1="15" y1="15" x2="237" y2="15" stroke="#edf0f5"/><line x1="15" y1="83" x2="237" y2="83" stroke="#edf0f5"/>${lines}${['D','I','S','C'].map((letter,index)=>`<text x="${xs[index]}" y="99" text-anchor="middle">${letter}</text>`).join('')}</svg><div class="disc-graph-legend"><span><i class="g1"></i>G1</span><span><i class="g2"></i>G2</span><span><i class="g3"></i>G3</span></div></div>`;
}
function applicantRows(rows, action = 'print') {
 if(!rows.length)return emptyRow(action==='both'?7:5);
 return rows.map(applicant=>{
  const employee=getEmployeeForApplicant(applicant),disc=getDiscForApplicant(applicant);
  let graph='<span class="status-pill gray">Belum ada grafik</span>',personality='—';
  if(disc?.answers){
   try{const result=computeDisc(disc.answers),natural=result.pola[2];graph=discGraphSvg(result);personality=`<b>${esc(natural.title)}</b><small class="table-subline">${esc(natural.nama)} · Dominan ${esc(result.hurufDominan)}</small>`;}
   catch{graph='<span class="status-pill gray">Hasil perlu diperiksa</span>';personality='Perlu diperiksa';}
  }
  return `<tr><td><b>${esc(applicant.full_name)}</b><small class="table-subline">${esc(applicant.nik)}</small></td>
   <td>${esc(applicant.position||'—')}</td><td>${fmtAge(applicant)}</td><td>${statusPill(applicant.stage)}</td>
   ${action==='both'?'<td>'+graph+'</td><td>'+personality+'</td>':''}
   <td><div class="row-actions">${action==='both'&&!employee?`<button class="icon-btn" data-hire="${esc(applicant.id)}">Jadikan karyawan</button>`:''}
   <button class="icon-btn" data-print="${esc(applicant.id)}">Cetak</button></div></td></tr>`;
 }).join('');
}

function bindSearch(selector, rerender) {
  const input = $(selector);
  if (!input) return;
  input.addEventListener('input', () => rerender(input.value.trim().toLocaleLowerCase('id')));
}

async function refreshData() {
  const [candidateResult, employeeResult] = await Promise.all([
    supabase.from('applicants')
      .select('id,full_name,nik,position,stage,application_data,cv_path,ktp_path,created_at,background_check_status,disc_invited,disc_submissions(id,answers,completed_at),employees(id)')
      .order('created_at', { ascending: false }).limit(1000),
    supabase.from('employees')
      .select('id,applicant_id,employee_no,department,position,employment_status,join_date,notes,created_at,updated_at')
      .order('created_at', { ascending: false }).limit(1000)
  ]);
  if (candidateResult.error) throw candidateResult.error;
  if (employeeResult.error) throw employeeResult.error;
  applicants = candidateResult.data || [];
  employees = employeeResult.data || [];
}

function renderDashboard() {
  const total = applicants.length;
  const stage1 = applicants.filter(a => a.stage === 'stage1_pending').length;
  const stage2 = applicants.filter(a => a.stage === 'application_submitted').length;
  const stage3 = applicants.filter(a => a.stage === 'disc_completed').length;
  const stage4 = applicants.filter(a => a.stage === 'stage4_pending').length;
  const hired = employees.length;
  const rejected = applicants.filter(a => a.stage === 'rejected').length;
  const submitted = stage2 + stage3 + stage4 + hired;
  const discDone = stage3 + stage4 + hired;
  const stages = [
    ['Lead Register', stage1, 'stage-muted'],
    ['Form Submitted', stage2, 'stage-blue'],
    ['DISC Completed', stage3, 'stage-teal'],
    ['Further Review', stage4, 'stage-gold'],
    ['Employees', hired, 'stage-green'],
    ['Not Proceeding', rejected, 'stage-muted']
  ];
  const positionCounts = new Map();
  applicants.forEach(item => {
    const position = String(item.position || 'Unspecified').trim();
    positionCounts.set(position, (positionCounts.get(position) || 0) + 1);
  });
  const topPositions = [...positionCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxPosition = Math.max(1, ...topPositions.map(item=>item[1]));
  const recent = applicants.slice(0,7);
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
      <button type="button" class="workspace-module" data-view="attendanceSuite" data-module="attendance">
        <span class="workspace-module-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/></svg></span>
        <span class="workspace-module-copy"><b>Attendance Suite</b><span>Calendar &amp; Workforce</span></span>
        <span class="workspace-module-arrow" aria-hidden="true">↗</span>
      </button>
      <button type="button" class="workspace-module" data-view="vehicleManagement" data-module="vehicle">
        <span class="workspace-module-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></span>
        <span class="workspace-module-copy"><b>Vehicle Management</b><span>Fleet &amp; Expenses</span></span>
        <span class="workspace-module-arrow" aria-hidden="true">↗</span>
      </button>
    </section>
    <section class="dashboard-metrics" aria-label="Recruitment metrics">
      <article class="stat-card"><div class="stat-top"><span>Total Applicants</span><span class="stat-icon-tile" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span></div><div class="stat-number">${total}</div><div class="stat-note">All recorded applications</div></article>
      <article class="stat-card"><div class="stat-top"><span>Forms Submitted</span><span class="stat-icon-tile walnut" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span></div><div class="stat-number">${submitted}</div><div class="stat-note">Candidate forms received</div></article>
      <article class="stat-card"><div class="stat-top"><span>DISC Completed</span><span class="stat-icon-tile" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></span></div><div class="stat-number">${discDone}</div><div class="stat-note">Completed assessments</div></article>
      <article class="stat-card"><div class="stat-top"><span>Employees</span><span class="stat-icon-tile walnut" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg></span></div><div class="stat-number">${hired}</div><div class="stat-note">Employee records</div></article>
    </section>
    <div id="recruitment-routemap" class="dashboard-v2-grid">
      <section class="panel dashboard-process-panel">
        <div class="panel-head"><h3>Recruitment Routemap</h3><span class="dashboard-total">${total} applicants</span></div>
        <div class="dashboard-process-list">${stages.map(([label,value,tone])=>`<div class="dashboard-process-row"><div class="dashboard-process-copy"><span>${esc(label)}</span><b>${value}</b></div><div class="dashboard-process-track"><span class="${tone}" style="width:${total?Math.min(100,value/total*100):0}%"></span></div></div>`).join('')}</div>
      </section>
      <section class="panel dashboard-position-panel">
        <div class="panel-head"><h3>Applicants by Position</h3></div>
        <div class="dashboard-position-list">${topPositions.length?topPositions.map(([name,value])=>`<div class="dashboard-position-row"><div><span>${esc(name)}</span><div class="dashboard-process-track"><span style="width:${value/maxPosition*100}%"></span></div></div><b>${value}</b></div>`).join(''):'<div class="dashboard-empty">No position data</div>'}</div>
      </section>
    </div>
    <section class="panel table-panel dashboard-recent-panel">
      <div class="panel-head"><h3>Recent Applicants</h3><button class="btn btn-secondary" id="refresh-dashboard">Refresh ↻</button></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>APPLICANT</th><th>POSITION</th><th>AGE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${applicantRows(recent, 'print')}</tbody></table></div>
    </section>`;
  bindPrint();
  $('#refresh-dashboard')?.addEventListener('click', () => loadView('dashboard'));
  $$('#admin-content [data-view]').forEach(button => button.addEventListener('click', () => loadView(button.dataset.view)));
}

function stage1ExperienceColumns(rows){return [...new Set(rows.flatMap(row=>Object.keys(row.experience_details||{})))].sort();}
function stage1RowsHtml(rows,keys){
 if(!rows.length)return emptyRow(9+keys.length,'No leads found');
 return rows.map(row=>{
  const details=row.experience_details||{};
  return `<tr><td><b>${esc(row.full_name)}</b></td><td>${esc(row.position)}</td><td>${esc(row.city||'—')}</td>
   <td>${esc(row.district||'—')}</td><td>${esc(row.whatsapp||'—')}</td>
   ${keys.map(key=>`<td>${esc(displayApplicationValue(details[key]))}</td>`).join('')}
   <td><span class="status-pill blue">${esc(row.status||'received')}</span></td><td data-sort-value="${esc(row.created_at||'')}">${esc(idDate(row.created_at))}</td>
   <td><button class="icon-btn" data-stage1-cv="${esc(row.id)}">Open CV</button></td>
   <td><div class="row-actions"><button class="icon-btn" data-stage1-wa="${esc(row.id)}">Send to Stage 2</button>
   <button class="icon-btn" data-stage1-status="${esc(row.id)}">Mark Reviewed</button></div></td></tr>`;
 }).join('');
}
async function renderStage1(){
 const {data,error}=await supabase.from('candidate_stage1_applications')
  .select('id,position,full_name,city,district,whatsapp,experience_details,cv_path,cv_filename,status,created_at')
  .order('created_at',{ascending:false}).limit(500);
 if(error)throw error;
 const rows=data||[],keys=stage1ExperienceColumns(rows);
 const headers=['APPLICANT','POSITION','CITY','DISTRICT','WHATSAPP',
  ...keys.map(key=>applicationFieldLabel(key).toLocaleUpperCase('id')),'STATUS','SUBMITTED','CV','ACTIONS'];
 const paint=query=>{
  const filtered=rows.filter(row=>`${row.full_name} ${row.whatsapp} ${row.position} ${row.city} ${row.district} ${JSON.stringify(row.experience_details||{})}`.toLocaleLowerCase('id').includes(query));
  $('#stage1-rows').innerHTML=stage1RowsHtml(filtered,keys);bindStage1Actions(rows);
 };
 content.innerHTML=header('Lead Register','Data awal dari /apply · ringkasan lamaran dikirim ke WhatsApp HR 08133193313; HR dapat meneruskan kandidat ke Tahap 2')+
  `<section class="panel table-panel">${tableToolbar('Search name / WhatsApp / position…', 'Lead Register')}
   <div class="table-wrap recruitment-data-scroll"><table class="data-table recruitment-wide-table"><thead><tr>${headers.map(label=>`<th>${esc(label)}</th>`).join('')}</tr></thead><tbody id="stage1-rows">${stage1RowsHtml(rows,keys)}</tbody></table></div></section>`;
 bindSearch('#table-search',paint);bindStage1Actions(rows);
}
function bindStage1Actions(rows){
 $$('[data-stage1-wa]').forEach(button=>button.addEventListener('click',()=>{
  const row=rows.find(item=>item.id===button.dataset.stage1Wa);if(!row)return;
  const phone=String(row.whatsapp||'').replace(/\D/g,'');
  if(!phone){say('Nomor WhatsApp kandidat tidak tersedia.');return;}
  const message=`Halo ${row.full_name}, terima kasih telah melamar di Mitra Binamandiri Makmur. Lamaran awal Anda sesuai untuk dilanjutkan ke pengisian formulir kandidat Tahap 2. Silakan isi data lengkap melalui ${stageUrl(2)}. Setelah mengirim formulir, mohon balas pesan ini untuk konfirmasi.`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,'_blank','noopener,noreferrer');
 }));
 $$('[data-stage1-status]').forEach(button=>button.addEventListener('click',async()=>{
  const {error}=await supabase.from('candidate_stage1_applications').update({status:'reviewed'}).eq('id',button.dataset.stage1Status);
  if(error)say(error.message);else{say('Status lamaran diperbarui.');loadView('stage1');}
 }));
 $$('[data-stage1-cv]').forEach(button=>button.addEventListener('click',async()=>{
  const originalText=button.textContent,record=rows.find(item=>item.id===button.dataset.stage1Cv);
  if(!record?.cv_path){say('Path CV tidak ditemukan.');return;}
  button.disabled=true;button.textContent='Menyiapkan…';
  try{
   const {data,error}=await supabase.storage.from('candidate-stage1-cv').createSignedUrl(record.cv_path,300);
   if(error)throw error;
   if(!data?.signedUrl)throw new Error('Tautan CV tidak berhasil dibuat.');
   const link=document.createElement('a');link.className='icon-btn';link.href=data.signedUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Buka CV ↗';
   button.replaceWith(link);say('CV siap dibuka. Klik Buka CV.');
  }catch(error){button.disabled=false;button.textContent=originalText;say(error.message||'CV tidak dapat dibuka.');}
 }));
}
async function renderSettings(){
  const {data,error}=await supabase.from('portal_settings').select('value').eq('key','ktp_ocr_enabled').maybeSingle();
  if(error)throw error;
  const enabled=data?.value===true;
  content.innerHTML=`<section class="panel settings-panel">
    <div class="settings-row">
      <div>
        <h3 class="settings-title">ID Card Scanning (OCR)</h3>
        <p class="settings-sub">Aktifkan pemindaian KTP otomatis untuk formulir kandidat Tahap 2.</p>
      </div>
      <label class="settings-toggle" for="ocr-feature-toggle">
        <span>${enabled?'Enabled':'Disabled'}</span>
        <input id="ocr-feature-toggle" type="checkbox" ${enabled?'checked':''}>
      </label>
    </div>
  </section>`;
  $('#ocr-feature-toggle').addEventListener('change',async event=>{
    const value=event.target.checked;
    const {error}=await supabase.from('portal_settings').upsert({key:'ktp_ocr_enabled',value,updated_at:new Date().toISOString()},{onConflict:'key'});
    if(error){event.target.checked=!value;say(error.message);}
    else{say(value?'OCR enabled.':'OCR disabled.');loadView('settings');}
  });
}

function bindBackgroundCheck(){
 $$('[data-bg-check]').forEach(button=>button.addEventListener('click',async()=>{
  const id=button.dataset.bgCheck,select=$(`[data-bg-value="${id}"]`);if(!select)return;
  const passed=select.value==='passed';
  const {error}=await supabase.from('applicants').update({background_check_status:select.value,disc_invited:passed}).eq('id',id);
  if(error){say(error.message);return;}
  say('Status pemeriksaan disimpan. Kandidat yang lolos dapat membuka DISC dengan mencocokkan NIK.');
  loadView('stage2');
 }));
}
const STAGE2_FIELD_ORDER = [
 // STEP 1 — identitas pribadi (nama, NIK dan posisi ditampilkan di kolom utama)
 'tempat_lahir','tanggal_lahir','gender','gol_darah','agama','warga_negara',
 // STEP 1 — alamat KTP dan domisili
 'alamat_provinsi','alamat_kota_nama','alamat_kecamatan','alamat_desa','alamat_tipe','alamat_jalan','alamat_rt','alamat_rw','alamat_kodepos','domisili_berbeda','domisili',
 // STEP 1 — informasi lamaran
 'telepon','email','tinggi','berat',
 // STEP 2 — keluarga
 'ayah_nama','ayah_umur','ayah_pendidikan','ayah_pekerjaan','ibu_nama','ibu_umur','ibu_pendidikan','ibu_pekerjaan',
 'saudara_count','saudara2_nama','saudara2_lp','saudara2_umur','saudara2_pendidikan','saudara2_pekerjaan',
 'saudara3_nama','saudara3_lp','saudara3_umur','saudara3_pendidikan','saudara3_pekerjaan',
 'saudara4_nama','saudara4_lp','saudara4_umur','saudara4_pendidikan','saudara4_pekerjaan',
 'status_kawin','pasangan_nama','pasangan_lp','pasangan_umur','pasangan_pendidikan','pasangan_pekerjaan','anak_count',
 'anak1_nama','anak1_lp','anak1_umur','anak1_pendidikan','anak1_pekerjaan',
 'anak2_nama','anak2_lp','anak2_umur','anak2_pendidikan','anak2_pekerjaan',
 'anak3_nama','anak3_lp','anak3_umur','anak3_pendidikan','anak3_pekerjaan',
 // STEP 2 — pendidikan formal
 'pendidikan_terakhir','sd_instansi','sd_kota','sd_lulus','smp_instansi','smp_kota','smp_lulus',
 'sma_instansi','sma_kota','sma_jurusan','sma_lulus','diploma_instansi','diploma_kota','diploma_jurusan','diploma_lulus',
 'universitas_instansi','universitas_kota','universitas_jurusan','universitas_lulus',
 // STEP 3 — bahasa, hobi dan pengalaman kerja
 'bahasa_count','bahasa1','bahasa1_bicara','bahasa1_baca','bahasa1_tulis','bahasa1_lainnya',
 'bahasa2','bahasa2_bicara','bahasa2_baca','bahasa2_tulis','bahasa2_lainnya',
 'bahasa3','bahasa3_bicara','bahasa3_baca','bahasa3_tulis','bahasa3_lainnya',
 'bahasa4','bahasa4_bicara','bahasa4_baca','bahasa4_tulis','bahasa4_lainnya','hobby','kerja_count',
 ...[1,2,3].flatMap(i=>['perusahaan','periode_mulai','periode_selesai','jabatan','usaha','jumlah','atasan','gaji','alasan'].map(key=>`kerja${i}_${key}`)),
 // STEP 4 — ekspektasi, kontak darurat dan pertanyaan terbuka
 'mulai_kerja','gaji_harapan','fasilitas_harapan',
 'referensi1_nama','referensi1_alamat','referensi1_telepon','referensi1_pekerjaan','referensi1_hubungan',
 'jawaban1','jawaban2','jawaban3',
 // STEP 5 — pernyataan
 'setuju'
];
const STAGE2_FIELD_RANK = new Map(STAGE2_FIELD_ORDER.map((key,index)=>[key,index]));
function stage2FieldKeys(rows){
 const excluded=new Set(['nama','nik','posisi','ktp_foto','ktp_path','cv_path','alamat_asal','alamat_provinsi_id','alamat_kota_id','alamat_kecamatan_id','alamat_desa_id','alamat_kota_jenis','alamat_wilayah_type','umur','nama_terang','saudara1_nama','saudara1_lp','saudara1_umur','saudara1_pendidikan','saudara1_pekerjaan','__form_step','__saved_at','__cv_filename','__cv_path']);
 const keys=new Set();
 rows.forEach(row=>Object.keys(row.application_data||{}).forEach(key=>{
  if(excluded.has(key)||key.startsWith('__')||key.endsWith('_id'))return;
  keys.add(key);
 }));
 return [...keys].sort((a,b)=>{
  const ra=STAGE2_FIELD_RANK.get(a),rb=STAGE2_FIELD_RANK.get(b);
  if(ra!==undefined||rb!==undefined)return (ra??Number.MAX_SAFE_INTEGER)-(rb??Number.MAX_SAFE_INTEGER);
  // Unknown/legacy fields are retained after current fields, grouped by their
  // numeric repeat index before a stable Indonesian label sort.
  const ma=a.match(/^(saudara|anak|bahasa|kerja)(\d+)_/),mb=b.match(/^(saudara|anak|bahasa|kerja)(\d+)_/);
  if(ma&&mb&&ma[1]===mb[1]&&Number(ma[2])!==Number(mb[2]))return Number(ma[2])-Number(mb[2]);
  return applicationFieldLabel(a).localeCompare(applicationFieldLabel(b),'id',{numeric:true,sensitivity:'base'});
 });
}
function stage2RowHtml(row,keys){
 const data=row.application_data||{};
 return `<tr><td><b>${esc(row.full_name)}</b><small class="table-subline">${esc(row.nik)}</small></td>
  <td>${esc(row.position||data.posisi||'—')}</td>
  ${keys.map(key=>`<td>${esc(displayApplicationValue(data[key]))}</td>`).join('')}
  <td>${row.ktp_path?`<button class="icon-btn" data-stage2-ktp="${esc(row.id)}">Buka KTP</button>`:'—'}</td>
  <td>${row.cv_path?`<button class="icon-btn" data-stage2-cv="${esc(row.id)}">Buka CV</button>`:'—'}</td>
  <td>${statusPill(row.stage)}</td><td><select class="select" style="min-width:145px" data-bg-value="${esc(row.id)}">
   <option value="pending" ${(row.background_check_status||'pending')==='pending'?'selected':''}>Menunggu</option>
   <option value="passed" ${row.background_check_status==='passed'?'selected':''}>Lolos</option>
   <option value="failed" ${row.background_check_status==='failed'?'selected':''}>Tidak lolos</option>
  </select></td><td><div class="row-actions stage2-actions"><button class="icon-btn" data-bg-check="${esc(row.id)}">Simpan kelayakan DISC</button>
   <button class="icon-btn" data-stage2-edit="${esc(row.id)}">Edit</button><button class="icon-btn danger" data-stage2-delete="${esc(row.id)}">Delete</button></div></td></tr>`;
}
function openSignedDocumentInNewTab(bucket,path,label,button){
 // Open the blank tab synchronously inside the click handler so popup blockers
 // do not turn a single-click action into a second-click workflow.
 const tab=window.open('about:blank','_blank');
 if(!tab){say('Tab dokumen diblokir browser. Izinkan pop-up untuk HR&GA Workspace lalu coba lagi.');return;}
 try{tab.opener=null;tab.document.title=`Menyiapkan ${label}`;tab.document.body.innerHTML=`<p style="font:14px Arial,sans-serif;padding:24px;color:#243238">Menyiapkan dokumen…</p>`;}catch{}
 const original=button?.textContent;
 if(button){button.disabled=true;button.textContent='Membuka…';}
 supabase.storage.from(bucket).createSignedUrl(path,300).then(({data,error})=>{
  if(error)throw error;
  if(!data?.signedUrl)throw new Error(`Tautan ${label} tidak berhasil dibuat.`);
  tab.location.replace(data.signedUrl);
 }).catch(error=>{
  try{tab.close();}catch{}
  say(error.message||`${label} tidak dapat dibuka.`);
 }).finally(()=>{
  if(button){button.disabled=false;button.textContent=original||`Buka ${label}`;}
 });
}
function bindStage2DocumentActions(){
 const bind=(selector,bucket,pathKey,label,datasetKey)=>{
  $$(selector).forEach(button=>button.addEventListener('click',()=>{
   const record=applicants.find(item=>item.id===button.dataset[datasetKey]);
   if(!record?.[pathKey]){say(`Path ${label} tidak ditemukan.`);return;}
   openSignedDocumentInNewTab(bucket,record[pathKey],label,button);
  }));
 };
 bind('[data-stage2-ktp]','candidate-identity','ktp_path','KTP','stage2Ktp');
 bind('[data-stage2-cv]','candidate-files','cv_path','CV','stage2Cv');
}
async function loadPositionList(){
 const {data,error}=await supabase.from('portal_settings').select('value').eq('key','application_positions').maybeSingle();
 if(error)throw error;
 const values=Array.isArray(data?.value)?data.value:[];
 return [...new Set(values.map(value=>String(value||'').trim()).filter(Boolean))];
}
async function savePositionList(positions){
 const clean=[...new Set(positions.map(value=>String(value||'').trim()).filter(Boolean))];
 if(!clean.length)throw new Error('Daftar posisi tidak boleh kosong.');
 if(clean.length!==positions.length)throw new Error('Nama posisi kosong atau duplikat. Periksa kembali daftar.');
 const {error}=await supabase.from('portal_settings').upsert({key:'application_positions',value:clean,updated_at:new Date().toISOString()},{onConflict:'key'});
 if(error)throw error;
}
function positionManagerHtml(positions){
 return `<section class="panel position-manager"><div class="panel-head"><div><h3>Daftar Lowongan</h3><p>Perubahan digunakan oleh pilihan posisi di /form dan /apply.</p></div></div>
  <div class="position-manager-body"><div id="position-rows">${positions.map((position,index)=>`<div class="position-row"><input class="input" maxlength="100" data-position-index="${index}" value="${esc(position)}" aria-label="Nama posisi ${index+1}"><button type="button" class="icon-btn" data-position-delete="${index}" ${positions.length===1?'disabled':''}>Delete</button></div>`).join('')}</div>
  <div class="position-add-row"><input class="input" id="new-position" maxlength="100" placeholder="Nama posisi baru"><button type="button" class="btn btn-secondary" id="add-position">Tambah posisi</button></div>
  <div class="position-manager-foot"><small>Nama posisi akan menjadi pilihan resmi kandidat.</small><button type="button" class="btn btn-primary" id="save-positions">Simpan daftar posisi</button></div></div></section>`;
}
function bindPositionManager(positions){
 $('#add-position')?.addEventListener('click',async()=>{
  const value=$('#new-position')?.value.trim()||'';
  if(!value){say('Isi nama posisi terlebih dahulu.');return;}
  if(positions.some(item=>item.toLocaleLowerCase('id')===value.toLocaleLowerCase('id'))){say('Nama posisi sudah ada.');return;}
  try{await savePositionList([...positions,value]);say('Posisi baru ditambahkan.');loadView('stage2');}catch(error){say(error.message||'Posisi gagal ditambahkan.');}
 });
 $$('[data-position-delete]').forEach(button=>button.addEventListener('click',async()=>{
  const index=Number(button.dataset.positionDelete),next=positions.filter((_,i)=>i!==index);
  try{await savePositionList(next);say('Posisi dihapus dari daftar kandidat.');loadView('stage2');}catch(error){say(error.message||'Posisi gagal dihapus.');}
 }));
 $('#save-positions')?.addEventListener('click',async()=>{
  const values=$$('[data-position-index]').map(input=>input.value.trim());
  if(values.some(value=>!value)){say('Nama posisi tidak boleh kosong.');return;}
  if(new Set(values.map(value=>value.toLocaleLowerCase('id'))).size!==values.length){say('Nama posisi tidak boleh duplikat.');return;}
  try{await savePositionList(values);say('Daftar posisi diperbarui.');loadView('stage2');}catch(error){say(error.message||'Daftar posisi gagal disimpan.');}
 });
}
function candidateEditModal() {
 let modal=$('#candidate-edit-modal');
 if(modal)return modal;
 modal=document.createElement('div');
 modal.id='candidate-edit-modal';modal.className='modal-backdrop hidden';
 modal.innerHTML=`<section class="employee-modal-card candidate-edit-card" role="dialog" aria-modal="true" aria-labelledby="candidate-edit-title">
  <div class="employee-modal-head candidate-edit-head"><div><small>RECRUITMENT · CANDIDATE REVIEW</small><h2 id="candidate-edit-title">Edit Candidate</h2><p id="candidate-edit-summary"></p></div><button type="button" class="modal-close" id="candidate-edit-close" aria-label="Tutup">×</button></div>
  <div id="candidate-edit-form-slot" class="candidate-edit-form-slot"></div>
  <div id="candidate-edit-error" class="form-error candidate-edit-error" role="alert"></div>
  <div class="employee-modal-actions candidate-edit-footer"><button type="button" class="btn btn-secondary" id="candidate-edit-cancel">Batal</button><button type="button" class="btn btn-primary" id="candidate-edit-save">Simpan perubahan</button></div>
 </section>`;
 document.body.append(modal);
 const close=()=>{modal.classList.add('hidden');editingApplicantId=null;adminEditorBinding=null;};
 $('#candidate-edit-close',modal).addEventListener('click',close);
 $('#candidate-edit-cancel',modal).addEventListener('click',close);
 modal.addEventListener('click',event=>{if(event.target===modal)close();});
 $('#candidate-edit-save',modal).addEventListener('click',saveStage2Candidate);
 return modal;
}

async function openStage2CandidateEditor(applicant) {
 const modal=candidateEditModal();editingApplicantId=applicant.id;adminEditorBinding=null;
 const values={...(applicant.application_data||{}),nama:applicant.full_name||applicant.application_data?.nama||'',nik:applicant.nik||applicant.application_data?.nik||'',posisi:applicant.position||applicant.application_data?.posisi||'',cv_path:applicant.cv_path||'',ktp_path:applicant.ktp_path||''};
 $('#candidate-edit-title',modal).textContent=`Koreksi · ${applicant.full_name||'Tanpa nama'}`;
 $('#candidate-edit-summary',modal).textContent=`${values.nik} · ${values.posisi} · Lima bagian mengikuti formulir kandidat`;
 $('#candidate-edit-error',modal).textContent='';
 $('#candidate-edit-save',modal).disabled=true;$('#candidate-edit-save',modal).textContent='Menyiapkan formulir…';
 $('#candidate-edit-form-slot',modal).innerHTML=renderAdminEditorMarkup(values,stage2PositionsCache);
 modal.classList.remove('hidden');
 try{
  const form=$('#admin-candidate-form',modal);
  $$('[data-admin-document]',modal).forEach(button=>button.addEventListener('click',()=>{
   const current=applicants.find(item=>item.id===editingApplicantId);if(!current)return;
   const isKtp=button.dataset.adminDocument==='ktp';
   const path=isKtp?current.ktp_path:current.cv_path;
   if(!path){say(`${isKtp?'Foto KTP':'CV'} tidak tersedia.`);return;}
   openSignedDocumentInNewTab(isKtp?'candidate-identity':'candidate-files',path,isKtp?'KTP':'CV',button);
  }));
  adminEditorBinding=await bindAdminEditorForm(form,values);
 }catch(error){console.warn('Admin form editor initialization:',error);say('Form dibuka, tetapi sebagian daftar wilayah belum dapat dimuat.');}
 finally{$('#candidate-edit-save',modal).disabled=false;$('#candidate-edit-save',modal).textContent='Simpan perubahan';}
}

async function saveStage2Candidate() {
 const modal=$('#candidate-edit-modal'),errorBox=$('#candidate-edit-error',modal),save=$('#candidate-edit-save',modal);
 const applicant=applicants.find(item=>item.id===editingApplicantId);
 const form=$('#admin-candidate-form',modal);
 if(!applicant||!form||!adminEditorBinding){errorBox.textContent='Form koreksi belum siap. Tutup lalu buka kembali data kandidat.';return;}
 const fullName=String(form.elements.namedItem('nama')?.value||'').trim();
 const nik=String(form.elements.namedItem('nik')?.value||'').replace(/\D/g,'');
 const position=String(form.elements.namedItem('posisi')?.value||'').trim();
 if(fullName.length<2){errorBox.textContent='Nama lengkap minimal 2 karakter.';adminEditorBinding.goToStep(0);form.elements.namedItem('nama')?.focus();return;}
 if(!/^\d{16}$/.test(nik)){errorBox.textContent='NIK harus tepat 16 angka.';adminEditorBinding.goToStep(0);form.elements.namedItem('nik')?.focus();return;}
 if(!position){errorBox.textContent='Posisi dilamar wajib dipilih.';adminEditorBinding.goToStep(0);form.elements.namedItem('posisi')?.focus();return;}
 if(applicants.some(item=>item.id!==applicant.id&&item.nik===nik)){errorBox.textContent='NIK tersebut sudah digunakan kandidat lain.';adminEditorBinding.goToStep(0);form.elements.namedItem('nik')?.focus();return;}
 const nextData=collectAdminEditorData(form,applicant.application_data||{});
 nextData.nama=fullName;nextData.nik=nik;nextData.posisi=position;
 errorBox.textContent='';save.disabled=true;save.textContent='Menyimpan…';
 try{
  const {error}=await supabase.from('applicants').update({full_name:fullName,nik,position,application_data:nextData,updated_at:new Date().toISOString()}).eq('id',applicant.id);
  if(error)throw error;
  say(`Data ${fullName} berhasil diperbarui.`);
  modal.classList.add('hidden');editingApplicantId=null;adminEditorBinding=null;
  await loadView('stage2');
 }catch(saveError){errorBox.textContent=saveError.message||'Data kandidat gagal disimpan.';}
 finally{save.disabled=false;save.textContent='Simpan perubahan';}
}
function bindStage2CandidateActions() {
 $$('[data-stage2-edit]').forEach(button=>button.addEventListener('click',()=>{
  const applicant=applicants.find(item=>item.id===button.dataset.stage2Edit);
  if(applicant)openStage2CandidateEditor(applicant).catch(error=>say(error.message||'Form koreksi gagal dibuka.'));
 }));
 $$('[data-stage2-delete]').forEach(button=>button.addEventListener('click',async()=>{
  const applicant=applicants.find(item=>item.id===button.dataset.stage2Delete);
  if(!applicant)return;
  if(employees.some(employee=>employee.applicant_id===applicant.id)){
   say('Kandidat sudah terhubung dengan Tracking Karyawan. Hapus atau kelola data karyawan terlebih dahulu agar riwayat tetap aman.');return;
  }
  const confirmed=window.confirm(`Hapus kandidat ${applicant.full_name} (NIK ${applicant.nik})? Data formulir dan jawaban DISC terkait juga akan dihapus. Tindakan ini tidak dapat dibatalkan.`);
  if(!confirmed)return;
  button.disabled=true;button.textContent='Menghapus…';
  try{
   const {error}=await supabase.from('applicants').delete().eq('id',applicant.id);
   if(error)throw error;
   applicants=applicants.filter(item=>item.id!==applicant.id);
   const cleanupErrors=[];
   if(applicant.cv_path){const result=await supabase.storage.from('candidate-files').remove([applicant.cv_path]);if(result.error)cleanupErrors.push('CV');}
   if(applicant.ktp_path){const result=await supabase.storage.from('candidate-identity').remove([applicant.ktp_path]);if(result.error)cleanupErrors.push('KTP');}
   say(cleanupErrors.length?`Kandidat terhapus. Berkas ${cleanupErrors.join(' dan ')} perlu dibersihkan melalui Storage.`:`Kandidat ${applicant.full_name} berhasil dihapus.`);
   await loadView('stage2');
  }catch(error){button.disabled=false;button.textContent='Hapus';say(error.message||'Kandidat gagal dihapus.');}
 }));
}

async function renderStage2(){
 const allRows=applicants.filter(row=>row.stage!=='stage1_pending'&&row.stage!=='rejected');
 const positions=await loadPositionList(),keys=stage2FieldKeys(allRows);
 stage2PositionsCache=positions.slice();
 const renderRows=rows=>rows.length?rows.map(row=>stage2RowHtml(row,keys)).join(''):emptyRow(7+keys.length,'No candidate forms');
 const columns=['APPLICANT','POSITION',...keys.map(key=>applicationFieldLabel(key).toLocaleUpperCase('id')),'ID CARD','CV','FORM STATUS','BACKGROUND CHECK','ACTIONS'];
 content.innerHTML=header('Candidate List','Seluruh field tersimpan, lampiran KTP/CV, dan kelayakan DISC · NIK adalah identitas utama')+
  `<section class="panel table-panel stage2-candidate-panel">${tableToolbar('Search name / NIK / position…','Candidate List')}
   <div class="table-wrap recruitment-data-scroll"><table class="data-table recruitment-wide-table"><thead><tr>${columns.map(label=>`<th>${esc(label)}</th>`).join('')}</tr></thead><tbody id="candidate-rows">${renderRows(allRows)}</tbody></table></div></section>`+
  positionManagerHtml(positions);
 bindPositionManager(positions);
 const repaint=query=>{
  const filtered=allRows.filter(row=>`${row.full_name} ${row.nik} ${row.position} ${JSON.stringify(row.application_data||{})}`.toLocaleLowerCase('id').includes(query));
  $('#candidate-rows').innerHTML=renderRows(filtered);bindBackgroundCheck();bindStage2DocumentActions();bindStage2CandidateActions();
 };
 bindSearch('#table-search',repaint);bindBackgroundCheck();bindStage2DocumentActions();bindStage2CandidateActions();
}

function renderStage3(){
 const rows=applicants.filter(row=>getDiscForApplicant(row)||row.stage==='disc_completed'||row.stage==='hired');
 content.innerHTML=header('DISC Assessment','Grafik DISC dan pola kepribadian dihitung dari rumus DISC HR&GA Workspace')+
  `<section class="panel table-panel">${tableToolbar('Search candidates…','DISC Assessment')}<div class="table-wrap recruitment-data-scroll"><table class="data-table recruitment-wide-table">
   <thead><tr><th>APPLICANT / NIK</th><th>POSITION</th><th>AGE</th><th>STATUS</th><th>DISC GRAPHS (G1 · G2 · G3)</th><th>PERSONALITY / NATURAL PATTERN</th><th>ACTIONS</th></tr></thead>
   <tbody id="candidate-rows">${applicantRows(rows,'both')}</tbody></table></div></section>`;
 const repaint=query=>{
  $('#candidate-rows').innerHTML=applicantRows(rows.filter(row=>`${row.full_name} ${row.nik} ${row.position}`.toLocaleLowerCase('id').includes(query)),'both');
  bindPrint();bindHire();
 };
 bindSearch('#table-search',repaint);bindPrint();bindHire();
}

function employeeRows(rows) {
  if (!rows.length) return emptyRow(7);
  return rows.map(employee => {
    const applicant = applicants.find(a => a.id === employee.applicant_id);
    return `<tr>
      <td><b>${esc(applicant?.full_name || '—')}</b><small class="table-subline">${esc(applicant?.nik || '')}</small></td>
      <td>${esc(employee.employee_no)}</td><td>${esc(employee.department || '—')}</td>
      <td>${esc(employee.position || applicant?.position || '—')}</td>
      <td><span class="status-pill ${employee.employment_status === 'Nonaktif' ? 'gray' : 'green'}">${esc(employee.employment_status)}</span></td>
      <td data-sort-value="${esc(employee.join_date||'')}">${idDate(employee.join_date)}</td><td><button class="icon-btn" data-edit-employee="${esc(employee.id)}">Edit</button></td>
    </tr>`;
  }).join('');
}

function renderEmployees() {
  content.innerHTML = header('Employee Tracking', 'Data karyawan yang telah dipindahkan dari proses rekrutmen', '<button id="export-employees" class="btn btn-primary">Unduh XLSX ↓</button>') + `
    <section class="panel table-panel">${tableToolbar('Search employee / number…', 'Employee List')}<div class="table-wrap"><table class="data-table">
      <thead><tr><th>EMPLOYEE</th><th>EMPLOYEE NO.</th><th>DEPARTMENT</th><th>POSITION</th><th>STATUS</th><th>JOIN DATE</th><th>ACTIONS</th></tr></thead>
      <tbody id="employee-rows">${employeeRows(employees)}</tbody>
    </table></div></section>`;
  bindSearch('#table-search', query => {
    const rows = employees.filter(e => {
      const a = applicants.find(x => x.id === e.applicant_id);
      return `${a?.full_name || ''} ${a?.nik || ''} ${e.employee_no} ${e.department || ''} ${e.position || ''}`.toLocaleLowerCase('id').includes(query);
    });
    $('#employee-rows').innerHTML = employeeRows(rows);
    bindEmployeeEdit();
  });
  $('#export-employees').addEventListener('click', exportEmployees);
  bindEmployeeEdit();
}

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
  const { data, error } = await supabase.from('print_templates')
    .select('id,source_filename,schema_version,is_active,created_at')
    .order('created_at', { ascending: false }).limit(30);
  if (error) {
    printTemplates = [];
    return error;
  }
  printTemplates = data || [];
  return null;
}

function templateManagerHtml(migrationError = null) {
  const active = printTemplates.find(t => t.is_active);
  const currentName = active?.source_filename || 'Master bawaan repository';
  const history = printTemplates.length ? printTemplates.map(template => `<tr>
    <td><b>${esc(template.source_filename)}</b><small class="table-subline">${esc(template.schema_version || '—')}</small></td>
    <td data-sort-value="${esc(template.created_at||'')}">${idDate(template.created_at)}</td>
    <td>${template.is_active ? '<span class="status-pill green">Aktif</span>' : '<span class="status-pill gray">Arsip</span>'}</td>
    <td>${template.is_active ? '' : `<button class="icon-btn" data-template-activate="${esc(template.id)}">Jadikan aktif</button>`}</td>
  </tr>`).join('') : emptyRow(4, 'Belum ada versi master tambahan. Master bawaan tetap digunakan.');
  const controls = migrationError
    ? `<div class="form-error template-error">Riwayat master belum tersedia. Jalankan <code>supabase/SETUP-ALL-IN-ONE.sql</code> di Supabase SQL Editor untuk mengaktifkan master versi.</div>`
    : `<div class="template-current"><div><small>MASTER AKTIF</small><b>${esc(currentName)}</b><span>${active ? `Diperbarui ${idDate(active.created_at)}` : 'Menggunakan file templates/application-master.html'}</span></div>
        <button class="btn btn-secondary" id="restore-template">Pulihkan master bawaan</button></div>
      <form id="template-upload-form" class="template-upload">
        <div class="template-upload-copy"><b>Ganti desain master</b><span>Unggah HTML baru. Field <code>name</code> yang lama wajib dipertahankan.</span></div>
        <input id="template-file" class="input" type="file" accept=".html,text/html" required>
        <button class="btn btn-primary" type="submit">Simpan & aktifkan</button>
      </form>
      <div class="template-history"><div class="template-history-title">Riwayat versi tersimpan</div><div class="table-wrap"><table class="data-table"><thead><tr><th>MASTER FILE</th><th>DATE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${history}</tbody></table></div></div>`;
  return `<section class="panel template-manager">
    <div class="panel-head"><div><h3>Master HTML lamaran</h3><p>Desain dapat diganti tanpa mengubah struktur data formulir</p></div><span class="status-pill ${active ? 'green' : 'blue'}">${active ? 'Versi tersimpan' : 'Master bawaan'}</span></div>
    <div class="template-manager-body">${controls}</div>
  </section>`;
}

function renderPrint() {
  content.innerHTML = header('Application Print', 'Dokumen disusun otomatis: Lamaran · CV · DISC') + `
    <section class="panel table-panel">${tableToolbar()}<div class="table-wrap"><table class="data-table">
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

async function renderReports() {
  const { data: stage1Data, error } = await supabase.from('candidate_stage1_applications')
    .select('id,position,status,created_at').order('created_at', { ascending: false }).limit(2000);
  if (error) throw error;
  const stage1Rows = stage1Data || [];
  const counts = [
    ['Lamaran Tahap 1', stage1Rows.length],
    ['Formulir Tahap 2', applicants.filter(a => ['application_submitted','disc_completed','stage4_pending','hired'].includes(a.stage)).length],
    ['Background check lolos', applicants.filter(a => a.background_check_status === 'passed').length],
    ['Tes DISC selesai', applicants.filter(a => Boolean(getDiscForApplicant(a)) || a.stage === 'disc_completed').length],
    ['Karyawan terdaftar', employees.length],
    ['Tidak dilanjutkan', applicants.filter(a => a.stage === 'rejected').length]
  ];
  const positions = new Map();
  for (const row of [...stage1Rows, ...applicants]) {
    const position = String(row.position || 'Belum ditentukan');
    positions.set(position, (positions.get(position) || 0) + 1);
  }
  const safeCsv = value => {
    const text = String(value ?? '');
    const protectedText = /^\s*[=+@-]/.test(text) ? "'" + text : text;
    return '"' + protectedText.replace(/"/g, '""') + '"';
  };
  content.innerHTML = header('Recruitment Reports', 'Ringkasan data aktual dari lamaran Tahap 1, kandidat, DISC, dan karyawan',
    '<button id="export-recruitment-report" class="btn btn-primary">Unduh CSV ↓</button>') + `
    <div class="stat-grid reports-stat-grid">${counts.map(([label,value]) => `<article class="stat-card"><div class="stat-top">${esc(label)}</div><div class="stat-number">${value}</div><div class="stat-note">Data tersimpan</div></article>`).join('')}</div>
    <section class="panel table-panel"><div class="panel-head"><div><h3>Distribusi posisi</h3><p>Gabungan lamaran awal dan formulir kandidat</p></div><span class="status-pill blue">${positions.size} posisi</span></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>POSITION</th><th>COUNT</th></tr></thead><tbody>${[...positions.entries()].sort((a,b)=>b[1]-a[1]).map(([name,total])=>`<tr><td>${esc(name)}</td><td>${total}</td></tr>`).join('') || emptyRow(2)}</tbody></table></div></section>
    <section class="panel table-panel"><div class="panel-head"><div><h3>Catatan laporan</h3><p>Ringkasan dibangun dari data yang saat ini tersimpan</p></div></div><div class="panel-body"><p class="subtle">Lamaran Tahap 1 merupakan alur publik terpisah. Kandidat baru dihitung pada Tahap 2 setelah formulir kandidat lengkap dikirim. Angka tidak menggandakan hasil DISC atau status karyawan.</p></div></section>`;
  $('#export-recruitment-report').addEventListener('click', () => {
    const rows = [['Kategori','Jumlah'], ...counts];
    rows.push([]);
    rows.push(['Posisi','Jumlah']);
    for (const [name,total] of positions) rows.push([name,total]);
    const csv = '\uFEFF' + rows.map(row => row.map(safeCsv).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `Laporan_Rekrutmen_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say('Laporan CSV berhasil disiapkan.');
  });
}

function renderPlaceholder(title) {
  content.innerHTML = `<section class="panel placeholder-panel"><div><div class="placeholder-symbol" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg></div><h2>${esc(title || 'Modul Dalam Pengembangan')}</h2><p>Modul ini disiapkan untuk pengelolaan operasional terintegrasi.</p></div></section>`;
}

function bindPrint() {
  $$('[data-print]').forEach(button => {
    button.addEventListener('click', async () => {
      const record = applicants.find(a => a.id === button.dataset.print);
      if (!record) return;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Menyiapkan…';
      try { await printApplication(record); }
      catch (error) { say(error.message || 'Dokumen tidak dapat disiapkan.'); }
      finally { button.disabled = false; button.textContent = originalText; }
    });
  });
}

function employeeModal() {
  let modal = $('#employee-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'employee-modal';
  modal.className = 'modal-backdrop hidden';
  modal.innerHTML = `<section class="employee-modal-card" role="dialog" aria-modal="true" aria-labelledby="employee-modal-title">
    <div class="employee-modal-head"><div><small>TRACKING KARYAWAN</small><h2 id="employee-modal-title">Data karyawan</h2></div><button type="button" class="modal-close" id="employee-modal-close" aria-label="Tutup">×</button></div>
    <form id="employee-form">
      <div class="employee-form-grid">
        <label>Nomor karyawan<input class="input" name="employee_no" required maxlength="40"></label>
        <label>Departemen<input class="input" name="department" maxlength="120"></label>
        <label>Posisi<input class="input" name="position" maxlength="120"></label>
        <label>Status<select class="select" name="employment_status"><option>Aktif</option><option>Probation</option><option>Kontrak</option><option>Tetap</option><option>Nonaktif</option></select></label>
        <label>Tanggal masuk<input class="input" type="date" name="join_date"></label>
        <label class="employee-notes">Catatan<textarea class="textarea" name="notes" rows="3" maxlength="2000"></textarea></label>
      </div>
      <div class="employee-modal-actions"><button type="button" class="btn btn-secondary" id="employee-cancel">Batal</button><button type="submit" class="btn btn-primary" id="employee-save">Simpan data</button></div>
      <div id="employee-form-error" class="form-error" role="alert"></div>
    </form>
  </section>`;
  document.body.append(modal);
  const close = () => { modal.classList.add('hidden'); editingEmployeeId = null; hiringApplicantId = null; };
  $('#employee-modal-close', modal).addEventListener('click', close);
  $('#employee-cancel', modal).addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  $('#employee-form', modal).addEventListener('submit', saveEmployee);
  return modal;
}

function openEmployeeModal(employee = null, applicant = null) {
  const modal = employeeModal();
  const form = $('#employee-form', modal);
  form.reset();
  editingEmployeeId = employee?.id || null;
  hiringApplicantId = applicant?.id || null;
  const generatedNo = `EMP-${new Date().getFullYear()}-${(applicant?.id || crypto.randomUUID()).slice(0, 8).toUpperCase()}`;
  form.elements.employee_no.value = employee?.employee_no || generatedNo;
  form.elements.department.value = employee?.department || '';
  form.elements.position.value = employee?.position || applicant?.position || '';
  form.elements.employment_status.value = employee?.employment_status || 'Aktif';
  form.elements.join_date.value = employee?.join_date || new Date().toISOString().slice(0, 10);
  form.elements.notes.value = employee?.notes || '';
  $('#employee-modal-title', modal).textContent = employee ? 'Ubah data karyawan' : `Konversi ${applicant?.full_name || 'kandidat'}`;
  $('#employee-form-error', modal).textContent = '';
  modal.classList.remove('hidden');
  form.elements.employee_no.focus();
}

async function saveEmployee(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const saveButton = $('#employee-save');
  const errorBox = $('#employee-form-error');
  const fields = Object.fromEntries(new FormData(form).entries());
  errorBox.textContent = '';
  saveButton.disabled = true;
  saveButton.textContent = 'Menyimpan…';
  try {
    if (editingEmployeeId) {
      const { error } = await supabase.from('employees').update({
        employee_no: fields.employee_no.trim(), department: fields.department.trim(),
        position: fields.position.trim(), employment_status: fields.employment_status,
        join_date: fields.join_date || null, notes: fields.notes.trim(), updated_at: new Date().toISOString()
      }).eq('id', editingEmployeeId);
      if (error) throw error;
      say('Data karyawan diperbarui.');
    } else if (hiringApplicantId) {
      const { error } = await supabase.rpc('convert_applicant_to_employee', {
        p_applicant_id: hiringApplicantId,
        p_employee_no: fields.employee_no.trim(),
        p_department: fields.department.trim(),
        p_position: fields.position.trim(),
        p_employment_status: fields.employment_status,
        p_join_date: fields.join_date || null,
        p_notes: fields.notes.trim()
      });
      if (error) throw error;
      const applicant = applicants.find(a => a.id === hiringApplicantId);
      say(`${applicant?.full_name || 'Kandidat'} ditambahkan ke tracking karyawan.`);
    }
    $('#employee-modal').classList.add('hidden');
    editingEmployeeId = null;
    hiringApplicantId = null;
    await loadView(activeView === 'employees' ? 'employees' : 'stage3');
  } catch (error) {
    errorBox.textContent = error.message || 'Data gagal disimpan.';
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Simpan data';
  }
}

function bindHire() {
  $$('[data-hire]').forEach(button => button.addEventListener('click', () => {
    const applicant = applicants.find(a => a.id === button.dataset.hire);
    if (applicant) openEmployeeModal(null, applicant);
  }));
}
function bindEmployeeEdit() {
  $$('[data-edit-employee]').forEach(button => button.addEventListener('click', () => {
    const employee = employees.find(e => e.id === button.dataset.editEmployee);
    if (employee) openEmployeeModal(employee);
  }));
}

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function exportEmployees() {
  const button = $('#export-employees');
  button.disabled = true;
  button.textContent = 'Menyiapkan XLSX…';
  try {
    const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
    const employeeRowsData = employees.map(employee => {
      const applicant = applicants.find(a => a.id === employee.applicant_id);
      const data = applicant?.application_data || {};
      return {
        'Nomor Karyawan': employee.employee_no,
        'Nama Lengkap': applicant?.full_name || data.nama || '',
        'NIK': applicant?.nik || data.nik || '',
        'Posisi': employee.position || applicant?.position || '',
        'Departemen': employee.department || '',
        'Status Karyawan': employee.employment_status || '',
        'Tanggal Masuk': employee.join_date || '',
        'Tanggal Dibuat': employee.created_at || '',
        'Catatan HR': employee.notes || ''
      };
    });
    const applicationRows = employees.map(employee => {
      const applicant = applicants.find(a => a.id === employee.applicant_id);
      const data = applicant?.application_data || {};
      const standard = {
        'Nomor Karyawan': employee.employee_no,
        'Nama Lengkap': applicant?.full_name || data.nama || '',
        'NIK': applicant?.nik || data.nik || '',
        'Posisi Dilamar': applicant?.position || data.posisi || ''
      };
      const extra = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, cellText(value)]));
      return { ...standard, ...extra };
    });
    const workbook = XLSX.utils.book_new();
    const employeeHeaders = [...new Set(employeeRowsData.flatMap(row => Object.keys(row)))];
    const employeeSheet = XLSX.utils.json_to_sheet(employeeRowsData, { header: employeeHeaders });
    employeeSheet['!cols'] = employeeHeaders.map(key => ({ wch: Math.min(34, Math.max(14, key.length + 4)) }));
    XLSX.utils.book_append_sheet(workbook, employeeSheet, 'Karyawan');

    const appHeaders = [...new Set(applicationRows.flatMap(row => Object.keys(row)))];
    if (appHeaders.length) {
      const applicationSheet = XLSX.utils.json_to_sheet(applicationRows, { header: appHeaders });
      applicationSheet['!cols'] = appHeaders.map(key => ({ wch: Math.min(34, Math.max(14, key.length + 4)) }));
      XLSX.utils.book_append_sheet(workbook, applicationSheet, 'Data Lamaran');
    }
    XLSX.writeFile(workbook, `Data_Karyawan_${new Date().toISOString().slice(0, 10)}.xlsx`);
    say(`${employees.length} data karyawan diekspor ke XLSX.`);
  } catch (error) {
    say(error.message || 'File XLSX gagal dibuat.');
  } finally {
    button.disabled = false;
    button.textContent = 'Export XLSX ↓';
  }
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
    const preview = missing.slice(0, 8).join(', ');
    throw new Error(`Master baru menghilangkan ${missing.length} field lama (${preview}${missing.length > 8 ? ', …' : ''}). Semua atribut name harus dipertahankan.`);
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

async function storeAndActivateTemplate(html, filename) {
  const [baselineResponse] = await Promise.all([fetch(TEMPLATE_URL, { cache: 'no-store' })]);
  if (!baselineResponse.ok) throw new Error('Master bawaan tidak dapat dimuat untuk validasi field.');
  const baselineHtml = await baselineResponse.text();
  const validated = sanitizeAndValidateTemplate(html, baselineHtml);
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
    const form = event.currentTarget;
    const file = $('#template-file').files?.[0];
    const button = form.querySelector('button[type="submit"]');
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && file.type !== 'text/html') { say('Pilih file HTML.'); return; }
    if (file.size > 300 * 1024) { say('Ukuran master HTML maksimal 300 KB.'); return; }
    button.disabled = true; button.textContent = 'Memvalidasi…';
    try {
      await storeAndActivateTemplate(await file.text(), file.name);
      say('Master HTML baru berhasil diaktifkan.');
      await loadView('print');
    } catch (error) { say(error.message || 'Master HTML gagal disimpan.'); }
    finally { button.disabled = false; button.textContent = 'Simpan & aktifkan'; }
  });
  $('#restore-template')?.addEventListener('click', async () => {
    const button = $('#restore-template');
    button.disabled = true; button.textContent = 'Memulihkan…';
    try {
      const response = await fetch(TEMPLATE_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('Master bawaan tidak ditemukan.');
      await storeAndActivateTemplate(await response.text(), 'Master bawaan repository');
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
      say('Versi master berhasil diaktifkan.');
      await loadView('print');
    } catch (error) { say(error.message || 'Versi master gagal diaktifkan.'); button.disabled = false; }
  }));
}

async function loadView(view) {
  activeView = view;
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#page-title').textContent = TITLES[view] || 'Dashboard';
  content.innerHTML = '<section class="panel placeholder-panel"><div><div class="placeholder-symbol" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div><h2>Memuat data</h2></div></section>';
  try {
    const dataViews = new Set(['dashboard','stage1','stage2','stage3','employees','print','settings','reports']);
    if (dataViews.has(view)) await refreshData();
    if (view === 'dashboard') renderDashboard();
    else if (view === 'stage1') await renderStage1();
    else if (view === 'stage2') renderStage2();
    else if (view === 'stage3') renderStage3();
    else if (view === 'employees') renderEmployees();
    else if (view === 'print') renderPrint();
    else if (view === 'settings') await renderSettings();
    else if (view === 'reports') await renderReports();
    else if (TITLES[view]) renderPlaceholder(TITLES[view]);
    else renderPlaceholder('Page not found');
  } catch (error) {
    content.innerHTML = `<section class="panel placeholder-panel"><div><div class="placeholder-symbol" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><h2>Data tidak dapat dimuat</h2><p>${esc(error.message || 'Periksa koneksi Supabase.')}</p><button id="retry-load" class="btn btn-secondary" style="margin-top:18px">Coba lagi</button></div></section>`;
    $('#retry-load')?.addEventListener('click', () => loadView(view));
  }
}

async function openAdmin(session) {
  const { data: isAdmin, error } = await supabase.rpc('is_portal_admin');
  if (error) {
    await supabase.auth.signOut();
    console.error('Portal admin access check failed:', error);
    throw new Error('Login berhasil, tetapi pemeriksaan akses admin gagal. Pastikan supabase/SETUP-ALL-IN-ONE.sql sudah berhasil dijalankan di Supabase SQL Editor.');
  }
  if (!isAdmin) {
    await supabase.auth.signOut();
    throw new Error('Akun berhasil login, tetapi hak akses HR belum aktif. Pastikan username telah terdaftar pada admin_login_credentials melalui SETUP-ALL-IN-ONE.sql.');
  }
  currentUserId = session.user.id;
  const { data: profile } = await supabase.from('admin_users').select('display_name').eq('user_id', session.user.id).maybeSingle();
  adminDisplayName = profile?.display_name || session.user.email || 'HR Admin';
  $('#admin-name').textContent = adminDisplayName;
  loginView.classList.add('hidden');
  shell.classList.remove('hidden');
  await loadView('dashboard');
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
  const user = $('#login-user').value.trim().toLowerCase();
  const pin = $('#login-pin').value.trim();
  const errorBox = $('#login-error');
  const button = event.currentTarget.querySelector('button[type="submit"]');
  errorBox.textContent = '';
  if (!isConfigured) { errorBox.textContent = 'Konfigurasi Supabase belum diisi.'; return; }
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(user)) {
    errorBox.textContent = 'Username 3–32 karakter. Gunakan huruf kecil, angka, titik, _ atau -.';
    return;
  }
  if (!/^\d{4,12}$/.test(pin)) {
    errorBox.textContent = 'PIN harus terdiri dari 4–12 angka.';
    return;
  }

  button.disabled = true;
  button.textContent = 'Memeriksa…';
  try {
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/admin-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_PUBLISHABLE_KEY
      },
      body: JSON.stringify({ username: user, pin })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.session?.access_token || !result.session?.refresh_token) {
      throw new Error(result.error || 'Username atau PIN tidak sesuai.');
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token
    });
    if (error) throw error;
    await openAdmin(data.session);
    $('#login-pin').value = '';
  } catch (error) {
    console.error('Username/PIN login failed:', error);
    errorBox.textContent = error.message || 'Sign-in failed. Check your username and password.';
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
  shell.classList.add('hidden');
  loginView.classList.remove('hidden');
  $('#login-pin').value = '';
  const loginButton = $('#login-form button[type="submit"]');
  if (loginButton) { loginButton.disabled = false; loginButton.textContent = 'Sign In ↗'; }
  currentUserId = null;
});

async function init() {
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
