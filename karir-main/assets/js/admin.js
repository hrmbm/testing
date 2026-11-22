import { supabase, isConfigured } from './supabase.js?v=20261122-lowongan-v5';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js?v=20261122-lowongan-v5';
import { $, $$, esc } from './common.js?v=20261122-lowongan-v5';
import {
  DISTRICTS_BY_CITY,
  APPLY_INFO_SOURCES,
  FORM_INFO_SOURCES,
  QUESTION_TYPES,
  RECOMMENDATION_THRESHOLD,
  DEFAULT_VACANCIES,
  normalizeVacancy,
  normalizeVacancyList,
  extractActivePositionNames,
  normalizeDistrictToken,
  calculateVacancyMaxScore,
  buildShareUrl
} from './vacancy-logic.js?v=20261122-lowongan-v5';
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
} from './form-schema.js?v=20261122-lowongan-v5';

const loginView = $('#login-view');
const shell = $('#admin-shell');
const content = $('#admin-content');

let activeRoute = 'dashboard';
let vacancies = [];
let applySchema = normalizeApplySchema(DEFAULT_APPLY_SCHEMA);
let formSchema = normalizeStage2Schema(DEFAULT_STAGE2_SCHEMA);

let draftApplySchema = null;
let draftFormSchema = null;
let activeFormSectionTab = 'personal';
let dashboardSourceFilter = '';

let currentAccessToken = '';
let searchQuery = '';
let editingVacancyId = null;
let draftVacancy = null;
let pickerCityFilter = 'Semua';
let pickerSearch = '';

const QUESTION_TYPE_LABELS = Object.fromEntries(QUESTION_TYPES.map(item => [item.value, item.label]));
const APPLY_TYPE_LABELS = {
  system_position: 'Dropdown Posisi (/apply)',
  system_source: 'Dropdown Sumber Informasi',
  system_location: 'Kabupaten/Kota & Kecamatan',
  tel: 'Telepon / WhatsApp',
  ...Object.fromEntries(APPLY_CUSTOM_FIELD_TYPES.map(item => [item.value, item.label]))
};
const FORM_TYPE_LABELS = {
  system_form_position: 'Dropdown Posisi (/form)',
  system_form_source: 'Dropdown Sumber Informasi',
  system_region_province: 'Wilayah · Provinsi (Otomatis)',
  system_region_regency: 'Wilayah · Kabupaten/Kota (Otomatis)',
  system_region_district: 'Wilayah · Kecamatan (Otomatis)',
  system_region_village: 'Wilayah · Desa/Kelurahan (Otomatis)',
  system_domicile: 'Toggle & Alamat Domisili',
  system_siblings_repeater: 'Daftar Saudara Kandung (Dinamis)',
  system_spouse_group: 'Grup Suami / Istri (Saat Kawin)',
  system_children_repeater: 'Daftar Anak (Dinamis)',
  system_education_repeater: 'Pendidikan Terakhir & Riwayat Sekolah',
  system_languages_repeater: 'Daftar Bahasa Asing (Dinamis)',
  system_work_repeater: 'Daftar Pengalaman Kerja (Dinamis)',
  currency: 'Nominal Rupiah',
  email: 'Email',
  tel: 'Telepon / WhatsApp',
  ...Object.fromEntries(FORM_CUSTOM_FIELD_TYPES.map(item => [item.value, item.label]))
};

const MANDATORY_FORM_NAMES = MANDATORY_STAGE2_FIELDS;
const FORM_CHOICE_TYPES = new Set(['select', 'radio', 'checkbox']);
const FORM_GROUP_SYSTEM_TYPES = new Set([
  'system_siblings_repeater',
  'system_spouse_group',
  'system_children_repeater',
  'system_languages_repeater',
  'system_work_repeater',
  'system_domicile'
]);
const FORM_NO_PLACEHOLDER_TYPES = new Set([
  'radio',
  'checkbox',
  'date',
  'select',
  'system_form_position',
  'system_form_source',
  'system_region_province',
  'system_region_regency',
  'system_region_district',
  'system_region_village',
  'system_domicile',
  'system_siblings_repeater',
  'system_spouse_group',
  'system_children_repeater',
  'system_education_repeater',
  'system_languages_repeater',
  'system_work_repeater'
]);

const STEP_GROUP_TITLES = [
  { step: 0, title: 'Langkah 1 · Identitas' },
  { step: 1, title: 'Langkah 2 · Keluarga & Pendidikan' },
  { step: 2, title: 'Langkah 3 · Kemampuan & Pengalaman' },
  { step: 3, title: 'Langkah 4 · Informasi Tambahan' }
];

const ROUTE_META = {
  dashboard: { eyebrow: 'PORTAL KARIR', title: 'Dashboard', group: 'dashboard' },
  'apply-fields': { eyebrow: 'SETTING LOWONGAN · /apply', title: 'Setting Urutan Field', group: 'apply' },
  'apply-scoring': { eyebrow: 'SETTING LOWONGAN · /apply', title: 'Setting Skor', group: 'apply' },
  'form-fields': { eyebrow: 'SETTING FORM · /form', title: 'Setting Urutan Field', group: 'form' }
};

function say(message) {
  let element = $('#admin-toast');
  if (!element) {
    element = document.createElement('div');
    element.id = 'admin-toast';
    element.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:1500;padding:12px 16px;background:#016172;color:#fff;border-radius:10px;font:13px Arial,Helvetica,sans-serif;box-shadow:0 8px 25px rgba(1,97,114,.22);max-width:min(460px,calc(100vw - 32px))';
    document.body.append(element);
  }
  element.textContent = message;
  element.classList.remove('hidden');
  clearTimeout(element._hideTimer);
  element._hideTimer = setTimeout(() => element.classList.add('hidden'), 3400);
}

async function copyText(text) {
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

async function getBearerToken() {
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData?.session?.access_token || currentAccessToken || '';
}

function getApplyInfoSources() {
  const srcField = applySchema.fields.find(f => f.id === 'infoSource');
  return Array.isArray(srcField?.options) && srcField.options.length
    ? srcField.options
    : [...APPLY_INFO_SOURCES];
}

/* ==================== DATA HYDRATION & PERSISTENCE ==================== */

async function fetchAllFunnelConfig() {
  const [settingsResult, apiVacResult, apiApplyResult, apiFormResult] = await Promise.all([
    supabase
      .from('portal_settings')
      .select('key,value')
      .in('key', ['job_vacancies_config', 'apply_form_schema', 'stage2_form_schema', 'application_positions']),
    fetch('/api/vacancies', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/apply-schema', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/form-schema', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
  ]);

  if (settingsResult.error) throw settingsResult.error;
  const settingsMap = Object.fromEntries((settingsResult.data || []).map(row => [row.key, row.value]));

  // 1. /apply Vacancies (strictly independent from /form application_positions)
  const sbVacancies = Array.isArray(settingsMap.job_vacancies_config) ? settingsMap.job_vacancies_config : [];
  const apiVacancies = Array.isArray(apiVacResult?.vacancies) ? apiVacResult.vacancies : [];
  if (sbVacancies.length) {
    vacancies = normalizeVacancyList(sbVacancies);
  } else if (apiVacResult?.customized === true && apiVacancies.length) {
    vacancies = normalizeVacancyList(apiVacancies);
  } else if (apiVacancies.length) {
    vacancies = normalizeVacancyList(apiVacancies);
  } else {
    vacancies = normalizeVacancyList(DEFAULT_VACANCIES);
  }

  // 2. /apply Field Schema
  const rawApply = settingsMap.apply_form_schema
    || (apiApplyResult?.customized === true ? apiApplyResult.schema : apiApplyResult?.schema)
    || DEFAULT_APPLY_SCHEMA;
  applySchema = normalizeApplySchema(rawApply);

  // 3. /form Stage 2 Schema & Independent Positions
  const sbFormSchema = settingsMap.stage2_form_schema;
  const sbFormPositions = Array.isArray(settingsMap.application_positions)
    ? settingsMap.application_positions.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim())
    : [];

  let baseForm = sbFormSchema
    || (apiFormResult?.customized === true ? apiFormResult.schema : apiFormResult?.schema)
    || structuredClone(DEFAULT_STAGE2_SCHEMA);

  if (!sbFormSchema && apiFormResult?.customized !== true && sbFormPositions.length) {
    baseForm = { ...baseForm, positions: sbFormPositions };
  }
  formSchema = normalizeStage2Schema(baseForm);

  // If Node /api server store restarted uncustomized while Supabase holds saved settings, rehydrate /api store silently
  const token = await getBearerToken();
  if (token) {
    if (sbVacancies.length && apiVacResult?.customized === false) {
      fetch('/api/vacancies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ vacancies })
      }).catch(() => {});
    }
    if (settingsMap.apply_form_schema && apiApplyResult?.customized === false) {
      fetch('/api/apply-schema', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schema: applySchema })
      }).catch(() => {});
    }
    if ((sbFormSchema || sbFormPositions.length) && apiFormResult?.customized === false) {
      fetch('/api/form-schema', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schema: formSchema })
      }).catch(() => {});
    }
  }

  draftApplySchema = structuredClone(applySchema);
  draftFormSchema = structuredClone(formSchema);
}

async function syncApiConfig(endpoint, payload) {
  const token = await getBearerToken();
  if (!token) return;
  let response = null;
  try {
    response = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
  } catch {
    return;
  }
  if (response && !response.ok && response.status !== 404) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error || `Gagal menyinkronkan ke ${endpoint}.`);
  }
}

