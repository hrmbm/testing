import { $, $$, esc } from './common.js?v=20261120-hrga-workspace-11';
import {
  INTERVIEW_STAGE_LABELS,
  INTERVIEW_DECISIONS,
  FINAL_INTERVIEW_DECISIONS,
  FINAL_REJECTION_REASONS,
  CONTRACT_DURATION_OPTIONS,
  EMPLOYEE_TABLE_HEADERS,
  calculateContractDates,
  findDefaultInterviewer,
  parseEmployeeSpreadsheetRows,
  buildEmployeeUserOptionLabel,
  verifyPinRevealPassword,
  maskPin
} from './workspace-logic.js?v=20261120-hrga-workspace-11';

/**
 * Prevents accidental modal dismissal when a user highlights/drags text inside
 * a modal input and releases the mouse button outside on the backdrop.
 */
export function bindSafeModalClose(modal, onClose, { closeOnBackdrop = false } = {}) {
  let pointerStartedOnBackdrop = false;
  modal.addEventListener('pointerdown', event => {
    pointerStartedOnBackdrop = event.target === modal;
  });
  modal.addEventListener('click', event => {
    if (!closeOnBackdrop) return;
    const hasSelection = Boolean(window.getSelection?.()?.toString());
    if (pointerStartedOnBackdrop && event.target === modal && !hasSelection) {
      onClose();
    }
    pointerStartedOnBackdrop = false;
  });
  const keyHandler = event => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
      onClose();
    }
  };
  document.addEventListener('keydown', keyHandler);
  return keyHandler;
}

function formatRupiahDigits(raw = '') {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits ? new Intl.NumberFormat('id-ID').format(Number(digits)) : '';
}

