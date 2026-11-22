import { $, esc } from './common.js?v=20261121-hrga-workspace-15';
import { CONTRACT_DURATION_OPTIONS } from './workspace-logic.js?v=20261121-hrga-workspace-15';
import {
  CONTRACT_DOCUMENTS,
  DEFAULT_CONTRACT_SETTINGS,
  buildAgreementPayload,
  computeEndDate,
  determineRequiredContractDocuments,
  extractDocSequence,
  formatDurationParts,
  inferDurationMonths,
  parseNumericCurrency,
  renderAgreementHtml,
  toIsoDate
} from './contract-logic.js?v=20261121-hrga-workspace-15';

const CONTRACT_SETTINGS_KEY = 'hrga_contract_settings_v1';

function formatCurrencyDigits(raw = '') {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

let cachedMasters = null;
const cachedTemplates = new Map();

function readSavedContractSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONTRACT_SETTINGS_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? { ...DEFAULT_CONTRACT_SETTINGS, ...parsed } : { ...DEFAULT_CONTRACT_SETTINGS };
  } catch {
    return { ...DEFAULT_CONTRACT_SETTINGS };
  }
}

function writeSavedContractSettings(settings) {
  try {
    localStorage.setItem(CONTRACT_SETTINGS_KEY, JSON.stringify({
      companyId: settings.companyId,
      prevUmkYear: settings.prevUmkYear,
      prevUmkAmount: settings.prevUmkAmount,
      currUmkYear: settings.currUmkYear,
      currUmkAmount: settings.currUmkAmount,
      governorDecreeNo: settings.governorDecreeNo,
      overtimeWeekdayRate: settings.overtimeWeekdayRate,
      overtimeHolidayRate: settings.overtimeHolidayRate,
      paydayDay: settings.paydayDay,
      signingCity: settings.signingCity,
      hrName: settings.hrName,
      hrSignatureTitle: settings.hrSignatureTitle
    }));
  } catch {}
}

async function loadCompanyMasters() {
  if (cachedMasters) return cachedMasters;
  const res = await fetch('./assets/contracts/company-masters.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Failed to load company master list.');
  const data = await res.json();
  cachedMasters = Array.isArray(data) && data.length ? data : [];
  return cachedMasters;
}

async function loadContractTemplate(docMeta) {
  if (cachedTemplates.has(docMeta.key)) return cachedTemplates.get(docMeta.key);
  const res = await fetch(`./assets/contracts/${docMeta.file}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load template ${docMeta.file}.`);
  const html = await res.text();
  cachedTemplates.set(docMeta.key, html);
  return html;
}

function formatRupiah(amount) {
  return `Rp ${Math.max(0, Math.round(Number(amount) || 0)).toLocaleString('id-ID')}`;
}

function decorateScreenPreview(html) {
  const previewCss = `<style data-pkwt-preview-fit>
    @media screen {
      html, body {
        background: #dfe4ea !important;
        margin: 0 !important;
        padding: 10px !important;
        overflow-x: hidden !important;
      }
      .a4-page {
        width: 100% !important;
        max-width: 210mm !important;
        min-height: auto !important;
        margin: 0 auto !important;
        padding: 18px 22px !important;
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.12) !important;
        font-size: 10pt !important;
        line-height: 1.45 !important;
      }
      .a4-page table {
        max-width: 100% !important;
      }
    }
  </style>`;
  return html.includes('</head>')
    ? html.replace('</head>', `${previewCss}</head>`)
    : `${previewCss}${html}`;
}