async function persistVacancies(nextList) {
  const clean = normalizeVacancyList(nextList);
  if (!clean.length) {
    throw new Error('Minimal harus ada satu lowongan.');
  }
  const activeNames = extractActivePositionNames(clean);
  if (!activeNames.length) {
    throw new Error('Minimal satu lowongan harus berstatus Aktif agar /apply tetap tersedia.');
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from('portal_settings').upsert(
    [{ key: 'job_vacancies_config', value: clean, updated_at: now }],
    { onConflict: 'key' }
  );
  if (error) throw error;

  await syncApiConfig('/api/vacancies', { vacancies: clean });

  vacancies = clean;
}

async function persistApplySchema(nextSchema) {
  const clean = normalizeApplySchema(nextSchema);
  const now = new Date().toISOString();
  const { error } = await supabase.from('portal_settings').upsert(
    [{ key: 'apply_form_schema', value: clean, updated_at: now }],
    { onConflict: 'key' }
  );
  if (error) throw error;

  await syncApiConfig('/api/apply-schema', { schema: clean });

  applySchema = clean;
  draftApplySchema = structuredClone(clean);
}

async function persistFormSchema(nextSchema) {
  const clean = normalizeStage2Schema(nextSchema);
  if (!clean.positions.length) {
    throw new Error('Minimal satu pilihan posisi untuk /form harus tersedia.');
  }
  if (!clean.infoSources.length) {
    throw new Error('Minimal satu pilihan Sumber Informasi untuk /form harus tersedia.');
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from('portal_settings').upsert(
    [
      { key: 'application_positions', value: clean.positions, updated_at: now },
      { key: 'stage2_form_schema', value: clean, updated_at: now }
    ],
    { onConflict: 'key' }
  );
  if (error) throw error;

  await syncApiConfig('/api/form-schema', { schema: clean });

  formSchema = clean;
  draftFormSchema = structuredClone(clean);
}

/* ==================== ROUTER & NAVIGATION ==================== */

function syncNavUI() {
  const meta = ROUTE_META[activeRoute] || ROUTE_META.dashboard;
  $('#page-eyebrow').textContent = meta.eyebrow;
  $('#page-title').textContent = meta.title;

  $$('.funnel-nav [data-route]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.route === activeRoute);
  });

  $$('[data-mobile-group]').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mobileGroup === meta.group);
  });

  const applySub = $('#mobile-subtabs-apply');
  const formSub = $('#mobile-subtabs-form');
  if (applySub) applySub.classList.toggle('hidden', meta.group !== 'apply');
  if (formSub) formSub.classList.toggle('hidden', meta.group !== 'form');

  $$('.mobile-subtab[data-route]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.route === activeRoute);
  });
}

function navigateTo(route) {
  if (!ROUTE_META[route]) return;
  activeRoute = route;
  syncNavUI();
  renderCurrentRoute();
}

function renderCurrentRoute() {
  if (activeRoute === 'apply-fields') {
    if (!draftApplySchema) draftApplySchema = structuredClone(applySchema);
    renderApplyFieldsView();
  } else if (activeRoute === 'apply-scoring') {
    renderVacancyManager();
  } else if (activeRoute === 'form-fields') {
    if (!draftFormSchema) draftFormSchema = structuredClone(formSchema);
    renderFormFieldsView();
  } else {
    renderDashboardView();
  }
}

/* ==================== ROUTE 1: DASHBOARD ==================== */

function renderDashboardView() {
  const activeVacancies = vacancies.filter(v => v.active !== false);
  const applyVisibleCount = applySchema.fields.filter(f => f.enabled !== false).length;
  const applyCustomCount = applySchema.fields.filter(f => !f.system).length;
  const formPosCount = formSchema.positions.length;
  const formSourceCount = formSchema.infoSources.length;

  let formFieldCount = 0;
  let enabledSectionCount = 0;
  for (const meta of STAGE2_SECTION_META) {
    const sec = formSchema.sections?.[meta.id];
    const isEnabled = MANDATORY_STAGE2_SECTIONS.has(meta.id) || sec?.enabled !== false;
    if (!isEnabled) continue;
    enabledSectionCount += 1;
    formFieldCount += (sec?.fields || []).filter(f => f.enabled !== false).length;
  }

  const applyBaseUrl = new URL('apply/', location.href).href;
  const formBaseUrl = new URL('form/', location.href).href;
  const sources = getApplyInfoSources();
  const formSources = formSchema.infoSources.length ? formSchema.infoSources : [...FORM_INFO_SOURCES];

  const kpiCards = `
    <section class="funnel-kpi-grid" aria-label="Ringkasan Konfigurasi">
      <div class="funnel-kpi-card">
        <span class="funnel-kpi-label">Lowongan Aktif (/apply)</span>
        <b class="funnel-kpi-value">${activeVacancies.length}</b>
        <span class="funnel-kpi-meta">${vacancies.length} lowongan terdaftar</span>
      </div>
      <div class="funnel-kpi-card">
        <span class="funnel-kpi-label">Field Tampil (/apply)</span>
        <b class="funnel-kpi-value">${applyVisibleCount}</b>
        <span class="funnel-kpi-meta">${applyCustomCount} field tambahan</span>
      </div>
      <div class="funnel-kpi-card">
        <span class="funnel-kpi-label">Posisi (/form)</span>
        <b class="funnel-kpi-value">${formPosCount}</b>
        <span class="funnel-kpi-meta">${formSourceCount} sumber informasi</span>
      </div>
      <div class="funnel-kpi-card">
        <span class="funnel-kpi-label">Field Tampil (/form)</span>
        <b class="funnel-kpi-value">${formFieldCount}</b>
        <span class="funnel-kpi-meta">${enabledSectionCount} dari ${STAGE2_SECTION_META.length} bagian aktif</span>
      </div>
    </section>
  `;

  const shareRows = activeVacancies.length
    ? activeVacancies.map(v => {
        const shareUrl = buildShareUrl(applyBaseUrl, v.name, dashboardSourceFilter);
        return `
          <div class="funnel-share-row">
            <div>
              <div class="funnel-share-title">${esc(v.name)}</div>
              <div class="funnel-share-meta">${v.primaryDistricts.length} lokasi utama (${v.primaryLocationScore} poin) · ${v.questions.length} pertanyaan</div>
            </div>
            <div class="funnel-share-url">${esc(shareUrl)}</div>
            <div class="funnel-share-btns">
              <button type="button" class="btn btn-secondary" data-dash-copy="${esc(shareUrl)}">Salin</button>
              <a class="btn btn-primary" href="${esc(shareUrl)}" target="_blank" rel="noopener noreferrer">Buka</a>
            </div>
          </div>
        `;
      }).join('')
    : '<div class="funnel-share-row"><span class="loc-empty">Belum ada lowongan aktif untuk /apply.</span></div>';

  const formShareUrl = buildShareUrl(formBaseUrl, '', dashboardSourceFilter && formSources.includes(dashboardSourceFilter) ? dashboardSourceFilter : '');

  content.innerHTML = `
    <div class="vacancy-toolbar">
      <div class="vacancy-toolbar-meta">
        <h2>Ringkasan Jaring Kandidat</h2>
      </div>
      <div class="vacancy-toolbar-actions">
        <button type="button" class="btn btn-secondary" data-dash-nav="apply-scoring">Setting Skor /apply</button>
        <button type="button" class="btn btn-primary" data-dash-nav="form-fields">Setting Form /form</button>
      </div>
    </div>

    ${kpiCards}

    <section class="funnel-dash-section">
      <div class="funnel-dash-head">
        <h3>Tautan Sebar Lowongan (/apply) &amp; Formulir (/form)</h3>
        <div class="funnel-dash-head-actions">
          <select id="dash-source-filter" class="select" aria-label="Filter Sumber Informasi Tautan">
            <option value="">Semua Sumber (Tanpa Tag)</option>
            ${sources.map(src => `<option value="${esc(src)}" ${dashboardSourceFilter === src ? 'selected' : ''}>Sumber: ${esc(src)}</option>`).join('')}
          </select>
          <button type="button" class="btn btn-secondary" id="dash-copy-form-link">Salin Link /form</button>
          <a class="btn btn-secondary" href="${esc(formShareUrl)}" target="_blank" rel="noopener noreferrer">Buka /form</a>
        </div>
      </div>
      <div class="funnel-share-list">${shareRows}</div>
    </section>
  `;

  $('#dash-source-filter').addEventListener('change', event => {
    dashboardSourceFilter = event.target.value;
    renderDashboardView();
  });

  $('#dash-copy-form-link').addEventListener('click', async () => {
    try {
      await copyText(formShareUrl);
      say('Tautan /form berhasil disalin.');
    } catch {
      say('Gagal menyalin tautan.');
    }
  });

  $$('[data-dash-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await copyText(btn.dataset.dashCopy || '');
        say('Tautan lowongan berhasil disalin.');
      } catch {
        say('Gagal menyalin tautan.');
      }
    });
  });

  $$('[data-dash-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.dashNav));
  });
}

/* ==================== ROUTE 2: SETTING URUTAN FIELD (/apply) ==================== */

