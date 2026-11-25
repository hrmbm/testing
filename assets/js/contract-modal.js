import { $, esc } from './common.js?v=20261124-hrga-workspace-22';
import { bindSafeModalClose } from './admin-modals.js?v=20261124-hrga-workspace-22';
import {
  CONTRACT_DURATION_OPTIONS,
  preserveCaretCurrencyValue,
  resolveCompanyMasterIdFromEntity
} from './workspace-logic.js?v=20261124-hrga-workspace-22';
import {
  CONTRACT_DOCUMENTS,
  DEFAULT_CONTRACT_SETTINGS,
  buildAgreementPayload,
  buildPkwtPrintPackageHtml,
  computeEndDate,
  determineRequiredContractDocuments,
  formatContractCode,
  parseNumericCurrency,
  renderAgreementHtml,
  resolveDefaultContractStartDate,
  toIsoDate
} from './contract-logic.js?v=20261124-hrga-workspace-22';

export const CONTRACT_SETTINGS_STORAGE_KEY = 'hrga_contract_settings_v1';

function formatCurrencyDigits(raw = '') {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

let cachedMasters = null;
let cachedReholzLogoUrl = null;
const cachedTemplates = new Map();

async function loadReholzLogoUrl() {
  if (cachedReholzLogoUrl) return cachedReholzLogoUrl;
  const absUrl = new URL('./assets/img/logo-reholz-green.png', document.baseURI).href;
  try {
    const res = await fetch(absUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Logo fetch failed');
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || absUrl));
      reader.onerror = () => reject(reader.error || new Error('Read error'));
      reader.readAsDataURL(blob);
    });
    cachedReholzLogoUrl = dataUrl;
    return cachedReholzLogoUrl;
  } catch {
    cachedReholzLogoUrl = absUrl;
    return cachedReholzLogoUrl;
  }
}

export function readSavedContractSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONTRACT_SETTINGS_STORAGE_KEY) || 'null');
    return parsed && typeof parsed === 'object'
      ? { ...DEFAULT_CONTRACT_SETTINGS, ...parsed }
      : { ...DEFAULT_CONTRACT_SETTINGS };
  } catch {
    return { ...DEFAULT_CONTRACT_SETTINGS };
  }
}