export function openDuplicateCandidateModal({ applicant, positions = [], onSave }) {
  let modal = $('#duplicate-candidate-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'duplicate-candidate-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `<section class="employee-modal-card" role="dialog" aria-modal="true" aria-labelledby="dup-modal-title">
      <div class="employee-modal-head">
        <div>
          <small>CANDIDATE LIST · DUPLIKASI POSISI</small>
          <h2 id="dup-modal-title">Duplikasi Kandidat ke Posisi Lain</h2>
        </div>
        <button type="button" class="modal-close" id="dup-modal-close" aria-label="Tutup">×</button>
      </div>
      <form id="dup-modal-form">
        <div class="employee-form-grid">
          <label>Nama Kandidat<input class="input" name="full_name" readonly></label>
          <label>NIK<input class="input" name="nik" readonly></label>
          <label>Posisi Saat Ini<input class="input" name="current_position" readonly></label>
          <label>Posisi Baru (Tujuan)<select class="select" name="new_position" required></select></label>
          <label class="employee-notes">Atau Ketik Posisi Baru (Opsional jika tidak ada di daftar)<input class="input" name="custom_position" maxlength="100" placeholder="Biarkan kosong jika memilih dari dropdown"></label>
        </div>
        <div id="dup-modal-error" class="form-error" role="alert"></div>
        <div class="employee-modal-actions">
          <button type="button" class="btn btn-secondary" id="dup-modal-cancel">Batal</button>
          <button type="submit" class="btn btn-primary" id="dup-modal-save">Duplikasi &amp; Simpan</button>
        </div>
      </form>
    </section>`;
    document.body.append(modal);
    const close = () => modal.classList.add('hidden');
    $('#dup-modal-close', modal).addEventListener('click', close);
    $('#dup-modal-cancel', modal).addEventListener('click', close);
    bindSafeModalClose(modal, close, { closeOnBackdrop: false });
  }

  const form = $('#dup-modal-form', modal);
  const errorBox = $('#dup-modal-error', modal);
  const select = form.elements.new_position;
  const currentPos = String(applicant.position || applicant.application_data?.posisi || '').trim();
  const options = [...new Set([...positions, currentPos].filter(Boolean))];
  select.innerHTML = `<option value="">Pilih posisi baru…</option>` +
    options.map(pos => {
      const same = pos.toLocaleLowerCase('id') === currentPos.toLocaleLowerCase('id');
      return `<option value="${esc(pos)}" ${same ? 'disabled' : ''}>${esc(pos)}${same ? ' (posisi saat ini)' : ''}</option>`;
    }).join('');

  form.elements.full_name.value = applicant.full_name || '';
  form.elements.nik.value = applicant.nik || '';
  form.elements.current_position.value = currentPos || '—';
  form.elements.custom_position.value = '';
  errorBox.textContent = '';

  form.onsubmit = async event => {
    event.preventDefault();
    const saveBtn = $('#dup-modal-save', modal);
    const chosen = form.elements.custom_position.value.trim() || form.elements.new_position.value.trim();
    errorBox.textContent = '';
    if (!chosen) {
      errorBox.textContent = 'Pilih atau isi posisi baru terlebih dahulu.';
      return;
    }
    if (chosen.toLocaleLowerCase('id') === currentPos.toLocaleLowerCase('id')) {
      errorBox.textContent = 'Posisi baru harus berbeda dari posisi saat ini.';
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Menyimpan…';
    try {
      await onSave(chosen);
      modal.classList.add('hidden');
    } catch (err) {
      errorBox.textContent = err.message || 'Duplikasi kandidat gagal disimpan.';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Duplikasi & Simpan';
    }
  };

  modal.classList.remove('hidden');
  select.focus();
}

export function openInterviewModal({
  stage,
  existing = null,
  candidates = [],
  employees = [],
  onSave
}) {
  let modal = $('#interview-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'interview-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `<section class="employee-modal-card" role="dialog" aria-modal="true" aria-labelledby="int-modal-title">
      <div class="employee-modal-head">
        <div>
          <small id="int-modal-kicker">INTERVIEW PIPELINE</small>
          <h2 id="int-modal-title">Tambah Kandidat Interview</h2>
        </div>
        <button type="button" class="modal-close" id="int-modal-close" aria-label="Tutup">×</button>
      </div>
      <form id="int-modal-form">
        <div class="employee-form-grid">
          <label class="employee-notes">Pilih Kandidat (Candidate List &amp; Lead Register)
            <select class="select" name="candidate_key" required></select>
          </label>
          <label class="employee-notes">PIC Interviewer (Employee Directory)
            <select class="select" name="pic_value" required></select>
          </label>
          <label class="employee-notes" id="int-decision-wrap">Keputusan
            <select class="select" name="decision" required></select>
          </label>
          <label class="employee-notes" id="int-notes-wrap">Keterangan Interviewer
            <textarea class="textarea" name="notes" rows="3" maxlength="2000" placeholder="Catatan hasil interview…"></textarea>
          </label>

          <div id="int-final-reject-group" class="employee-notes hidden">
            <div class="employee-form-grid" style="padding-top:0">
              <label class="employee-notes">Alasan Penolakan
                <select class="select" name="rejection_reason_category">
                  <option value="">Pilih alasan…</option>
                  ${FINAL_REJECTION_REASONS.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}
                </select>
              </label>
              <label id="int-reject-detail-wrap" class="employee-notes hidden">Penjelasan Alasan (Opsional)
                <textarea class="textarea" name="rejection_reason_detail" rows="2" maxlength="1000" placeholder="Jelaskan alasan penolakan jika perlu…"></textarea>
              </label>
            </div>
          </div>

          <div id="int-final-accept-group" class="employee-notes hidden">
            <div class="employee-form-grid" style="padding-top:0">
              <label>Mulai Bekerja
                <input class="input" type="date" name="work_start_date">
              </label>
              <label>Gaji (Rp)
                <input class="input" type="text" inputmode="numeric" name="salary" placeholder="Contoh: 4.500.000">
              </label>
              <label>Durasi Kontrak
                <select class="select" name="contract_duration_months">
                  <option value="">Pilih durasi kontrak…</option>
                  ${CONTRACT_DURATION_OPTIONS.map(o => `<option value="${o.months}">${esc(o.label)}</option>`).join('')}
                </select>
              </label>
              <label>Periode Kontrak (Otomatis)
                <input class="input contract-range-preview" type="text" name="contract_range_display" readonly placeholder="Pilih mulai bekerja &amp; durasi">
              </label>
              <label>Nama Jabatan Resmi
                <input class="input" type="text" name="official_position" maxlength="120" placeholder="Sesuai posisi dilamar">
              </label>
              <label>NIK Karyawan
                <input class="input" type="text" name="assigned_nik" maxlength="40" placeholder="Contoh: ST 260706">
              </label>
            </div>
          </div>
        </div>
        <div id="int-modal-error" class="form-error" role="alert"></div>
        <div class="employee-modal-actions">
          <button type="button" class="btn btn-secondary" id="int-modal-cancel">Batal</button>
          <button type="submit" class="btn btn-primary" id="int-modal-save">Simpan</button>
        </div>
      </form>
    </section>`;
    document.body.append(modal);
    const close = () => modal.classList.add('hidden');
    $('#int-modal-close', modal).addEventListener('click', close);
    $('#int-modal-cancel', modal).addEventListener('click', close);
    bindSafeModalClose(modal, close, { closeOnBackdrop: false });
  }

  const isFinal = stage === 'Final Interview';
  const form = $('#int-modal-form', modal);
  const errorBox = $('#int-modal-error', modal);
  $('#int-modal-kicker', modal).textContent = 'INTERVIEW PIPELINE';
  $('#int-modal-title', modal).textContent = `${existing ? 'Edit' : 'Tambah'} · ${INTERVIEW_STAGE_LABELS[stage] || stage}`;
  errorBox.textContent = '';

  // Populate Candidate dropdown
  const candSelect = form.elements.candidate_key;
  candSelect.innerHTML = `<option value="">Pilih kandidat…</option>` +
    candidates.map(c => {
      const sourceBadge = c.source_type === 'stage1' ? 'Lead Register' : 'Candidate List';
      return `<option value="${esc(c.key)}">[${sourceBadge}] ${esc(c.candidate_name)} — ${esc(c.applied_position || 'Tanpa Posisi')}${c.candidate_nik ? ` (${esc(c.candidate_nik)})` : ''}</option>`;
    }).join('');

  if (existing) {
    const existingKey = existing.source_type === 'stage1' ? `stage1:${existing.stage1_id}` : `applicant:${existing.applicant_id}`;
    if (![...candSelect.options].some(o => o.value === existingKey)) {
      const opt = document.createElement('option');
      opt.value = existingKey;
      opt.textContent = `${existing.candidate_name} — ${existing.applied_position || '—'}`;
      candSelect.append(opt);
    }
    candSelect.value = existingKey;
  }

  // Populate PIC dropdown strictly from Employee Directory
  const picSelect = form.elements.pic_value;
  const defaultPic = findDefaultInterviewer(stage, employees);
  const picOptions = (employees || []).map(emp => ({
    value: `emp:${emp.id}`,
    label: `${emp.full_name || emp.employee_no} — ${emp.employee_no}${emp.position ? ` (${emp.position})` : ''}`,
    empId: emp.id,
    nik: emp.employee_no || '',
    name: emp.full_name || emp.employee_no || ''
  }));
  picSelect.innerHTML = `<option value="">${picOptions.length ? 'Pilih PIC Interviewer (Employee Directory)…' : 'Employee Directory masih kosong…'}</option>` +
    picOptions.map(o => `<option value="${esc(o.value)}" data-emp-id="${esc(o.empId)}" data-nik="${esc(o.nik)}" data-name="${esc(o.name)}">${esc(o.label)}</option>`).join('');

  if (existing?.pic_employee_id && [...picSelect.options].some(o => o.value === `emp:${existing.pic_employee_id}`)) {
    picSelect.value = `emp:${existing.pic_employee_id}`;
  } else if (existing?.pic_name) {
    const matchOpt = [...picSelect.options].find(o => o.dataset.name?.toLowerCase() === existing.pic_name.toLowerCase());
    if (matchOpt) {
      picSelect.value = matchOpt.value;
    } else {
      const opt = document.createElement('option');
      opt.value = `custom:${existing.pic_name}`;
      opt.dataset.name = existing.pic_name;
      opt.dataset.nik = existing.pic_nik || '';
      opt.textContent = existing.pic_name;
      picSelect.append(opt);
      picSelect.value = opt.value;
    }
  } else if (defaultPic?.employeeId) {
    picSelect.value = `emp:${defaultPic.employeeId}`;
  } else {
    picSelect.value = '';
  }

  // Populate Decision dropdown
  const decisionSelect = form.elements.decision;
  const decisions = isFinal ? FINAL_INTERVIEW_DECISIONS : INTERVIEW_DECISIONS;
  decisionSelect.innerHTML = `<option value="">Pilih keputusan…</option>` +
    decisions.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
  decisionSelect.value = existing?.decision || '';

  form.elements.notes.value = existing?.notes || '';
  form.elements.rejection_reason_category.value = existing?.rejection_reason_category || '';
  form.elements.rejection_reason_detail.value = existing?.rejection_reason_detail || '';
  form.elements.work_start_date.value = existing?.work_start_date || new Date().toISOString().slice(0, 10);
  form.elements.salary.value = existing?.salary ? formatRupiahDigits(existing.salary) : '';
  form.elements.contract_duration_months.value = existing?.contract_duration_months ? String(existing.contract_duration_months) : '12';
  form.elements.official_position.value = existing?.official_position || '';
  form.elements.assigned_nik.value = existing?.assigned_nik || '';

  const rejectGroup = $('#int-final-reject-group', modal);
  const rejectDetailWrap = $('#int-reject-detail-wrap', modal);
  const acceptGroup = $('#int-final-accept-group', modal);

  const syncContractRange = () => {
    const calc = calculateContractDates(form.elements.work_start_date.value, Number(form.elements.contract_duration_months.value));
    form.elements.contract_range_display.value = calc ? calc.displayRange : '';
  };

  const syncConditionalFields = () => {
    const dec = decisionSelect.value;
    if (!isFinal) {
      rejectGroup.classList.add('hidden');
      acceptGroup.classList.add('hidden');
      return;
    }
    rejectGroup.classList.toggle('hidden', dec !== 'Ditolak');
    acceptGroup.classList.toggle('hidden', dec !== 'Diterima');
    rejectDetailWrap.classList.toggle('hidden', !form.elements.rejection_reason_category.value);
    if (dec === 'Diterima') {
      if (!form.elements.official_position.value.trim()) {
        const selectedCand = candidates.find(c => c.key === candSelect.value);
        if (selectedCand?.applied_position) {
          form.elements.official_position.value = selectedCand.applied_position;
        }
      }
      syncContractRange();
    }
  };

  candSelect.onchange = () => {
    const selectedCand = candidates.find(c => c.key === candSelect.value);
    if (selectedCand && isFinal && !existing) {
      form.elements.official_position.value = selectedCand.applied_position || '';
    }
  };
  decisionSelect.onchange = syncConditionalFields;
  form.elements.rejection_reason_category.onchange = syncConditionalFields;
  form.elements.work_start_date.onchange = syncContractRange;
  form.elements.contract_duration_months.onchange = syncContractRange;
  form.elements.salary.oninput = () => {
    form.elements.salary.value = formatRupiahDigits(form.elements.salary.value);
  };
  syncConditionalFields();

  form.onsubmit = async event => {
    event.preventDefault();
    errorBox.textContent = '';
    const saveBtn = $('#int-modal-save', modal);
    const cand = candidates.find(c => c.key === candSelect.value) || (existing ? {
      source_type: existing.source_type,
      applicant_id: existing.applicant_id,
      stage1_id: existing.stage1_id,
      candidate_name: existing.candidate_name,
      candidate_nik: existing.candidate_nik,
      candidate_whatsapp: existing.candidate_whatsapp,
      applied_position: existing.applied_position
    } : null);
    if (!cand) { errorBox.textContent = 'Pilih kandidat terlebih dahulu.'; return; }
    const picOpt = picSelect.selectedOptions[0];
    if (!picOpt || !picOpt.value) { errorBox.textContent = 'Pilih PIC Interviewer.'; return; }
    const dec = decisionSelect.value;
    if (!dec) { errorBox.textContent = 'Pilih keputusan interview.'; return; }

    let extra = {
      rejection_reason_category: '',
      rejection_reason_detail: '',
      work_start_date: null,
      salary: null,
      contract_duration_months: null,
      contract_start_date: null,
      contract_end_date: null,
      official_position: '',
      assigned_nik: ''
    };

    if (isFinal && dec === 'Ditolak') {
      const cat = form.elements.rejection_reason_category.value;
      if (!cat) { errorBox.textContent = 'Pilih alasan penolakan (Technical, Salary, atau Other).'; return; }
      extra.rejection_reason_category = cat;
      extra.rejection_reason_detail = form.elements.rejection_reason_detail.value.trim();
    }

    if (isFinal && dec === 'Diterima') {
      const workStart = form.elements.work_start_date.value;
      const dur = Number(form.elements.contract_duration_months.value);
      const calc = calculateContractDates(workStart, dur);
      const salaryNum = Number(String(form.elements.salary.value || '').replace(/\D/g, ''));
      const officialPos = form.elements.official_position.value.trim();
      const nik = form.elements.assigned_nik.value.trim().toUpperCase();
      if (!calc) { errorBox.textContent = 'Lengkapi Tanggal Mulai Bekerja dan Durasi Kontrak.'; return; }
      if (!officialPos) { errorBox.textContent = 'Nama Jabatan Resmi wajib diisi.'; return; }
      if (!nik) { errorBox.textContent = 'NIK Karyawan wajib diisi sebelum menyimpan.'; return; }
      extra = {
        ...extra,
        work_start_date: workStart,
        salary: Number.isFinite(salaryNum) && salaryNum > 0 ? salaryNum : null,
        contract_duration_months: dur,
        contract_start_date: calc.startIso,
        contract_end_date: calc.endIso,
        official_position: officialPos,
        assigned_nik: nik
      };
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Menyimpan…';
    try {
      await onSave({
        id: existing?.id || null,
        source_type: cand.source_type,
        applicant_id: cand.applicant_id || null,
        stage1_id: cand.stage1_id || null,
        candidate_name: cand.candidate_name,
        candidate_nik: cand.candidate_nik || '',
        candidate_whatsapp: cand.candidate_whatsapp || '',
        applied_position: cand.applied_position || '',
        interview_stage: stage,
        pic_employee_id: picOpt.dataset.empId || null,
        pic_nik: picOpt.dataset.nik || '',
        pic_name: picOpt.dataset.name || picOpt.textContent,
        notes: form.elements.notes.value.trim(),
        decision: dec,
        ...extra
      }, cand);
      modal.classList.add('hidden');
    } catch (err) {
      errorBox.textContent = err.message || 'Data interview gagal disimpan.';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Simpan';
    }
  };

  modal.classList.remove('hidden');
  candSelect.focus();
}

export function openFullEmployeeModal({ employee = null, applicant = null, onSave }) {
  let modal = $('#employee-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'employee-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `<section class="employee-modal-card" style="width:min(760px,100%)" role="dialog" aria-modal="true" aria-labelledby="employee-modal-title">
      <div class="employee-modal-head">
        <div><small>EMPLOYEE DIRECTORY</small><h2 id="employee-modal-title">Data Karyawan</h2></div>
        <button type="button" class="modal-close" id="employee-modal-close" aria-label="Tutup">×</button>
      </div>
      <form id="employee-form">
        <div class="employee-form-grid">
          <label>Nama<input class="input" name="full_name" required maxlength="120"></label>
          <label>Nik<input class="input" name="employee_no" required maxlength="40" placeholder="Contoh: ST 130116"></label>
          <label>Departement<input class="input" name="department" maxlength="120"></label>
          <label>Jabatan<input class="input" name="position" maxlength="120"></label>
          <label>Tgl Masuk<input class="input" type="date" name="join_date"></label>
          <label>Status<select class="select" name="employment_status">
            <option value="TETAP">TETAP</option>
            <option value="KONTRAK">KONTRAK</option>
            <option value="HARIAN">HARIAN</option>
            <option value="Probation">Probation</option>
            <option value="Nonaktif">Nonaktif</option>
          </select></label>
          <label>Mulai Kontrak<input class="input" type="date" name="contract_start_date"></label>
          <label>Kontrak Berakhir<input class="input" type="date" name="contract_end_date"></label>
          <label class="employee-notes">Alamat<input class="input" name="address" maxlength="300"></label>
          <label>Nik2 (KTP 16 Digit)<input class="input" name="ktp_nik" maxlength="20" inputmode="numeric"></label>
          <label>No. Telp<input class="input" name="phone" maxlength="30"></label>
          <label>Tempat Lahir<input class="input" name="birth_place" maxlength="100"></label>
          <label>Tanggal Lahir<input class="input" type="date" name="birth_date"></label>
          <label>Pendidikan<input class="input" name="education" maxlength="60" placeholder="SMA / SMK / S1 / SMP"></label>
          <label>Jenis Kelamin<select class="select" name="gender">
            <option value="">Pilih…</option>
            <option value="Laki-laki">Laki-laki</option>
            <option value="Perempuan">Perempuan</option>
          </select></label>
          <label>Agama<input class="input" name="religion" maxlength="40" placeholder="Islam / Kristen / dll"></label>
          <label>Catatan<input class="input" name="notes" maxlength="500"></label>
        </div>
        <div id="employee-form-error" class="form-error" role="alert"></div>
        <div class="employee-modal-actions">
          <button type="button" class="btn btn-secondary" id="employee-cancel">Batal</button>
          <button type="submit" class="btn btn-primary" id="employee-save">Simpan data</button>
        </div>
      </form>
    </section>`;
    document.body.append(modal);
    const close = () => modal.classList.add('hidden');
    $('#employee-modal-close', modal).addEventListener('click', close);
    $('#employee-cancel', modal).addEventListener('click', close);
    bindSafeModalClose(modal, close, { closeOnBackdrop: false });
  }

  const form = $('#employee-form', modal);
  const errorBox = $('#employee-form-error', modal);
  form.reset();
  errorBox.textContent = '';
  const appData = applicant?.application_data || {};
  const genderRaw = employee?.gender || appData.gender || '';
  const genderNormalized = genderRaw === 'L' ? 'Laki-laki' : genderRaw === 'P' ? 'Perempuan' : genderRaw;

  form.elements.full_name.value = employee?.full_name || applicant?.full_name || appData.nama || '';
  form.elements.employee_no.value = employee?.employee_no || '';
  form.elements.department.value = employee?.department || '';
  form.elements.position.value = employee?.position || applicant?.position || '';
  form.elements.join_date.value = employee?.join_date || new Date().toISOString().slice(0, 10);
  const statusVal = String(employee?.employment_status || 'KONTRAK').toUpperCase();
  if ([...form.elements.employment_status.options].some(o => o.value.toUpperCase() === statusVal)) {
    form.elements.employment_status.value = [...form.elements.employment_status.options].find(o => o.value.toUpperCase() === statusVal).value;
  } else {
    const opt = document.createElement('option');
    opt.value = employee?.employment_status || 'KONTRAK';
    opt.textContent = opt.value;
    form.elements.employment_status.append(opt);
    form.elements.employment_status.value = opt.value;
  }
  form.elements.contract_start_date.value = employee?.contract_start_date || '';
  form.elements.contract_end_date.value = employee?.contract_end_date || '';
  form.elements.address.value = employee?.address || appData.alamat_asal || appData.domisili || '';
  form.elements.ktp_nik.value = employee?.ktp_nik || applicant?.nik || appData.nik || '';
  form.elements.phone.value = employee?.phone || appData.telepon || '';
  form.elements.birth_place.value = employee?.birth_place || appData.tempat_lahir || '';
  form.elements.birth_date.value = employee?.birth_date || appData.tanggal_lahir || '';
  form.elements.education.value = employee?.education || appData.pendidikan_terakhir || '';
  form.elements.gender.value = genderNormalized || '';
  form.elements.religion.value = employee?.religion || appData.agama || '';
  form.elements.notes.value = employee?.notes || '';

  $('#employee-modal-title', modal).textContent = employee ? `Edit Karyawan · ${form.elements.full_name.value}` : 'Tambah Karyawan';

  form.onsubmit = async event => {
    event.preventDefault();
    const saveBtn = $('#employee-save', modal);
    errorBox.textContent = '';
    const fd = Object.fromEntries(new FormData(form).entries());
    if (!fd.full_name.trim() || !fd.employee_no.trim()) {
      errorBox.textContent = 'Nama dan Nik wajib diisi.';
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Menyimpan…';
    try {
      await onSave({
        id: employee?.id || null,
        applicant_id: employee?.applicant_id || applicant?.id || null,
        full_name: fd.full_name.trim(),
        employee_no: fd.employee_no.trim().toUpperCase(),
        department: fd.department.trim(),
        position: fd.position.trim(),
        join_date: fd.join_date || null,
        employment_status: fd.employment_status,
        contract_start_date: fd.contract_start_date || null,
        contract_end_date: fd.contract_end_date || null,
        address: fd.address.trim(),
        ktp_nik: fd.ktp_nik.trim(),
        phone: fd.phone.trim(),
        birth_place: fd.birth_place.trim(),
        birth_date: fd.birth_date || null,
        education: fd.education.trim(),
        gender: fd.gender,
        religion: fd.religion.trim(),
        notes: fd.notes.trim()
      });
      modal.classList.add('hidden');
    } catch (err) {
      errorBox.textContent = err.message || 'Data karyawan gagal disimpan.';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Simpan data';
    }
  };

  modal.classList.remove('hidden');
  form.elements.full_name.focus();
}

export function openEmployeeUploadModal({ onImport, onDownloadTemplate }) {
  let modal = $('#employee-upload-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'employee-upload-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `<section class="employee-modal-card" style="width:min(720px,100%)" role="dialog" aria-modal="true" aria-labelledby="emp-upload-title">
      <div class="employee-modal-head">
        <div><small>EMPLOYEE DIRECTORY · IMPOR DATA</small><h2 id="emp-upload-title">Upload Data Karyawan (XLSX / CSV)</h2></div>
        <button type="button" class="modal-close" id="emp-upload-close" aria-label="Tutup">×</button>
      </div>
      <div class="upload-preview-box">
        <b>Format Kolom Wajib (16 Kolom):</b>
        <div style="margin-top:6px;color:var(--muted);line-height:1.5">${esc(EMPLOYEE_TABLE_HEADERS.join(' · '))}</div>
        <div style="margin-top:10px">
          <button type="button" class="btn btn-secondary btn-xs" id="emp-download-template">Unduh Template Format XLSX ↓</button>
        </div>
      </div>
      <div style="margin-top:14px">
        <label class="field-label" for="emp-upload-file" style="margin-top:0">Pilih File (.xlsx, .xls, .csv)</label>
        <input id="emp-upload-file" class="input" type="file" accept=".xlsx,.xls,.csv">
      </div>
      <div id="emp-upload-preview" class="upload-preview-box hidden"></div>
      <div id="emp-upload-error" class="form-error" role="alert"></div>
      <div class="employee-modal-actions">
        <button type="button" class="btn btn-secondary" id="emp-upload-cancel">Batal</button>
        <button type="button" class="btn btn-primary" id="emp-upload-confirm" disabled>Impor ke Employee Directory</button>
      </div>
    </section>`;
    document.body.append(modal);
    const close = () => modal.classList.add('hidden');
    $('#emp-upload-close', modal).addEventListener('click', close);
    $('#emp-upload-cancel', modal).addEventListener('click', close);
    bindSafeModalClose(modal, close, { closeOnBackdrop: false });
  }

  let parsedRows = [];
  const fileInput = $('#emp-upload-file', modal);
  const previewBox = $('#emp-upload-preview', modal);
  const errorBox = $('#emp-upload-error', modal);
  const confirmBtn = $('#emp-upload-confirm', modal);

  fileInput.value = '';
  previewBox.classList.add('hidden');
  previewBox.innerHTML = '';
  errorBox.textContent = '';
  confirmBtn.disabled = true;

  $('#emp-download-template', modal).onclick = () => onDownloadTemplate();

  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    parsedRows = [];
    confirmBtn.disabled = true;
    errorBox.textContent = '';
    previewBox.classList.add('hidden');
    if (!file) return;
    try {
      const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error('Sheet tidak ditemukan dalam file.');
      const jsonRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
      const { rows, errors } = parseEmployeeSpreadsheetRows(jsonRows);
      if (errors.length) {
        errorBox.textContent = errors.slice(0, 3).join(' ');
      }
      if (!rows.length) {
        if (!errorBox.textContent) errorBox.textContent = 'Tidak ada baris data karyawan yang valid.';
        return;
      }
      parsedRows = rows;
      confirmBtn.disabled = false;
      previewBox.classList.remove('hidden');
      previewBox.innerHTML = `<b>${rows.length} baris siap diimpor</b> (berdasarkan NIK unik):<div style="margin-top:6px;max-height:140px;overflow:auto">${rows.slice(0, 8).map(r => `<div>• <b>${esc(r.employee_no)}</b> — ${esc(r.full_name)} (${esc(r.department || '—')} · ${esc(r.position || '—')})</div>`).join('')}${rows.length > 8 ? `<div>… dan ${rows.length - 8} baris lainnya.</div>` : ''}</div>`;
    } catch (err) {
      errorBox.textContent = err.message || 'File gagal dibaca.';
    }
  };

  confirmBtn.onclick = async () => {
    if (!parsedRows.length) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Mengimpor…';
    errorBox.textContent = '';
    try {
      await onImport(parsedRows);
      modal.classList.add('hidden');
    } catch (err) {
      errorBox.textContent = err.message || 'Gagal mengimpor data karyawan.';
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Impor ke Employee Directory';
    }
  };

  modal.classList.remove('hidden');
}

export function openUserModal({ existing = null, employees = [], onSave }) {
  let modal = $('#user-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'user-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `<section class="employee-modal-card" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
      <div class="employee-modal-head">
        <div><small>MANAJEMEN USER</small><h2 id="user-modal-title">Tambah User</h2></div>
        <button type="button" class="modal-close" id="user-modal-close" aria-label="Tutup">×</button>
      </div>
      <form id="user-modal-form">
        <div class="employee-form-grid">
          <label class="employee-notes" id="user-emp-select-wrap">Pilih Karyawan (Employee Directory)
            <select class="select" name="employee_id"></select>
          </label>
          <label>NIK Karyawan<input class="input" name="nik" required maxlength="32" placeholder="Otomatis dari Employee Directory"></label>
          <label>Nama Karyawan<input class="input" name="full_name" required maxlength="100" placeholder="Otomatis dari Employee Directory"></label>
          <label>Role<select class="select" name="role"><option value="Superadmin">Superadmin</option></select></label>
          <label>PIN (4–12 Angka)
            <div class="pin-input-wrap" style="margin-top:6px">
              <input class="input" name="pin" type="password" inputmode="numeric" maxlength="12" style="margin-top:0" placeholder="Masukkan PIN angka">
              <button type="button" id="user-pin-eye" class="pin-toggle-btn" aria-label="Intip PIN">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
          </label>
        </div>
        <div id="user-modal-error" class="form-error" role="alert"></div>
        <div class="employee-modal-actions">
          <button type="button" class="btn btn-secondary" id="user-modal-cancel">Batal</button>
          <button type="submit" class="btn btn-primary" id="user-modal-save">Simpan User</button>
        </div>
      </form>
    </section>`;
    document.body.append(modal);
    const close = () => modal.classList.add('hidden');
    $('#user-modal-close', modal).addEventListener('click', close);
    $('#user-modal-cancel', modal).addEventListener('click', close);
    bindSafeModalClose(modal, close, { closeOnBackdrop: false });
  }

  const form = $('#user-modal-form', modal);
  const errorBox = $('#user-modal-error', modal);
  const eyeBtn = $('#user-pin-eye', modal);
  const empSelectWrap = $('#user-emp-select-wrap', modal);
  const empSelect = form.elements.employee_id;
  form.reset();
  errorBox.textContent = '';

  const eligibleEmployees = [...(employees || [])]
    .filter(emp => String(emp.employee_no || '').trim().length >= 3)
    .sort((a, b) => String(a.full_name || a.employee_no || '').localeCompare(String(b.full_name || b.employee_no || ''), 'id'));

  if (!existing) {
    empSelectWrap.classList.remove('hidden');
    empSelect.required = true;
    empSelect.innerHTML = `<option value="">${eligibleEmployees.length ? 'Pilih karyawan dari Employee Directory…' : 'Employee Directory masih kosong…'}</option>` +
      eligibleEmployees.map(emp => `<option value="${esc(emp.id)}" data-nik="${esc(emp.employee_no || '')}" data-name="${esc(emp.full_name || '')}">${esc(buildEmployeeUserOptionLabel(emp))}</option>`).join('');
    empSelect.value = '';
    form.elements.nik.readOnly = true;
    form.elements.full_name.readOnly = true;
    if (!eligibleEmployees.length) {
      errorBox.textContent = 'Data Employee Directory belum tersedia. Tambahkan karyawan di Employee Directory terlebih dahulu.';
    }
    empSelect.onchange = () => {
      const opt = empSelect.selectedOptions[0];
      form.elements.nik.value = opt?.dataset.nik || '';
      form.elements.full_name.value = opt?.dataset.name || '';
      errorBox.textContent = '';
    };
  } else {
    empSelectWrap.classList.add('hidden');
    empSelect.required = false;
    empSelect.innerHTML = '';
    empSelect.onchange = null;
    form.elements.nik.value = existing.employee_nik || '';
    form.elements.nik.readOnly = true;
    form.elements.full_name.value = existing.display_name || '';
    form.elements.full_name.readOnly = true;
  }

  $('#user-modal-title', modal).textContent = existing ? `Edit User · ${existing.employee_nik}` : 'Tambah User (Employee Directory)';
  form.elements.role.value = 'Superadmin';
  form.elements.pin.type = 'password';
  form.elements.pin.required = !existing;
  form.elements.pin.placeholder = existing ? 'Kosongkan jika PIN tidak diubah' : 'Masukkan 4–12 angka PIN';

  eyeBtn.onclick = () => {
    if (form.elements.pin.type === 'text') {
      form.elements.pin.type = 'password';
      return;
    }
    openPinRevealPrompt({
      label: form.elements.nik.value || 'User',
      onUnlocked: () => {
        form.elements.pin.type = 'text';
      }
    });
  };

  form.onsubmit = async event => {
    event.preventDefault();
    const saveBtn = $('#user-modal-save', modal);
    errorBox.textContent = '';
    if (!existing && !empSelect.value) {
      errorBox.textContent = 'Pilih karyawan dari Employee Directory terlebih dahulu.';
      empSelect.focus();
      return;
    }
    const nik = form.elements.nik.value.trim();
    const fullName = form.elements.full_name.value.trim();
    const pin = form.elements.pin.value.trim();
    if (nik.length < 3) { errorBox.textContent = 'NIK Karyawan minimal 3 karakter.'; return; }
    if (fullName.length < 2) { errorBox.textContent = 'Nama Karyawan wajib diisi.'; return; }
    if ((!existing || pin) && !/^\d{4,12}$/.test(pin)) {
      errorBox.textContent = 'PIN harus terdiri dari 4–12 digit angka.';
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Menyimpan…';
    try {
      await onSave({ nik, full_name: fullName, role: 'Superadmin', pin });
      modal.classList.add('hidden');
    } catch (err) {
      errorBox.textContent = err.message || 'User gagal disimpan.';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Simpan User';
    }
  };

  modal.classList.remove('hidden');
  (existing ? form.elements.pin : empSelect).focus();
}

export function openPinRevealPrompt({ label = '', onUnlocked }) {
  let modal = $('#pin-reveal-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pin-reveal-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `<section class="employee-modal-card" style="width:min(420px,100%)" role="dialog" aria-modal="true" aria-labelledby="pin-reveal-title">
      <div class="employee-modal-head">
        <div><small>VERIFIKASI KEAMANAN PIN</small><h2 id="pin-reveal-title">Buka PIN User</h2></div>
        <button type="button" class="modal-close" id="pin-reveal-close" aria-label="Tutup">×</button>
      </div>
      <form id="pin-reveal-form">
        <p class="subtle" id="pin-reveal-desc" style="margin:0 0 12px"></p>
        <label class="field-label" for="pin-reveal-password" style="margin-top:0">Password Pembuka PIN</label>
        <input id="pin-reveal-password" class="input" type="password" required placeholder="Masukkan password otorisasi">
        <div id="pin-reveal-error" class="form-error" role="alert"></div>
        <div class="employee-modal-actions">
          <button type="button" class="btn btn-secondary" id="pin-reveal-cancel">Batal</button>
          <button type="submit" class="btn btn-primary" id="pin-reveal-submit">Buka PIN</button>
        </div>
      </form>
    </section>`;
    document.body.append(modal);
    const close = () => modal.classList.add('hidden');
    $('#pin-reveal-close', modal).addEventListener('click', close);
    $('#pin-reveal-cancel', modal).addEventListener('click', close);
    bindSafeModalClose(modal, close, { closeOnBackdrop: false });
  }

  const form = $('#pin-reveal-form', modal);
  const pwdInput = $('#pin-reveal-password', modal);
  const errorBox = $('#pin-reveal-error', modal);
  $('#pin-reveal-desc', modal).textContent = `Masukkan password untuk membuka PIN ${label ? `(${label})` : ''}.`;
  pwdInput.value = '';
  errorBox.textContent = '';

  form.onsubmit = async event => {
    event.preventDefault();
    const pwd = pwdInput.value;
    if (!verifyPinRevealPassword(pwd)) {
      errorBox.textContent = 'Password tidak sesuai.';
      pwdInput.focus();
      return;
    }
    const btn = $('#pin-reveal-submit', modal);
    btn.disabled = true;
    btn.textContent = 'Membuka…';
    try {
      await onUnlocked(pwd);
      modal.classList.add('hidden');
    } catch (err) {
      errorBox.textContent = err.message || 'PIN tidak dapat dibuka.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Buka PIN';
    }
  };

  modal.classList.remove('hidden');
  pwdInput.focus();
}

export { maskPin };