function syncApplyDraftFromDom() {
  if (!draftApplySchema) return;
  $$('.schema-field-card[data-apply-idx]').forEach(card => {
    const idx = Number(card.dataset.applyIdx);
    const field = draftApplySchema.fields[idx];
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

function renderApplyFieldsView() {
  const list = draftApplySchema.fields;

  const cardsHtml = list.map((field, idx) => {
    const mandatory = MANDATORY_APPLY_IDS.has(field.id);
    const hasOptions = field.type === 'system_source' || ['dropdown', 'radio', 'checkbox'].includes(field.type);
    const typeControl = field.system
      ? `<input class="input" value="${esc(APPLY_TYPE_LABELS[field.type] || field.type)}" disabled>`
      : `<select class="select" data-apply-prop="type">
          ${APPLY_CUSTOM_FIELD_TYPES.map(t => `<option value="${esc(t.value)}" ${field.type === t.value ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
        </select>`;
    const showPlaceholder = field.type !== 'system_location' && field.type !== 'checkbox' && field.type !== 'radio';

    return `
      <div class="schema-field-card" data-apply-idx="${idx}">
        <div class="schema-field-top">
          <div class="schema-field-ident">
            <span class="schema-order-num">#${idx + 1}</span>
            <span class="schema-field-badge ${field.system ? '' : 'custom'}">${field.system ? 'Sistem' : 'Custom'}</span>
            ${mandatory ? '<span class="schema-field-lock">Wajib Inti</span>' : ''}
          </div>
          <div class="schema-row-btns">
            <button type="button" class="icon-btn" data-apply-move="-1" ${idx === 0 ? 'disabled' : ''} title="Naik">↑</button>
            <button type="button" class="icon-btn" data-apply-move="1" ${idx === list.length - 1 ? 'disabled' : ''} title="Turun">↓</button>
            ${field.system ? '' : '<button type="button" class="icon-btn danger-action" data-apply-del>Hapus</button>'}
          </div>
        </div>

        <div class="schema-field-grid ${showPlaceholder ? '' : 'schema-field-grid-3'}">
          <div class="v-field">
            <label>Label Field</label>
            <input class="input" data-apply-prop="label" value="${esc(field.label)}">
          </div>
          ${showPlaceholder ? `
            <div class="v-field">
              <label>Placeholder</label>
              <input class="input" data-apply-prop="placeholder" value="${esc(field.placeholder || '')}">
            </div>
          ` : ''}
          <div class="v-field">
            <label>Tipe Input</label>
            ${typeControl}
          </div>
          <div class="schema-check-group">
            <label><input type="checkbox" data-apply-prop="required" ${field.required !== false ? 'checked' : ''} ${mandatory ? 'disabled' : ''}> Wajib</label>
            <label><input type="checkbox" data-apply-prop="enabled" ${field.enabled !== false ? 'checked' : ''} ${mandatory ? 'disabled' : ''}> Tampil</label>
          </div>
        </div>

        ${hasOptions ? `
          <div class="schema-options-wrap">
            <span class="schema-options-label">Daftar Pilihan (${esc(field.label)})</span>
            <div class="schema-option-chips">
              ${(field.options || []).map((opt, optIdx) => `
                <div class="schema-option-item">
                  <input class="input schema-option-input" value="${esc(opt)}" placeholder="Nama pilihan">
                  <button type="button" class="q-option-del" data-apply-del-opt="${optIdx}" aria-label="Hapus pilihan">&times;</button>
                </div>
              `).join('')}
            </div>
            <div class="schema-add-bar" style="margin-bottom:0">
              <input class="input" data-apply-new-opt placeholder="Tambah pilihan baru...">
              <button type="button" class="btn btn-secondary" data-apply-add-opt>+ Tambah</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  content.innerHTML = `
    <div class="vacancy-toolbar">
      <div class="vacancy-toolbar-meta">
        <h2>Urutan Field Halaman /apply</h2>
        <span class="vacancy-count">${list.filter(f => f.enabled !== false).length} tampil · ${list.length} total</span>
      </div>
      <div class="vacancy-toolbar-actions">
        <button type="button" class="btn btn-secondary" id="apply-reset-btn">Reset Default</button>
        <button type="button" class="btn btn-primary" id="apply-save-btn">Simpan Perubahan</button>
      </div>
    </div>

    <div class="schema-panel">
      <div class="schema-field-list">${cardsHtml}</div>
    </div>

    <div class="schema-panel">
      <div class="schema-panel-head">
        <h3>Tambah Field Custom di Langkah 1 (/apply)</h3>
      </div>
      <div class="schema-add-bar" style="margin-bottom:0">
        <input id="apply-new-label" class="input" placeholder="Contoh: Pernah bekerja di sini? / Umur">
        <select id="apply-new-type" class="select" style="max-width:210px">
          ${APPLY_CUSTOM_FIELD_TYPES.map(t => `<option value="${esc(t.value)}">${esc(t.label)}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-secondary" id="apply-add-custom">+ Tambah Field</button>
      </div>
    </div>
  `;

  $$('[data-apply-prop="required"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        const card = cb.closest('[data-apply-idx]');
        const enCb = card?.querySelector('[data-apply-prop="enabled"]');
        if (enCb && !enCb.checked) enCb.checked = true;
      }
    });
  });

  $$('[data-apply-prop="enabled"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (!cb.checked) {
        const card = cb.closest('[data-apply-idx]');
        const reqCb = card?.querySelector('[data-apply-prop="required"]');
        if (reqCb) reqCb.checked = false;
      }
    });
  });

  $$('[data-apply-move]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncApplyDraftFromDom();
      const idx = Number(btn.closest('[data-apply-idx]').dataset.applyIdx);
      const delta = Number(btn.dataset.applyMove);
      const target = idx + delta;
      if (target < 0 || target >= draftApplySchema.fields.length) return;
      [draftApplySchema.fields[idx], draftApplySchema.fields[target]] = [draftApplySchema.fields[target], draftApplySchema.fields[idx]];
      renderApplyFieldsView();
    });
  });

  $$('[data-apply-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncApplyDraftFromDom();
      const idx = Number(btn.closest('[data-apply-idx]').dataset.applyIdx);
      draftApplySchema.fields.splice(idx, 1);
      renderApplyFieldsView();
    });
  });

  $$('.schema-field-card[data-apply-idx] [data-apply-prop="type"]').forEach(sel => {
    sel.addEventListener('change', () => {
      syncApplyDraftFromDom();
      const idx = Number(sel.closest('[data-apply-idx]').dataset.applyIdx);
      const field = draftApplySchema.fields[idx];
      if (field && ['dropdown', 'radio', 'checkbox'].includes(field.type) && !field.options?.length) {
        field.options = ['Opsi 1', 'Opsi 2'];
      }
      renderApplyFieldsView();
    });
  });

  $$('[data-apply-add-opt]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncApplyDraftFromDom();
      const card = btn.closest('[data-apply-idx]');
      const idx = Number(card.dataset.applyIdx);
      const input = card.querySelector('[data-apply-new-opt]');
      const val = input.value.trim();
      if (!val) return;
      if (!draftApplySchema.fields[idx].options.includes(val)) {
        draftApplySchema.fields[idx].options.push(val);
      }
      renderApplyFieldsView();
    });
  });

  $$('[data-apply-new-opt]').forEach(input => {
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      input.closest('.schema-add-bar')?.querySelector('[data-apply-add-opt]')?.click();
    });
  });

  $$('[data-apply-del-opt]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncApplyDraftFromDom();
      const idx = Number(btn.closest('[data-apply-idx]').dataset.applyIdx);
      const optIdx = Number(btn.dataset.applyDelOpt);
      draftApplySchema.fields[idx].options.splice(optIdx, 1);
      renderApplyFieldsView();
    });
  });

  $('#apply-add-custom').addEventListener('click', () => {
    syncApplyDraftFromDom();
    const labelInput = $('#apply-new-label');
    const typeSelect = $('#apply-new-type');
    const label = labelInput.value.trim();
    if (!label) {
      say('Isi nama label field terlebih dahulu.');
      labelInput.focus();
      return;
    }
    const type = typeSelect.value;
    draftApplySchema.fields.push({
      id: `custom_${Date.now().toString(36)}`,
      label,
      type,
      required: false,
      enabled: true,
      system: false,
      placeholder: '',
      options: ['dropdown', 'radio', 'checkbox'].includes(type) ? ['Opsi 1', 'Opsi 2'] : []
    });
    renderApplyFieldsView();
  });

  $('#apply-new-label').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    $('#apply-add-custom').click();
  });

  $('#apply-reset-btn').addEventListener('click', () => {
    draftApplySchema = normalizeApplySchema(DEFAULT_APPLY_SCHEMA);
    renderApplyFieldsView();
    say('Draf urutan /apply dikembalikan ke pengaturan awal (belum disimpan).');
  });

  $('#apply-save-btn').addEventListener('click', async () => {
    syncApplyDraftFromDom();
    const btn = $('#apply-save-btn');
    btn.disabled = true;
    btn.textContent = 'Menyimpan…';
    try {
      await persistApplySchema(draftApplySchema);
      renderApplyFieldsView();
      say('Pengaturan field /apply berhasil disimpan.');
    } catch (error) {
      say(error.message || 'Gagal menyimpan pengaturan field /apply.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Simpan Perubahan';
    }
  });
}

/* ==================== ROUTE 3: SETTING URUTAN FIELD (/form) ==================== */

function syncFormDraftFromDom() {
  if (!draftFormSchema) return;

  const posInputs = $$('.schema-pos-input[data-pos-list="positions"]');
  if (posInputs.length) {
    draftFormSchema.positions = posInputs.map(el => el.value.trim()).filter(Boolean);
  }

  const srcInputs = $$('.schema-pos-input[data-pos-list="infoSources"]');
  if (srcInputs.length) {
    draftFormSchema.infoSources = srcInputs.map(el => el.value.trim()).filter(Boolean);
  }

  const consentEl = $('#form-consent-text');
  if (consentEl) {
    const val = consentEl.value.trim();
    draftFormSchema.consentText = val || DEFAULT_STAGE2_SCHEMA.consentText;
  }

  const secObj = draftFormSchema.sections[activeFormSectionTab];
  if (secObj) {
    const titleEl = $('#form-sec-title');
    if (titleEl) {
      secObj.title = titleEl.value.trim() || secObj.title;
    }
    const secEnabledEl = $('#form-sec-enabled');
    if (secEnabledEl) {
      secObj.enabled = MANDATORY_STAGE2_SECTIONS.has(activeFormSectionTab) ? true : secEnabledEl.checked;
    }

    $$('.schema-field-card[data-f2-idx]').forEach(card => {
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

      if (MANDATORY_FORM_NAMES.has(field.name)) {
        field.enabled = true;
        field.required = true;
      } else {
        if (enEl) field.enabled = enEl.checked;
        if (reqEl) {
          field.required = (FORM_GROUP_SYSTEM_TYPES.has(field.type) || !field.enabled) ? false : reqEl.checked;
        }
      }
      if (wideEl) field.wide = wideEl.checked;

      const optInputs = card.querySelectorAll('.schema-f2-option-input');
      if (optInputs.length || (!field.system && FORM_CHOICE_TYPES.has(field.type)) || (field.system && FORM_CHOICE_TYPES.has(field.type))) {
        field.options = [...optInputs].map(el => el.value.trim()).filter(Boolean);
      }
    });
  }
}