export function writeSavedContractSettings(settings = {}) {
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

function decorateScreenPreview(html) {
  const previewCss = `<style data-pkwt-preview-fit>
    @media screen {
      html, body {
        background: #dfe4ea !important;
        margin: 0 !important;
        padding: 10px !important;
        overflow-x: hidden !important;
      }
      .a4-page:not(.contract-sheet):not(.pkwt-sheet) {
        width: 100% !important;
        max-width: 215.9mm !important;
        min-height: auto !important;
        margin: 0 auto !important;
        padding: 18px 22px !important;
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.12) !important;
        font-size: 10pt !important;
        line-height: 1.45 !important;
      }
      .contract-sheet,
      .pkwt-sheet {
        zoom: 0.68;
        margin: 0 auto 14px auto !important;
        box-shadow: 0 3px 12px rgba(15, 23, 42, 0.16) !important;
      }
      .contract-sheet:last-child,
      .pkwt-sheet:last-child {
        margin-bottom: 0 !important;
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

function scopeTemplateCssForPrintStage(rawCss = '') {
  return String(rawCss || '')
    .replace(/\bbody\b/g, '#pkwt-print-stage')
    .replace(/\bhtml\b/g, '#pkwt-print-stage');
}

function printDocumentsViaDomStage(renderedDocs, title = 'PKWT Agreement Package') {
  return new Promise(resolve => {
    const parser = new DOMParser();
    const seenCss = new Set();
    const collectedStyles = [];
    const sheets = [];

    renderedDocs.forEach(docHtml => {
      const parsed = parser.parseFromString(docHtml, 'text/html');
      parsed.querySelectorAll('style').forEach(s => {
        const scoped = scopeTemplateCssForPrintStage(s.textContent || '');
        if (scoped.trim() && !seenCss.has(scoped)) {
          seenCss.add(scoped);
          collectedStyles.push(scoped);
        }
      });
      const pageEls = parsed.querySelectorAll('.a4-page');
      const innerPages = pageEls.length
        ? [...pageEls].map(el => el.outerHTML).join('\n')
        : (parsed.body?.innerHTML || docHtml);
      sheets.push(`<div class="pkwt-print-sheet">${innerPages}</div>`);
    });

    let stage = document.getElementById('pkwt-print-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.id = 'pkwt-print-stage';
      stage.setAttribute('aria-hidden', 'true');
      document.body.append(stage);
    }

    let styleEl = document.getElementById('pkwt-print-dynamic-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'pkwt-print-dynamic-style';
      document.head.append(styleEl);
    }

    styleEl.textContent = collectedStyles.join('\n');
    stage.innerHTML = sheets.join('\n');

    const prevTitle = document.title;
    document.title = title;
    document.body.classList.add('pkwt-printing');

    let done = false;
    let fallbackTimer = null;
    const cleanup = () => {
      if (done) return;
      done = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      window.removeEventListener('afterprint', cleanup);
      document.body.classList.remove('pkwt-printing');
      document.title = prevTitle;
      resolve();
    };

    window.addEventListener('afterprint', cleanup, { once: true });

    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          window.print();
        } catch (err) {
          console.warn('window.print invocation error:', err);
        } finally {
          fallbackTimer = setTimeout(cleanup, 300);
        }
      }, 80);
    });
  });
}

export async function openPkwtConfigModal({
  record = {},
  contractSettings = null,
  nextDocSequence = '',
  onAfterPrint = null
} = {}) {
  const [masters, reholzLogoUrl] = await Promise.all([
    loadCompanyMasters(),
    loadReholzLogoUrl(),
    ...CONTRACT_DOCUMENTS.map(docMeta => loadContractTemplate(docMeta).catch(() => ''))
  ]);

  let modal = document.getElementById('pkwt-config-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pkwt-config-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `<section class="pkwt-modal-card" role="dialog" aria-modal="true" aria-labelledby="pkwt-modal-title">
      <div class="pkwt-modal-head">
        <div>
          <small>CONTRACT &amp; PKWT CONFIGURATION</small>
          <h2 id="pkwt-modal-title">Configure &amp; Print PKWT Agreement</h2>
        </div>
        <div class="pkwt-head-actions">
          <button type="button" class="modal-close" id="pkwt-modal-close" aria-label="Close PKWT Configuration">×</button>
        </div>
      </div>

      <div class="pkwt-modal-body">
        <form id="pkwt-config-form" class="pkwt-config-pane">
          <fieldset class="pkwt-fieldset">
            <legend>1. Company &amp; Document Header</legend>
            <div class="pkwt-grid-2">
              <label>Company Entity
                <select class="select" name="companyId" required></select>
              </label>
              <label>Document Sequence No.
                <input class="input" type="text" name="docSequence" maxlength="20" required placeholder="e.g., 202">
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
              <label class="pkwt-col-span-2">Signing City
                <input class="input" type="text" name="signingCity" maxlength="60" required>
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
              <label class="pkwt-col-span-2">Monthly Cash Wage / Salary (IDR)
                <input class="input" type="text" inputmode="numeric" name="cashWageAmount" required placeholder="e.g., 5.200.000">
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
    bindSafeModalClose(modal, closeModal, { closeOnBackdrop: true });
  }

  const form = $('#pkwt-config-form', modal);
  const tabsWrap = $('#pkwt-doc-tabs', modal);
  const previewFrame = $('#pkwt-preview-frame', modal);
  const errorBox = $('#pkwt-modal-error', modal);
  const printSingleBtn = $('#pkwt-print-single', modal);
  const printAllBtn = $('#pkwt-print-all', modal);

  errorBox.textContent = '';

  const activeSettings = {
    ...readSavedContractSettings(),
    ...(contractSettings && typeof contractSettings === 'object' ? contractSettings : {})
  };

  const companySelect = form.elements.companyId;
  companySelect.innerHTML = masters.map(c =>
    `<option value="${esc(c.id)}">${esc(c.companyDisplayName || c.companyName)}</option>`
  ).join('');

  const preferredCompanyId = record?.companyEntity
    ? resolveCompanyMasterIdFromEntity(record.companyEntity)
    : activeSettings.companyId;
  const initialCompanyId = masters.some(m => m.id === preferredCompanyId)
    ? preferredCompanyId
    : (masters.some(m => m.id === activeSettings.companyId) ? activeSettings.companyId : (masters[0]?.id || 'comp-mbm'));
  companySelect.value = initialCompanyId;
  const activeMaster = () => masters.find(m => m.id === companySelect.value) || masters[0];

  const startDate = resolveDefaultContractStartDate(record);
  const durMonths = Number(record.durationMonths) || 12;

  form.elements.docSequence.value = String(nextDocSequence || activeSettings.defaultDocSequence || '001');
  form.elements.signingDate.value = startDate;
  if (![...form.elements.durationMonths.options].some(o => Number(o.value) === durMonths)) {
    const opt = document.createElement('option');
    opt.value = String(durMonths);
    opt.textContent = `${durMonths} Months`;
    form.elements.durationMonths.append(opt);
  }
  form.elements.durationMonths.value = String(durMonths);

  const master = activeMaster();
  form.elements.signingCity.value = activeSettings.signingCity || master?.signingCity || 'Pasuruan';

  form.elements.employeeName.value = record.fullName || '';
  form.elements.employeePosition.value = record.position || '';
  form.elements.employeeAddress.value = record.address || '';

  const initialSalary = parseNumericCurrency(record.salary) || parseNumericCurrency(activeSettings.currUmkAmount);
  form.elements.cashWageAmount.value = formatCurrencyDigits(initialSalary);

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

  let selectedDocKey = CONTRACT_DOCUMENTS[0].key;
  let renderSeq = 0;
  let previewDebounceTimer = null;

  const schedulePreviewRender = (delay = 180) => {
    clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(() => {
      previewDebounceTimer = null;
      renderPreview();
    }, delay);
  };

  const collectFormConfig = () => {
    const currentMaster = activeMaster();
    const sDate = toIsoDate(form.elements.signingDate.value);
    const months = Number(form.elements.durationMonths.value) || 12;
    return {
      companyId: companySelect.value,
      docSequence: form.elements.docSequence.value.trim(),
      signingDate: sDate,
      durationMonths: months,
      endDate: computeEndDate(sDate, months),
      paydayDay: Number(activeSettings.paydayDay) || DEFAULT_CONTRACT_SETTINGS.paydayDay,
      signingCity: form.elements.signingCity.value.trim(),
      hrName: activeSettings.hrName || currentMaster?.hrName || DEFAULT_CONTRACT_SETTINGS.hrName,
      hrSignatureTitle: activeSettings.hrSignatureTitle || currentMaster?.hrSignatureTitle || DEFAULT_CONTRACT_SETTINGS.hrSignatureTitle,
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
      currUmkAmount: parseNumericCurrency(activeSettings.currUmkAmount),
      currUmkYear: Number(activeSettings.currUmkYear) || DEFAULT_CONTRACT_SETTINGS.currUmkYear,
      prevUmkAmount: parseNumericCurrency(activeSettings.prevUmkAmount),
      prevUmkYear: Number(activeSettings.prevUmkYear) || DEFAULT_CONTRACT_SETTINGS.prevUmkYear,
      governorDecreeNo: activeSettings.governorDecreeNo || DEFAULT_CONTRACT_SETTINGS.governorDecreeNo,
      overtimeWeekdayRate: parseNumericCurrency(activeSettings.overtimeWeekdayRate),
      overtimeHolidayRate: parseNumericCurrency(activeSettings.overtimeHolidayRate)
    };
  };

  const renderPreview = async () => {
    const seq = ++renderSeq;
    const config = collectFormConfig();
    const currentMaster = activeMaster();
    const rule = determineRequiredContractDocuments(config.cashWageAmount, config.currUmkAmount);

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
      const payload = { ...buildAgreementPayload(config, currentMaster), reholzLogoUrl };
      const rendered = renderAgreementHtml(templateHtml, payload, currentMaster);
      previewFrame.srcdoc = decorateScreenPreview(rendered);
    } catch (err) {
      if (seq === renderSeq) errorBox.textContent = err.message || 'Unable to render agreement preview.';
    }
  };

  companySelect.onchange = () => {
    const m = activeMaster();
    if (m && !activeSettings.signingCity) {
      form.elements.signingCity.value = m.signingCity || 'Pasuruan';
    }
    clearTimeout(previewDebounceTimer);
    renderPreview();
  };

  form.elements.signingDate.onchange = () => {
    clearTimeout(previewDebounceTimer);
    renderPreview();
  };
  form.elements.durationMonths.onchange = () => {
    clearTimeout(previewDebounceTimer);
    renderPreview();
  };

  form.elements.cashWageAmount.oninput = () => {
    const inputEl = form.elements.cashWageAmount;
    const { formatted, caretPos } = preserveCaretCurrencyValue(inputEl.value, inputEl.selectionStart);
    inputEl.value = formatted;
    try { inputEl.setSelectionRange(caretPos, caretPos); } catch {}
    schedulePreviewRender(180);
  };

  ['includeKtp', 'includeNik', 'includeDepartment', 'includeCustomNote'].forEach(name => {
    form.elements[name].onchange = () => {
      syncOptionalInputs();
      clearTimeout(previewDebounceTimer);
      renderPreview();
    };
  });

  form.oninput = event => {
    if (['cashWageAmount', 'signingDate', 'durationMonths'].includes(event.target?.name)) {
      return;
    }
    schedulePreviewRender(180);
  };

  const handlePrint = async (printAll) => {
    clearTimeout(previewDebounceTimer);
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
    const rule = determineRequiredContractDocuments(config.cashWageAmount, config.currUmkAmount);
    const docsToPrint = printAll
      ? rule.documents
      : [rule.documents.find(d => d.key === selectedDocKey) || rule.documents[0]];

    const targetBtn = printAll ? printAllBtn : printSingleBtn;
    const originalText = targetBtn.textContent;
    targetBtn.disabled = true;
    targetBtn.textContent = 'Preparing Print…';

    const docTitle = `${config.employeeName} — ${printAll ? `${docsToPrint.length} Contract Document${docsToPrint.length === 1 ? '' : 's'}` : docsToPrint[0].title}`;
    let printTab = null;
    try {
      printTab = window.open('', '_blank');
      if (printTab && printTab.document) {
        printTab.document.write(`<!doctype html><title>Preparing ${esc(docTitle)}…</title><p style="font:14px 'Plus Jakarta Sans',Arial,sans-serif;padding:30px">Preparing PKWT &amp; Agreement documents…</p>`);
      }
    } catch {
      printTab = null;
    }

    try {
      const payload = { ...buildAgreementPayload(config, currentMaster), reholzLogoUrl };
      const htmlList = await Promise.all(
        docsToPrint.map(async docMeta => {
          const tpl = await loadContractTemplate(docMeta);
          return renderAgreementHtml(tpl, payload, currentMaster);
        })
      );

      if (printTab && !printTab.closed) {
        const packageHtml = buildPkwtPrintPackageHtml(htmlList, {
          title: docTitle,
          autoPrint: true
        });
        printTab.document.open();
        printTab.document.write(packageHtml);
        printTab.document.close();
        try { printTab.focus(); } catch {}
      } else {
        await printDocumentsViaDomStage(htmlList, docTitle);
      }

      modal.classList.add('hidden');

      if (typeof onAfterPrint === 'function') {
        await onAfterPrint({
          record,
          config,
          payload,
          docsPrinted: docsToPrint.length
        });
      }
    } catch (err) {
      if (printTab && !printTab.closed) {
        try { printTab.close(); } catch {}
      }
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

export function openPostPrintEmployeeUpdateModal({
  record = {},
  config = {},
  payload = {},
  currentEmployee = null,
  isRootAdmin = false,
  onSubmitUpdate = null
} = {}) {
  let modal = document.getElementById('pkwt-post-print-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pkwt-post-print-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `<section class="employee-modal-card" style="width:min(720px,100%)" role="dialog" aria-modal="true" aria-labelledby="pkwt-post-title">
      <div class="employee-modal-head">
        <div>
          <small>POST-PRINT EMPLOYEE UPDATE</small>
          <h2 id="pkwt-post-title">Update Employee Directory Record</h2>
        </div>
        <button type="button" class="modal-close" id="pkwt-post-close" aria-label="Close">×</button>
      </div>
      <form id="pkwt-post-form">
        <div class="employee-form-grid">
          <label>Full Name
            <input class="input" type="text" name="fullName" required maxlength="120">
          </label>
          <label>Employee NIK
            <input class="input" type="text" name="employeeNik" required maxlength="40" placeholder="e.g., MBM-2026-0202">
          </label>
          <label>Official Position
            <input class="input" type="text" name="position" required maxlength="120">
          </label>
          <label>Department
            <input class="input" type="text" name="department" maxlength="120" placeholder="e.g., Production">
          </label>
          <label>Employment Status
            <select class="select" name="employmentStatus">
              <option value="KONTRAK">KONTRAK</option>
              <option value="PKWT">PKWT</option>
            </select>
          </label>
          <label>Contract Number
            <input class="input" type="text" name="contractNumber" required maxlength="80">
          </label>
          <label>Contract Start Date
            <input class="input" type="date" name="contractStartDate" required>
          </label>
          <label>Contract End Date
            <input class="input" type="date" name="contractEndDate" required>
          </label>
          <label>Monthly Salary (IDR)
            <input class="input" type="text" inputmode="numeric" name="salary" required>
          </label>
          <label>Address
            <input class="input" type="text" name="address" maxlength="300" required>
          </label>
        </div>
        <div id="pkwt-post-error" class="form-error" role="alert"></div>
        <div class="employee-modal-actions">
          <button type="button" class="btn btn-secondary" id="pkwt-post-skip">Skip</button>
          <button type="submit" class="btn btn-secondary" id="pkwt-post-submit">Submit for Admin Approval</button>
          <button type="button" class="btn btn-primary hidden" id="pkwt-post-approve-now">Approve &amp; Update Employee</button>
        </div>
      </form>
    </section>`;
    document.body.append(modal);

    const close = () => modal.classList.add('hidden');
    $('#pkwt-post-close', modal).addEventListener('click', close);
    $('#pkwt-post-skip', modal).addEventListener('click', close);
    bindSafeModalClose(modal, close, { closeOnBackdrop: true });
  }

  const form = $('#pkwt-post-form', modal);
  const errorBox = $('#pkwt-post-error', modal);
  const submitBtn = $('#pkwt-post-submit', modal);
  const approveNowBtn = $('#pkwt-post-approve-now', modal);
  errorBox.textContent = '';

  const startDate = toIsoDate(payload.signingDate || config.signingDate || new Date());
  const durationMonths = Number(payload.durationMonths || config.durationMonths) || 12;
  const endDate = payload.endDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.endDate)
    ? payload.endDate
    : computeEndDate(startDate, durationMonths);

  form.elements.fullName.value = config.employeeName || currentEmployee?.full_name || record.fullName || '';
  form.elements.employeeNik.value = (config.includeNik ? config.employeeNik : '') || currentEmployee?.employee_no || record.employeeNik || '';
  form.elements.position.value = config.employeePosition || currentEmployee?.position || record.position || '';
  form.elements.department.value = (config.includeDepartment ? config.employeeDepartment : '') || currentEmployee?.department || record.department || '';
  form.elements.employmentStatus.value = currentEmployee?.employment_status?.toUpperCase() === 'PKWT' ? 'PKWT' : 'KONTRAK';
  form.elements.contractNumber.value = formatContractCode(payload.docSequence || config.docSequence || '001', startDate, 'PKWT');
  form.elements.contractStartDate.value = startDate;
  form.elements.contractEndDate.value = endDate;
  form.elements.salary.value = formatCurrencyDigits(config.cashWageAmount || record.salary || 0);
  form.elements.address.value = config.employeeAddress || currentEmployee?.address || record.address || '';

  form.elements.salary.oninput = () => {
    const inputEl = form.elements.salary;
    const { formatted, caretPos } = preserveCaretCurrencyValue(inputEl.value, inputEl.selectionStart);
    inputEl.value = formatted;
    try { inputEl.setSelectionRange(caretPos, caretPos); } catch {}
  };

  approveNowBtn.classList.toggle('hidden', !isRootAdmin);
  submitBtn.className = isRootAdmin ? 'btn btn-secondary' : 'btn btn-primary';

  const runSave = async (approveImmediately) => {
    errorBox.textContent = '';
    if (!form.reportValidity()) return;
    const overrides = {
      fullName: form.elements.fullName.value.trim(),
      employeeNik: form.elements.employeeNik.value.trim().toUpperCase(),
      position: form.elements.position.value.trim(),
      department: form.elements.department.value.trim(),
      employmentStatus: form.elements.employmentStatus.value,
      contractNumber: form.elements.contractNumber.value.trim(),
      contractStartDate: form.elements.contractStartDate.value,
      contractEndDate: form.elements.contractEndDate.value,
      durationMonths,
      docSequence: String(payload.docSequence || config.docSequence || '001').trim(),
      salary: parseNumericCurrency(form.elements.salary.value),
      address: form.elements.address.value.trim()
    };
    if (!overrides.employeeNik) {
      errorBox.textContent = 'Employee NIK is required.';
      form.elements.employeeNik.focus();
      return;
    }

    submitBtn.disabled = true;
    approveNowBtn.disabled = true;
    try {
      if (typeof onSubmitUpdate === 'function') {
        await onSubmitUpdate({ overrides, approveImmediately });
      }
      modal.classList.add('hidden');
    } catch (err) {
      errorBox.textContent = err.message || 'Failed to submit employee update.';
    } finally {
      submitBtn.disabled = false;
      approveNowBtn.disabled = false;
    }
  };

  form.onsubmit = event => {
    event.preventDefault();
    runSave(false);
  };
  approveNowBtn.onclick = () => runSave(true);

  modal.classList.remove('hidden');
  form.elements.employeeNik.focus();
}
