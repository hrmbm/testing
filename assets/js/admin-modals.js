import { $, esc, formatAppError } from './common.js?v=20261124-hrga-workspace-22';
import {
  INTERVIEW_STAGE_LABELS,
  INTERVIEW_DECISIONS,
  FINAL_INTERVIEW_DECISIONS,
  FINAL_REJECTION_REASONS,
  CONTRACT_DURATION_OPTIONS,
  EMPLOYEE_TABLE_HEADERS,
  INVITE_SOURCES,
  INVITE_STATUSES,
  calculateContractDates,
  findDefaultInterviewer,
  parseEmployeeSpreadsheetRows,
  parseEmployeeWorksheetAoa,
  normalizeCompanyEntity,
  normalizeHomeBase,
  buildEmployeeUserOptionLabel,
  normalizeInterviewDecision,
  normalizeEmployeeRecordUppercase,
  verifyPinRevealPassword,
  maskPin
} from './workspace-logic.js?v=20261124-hrga-workspace-22';
import {
  DEFAULT_CONTRACT_SETTINGS,
  normalizeSalaryTier,
  resolveSalaryByTier,
  parseNumericCurrency
} from './contract-logic.js?v=20261124-hrga-workspace-22';

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

function formatCurrencyDigits(raw = '') {
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
          <small>CANDIDATE LIST · DUPLICATE POSITION</small>
          <h2 id="dup-modal-title">Duplicate Candidate to Another Position</h2>
        </div>
        <button type="button" class="modal-close" id="dup-modal-close" aria-label="Close">×</button>
      </div>
      <form id="dup-modal-form">
        <div class="employee-form-grid">
          <label>Candidate Name<input class="input" name="full_name" readonly></label>
          <label>NIK<input class="input" name="nik" readonly></label>
          <label>Current Position<input class="input" name="current_position" readonly></label>
          <label>New Target Position<select class="select" name="new_position" required></select></label>
          <label class="employee-notes">Or Enter Custom Position (Optional if not listed)<input class="input" name="custom_position" maxlength="100" placeholder="Leave blank when choosing from dropdown"></label>
        </div>
        <div id="dup-modal-error" class="form-error" role="alert"></div>
        <div class="employee-modal-actions">
          <button type="button" class="btn btn-secondary" id="dup-modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="dup-modal-save">Duplicate &amp; Save</button>
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
  select.innerHTML = `<option value="">Select new position…</option>` +
    options.map(pos => {
      const same = pos.toLowerCase() === currentPos.toLowerCase();
      return `<option value="${esc(pos)}" ${same ? 'disabled' : ''}>${esc(pos)}${same ? ' (current position)' : ''}</option>`;
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
      errorBox.textContent = 'Please select or enter a new target position.';
      return;
    }
    if (chosen.toLowerCase() === currentPos.toLowerCase()) {
      errorBox.textContent = 'New position must be different from the current candidate position.';
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await onSave(chosen);
      modal.classList.add('hidden');
    } catch (err) {
      errorBox.textContent = err.message || 'Failed to duplicate candidate.';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Duplicate & Save';
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
  currUmkAmount = DEFAULT_CONTRACT_SETTINGS.currUmkAmount,
  onSave,
  onPrintPkwt = null
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
          <h2 id="int-modal-title">Add Interview Candidate</h2>
        </div>
        <button type="button" class="modal-close" id="int-modal-close" aria-label="Close">×</button>
      </div>
      <form id="int-modal-form">
        <div class="employee-form-grid">
          <label class="employee-notes">Select Candidate (Candidate List &amp; Lead Register)
            <select class="select" name="candidate_key" required></select>
          </label>
          <label>Interview Date
            <input class="input" type="date" name="interview_date" required>
          </label>
          <label>PIC Interviewer (Employee Directory)
            <select class="select" name="pic_value" required></select>
          </label>
          <label class="employee-notes" id="int-decision-wrap">Decision
            <select class="select" name="decision" required></select>
          </label>
          <label class="employee-notes" id="int-notes-wrap">Interviewer Notes
            <textarea class="textarea" name="notes" rows="3" maxlength="2000" placeholder="Interview assessment notes…"></textarea>
          </label>

          <div id="int-final-reject-group" class="employee-notes hidden">
            <div class="employee-form-grid" style="padding-top:0">
              <label class="employee-notes">Rejection Reason
                <select class="select" name="rejection_reason_category">
                  <option value="">Select reason…</option>
                  ${FINAL_REJECTION_REASONS.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}
                </select>
              </label>
              <label id="int-reject-detail-wrap" class="employee-notes hidden">Reason Details (Optional)
                <textarea class="textarea" name="rejection_reason_detail" rows="2" maxlength="1000" placeholder="Provide additional rejection context if needed…"></textarea>
              </label>
            </div>
          </div>

          <div id="int-final-accept-group" class="employee-notes hidden">
            <div class="employee-form-grid" style="padding-top:0">
              <label>Join / Start Date
                <input class="input" type="date" name="work_start_date">
              </label>
              <label>Salary Rule
                <select class="select" name="salary_tier">
                  <option value="umk_or_above">UMK / Diatas UMK</option>
                  <option value="below_umk">Di Bawah UMK (Input Manual)</option>
                </select>
                <small id="int-salary-tier-hint" class="subtle" style="display:block;margin-top:4px;font-weight:400"></small>
              </label>
              <label id="int-salary-manual-wrap" class="hidden employee-notes">Manual Salary Below UMK (IDR)
                <input class="input" type="text" inputmode="numeric" name="salary" placeholder="Nominal di bawah UMK aktif">
              </label>
              <label>Contract Duration
                <select class="select" name="contract_duration_months">
                  <option value="">Select contract duration…</option>
                  ${CONTRACT_DURATION_OPTIONS.map(o => `<option value="${o.months}">${esc(o.label)}</option>`).join('')}
                </select>
              </label>
              <label>Contract Period (Auto)
                <input class="input contract-range-preview" type="text" name="contract_range_display" readonly placeholder="Select join date &amp; duration">
              </label>
              <label>Official Position Title
                <input class="input" type="text" name="official_position" maxlength="120" placeholder="Matches applied position">
              </label>
              <label>Official Departemen Title
                <input class="input" type="text" name="official_department" maxlength="120" placeholder="e.g., PRODUCTION / OFFICE / DRIVER">
              </label>
              <label class="employee-notes">Employee NIK
                <input class="input" type="text" name="assigned_nik" maxlength="40" placeholder="e.g., ST 260706">
              </label>
            </div>
          </div>
        </div>
        <div id="int-modal-error" class="form-error" role="alert"></div>
        <div class="employee-modal-actions">
          <button type="button" class="btn btn-secondary hidden" id="int-modal-print-pkwt">Print PKWT</button>
          <button type="button" class="btn btn-secondary" id="int-modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="int-modal-save">Save</button>
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
  $('#int-modal-title', modal).textContent = `${existing ? 'Edit' : 'Add Candidate'} · ${INTERVIEW_STAGE_LABELS[stage] || stage}`;
  errorBox.textContent = '';

  const candSelect = form.elements.candidate_key;
  candSelect.innerHTML = `<option value="">Select candidate…</option>` +
    candidates.map(c => {
      const sourceBadge = c.source_type === 'stage1' ? 'Lead Register' : 'Candidate List';
      return `<option value="${esc(c.key)}">[${sourceBadge}] ${esc(c.candidate_name)} — ${esc(c.applied_position || 'Unspecified')}${c.candidate_nik ? ` (${esc(c.candidate_nik)})` : ''}</option>`;
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

  form.elements.interview_date.value = existing?.interview_date ||
    (existing?.created_at ? String(existing.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10));

  const picSelect = form.elements.pic_value;
  const defaultPic = findDefaultInterviewer(stage, employees);
  const picOptions = (employees || []).map(emp => ({
    value: `emp:${emp.id}`,
    label: `${emp.full_name || emp.employee_no} — ${emp.employee_no}${emp.position ? ` (${emp.position})` : ''}`,
    empId: emp.id,
    nik: emp.employee_no || '',
    name: emp.full_name || emp.employee_no || ''
  }));
  picSelect.innerHTML = `<option value="">${picOptions.length ? 'Select PIC Interviewer (Employee Directory)…' : 'Employee Directory is empty…'}</option>` +
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

  const decisionSelect = form.elements.decision;
  const decisions = isFinal ? FINAL_INTERVIEW_DECISIONS : INTERVIEW_DECISIONS;
  decisionSelect.innerHTML = `<option value="">Select decision…</option>` +
    decisions.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
  const normalizedExistingDecision = existing?.decision ? normalizeInterviewDecision(existing.decision) : '';
  decisionSelect.value = decisions.includes(normalizedExistingDecision) ? normalizedExistingDecision : '';

  const resolvedUmkAmount = parseNumericCurrency(currUmkAmount) || DEFAULT_CONTRACT_SETTINGS.currUmkAmount;
  const initialSalaryTier = normalizeSalaryTier(existing?.salary_tier, existing?.salary, resolvedUmkAmount);

  form.elements.notes.value = existing?.notes || '';
  form.elements.rejection_reason_category.value = existing?.rejection_reason_category || '';
  form.elements.rejection_reason_detail.value = existing?.rejection_reason_detail || '';
  form.elements.work_start_date.value = existing?.work_start_date || new Date().toISOString().slice(0, 10);
  form.elements.salary_tier.value = initialSalaryTier;
  form.elements.salary.value = (initialSalaryTier === 'below_umk' && existing?.salary) ? formatCurrencyDigits(existing.salary) : '';
  form.elements.contract_duration_months.value = existing?.contract_duration_months ? String(existing.contract_duration_months) : '12';
  form.elements.official_position.value = existing?.official_position || '';
  form.elements.official_department.value = existing?.official_department || '';
  form.elements.assigned_nik.value = existing?.assigned_nik || '';

  const rejectGroup = $('#int-final-reject-group', modal);
  const rejectDetailWrap = $('#int-reject-detail-wrap', modal);
  const acceptGroup = $('#int-final-accept-group', modal);
  const salaryManualWrap = $('#int-salary-manual-wrap', modal);
  const salaryTierHint = $('#int-salary-tier-hint', modal);

  const syncContractRange = () => {
    const calc = calculateContractDates(form.elements.work_start_date.value, Number(form.elements.contract_duration_months.value));
    form.elements.contract_range_display.value = calc ? calc.displayRange : '';
  };

  const syncSalaryTierUi = () => {
    const tier = form.elements.salary_tier.value === 'below_umk' ? 'below_umk' : 'umk_or_above';
    salaryManualWrap.classList.toggle('hidden', tier !== 'below_umk');
    if (tier === 'below_umk') {
      salaryTierHint.textContent = `Di bawah UMK (< Rp ${resolvedUmkAmount.toLocaleString('id-ID')}) — cetak 5 Rangkap.`;
    } else {
      salaryTierHint.textContent = 'Mengikuti standar UMK / Diatas UMK (nominal tidak ditampilkan — PKWT Only).';
    }
  };

  const printPkwtBtn = $('#int-modal-print-pkwt', modal);

  const syncConditionalFields = () => {
    const dec = normalizeInterviewDecision(decisionSelect.value);
    if (!isFinal) {
      rejectGroup.classList.add('hidden');
      acceptGroup.classList.add('hidden');
      printPkwtBtn?.classList.add('hidden');
      return;
    }
    rejectGroup.classList.toggle('hidden', dec !== 'Rejected');
    acceptGroup.classList.toggle('hidden', dec !== 'Accepted');
    printPkwtBtn?.classList.toggle('hidden', !(dec === 'Accepted' && typeof onPrintPkwt === 'function'));
    rejectDetailWrap.classList.toggle('hidden', !form.elements.rejection_reason_category.value);
    if (dec === 'Accepted') {
      if (!form.elements.official_position.value.trim()) {
        const selectedCand = candidates.find(c => c.key === candSelect.value);
        if (selectedCand?.applied_position) {
          form.elements.official_position.value = selectedCand.applied_position;
        }
      }
      syncSalaryTierUi();
      syncContractRange();
    }
  };

  if (printPkwtBtn) {
    printPkwtBtn.onclick = () => {
      if (typeof onPrintPkwt !== 'function') return;
      const cand = candidates.find(c => c.key === candSelect.value) || (existing ? {
        source_type: existing.source_type,
        applicant_id: existing.applicant_id,
        stage1_id: existing.stage1_id,
        candidate_name: existing.candidate_name,
        candidate_nik: existing.candidate_nik,
        candidate_whatsapp: existing.candidate_whatsapp,
        applied_position: existing.applied_position
      } : null);
      if (!cand) {
        errorBox.textContent = 'Please select a candidate first.';
        return;
      }
      const workStart = form.elements.work_start_date.value;
      const dur = Number(form.elements.contract_duration_months.value) || 12;
      const calc = calculateContractDates(workStart, dur);
      const salaryTier = form.elements.salary_tier.value === 'below_umk' ? 'below_umk' : 'umk_or_above';
      const manualSalaryNum = Number(String(form.elements.salary.value || '').replace(/\D/g, ''));
      if (salaryTier === 'below_umk' && (!manualSalaryNum || manualSalaryNum >= resolvedUmkAmount)) {
        errorBox.textContent = `Gaji manual di bawah UMK harus lebih besar dari 0 dan kurang dari Rp ${resolvedUmkAmount.toLocaleString('id-ID')}.`;
        form.elements.salary.focus();
        return;
      }
      const resolvedSalary = resolveSalaryByTier({
        salaryTier,
        manualSalary: manualSalaryNum,
        currUmkAmount: resolvedUmkAmount
      });
      onPrintPkwt({
        id: existing?.id || null,
        applicant_id: cand.applicant_id || null,
        candidate_name: cand.candidate_name,
        candidate_nik: cand.candidate_nik || '',
        candidate_whatsapp: cand.candidate_whatsapp || '',
        applied_position: cand.applied_position || '',
        official_position: form.elements.official_position.value.trim() || cand.applied_position || '',
        official_department: form.elements.official_department.value.trim(),
        assigned_nik: form.elements.assigned_nik.value.trim().toUpperCase(),
        contract_number: existing?.contract_number || '',
        work_start_date: workStart,
        contract_duration_months: dur,
        contract_start_date: calc?.startIso || workStart,
        contract_end_date: calc?.endIso || '',
        salary_tier: salaryTier,
        salary: resolvedSalary
      }, cand);
    };
  }

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
  form.elements.salary_tier.onchange = syncSalaryTierUi;
  form.elements.salary.oninput = () => {
    form.elements.salary.value = formatCurrencyDigits(form.elements.salary.value);
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
    if (!cand) { errorBox.textContent = 'Please select a candidate.'; return; }
    const interviewDate = form.elements.interview_date.value;
    if (!interviewDate) { errorBox.textContent = 'Please select an interview date.'; return; }
    const picOpt = picSelect.selectedOptions[0];
    if (!picOpt || !picOpt.value) { errorBox.textContent = 'Please select a PIC Interviewer.'; return; }
    const dec = normalizeInterviewDecision(decisionSelect.value);
    if (!dec) { errorBox.textContent = 'Please select an interview decision.'; return; }

    let extra = {
      rejection_reason_category: '',
      rejection_reason_detail: '',
      work_start_date: null,
      salary: null,
      salary_tier: 'umk_or_above',
      contract_duration_months: null,
      contract_start_date: null,
      contract_end_date: null,
      official_position: '',
      official_department: '',
      assigned_nik: '',
      contract_number: existing?.contract_number || ''
    };

    if (isFinal && dec === 'Rejected') {
      const cat = form.elements.rejection_reason_category.value;
      if (!cat) { errorBox.textContent = 'Please choose a rejection reason (Technical, Salary, or Other).'; return; }
      extra.rejection_reason_category = cat;
      extra.rejection_reason_detail = form.elements.rejection_reason_detail.value.trim();
    }

    if (isFinal && dec === 'Accepted') {
      const workStart = form.elements.work_start_date.value;
      const dur = Number(form.elements.contract_duration_months.value);
      const calc = calculateContractDates(workStart, dur);
      const salaryTier = form.elements.salary_tier.value === 'below_umk' ? 'below_umk' : 'umk_or_above';
      const manualSalaryNum = Number(String(form.elements.salary.value || '').replace(/\D/g, ''));
      const officialPos = form.elements.official_position.value.trim();
      const officialDept = form.elements.official_department.value.trim();
      const nik = form.elements.assigned_nik.value.trim().toUpperCase();
      if (!calc) { errorBox.textContent = 'Please complete Join Date and Contract Duration.'; return; }
      if (!officialPos) { errorBox.textContent = 'Official Position Title is required.'; return; }
      if (!nik) { errorBox.textContent = 'Employee NIK is required before saving.'; return; }
      if (salaryTier === 'below_umk' && (!manualSalaryNum || manualSalaryNum >= resolvedUmkAmount)) {
        errorBox.textContent = `Gaji manual di bawah UMK harus diisi dan kurang dari Rp ${resolvedUmkAmount.toLocaleString('id-ID')}.`;
        form.elements.salary.focus();
        return;
      }
      const resolvedSalary = resolveSalaryByTier({
        salaryTier,
        manualSalary: manualSalaryNum,
        currUmkAmount: resolvedUmkAmount
      });
      extra = {
        ...extra,
        work_start_date: workStart,
        salary: resolvedSalary,
        salary_tier: salaryTier,
        contract_duration_months: dur,
        contract_start_date: calc.startIso,
        contract_end_date: calc.endIso,
        official_position: officialPos,
        official_department: officialDept,
        assigned_nik: nik,
        contract_number: existing?.contract_number || ''
      };
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
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
        interview_date: interviewDate,
        pic_employee_id: picOpt.dataset.empId || null,
        pic_nik: picOpt.dataset.nik || '',
        pic_name: picOpt.dataset.name || picOpt.textContent,
        notes: form.elements.notes.value.trim(),
        decision: dec,
        ...extra
      }, cand);
      modal.classList.add('hidden');
    } catch (err) {
      errorBox.textContent = formatAppError(err, 'Gagal menyimpan data interview.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  };

  modal.classList.remove('hidden');
  candSelect.focus();
}

export function openInvitedCandidateModal({
  existing = null,
  positions = [],
  applicants = [],
  linkedApplicantIds = new Set(),
  onSave
}) {
  let modal = $('#invited-candidate-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'invited-candidate-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `<section class="employee-modal-card" role="dialog" aria-modal="true" aria-labelledby="inv-modal-title">
      <div class="employee-modal-head">
        <div>
          <small>RECRUITMENT · INVITED CANDIDATES</small>
          <h2 id="inv-modal-title">Add Invited Candidate</h2>
        </div>
        <button type="button" class="modal-close" id="inv-modal-close" aria-label="Close">×</button>
      </div>
      <form id="inv-modal-form">
        <div class="employee-form-grid">
          <label>Date
            <input class="input" type="date" name="invite_date" required>
          </label>
          <label>Source
            <select class="select" name="source" required></select>
          </label>
          <label>Candidate Name
            <input class="input" type="text" name="candidate_name" required maxlength="120" placeholder="Enter candidate full name">
          </label>
          <label>Applied Position (Settings)
            <select class="select" name="applied_position" required></select>
          </label>
          <label class="employee-notes">Status
            <select class="select" name="status" required></select>
          </label>
          <label id="inv-link-wrap" class="employee-notes hidden">Link to Candidate List Record
            <select class="select" name="linked_applicant_id"></select>
          </label>
          <label class="employee-notes">Notes (Optional)
            <input class="input" type="text" name="notes" maxlength="300" placeholder="Optional invitation note…">
          </label>
        </div>
        <div id="inv-modal-error" class="form-error" role="alert"></div>
        <div class="employee-modal-actions">
          <button type="button" class="btn btn-secondary" id="inv-modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="inv-modal-save">Save</button>
        </div>
      </form>
    </section>`;
    document.body.append(modal);
    const close = () => modal.classList.add('hidden');
    $('#inv-modal-close', modal).addEventListener('click', close);
    $('#inv-modal-cancel', modal).addEventListener('click', close);
    bindSafeModalClose(modal, close, { closeOnBackdrop: false });
  }

  const form = $('#inv-modal-form', modal);
  const errorBox = $('#inv-modal-error', modal);
  const posSelect = form.elements.applied_position;
  const sourceSelect = form.elements.source;
  const statusSelect = form.elements.status;
  const linkWrap = $('#inv-link-wrap', modal);
  const linkSelect = form.elements.linked_applicant_id;

  form.reset();
  errorBox.textContent = '';

  const isLinkingAuto = Boolean(existing?.isAutoOnly);
  $('#inv-modal-title', modal).textContent = existing
    ? (isLinkingAuto ? 'Update Candidate Source & Invite Record' : 'Edit Invited Candidate')
    : 'Add Invited Candidate';

  const currentPos = String(existing?.appliedPosition || '').trim();
  const posOptions = [...new Set([...(positions || []), currentPos].filter(pos => pos && pos !== '—'))];
  posSelect.innerHTML = `<option value="">Select position…</option>` +
    posOptions.map(pos => `<option value="${esc(pos)}">${esc(pos)}</option>`).join('');

  const sourceChoices = [...new Set([...INVITE_SOURCES, ...(existing?.source && existing.source !== '—' ? [existing.source] : [])])];
  sourceSelect.innerHTML = sourceChoices.map(src => `<option value="${esc(src)}">${esc(src)}</option>`).join('');
  statusSelect.innerHTML = INVITE_STATUSES.map(st => `<option value="${esc(st)}">${esc(st)}</option>`).join('');

  const availableApplicants = (applicants || []).filter(a => a.stage !== 'stage1_pending');
  linkSelect.innerHTML = `<option value="">Select candidate from Candidate List…</option>` +
    availableApplicants.map(a => {
      const alreadyLinkedElsewhere = linkedApplicantIds.has(a.id) && a.id !== existing?.linkedApplicantId;
      const suffix = alreadyLinkedElsewhere ? ' [Already Linked]' : '';
      return `<option value="${esc(a.id)}" ${alreadyLinkedElsewhere ? 'disabled' : ''}>${esc(a.full_name)} — ${esc(a.position || '—')}${a.nik ? ` (${esc(a.nik)})` : ''}${suffix}</option>`;
    }).join('');

  form.elements.invite_date.value = existing?.inviteDate || new Date().toISOString().slice(0, 10);
  form.elements.candidate_name.value = existing?.candidateName && existing.candidateName !== '—' ? existing.candidateName : '';
  posSelect.value = currentPos && currentPos !== '—' ? currentPos : '';
  sourceSelect.value = sourceChoices.includes(existing?.source) ? existing.source : 'Jobstreet';
  statusSelect.value = existing?.status === 'Responded' ? 'Responded' : 'No Response';
  linkSelect.value = existing?.linkedApplicantId || '';
  form.elements.notes.value = existing?.notes || '';

  const hasStage1Link = Boolean(existing?.linkedStage1Id);
  const syncLinkVisibility = () => {
    const isResponded = statusSelect.value === 'Responded';
    linkWrap.classList.toggle('hidden', !isResponded);
    linkSelect.required = isResponded && !hasStage1Link;
  };
  statusSelect.onchange = syncLinkVisibility;

  linkSelect.onchange = () => {
    const matched = availableApplicants.find(a => a.id === linkSelect.value);
    if (matched) {
      form.elements.candidate_name.value = matched.full_name || form.elements.candidate_name.value;
      if (matched.position && [...posSelect.options].some(o => o.value === matched.position)) {
        posSelect.value = matched.position;
      }
    }
  };
  syncLinkVisibility();

  form.onsubmit = async event => {
    event.preventDefault();
    errorBox.textContent = '';
    const saveBtn = $('#inv-modal-save', modal);
    const inviteDate = form.elements.invite_date.value;
    const candidateName = form.elements.candidate_name.value.trim();
    const appliedPosition = posSelect.value.trim();
    const source = sourceSelect.value;
    const status = statusSelect.value;
    const linkedApplicantId = status === 'Responded' ? (linkSelect.value || null) : null;
    const linkedStage1Id = existing?.linkedStage1Id || null;

    if (!inviteDate) { errorBox.textContent = 'Please select an invitation date.'; return; }
    if (!candidateName) { errorBox.textContent = 'Candidate name is required.'; return; }
    if (!appliedPosition) { errorBox.textContent = 'Please select the applied position.'; return; }
    if (status === 'Responded' && !linkedApplicantId && !linkedStage1Id) {
      errorBox.textContent = 'Please connect this Responded entry to a candidate in Candidate List to avoid duplicates.';
      linkSelect.focus();
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await onSave({
        id: existing?.manualId || null,
        invite_date: inviteDate,
        candidate_name: candidateName,
        applied_position: appliedPosition,
        source,
        status,
        linked_applicant_id: linkedApplicantId,
        linked_stage1_id: linkedStage1Id,
        notes: form.elements.notes.value.trim()
      });
      modal.classList.add('hidden');
    } catch (err) {
      errorBox.textContent = err.message || 'Failed to save invited candidate.';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  };

  modal.classList.remove('hidden');
  form.elements.candidate_name.focus();
}

export function openStage1LeadModal({ lead, positions = [], onSave }) {
  if (!lead) return;
  let modal = $('#stage1-lead-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'stage1-lead-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `<section class="employee-modal-card" style="width:min(540px,100%)" role="dialog" aria-modal="true" aria-labelledby="s1-modal-title">
      <div class="employee-modal-head">
        <div>
          <small>LEAD REGISTER</small>
          <h2 id="s1-modal-title">Edit Lead Record</h2>
        </div>
        <button type="button" class="modal-close" id="s1-modal-close" aria-label="Close">×</button>
      </div>
      <form id="s1-modal-form">
        <div class="employee-form-grid">
          <label class="employee-notes">Applicant Name
            <input class="input" type="text" name="full_name" required maxlength="120" placeholder="Full name">
          </label>
          <label>Applied Position
            <select class="select" name="position" required></select>
          </label>
          <label>Source
            <select class="select" name="source" required></select>
          </label>
          <label>WhatsApp No.
            <input class="input" type="text" name="whatsapp" maxlength="40" placeholder="08xxxxxxxxxx">
          </label>
          <label>Lead Recommendation
            <select class="select" name="recommendation">
              <option value="Pending">Pending</option>
              <option value="Recommended">Recommended</option>
              <option value="Not Recommended">Not Recommended</option>
            </select>
          </label>
        </div>
        <div id="s1-modal-error" class="form-error" role="alert"></div>
        <div class="employee-modal-actions">
          <button type="button" class="btn btn-secondary" id="s1-modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="s1-modal-save">Save Changes</button>
        </div>
      </form>
    </section>`;
    document.body.append(modal);
    const close = () => modal.classList.add('hidden');
    $('#s1-modal-close', modal).addEventListener('click', close);
    $('#s1-modal-cancel', modal).addEventListener('click', close);
    bindSafeModalClose(modal, close, { closeOnBackdrop: false });
  }

  const form = $('#s1-modal-form', modal);
  const errorBox = $('#s1-modal-error', modal);
  const posSelect = form.elements.position;
  const srcSelect = form.elements.source;
  const recSelect = form.elements.recommendation;

  form.reset();
  errorBox.textContent = '';

  const currentPos = String(lead.position || '').trim();
  const posOptions = [...new Set([...(positions || []), currentPos].filter(pos => pos && pos !== '—' && pos !== '-'))];
  posSelect.innerHTML = `<option value="">Select position…</option>` +
    posOptions.map(pos => `<option value="${esc(pos)}">${esc(pos)}</option>`).join('');

  const currentSource = String(lead.source || '').trim();
  const srcOptions = [...new Set([...INVITE_SOURCES, ...(currentSource && currentSource !== '-' ? [currentSource] : [])])];
  srcSelect.innerHTML = srcOptions.map(src => `<option value="${esc(src)}">${esc(src)}</option>`).join('');

  form.elements.full_name.value = lead.full_name || '';
  posSelect.value = currentPos || '';
  srcSelect.value = srcOptions.includes(currentSource) ? currentSource : (srcOptions[0] || 'Jobstreet');
  form.elements.whatsapp.value = lead.whatsapp || '';
  const recVal = ['Pending', 'Recommended', 'Not Recommended'].includes(lead.recommendation) ? lead.recommendation : 'Pending';
  recSelect.value = recVal;
  $('#s1-modal-title', modal).textContent = `Edit Lead · ${lead.full_name || 'Candidate'}`;

  form.onsubmit = async event => {
    event.preventDefault();
    errorBox.textContent = '';
    const saveBtn = $('#s1-modal-save', modal);
    const fullName = form.elements.full_name.value.trim();
    const position = posSelect.value.trim();
    const source = srcSelect.value;
    const whatsapp = form.elements.whatsapp.value.trim();
    const recommendation = recSelect.value;

    if (fullName.length < 2) {
      errorBox.textContent = 'Applicant name must be at least 2 characters.';
      form.elements.full_name.focus();
      return;
    }
    if (!position) {
      errorBox.textContent = 'Please select an applied position.';
      posSelect.focus();
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await onSave({
        id: lead.id,
        full_name: fullName,
        position,
        source,
        whatsapp,
        recommendation
      });
      modal.classList.add('hidden');
    } catch (err) {
      errorBox.textContent = formatAppError(err, 'Failed to update lead record.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  };

  modal.classList.remove('hidden');
  form.elements.full_name.focus();
}

export function openCvScreeningModal({ existing = null, positions = [], onSave }) {
  let modal = $('#cv-screening-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cv-screening-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `<section class="employee-modal-card" style="width:min(480px,100%)" role="dialog" aria-modal="true" aria-labelledby="cv-scr-title">
      <div class="employee-modal-head">
        <div>
          <small>RECRUITMENT · CV SCREENING</small>
          <h2 id="cv-scr-title">Update CV Screening Count</h2>
        </div>
        <button type="button" class="modal-close" id="cv-scr-close" aria-label="Close">×</button>
      </div>
      <form id="cv-scr-form">
        <div class="employee-form-grid">
          <label class="employee-notes">Position
            <select class="select" name="position" required></select>
          </label>
          <label class="employee-notes">Source
            <select class="select" name="source" required></select>
          </label>
          <label class="employee-notes">Screening Count
            <input class="input" type="number" name="screening_count" min="0" step="1" required placeholder="0">
          </label>
          <label class="employee-notes">Notes (Optional)
            <input class="input" type="text" name="notes" maxlength="250" placeholder="Optional note…">
          </label>
        </div>
        <div id="cv-scr-error" class="form-error" role="alert"></div>
        <div class="employee-modal-actions">
          <button type="button" class="btn btn-secondary" id="cv-scr-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="cv-scr-save">Save Count</button>
        </div>
      </form>
    </section>`;
    document.body.append(modal);
    const close = () => modal.classList.add('hidden');
    $('#cv-scr-close', modal).addEventListener('click', close);
    $('#cv-scr-cancel', modal).addEventListener('click', close);
    bindSafeModalClose(modal, close, { closeOnBackdrop: false });
  }

  const form = $('#cv-scr-form', modal);
  const errorBox = $('#cv-scr-error', modal);
  form.reset();
  errorBox.textContent = '';

  const positionSelect = form.elements.position;
  const existingPos = String(existing?.position || '').trim();
  const posList = [...new Set([...(positions || []), ...(existingPos ? [existingPos] : [])].filter(Boolean))];
  positionSelect.innerHTML = `<option value="">Select position…</option>` +
    posList.map(pos => `<option value="${esc(pos)}">${esc(pos)}</option>`).join('');
  positionSelect.value = existingPos || '';
  positionSelect.disabled = Boolean(existing?.id && existingPos);

  const sourceSelect = form.elements.source;
  const sourceList = [...new Set([...INVITE_SOURCES, ...(existing?.source ? [existing.source] : [])])];
  sourceSelect.innerHTML = sourceList.map(src => `<option value="${esc(src)}">${esc(src)}</option>`).join('');
  sourceSelect.value = existing?.source || 'Jobstreet';
  sourceSelect.disabled = Boolean(existing?.id && existingPos);

  form.elements.screening_count.value = existing ? String(existing.screeningCount ?? existing.screening_count ?? 0) : '';
  form.elements.notes.value = existing?.notes || '';
  $('#cv-scr-title', modal).textContent = existing
    ? `Edit Screening · ${existingPos ? `${existingPos} · ` : ''}${existing.source}`
    : 'Add CV Screening Count';

  form.onsubmit = async event => {
    event.preventDefault();
    errorBox.textContent = '';
    const saveBtn = $('#cv-scr-save', modal);
    const position = positionSelect.disabled ? existingPos : positionSelect.value.trim();
    const source = sourceSelect.disabled ? (existing?.source || '') : sourceSelect.value;
    const count = Number.parseInt(form.elements.screening_count.value, 10);
    if (!position) { errorBox.textContent = 'Please select a position.'; positionSelect.focus(); return; }
    if (!source) { errorBox.textContent = 'Please select a source.'; sourceSelect.focus(); return; }
    if (!Number.isInteger(count) || count < 0) {
      errorBox.textContent = 'Screening count must be 0 or higher.';
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await onSave({
        id: existing?.id || null,
        position,
        source,
        screening_count: count,
        notes: form.elements.notes.value.trim()
      });
      modal.classList.add('hidden');
    } catch (err) {
      errorBox.textContent = err.message || 'Failed to save CV screening record.';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Count';
    }
  };

  modal.classList.remove('hidden');
  (existing && existingPos ? form.elements.screening_count : positionSelect).focus();
}

export function openFullEmployeeModal({ employee = null, applicant = null, onSave }) {
  let modal = $('#employee-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'employee-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `<section class="employee-modal-card" style="width:min(760px,100%)" role="dialog" aria-modal="true" aria-labelledby="employee-modal-title">
      <div class="employee-modal-head">
        <div><small>EMPLOYEE DIRECTORY</small><h2 id="employee-modal-title">Employee Record</h2></div>
        <button type="button" class="modal-close" id="employee-modal-close" aria-label="Close">×</button>
      </div>
      <form id="employee-form">
        <div class="employee-form-grid">
          <label>Name<input class="input" name="full_name" required maxlength="120"></label>
          <label>Employee NIK<input class="input" name="employee_no" required maxlength="40" placeholder="e.g., ST 130116"></label>
          <label>Department<input class="input" name="department" maxlength="120"></label>
          <label>Position<input class="input" name="position" maxlength="120"></label>
          <label>Join Date<input class="input" type="date" name="join_date"></label>
          <label>Status<select class="select" name="employment_status">
            <option value="TETAP">TETAP (Permanent)</option>
            <option value="KONTRAK">KONTRAK (Contract)</option>
            <option value="HARIAN">HARIAN (Daily)</option>
            <option value="Probation">Probation</option>
            <option value="Nonaktif">Inactive</option>
          </select></label>
          <label>Contract Start<input class="input" type="date" name="contract_start_date"></label>
          <label>Contract End<input class="input" type="date" name="contract_end_date"></label>
          <label class="employee-notes">Address<input class="input" name="address" maxlength="300"></label>
          <label>ID Card NIK (16 Digits)<input class="input" name="ktp_nik" maxlength="20" inputmode="numeric"></label>
          <label>Phone No.<input class="input" name="phone" maxlength="30"></label>
          <label>Birth Place<input class="input" name="birth_place" maxlength="100"></label>
          <label>Birth Date<input class="input" type="date" name="birth_date"></label>
          <label>Education<input class="input" name="education" maxlength="60" placeholder="SMA / SMK / S1 / SMP"></label>
          <label>Gender<select class="select" name="gender">
            <option value="">Select…</option>
            <option value="Laki-laki">Male (Laki-laki)</option>
            <option value="Perempuan">Female (Perempuan)</option>
          </select></label>
          <label>Religion<input class="input" name="religion" maxlength="40" placeholder="Islam / Christian / etc."></label>
          <label>Home Base<select class="select" name="home_base">
            <option value="PASURUAN">PASURUAN</option>
            <option value="SURABAYA">SURABAYA</option>
            <option value="JAKARTA">JAKARTA</option>
            <option value="KILN DRY">KILN DRY</option>
          </select></label>
          <label>Company<select class="select" name="company_entity">
            <option value="MITRA">MITRA — PT. Mitra Binamandiri Makmur</option>
            <option value="REHOLZ">REHOLZ — PT Radin Mitra Lestari</option>
          </select></label>
          <label>Notes<input class="input" name="notes" maxlength="500"></label>
        </div>
        <div id="employee-form-error" class="form-error" role="alert"></div>
        <div class="employee-modal-actions">
          <button type="button" class="btn btn-secondary" id="employee-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="employee-save">Save Record</button>
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
  const hbVal = normalizeHomeBase(employee?.home_base || 'PASURUAN');
  if (![...form.elements.home_base.options].some(o => o.value === hbVal)) {
    const opt = document.createElement('option');
    opt.value = hbVal;
    opt.textContent = hbVal;
    form.elements.home_base.append(opt);
  }
  form.elements.home_base.value = hbVal;
  form.elements.company_entity.value = normalizeCompanyEntity(employee?.company_entity || 'MITRA');
  form.elements.notes.value = employee?.notes || '';

  $('#employee-modal-title', modal).textContent = employee ? `Edit Employee · ${form.elements.full_name.value}` : 'Add Employee';

  form.onsubmit = async event => {
    event.preventDefault();
    const saveBtn = $('#employee-save', modal);
    errorBox.textContent = '';
    const fd = Object.fromEntries(new FormData(form).entries());
    if (!fd.full_name.trim() || !fd.employee_no.trim()) {
      errorBox.textContent = 'Name and Employee NIK are required.';
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await onSave(normalizeEmployeeRecordUppercase({
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
        home_base: normalizeHomeBase(fd.home_base),
        company_entity: normalizeCompanyEntity(fd.company_entity),
        notes: fd.notes.trim()
      }));
      modal.classList.add('hidden');
    } catch (err) {
      errorBox.textContent = formatAppError(err, 'Gagal menyimpan data karyawan.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Record';
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
        <div><small>EMPLOYEE DIRECTORY · IMPORT DATA</small><h2 id="emp-upload-title">Upload Employee Data (XLSX / CSV)</h2></div>
        <button type="button" class="modal-close" id="emp-upload-close" aria-label="Close">×</button>
      </div>
      <div class="upload-preview-box">
        <b>Required Spreadsheet Format (18 Columns):</b>
        <div style="margin-top:6px;color:var(--muted);line-height:1.5">${esc(EMPLOYEE_TABLE_HEADERS.join(' · '))}</div>
        <div style="margin-top:10px">
          <button type="button" class="btn btn-secondary btn-xs" id="emp-download-template">Download XLSX Template ↓</button>
        </div>
      </div>
      <div style="margin-top:14px">
        <label class="field-label" for="emp-upload-file" style="margin-top:0">Select File (.xlsx, .xls, .csv)</label>
        <input id="emp-upload-file" class="input" type="file" accept=".xlsx,.xls,.csv">
      </div>
      <div id="emp-upload-preview" class="upload-preview-box hidden"></div>
      <div id="emp-upload-error" class="form-error" role="alert"></div>
      <div class="employee-modal-actions">
        <button type="button" class="btn btn-secondary" id="emp-upload-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="emp-upload-confirm" disabled>Import to Employee Directory</button>
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
      const XLSX = await import('/vendor/xlsx.mjs')
        .then(m => (m.read ? m : m.default || m))
        .catch(() => import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm'));
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error('No worksheet found in the selected file.');
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
      const { rows, errors } = parseEmployeeWorksheetAoa(aoa);
      if (errors.length) {
        errorBox.textContent = errors.slice(0, 3).join(' ');
      }
      if (!rows.length) {
        if (!errorBox.textContent) errorBox.textContent = 'No valid employee rows found.';
        return;
      }
      parsedRows = rows;
      confirmBtn.disabled = false;
      previewBox.classList.remove('hidden');
      previewBox.innerHTML = `<b>${rows.length} rows ready to import</b> (matched by unique NIK):<div style="margin-top:6px;max-height:140px;overflow:auto">${rows.slice(0, 8).map(r => `<div>• <b>${esc(r.employee_no)}</b> — ${esc(r.full_name)} (${esc(r.department || '—')} · ${esc(r.home_base || 'PASURUAN')} · ${esc(r.company_entity || 'MITRA')})</div>`).join('')}${rows.length > 8 ? `<div>… and ${rows.length - 8} more rows.</div>` : ''}</div>`;
    } catch (err) {
      errorBox.textContent = formatAppError(err, 'Gagal membaca file spreadsheet.');
    }
  };

  confirmBtn.onclick = async () => {
    if (!parsedRows.length) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Importing…';
    errorBox.textContent = '';
    try {
      await onImport(parsedRows);
      modal.classList.add('hidden');
    } catch (err) {
      errorBox.textContent = formatAppError(err, 'Gagal mengimpor data karyawan.');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Import to Employee Directory';
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
        <div><small>USER MANAGEMENT</small><h2 id="user-modal-title">Add User</h2></div>
        <button type="button" class="modal-close" id="user-modal-close" aria-label="Close">×</button>
      </div>
      <form id="user-modal-form">
        <div class="employee-form-grid">
          <label class="employee-notes" id="user-emp-select-wrap">Select Employee (Employee Directory)
            <select class="select" name="employee_id"></select>
          </label>
          <label>Employee NIK<input class="input" name="nik" required maxlength="32" placeholder="Auto-filled from Employee Directory"></label>
          <label>Employee Name<input class="input" name="full_name" required maxlength="100" placeholder="Auto-filled from Employee Directory"></label>
          <label>Role<select class="select" name="role"><option value="Superadmin">Superadmin</option></select></label>
          <label>PIN (4–12 Digits)
            <div class="pin-input-wrap" style="margin-top:6px">
              <input class="input" name="pin" type="password" inputmode="numeric" maxlength="12" style="margin-top:0" placeholder="Enter numeric PIN">
              <button type="button" id="user-pin-eye" class="pin-toggle-btn" aria-label="Reveal PIN">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
          </label>
        </div>
        <div id="user-modal-error" class="form-error" role="alert"></div>
        <div class="employee-modal-actions">
          <button type="button" class="btn btn-secondary" id="user-modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="user-modal-save">Save User</button>
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
    .sort((a, b) => String(a.full_name || a.employee_no || '').localeCompare(String(b.full_name || b.employee_no || ''), 'en'));

  if (!existing) {
    empSelectWrap.classList.remove('hidden');
    empSelect.required = true;
    empSelect.innerHTML = `<option value="">${eligibleEmployees.length ? 'Select employee from Employee Directory…' : 'Employee Directory is empty…'}</option>` +
      eligibleEmployees.map(emp => `<option value="${esc(emp.id)}" data-nik="${esc(emp.employee_no || '')}" data-name="${esc(emp.full_name || '')}">${esc(buildEmployeeUserOptionLabel(emp))}</option>`).join('');
    empSelect.value = '';
    form.elements.nik.readOnly = true;
    form.elements.full_name.readOnly = true;
    if (!eligibleEmployees.length) {
      errorBox.textContent = 'Employee Directory is empty. Add employees in Employee Directory first.';
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

  $('#user-modal-title', modal).textContent = existing ? `Edit User · ${existing.employee_nik}` : 'Add User (Employee Directory)';
  form.elements.role.value = 'Superadmin';
  form.elements.pin.type = 'password';
  form.elements.pin.required = !existing;
  form.elements.pin.placeholder = existing ? 'Leave blank to keep current PIN' : 'Enter 4–12 numeric digits';

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
      errorBox.textContent = 'Please select an employee from Employee Directory first.';
      empSelect.focus();
      return;
    }
    const nik = form.elements.nik.value.trim();
    const fullName = form.elements.full_name.value.trim();
    const pin = form.elements.pin.value.trim();
    if (nik.length < 3) { errorBox.textContent = 'Employee NIK must be at least 3 characters.'; return; }
    if (fullName.length < 2) { errorBox.textContent = 'Employee Name is required.'; return; }
    if ((!existing || pin) && !/^\d{4,12}$/.test(pin)) {
      errorBox.textContent = 'PIN must be 4–12 numeric digits.';
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await onSave({ nik, full_name: fullName, role: 'Superadmin', pin });
      modal.classList.add('hidden');
    } catch (err) {
      errorBox.textContent = err.message || 'Failed to save user.';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save User';
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
        <div><small>PIN SECURITY VERIFICATION</small><h2 id="pin-reveal-title">Unlock User PIN</h2></div>
        <button type="button" class="modal-close" id="pin-reveal-close" aria-label="Close">×</button>
      </div>
      <form id="pin-reveal-form">
        <p class="subtle" id="pin-reveal-desc" style="margin:0 0 12px"></p>
        <label class="field-label" for="pin-reveal-password" style="margin-top:0">Authorization Password</label>
        <input id="pin-reveal-password" class="input" type="password" required placeholder="Enter unlock password">
        <div id="pin-reveal-error" class="form-error" role="alert"></div>
        <div class="employee-modal-actions">
          <button type="button" class="btn btn-secondary" id="pin-reveal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="pin-reveal-submit">Unlock PIN</button>
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
  $('#pin-reveal-desc', modal).textContent = `Enter password to reveal PIN ${label ? `(${label})` : ''}.`;
  pwdInput.value = '';
  errorBox.textContent = '';

  form.onsubmit = async event => {
    event.preventDefault();
    const pwd = pwdInput.value;
    if (!verifyPinRevealPassword(pwd)) {
      errorBox.textContent = 'Incorrect unlock password.';
      pwdInput.focus();
      return;
    }
    const btn = $('#pin-reveal-submit', modal);
    btn.disabled = true;
    btn.textContent = 'Unlocking…';
    try {
      await onUnlocked(pwd);
      modal.classList.add('hidden');
    } catch (err) {
      errorBox.textContent = err.message || 'Unable to reveal PIN.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Unlock PIN';
    }
  };

  modal.classList.remove('hidden');
  pwdInput.focus();
}

export function openConfirmDialog({
  title = 'Confirm Action',
  message = 'Proceed with this action?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false
} = {}) {
  return new Promise(resolve => {
    let modal = $('#workspace-confirm-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'workspace-confirm-modal';
      modal.className = 'modal-backdrop hidden';
      modal.style.zIndex = '1450';
      modal.innerHTML = `<section class="employee-modal-card" style="width:min(440px,100%)" role="dialog" aria-modal="true" aria-labelledby="ws-confirm-title">
        <div class="employee-modal-head">
          <div><small>CONFIRMATION</small><h2 id="ws-confirm-title"></h2></div>
          <button type="button" class="modal-close" id="ws-confirm-close" aria-label="Close">×</button>
        </div>
        <p id="ws-confirm-message" style="margin:4px 0 18px;font-size:13.5px;color:var(--ink-2);line-height:1.5"></p>
        <div class="employee-modal-actions">
          <button type="button" class="btn btn-secondary" id="ws-confirm-cancel"></button>
          <button type="button" class="btn btn-primary" id="ws-confirm-ok"></button>
        </div>
      </section>`;
      document.body.append(modal);
    }
    const titleEl = $('#ws-confirm-title', modal);
    const msgEl = $('#ws-confirm-message', modal);
    const okBtn = $('#ws-confirm-ok', modal);
    const cancelBtn = $('#ws-confirm-cancel', modal);
    const closeBtn = $('#ws-confirm-close', modal);

    titleEl.textContent = title;
    msgEl.textContent = message;
    cancelBtn.textContent = cancelLabel;
    okBtn.textContent = confirmLabel;
    okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;

    const finish = result => {
      modal.classList.add('hidden');
      resolve(result);
    };
    okBtn.onclick = () => finish(true);
    cancelBtn.onclick = () => finish(false);
    closeBtn.onclick = () => finish(false);

    modal.classList.remove('hidden');
    cancelBtn.focus();
  });
}

export { maskPin };