function renderFormFieldsView() {
  if (!STAGE2_SECTION_META.some(m => m.id === activeFormSectionTab)) {
    activeFormSectionTab = 'personal';
  }
  const activeMeta = STAGE2_SECTION_META.find(m => m.id === activeFormSectionTab);
  const currentSec = draftFormSchema.sections[activeFormSectionTab] || { title: activeMeta.defaultTitle, enabled: true, fields: [] };
  const mandatorySec = MANDATORY_STAGE2_SECTIONS.has(activeFormSectionTab);

  const positionsRows = draftFormSchema.positions.map((pos, idx) => `
    <div class="schema-pos-row">
      <span class="schema-order-num">${idx + 1}</span>
      <input class="input schema-pos-input" data-pos-list="positions" value="${esc(pos)}" placeholder="Nama posisi">
      <div class="schema-row-btns">
        <button type="button" class="icon-btn" data-pos-move="positions:${idx}:-1" ${idx === 0 ? 'disabled' : ''} title="Naik">↑</button>
        <button type="button" class="icon-btn" data-pos-move="positions:${idx}:1" ${idx === draftFormSchema.positions.length - 1 ? 'disabled' : ''} title="Turun">↓</button>
        <button type="button" class="icon-btn danger-action" data-pos-del="positions:${idx}" ${draftFormSchema.positions.length <= 1 ? 'disabled' : ''}>×</button>
      </div>
    </div>
  `).join('');

  const sourceRows = draftFormSchema.infoSources.map((src, idx) => `
    <div class="schema-pos-row">
      <span class="schema-order-num">${idx + 1}</span>
      <input class="input schema-pos-input" data-pos-list="infoSources" value="${esc(src)}" placeholder="Sumber informasi">
      <div class="schema-row-btns">
        <button type="button" class="icon-btn" data-pos-move="infoSources:${idx}:-1" ${idx === 0 ? 'disabled' : ''} title="Naik">↑</button>
        <button type="button" class="icon-btn" data-pos-move="infoSources:${idx}:1" ${idx === draftFormSchema.infoSources.length - 1 ? 'disabled' : ''} title="Turun">↓</button>
        <button type="button" class="icon-btn danger-action" data-pos-del="infoSources:${idx}" ${draftFormSchema.infoSources.length <= 1 ? 'disabled' : ''}>×</button>
      </div>
    </div>
  `).join('');

  const stepOrderHtml = STEP_GROUP_TITLES.map(({ step, title }) => {
    const order = draftFormSchema.stepSectionOrder?.[step] || STEP_SECTION_DEFAULTS[step] || [];
    const items = order.map((secId, idx) => {
      const meta = STAGE2_SECTION_META.find(m => m.id === secId);
      const sec = draftFormSchema.sections?.[secId];
      const secOn = MANDATORY_STAGE2_SECTIONS.has(secId) || sec?.enabled !== false;
      return `
        <div class="schema-pos-row">
          <span class="schema-order-num">${idx + 1}</span>
          <span class="schema-step-sec-label">
            <b>${esc(meta?.code || '')} · ${esc(sec?.title || meta?.defaultTitle || secId)}</b>
            ${secOn ? '' : '<span class="schema-sec-off-tag">Nonaktif</span>'}
          </span>
          <div class="schema-row-btns">
            <button type="button" class="icon-btn" data-step-move-sec="${step}:${idx}:-1" ${idx === 0 ? 'disabled' : ''} title="Naik">↑</button>
            <button type="button" class="icon-btn" data-step-move-sec="${step}:${idx}:1" ${idx === order.length - 1 ? 'disabled' : ''} title="Turun">↓</button>
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
    const sec = draftFormSchema.sections?.[meta.id];
    const secOn = MANDATORY_STAGE2_SECTIONS.has(meta.id) || sec?.enabled !== false;
    const isActive = activeFormSectionTab === meta.id;
    return `
      <button type="button" class="schema-section-tab ${isActive ? 'active' : ''} ${secOn ? '' : 'is-off'}" data-f2-tab="${esc(meta.id)}">
        ${esc(meta.code)} · ${esc(sec?.title || meta.defaultTitle)}
      </button>
    `;
  }).join('');

  const fieldsHtml = currentSec.fields.map((field, idx) => {
    const mandatoryField = MANDATORY_FORM_NAMES.has(field.name);
    const isGroupSystem = FORM_GROUP_SYSTEM_TYPES.has(field.type);
    const hasOptions = FORM_CHOICE_TYPES.has(field.type);
    const hidePlaceholder = FORM_NO_PLACEHOLDER_TYPES.has(field.type);
    const typeControl = field.system
      ? `<input class="input" value="${esc(FORM_TYPE_LABELS[field.type] || field.type)}" disabled>`
      : `<select class="select" data-f2-prop="type">
          ${FORM_CUSTOM_FIELD_TYPES.map(t => `<option value="${esc(t.value)}" ${field.type === t.value ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
        </select>`;

    return `
      <div class="schema-field-card" data-f2-idx="${idx}">
        <div class="schema-field-top">
          <div class="schema-field-ident">
            <span class="schema-order-num">#${idx + 1}</span>
            <span class="schema-field-badge ${field.system ? '' : 'custom'}">${field.system ? 'Sistem' : 'Custom'}</span>
            ${mandatoryField ? '<span class="schema-field-lock">Wajib Inti</span>' : ''}
          </div>
          <div class="schema-row-btns">
            <button type="button" class="icon-btn" data-f2-move="-1" ${idx === 0 ? 'disabled' : ''} title="Naik">↑</button>
            <button type="button" class="icon-btn" data-f2-move="1" ${idx === currentSec.fields.length - 1 ? 'disabled' : ''} title="Turun">↓</button>
            ${field.system ? '' : '<button type="button" class="icon-btn danger-action" data-f2-del>Hapus</button>'}
          </div>
        </div>

        <div class="schema-field-grid ${hidePlaceholder ? 'schema-field-grid-3' : ''}">
          <div class="v-field">
            <label>Label Field</label>
            <input class="input" data-f2-prop="label" value="${esc(field.label)}">
          </div>
          ${hidePlaceholder ? '' : `
            <div class="v-field">
              <label>Placeholder</label>
              <input class="input" data-f2-prop="placeholder" value="${esc(field.placeholder || '')}">
            </div>
          `}
          <div class="v-field">
            <label>Tipe Input</label>
            ${typeControl}
          </div>
          <div class="schema-check-group">
            ${isGroupSystem ? '' : `<label><input type="checkbox" data-f2-prop="required" ${field.required === true ? 'checked' : ''} ${mandatoryField ? 'disabled' : ''}> Wajib</label>`}
            <label><input type="checkbox" data-f2-prop="enabled" ${field.enabled !== false ? 'checked' : ''} ${mandatoryField ? 'disabled' : ''}> Tampil</label>
            ${isGroupSystem ? '' : `<label><input type="checkbox" data-f2-prop="wide" ${field.wide === true ? 'checked' : ''}> Lebar Penuh</label>`}
          </div>
        </div>

        ${hasOptions ? `
          <div class="schema-options-wrap">
            <span class="schema-options-label">Pilihan Jawaban (${esc(field.label)})</span>
            <div class="schema-option-chips">
              ${(field.options || []).map((opt, optIdx) => `
                <div class="schema-option-item">
                  <input class="input schema-f2-option-input" value="${esc(opt)}" placeholder="Nama opsi">
                  <button type="button" class="q-option-del" data-f2-del-opt="${optIdx}" aria-label="Hapus opsi">&times;</button>
                </div>
              `).join('')}
            </div>
            <div class="schema-add-bar" style="margin-bottom:0">
              <input class="input" data-f2-new-opt placeholder="Tambah pilihan baru...">
              <button type="button" class="btn btn-secondary" data-f2-add-opt>+ Tambah</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  content.innerHTML = `
    <div class="vacancy-toolbar">
      <div class="vacancy-toolbar-meta">
        <h2>Konfigurasi /form (Lengkap)</h2>
        <span class="vacancy-count">${draftFormSchema.positions.length} posisi · ${STAGE2_SECTION_META.length} bagian</span>
      </div>
      <div class="vacancy-toolbar-actions">
        <button type="button" class="btn btn-secondary" id="form-reset-btn">Reset Default</button>
        <button type="button" class="btn btn-primary" id="form-save-btn">Simpan Perubahan</button>
      </div>
    </div>

    <div class="schema-grid-2">
      <div class="schema-panel">
        <div class="schema-panel-head">
          <h3>Dropdown Posisi (/form)</h3>
          <span class="schema-panel-meta">${draftFormSchema.positions.length} pilihan</span>
        </div>
        <div class="schema-add-bar">
          <input id="new-form-pos-input" class="input" placeholder="Tambah posisi baru untuk /form...">
          <button type="button" class="btn btn-secondary" id="add-form-pos-btn">+ Tambah</button>
        </div>
        <div class="schema-pos-list">${positionsRows}</div>
      </div>

      <div class="schema-panel">
        <div class="schema-panel-head">
          <h3>Sumber Informasi (/form)</h3>
          <span class="schema-panel-meta">${draftFormSchema.infoSources.length} sumber</span>
        </div>
        <div class="schema-add-bar">
          <input id="new-form-src-input" class="input" placeholder="Tambah sumber informasi baru...">
          <button type="button" class="btn btn-secondary" id="add-form-src-btn">+ Tambah</button>
        </div>
        <div class="schema-pos-list">${sourceRows}</div>
      </div>
    </div>

    <div class="schema-panel">
      <div class="schema-panel-head">
        <h3>Urutan Bagian per Langkah &amp; Pernyataan Konfirmasi</h3>
        <span class="schema-panel-meta">Langkah tanpa bagian aktif otomatis dilewati di /form</span>
      </div>
      <div class="schema-step-order-grid">${stepOrderHtml}</div>
      <div class="v-field" style="margin-top:14px">
        <label for="form-consent-text">Teks Pernyataan Konfirmasi (Langkah Akhir · J)</label>
        <input id="form-consent-text" class="input" value="${esc(draftFormSchema.consentText || DEFAULT_STAGE2_SCHEMA.consentText)}" placeholder="Dengan ini saya menyatakan semua data yang saya isi benar.">
      </div>
    </div>

    <div class="schema-panel">
      <div class="schema-panel-head">
        <h3>Semua Bagian &amp; Urutan Field (/form)</h3>
        <span class="schema-panel-meta">${esc(activeMeta.stepLabel)} · ${currentSec.fields.filter(f => f.enabled !== false).length} tampil</span>
      </div>

      <div class="schema-section-tabs" role="tablist">${sectionTabsHtml}</div>

      <div class="schema-section-settings">
        <div class="v-field">
          <label for="form-sec-title">Judul Bagian (${esc(activeMeta.code)})</label>
          <input id="form-sec-title" class="input" value="${esc(currentSec.title || activeMeta.defaultTitle)}">
        </div>
        <label class="schema-section-toggle">
          <input type="checkbox" id="form-sec-enabled" ${mandatorySec || currentSec.enabled !== false ? 'checked' : ''} ${mandatorySec ? 'disabled' : ''}>
          <span>${mandatorySec ? 'Bagian Wajib Inti' : 'Tampilkan Bagian Ini di /form'}</span>
        </label>
      </div>

      <div class="schema-field-list">${fieldsHtml}</div>

      <div class="schema-options-wrap" style="margin-top:14px">
        <span class="schema-options-label">Tambah Field Custom ke Bagian ${esc(activeMeta.code)} · ${esc(currentSec.title)}</span>
        <div class="schema-add-bar" style="margin-bottom:0">
          <input id="form-new-field-label" class="input" placeholder="Contoh: Nomor SIM / Pengalaman Organisasi">
          <select id="form-new-field-type" class="select" style="max-width:210px">
            ${FORM_CUSTOM_FIELD_TYPES.map(t => `<option value="${esc(t.value)}">${esc(t.label)}</option>`).join('')}
          </select>
          <button type="button" class="btn btn-secondary" id="form-add-custom-field">+ Tambah Field</button>
        </div>
      </div>
    </div>
  `;

  $('#add-form-pos-btn').addEventListener('click', () => {
    syncFormDraftFromDom();
    const input = $('#new-form-pos-input');
    const name = input.value.trim();
    if (!name) return;
    if (draftFormSchema.positions.some(p => p.toLocaleLowerCase('id') === name.toLocaleLowerCase('id'))) {
      say(`Posisi "${name}" sudah ada di daftar /form.`);
      return;
    }
    draftFormSchema.positions.push(name);
    renderFormFieldsView();
  });

  $('#new-form-pos-input').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    $('#add-form-pos-btn').click();
  });

  $('#add-form-src-btn').addEventListener('click', () => {
    syncFormDraftFromDom();
    const input = $('#new-form-src-input');
    const name = input.value.trim();
    if (!name) return;
    if (draftFormSchema.infoSources.some(s => s.toLocaleLowerCase('id') === name.toLocaleLowerCase('id'))) {
      say(`Sumber "${name}" sudah ada di daftar.`);
      return;
    }
    draftFormSchema.infoSources.push(name);
    renderFormFieldsView();
  });

  $('#new-form-src-input').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    $('#add-form-src-btn').click();
  });

  $$('[data-pos-move]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormDraftFromDom();
      const [listName, rawIdx, rawDelta] = btn.dataset.posMove.split(':');
      const idx = Number(rawIdx);
      const target = idx + Number(rawDelta);
      const arr = draftFormSchema[listName];
      if (!Array.isArray(arr) || target < 0 || target >= arr.length) return;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      renderFormFieldsView();
    });
  });

  $$('[data-pos-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormDraftFromDom();
      const [listName, rawIdx] = btn.dataset.posDel.split(':');
      const idx = Number(rawIdx);
      const arr = draftFormSchema[listName];
      if (!Array.isArray(arr) || arr.length <= 1) return;
      arr.splice(idx, 1);
      renderFormFieldsView();
    });
  });

  $$('[data-step-move-sec]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormDraftFromDom();
      const [rawStep, rawIdx, rawDelta] = btn.dataset.stepMoveSec.split(':');
      const step = Number(rawStep);
      const idx = Number(rawIdx);
      const target = idx + Number(rawDelta);
      const order = draftFormSchema.stepSectionOrder?.[step];
      if (!Array.isArray(order) || target < 0 || target >= order.length) return;
      [order[idx], order[target]] = [order[target], order[idx]];
      if (step === 0) draftFormSchema.step0SectionOrder = [...order];
      renderFormFieldsView();
    });
  });

  $$('[data-f2-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      syncFormDraftFromDom();
      activeFormSectionTab = tab.dataset.f2Tab;
      renderFormFieldsView();
    });
  });

  $('#form-sec-enabled')?.addEventListener('change', () => {
    syncFormDraftFromDom();
    renderFormFieldsView();
  });

  $$('[data-f2-prop="required"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        const card = cb.closest('[data-f2-idx]');
        const enCb = card?.querySelector('[data-f2-prop="enabled"]');
        if (enCb && !enCb.checked) enCb.checked = true;
      }
    });
  });

  $$('[data-f2-prop="enabled"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (!cb.checked) {
        const card = cb.closest('[data-f2-idx]');
        const reqCb = card?.querySelector('[data-f2-prop="required"]');
        if (reqCb) reqCb.checked = false;
      }
    });
  });

  $$('[data-f2-move]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormDraftFromDom();
      const idx = Number(btn.closest('[data-f2-idx]').dataset.f2Idx);
      const target = idx + Number(btn.dataset.f2Move);
      const list = draftFormSchema.sections[activeFormSectionTab].fields;
      if (target < 0 || target >= list.length) return;
      [list[idx], list[target]] = [list[target], list[idx]];
      renderFormFieldsView();
    });
  });

  $$('[data-f2-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormDraftFromDom();
      const idx = Number(btn.closest('[data-f2-idx]').dataset.f2Idx);
      draftFormSchema.sections[activeFormSectionTab].fields.splice(idx, 1);
      renderFormFieldsView();
    });
  });

  $$('.schema-field-card[data-f2-idx] [data-f2-prop="type"]').forEach(sel => {
    sel.addEventListener('change', () => {
      syncFormDraftFromDom();
      const idx = Number(sel.closest('[data-f2-idx]').dataset.f2Idx);
      const field = draftFormSchema.sections[activeFormSectionTab].fields[idx];
      if (field && FORM_CHOICE_TYPES.has(field.type) && !field.options?.length) {
        field.options = ['Opsi 1', 'Opsi 2'];
      }
      renderFormFieldsView();
    });
  });

  $$('[data-f2-add-opt]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormDraftFromDom();
      const card = btn.closest('[data-f2-idx]');
      const idx = Number(card.dataset.f2Idx);
      const input = card.querySelector('[data-f2-new-opt]');
      const val = input.value.trim();
      if (!val) return;
      const field = draftFormSchema.sections[activeFormSectionTab].fields[idx];
      if (!Array.isArray(field.options)) field.options = [];
      if (!field.options.includes(val)) field.options.push(val);
      renderFormFieldsView();
    });
  });

  $$('[data-f2-new-opt]').forEach(input => {
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      input.closest('.schema-add-bar')?.querySelector('[data-f2-add-opt]')?.click();
    });
  });

  $$('[data-f2-del-opt]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormDraftFromDom();
      const idx = Number(btn.closest('[data-f2-idx]').dataset.f2Idx);
      const optIdx = Number(btn.dataset.f2DelOpt);
      draftFormSchema.sections[activeFormSectionTab].fields[idx].options.splice(optIdx, 1);
      renderFormFieldsView();
    });
  });

  $('#form-add-custom-field').addEventListener('click', () => {
    syncFormDraftFromDom();
    const labelInput = $('#form-new-field-label');
    const typeSelect = $('#form-new-field-type');
    const label = labelInput.value.trim();
    if (!label) {
      say('Isi nama label field terlebih dahulu.');
      labelInput.focus();
      return;
    }
    const type = typeSelect.value;
    draftFormSchema.sections[activeFormSectionTab].fields.push({
      name: `custom_${Date.now().toString(36)}`,
      label,
      placeholder: '',
      type,
      required: false,
      enabled: true,
      system: false,
      wide: type === 'textarea' || type === 'radio' || type === 'checkbox',
      options: FORM_CHOICE_TYPES.has(type) ? ['Opsi 1', 'Opsi 2'] : []
    });
    renderFormFieldsView();
  });

  $('#form-new-field-label').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    $('#form-add-custom-field').click();
  });

  $('#form-reset-btn').addEventListener('click', () => {
    draftFormSchema = normalizeStage2Schema(DEFAULT_STAGE2_SCHEMA);
    renderFormFieldsView();
    say('Draf /form dikembalikan ke pengaturan awal (belum disimpan).');
  });

  $('#form-save-btn').addEventListener('click', async () => {
    syncFormDraftFromDom();
    const btn = $('#form-save-btn');
    btn.disabled = true;
    btn.textContent = 'Menyimpan…';
    try {
      await persistFormSchema(draftFormSchema);
      renderFormFieldsView();
      say('Konfigurasi /form berhasil disimpan.');
    } catch (error) {
      say(error.message || 'Gagal menyimpan konfigurasi /form.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Simpan Perubahan';
    }
  });
}