function buildCombinedPrintHtml(renderedDocs, title = 'PKWT Agreement Package') {
  const styles = [];
  const bodies = [];
  const parser = new DOMParser();

  renderedDocs.forEach((docHtml, idx) => {
    const parsed = parser.parseFromString(docHtml, 'text/html');
    if (idx === 0) {
      parsed.querySelectorAll('style').forEach(s => styles.push(s.textContent || ''));
    }
    const pageEl = parsed.querySelector('.a4-page');
    if (pageEl) {
      bodies.push(`<div class="contract-print-sheet">${pageEl.outerHTML}</div>`);
    } else {
      bodies.push(`<div class="contract-print-sheet">${parsed.body?.innerHTML || docHtml}</div>`);
    }
  });

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <style>
    ${styles.join('\n')}
    .contract-print-sheet + .contract-print-sheet {
      page-break-before: always;
      break-before: page;
    }
    @media print {
      .a4-page {
        min-height: auto !important;
      }
    }
  </style>
</head>
<body>
  ${bodies.join('\n')}
</body>
</html>`;
}

function printHtmlViaHiddenIframe(html) {
  const existing = document.getElementById('pkwt-hidden-print-frame');
  if (existing) existing.remove();
  const frame = document.createElement('iframe');
  frame.id = 'pkwt-hidden-print-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '1px';
  frame.style.height = '1px';
  frame.style.opacity = '0';
  frame.style.pointerEvents = 'none';
  frame.style.border = '0';

  frame.onload = () => {
    setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch (err) {
        console.warn('Contract print invocation skipped:', err);
      }
    }, 120);
  };
  frame.srcdoc = html;
  document.body.append(frame);
}

export async function openPkwtConfigModal({
  record = {},
  onPersistEmployee = null,
  onNotify = null
} = {}) {
  const [masters] = await Promise.all([
    loadCompanyMasters(),
    loadContractTemplate(CONTRACT_DOCUMENTS[0])
  ]);

  let modal = document.getElementById('pkwt-config-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pkwt-config-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `<section class="pkwt-modal-card" role="dialog" aria-modal="true" aria-labelledby="pkwt-modal-title">
      <div class="pkwt-modal-head">
        <div>
          <small id="pkwt-modal-kicker">CONTRACT &amp; PKWT CONFIGURATION</small>
          <h2 id="pkwt-modal-title">Configure &amp; Print PKWT Agreement</h2>
        </div>
        <div class="pkwt-head-actions">
          <span id="pkwt-umk-pill" class="status-pill green">1 Document Required</span>
          <button type="button" class="modal-close" id="pkwt-modal-close" aria-label="Close PKWT Configuration">×</button>
        </div>
      </div>

      <div class="pkwt-modal-body">
        <form id="pkwt-config-form" class="pkwt-config-pane">
          <div id="pkwt-umk-banner" class="pkwt-umk-banner is-ok" role="status"></div>

          <fieldset class="pkwt-fieldset">
            <legend>1. Company &amp; Document Header</legend>
            <div class="pkwt-grid-2">
              <label>Company Entity
                <select class="select" name="companyId" required></select>
              </label>
              <label>Document Sequence No.
                <input class="input" type="text" name="docSequence" maxlength="20" required placeholder="e.g., 184">
              </label>
              <label>Contract Start / Signing Date
                <input class="input" type="date" name="signingDate" required>
              </label>
              <label>Contract Duration
                <select class="select" name="durationMonths" required>
                  ${CONTRACT_DURATION_OPTIONS.map(o => `<option value="${o.months}">${esc(o.label)}</option>`).join('')}
                  <option value="24">2 Years (24 Months)</option>
                </select>
              </label>
              <label>Contract End Date (Auto / Editable)
                <input class="input" type="date" name="endDate" required>
              </label>
              <label>Duration Phrase (Preview)
                <input class="input" type="text" name="durationPreview" readonly>
              </label>
              <label>Signing City
                <input class="input" type="text" name="signingCity" maxlength="60" required>
              </label>
              <label>HR Signer Name
                <input class="input" type="text" name="hrName" maxlength="100" required>
              </label>
            </div>
          </fieldset>

          <fieldset class="pkwt-fieldset">
            <legend>2. Employee / Candidate Information</legend>
            <div class="pkwt-grid-2">
              <label>Full Name
                <input class="input" type="text" name="employeeName" maxlength="120" required>
              </label>
              <label>Official Position
                <input class="input" type="text" name="employeePosition" maxlength="120" required>
              </label>
              <label class="pkwt-col-span-2">Address
                <textarea class="textarea" name="employeeAddress" rows="2" maxlength="300" required placeholder="Full residential address for agreement"></textarea>
              </label>
            </div>

            <div class="pkwt-optional-block">
              <div class="pkwt-optional-title">Optional Fields (Included only when checked)</div>
              <div class="pkwt-optional-list">
                <div class="pkwt-optional-item">
                  <label class="pkwt-check-label">
                    <input type="checkbox" name="includeKtp">
                    <span>Include ID Card / KTP Number (No. KTP)</span>
                  </label>
                  <input class="input pkwt-optional-input hidden" type="text" name="employeeKtp" maxlength="25" placeholder="16-digit KTP number">
                </div>
                <div class="pkwt-optional-item">
                  <label class="pkwt-check-label">
                    <input type="checkbox" name="includeNik">
                    <span>Include Employee NIK</span>
                  </label>
                  <input class="input pkwt-optional-input hidden" type="text" name="employeeNik" maxlength="40" placeholder="e.g., ST 260706">
                </div>
                <div class="pkwt-optional-item">
                  <label class="pkwt-check-label">
                    <input type="checkbox" name="includeDepartment">
                    <span>Include Department</span>
                  </label>
                  <input class="input pkwt-optional-input hidden" type="text" name="employeeDepartment" maxlength="80" placeholder="e.g., Production / Packing">
                </div>
                <div class="pkwt-optional-item">
                  <label class="pkwt-check-label">
                    <input type="checkbox" name="includeCustomNote">
                    <span>Include Additional Special Provisions / Notes</span>
                  </label>
                  <textarea class="textarea pkwt-optional-input hidden" name="customNote" rows="2" maxlength="600" placeholder="Optional special clauses printed in the document…"></textarea>
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset class="pkwt-fieldset">
            <legend>3. Wage &amp; UMK Compliance Rule</legend>
            <div class="pkwt-grid-2">
              <label>Monthly Cash Wage / Salary (IDR)
                <input class="input" type="text" inputmode="numeric" name="cashWageAmount" required placeholder="e.g., 5.200.000">
              </label>
              <label>Current Year UMK (IDR)
                <input class="input" type="text" inputmode="numeric" name="currUmkAmount" required>
              </label>
              <label>Payday Date (Every Month)
                <input class="input" type="number" name="paydayDay" min="1" max="31" required>
              </label>
              <label>UMK Year
                <input class="input" type="number" name="currUmkYear" min="2020" max="2099" required>
              </label>
            </div>

            <div id="pkwt-pb-fields" class="pkwt-pb-fields hidden">
              <div class="pkwt-pb-note">Below-UMK Wage Details (Required for Joint Agreements 02–05)</div>
              <div class="pkwt-grid-2">
                <label>Previous Year UMK (IDR)
                  <input class="input" type="text" inputmode="numeric" name="prevUmkAmount">
                </label>
                <label>Previous UMK Year
                  <input class="input" type="number" name="prevUmkYear" min="2020" max="2099">
                </label>
                <label class="pkwt-col-span-2">Governor Decree No. (SK Gubernur)
                  <input class="input" type="text" name="governorDecreeNo" maxlength="100">
                </label>
                <label>Weekday Overtime Rate / Hour (IDR)
                  <input class="input" type="text" inputmode="numeric" name="overtimeWeekdayRate">
                </label>
                <label>Holiday Overtime Rate / Hour (IDR)
                  <input class="input" type="text" inputmode="numeric" name="overtimeHolidayRate">
                </label>
              </div>
            </div>
          </fieldset>

          ${onPersistEmployee ? `<label class="pkwt-check-label pkwt-save-sync"><input type="checkbox" name="syncToEmployee" checked><span>Update contract dates &amp; salary in Employee Directory when printing</span></label>` : ''}
        </form>

        <div class="pkwt-preview-pane">
          <div class="pkwt-doc-tabs" id="pkwt-doc-tabs" role="tablist" aria-label="Required contract documents"></div>
          <div class="pkwt-preview-frame-wrap">
            <iframe id="pkwt-preview-frame" title="PKWT Document Preview" sandbox="allow-same-origin"></iframe>
          </div>
          <div id="pkwt-modal-error" class="form-error" role="alert"></div>
          <div class="pkwt-preview-actions">
            <button type="button" class="btn btn-secondary" id="pkwt-modal-cancel">Close</button>
            <button type="button" class="btn btn-secondary" id="pkwt-print-single">Print Current Document</button>
            <button type="button" class="btn btn-primary" id="pkwt-print-all">Print All Required (1)</button>
          </div>
        </div>
      </div>
    </section>`;
    document.body.append(modal);

    const closeModal = () => modal.classList.add('hidden');
    $('#pkwt-modal-close', modal).addEventListener('click', closeModal);
    $('#pkwt-modal-cancel', modal).addEventListener('click', closeModal);
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
  }

  const form = $('#pkwt-config-form', modal);
  const tabsWrap = $('#pkwt-doc-tabs', modal);
  const previewFrame = $('#pkwt-preview-frame', modal);
  const errorBox = $('#pkwt-modal-error', modal);
  const umkBanner = $('#pkwt-umk-banner', modal);
  const umkPill = $('#pkwt-umk-pill', modal);
  const pbFieldsWrap = $('#pkwt-pb-fields', modal);
  const printSingleBtn = $('#pkwt-print-single', modal);
  const printAllBtn = $('#pkwt-print-all', modal);

  errorBox.textContent = '';

  const savedSettings = readSavedContractSettings();
  const companySelect = form.elements.companyId;
  companySelect.innerHTML = masters.map(c =>
    `<option value="${esc(c.id)}">${esc(c.companyDisplayName || c.companyName)}</option>`
  ).join('');

  const initialCompanyId = masters.some(m => m.id === savedSettings.companyId)
    ? savedSettings.companyId
    : (masters[0]?.id || 'comp-mbm');
  companySelect.value = initialCompanyId;
  const activeMaster = () => masters.find(m => m.id === companySelect.value) || masters[0];

  const startDate = toIsoDate(record.contractStartDate || record.workStartDate || new Date());
  const durMonths = inferDurationMonths(
    startDate,
    record.contractEndDate || '',
    Number(record.durationMonths) || 12
  );
  const endDate = record.contractEndDate && /^\d{4}-\d{2}-\d{2}$/.test(record.contractEndDate)
    ? record.contractEndDate
    : computeEndDate(startDate, durMonths);

  form.elements.docSequence.value = extractDocSequence(record.contractNumber || '', savedSettings.defaultDocSequence || '001');
  form.elements.signingDate.value = startDate;
  if (![...form.elements.durationMonths.options].some(o => Number(o.value) === durMonths)) {
    const opt = document.createElement('option');
    opt.value = String(durMonths);
    opt.textContent = `${durMonths} Months`;
    form.elements.durationMonths.append(opt);
  }
  form.elements.durationMonths.value = String(durMonths);
  form.elements.endDate.value = endDate;
  form.elements.durationPreview.value = formatDurationParts(durMonths).fullPhrase;

  const master = activeMaster();
  form.elements.signingCity.value = savedSettings.signingCity || master?.signingCity || 'Pasuruan';
  form.elements.hrName.value = savedSettings.hrName || master?.hrName || 'Diana Anita Sari';

  form.elements.employeeName.value = record.fullName || '';
  form.elements.employeePosition.value = record.position || '';
  form.elements.employeeAddress.value = record.address || '';

  // Optional fields MUST start unchecked unless user explicitly checks them
  form.elements.includeKtp.checked = false;
  form.elements.employeeKtp.value = record.ktpNik || '';
  form.elements.includeNik.checked = false;
  form.elements.employeeNik.value = record.employeeNik || '';
  form.elements.includeDepartment.checked = false;
  form.elements.employeeDepartment.value = record.department || '';
  form.elements.includeCustomNote.checked = false;
  form.elements.customNote.value = '';

  const syncOptionalInputs = () => {
    const pairs = [
      ['includeKtp', 'employeeKtp'],
      ['includeNik', 'employeeNik'],
      ['includeDepartment', 'employeeDepartment'],
      ['includeCustomNote', 'customNote']
    ];
    pairs.forEach(([checkName, inputName]) => {
      const checked = form.elements[checkName].checked;
      const inputEl = form.elements[inputName];
      inputEl.classList.toggle('hidden', !checked);
      inputEl.disabled = !checked;
    });
  };
  syncOptionalInputs();

  const initialSalary = parseNumericCurrency(record.salary) || parseNumericCurrency(savedSettings.currUmkAmount);
  form.elements.cashWageAmount.value = formatCurrencyDigits(initialSalary);
  form.elements.currUmkAmount.value = formatCurrencyDigits(savedSettings.currUmkAmount);
  form.elements.currUmkYear.value = String(savedSettings.currUmkYear || new Date().getFullYear());
  form.elements.prevUmkAmount.value = formatCurrencyDigits(savedSettings.prevUmkAmount);
  form.elements.prevUmkYear.value = String(savedSettings.prevUmkYear || (new Date().getFullYear() - 1));
  form.elements.governorDecreeNo.value = savedSettings.governorDecreeNo || DEFAULT_CONTRACT_SETTINGS.governorDecreeNo;
  form.elements.overtimeWeekdayRate.value = formatCurrencyDigits(savedSettings.overtimeWeekdayRate);
  form.elements.overtimeHolidayRate.value = formatCurrencyDigits(savedSettings.overtimeHolidayRate);
  form.elements.paydayDay.value = String(savedSettings.paydayDay || 10);

  if (form.elements.syncToEmployee) {
    form.elements.syncToEmployee.checked = Boolean(record.employeeId);
  }

  let selectedDocKey = CONTRACT_DOCUMENTS[0].key;
  let renderSeq = 0;

  const collectFormConfig = () => {
    const currentMaster = activeMaster();
    return {
      companyId: companySelect.value,
      docSequence: form.elements.docSequence.value.trim(),
      signingDate: form.elements.signingDate.value,
      durationMonths: Number(form.elements.durationMonths.value) || 12,
      endDate: form.elements.endDate.value,
      paydayDay: Number(form.elements.paydayDay.value) || 10,
      signingCity: form.elements.signingCity.value.trim(),
      hrName: form.elements.hrName.value.trim(),
      hrSignatureTitle: savedSettings.hrSignatureTitle || currentMaster?.hrSignatureTitle || 'Manager HR GA',
      employeeName: form.elements.employeeName.value.trim(),
      employeePosition: form.elements.employeePosition.value.trim(),
      employeeAddress: form.elements.employeeAddress.value.trim(),
      includeKtp: form.elements.includeKtp.checked,
      employeeKtp: form.elements.employeeKtp.value.trim(),
      includeNik: form.elements.includeNik.checked,
      employeeNik: form.elements.employeeNik.value.trim(),
      includeDepartment: form.elements.includeDepartment.checked,
      employeeDepartment: form.elements.employeeDepartment.value.trim(),
      includeCustomNote: form.elements.includeCustomNote.checked,
      customNote: form.elements.customNote.value.trim(),
      cashWageAmount: parseNumericCurrency(form.elements.cashWageAmount.value),
      currUmkAmount: parseNumericCurrency(form.elements.currUmkAmount.value),
      currUmkYear: Number(form.elements.currUmkYear.value) || 2026,
      prevUmkAmount: parseNumericCurrency(form.elements.prevUmkAmount.value),
      prevUmkYear: Number(form.elements.prevUmkYear.value) || 2025,
      governorDecreeNo: form.elements.governorDecreeNo.value.trim(),
      overtimeWeekdayRate: parseNumericCurrency(form.elements.overtimeWeekdayRate.value),
      overtimeHolidayRate: parseNumericCurrency(form.elements.overtimeHolidayRate.value)
    };
  };

  const renderPreview = async () => {
    const seq = ++renderSeq;
    const config = collectFormConfig();
    const currentMaster = activeMaster();
    const rule = determineRequiredContractDocuments(config.cashWageAmount, config.currUmkAmount);

    umkPill.textContent = `${rule.requiredCount} ${rule.requiredCount === 1 ? 'Document' : 'Documents'} Required`;
    umkPill.className = `status-pill ${rule.meetsUmk ? 'green' : 'gold'}`;

    if (rule.meetsUmk) {
      umkBanner.className = 'pkwt-umk-banner is-ok';
      umkBanner.innerHTML = `<b>Wage meets or exceeds UMK (${formatRupiah(rule.umk)}):</b> Only <b>PKWT (1 document)</b> is required. Joint Agreements (Perjanjian Bersama / Penyelesaian Bersama) are automatically omitted.`;
    } else {
      umkBanner.className = 'pkwt-umk-banner is-warn';
      umkBanner.innerHTML = `<b>Wage is below UMK (${formatRupiah(rule.umk)}) · Shortfall ${formatRupiah(rule.shortfall)}:</b> All <b>5 agreements</b> (PKWT + 4 Joint Agreements) are required.`;
    }

    pbFieldsWrap.classList.toggle('hidden', rule.meetsUmk);
    printAllBtn.textContent = `Print All Required (${rule.requiredCount})`;

    if (!rule.documents.some(d => d.key === selectedDocKey)) {
      selectedDocKey = rule.documents[0].key;
    }

    tabsWrap.innerHTML = rule.documents.map(doc => `
      <button type="button" role="tab" class="pkwt-doc-tab ${doc.key === selectedDocKey ? 'is-active' : ''}"
        aria-selected="${doc.key === selectedDocKey}" data-doc-key="${esc(doc.key)}">
        ${esc(doc.shortTitle)}
      </button>
    `).join('');

    tabsWrap.querySelectorAll('[data-doc-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedDocKey = btn.dataset.docKey;
        renderPreview();
      });
    });

    const activeDoc = rule.documents.find(d => d.key === selectedDocKey) || rule.documents[0];
    try {
      const templateHtml = await loadContractTemplate(activeDoc);
      if (seq !== renderSeq) return;
      const payload = buildAgreementPayload(config, currentMaster);
      const rendered = renderAgreementHtml(templateHtml, payload, currentMaster);
      previewFrame.srcdoc = decorateScreenPreview(rendered);
    } catch (err) {
      if (seq === renderSeq) errorBox.textContent = err.message || 'Unable to render agreement preview.';
    }
  };

  // Wire field listeners
  companySelect.onchange = () => {
    const m = activeMaster();
    if (m) {
      form.elements.signingCity.value = m.signingCity || 'Pasuruan';
      form.elements.hrName.value = m.hrName || 'Diana Anita Sari';
    }
    renderPreview();
  };

  const syncDatesFromDuration = () => {
    const sDate = form.elements.signingDate.value;
    const months = Number(form.elements.durationMonths.value) || 12;
    form.elements.durationPreview.value = formatDurationParts(months).fullPhrase;
    if (/^\d{4}-\d{2}-\d{2}$/.test(sDate)) {
      form.elements.endDate.value = computeEndDate(sDate, months);
    }
    renderPreview();
  };

  form.elements.signingDate.onchange = syncDatesFromDuration;
  form.elements.durationMonths.onchange = syncDatesFromDuration;

  ['cashWageAmount', 'currUmkAmount', 'prevUmkAmount', 'overtimeWeekdayRate', 'overtimeHolidayRate'].forEach(name => {
    const el = form.elements[name];
    el.oninput = () => {
      el.value = formatCurrencyDigits(el.value);
      renderPreview();
    };
  });

  ['includeKtp', 'includeNik', 'includeDepartment', 'includeCustomNote'].forEach(name => {
    form.elements[name].onchange = () => {
      syncOptionalInputs();
      renderPreview();
    };
  });

  form.oninput = event => {
    if (['cashWageAmount', 'currUmkAmount', 'prevUmkAmount', 'overtimeWeekdayRate', 'overtimeHolidayRate', 'signingDate', 'durationMonths'].includes(event.target?.name)) {
      return;
    }
    renderPreview();
  };

  const handlePrint = async (printAll) => {
    errorBox.textContent = '';
    if (!form.reportValidity()) return;
    const config = collectFormConfig();
    if (!config.employeeName || !config.employeePosition || !config.employeeAddress) {
      errorBox.textContent = 'Employee Name, Official Position, and Address are required before printing.';
      return;
    }
    if (config.cashWageAmount <= 0) {
      errorBox.textContent = 'Please enter a valid Monthly Cash Wage / Salary.';
      return;
    }

    const currentMaster = activeMaster();
    writeSavedContractSettings(config);

    const rule = determineRequiredContractDocuments(config.cashWageAmount, config.currUmkAmount);
    const docsToPrint = printAll
      ? rule.documents
      : [rule.documents.find(d => d.key === selectedDocKey) || rule.documents[0]];

    const targetBtn = printAll ? printAllBtn : printSingleBtn;
    const originalText = targetBtn.textContent;
    targetBtn.disabled = true;
    targetBtn.textContent = 'Preparing Print…';

    try {
      const payload = buildAgreementPayload(config, currentMaster);
      const htmlList = await Promise.all(
        docsToPrint.map(async docMeta => {
          const tpl = await loadContractTemplate(docMeta);
          return renderAgreementHtml(tpl, payload, currentMaster);
        })
      );

      if (onPersistEmployee && form.elements.syncToEmployee?.checked) {
        await onPersistEmployee({
          record,
          config,
          payload
        });
      }

      const combined = buildCombinedPrintHtml(
        htmlList,
        `${config.employeeName} — ${printAll ? `${docsToPrint.length} Contract Documents` : docsToPrint[0].title}`
      );
      printHtmlViaHiddenIframe(combined);
      if (onNotify) {
        onNotify(`Prepared ${docsToPrint.length} agreement document${docsToPrint.length === 1 ? '' : 's'} for ${config.employeeName}.`);
      }
    } catch (err) {
      errorBox.textContent = err.message || 'Failed to prepare agreement package for printing.';
    } finally {
      targetBtn.disabled = false;
      targetBtn.textContent = originalText;
    }
  };

  printSingleBtn.onclick = () => handlePrint(false);
  printAllBtn.onclick = () => handlePrint(true);

  modal.classList.remove('hidden');
  await renderPreview();
}