/* ==================== ROUTE 4: SETTING SKOR (/apply VACANCIES) ==================== */

function renderQuestionSummary(questions = []) {
  if (!questions.length) {
    return '<span class="loc-empty">Tidak ada pertanyaan tambahan</span>';
  }
  return `<ul class="q-summary-list">${questions.map((q, idx) => {
    const typeLabel = QUESTION_TYPE_LABELS[q.type] || q.type;
    let scoreText = '';
    if (['dropdown', 'radio', 'checkbox'].includes(q.type)) {
      const opts = (q.options || []).map(o => `${esc(o.label)} (${o.score})`).join(' · ');
      scoreText = opts || 'Belum ada pilihan';
    } else {
      scoreText = q.filledScore ? `Skor terisi: ${q.filledScore}` : 'Tanpa skor (isian)';
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

function renderDistrictSummary(list = []) {
  if (!list.length) return '<span class="loc-empty">Belum ditentukan</span>';
  return `<div class="loc-district-list">${list.map(d => esc(d)).join(', ')}</div>`;
}

function renderVacancyManager() {
  const term = searchQuery.trim().toLocaleLowerCase('id');
  const filtered = term
    ? vacancies.filter(v =>
        v.name.toLocaleLowerCase('id').includes(term) ||
        v.primaryDistricts.some(d => d.toLocaleLowerCase('id').includes(term)) ||
        v.questions.some(q => q.label.toLocaleLowerCase('id').includes(term))
      )
    : vacancies;

  const activeCount = vacancies.filter(v => v.active !== false).length;

  const desktopRows = filtered.length
    ? filtered.map(v => {
        const maxScore = calculateVacancyMaxScore(v);
        return `
        <tr data-vacancy-id="${esc(v.id)}">
          <td class="col-pos">
            <div class="pos-name-title">${esc(v.name)}</div>
            <div class="pos-state-line ${v.active === false ? 'inactive' : ''}">${v.active === false ? 'Nonaktif' : 'Aktif di /apply'} · Maks ${esc(maxScore)} poin</div>
          </td>
          <td class="col-loc">${renderDistrictSummary(v.primaryDistricts)}</td>
          <td class="col-score">${esc(v.primaryLocationScore)}</td>
          <td class="col-other">${esc(v.otherLocationLabel)}</td>
          <td class="col-score">${esc(v.otherLocationScore)}</td>
          <td class="col-questions">${renderQuestionSummary(v.questions)}</td>
          <td class="col-actions">
            <div class="vacancy-row-actions">
              <button type="button" class="icon-btn primary-action" data-action="edit" data-id="${esc(v.id)}">Edit</button>
              <button type="button" class="icon-btn" data-action="share" data-id="${esc(v.id)}">Bagikan</button>
              <button type="button" class="icon-btn" data-action="duplicate" data-id="${esc(v.id)}">Duplikat</button>
              <button type="button" class="icon-btn danger-action" data-action="delete" data-id="${esc(v.id)}">Hapus</button>
            </div>
          </td>
        </tr>
      `;
      }).join('')
    : `<tr><td colspan="7" class="table-empty">Tidak ada lowongan yang sesuai pencarian.</td></tr>`;

  const mobileCards = filtered.length
    ? filtered.map(v => {
        const maxScore = calculateVacancyMaxScore(v);
        return `
        <article class="vacancy-card-m" data-vacancy-id="${esc(v.id)}">
          <div class="vacancy-card-m-head">
            <div>
              <div class="pos-name-title">${esc(v.name)}</div>
              <div class="pos-state-line ${v.active === false ? 'inactive' : ''}">${v.active === false ? 'Nonaktif' : 'Aktif di /apply'} · Maks ${esc(maxScore)} poin</div>
            </div>
            <button type="button" class="icon-btn" data-action="share" data-id="${esc(v.id)}">Bagikan</button>
          </div>
          <div class="vacancy-card-m-grid">
            <div>
              <div class="vacancy-card-m-label">Lokasi Utama</div>
              ${renderDistrictSummary(v.primaryDistricts)}
            </div>
            <div class="vacancy-card-m-score">${esc(v.primaryLocationScore)} poin</div>
            <div>
              <div class="vacancy-card-m-label">${esc(v.otherLocationLabel)}</div>
            </div>
            <div class="vacancy-card-m-score">${esc(v.otherLocationScore)} poin</div>
          </div>
          <div class="vacancy-card-m-qs">
            <div class="vacancy-card-m-label" style="margin-bottom:8px">Pertanyaan &amp; Skor (${v.questions.length})</div>
            ${renderQuestionSummary(v.questions)}
          </div>
          <div class="vacancy-card-m-actions">
            <button type="button" class="icon-btn primary-action" data-action="edit" data-id="${esc(v.id)}">Edit Lowongan</button>
            <button type="button" class="icon-btn" data-action="duplicate" data-id="${esc(v.id)}">Duplikat</button>
            <button type="button" class="icon-btn danger-action" data-action="delete" data-id="${esc(v.id)}" style="grid-column:1/-1">Hapus Lowongan</button>
          </div>
        </article>
      `;
      }).join('')
    : `<div class="vacancy-card-m"><div class="loc-empty" style="text-align:center;padding:18px 0">Tidak ada lowongan yang sesuai pencarian.</div></div>`;

  content.innerHTML = `
    <div class="vacancy-toolbar">
      <div class="vacancy-toolbar-meta">
        <h2>Daftar Lowongan &amp; Skor</h2>
        <span class="vacancy-count">${vacancies.length} posisi · ${activeCount} aktif · Direkomendasikan &amp; WA ≥ ${RECOMMENDATION_THRESHOLD}</span>
      </div>
      <div class="vacancy-toolbar-actions">
        <input id="vacancy-search" class="vacancy-search" type="search" value="${esc(searchQuery)}" placeholder="Cari posisi, kecamatan, pertanyaan…">
        <button id="add-vacancy-btn" class="btn btn-primary" type="button">+ Tambah Lowongan</button>
      </div>
    </div>

    <div class="vacancy-table-panel">
      <div class="vacancy-table-wrap">
        <table class="vacancy-table">
          <thead>
            <tr>
              <th class="col-pos" data-sortable="false">Nama Posisi</th>
              <th class="col-loc" data-sortable="false">Lokasi Utama (Kecamatan)</th>
              <th class="col-score" data-sortable="false">Skor</th>
              <th class="col-other" data-sortable="false">Lokasi Lain</th>
              <th class="col-score" data-sortable="false">Skor</th>
              <th class="col-questions" data-sortable="false">Pertanyaan &amp; Skor</th>
              <th class="col-actions" data-sortable="false">Aksi</th>
            </tr>
          </thead>
          <tbody>${desktopRows}</tbody>
        </table>
      </div>
    </div>

    <div class="vacancy-cards-mobile">${mobileCards}</div>
  `;

  $('#vacancy-search').addEventListener('input', event => {
    searchQuery = event.target.value;
    renderVacancyManager();
    const input = $('#vacancy-search');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  $('#add-vacancy-btn').addEventListener('click', () => openVacancyModal(null));

  $$('[data-action]', content).forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'edit') openVacancyModal(id);
      else if (action === 'duplicate') duplicateVacancy(id);
      else if (action === 'delete') deleteVacancy(id);
      else if (action === 'share') openShareModal(id);
    });
  });
}

async function duplicateVacancy(id) {
  const source = vacancies.find(v => v.id === id);
  if (!source) return;
  let copyName = `${source.name} (Salinan)`;
  let suffix = 2;
  while (vacancies.some(v => v.name.toLocaleLowerCase('id') === copyName.toLocaleLowerCase('id'))) {
    copyName = `${source.name} (Salinan ${suffix++})`;
  }
  const copy = normalizeVacancy({
    ...structuredClone(source),
    id: '',
    name: copyName
  }, vacancies.length);

  try {
    await persistVacancies([...vacancies, copy]);
    renderVacancyManager();
    say(`Lowongan "${copy.name}" dibuat.`);
  } catch (error) {
    say(error.message || 'Gagal menduplikat lowongan.');
  }
}

async function deleteVacancy(id) {
  const target = vacancies.find(v => v.id === id);
  if (!target) return;
  if (vacancies.length <= 1) {
    say('Minimal satu lowongan harus tersedia.');
    return;
  }
  const remaining = vacancies.filter(v => v.id !== id);
  if (!extractActivePositionNames(remaining).length) {
    say('Tidak bisa menghapus satu-satunya lowongan yang Aktif.');
    return;
  }
  try {
    await persistVacancies(remaining);
    renderVacancyManager();
    say(`Lowongan "${target.name}" dihapus.`);
  } catch (error) {
    say(error.message || 'Gagal menghapus lowongan.');
  }
}

/* ==================== MODAL EDITOR LOWONGAN ==================== */

function ensureVacancyModal() {
  let backdrop = $('#vacancy-modal');
  if (backdrop) return backdrop;

  backdrop = document.createElement('div');
  backdrop.id = 'vacancy-modal';
  backdrop.className = 'modal-backdrop hidden';
  backdrop.innerHTML = `
    <div class="employee-modal-card vacancy-modal-card" role="dialog" aria-modal="true" aria-labelledby="v-modal-title">
      <div class="employee-modal-head">
        <div>
          <small id="v-modal-kicker">PENGATURAN LOWONGAN (/apply)</small>
          <h2 id="v-modal-title">Edit Lowongan</h2>
        </div>
        <button type="button" class="modal-close" id="v-modal-close" aria-label="Tutup">&times;</button>
      </div>

      <form id="v-modal-form" class="vacancy-modal-form" novalidate>
        <div class="vacancy-modal-body">
          <div class="v-form-section">
            <div class="v-form-section-head">
              <h3>Informasi Posisi</h3>
            </div>
            <div class="v-grid-eq">
              <div class="v-field">
                <label for="v-name">Nama Posisi</label>
                <input id="v-name" class="input" required placeholder="Contoh: Spray, QC Staff, Admin Gudang">
              </div>
              <div class="v-field">
                <label>Status di Formulir /apply</label>
                <label class="v-check-inline">
                  <input id="v-active" type="checkbox" checked>
                  <span>Aktif (Tampilkan di daftar lowongan)</span>
                </label>
              </div>
            </div>
          </div>

          <div class="v-form-section">
            <div class="v-form-section-head">
              <h3>Kriteria Lokasi &amp; Skor</h3>
            </div>
            <div class="v-grid-2" style="margin-bottom:14px">
              <div class="v-field">
                <label>Lokasi Utama (Pilih Kecamatan)</label>
                <div class="district-picker-controls">
                  <select id="district-city-filter" class="select">
                    <option value="Semua">Semua Wilayah</option>
                    ${Object.keys(DISTRICTS_BY_CITY).map(city => `<option value="${esc(city)}">${esc(city)}</option>`).join('')}
                  </select>
                  <input id="district-search" class="input" type="search" placeholder="Filter kecamatan…">
                  <button type="button" class="btn btn-secondary" id="district-clear-all" style="padding:8px 12px;font-size:12px">Bersihkan</button>
                </div>
                <div id="district-picker-list" class="district-picker-list"></div>
                <div class="district-custom-row">
                  <input id="district-custom-input" class="input" placeholder="Tambah kecamatan / area lain…">
                  <button type="button" class="btn btn-secondary" id="district-custom-add" style="padding:8px 14px;font-size:12px">Tambah</button>
                </div>
                <div id="district-selected-tags" class="district-selected-tags"></div>
              </div>
              <div class="v-field">
                <label for="v-primary-score">Skor Lokasi Utama</label>
                <input id="v-primary-score" class="input" type="number" step="0.5" value="10">
              </div>
            </div>

            <div class="v-grid-2">
              <div class="v-field">
                <label for="v-other-label">Label Lokasi Lain</label>
                <input id="v-other-label" class="input" value="Area selain lokasi utama">
              </div>
              <div class="v-field">
                <label for="v-other-score">Skor Lokasi Lain</label>
                <input id="v-other-score" class="input" type="number" step="0.5" value="5">
              </div>
            </div>
          </div>

          <div class="v-form-section">
            <div class="v-form-section-head">
              <h3>Pertanyaan &amp; Bobot Skor (Fleksibel)</h3>
              <button type="button" class="btn btn-secondary" id="add-question-btn" style="padding:8px 13px;font-size:12px">+ Tambah Pertanyaan</button>
            </div>
            <div id="q-builder-list" class="q-builder-list"></div>
          </div>
        </div>

        <div class="vacancy-modal-footer">
          <div id="v-modal-error" class="form-error" role="alert"></div>
          <div class="employee-modal-actions">
            <button type="button" class="btn btn-secondary" id="v-modal-cancel">Batal</button>
            <button type="submit" class="btn btn-primary" id="v-modal-save">Simpan Lowongan</button>
          </div>
        </div>
      </form>
    </div>
  `;

  document.body.append(backdrop);

  const closeModal = () => {
    backdrop.classList.add('hidden');
    editingVacancyId = null;
    draftVacancy = null;
  };

  $('#v-modal-close', backdrop).addEventListener('click', closeModal);
  $('#v-modal-cancel', backdrop).addEventListener('click', closeModal);
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeModal();
  });

  $('#district-city-filter', backdrop).addEventListener('change', event => {
    pickerCityFilter = event.target.value;
    renderDistrictPicker();
  });

  $('#district-search', backdrop).addEventListener('input', event => {
    pickerSearch = event.target.value;
    renderDistrictPicker();
  });

  $('#district-clear-all', backdrop).addEventListener('click', () => {
    if (!draftVacancy) return;
    draftVacancy.primaryDistricts = [];
    renderDistrictPicker();
  });

  $('#district-custom-add', backdrop).addEventListener('click', () => {
    const input = $('#district-custom-input', backdrop);
    const val = input.value.trim();
    if (!val || !draftVacancy) return;
    if (!draftVacancy.primaryDistricts.includes(val)) {
      draftVacancy.primaryDistricts.push(val);
    }
    input.value = '';
    renderDistrictPicker();
  });

  $('#district-custom-input', backdrop).addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    $('#district-custom-add', backdrop).click();
  });

  $('#add-question-btn', backdrop).addEventListener('click', () => {
    syncDraftQuestionsFromDom();
    draftVacancy.questions.push({
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
    renderQuestionBuilder();
    const list = $('#q-builder-list', backdrop);
    list.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  $('#v-modal-form', backdrop).addEventListener('submit', async event => {
    event.preventDefault();
    const errorBox = $('#v-modal-error', backdrop);
    errorBox.textContent = '';

    syncDraftQuestionsFromDom();
    draftVacancy.name = $('#v-name', backdrop).value.trim();
    draftVacancy.active = $('#v-active', backdrop).checked;
    draftVacancy.primaryLocationScore = Number($('#v-primary-score', backdrop).value || 0);
    draftVacancy.otherLocationLabel = $('#v-other-label', backdrop).value.trim() || 'Area selain lokasi utama';
    draftVacancy.otherLocationScore = Number($('#v-other-score', backdrop).value || 0);

    if (!draftVacancy.name) {
      errorBox.textContent = 'Nama posisi wajib diisi.';
      $('#v-name', backdrop).focus();
      return;
    }

    const dup = vacancies.find(
      v => v.id !== editingVacancyId && v.name.toLocaleLowerCase('id') === draftVacancy.name.toLocaleLowerCase('id')
    );
    if (dup) {
      errorBox.textContent = `Posisi "${draftVacancy.name}" sudah ada.`;
      $('#v-name', backdrop).focus();
      return;
    }

    for (let i = 0; i < draftVacancy.questions.length; i++) {
      const q = draftVacancy.questions[i];
      if (!q.label.trim()) {
        errorBox.textContent = `Pertanyaan #${i + 1} belum diisi.`;
        return;
      }
      if (['dropdown', 'radio', 'checkbox'].includes(q.type)) {
        q.options = (q.options || []).filter(opt => opt.label.trim());
        if (!q.options.length) {
          errorBox.textContent = `Pertanyaan "${q.label}" membutuhkan minimal 1 pilihan jawaban.`;
          return;
        }
      }
    }

    const normalized = normalizeVacancy(draftVacancy, vacancies.length);
    const nextList = editingVacancyId
      ? vacancies.map(v => (v.id === editingVacancyId ? normalized : v))
      : [...vacancies, normalized];

    const saveBtn = $('#v-modal-save', backdrop);
    saveBtn.disabled = true;
    saveBtn.textContent = 'Menyimpan…';
    try {
      await persistVacancies(nextList);
      closeModal();
      renderVacancyManager();
      say(`Lowongan "${normalized.name}" berhasil disimpan.`);
    } catch (error) {
      errorBox.textContent = error.message || 'Gagal menyimpan lowongan.';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Simpan Lowongan';
    }
  });

  return backdrop;
}

function getCatalogDistrictTokens() {
  const tokens = [];
  for (const [city, districts] of Object.entries(DISTRICTS_BY_CITY)) {
    for (const d of districts) {
      tokens.push({ city, district: d, token: normalizeDistrictToken(city, d) });
    }
  }
  return tokens;
}

function renderDistrictPicker() {
  const modal = $('#vacancy-modal');
  if (!modal || !draftVacancy) return;

  const listEl = $('#district-picker-list', modal);
  const tagsEl = $('#district-selected-tags', modal);
  const search = pickerSearch.trim().toLocaleLowerCase('id');

  const items = getCatalogDistrictTokens().filter(item => {
    if (pickerCityFilter !== 'Semua' && item.city !== pickerCityFilter) return false;
    if (search && !item.token.toLocaleLowerCase('id').includes(search)) return false;
    return true;
  });

  listEl.innerHTML = items.length
    ? items.map(item => {
        const checked = draftVacancy.primaryDistricts.includes(item.token);
        return `
          <label class="district-chip">
            <input type="checkbox" value="${esc(item.token)}" ${checked ? 'checked' : ''}>
            <span>${esc(item.token)}</span>
          </label>
        `;
      }).join('')
    : '<div class="loc-empty" style="grid-column:1/-1;padding:8px">Kecamatan tidak ditemukan.</div>';

  $$('input[type="checkbox"]', listEl).forEach(cb => {
    cb.addEventListener('change', () => {
      const token = cb.value;
      if (cb.checked) {
        if (!draftVacancy.primaryDistricts.includes(token)) {
          draftVacancy.primaryDistricts.push(token);
        }
      } else {
        draftVacancy.primaryDistricts = draftVacancy.primaryDistricts.filter(x => x !== token);
      }
      renderSelectedDistrictTags();
    });
  });

  renderSelectedDistrictTags();
}

function renderSelectedDistrictTags() {
  const modal = $('#vacancy-modal');
  if (!modal || !draftVacancy) return;
  const tagsEl = $('#district-selected-tags', modal);
  tagsEl.innerHTML = draftVacancy.primaryDistricts.map(token => `
    <span class="district-selected-tag">
      ${esc(token)}
      <button type="button" data-remove-district="${esc(token)}" aria-label="Hapus ${esc(token)}">&times;</button>
    </span>
  `).join('');

  $$('[data-remove-district]', tagsEl).forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.removeDistrict;
      draftVacancy.primaryDistricts = draftVacancy.primaryDistricts.filter(x => x !== val);
      renderDistrictPicker();
    });
  });
}

function syncDraftQuestionsFromDom() {
  const modal = $('#vacancy-modal');
  if (!modal || !draftVacancy) return;
  const items = $$('.q-builder-item', modal);
  if (!items.length) return;

  draftVacancy.questions = items.map((itemEl, idx) => {
    const existing = draftVacancy.questions[idx] || {};
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

function renderQuestionBuilder() {
  const modal = $('#vacancy-modal');
  if (!modal || !draftVacancy) return;
  const bodyEl = $('.vacancy-modal-body', modal);
  const prevScrollTop = bodyEl ? bodyEl.scrollTop : 0;
  const host = $('#q-builder-list', modal);

  if (!draftVacancy.questions.length) {
    host.innerHTML = '<div class="loc-empty" style="padding:10px 0">Belum ada pertanyaan. Klik "+ Tambah Pertanyaan" bila posisi ini memerlukan pertanyaan.</div>';
    return;
  }

  host.innerHTML = draftVacancy.questions.map((q, idx) => {
    const hasOptions = ['dropdown', 'radio', 'checkbox'].includes(q.type);
    const optionRows = (q.options || []).map((opt, optIdx) => `
      <div class="q-option-row" data-opt-index="${optIdx}">
        <input class="input" data-opt-label value="${esc(opt.label)}" placeholder="Jawaban ${String.fromCharCode(65 + (optIdx % 26))}">
        <input class="input" data-opt-score type="number" step="0.5" value="${esc(opt.score)}" placeholder="Skor">
        <button type="button" class="q-option-del" data-del-opt="${optIdx}" aria-label="Hapus pilihan">&times;</button>
      </div>
    `).join('');

    return `
      <div class="q-builder-item" data-q-index="${idx}">
        <div class="q-builder-top">
          <span class="q-builder-index">Pertanyaan ${idx + 1}</span>
          <div class="q-builder-controls">
            <button type="button" class="icon-btn" data-move-q="-1" ${idx === 0 ? 'disabled' : ''} title="Naik">↑</button>
            <button type="button" class="icon-btn" data-move-q="1" ${idx === draftVacancy.questions.length - 1 ? 'disabled' : ''} title="Turun">↓</button>
            <button type="button" class="icon-btn danger-action" data-del-q>Hapus</button>
          </div>
        </div>

        <div class="q-builder-fields">
          <div class="v-field">
            <label>Teks Pertanyaan</label>
            <input class="input" data-q-prop="label" value="${esc(q.label)}" placeholder="Contoh: Pernah nyepray apa?">
          </div>
          <div class="v-field">
            <label>Jenis Input</label>
            <select class="select" data-q-prop="type">
              ${QUESTION_TYPES.map(t => `<option value="${esc(t.value)}" ${q.type === t.value ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
            </select>
          </div>
          <label class="v-check-inline">
            <input type="checkbox" data-q-prop="required" ${q.required !== false ? 'checked' : ''}>
            <span>Wajib</span>
          </label>
        </div>

        ${hasOptions ? `
          <div class="q-options-box">
            <div class="q-options-head"><span>Pilihan Jawaban</span><span>Skor</span><span></span></div>
            ${optionRows}
            <button type="button" class="btn btn-secondary" data-add-opt style="padding:7px 12px;font-size:12px;margin-top:4px">+ Tambah Pilihan</button>
          </div>
        ` : `
          <div class="q-nonoption-box">
            <div class="v-field">
              <label>Placeholder Isian</label>
              <input class="input" data-q-prop="placeholder" value="${esc(q.placeholder || '')}" placeholder="Contoh: Nama perusahaan / penjelasan">
            </div>
            <div class="v-field">
              <label>Skor Jika Diisi</label>
              <input class="input" data-q-prop="filledScore" type="number" step="0.5" value="${esc(q.filledScore ?? 0)}">
            </div>
          </div>
        `}
      </div>
    `;
  }).join('');

  $$('.q-builder-item', host).forEach((itemEl, idx) => {
    itemEl.querySelector('[data-q-prop="type"]').addEventListener('change', event => {
      syncDraftQuestionsFromDom();
      const nextType = event.target.value;
      const target = draftVacancy.questions[idx];
      target.type = nextType;
      if (['dropdown', 'radio', 'checkbox'].includes(nextType) && !target.options.length) {
        target.options = [
          { label: 'Pilihan A', score: 10 },
          { label: 'Pilihan B', score: 5 }
        ];
      }
      renderQuestionBuilder();
    });

    itemEl.querySelector('[data-del-q]').addEventListener('click', () => {
      syncDraftQuestionsFromDom();
      draftVacancy.questions.splice(idx, 1);
      renderQuestionBuilder();
    });

    itemEl.querySelectorAll('[data-move-q]').forEach(btn => {
      btn.addEventListener('click', () => {
        syncDraftQuestionsFromDom();
        const delta = Number(btn.dataset.moveQ);
        const swapIdx = idx + delta;
        if (swapIdx < 0 || swapIdx >= draftVacancy.questions.length) return;
        [draftVacancy.questions[idx], draftVacancy.questions[swapIdx]] = [
          draftVacancy.questions[swapIdx],
          draftVacancy.questions[idx]
        ];
        renderQuestionBuilder();
      });
    });

    itemEl.querySelector('[data-add-opt]')?.addEventListener('click', () => {
      syncDraftQuestionsFromDom();
      const target = draftVacancy.questions[idx];
      const nextLetter = String.fromCharCode(65 + ((target.options?.length || 0) % 26));
      target.options.push({ label: `Pilihan ${nextLetter}`, score: 0 });
      renderQuestionBuilder();
    });

    itemEl.querySelectorAll('[data-del-opt]').forEach(btn => {
      btn.addEventListener('click', () => {
        syncDraftQuestionsFromDom();
        const optIdx = Number(btn.dataset.delOpt);
        draftVacancy.questions[idx].options.splice(optIdx, 1);
        renderQuestionBuilder();
      });
    });
  });

  if (bodyEl) bodyEl.scrollTop = prevScrollTop;
}

function openVacancyModal(id = null) {
  const modal = ensureVacancyModal();
  editingVacancyId = id;
  pickerCityFilter = 'Semua';
  pickerSearch = '';

  const source = id ? vacancies.find(v => v.id === id) : null;
  draftVacancy = source
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

  $('#v-modal-title', modal).textContent = source ? `Edit Lowongan: ${source.name}` : 'Tambah Lowongan Baru';
  $('#v-name', modal).value = draftVacancy.name;
  $('#v-active', modal).checked = draftVacancy.active !== false;
  $('#v-primary-score', modal).value = draftVacancy.primaryLocationScore ?? 20;
  $('#v-other-label', modal).value = draftVacancy.otherLocationLabel || 'Area selain lokasi utama';
  $('#v-other-score', modal).value = draftVacancy.otherLocationScore ?? 10;
  $('#district-city-filter', modal).value = 'Semua';
  $('#district-search', modal).value = '';
  $('#district-custom-input', modal).value = '';
  $('#v-modal-error', modal).textContent = '';

  renderDistrictPicker();
  renderQuestionBuilder();

  modal.classList.remove('hidden');
  $('.vacancy-modal-body', modal).scrollTop = 0;
  $('#v-name', modal).focus();
}

/* ==================== MODAL BAGIKAN TAUTAN ==================== */

function ensureShareModal() {
  let backdrop = $('#share-modal');
  if (backdrop) return backdrop;

  backdrop = document.createElement('div');
  backdrop.id = 'share-modal';
  backdrop.className = 'modal-backdrop hidden';
  backdrop.innerHTML = `
    <div class="employee-modal-card share-modal-card" role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
      <div class="employee-modal-head">
        <div>
          <small>SEBAR LOWONGAN (/apply)</small>
          <h2 id="share-modal-title">Tautan Lowongan</h2>
        </div>
        <button type="button" class="modal-close" id="share-modal-close" aria-label="Tutup">&times;</button>
      </div>

      <div class="v-field" style="margin-top:14px">
        <label for="share-source">Sumber Informasi (Otomatis terpilih untuk kandidat)</label>
        <select id="share-source" class="select"></select>
      </div>

      <div class="v-field" style="margin-top:14px">
        <label>Tautan Formulir</label>
        <div id="share-url-preview" class="share-preview-box"></div>
      </div>

      <div class="share-actions-row">
        <button type="button" class="btn btn-primary" id="share-copy-btn">Salin Tautan</button>
        <a id="share-open-btn" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">Buka Formulir</a>
      </div>
    </div>
  `;
  document.body.append(backdrop);

  const closeModal = () => backdrop.classList.add('hidden');
  $('#share-modal-close', backdrop).addEventListener('click', closeModal);
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeModal();
  });

  return backdrop;
}

function openShareModal(id) {
  const vacancy = vacancies.find(v => v.id === id);
  if (!vacancy) return;

  const modal = ensureShareModal();
  const baseApplyUrl = new URL('apply/', location.href).href;
  const sourceSelect = $('#share-source', modal);
  const sources = getApplyInfoSources();

  sourceSelect.innerHTML = [
    '<option value="">Semua Sumber (Tanpa Tag)</option>',
    ...sources.map(src => `<option value="${esc(src)}">${esc(src)}</option>`)
  ].join('');
  sourceSelect.value = '';

  $('#share-modal-title', modal).textContent = `Sebar Lowongan: ${vacancy.name}`;

  const updateUrl = () => {
    const url = buildShareUrl(baseApplyUrl, vacancy.name, sourceSelect.value);
    $('#share-url-preview', modal).textContent = url;
    $('#share-open-btn', modal).href = url;
  };

  sourceSelect.onchange = updateUrl;
  updateUrl();

  $('#share-copy-btn', modal).onclick = async () => {
    const url = $('#share-url-preview', modal).textContent;
    try {
      await copyText(url);
      say('Tautan lowongan berhasil disalin.');
    } catch {
      say('Gagal menyalin tautan.');
    }
  };

  modal.classList.remove('hidden');
}

/* ==================== AUTH & BOOTSTRAP ==================== */

async function openAdmin(accessToken = '') {
  if (accessToken) currentAccessToken = accessToken;
  loginView.classList.add('hidden');
  shell.classList.remove('hidden');
  content.innerHTML = '<div class="schema-panel" style="text-align:center;color:var(--muted)">Memuat konfigurasi portal…</div>';
  await fetchAllFunnelConfig();
  syncNavUI();
  renderCurrentRoute();
}

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const errorBox = $('#login-error');
  errorBox.textContent = '';

  const button = event.target.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Memeriksa…';

  try {
    const username = ($('#login-user').value || '').trim().toLowerCase();
    const pin = ($('#login-pin').value || '').trim();
    if (!username || !pin) throw new Error('Username dan PIN wajib diisi.');

    const { data, error } = await supabase.auth.signInWithPassword({
      email: `${username}@karir.local`,
      password: pin
    });
    if (error) throw error;

    const { data: isAdmin, error: roleError } = await supabase.rpc('is_portal_admin');
    if (roleError || !isAdmin) {
      await supabase.auth.signOut();
      throw new Error('Akun tidak memiliki akses Admin Portal Karir.');
    }

    $('#admin-name').textContent = username.toUpperCase();
    await openAdmin(data?.session?.access_token || '');
  } catch (error) {
    errorBox.textContent = error.message || 'Gagal masuk.';
  } finally {
    button.disabled = false;
    button.textContent = 'Masuk';
  }
});

async function handleLogout() {
  try {
    await supabase.auth.signOut();
  } catch {}
  currentAccessToken = '';
  shell.classList.add('hidden');
  loginView.classList.remove('hidden');
  $('#login-pin').value = '';
}

$('#logout-btn').addEventListener('click', handleLogout);
$('#mobile-logout-btn').addEventListener('click', handleLogout);

$$('.funnel-nav [data-route]').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.route));
});

$$('[data-mobile-group]').forEach(tab => {
  tab.addEventListener('click', () => {
    const group = tab.dataset.mobileGroup;
    if (group === 'dashboard') navigateTo('dashboard');
    else if (group === 'apply') navigateTo(activeRoute.startsWith('apply-') ? activeRoute : 'apply-scoring');
    else if (group === 'form') navigateTo('form-fields');
  });
});

$$('.mobile-subtab[data-route]').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.route));
});

async function init() {
  if (!isConfigured || !supabase) {
    $('#login-error').textContent = 'Konfigurasi Supabase belum tersedia.';
    return;
  }
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (session) {
    const { data: isAdmin } = await supabase.rpc('is_portal_admin');
    if (isAdmin) {
      const emailPrefix = String(session.user?.email || '').split('@')[0];
      if (emailPrefix) $('#admin-name').textContent = emailPrefix.toUpperCase();
      await openAdmin(session.access_token || '');
    }
  }
}

init().catch(error => {
  console.warn('Admin init:', error);
});