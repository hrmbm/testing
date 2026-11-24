// Operational Views: Attendance Upload, Calendar + National Holiday Import, Staff Management & Reports,
// Directory Delta & Cuti, Drivers (Schedule, Attendance Reconciliation + Overnight Abnormal Case, Reports),
// Stationery & ATK, and Grouped System Operations Settings
import {
  DEFAULT_OPS_SETTINGS,
  DEFAULT_WEEKDAY_OVERTIME_TARIFF,
  DEFAULT_HOLIDAY_OVERTIME_TARIFF,
  normalizeOpsSettings
} from './ops-settings-logic.js?v=20261123-hrga-workspace-18';
import {
  SEED_STATIONERY_ITEMS,
  SEED_STATIONERY_MOVEMENTS,
  SEED_DRIVERS,
  SEED_STAFF_SAMPLES,
  SEED_CALENDAR_DAYS,
  SEED_CUTI_BALANCES,
  SEED_ATTENDANCE_BATCHES,
  SEED_ATTENDANCE_EVENTS,
  SEED_DRIVER_SCHEDULES,
  SEED_DRIVER_RECONCILIATIONS,
  SEED_DRIVER_ADJUSTMENTS,
  SEED_STAFF_REVIEWS,
  SEED_STAFF_MEAL_OVERRIDES
} from './ops-seed-data.js?v=20261123-hrga-workspace-18';
import {
  compactNik,
  parseLaporanTransaksiRows,
  parseDataPresensiRows,
  parseRadinAttendanceRows,
  buildAttendanceBatchResult,
  processStaffAttendancePeriod,
  computeEmployeeDirectoryDelta,
  parseCutiSpreadsheetRows,
  evaluateCutiConfirmationGate,
  getIndonesianNationalHolidaysPreset,
  parseHolidayImportRows,
  resolveStaffWorkSchedule,
  evaluateStaffArrivalStatus,
  addMinutesToScheduleCutoff
} from './attendance-logic.js?v=20261123-hrga-workspace-18';
import {
  getEligibleDrivers,
  normalizeScheduleActivities,
  validateDriverSchedules,
  reconcileDriverSchedulesAndAttendance,
  computeDriverDayMetrics
} from './driver-logic.js?v=20261123-hrga-workspace-18';
import {
  renderDriverReportsView as renderDriverReportsModule,
  openDomPrintPreview
} from './driver-reports.js?v=20261123-hrga-workspace-18';
import {
  resolveCanonicalSloc,
  applyStationeryTransaction,
  buildStationeryReports
} from './stationery-logic.js?v=20261123-hrga-workspace-18';
import { parseEmployeeSpreadsheetRows, paginateRows } from './workspace-logic.js?v=20261123-hrga-workspace-18';

const DEMO_OPS_STORAGE_KEY = 'hrga_demo_ops_v2';
const OPS_SETTINGS_KEY = 'hrga_ops_settings_v1';
const DRIVER_ADJUSTMENTS_KEY = 'hrga_driver_adjustments_v1';
const OPS_STATE_TTL_MS = 120000;

let opsStateCache = null;
let opsStateCacheAt = 0;
let opsStateCacheMode = '';
let opsStatePromise = null;

export function invalidateOpsStateCache() {
  opsStateCache = null;
  opsStateCacheAt = 0;
  opsStateCacheMode = '';
  opsStatePromise = null;
}

function buildOpsPaginationHtml(paged) {
  if (!paged || paged.totalItems <= 0) return '';
  const sizeVal = paged.pageSize === 'all' ? 'all' : String(paged.pageSize);
  return `<div class="table-pagination">
    <div class="pagination-info">Showing ${paged.startIndex}–${paged.endIndex} of ${paged.totalItems}</div>
    <div class="pagination-controls">
      <label>Rows:
        <select class="select page-size-select ops-page-size" aria-label="Rows per page">
          <option value="25" ${sizeVal === '25' ? 'selected' : ''}>25</option>
          <option value="50" ${sizeVal === '50' ? 'selected' : ''}>50</option>
          <option value="100" ${sizeVal === '100' ? 'selected' : ''}>100</option>
          <option value="all" ${sizeVal === 'all' ? 'selected' : ''}>All</option>
        </select>
      </label>
      <button type="button" class="btn btn-sm btn-secondary ops-page-prev" ${paged.page <= 1 ? 'disabled' : ''}>Prev</button>
      <span class="pagination-page-label">Page ${paged.page} / ${paged.totalPages}</span>
      <button type="button" class="btn btn-sm btn-secondary ops-page-next" ${paged.page >= paged.totalPages ? 'disabled' : ''}>Next</button>
    </div>
  </div>`;
}

function bindOpsPagination(slotEl, paged, onChange) {
  if (!slotEl || !paged || paged.totalItems <= 0) return;
  slotEl.querySelector('.ops-page-size')?.addEventListener('change', e => {
    const val = e.target.value;
    onChange(1, val === 'all' ? 'all' : Number(val));
  });
  slotEl.querySelector('.ops-page-prev')?.addEventListener('click', () => {
    if (paged.page > 1) onChange(paged.page - 1, paged.pageSize);
  });
  slotEl.querySelector('.ops-page-next')?.addEventListener('click', () => {
    if (paged.page < paged.totalPages) onChange(paged.page + 1, paged.pageSize);
  });
}

let xlsxModulePromise = null;
export async function loadXlsx() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('/vendor/xlsx.mjs')
      .then(m => (m.read ? m : m.default || m))
      .catch(async () => {
        const cdn = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs');
        return cdn.read ? cdn : cdn.default || cdn;
      });
  }
  return xlsxModulePromise;
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtIdr(val) {
  return `Rp ${Math.round(Number(val || 0)).toLocaleString('id-ID')}`;
}

function showInlineBanner(host, msg, tone = 'info') {
  if (!host) return;
  const old = host.querySelector('.ops-flash-banner');
  if (old) old.remove();
  const div = document.createElement('div');
  div.className = `ops-flash-banner ops-flash-${tone}`;
  div.setAttribute('role', 'status');
  div.textContent = msg;
  host.prepend(div);
  setTimeout(() => div.remove(), 6000);
}

function openPrintHtml(title, bodyHtml, landscape = false) {
  openDomPrintPreview({
    title,
    pagesHtml: `<div class="drv-pdf-sheet">${bodyHtml}</div>`,
    landscape
  });
}

async function exportSheetXlsx(filename, sheetName, aoa) {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

// ============================================================================
// State Adapter (Demo LocalStorage + Live Supabase)
// ============================================================================
function buildInitialDemoOpsState() {
  return {
    settings: normalizeOpsSettings(DEFAULT_OPS_SETTINGS),
    calendarDays: structuredClone(SEED_CALENDAR_DAYS),
    uploadBatches: structuredClone(SEED_ATTENDANCE_BATCHES),
    rawEvents: structuredClone(SEED_ATTENDANCE_EVENTS),
    staffReviews: structuredClone(SEED_STAFF_REVIEWS),
    staffMealOverrides: structuredClone(SEED_STAFF_MEAL_OVERRIDES),
    conditionalHolidays: [],
    cutiBalances: structuredClone(SEED_CUTI_BALANCES),
    driverSchedules: structuredClone(SEED_DRIVER_SCHEDULES),
    driverReconciliations: structuredClone(SEED_DRIVER_RECONCILIATIONS),
    driverAdjustments: structuredClone(SEED_DRIVER_ADJUSTMENTS),
    stationeryItems: structuredClone(SEED_STATIONERY_ITEMS),
    stationeryMovements: structuredClone(SEED_STATIONERY_MOVEMENTS)
  };
}

export function readDemoOpsState() {
  try {
    const raw = JSON.parse(localStorage.getItem(DEMO_OPS_STORAGE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      const seed = buildInitialDemoOpsState();
      return {
        settings: normalizeOpsSettings(raw.settings || seed.settings),
        calendarDays: Array.isArray(raw.calendarDays) ? raw.calendarDays : seed.calendarDays,
        uploadBatches: Array.isArray(raw.uploadBatches) ? raw.uploadBatches : seed.uploadBatches,
        rawEvents: Array.isArray(raw.rawEvents) ? raw.rawEvents : seed.rawEvents,
        staffReviews: Array.isArray(raw.staffReviews) ? raw.staffReviews : seed.staffReviews,
        staffMealOverrides: Array.isArray(raw.staffMealOverrides) ? raw.staffMealOverrides : seed.staffMealOverrides,
        conditionalHolidays: Array.isArray(raw.conditionalHolidays) ? raw.conditionalHolidays : [],
        cutiBalances: Array.isArray(raw.cutiBalances) ? raw.cutiBalances : seed.cutiBalances,
        driverSchedules: Array.isArray(raw.driverSchedules) ? raw.driverSchedules : seed.driverSchedules,
        driverReconciliations: Array.isArray(raw.driverReconciliations) ? raw.driverReconciliations : seed.driverReconciliations,
        driverAdjustments: raw.driverAdjustments && typeof raw.driverAdjustments === 'object' ? raw.driverAdjustments : seed.driverAdjustments,
        stationeryItems: Array.isArray(raw.stationeryItems) && raw.stationeryItems.length ? raw.stationeryItems : seed.stationeryItems,
        stationeryMovements: Array.isArray(raw.stationeryMovements) ? raw.stationeryMovements : seed.stationeryMovements
      };
    }
  } catch {}
  const initial = buildInitialDemoOpsState();
  saveDemoOpsState(initial);
  return initial;
}

export function saveDemoOpsState(nextState) {
  try {
    localStorage.setItem(DEMO_OPS_STORAGE_KEY, JSON.stringify(nextState));
  } catch {}
  return nextState;
}

async function loadOpsState(ctx, force = false) {
  const modeKey = ctx.isDemoMode ? 'demo' : (ctx.supabase ? 'live' : 'fallback');
  if (!force && opsStateCache && opsStateCacheMode === modeKey && (Date.now() - opsStateCacheAt) < OPS_STATE_TTL_MS) {
    return opsStateCache;
  }
  if (ctx.isDemoMode || !ctx.supabase) {
    const demoState = readDemoOpsState();
    opsStateCache = demoState;
    opsStateCacheAt = Date.now();
    opsStateCacheMode = modeKey;
    return demoState;
  }
  if (!force && opsStatePromise) {
    return opsStatePromise;
  }
  const sb = ctx.supabase;
  opsStatePromise = (async () => {
    const state = buildInitialDemoOpsState();
    try {
      const [setRes, calRes, batRes, evRes, revRes, holRes, cutiRes, drvRes, stkItemRes, stkMvRes] = await Promise.all([
        sb.from('portal_settings').select('key,value').in('key', [OPS_SETTINGS_KEY, DRIVER_ADJUSTMENTS_KEY]),
        sb.from('attendance_calendar_days').select('*').order('cal_date', { ascending: true }),
        sb.from('attendance_upload_batches').select('*').order('created_at', { ascending: false }).limit(30),
        sb.from('attendance_raw_events').select('*').order('work_date', { ascending: false }).limit(2500),
        sb.from('staff_attendance_reviews').select('*'),
        sb.from('staff_conditional_holidays').select('*'),
        sb.from('employee_leave_balances').select('*').order('employee_name', { ascending: true }),
        sb.from('driver_daily_schedules').select('*').order('work_date', { ascending: false }),
        sb.from('stationery_items').select('*').order('item_name', { ascending: true }),
        sb.from('stationery_movements').select('*').order('created_at', { ascending: false }).limit(600)
      ]);
      if (Array.isArray(setRes.data)) {
        const opsRow = setRes.data.find(r => r.key === OPS_SETTINGS_KEY);
        const adjRow = setRes.data.find(r => r.key === DRIVER_ADJUSTMENTS_KEY);
        if (opsRow?.value) state.settings = normalizeOpsSettings(opsRow.value);
        if (adjRow?.value && typeof adjRow.value === 'object') state.driverAdjustments = adjRow.value;
      }
      if (Array.isArray(calRes.data)) state.calendarDays = calRes.data;
      if (Array.isArray(batRes.data)) state.uploadBatches = batRes.data;
      if (Array.isArray(evRes.data)) state.rawEvents = evRes.data;
      if (Array.isArray(revRes.data)) state.staffReviews = revRes.data;
      if (Array.isArray(holRes.data)) state.conditionalHolidays = holRes.data;
      if (Array.isArray(cutiRes.data)) state.cutiBalances = cutiRes.data;
      if (Array.isArray(drvRes.data)) state.driverSchedules = drvRes.data;
      if (Array.isArray(stkItemRes.data) && stkItemRes.data.length) state.stationeryItems = stkItemRes.data;
      if (Array.isArray(stkMvRes.data)) state.stationeryMovements = stkMvRes.data;

      // Optional v7 tables (graceful if v7 hasn't run yet)
      try {
        const [recRes, mealRes] = await Promise.all([
          sb.from('driver_attendance_reconciliations').select('*'),
          sb.from('staff_meal_overrides').select('*')
        ]);
        if (Array.isArray(recRes.data)) state.driverReconciliations = recRes.data;
        if (Array.isArray(mealRes.data)) state.staffMealOverrides = mealRes.data;
      } catch {}
    } catch (err) {
      console.warn('Operational schema check fallback:', err?.message || err);
    }
    opsStateCache = state;
    opsStateCacheAt = Date.now();
    opsStateCacheMode = modeKey;
    opsStatePromise = null;
    return state;
  })();
  return opsStatePromise;
}

function getAllKnownEmployees(ctx) {
  const fromDir = Array.isArray(ctx.getEmployees?.()) ? ctx.getEmployees() : [];
  if (fromDir.length) return fromDir;
  return [...SEED_DRIVERS, ...SEED_STAFF_SAMPLES];
}

// ============================================================================
// 1. ATTENDANCE UPLOAD CENTER
// ============================================================================
export async function renderAttendanceUploadView(host, ctx) {
  const state = await loadOpsState(ctx);
  const employees = getAllKnownEmployees(ctx);
  const exceptions = state.rawEvents.filter(e => e.is_exception);

  host.innerHTML = `
    <div class="ops-stack">
      <div class="card ops-card">
        <div class="ops-head">
          <div>
            <h2>Attendance Upload Center</h2>
            <p class="ops-sub">Multi-source import (<b>Laporan Transaksi</b>, <b>Data Presensi</b>, <b>Radin Excel</b>) dengan normalisasi waktu <code>${esc(state.settings.attendance.timezone)}</code>, deduplikasi sidik jari otomatis, dan antrean pengecualian.</p>
          </div>
          <div class="ops-actions">
            ${ctx.isDemoMode ? '<button type="button" class="btn btn-secondary" id="ops-att-demo-sample">Simulasi Upload Ulang (Dedup Check)</button>' : ''}
          </div>
        </div>
        <div class="ops-form-grid">
          <label class="ops-field">
            <span>Sumber File Absensi</span>
            <select id="ops-upload-source" class="input">
              <option value="mitra_transaksi">1. Laporan Transaksi (.xls / .xlsx — Prioritas Utama)</option>
              <option value="mitra_presensi">2. Data Presensi Mesin (.xls / .xlsx — Pendukung Opsional)</option>
              <option value="radin_xlsx">3. Karyawan Radin Export (.xlsx)</option>
            </select>
          </label>
          <label class="ops-field">
            <span>Pilih File Absensi</span>
            <input id="ops-upload-file" type="file" accept=".xls,.xlsx,.csv" class="input">
          </label>
          <div class="ops-field ops-field-end">
            <button type="button" class="btn btn-primary" id="ops-upload-run">Proses &amp; Simpan Batch</button>
          </div>
        </div>
      </div>

      <div class="kpi-grid ops-kpi-4">
        <div class="card kpi-card"><div class="kpi-label">Batch Terproses</div><div class="kpi-val">${state.uploadBatches.length}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Total Log Tersimpan</div><div class="kpi-val">${state.rawEvents.length}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Log Siap Rekap</div><div class="kpi-val">${state.rawEvents.filter(e => !e.is_exception).length}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Antrean Pengecualian</div><div class="kpi-val ${exceptions.length ? 'text-danger' : ''}">${exceptions.length}</div></div>
      </div>

      <div class="card ops-card">
        <h3>Riwayat Batch Upload</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Waktu Upload</th>
                <th>Nama File</th>
                <th>Sumber</th>
                <th>Rentang Tanggal</th>
                <th class="num">Total Baris</th>
                <th class="num">Baru Masuk</th>
                <th class="num">Duplikat Dilewati</th>
                <th class="num">Pengecualian</th>
              </tr>
            </thead>
            <tbody>
              ${state.uploadBatches.length ? state.uploadBatches.map(b => `
                <tr>
                  <td>${esc((b.created_at || '').slice(0, 16).replace('T', ' '))}</td>
                  <td><b>${esc(b.filename)}</b></td>
                  <td><span class="pill">${esc(b.source_type)}</span></td>
                  <td>${esc(b.period_start || '-')} s/d ${esc(b.period_end || '-')}</td>
                  <td class="num">${b.row_count}</td>
                  <td class="num"><b>${b.inserted_count}</b></td>
                  <td class="num">${b.duplicate_count}</td>
                  <td class="num">${b.exception_count ? `<span class="pill danger">${b.exception_count}</span>` : '<span class="pill green">0</span>'}</td>
                </tr>
              `).join('') : '<tr><td colspan="8" class="empty">Belum ada batch upload.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card ops-card">
        <h3>Exception Queue (NIK Tidak Dikenal / Anomali)</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>NIK / PIN Mesin</th>
                <th>Nama File Sumber</th>
                <th>Alasan Pengecualian</th>
                <th>Petakan ke Karyawan</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${exceptions.length ? exceptions.map(ev => `
                <tr>
                  <td>${esc(ev.work_date)}</td>
                  <td><code>${esc(ev.employee_no)}</code></td>
                  <td>${esc(ev.employee_name)} <small>(${esc(ev.source_type)})</small></td>
                  <td><span class="pill gold">${esc(ev.exception_reason || 'Perlu pemetaan')}</span></td>
                  <td>
                    <select class="input ops-map-emp" data-ev-id="${esc(ev.id)}" aria-label="Pilih karyawan untuk ${esc(ev.employee_no)}">
                      <option value="">-- Pilih Karyawan --</option>
                      ${employees.map(emp => `<option value="${esc(emp.employee_no)}">${esc(emp.employee_no)} — ${esc(emp.full_name)}</option>`).join('')}
                    </select>
                  </td>
                  <td>
                    <button type="button" class="btn btn-sm btn-primary ops-resolve-exc" data-ev-id="${esc(ev.id)}">Petakan</button>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="6" class="empty">Tidak ada anomali. Semua data terpetakan bersih.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const handleBatchSave = async (filename, sourceType, rawPunches) => {
    const result = buildAttendanceBatchResult({
      filename,
      sourceType,
      rawPunches,
      existingEvents: state.rawEvents,
      employees,
      settings: state.settings
    });
    if (ctx.isDemoMode) {
      state.uploadBatches = [result.batch, ...state.uploadBatches];
      state.rawEvents = [...result.accepted, ...state.rawEvents];
      saveDemoOpsState(state);
    } else {
      const { error: batErr } = await ctx.supabase.from('attendance_upload_batches').insert(result.batch);
      if (batErr) {
        showInlineBanner(host, `Gagal menyimpan batch absensi: ${batErr.message}`, 'error');
        return;
      }
      if (result.accepted.length) {
        const { error: evErr } = await ctx.supabase.from('attendance_raw_events').insert(result.accepted);
        if (evErr) {
          showInlineBanner(host, `Batch tersimpan, namun sebagian log gagal disimpan: ${evErr.message}`, 'error');
          invalidateOpsStateCache();
          return;
        }
      }
      invalidateOpsStateCache();
    }
    await renderAttendanceUploadView(host, ctx);
    showInlineBanner(
      host,
      `Batch "${filename}" selesai: ${result.accepted.length} baru masuk, ${result.duplicateCount} duplikat otomatis dilewati, ${result.exceptions.length} pengecualian.`,
      result.exceptions.length ? 'warn' : 'ok'
    );
  };

  host.querySelector('#ops-upload-run')?.addEventListener('click', async () => {
    const file = host.querySelector('#ops-upload-file')?.files?.[0];
    const sourceType = host.querySelector('#ops-upload-source')?.value || 'mitra_transaksi';
    if (!file) {
      showInlineBanner(host, 'Pilih file .xls / .xlsx terlebih dahulu.', 'error');
      return;
    }
    try {
      const XLSX = await loadXlsx();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      let parsed = [];
      if (sourceType === 'mitra_transaksi') parsed = parseLaporanTransaksiRows(aoa);
      else if (sourceType === 'mitra_presensi') parsed = parseDataPresensiRows(aoa);
      else parsed = parseRadinAttendanceRows(aoa);
      if (!parsed.length) {
        showInlineBanner(host, 'Tidak ada baris absensi valid yang ditemukan di file ini.', 'error');
        return;
      }
      await handleBatchSave(file.name, sourceType, parsed);
    } catch (err) {
      showInlineBanner(host, err?.message || 'Gagal membaca file absensi.', 'error');
    }
  });

  host.querySelector('#ops-att-demo-sample')?.addEventListener('click', async () => {
    await handleBatchSave('Input Utama - Laporan Transaksi (Re-Upload).xls', 'mitra_transaksi', [
      { employee_no: 'ST 120115', employee_name: 'SULIYANTO', work_date: '2026-11-02', punch_time: '07:07:00', raw_code: 'M' },
      { employee_no: 'ST 130117', employee_name: 'ABDUL AJIS', work_date: '2026-11-04', punch_time: '07:28:00', raw_code: 'M' }
    ]);
  });

  host.querySelectorAll('.ops-resolve-exc').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.evId;
      const sel = host.querySelector(`.ops-map-emp[data-ev-id="${id}"]`);
      const targetNik = sel?.value || '';
      if (!targetNik) {
        showInlineBanner(host, 'Pilih karyawan tujuan terlebih dahulu.', 'error');
        return;
      }
      const emp = employees.find(e => e.employee_no === targetNik);
      if (ctx.isDemoMode) {
        const idx = state.rawEvents.findIndex(e => e.id === id);
        if (idx >= 0) {
          state.rawEvents[idx] = {
            ...state.rawEvents[idx],
            employee_no: targetNik,
            employee_name: emp?.full_name || targetNik,
            is_exception: false,
            exception_reason: ''
          };
          saveDemoOpsState(state);
        }
      } else {
        const { error } = await ctx.supabase.from('attendance_raw_events').update({
          employee_no: targetNik,
          employee_name: emp?.full_name || targetNik,
          is_exception: false,
          exception_reason: null
        }).eq('id', id);
        if (error) {
          showInlineBanner(host, `Gagal memetakan pengecualian: ${error.message}`, 'error');
          return;
        }
        invalidateOpsStateCache();
      }
      await renderAttendanceUploadView(host, ctx);
      showInlineBanner(host, `Pengecualian berhasil dipetakan ke ${targetNik}.`, 'ok');
    });
  });
}

// ============================================================================
// 2. ATTENDANCE CALENDAR SETTINGS (WITH NATIONAL HOLIDAY IMPORT & OVERRIDE REASON)
// ============================================================================
export async function renderAttendanceCalendarView(host, ctx) {
  const state = await loadOpsState(ctx);
  const currentMonth = host.dataset.calMonth || '2026-11';
  const [yr, mo] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(yr, mo, 0)).getUTCDate();
  const calMap = new Map(state.calendarDays.map(c => [c.cal_date, c]));
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  const rowsHtml = Array.from({ length: daysInMonth }, (_, i) => {
    const dStr = `${yr}-${String(mo).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
    const dow = new Date(`${dStr}T00:00:00Z`).getUTCDay();
    const existing = calMap.get(dStr);
    const type = existing?.day_type || (dow === 0 ? 'WEEKEND' : 'WORKING');
    const rowBg = dow === 0 ? 'ops-cal-row-sun' : (type === 'HOLIDAY' || type === 'CUTI_BERSAMA' ? 'ops-cal-row-hol' : '');
    return `
      <tr class="${rowBg}">
        <td><b>${dStr}</b></td>
        <td>${dayNames[dow]}</td>
        <td>
          <select class="input ops-cal-type" data-date="${dStr}" aria-label="Tipe hari ${dStr}">
            <option value="WORKING" ${type === 'WORKING' ? 'selected' : ''}>WORKING (Hari Kerja)</option>
            <option value="WEEKEND" ${type === 'WEEKEND' ? 'selected' : ''}>WEEKEND (Minggu / Libur)</option>
            <option value="HOLIDAY" ${type === 'HOLIDAY' ? 'selected' : ''}>HOLIDAY (Hari Besar Nasional)</option>
            <option value="CUTI_BERSAMA" ${type === 'CUTI_BERSAMA' ? 'selected' : ''}>CUTI_BERSAMA</option>
          </select>
        </td>
        <td><input type="text" class="input ops-cal-label" data-date="${dStr}" value="${esc(existing?.label || (dow === 0 ? 'Hari Minggu' : ''))}" placeholder="Nama hari libur / operasional"></td>
        <td><input type="text" class="input ops-cal-notes" data-date="${dStr}" value="${esc(existing?.notes || '')}" placeholder="Alasan perubahan manual (opsional)"></td>
      </tr>
    `;
  }).join('');

  host.innerHTML = `
    <div class="ops-stack">
      <div class="card ops-card">
        <div class="ops-head">
          <div>
            <h2>Calendar Settings &amp; Hari Besar Nasional</h2>
            <p class="ops-sub">Import Hari Besar Nasional (preset tahunan atau upload Excel/CSV) dan ubah manual kapan saja dengan alasan khusus. Hari Minggu ditandai kuning dan Hari Besar ditandai merah pada Time Checksheet Driver.</p>
          </div>
          <div class="ops-actions">
            <input type="month" id="ops-cal-month" class="input" value="${esc(currentMonth)}" aria-label="Pilih bulan kalender">
            <button type="button" class="btn btn-secondary" id="ops-cal-preset">Import Libur Nasional ${yr}</button>
            <button type="button" class="btn btn-primary" id="ops-cal-save">Simpan Kalender Bulan Ini</button>
          </div>
        </div>
        <div class="ops-form-grid" style="margin-top:8px">
          <label class="ops-field">
            <span>Import File Hari Besar (Excel/CSV: Tanggal, Nama Libur, Jenis, Alasan)</span>
            <input type="file" id="ops-cal-import-file" accept=".xlsx,.xls,.csv" class="input">
          </label>
          <div class="ops-field ops-field-end">
            <button type="button" class="btn btn-secondary" id="ops-cal-import-run">Import File Hari Besar</button>
          </div>
        </div>
      </div>

      <div class="card ops-card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Tanggal</th><th>Hari</th><th>Jenis Hari</th><th>Keterangan</th><th>Alasan Perubahan Manual</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  host.querySelector('#ops-cal-month')?.addEventListener('change', e => {
    host.dataset.calMonth = e.target.value || '2026-11';
    renderAttendanceCalendarView(host, ctx);
  });

  const saveCalendarEntries = async entries => {
    if (ctx.isDemoMode) {
      const map = new Map(state.calendarDays.map(c => [c.cal_date, c]));
      entries.forEach(en => map.set(en.cal_date, en));
      state.calendarDays = [...map.values()].sort((a, b) => a.cal_date.localeCompare(b.cal_date));
      saveDemoOpsState(state);
    } else {
      const { error } = await ctx.supabase.from('attendance_calendar_days').upsert(entries, { onConflict: 'cal_date' });
      if (error) {
        showInlineBanner(host, `Gagal menyimpan kalender: ${error.message}`, 'error');
        return false;
      }
      invalidateOpsStateCache();
    }
    return true;
  };

  host.querySelector('#ops-cal-preset')?.addEventListener('click', async () => {
    const preset = getIndonesianNationalHolidaysPreset(yr);
    const ok = await saveCalendarEntries(preset);
    if (!ok) return;
    await renderAttendanceCalendarView(host, ctx);
    showInlineBanner(host, `Berhasil mengimpor ${preset.length} Hari Besar Nasional tahun ${yr}.`, 'ok');
  });

  host.querySelector('#ops-cal-import-run')?.addEventListener('click', async () => {
    const file = host.querySelector('#ops-cal-import-file')?.files?.[0];
    if (!file) {
      showInlineBanner(host, 'Pilih file Excel/CSV daftar hari besar terlebih dahulu.', 'error');
      return;
    }
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await file.arrayBuffer());
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const parsed = parseHolidayImportRows(aoa);
      if (!parsed.length) {
        showInlineBanner(host, 'Tidak ditemukan tanggal hari besar yang valid di file tersebut.', 'error');
        return;
      }
      const ok = await saveCalendarEntries(parsed);
      if (!ok) return;
      await renderAttendanceCalendarView(host, ctx);
      showInlineBanner(host, `${parsed.length} Hari Besar berhasil diimpor dari "${file.name}".`, 'ok');
    } catch (err) {
      showInlineBanner(host, err?.message || 'Gagal membaca file hari besar.', 'error');
    }
  });

  host.querySelector('#ops-cal-save')?.addEventListener('click', async () => {
    const entries = [...host.querySelectorAll('.ops-cal-type')].map(sel => {
      const date = sel.dataset.date;
      const label = host.querySelector(`.ops-cal-label[data-date="${date}"]`)?.value?.trim() || '';
      const notes = host.querySelector(`.ops-cal-notes[data-date="${date}"]`)?.value?.trim() || '';
      return { cal_date: date, day_type: sel.value, label, notes };
    });
    const ok = await saveCalendarEntries(entries);
    if (!ok) return;
    await renderAttendanceCalendarView(host, ctx);
    showInlineBanner(host, `Kalender ${currentMonth} & alasan perubahan manual berhasil disimpan.`, 'ok');
  });
}

export async function renderStaffHolidayView(host, ctx) {
  const state = await loadOpsState(ctx);
  const employees = getAllKnownEmployees(ctx);

  host.innerHTML = `
    <div class="card ops-card">
      <div class="ops-head">
        <div>
          <h2>Conditional Holiday Schedule (Staff)</h2>
          <p class="ops-sub">Daftarkan staf/departemen yang dijadwalkan masuk pada hari libur/Minggu untuk menerima kredit lembur hari libur (<code>+${state.settings.attendance.holidayCreditWeight}</code> hari).</p>
        </div>
      </div>
      <div class="ops-form-grid">
        <label class="ops-field"><span>Tanggal Libur</span><input id="ops-ch-date" type="date" class="input" value="2026-11-10"></label>
        <label class="ops-field"><span>Karyawan</span>
          <select id="ops-ch-nik" class="input">
            ${employees.map(e => `<option value="${esc(e.employee_no)}">${esc(e.employee_no)} — ${esc(e.full_name)} (${esc(e.department || '-')})</option>`).join('')}
          </select>
        </label>
        <label class="ops-field"><span>Catatan / Alasan Tugas</span><input id="ops-ch-notes" type="text" class="input" placeholder="Stock opname / Pengiriman"></label>
        <div class="ops-field ops-field-end"><button type="button" class="btn btn-primary" id="ops-ch-add">Tambahkan Jadwal</button></div>
      </div>
      <div class="table-wrap" style="margin-top:14px">
        <table>
          <thead><tr><th>Tanggal</th><th>NIK</th><th>Nama</th><th>Catatan</th><th>Aksi</th></tr></thead>
          <tbody>
            ${state.conditionalHolidays.length ? state.conditionalHolidays.map(h => `
              <tr>
                <td>${esc(h.work_date)}</td>
                <td><code>${esc(h.employee_no)}</code></td>
                <td>${esc(h.employee_name || h.employee_no)}</td>
                <td>${esc(h.notes || '-')}</td>
                <td><button type="button" class="btn btn-sm btn-secondary ops-ch-del" data-id="${esc(h.id)}">Hapus</button></td>
              </tr>
            `).join('') : '<tr><td colspan="5" class="empty">Belum ada penugasan hari libur kondisional.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  host.querySelector('#ops-ch-add')?.addEventListener('click', async () => {
    const workDate = host.querySelector('#ops-ch-date')?.value;
    const nik = host.querySelector('#ops-ch-nik')?.value;
    const notes = host.querySelector('#ops-ch-notes')?.value?.trim() || '';
    if (!workDate || !nik) return;
    const emp = employees.find(e => e.employee_no === nik);
    const row = {
      id: `ch-${Date.now()}`,
      work_date: workDate,
      employee_no: nik,
      employee_name: emp?.full_name || nik,
      department: emp?.department || '',
      notes
    };
    if (ctx.isDemoMode) {
      state.conditionalHolidays = [row, ...state.conditionalHolidays];
      saveDemoOpsState(state);
    } else {
      const { error } = await ctx.supabase.from('staff_conditional_holidays').upsert(row, { onConflict: 'work_date,employee_no' });
      if (error) {
        showInlineBanner(host, `Gagal menambah jadwal libur kondisional: ${error.message}`, 'error');
        return;
      }
      invalidateOpsStateCache();
    }
    renderStaffHolidayView(host, ctx);
  });

  host.querySelectorAll('.ops-ch-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (ctx.isDemoMode) {
        state.conditionalHolidays = state.conditionalHolidays.filter(h => h.id !== id);
        saveDemoOpsState(state);
      } else {
        const { error } = await ctx.supabase.from('staff_conditional_holidays').delete().eq('id', id);
        if (error) {
          showInlineBanner(host, `Gagal menghapus jadwal libur kondisional: ${error.message}`, 'error');
          return;
        }
        invalidateOpsStateCache();
      }
      renderStaffHolidayView(host, ctx);
    });
  });
}

// ============================================================================
// 3. EMPLOYEE DIRECTORY EXTENSIONS (DELTA SNAPSHOT RECONCILIATION & CUTI)
// ============================================================================
export async function renderEmployeeExtensionsView(host, tab, ctx) {
  const state = await loadOpsState(ctx);
  const employees = getAllKnownEmployees(ctx);

  if (tab === 'delta') {
    const storedDelta = ctx.getLastDelta?.() || null;
    host.innerHTML = `
      <div class="card ops-card">
        <div class="ops-head">
          <div>
            <h3>Rekonsiliasi Snapshot Direktori Karyawan (Delta Check)</h3>
            <p class="ops-sub">Unggah file <code>Data_Karyawan_*.xlsx</code> untuk membandingkan perubahan per NIK tanpa menimpa data secara membabi-buta.</p>
          </div>
          <div class="ops-actions">
            ${ctx.isDemoMode ? '<button type="button" class="btn btn-secondary" id="ops-delta-demo">Simulasi Snapshot Baru</button>' : ''}
            <input id="ops-delta-file" type="file" accept=".xls,.xlsx" class="input" style="max-width:260px">
            <button type="button" class="btn btn-primary" id="ops-delta-scan">Analisa Delta</button>
          </div>
        </div>
        ${storedDelta ? `
          <div class="kpi-grid ops-kpi-4" style="margin:12px 0">
            <div class="card kpi-card"><div class="kpi-label">Karyawan Baru</div><div class="kpi-val">${storedDelta.summary.newCount}</div></div>
            <div class="card kpi-card"><div class="kpi-label">Data Berubah</div><div class="kpi-val">${storedDelta.summary.changedCount}</div></div>
            <div class="card kpi-card"><div class="kpi-label">Identik</div><div class="kpi-val">${storedDelta.summary.unchangedCount}</div></div>
            <div class="card kpi-card"><div class="kpi-label">Konflik / Tidak Ditemukan</div><div class="kpi-val">${storedDelta.summary.conflictCount + storedDelta.summary.notFoundCount}</div></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Status Delta</th><th>NIK</th><th>Nama</th><th>Detail Perubahan</th></tr></thead>
              <tbody>
                ${storedDelta.items.filter(it => it.kind !== 'unchanged').slice(0, 60).map(it => `
                  <tr>
                    <td><span class="pill ${it.kind === 'new' ? 'green' : (it.kind === 'changed' ? 'gold' : 'danger')}">${esc(it.kind.toUpperCase())}</span></td>
                    <td><code>${esc(it.employee_no)}</code></td>
                    <td>${esc(it.full_name)}</td>
                    <td>${it.diffs.length ? it.diffs.map(d => `<div><code>${esc(d.field)}</code>: "${esc(d.from)}" → <b>"${esc(d.to)}"</b></div>`).join('') : esc(it.reason)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="4" class="empty">Semua data direktori identik dengan snapshot.</td></tr>'}
              </tbody>
            </table>
          </div>
        ` : '<p class="ops-empty-hint">Unggah file snapshot Excel atau klik Simulasi Snapshot Baru untuk melihat hasil rekonsiliasi delta.</p>'}
      </div>
    `;

    host.querySelector('#ops-delta-demo')?.addEventListener('click', () => {
      const sample = employees.slice(0, 5).map((e, i) => (
        i === 0 ? { ...e, department: 'PROCUREMENT & PURCHASING', phone: '082230164499' } : e
      ));
      sample.push({
        employee_no: 'KT 261199',
        full_name: 'KARYAWAN BARU DEMO',
        department: 'PRODUKSI INDOOR',
        position: 'OPERATOR',
        employment_status: 'KONTRAK',
        join_date: '2026-11-20',
        phone: '081234000111'
      });
      ctx.setLastDelta?.(computeEmployeeDirectoryDelta(sample, employees));
      renderEmployeeExtensionsView(host, 'delta', ctx);
    });

    host.querySelector('#ops-delta-scan')?.addEventListener('click', async () => {
      const file = host.querySelector('#ops-delta-file')?.files?.[0];
      if (!file) {
        showInlineBanner(host, 'Pilih file Excel Data Karyawan terlebih dahulu.', 'error');
        return;
      }
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const cleanRows = rows.map(r => {
        if (r['DATA KARYAWAN'] && r.__EMPTY) {
          return {
            Nama: r['DATA KARYAWAN'], Nik: r.__EMPTY, Departement: r.__EMPTY_1, 'Tgl Masuk': r.__EMPTY_2,
            Jabatan: r.__EMPTY_3, 'Mulai Kontrak': r.__EMPTY_4, 'Kontrak Berakhir': r.__EMPTY_5,
            Alamat: r.__EMPTY_6, Nik2: r.__EMPTY_7, 'Tempat Lahir': r.__EMPTY_8, 'Tanggal Lahir': r.__EMPTY_9,
            'No. Telp': r.__EMPTY_10, Status: r.__EMPTY_11, Pendidikan: r.__EMPTY_12,
            'Jenis Kelamin': r.__EMPTY_13, Agama: r.__EMPTY_14
          };
        }
        return r;
      }).filter(r => r.Nama && r.Nama !== 'Nama');
      const parsed = parseEmployeeSpreadsheetRows(cleanRows);
      ctx.setLastDelta?.(computeEmployeeDirectoryDelta(parsed.rows, employees));
      renderEmployeeExtensionsView(host, 'delta', ctx);
    });
    return;
  }

  // Cuti Tab
  const refDate = '2026-11-23';
  const cutiPage = Number(host.dataset.cutiPage || 1) || 1;
  const cutiSizeRaw = host.dataset.cutiPageSize || '50';
  const cutiSize = cutiSizeRaw === 'all' ? 'all' : (Number(cutiSizeRaw) || 50);
  const cutiPaged = paginateRows(state.cutiBalances, cutiPage, cutiSize);

  host.innerHTML = `
    <div class="card ops-card">
      <div class="ops-head">
        <div>
          <h3>Manajemen Cuti Karyawan &amp; Import Cuti.xlsx</h3>
          <p class="ops-sub">Kalkulasi bersih tanpa <code>#REF!</code>, pemisahan cuti Disetujui (<code>CT 1–6</code>) vs Pending, serta gerbang konfirmasi &le; ${state.settings.cuti.confirmationDaysThreshold} hari menjelang pembaruan hak cuti.</p>
        </div>
        <div class="ops-actions">
          <input id="ops-cuti-file" type="file" accept=".xls,.xlsx" class="input" style="max-width:250px">
          <button type="button" class="btn btn-primary" id="ops-cuti-import">Import Cuti.xlsx</button>
        </div>
      </div>
      <div class="table-wrap" style="margin-top:10px">
        <table>
          <thead>
            <tr>
              <th>NIK</th>
              <th>Nama Karyawan</th>
              <th>PT</th>
              <th>Periode</th>
              <th class="num">Hak</th>
              <th class="num">Bersama</th>
              <th class="num">Diambil</th>
              <th class="num">Pending</th>
              <th class="num">Sisa Cuti</th>
              <th>Tgl Terbit Baru</th>
              <th>Status Konfirmasi</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${cutiPaged.items.map(c => {
              const gate = evaluateCutiConfirmationGate(c, refDate, state.settings);
              return `
                <tr>
                  <td><code>${esc(c.employee_no || '-')}</code></td>
                  <td><b>${esc(c.employee_name)}</b></td>
                  <td>${esc(c.pt_entity)}</td>
                  <td><small>${esc(c.period_label || '-')}</small></td>
                  <td class="num">${c.annual_quota}</td>
                  <td class="num">${c.cuti_bersama_used}</td>
                  <td class="num">${(c.diambil_dates || []).length}</td>
                  <td class="num">${(c.pending_dates || []).length}</td>
                  <td class="num"><b>${c.remaining_leave}</b></td>
                  <td>${esc(c.renewal_date || '-')}</td>
                  <td>${gate.requiresConfirmation ? `<span class="pill gold">Perlu Konfirmasi (${gate.daysUntilRenewal}h)</span>` : '<span class="pill green">Aktif</span>'}</td>
                  <td><button type="button" class="btn btn-sm btn-secondary ops-cuti-add-ct" data-id="${esc(c.id)}">+ Catat CT</button></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div id="ops-cuti-pager">${buildOpsPaginationHtml(cutiPaged)}</div>
    </div>
  `;

  bindOpsPagination(host.querySelector('#ops-cuti-pager'), cutiPaged, (nextPage, nextSize) => {
    host.dataset.cutiPage = String(nextPage);
    host.dataset.cutiPageSize = String(nextSize);
    renderEmployeeExtensionsView(host, 'cuti', ctx);
  });

  host.querySelector('#ops-cuti-import')?.addEventListener('click', async () => {
    const file = host.querySelector('#ops-cuti-file')?.files?.[0];
    if (!file) {
      showInlineBanner(host, 'Pilih file Cuti.xlsx terlebih dahulu.', 'error');
      return;
    }
    const XLSX = await loadXlsx();
    const wb = XLSX.read(await file.arrayBuffer());
    const sh = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
    const parsed = parseCutiSpreadsheetRows(aoa, employees, state.settings, sh);
    if (ctx.isDemoMode) {
      state.cutiBalances = parsed.rows;
      saveDemoOpsState(state);
    } else if (parsed.rows.length) {
      const { error } = await ctx.supabase.from('employee_leave_balances').upsert(parsed.rows, { onConflict: 'employee_no,period_label' });
      if (error) {
        showInlineBanner(host, `Gagal menyimpan data cuti: ${error.message}`, 'error');
        return;
      }
      invalidateOpsStateCache();
    }
    await renderEmployeeExtensionsView(host, 'cuti', ctx);
    showInlineBanner(host, `Import ${parsed.rows.length} baris Cuti selesai (${parsed.errors.length} baris error Excel dibersihkan).`, 'ok');
  });

  host.querySelectorAll('.ops-cuti-add-ct').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = state.cutiBalances.findIndex(x => x.id === btn.dataset.id);
      if (idx < 0) return;
      const row = { ...state.cutiBalances[idx] };
      if (Number(row.remaining_leave || 0) <= 0) {
        showInlineBanner(host, `Sisa cuti ${row.employee_name} sudah 0.`, 'warn');
        return;
      }
      const nextDate = new Date().toISOString().slice(0, 10);
      row.diambil_dates = [...(row.diambil_dates || []), nextDate];
      row.remaining_leave = Math.max(0, Number(row.annual_quota || 12) - Number(row.cuti_bersama_used || 6) - row.diambil_dates.length);
      state.cutiBalances[idx] = row;
      if (ctx.isDemoMode) saveDemoOpsState(state);
      else {
        const { error } = await ctx.supabase.from('employee_leave_balances').upsert(row);
        if (error) {
          showInlineBanner(host, `Gagal menyimpan pemakaian cuti: ${error.message}`, 'error');
          return;
        }
        invalidateOpsStateCache();
      }
      await renderEmployeeExtensionsView(host, 'cuti', ctx);
    });
  });
}

// ============================================================================
// 4. STAFF ATTENDANCE MANAGEMENT & REPORTS (HOLD FULL PAYROLL PHASE, STRUCTURED READY)
// ============================================================================
export async function renderStaffManagementView(host, ctx) {
  const state = await loadOpsState(ctx);
  const periodKey = host.dataset.staffPeriod || '2026-11';
  const employees = getAllKnownEmployees(ctx).filter(e => !/ADMIN/i.test(e.employee_no || ''));
  const computed = processStaffAttendancePeriod({
    periodKey,
    employees,
    rawEvents: state.rawEvents,
    calendarDays: state.calendarDays,
    holidaySchedules: state.conditionalHolidays,
    leaveBalances: state.cutiBalances,
    existingReviews: state.staffReviews,
    settings: state.settings
  });

  const attCfg = state.settings.attendance;
  const totalPending = computed.summaries.reduce((s, r) => s + r.counts.PENDING, 0);
  const totalLate = computed.summaries.reduce((s, r) => s + r.counts.T, 0);
  const staffPage = Number(host.dataset.staffPage || 1) || 1;
  const staffSizeRaw = host.dataset.staffPageSize || '50';
  const staffSize = staffSizeRaw === 'all' ? 'all' : (Number(staffSizeRaw) || 50);
  const staffPaged = paginateRows(computed.summaries, staffPage, staffSize);
  const empByNik = new Map(employees.map(e => [compactNik(e.employee_no), e]));

  host.innerHTML = `
    <div class="ops-stack">
      <div class="card ops-card">
        <div class="ops-head">
          <div>
            <h2>Staff Attendance Management</h2>
            <p class="ops-sub">Periode cutoff <b>${esc(computed.window.startDate)}</b> s/d <b>${esc(computed.window.endDate)}</b>. Aturan umum PT MBM: Terlambat &ge; ${attCfg.lateThresholdMinutes} mnt (<code>07:31:00</code>), Uang Makan hangus &ge; ${attCfg.mealThresholdMinutes} mnt (<code>07:36:00</code>). PT Radin aturan khusus (status hold).</p>
          </div>
          <div class="ops-actions">
            <input id="ops-staff-period" type="month" class="input" value="${esc(periodKey)}" aria-label="Pilih periode payroll staff">
            <button type="button" class="btn btn-secondary" id="ops-staff-export">Export XLSX</button>
          </div>
        </div>
      </div>

      <div class="kpi-grid ops-kpi-4">
        <div class="card kpi-card"><div class="kpi-label">Karyawan Periode</div><div class="kpi-val">${computed.summaries.length}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Total Keterlambatan (T)</div><div class="kpi-val">${totalLate}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Perlu Pemeriksaan HR</div><div class="kpi-val ${totalPending ? 'text-danger' : ''}">${totalPending}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Batas Telat / Uang Makan</div><div class="kpi-val" style="font-size:18px">&ge;${attCfg.lateThresholdMinutes}m / &ge;${attCfg.mealThresholdMinutes}m</div></div>
      </div>

      <div class="card ops-card">
        <h3>Ringkasan Kehadiran &amp; Jadwal Home Base Staff</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NIK</th>
                <th>Nama &amp; Home Base</th>
                <th>Departemen</th>
                <th class="num">M</th>
                <th class="num">T</th>
                <th class="num">S/I</th>
                <th class="num">A/ITB</th>
                <th class="num">CT</th>
                <th class="num">Perlu HR</th>
                <th class="num">Dibayar (Cap ${attCfg.maxPaidDaysCap})</th>
                <th>Evaluasi</th>
                <th>Koreksi Cepat Tanggal</th>
              </tr>
            </thead>
            <tbody>
              ${staffPaged.items.map(row => {
                const empObj = empByNik.get(compactNik(row.employee_no)) || row;
                const sch = resolveStaffWorkSchedule(empObj, '2026-11-02', state.settings);
                const flaggedDay = row.days.find(d => d.code === 'PERLU_PEMERIKSAAN_HR' || d.code === 'T') || row.days.find(d => d.code !== 'O' && d.code !== '-');
                return `
                  <tr>
                    <td><code>${esc(row.employee_no)}</code></td>
                    <td>
                      <b>${esc(row.employee_name)}</b> ${row.is_driver ? '<span class="pill">Driver</span>' : ''}
                      <div><small>${esc(sch.homeBase)} (${esc(sch.startTime)}–${esc(sch.endTime)})</small></div>
                    </td>
                    <td>${esc(row.department)}</td>
                    <td class="num">${row.counts.M}</td>
                    <td class="num">${row.counts.T}</td>
                    <td class="num">${row.counts.S + row.counts.SDR + row.counts.I}</td>
                    <td class="num">${row.absenPotong}</td>
                    <td class="num">${row.counts.CT}</td>
                    <td class="num">${row.counts.PENDING ? `<span class="pill gold">${row.counts.PENDING}</span>` : '0'}</td>
                    <td class="num"><b>${row.effectivePaidDays}</b></td>
                    <td><span class="pill ${row.evalStatus === 'Baik' ? 'green' : 'danger'}">${esc(row.evalStatus)}</span>${row.leaveCandidate ? ' <span class="pill gold">Kandidat Potong Cuti</span>' : ''}</td>
                    <td>
                      <div class="ops-inline-edit">
                        <select class="input ops-rev-date" data-nik="${esc(row.employee_no)}" aria-label="Tanggal untuk ${esc(row.employee_name)}">
                          ${row.days.slice(0, 15).map(d => `<option value="${d.work_date}" ${flaggedDay?.work_date === d.work_date ? 'selected' : ''}>${d.work_date} (${d.code === 'PERLU_PEMERIKSAAN_HR' ? 'HR?' : d.code}${d.is_confirmed ? ' ✓' : ''})</option>`).join('')}
                        </select>
                        <select class="input ops-rev-code" data-nik="${esc(row.employee_no)}" aria-label="Kode status untuk ${esc(row.employee_name)}">
                          <option value="M">M</option>
                          <option value="T">T</option>
                          <option value="S">S</option>
                          <option value="SDR">SDR</option>
                          <option value="I">I</option>
                          <option value="ITB">ITB</option>
                          <option value="A">A</option>
                          <option value="CT">CT</option>
                          <option value="L">L</option>
                        </select>
                        <button type="button" class="btn btn-sm btn-primary ops-rev-confirm" data-nik="${esc(row.employee_no)}">Konfirmasi</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div id="ops-staff-pager">${buildOpsPaginationHtml(staffPaged)}</div>
      </div>
    </div>
  `;

  bindOpsPagination(host.querySelector('#ops-staff-pager'), staffPaged, (nextPage, nextSize) => {
    host.dataset.staffPage = String(nextPage);
    host.dataset.staffPageSize = String(nextSize);
    renderStaffManagementView(host, ctx);
  });

  host.querySelector('#ops-staff-period')?.addEventListener('change', e => {
    host.dataset.staffPeriod = e.target.value || '2026-11';
    host.dataset.staffPage = '1';
    renderStaffManagementView(host, ctx);
  });

  host.querySelector('#ops-staff-export')?.addEventListener('click', async () => {
    const aoa = [
      ['NIK', 'Nama', 'Departemen', 'M', 'T', 'S+I', 'Absen Potong', 'CT', 'Total Hadir', 'Hari Dibayar', 'Kehadiran %', 'Evaluasi'],
      ...computed.summaries.map(r => [
        r.employee_no, r.employee_name, r.department, r.counts.M, r.counts.T,
        r.counts.S + r.counts.I, r.absenPotong, r.counts.CT, r.totalHadir,
        r.effectivePaidDays, `${r.presencePct}%`, r.evalStatus
      ])
    ];
    await exportSheetXlsx(`Rekap_Absensi_Staff_${periodKey}.xlsx`, 'Staff Attendance', aoa);
  });

  host.querySelectorAll('.ops-rev-confirm').forEach(btn => {
    btn.addEventListener('click', async () => {
      const nik = btn.dataset.nik;
      const dateSel = host.querySelector(`.ops-rev-date[data-nik="${nik}"]`);
      const codeSel = host.querySelector(`.ops-rev-code[data-nik="${nik}"]`);
      const workDate = dateSel?.value;
      const finalCode = codeSel?.value || 'M';
      if (!workDate) return;
      const rev = {
        id: `rev-${compactNik(nik)}-${workDate}`,
        period_key: periodKey,
        employee_no: nik,
        work_date: workDate,
        final_code: finalCode,
        reason: `Dikonfirmasi HR (${finalCode})`,
        is_confirmed: true,
        confirmed_by: ctx.profile?.username || 'ADMIN',
        confirmed_at: new Date().toISOString()
      };
      if (ctx.isDemoMode) {
        const idx = state.staffReviews.findIndex(r => compactNik(r.employee_no) === compactNik(nik) && r.work_date === workDate);
        if (idx >= 0) state.staffReviews[idx] = rev;
        else state.staffReviews.push(rev);
        saveDemoOpsState(state);
      } else {
        const { error } = await ctx.supabase.from('staff_attendance_reviews').upsert(rev, { onConflict: 'employee_no,work_date' });
        if (error) {
          showInlineBanner(host, `Gagal menyimpan koreksi absensi: ${error.message}`, 'error');
          return;
        }
        invalidateOpsStateCache();
      }
      await renderStaffManagementView(host, ctx);
      showInlineBanner(host, `Status ${nik} tanggal ${workDate} dikunci sebagai ${finalCode}.`, 'ok');
    });
  });
}

export async function renderStaffReportsView(host, ctx) {
  const state = await loadOpsState(ctx);
  const periodKey = host.dataset.staffRepPeriod || '2026-11';
  const employees = getAllKnownEmployees(ctx).filter(e => !/ADMIN/i.test(e.employee_no || ''));
  const computed = processStaffAttendancePeriod({
    periodKey,
    employees,
    rawEvents: state.rawEvents,
    calendarDays: state.calendarDays,
    holidaySchedules: state.conditionalHolidays,
    leaveBalances: state.cutiBalances,
    existingReviews: state.staffReviews,
    settings: state.settings
  });

  host.innerHTML = `
    <div class="card ops-card">
      <div class="ops-head">
        <div>
          <h2>Laporan Absensi &amp; Kedisiplinan Staff</h2>
          <p class="ops-sub">Periode ${esc(computed.window.startDate)} s/d ${esc(computed.window.endDate)} · Ambang SP: &gt; ${(state.settings.attendance.warningAbsenceThreshold * 100).toFixed(1)}% bobot ketidakhadiran.</p>
        </div>
        <div class="ops-actions">
          <input id="ops-srep-period" type="month" class="input" value="${esc(periodKey)}" aria-label="Pilih bulan laporan staff">
          <button type="button" class="btn btn-secondary" id="ops-srep-print">Cetak / PDF</button>
          <button type="button" class="btn btn-primary" id="ops-srep-xlsx">Download Excel</button>
        </div>
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table>
          <thead>
            <tr>
              <th>NIK</th>
              <th>Nama</th>
              <th>Dept</th>
              <th class="num">Jadwal</th>
              <th class="num">Total Hadir</th>
              <th class="num">Absen Potong</th>
              <th class="num">Bobot Tidak Hadir</th>
              <th class="num">Total Potongan Hari</th>
              <th class="num">Hari Dibayar</th>
              <th class="num">Kehadiran %</th>
              <th>Saran Evaluasi</th>
            </tr>
          </thead>
          <tbody>
            ${computed.summaries.map(r => `
              <tr>
                <td><code>${esc(r.employee_no)}</code></td>
                <td><b>${esc(r.employee_name)}</b></td>
                <td>${esc(r.department)}</td>
                <td class="num">${r.scheduled_days}</td>
                <td class="num">${r.totalHadir}</td>
                <td class="num">${r.absenPotong}</td>
                <td class="num">${r.bobotKetidakhadiran}</td>
                <td class="num">${r.totalPotonganHari}</td>
                <td class="num"><b>${r.effectivePaidDays}</b></td>
                <td class="num">${r.presencePct}%</td>
                <td><span class="pill ${r.evalStatus === 'Baik' ? 'green' : 'danger'}">${esc(r.evalStatus)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  host.querySelector('#ops-srep-period')?.addEventListener('change', e => {
    host.dataset.staffRepPeriod = e.target.value || '2026-11';
    renderStaffReportsView(host, ctx);
  });

  host.querySelector('#ops-srep-xlsx')?.addEventListener('click', async () => {
    const aoa = [
      ['NIK', 'Nama', 'Dept', 'Jadwal', 'Total Hadir', 'Absen Potong', 'Bobot Tidak Hadir', 'Potongan Hari', 'Hari Dibayar', 'Kehadiran %', 'Evaluasi'],
      ...computed.summaries.map(r => [
        r.employee_no, r.employee_name, r.department, r.scheduled_days,
        r.totalHadir, r.absenPotong, r.bobotKetidakhadiran, r.totalPotonganHari,
        r.effectivePaidDays, `${r.presencePct}%`, r.evalStatus
      ])
    ];
    await exportSheetXlsx(`Laporan_Kedisiplinan_Staff_${periodKey}.xlsx`, 'Laporan Staff', aoa);
  });

  host.querySelector('#ops-srep-print')?.addEventListener('click', () => {
    openPrintHtml(`Laporan Absensi Staff - ${periodKey}`, `
      <h2>PT. MITRA BINAMANDIRI MAKMUR — LAPORAN ABSENSI STAFF</h2>
      <div class="meta">Periode: ${esc(computed.window.startDate)} s/d ${esc(computed.window.endDate)}</div>
      ${host.querySelector('.table-wrap').innerHTML}
    `);
  });
}

// ============================================================================
// 5. DRIVERS: MANUAL SCHEDULE, ATTENDANCE RECONCILIATION & REPORTS
// ============================================================================
export async function renderDriverScheduleView(host, ctx) {
  const state = await loadOpsState(ctx);
  const allEmployees = getAllKnownEmployees(ctx);
  const eligibleDrivers = getEligibleDrivers(allEmployees, state.settings);
  const driverList = eligibleDrivers.length ? eligibleDrivers : getEligibleDrivers(SEED_DRIVERS, state.settings);
  const validation = validateDriverSchedules(state.driverSchedules, allEmployees, state.settings);
  const drvCfg = state.settings.driver;

  const preDate = host.dataset.dsPreDate || '2026-11-14';
  const preDriver = host.dataset.dsPreDriver || driverList[0]?.employee_no || '';
  const preSection = host.dataset.dsPreSection || drvCfg.sections[0] || 'Support';

  host.innerHTML = `
    <div class="ops-stack">
      <div class="card ops-card">
        <div class="ops-head">
          <div>
            <h2>Manual Driver Schedule</h2>
            <p class="ops-sub">Hanya menampilkan karyawan jabatan <b>${esc(drvCfg.requiredPositionKeyword)}</b> (dikecualikan: <code>${esc(drvCfg.excludedDriverNames.join(', '))}</code>). Satu hari dapat memiliki lebih dari satu kegiatan maupun lebih dari satu blok departemen (<b>Support, Indoor, Outdoor, Radin</b>) yang langsung terhubung ke Time Checksheet.</p>
          </div>
        </div>
        ${validation.conflicts.length || validation.nikWarnings.length ? `
          <div class="ops-flash-banner ops-flash-warn" role="alert">
            <b>Peringatan Validasi:</b> ${validation.conflicts.length} konflik jam bentrok, ${validation.nikWarnings.length} catatan NIK.
            ${validation.conflicts.map(c => `<div>• ${esc(c.message)}</div>`).join('')}
            ${validation.nikWarnings.map(w => `<div>• ${esc(w.message)}</div>`).join('')}
          </div>
        ` : ''}

        <div class="ops-form-grid">
          <label class="ops-field"><span>Tanggal</span><input id="ops-ds-date" type="date" class="input" value="${esc(preDate)}"></label>
          <label class="ops-field"><span>Nama Driver (Jabatan SOPIR, excl. SIKUS)</span>
            <select id="ops-ds-driver" class="input">
              ${driverList.map(d => `<option value="${esc(d.employee_no)}" ${d.employee_no === preDriver ? 'selected' : ''}>${esc(d.full_name)} (${esc(d.employee_no)})</option>`).join('')}
            </select>
          </label>
          <label class="ops-field"><span>Departemen</span>
            <select id="ops-ds-section" class="input">
              ${drvCfg.sections.map(sec => `<option value="${esc(sec)}" ${sec === preSection ? 'selected' : ''}>${esc(sec.toUpperCase())}</option>`).join('')}
            </select>
          </label>
          <label class="ops-field"><span>No. Polisi / Catatan (Opsional)</span><input id="ops-ds-nopol" type="text" class="input" placeholder="N 8142 WA / Catatan"></label>
        </div>

        <div class="drv-activities-box">
          <div class="drv-activities-head">
            <b>Daftar Kegiatan &amp; Estimasi Jam</b>
            <button type="button" class="btn btn-sm btn-secondary" id="ops-ds-add-act">+ Tambah Kegiatan</button>
          </div>
          <div id="ops-ds-act-list" class="drv-act-list">
            <div class="drv-act-row">
              <label class="ops-field"><span>Jam Mulai</span><input type="time" class="input drv-act-start" value="07:00"></label>
              <label class="ops-field"><span>Jam Selesai</span><input type="time" class="input drv-act-end" value="09:30"></label>
              <label class="ops-check drv-act-home-wrap"><input type="checkbox" class="drv-act-home"> <span>s/d Pulang</span></label>
              <label class="ops-field drv-act-desc-wrap"><span>Kegiatan</span><input type="text" class="input drv-act-desc" placeholder="Contoh: Mengantar Direksi"></label>
              <button type="button" class="btn btn-sm btn-secondary drv-act-del" title="Hapus kegiatan">Hapus</button>
            </div>
          </div>
          <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px">
            <button type="button" class="btn btn-primary" id="ops-ds-add">Simpan Jadwal Departemen</button>
          </div>
        </div>
      </div>

      <div class="card ops-card">
        <h3>Daftar Jadwal Manual Driver (${state.driverSchedules.length})</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Tanggal</th><th>Driver</th><th>Departemen</th><th>Rincian Kegiatan &amp; Estimasi Jam</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              ${state.driverSchedules.map(s => {
                const acts = normalizeScheduleActivities(s);
                const actsHtml = acts.map(a => `
                  <div class="drv-act-pill-line">
                    <code>${esc(a.start_time)} – ${a.is_until_home ? 'Pulang' : esc(a.end_time)}</code>
                    <span>${esc(a.activity || '-')}</span>
                  </div>
                `).join('');
                return `
                  <tr>
                    <td><b>${esc(s.work_date)}</b></td>
                    <td><b>${esc(s.driver_name)}</b><br><small><code>${esc(s.employee_no)}</code></small></td>
                    <td><span class="pill">${esc(String(s.section || 'Support').toUpperCase())}</span></td>
                    <td>${actsHtml}</td>
                    <td>
                      <div class="ops-actions">
                        <button type="button" class="btn btn-sm btn-secondary ops-ds-add-dept" data-date="${esc(s.work_date)}" data-nik="${esc(s.employee_no)}">+ Dept Lain</button>
                        <button type="button" class="btn btn-sm btn-secondary ops-ds-del" data-id="${esc(s.id)}">Hapus</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const actList = host.querySelector('#ops-ds-act-list');
  const bindActRow = rowEl => {
    const chk = rowEl.querySelector('.drv-act-home');
    const endInp = rowEl.querySelector('.drv-act-end');
    chk?.addEventListener('change', () => {
      if (endInp) endInp.disabled = chk.checked;
    });
    rowEl.querySelector('.drv-act-del')?.addEventListener('click', () => {
      if (actList.querySelectorAll('.drv-act-row').length > 1) rowEl.remove();
    });
  };
  actList.querySelectorAll('.drv-act-row').forEach(bindActRow);

  host.querySelector('#ops-ds-add-act')?.addEventListener('click', () => {
    const rows = actList.querySelectorAll('.drv-act-row');
    const lastEnd = rows[rows.length - 1]?.querySelector('.drv-act-end')?.value || '13:00';
    const row = document.createElement('div');
    row.className = 'drv-act-row';
    row.innerHTML = `
      <label class="ops-field"><span>Jam Mulai</span><input type="time" class="input drv-act-start" value="${esc(lastEnd)}"></label>
      <label class="ops-field"><span>Jam Selesai</span><input type="time" class="input drv-act-end" value=""></label>
      <label class="ops-check drv-act-home-wrap"><input type="checkbox" class="drv-act-home" checked> <span>s/d Pulang</span></label>
      <label class="ops-field drv-act-desc-wrap"><span>Kegiatan</span><input type="text" class="input drv-act-desc" placeholder="Contoh: Bantu kirim barang"></label>
      <button type="button" class="btn btn-sm btn-secondary drv-act-del" title="Hapus kegiatan">Hapus</button>
    `;
    row.querySelector('.drv-act-end').disabled = true;
    actList.appendChild(row);
    bindActRow(row);
  });

  host.querySelector('#ops-ds-add')?.addEventListener('click', async () => {
    const work_date = host.querySelector('#ops-ds-date')?.value;
    const employee_no = host.querySelector('#ops-ds-driver')?.value;
    const section = host.querySelector('#ops-ds-section')?.value || 'Support';
    const notes = host.querySelector('#ops-ds-nopol')?.value?.trim() || '';
    if (!work_date || !employee_no) return;

    const activities = [...actList.querySelectorAll('.drv-act-row')].map(r => {
      const start_time = r.querySelector('.drv-act-start')?.value || '07:00';
      const is_until_home = Boolean(r.querySelector('.drv-act-home')?.checked);
      const end_time = is_until_home ? '' : (r.querySelector('.drv-act-end')?.value || '');
      const activity = r.querySelector('.drv-act-desc')?.value?.trim() || '';
      return { start_time, end_time, is_until_home, activity };
    }).filter(a => a.start_time);

    if (!activities.length) {
      showInlineBanner(host, 'Tambahkan minimal 1 kegiatan dengan jam mulai.', 'error');
      return;
    }

    const emp = driverList.find(d => d.employee_no === employee_no);
    const firstStart = activities[0].start_time;
    const lastAct = activities[activities.length - 1];
    const lastEnd = lastAct.is_until_home ? '' : lastAct.end_time;

    const newRow = {
      id: `ds-${Date.now()}`,
      work_date,
      employee_no,
      driver_name: emp?.full_name || employee_no,
      section,
      start_time: firstStart,
      end_time: lastEnd,
      activities,
      destination: activities.map(a => a.activity).filter(Boolean).join(' + '),
      vehicle_no: '',
      notes
    };

    const nextCheck = validateDriverSchedules([...state.driverSchedules, newRow], allEmployees, state.settings);
    if (!nextCheck.valid) {
      showInlineBanner(host, nextCheck.conflicts[0]?.message || 'Jadwal bentrok pada jam yang sama.', 'error');
      return;
    }

    if (ctx.isDemoMode) {
      state.driverSchedules = [newRow, ...state.driverSchedules];
      saveDemoOpsState(state);
    } else {
      const { error } = await ctx.supabase.from('driver_daily_schedules').insert(newRow);
      if (error) {
        showInlineBanner(host, `Gagal menyimpan jadwal driver: ${error.message}`, 'error');
        return;
      }
      invalidateOpsStateCache();
    }
    delete host.dataset.dsPreDate;
    delete host.dataset.dsPreDriver;
    delete host.dataset.dsPreSection;
    await renderDriverScheduleView(host, ctx);
    showInlineBanner(host, `Jadwal ${newRow.driver_name} (${newRow.section}, ${newRow.work_date}) berhasil disimpan.`, 'ok');
  });

  host.querySelectorAll('.ops-ds-add-dept').forEach(btn => {
    btn.addEventListener('click', () => {
      host.dataset.dsPreDate = btn.dataset.date || '2026-11-14';
      host.dataset.dsPreDriver = btn.dataset.nik || '';
      host.dataset.dsPreSection = 'Radin';
      renderDriverScheduleView(host, ctx);
      host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  host.querySelectorAll('.ops-ds-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (ctx.isDemoMode) {
        state.driverSchedules = state.driverSchedules.filter(s => s.id !== id);
        saveDemoOpsState(state);
      } else {
        const { error } = await ctx.supabase.from('driver_daily_schedules').delete().eq('id', id);
        if (error) {
          showInlineBanner(host, `Gagal menghapus jadwal driver: ${error.message}`, 'error');
          return;
        }
        invalidateOpsStateCache();
      }
      renderDriverScheduleView(host, ctx);
    });
  });
}

export async function renderDriverManagementView(host, ctx) {
  const state = await loadOpsState(ctx);
  const allEmployees = getAllKnownEmployees(ctx);
  const eligibleDrivers = getEligibleDrivers(allEmployees, state.settings);
  const monthKey = host.dataset.drvRecMonth || '2026-11';
  const halfPeriod = host.dataset.drvRecHalf || 'P1';
  const editingKey = host.dataset.drvEditKey || '';

  const rec = reconcileDriverSchedulesAndAttendance({
    monthKey,
    halfPeriod,
    drivers: eligibleDrivers,
    schedules: state.driverSchedules,
    rawEvents: state.rawEvents,
    reconciliations: state.driverReconciliations || [],
    calendarDays: state.calendarDays,
    settings: state.settings
  });

  const calMap = new Map((state.calendarDays || []).map(c => [c.cal_date, c]));
  const editingRow = editingKey ? rec.rows.find(r => r.key === editingKey) : null;

  const addOneDay = isoDate => {
    const dt = new Date(`${isoDate}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  };

  host.innerHTML = `
    <div class="ops-stack">
      <div class="card ops-card">
        <div class="ops-head">
          <div>
            <h2>Cocokan Dengan Absensi &amp; Penanganan Case Abnormal Driver</h2>
            <p class="ops-sub">Mencocokkan Jadwal Manual Driver (<b>S/I/O/R</b>) dengan data tap absensi untuk menghitung Hadir, Lembur (floor 0.5j, &gt;8j potong 1j), dan kasus lembur <b>lewat hari</b> sebelum masuk ke Report.</p>
          </div>
          <div class="ops-actions">
            <input type="month" id="ops-drv-rec-month" class="input" value="${esc(monthKey)}" aria-label="Pilih bulan rekonsiliasi driver">
            <select id="ops-drv-rec-half" class="input" aria-label="Pilih periode rekonsiliasi">
              <option value="P1" ${halfPeriod === 'P1' ? 'selected' : ''}>Periode 1 – 15</option>
              <option value="P2" ${halfPeriod === 'P2' ? 'selected' : ''}>Periode 16 – Akhir Bulan</option>
            </select>
          </div>
        </div>
      </div>

      ${rec.anomalies.length ? `
        <div class="card ops-card drv-anomaly-card" role="alert">
          <div class="ops-head" style="margin-bottom:8px">
            <div>
              <h3 class="text-danger">Data Janggal Terdeteksi (${rec.anomalies.length}) — Segera Cek Sebelum Cetak Report</h3>
              <p class="ops-sub">Contoh: ada Clock-In tetapi Clock-Out kosong karena lembur hingga lewat hari berikutnya.</p>
            </div>
          </div>
          <div class="drv-anomaly-list">
            ${rec.anomalies.map(a => `
              <div class="drv-anomaly-item">
                <div>
                  <span class="pill danger">${esc(a.anomalyType)}</span>
                  <b>${esc(a.driver_name)}</b> (${esc(a.work_date)}) · Tap: <code>${esc(a.punchIn || '-')}</code> s/d <code>${esc(a.punchOut || 'KOSONG')}</code>
                  <div class="ops-sub">${esc(a.anomalyMessage)}</div>
                </div>
                <button type="button" class="btn btn-sm btn-primary ops-drv-open-abnormal" data-key="${esc(a.key)}">Atur Case Abnormal</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : `
        <div class="ops-flash-banner ops-flash-ok">Semua data jadwal dan absensi driver pada periode <b>${esc(rec.window.headerLabel)}</b> telah bersih / terkonfirmasi tanpa anomali.</div>
      `}

      ${editingRow ? `
        <div class="card ops-card drv-abnormal-editor">
          <div class="ops-head">
            <div>
              <h3>Kalkulator &amp; Koreksi Case Abnormal — ${esc(editingRow.driver_name)} (${esc(editingRow.work_date)})</h3>
              <p class="ops-sub">Isi jam masuk &amp; tanggal/jam pulang aktual (mendukung lembur hingga lewat hari berikutnya).</p>
            </div>
            <button type="button" class="btn btn-sm btn-secondary" id="ops-abn-cancel">Tutup Editor</button>
          </div>
          <div class="ops-form-grid">
            <label class="ops-field"><span>Jam Masuk Aktual</span><input id="ops-abn-in" type="time" class="input" value="${esc(editingRow.effectiveIn || '06:30')}"></label>
            <label class="ops-field"><span>Tanggal Pulang Aktual</span><input id="ops-abn-out-date" type="date" class="input" value="${esc(editingRow.checkoutDate || editingRow.work_date)}"></label>
            <label class="ops-field"><span>Jam Pulang Aktual</span><input id="ops-abn-out" type="time" class="input" value="${esc(editingRow.effectiveOut || '02:00')}"></label>
            <div class="ops-field ops-field-end">
              <button type="button" class="btn btn-secondary" id="ops-abn-nextday" data-next="${esc(addOneDay(editingRow.work_date))}">Set Pulang Lewat Hari (+1)</button>
            </div>
            <label class="ops-field" style="grid-column:span 2"><span>Catatan / Alasan Case Abnormal</span><input id="ops-abn-note" type="text" class="input" value="${esc(editingRow.reconciliation?.notes || 'Lembur pengantaran luar kota lewat hari')}"></label>
          </div>
          <div id="ops-abn-preview" class="drv-abn-preview-box"></div>
          <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px">
            <button type="button" class="btn btn-primary" id="ops-abn-save">Simpan &amp; Selesaikan Case Abnormal</button>
          </div>
        </div>
      ` : ''}

      <div class="card ops-card">
        <h3>Hasil Pencocokan Harian (${esc(rec.window.headerLabel)})</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Driver</th>
                <th>Jadwal Manual (Dept)</th>
                <th>Tap Absensi</th>
                <th>Jam Hitungan</th>
                <th class="num">Hadir</th>
                <th class="num">Lembur</th>
                <th class="num">Estimasi Upah</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${rec.rows.length ? rec.rows.map(r => {
                const deptSummary = r.schedules.map(s => `${s.section} (${s.start_time || '-'}-${s.end_time || 'Pulang'})`).join(' + ') || '-';
                return `
                  <tr>
                    <td><b>${esc(r.work_date)}</b><br><small>${esc(r.metrics.dayRule.dayLabel)}</small></td>
                    <td><b>${esc(r.driver_name)}</b><br><small><code>${esc(r.employee_no)}</code></small></td>
                    <td><small>${esc(deptSummary)}</small></td>
                    <td><code>${esc(r.punchIn || '-')}</code> – <code>${esc(r.punchOut || '-')}</code></td>
                    <td>
                      <b>${esc(r.effectiveIn || '-')} – ${esc(r.effectiveOut || '-')}</b>
                      ${r.isOvernight ? `<span class="pill gold">Lewat Hari (${esc(r.checkoutDate)})</span>` : ''}
                    </td>
                    <td class="num">${r.metrics.presentDays} hr<br><small>(${r.metrics.normalHours}j)</small></td>
                    <td class="num"><b>${r.metrics.overtimeHours} j</b>${r.metrics.breakDeductionHours ? `<br><small>pot. ${r.metrics.breakDeductionHours}j</small>` : ''}</td>
                    <td class="num"><b>${fmtIdr(r.metrics.normalPay + r.metrics.overtimePay)}</b></td>
                    <td>
                      ${r.anomalyType
                        ? `<span class="pill danger">${esc(r.anomalyType)}</span>`
                        : (r.isResolved ? '<span class="pill green">Abnormal Resolved</span>' : '<span class="pill green">Cocok</span>')}
                    </td>
                    <td><button type="button" class="btn btn-sm btn-secondary ops-drv-open-abnormal" data-key="${esc(r.key)}">${r.anomalyType ? 'Perbaiki' : 'Adjust'}</button></td>
                  </tr>
                `;
              }).join('') : '<tr><td colspan="10" class="empty">Belum ada jadwal maupun data absensi driver pada periode ini.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  host.querySelector('#ops-drv-rec-month')?.addEventListener('change', e => {
    host.dataset.drvRecMonth = e.target.value || '2026-11';
    delete host.dataset.drvEditKey;
    renderDriverManagementView(host, ctx);
  });
  host.querySelector('#ops-drv-rec-half')?.addEventListener('change', e => {
    host.dataset.drvRecHalf = e.target.value || 'P1';
    delete host.dataset.drvEditKey;
    renderDriverManagementView(host, ctx);
  });
  host.querySelectorAll('.ops-drv-open-abnormal').forEach(btn => {
    btn.addEventListener('click', () => {
      host.dataset.drvEditKey = btn.dataset.key;
      renderDriverManagementView(host, ctx);
    });
  });
  host.querySelector('#ops-abn-cancel')?.addEventListener('click', () => {
    delete host.dataset.drvEditKey;
    renderDriverManagementView(host, ctx);
  });

  if (editingRow) {
    const inEl = host.querySelector('#ops-abn-in');
    const outDateEl = host.querySelector('#ops-abn-out-date');
    const outEl = host.querySelector('#ops-abn-out');
    const noteEl = host.querySelector('#ops-abn-note');
    const prevEl = host.querySelector('#ops-abn-preview');

    const updateAbnPreview = () => {
      const m = computeDriverDayMetrics({
        workDate: editingRow.work_date,
        startTime: inEl.value,
        endTime: outEl.value,
        checkoutDate: outDateEl.value,
        isOvernight: outDateEl.value > editingRow.work_date,
        calendarMap: calMap,
        settings: state.settings
      });
      prevEl.innerHTML = `
        <b>Simulasi Hitungan Otomatis:</b> Total Durasi <b>${(m.totalMinutes / 60).toFixed(2)} jam</b> &rarr;
        Hadir <b>${m.presentDays} hari (${m.normalHours}j)</b> = <b>${fmtIdr(m.normalPay)}</b> ·
        Lembur Bersih <b>${m.overtimeHours} jam</b>${m.breakDeductionHours ? ` (dikurangi istirahat ${m.breakDeductionHours}j)` : ''} = <b>${fmtIdr(m.overtimePay)}</b> ·
        Total = <b>${fmtIdr(m.normalPay + m.overtimePay)}</b>
      `;
    };

    updateAbnPreview();
    [inEl, outDateEl, outEl].forEach(el => el?.addEventListener('input', updateAbnPreview));

    host.querySelector('#ops-abn-nextday')?.addEventListener('click', btnEv => {
      outDateEl.value = btnEv.currentTarget.dataset.next;
      updateAbnPreview();
    });

    host.querySelector('#ops-abn-save')?.addEventListener('click', async () => {
      const row = {
        id: `drec-${compactNik(editingRow.employee_no)}-${editingRow.work_date}`,
        employee_no: editingRow.employee_no,
        driver_name: editingRow.driver_name,
        work_date: editingRow.work_date,
        checkout_date: outDateEl.value || editingRow.work_date,
        actual_check_in: inEl.value,
        actual_check_out: outEl.value,
        is_overnight: (outDateEl.value || editingRow.work_date) > editingRow.work_date,
        resolved: true,
        notes: noteEl.value?.trim() || 'Resolved HR',
        updated_at: new Date().toISOString()
      };

      const nextList = [...(state.driverReconciliations || [])];
      const idx = nextList.findIndex(x => compactNik(x.employee_no) === compactNik(row.employee_no) && x.work_date === row.work_date);
      if (idx >= 0) nextList[idx] = row;
      else nextList.push(row);
      state.driverReconciliations = nextList;

      if (ctx.isDemoMode) {
        saveDemoOpsState(state);
      } else {
        try {
          const { error } = await ctx.supabase.from('driver_attendance_reconciliations').upsert(row, { onConflict: 'employee_no,work_date' });
          if (error) throw error;
          invalidateOpsStateCache();
        } catch (err) {
          showInlineBanner(host, `Gagal menyimpan koreksi abnormal ke Supabase: ${err?.message || err}`, 'error');
          return;
        }
      }
      delete host.dataset.drvEditKey;
      await renderDriverManagementView(host, ctx);
      showInlineBanner(host, `Case abnormal ${row.driver_name} (${row.work_date}) berhasil diselesaikan dan siap masuk ke Report.`, 'ok');
    });
  }
}

export async function renderDriverReportsView(host, ctx) {
  return renderDriverReportsModule(host, ctx, {
    loadOpsState,
    saveDemoOpsState,
    invalidateOpsStateCache,
    getAllKnownEmployees,
    showInlineBanner,
    exportSheetXlsx,
    OPS_SETTINGS_KEY,
    DRIVER_ADJUSTMENTS_KEY
  });
}

// ============================================================================
// 6. STATIONERY & ATK (INPUT, STOCK MANAGEMENT, CONSUMPTION & PURCHASE PLAN)
// ============================================================================
export async function renderStationeryInputView(host, ctx) {
  const state = await loadOpsState(ctx);
  const slocs = state.settings.stationery.canonicalSlocs;
  const aliases = state.settings.stationery.slocAliases;

  host.innerHTML = `
    <div class="ops-stack">
      <div class="card ops-card">
        <div class="ops-head">
          <div>
            <h2>Stationery / ATK — Input Barang Masuk &amp; Keluar</h2>
            <p class="ops-sub">Setiap transaksi tervalidasi saldo akhir <b>&ge; 0</b> (stok minus diblokir) dan SLOC langsung dipetakan ke nama kanonik (<code>GUDANG &rarr; INVENTORY &amp; GUDANG</code>, dll).</p>
          </div>
        </div>
        <div class="ops-form-grid">
          <label class="ops-field"><span>Tanggal</span><input id="ops-atk-date" type="date" class="input" value="2026-11-23"></label>
          <label class="ops-field"><span>Jenis Transaksi</span>
            <select id="ops-atk-type" class="input">
              <option value="OUT">OUT — Barang Keluar (Pemakaian SLOC)</option>
              <option value="IN">IN — Barang Masuk (Pembelian / Stok)</option>
              <option value="ADJUSTMENT">ADJUSTMENT — Stock Opname</option>
            </select>
          </label>
          <label class="ops-field"><span>Item ATK (${state.stationeryItems.length} Master Item)</span>
            <select id="ops-atk-item" class="input">
              ${state.stationeryItems.map(it => `<option value="${esc(it.id)}">${esc(it.item_name)} (Stok: ${it.current_stock} ${esc(it.unit)})</option>`).join('')}
            </select>
          </label>
          <label class="ops-field"><span>Qty (Adjustment boleh minus jika opname)</span><input id="ops-atk-qty" type="number" class="input" value="1"></label>
          <label class="ops-field"><span>Departemen / SLOC</span>
            <select id="ops-atk-sloc" class="input">
              ${slocs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
              ${Object.keys(aliases).map(a => `<option value="${esc(a)}">${esc(a)} (Alias &rarr; ${esc(aliases[a])})</option>`).join('')}
            </select>
          </label>
          <label class="ops-field"><span>No. Referensi</span><input id="ops-atk-ref" type="text" class="input" placeholder="PO / BON"></label>
          <label class="ops-field"><span>Keterangan / Alasan</span><input id="ops-atk-notes" type="text" class="input" placeholder="Wajib diisi untuk Adjustment"></label>
          <div class="ops-field ops-field-end"><button type="button" class="btn btn-primary" id="ops-atk-submit">Catat Transaksi</button></div>
        </div>
      </div>

      <div class="card ops-card">
        <h3>Riwayat Buku Besar Mutasi ATK (Terbaru)</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Tanggal</th><th>Tipe</th><th>Item</th><th class="num">Qty</th><th>Satuan</th><th>SLOC Kanonik (Raw)</th><th class="num">Saldo Akhir</th><th>Catatan</th></tr></thead>
            <tbody>
              ${state.stationeryMovements.slice(0, 40).map(mv => `
                <tr>
                  <td>${esc(mv.tx_date)}</td>
                  <td><span class="pill ${mv.tx_type === 'IN' ? 'green' : (mv.tx_type === 'OUT' ? 'gold' : '')}">${esc(mv.tx_type)}</span></td>
                  <td><b>${esc(mv.item_name)}</b></td>
                  <td class="num">${mv.qty}</td>
                  <td>${esc(mv.unit)}</td>
                  <td>${esc(mv.sloc_canonical)} ${mv.sloc_raw !== mv.sloc_canonical ? `<small>(${esc(mv.sloc_raw)})</small>` : ''}</td>
                  <td class="num">${mv.balance_after ?? '-'}</td>
                  <td><small>${esc(mv.notes || mv.reference_no || '-')}</small></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  host.querySelector('#ops-atk-submit')?.addEventListener('click', async () => {
    const tx = {
      tx_date: host.querySelector('#ops-atk-date')?.value,
      tx_type: host.querySelector('#ops-atk-type')?.value || 'OUT',
      item_id: host.querySelector('#ops-atk-item')?.value,
      qty: Number(host.querySelector('#ops-atk-qty')?.value),
      sloc_raw: host.querySelector('#ops-atk-sloc')?.value || 'HR GA',
      reference_no: host.querySelector('#ops-atk-ref')?.value?.trim() || '',
      notes: host.querySelector('#ops-atk-notes')?.value?.trim() || '',
      created_by: ctx.profile?.username || 'ADMIN'
    };
    try {
      const res = applyStationeryTransaction({
        items: state.stationeryItems,
        ledger: state.stationeryMovements,
        tx,
        settings: state.settings
      });
      if (ctx.isDemoMode) {
        state.stationeryItems = res.items;
        state.stationeryMovements = res.ledger;
        saveDemoOpsState(state);
      } else {
        const { error } = await ctx.supabase.rpc('record_stationery_transaction', {
          p_item_id: res.entry.item_id,
          p_tx_type: res.entry.tx_type,
          p_qty: res.entry.qty,
          p_tx_date: res.entry.tx_date,
          p_sloc_raw: res.entry.sloc_raw,
          p_sloc_canonical: res.entry.sloc_canonical,
          p_reference_no: res.entry.reference_no,
          p_notes: res.entry.notes,
          p_created_by: res.entry.created_by
        });
        if (error) throw error;
        invalidateOpsStateCache();
      }
      await renderStationeryInputView(host, ctx);
      showInlineBanner(host, `Transaksi ${res.entry.tx_type} ${res.entry.item_name} (${res.entry.qty}) tersimpan. Saldo baru: ${res.entry.balance_after}.`, 'ok');
    } catch (err) {
      showInlineBanner(host, err?.message || 'Transaksi ditolak.', 'error');
    }
  });
}

export async function renderStationeryStockView(host, ctx) {
  const state = await loadOpsState(ctx);
  host.innerHTML = `
    <div class="card ops-card">
      <div class="ops-head">
        <div>
          <h2>Master Item &amp; Saldo Stok ATK (${state.stationeryItems.length} Item)</h2>
          <p class="ops-sub">Seluruh satuan diperbaiki eksak (<code>PACK/PCS/RIM</code>) sehingga tidak pernah terjadi ketidakcocokan VLOOKUP perkiraan.</p>
        </div>
        <div class="ops-actions">
          <input id="ops-stk-search" type="search" class="input" value="${esc(host.dataset.atkSearch || '')}" placeholder="Cari nama atau kode ATK..." aria-label="Cari item ATK">
          <button type="button" class="btn btn-secondary" id="ops-stk-export">Export Stok XLSX</button>
        </div>
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table>
          <thead><tr><th>Kode</th><th>Nama Item</th><th>Satuan</th><th class="num">Stok Awal</th><th class="num">Stok Saat Ini</th><th class="num">Min Stok</th><th>Status</th></tr></thead>
          <tbody id="ops-stk-tbody"></tbody>
        </table>
      </div>
      <div id="ops-stk-pager"></div>
    </div>
  `;

  const paintStockTable = () => {
    const query = (host.dataset.atkSearch || '').toLowerCase();
    const filtered = state.stationeryItems.filter(it =>
      !query || it.item_name.toLowerCase().includes(query) || it.item_code.toLowerCase().includes(query)
    );
    const stkPage = Number(host.dataset.atkPage || 1) || 1;
    const stkSizeRaw = host.dataset.atkPageSize || '50';
    const stkSize = stkSizeRaw === 'all' ? 'all' : (Number(stkSizeRaw) || 50);
    const paged = paginateRows(filtered, stkPage, stkSize);
    host.dataset.atkPage = String(paged.page);

    const tbody = host.querySelector('#ops-stk-tbody');
    if (tbody) {
      tbody.innerHTML = paged.items.length
        ? paged.items.map(it => `
            <tr>
              <td><code>${esc(it.item_code)}</code></td>
              <td><b>${esc(it.item_name)}</b></td>
              <td>${esc(it.unit)}</td>
              <td class="num">${it.opening_stock}</td>
              <td class="num"><b>${it.current_stock}</b></td>
              <td class="num">${it.min_stock}</td>
              <td>${it.current_stock <= 0 ? '<span class="pill danger">Kosong</span>' : (it.current_stock <= it.min_stock ? '<span class="pill gold">Menipis</span>' : '<span class="pill green">Aman</span>')}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="7" class="empty">Tidak ada item ATK yang cocok.</td></tr>';
    }
    const pagerEl = host.querySelector('#ops-stk-pager');
    if (pagerEl) {
      pagerEl.innerHTML = buildOpsPaginationHtml(paged);
      bindOpsPagination(pagerEl, paged, (nextPage, nextSize) => {
        host.dataset.atkPage = String(nextPage);
        host.dataset.atkPageSize = String(nextSize);
        paintStockTable();
      });
    }
  };

  paintStockTable();

  let stkSearchTimer = null;
  host.querySelector('#ops-stk-search')?.addEventListener('input', e => {
    host.dataset.atkSearch = e.target.value;
    host.dataset.atkPage = '1';
    clearTimeout(stkSearchTimer);
    stkSearchTimer = setTimeout(() => {
      paintStockTable();
    }, 140);
  });

  host.querySelector('#ops-stk-export')?.addEventListener('click', async () => {
    const aoa = [
      ['Kode', 'Nama Item', 'Satuan', 'Stok Awal', 'Stok Saat Ini', 'Min Stok'],
      ...state.stationeryItems.map(it => [it.item_code, it.item_name, it.unit, it.opening_stock, it.current_stock, it.min_stock])
    ];
    await exportSheetXlsx('Master_Stok_ATK.xlsx', 'Stok ATK', aoa);
  });
}

export async function renderStationeryReportsView(host, ctx) {
  const state = await loadOpsState(ctx);
  const report = buildStationeryReports({
    items: state.stationeryItems,
    ledger: state.stationeryMovements,
    monthKey: host.dataset.stkMonth || '',
    settings: state.settings
  });
  const topDepts = report.departmentConsumption.filter(d => d.outQty > 0).slice(0, 8);
  const maxDeptOut = Math.max(1, ...topDepts.map(d => d.outQty));

  host.innerHTML = `
    <div class="ops-stack">
      <div class="card ops-card">
        <div class="ops-head">
          <div>
            <h2>Stationery Consumption, Moving Speed &amp; Purchase Plan</h2>
            <p class="ops-sub">Horizon beli: <b>${report.horizonDays} hari</b> · Safety factor: <b>${state.settings.stationery.safetyStockMultiplier}x</b> · Fast moving &ge; ${state.settings.stationery.fastMovingMinOutQty} qty &amp; &ge; ${state.settings.stationery.fastMovingMinFreq}x keluar.</p>
          </div>
          <div class="ops-actions">
            <button type="button" class="btn btn-secondary" id="ops-srep-atk-print">Cetak Purchase Plan</button>
            <button type="button" class="btn btn-primary" id="ops-srep-atk-xlsx">Export Analisa ATK XLSX</button>
          </div>
        </div>
      </div>

      <div class="kpi-grid ops-kpi-4">
        <div class="card kpi-card"><div class="kpi-label">Total Item Aktif</div><div class="kpi-val">${report.totals.totalItems}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Total Keluar (Periode)</div><div class="kpi-val">${report.totals.totalOut}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Item Fast Moving</div><div class="kpi-val">${report.totals.fastCount}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Item Saran Beli</div><div class="kpi-val text-danger">${report.totals.purchaseItemCount}</div></div>
      </div>

      <div class="card ops-card">
        <h3>Konsumsi per Departemen / SLOC (Grafik Pemakaian)</h3>
        <div class="ops-svg-chart">
          ${topDepts.length ? `
            <svg viewBox="0 0 640 ${topDepts.length * 32 + 12}" class="ops-bar-svg" role="img" aria-label="Grafik pemakaian ATK per SLOC">
              ${topDepts.map((d, idx) => {
                const y = idx * 32 + 8;
                const w = Math.max(8, Math.round((d.outQty / maxDeptOut) * 340));
                return `
                  <text x="4" y="${y + 16}" font-size="11.5" fill="#1e293b">${esc(d.sloc)}</text>
                  <rect x="210" y="${y + 3}" width="${w}" height="18" rx="3" fill="#0d5c6b"></rect>
                  <text x="${218 + w}" y="${y + 16}" font-size="11.5" font-weight="600" fill="#0f172a">${d.outQty} (${d.freq}x)</text>
                `;
              }).join('')}
            </svg>
          ` : '<p class="ops-empty-hint">Belum ada pemakaian barang keluar pada periode filter.</p>'}
        </div>
      </div>

      <div class="card ops-card">
        <h3>Rencana Pengadaan ATK (Purchase Plan — Saran Beli)</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Kode</th><th>Nama Item</th><th>Satuan</th><th>Class</th><th class="num">Keluar</th><th class="num">Saldo</th><th class="num">Target Stok</th><th class="num">Saran Beli</th><th class="num">Skor</th></tr></thead>
            <tbody>
              ${report.purchasePlan.slice(0, 35).map(r => `
                <tr>
                  <td><code>${esc(r.item_code)}</code></td>
                  <td><b>${esc(r.item_name)}</b></td>
                  <td>${esc(r.unit)}</td>
                  <td><span class="pill ${r.movingClass === 'FAST' ? 'danger' : (r.movingClass === 'MEDIUM' ? 'gold' : '')}">${esc(r.movingClass)}</span></td>
                  <td class="num">${r.outQty}</td>
                  <td class="num">${r.closingStock}</td>
                  <td class="num">${r.targetStock}</td>
                  <td class="num"><b>${r.suggestedPurchase}</b></td>
                  <td class="num">${r.score}</td>
                </tr>
              `).join('') || '<tr><td colspan="9" class="empty">Stok seluruh item masih mencukupi target minimum.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  host.querySelector('#ops-srep-atk-xlsx')?.addEventListener('click', async () => {
    const aoa = [
      ['Kode', 'Nama Item', 'Satuan', 'Class', 'In', 'Out', 'Saldo Akhir', 'Target Stok', 'Saran Beli', 'Skor'],
      ...report.itemReports.map(r => [r.item_code, r.item_name, r.unit, r.movingClass, r.inQty, r.outQty, r.closingStock, r.targetStock, r.suggestedPurchase, r.score])
    ];
    await exportSheetXlsx('Analisa_Purchase_Plan_ATK.xlsx', 'Purchase Plan', aoa);
  });

  host.querySelector('#ops-srep-atk-print')?.addEventListener('click', () => {
    openPrintHtml('Purchase Plan ATK', `<h2>PURCHASE PLAN &amp; SARAN BELI ATK</h2>${host.querySelectorAll('.table-wrap')[0].innerHTML}`);
  });
}

// ============================================================================
// 7. SYSTEM SETTINGS -> OPERATIONS & FORMULAS (GROUPED TABS, SCHEDULES, DRIVER RULES, SIGNATORIES)
// ============================================================================
export async function renderOpsSettingsView(host, ctx) {
  const state = await loadOpsState(ctx);
  const s = state.settings;
  const ws = s.attendance.workSchedules;
  const sig = s.driver.signatories;
  const employees = getAllKnownEmployees(ctx).sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')));
  const activeTab = host.dataset.opsSetTab || 'schedules';

  const empOptions = (selectedNik = '') => {
    const normSel = compactNik(selectedNik);
    return `<option value="">-- Pilih dari Employee Directory --</option>` + employees.map(e =>
      `<option value="${esc(e.employee_no)}" data-name="${esc(e.full_name)}" data-pos="${esc(e.position || '')}" ${compactNik(e.employee_no) === normSel ? 'selected' : ''}>${esc(e.full_name)} (${esc(e.employee_no)} · ${esc(e.position || '-')})</option>`
    ).join('');
  };

  const renderSigSelector = (prefix, roleLabel, nikVal, nameVal, titleVal) => `
    <div class="ops-sig-editor-box">
      <label class="ops-field"><span>Label Kolom</span><input type="text" class="input" id="${prefix}-label" value="${esc(roleLabel)}"></label>
      <label class="ops-field"><span>Pilih Karyawan (Directory)</span>
        <select class="input ops-sig-emp-pick" data-target-prefix="${prefix}">
          ${empOptions(nikVal)}
        </select>
      </label>
      <label class="ops-field"><span>Nama Penandatangan</span><input type="text" class="input" id="${prefix}-name" value="${esc(nameVal)}"></label>
      <label class="ops-field"><span>Jabatan Cetak</span><input type="text" class="input" id="${prefix}-title" value="${esc(titleVal)}"></label>
      <input type="hidden" id="${prefix}-nik" value="${esc(nikVal)}">
    </div>
  `;

  host.innerHTML = `
    <div class="ops-stack">
      <div class="card ops-card">
        <div class="ops-head">
          <div>
            <h2>System &amp; Settings — Operations, Formulas &amp; Workflows</h2>
            <p class="ops-sub">Seluruh konfigurasi jadwal kerja staff PT MBM (Pasuruan, Surabaya/Jakarta, Kiln Dry MMD, pengecualian manual), aturan payroll &amp; tarif lembur driver, serta penandatangan laporan.</p>
          </div>
          <div class="ops-actions">
            <button type="button" class="btn btn-secondary" id="ops-set-reset">Reset Default</button>
            <button type="button" class="btn btn-primary" id="ops-set-save">Simpan Konfigurasi</button>
          </div>
        </div>
        <div class="tab-bar" role="tablist" style="margin-top:12px">
          <button type="button" class="tab-btn ${activeTab === 'schedules' ? 'active' : ''}" data-tab="schedules">Jadwal Kerja &amp; Staff</button>
          <button type="button" class="tab-btn ${activeTab === 'driver' ? 'active' : ''}" data-tab="driver">Driver &amp; Tarif Lembur</button>
          <button type="button" class="tab-btn ${activeTab === 'signatories' ? 'active' : ''}" data-tab="signatories">Penandatangan Laporan</button>
          <button type="button" class="tab-btn ${activeTab === 'cuti' ? 'active' : ''}" data-tab="cuti">Cuti Policy</button>
          <button type="button" class="tab-btn ${activeTab === 'stationery' ? 'active' : ''}" data-tab="stationery">Stationery &amp; SLOC</button>
        </div>
      </div>

      <!-- TAB 1: JADWAL KERJA & STAFF -->
      <div class="ops-stack ${activeTab === 'schedules' ? '' : 'hidden'}" data-panel="schedules">
        <div class="card ops-card">
          <h3>Jadwal Kerja Standar Staff — PT. Mitra Binamandiri Makmur</h3>
          <p class="ops-sub">Berlaku untuk seluruh karyawan selain Driver. Batas terlambat &amp; uang makan dihitung otomatis dari jam masuk jadwal.</p>
          <div class="ops-schedule-blocks" style="margin-top:12px">
            <div class="ops-subbox">
              <h4>1. Home Base Pasuruan</h4>
              <div class="ops-form-grid">
                <label class="ops-field"><span>Senin – Jumat Masuk</span><input id="ws-pas-wd-s" type="time" class="input" value="${esc(ws.pasuruan.weekdayStart)}"></label>
                <label class="ops-field"><span>Senin – Jumat Pulang</span><input id="ws-pas-wd-e" type="time" class="input" value="${esc(ws.pasuruan.weekdayEnd)}"></label>
                <label class="ops-field"><span>Sabtu Masuk</span><input id="ws-pas-sat-s" type="time" class="input" value="${esc(ws.pasuruan.saturdayStart)}"></label>
                <label class="ops-field"><span>Sabtu Pulang</span><input id="ws-pas-sat-e" type="time" class="input" value="${esc(ws.pasuruan.saturdayEnd)}"></label>
              </div>
            </div>
            <div class="ops-subbox">
              <h4>2. Home Base Surabaya &amp; Jakarta</h4>
              <div class="ops-form-grid">
                <label class="ops-field"><span>Senin – Jumat Masuk</span><input id="ws-sby-wd-s" type="time" class="input" value="${esc(ws.surabayaJakarta.weekdayStart)}"></label>
                <label class="ops-field"><span>Senin – Jumat Pulang</span><input id="ws-sby-wd-e" type="time" class="input" value="${esc(ws.surabayaJakarta.weekdayEnd)}"></label>
                <label class="ops-field"><span>Sabtu Masuk</span><input id="ws-sby-sat-s" type="time" class="input" value="${esc(ws.surabayaJakarta.saturdayStart)}"></label>
                <label class="ops-field"><span>Sabtu Pulang</span><input id="ws-sby-sat-e" type="time" class="input" value="${esc(ws.surabayaJakarta.saturdayEnd)}"></label>
              </div>
            </div>
          </div>
          <div class="ops-flash-banner ops-flash-info" style="margin-top:12px;margin-bottom:0">
            <b>PT. Radin Mitra Lestari (Status Hold):</b> ${esc(ws.radinPolicy.notes)}
          </div>
        </div>

        <div class="card ops-card">
          <div class="ops-head">
            <div>
              <h3>3. Home Base Kiln Dry — Jadwal Khusus Per Personil (Jabatan MMD)</h3>
              <p class="ops-sub">Hari kerja sama (Senin–Sabtu), jam kerja dapat diatur berbeda tiap personil MMD.</p>
            </div>
            <button type="button" class="btn btn-sm btn-secondary" id="ws-kiln-add">+ Tambah Personil Kiln Dry</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Karyawan (MMD)</th><th>Sen–Jum Masuk</th><th>Sen–Jum Pulang</th><th>Sabtu Masuk</th><th>Sabtu Pulang</th><th>Catatan</th><th>Aksi</th></tr></thead>
              <tbody id="ws-kiln-tbody">
                ${ws.kilnDryPersonnel.map((k, idx) => `
                  <tr class="ws-kiln-row" data-idx="${idx}">
                    <td>
                      <select class="input ws-kiln-emp">${empOptions(k.employee_no)}</select>
                    </td>
                    <td><input type="time" class="input ws-kiln-wds" value="${esc(k.weekdayStart)}"></td>
                    <td><input type="time" class="input ws-kiln-wde" value="${esc(k.weekdayEnd)}"></td>
                    <td><input type="time" class="input ws-kiln-ss" value="${esc(k.saturdayStart)}"></td>
                    <td><input type="time" class="input ws-kiln-se" value="${esc(k.saturdayEnd)}"></td>
                    <td><input type="text" class="input ws-kiln-note" value="${esc(k.notes || '')}"></td>
                    <td><button type="button" class="btn btn-sm btn-secondary ws-kiln-del">Hapus</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card ops-card">
          <div class="ops-head">
            <div>
              <h3>4. Pengecualian Jadwal Manual Per Karyawan</h3>
              <p class="ops-sub">Tambahkan pengecualian jam kerja untuk staf tertentu PT MBM dan simpan ke konfigurasi.</p>
            </div>
            <button type="button" class="btn btn-sm btn-secondary" id="ws-exc-add">+ Tambah Pengecualian Manual</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Karyawan</th><th>Label Home Base</th><th>Sen–Jum Masuk</th><th>Sen–Jum Pulang</th><th>Sabtu Masuk</th><th>Sabtu Pulang</th><th>Alasan Pengecualian</th><th>Aksi</th></tr></thead>
              <tbody id="ws-exc-tbody">
                ${ws.manualExceptions.length ? ws.manualExceptions.map(ex => `
                  <tr class="ws-exc-row">
                    <td><select class="input ws-exc-emp">${empOptions(ex.employee_no)}</select></td>
                    <td><input type="text" class="input ws-exc-hb" value="${esc(ex.homeBase || 'Pengecualian Manual')}"></td>
                    <td><input type="time" class="input ws-exc-wds" value="${esc(ex.weekdayStart)}"></td>
                    <td><input type="time" class="input ws-exc-wde" value="${esc(ex.weekdayEnd)}"></td>
                    <td><input type="time" class="input ws-exc-ss" value="${esc(ex.saturdayStart)}"></td>
                    <td><input type="time" class="input ws-exc-se" value="${esc(ex.saturdayEnd)}"></td>
                    <td><input type="text" class="input ws-exc-reason" value="${esc(ex.reason || '')}" placeholder="Alasan khusus"></td>
                    <td><button type="button" class="btn btn-sm btn-secondary ws-exc-del">Hapus</button></td>
                  </tr>
                `).join('') : '<tr class="ws-exc-empty"><td colspan="8" class="empty">Belum ada pengecualian manual jadwal staff. Klik "+ Tambah Pengecualian Manual".</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card ops-card">
          <h3>5. Ambang Terlambat, Uang Makan &amp; Parameter Absensi Staff</h3>
          <div class="ops-form-grid">
            <label class="ops-field"><span>Batas Terlambat (&ge; N menit dari jadwal)</span><input id="set-att-late-min" type="number" class="input" value="${s.attendance.lateThresholdMinutes}"></label>
            <label class="ops-field"><span>Batas Hangus Uang Makan (&ge; N menit dari jadwal)</span><input id="set-att-meal-min" type="number" class="input" value="${s.attendance.mealThresholdMinutes}"></label>
            <label class="ops-field"><span>Batas Tepat Waktu Mitra (otomatis/manual)</span><input id="set-att-mitra-late" type="text" class="input" value="${esc(addMinutesToScheduleCutoff(ws.pasuruan.weekdayStart, s.attendance.lateThresholdMinutes))}"></label>
            <label class="ops-field"><span>Batas Tepat Waktu Radin (HH:MM:SS)</span><input id="set-att-radin-late" type="text" class="input" value="${esc(s.attendance.radinLateCutoffTime)}"></label>
            <label class="ops-field"><span>Hari Mulai Cutoff</span><input id="set-att-start" type="number" class="input" value="${s.attendance.cutoffStartDay}"></label>
            <label class="ops-field"><span>Hari Akhir Cutoff</span><input id="set-att-end" type="number" class="input" value="${s.attendance.cutoffEndDay}"></label>
            <label class="ops-field"><span>Basis Hari Kerja</span><input id="set-att-basis" type="number" class="input" value="${s.attendance.workingDaysBasis}"></label>
            <label class="ops-field"><span>Batas Maks Hari Dibayar</span><input id="set-att-cap" type="number" class="input" value="${s.attendance.maxPaidDaysCap}"></label>
            <label class="ops-field"><span>Bobot Potongan Terlambat (T)</span><input id="set-att-tweight" type="number" step="0.05" class="input" value="${s.attendance.latePenaltyWeight}"></label>
            <label class="ops-field"><span>Kredit Masuk Hari Libur</span><input id="set-att-hweight" type="number" step="0.05" class="input" value="${s.attendance.holidayCreditWeight}"></label>
            <label class="ops-field"><span>Ambang SP (Rasio Ketidakhadiran)</span><input id="set-att-warn" type="number" step="0.01" class="input" value="${s.attendance.warningAbsenceThreshold}"></label>
            <label class="ops-field"><span>Default Hari Tanpa Tap</span>
              <select id="set-att-nopunch" class="input">
                <option value="PERLU_PEMERIKSAAN_HR" ${s.attendance.autoMarkNoPunchAs === 'PERLU_PEMERIKSAAN_HR' ? 'selected' : ''}>Perlu Pemeriksaan HR</option>
                <option value="A" ${s.attendance.autoMarkNoPunchAs === 'A' ? 'selected' : ''}>Alpa (A) Otomatis</option>
              </select>
            </label>
            <label class="ops-check"><input id="set-att-exempt-drv" type="checkbox" ${s.attendance.exemptDriverLateFlag ? 'checked' : ''}> <span>Kecualikan Driver dari flag Terlambat (T)</span></label>
            <label class="ops-check"><input id="set-att-lock-rev" type="checkbox" ${s.attendance.preserveConfirmedReviews ? 'checked' : ''}> <span>Kunci koreksi HR terkonfirmasi</span></label>
          </div>
          <div class="ops-subbox" style="margin-top:12px">
            <h4>Simulasi &amp; Adjust Manual Uang Makan (Case Tertentu)</h4>
            <p class="ops-sub">Contoh aturan 07:30: <code>07:30:59</code> Tepat Waktu, <code>07:31:00</code> Terlambat; <code>07:35:59</code> Dapat Uang Makan, <code>07:36:00</code> Tidak Dapat Uang Makan.</p>
            <div class="ops-form-grid" style="margin-top:8px">
              <label class="ops-field"><span>Karyawan</span><select id="meal-ov-emp" class="input">${empOptions('')}</select></label>
              <label class="ops-field"><span>Tanggal</span><input id="meal-ov-date" type="date" class="input" value="2026-11-02"></label>
              <label class="ops-field"><span>Status Uang Makan</span>
                <select id="meal-ov-eligible" class="input">
                  <option value="true">Berikan Uang Makan (Override Ya)</option>
                  <option value="false">Cabut Uang Makan (Override Tidak)</option>
                </select>
              </label>
              <label class="ops-field"><span>Alasan Manual</span><input id="meal-ov-reason" type="text" class="input" placeholder="Tugas luar pagi / Finger error"></label>
              <div class="ops-field ops-field-end"><button type="button" class="btn btn-sm btn-secondary" id="meal-ov-add">Simpan Adjust Uang Makan</button></div>
            </div>
            ${state.staffMealOverrides?.length ? `
              <div class="table-wrap" style="margin-top:8px">
                <table>
                  <thead><tr><th>Tanggal</th><th>NIK</th><th>Nama</th><th>Status</th><th>Alasan</th><th>Aksi</th></tr></thead>
                  <tbody>
                    ${state.staffMealOverrides.map(m => `
                      <tr>
                        <td>${esc(m.work_date)}</td>
                        <td><code>${esc(m.employee_no)}</code></td>
                        <td>${esc(m.employee_name)}</td>
                        <td>${m.eligible ? '<span class="pill green">Dapat Uang Makan</span>' : '<span class="pill danger">Tidak Dapat</span>'}</td>
                        <td>${esc(m.reason || '-')}</td>
                        <td><button type="button" class="btn btn-sm btn-secondary meal-ov-del" data-id="${esc(m.id)}">Hapus</button></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- TAB 2: DRIVER & TARIF LEMBUR -->
      <div class="ops-stack ${activeTab === 'driver' ? '' : 'hidden'}" data-panel="driver">
        <div class="card ops-card">
          <h3>Aturan Driver, Jam Normal, Lembur &amp; Potongan BPJS</h3>
          <div class="ops-form-grid">
            <label class="ops-field"><span>Filter Jabatan Driver</span><input id="set-drv-pos" type="text" class="input" value="${esc(s.driver.requiredPositionKeyword)}"></label>
            <label class="ops-field"><span>Daftar Nama Dikecualikan (pisah koma)</span><input id="set-drv-excl" type="text" class="input" value="${esc(s.driver.excludedDriverNames.join(', '))}"></label>
            <label class="ops-field"><span>Jam Normal Senin–Jumat</span><input id="set-drv-wd-norm" type="number" class="input" value="${s.driver.weekdayNormalHours}"></label>
            <label class="ops-field"><span>Jam Normal Sabtu</span><input id="set-drv-sat-norm" type="number" class="input" value="${s.driver.saturdayNormalHours}"></label>
            <label class="ops-field"><span>Upah Bulanan Dasar (Rp)</span><input id="set-drv-monthly" type="number" class="input" value="${s.driver.defaultMonthlyWage}"></label>
            <label class="ops-field"><span>Pembagi Hari Kerja</span><input id="set-drv-div" type="number" class="input" value="${s.driver.workingDayDivisor}"></label>
            <label class="ops-field"><span>Upah Harian (=147.000)</span><input id="set-drv-daily" type="number" class="input" value="${s.driver.defaultDailyWage}"></label>
            <label class="ops-field"><span>Potongan BPJS (Rp)</span><input id="set-drv-bpjs" type="number" class="input" value="${s.driver.bpjsDefaultAmount}"></label>
            <label class="ops-field"><span>Aturan Periode Potongan BPJS</span>
              <select id="set-drv-bpjs-rule" class="input">
                <option value="period2_only" ${s.driver.bpjsPeriodRule === 'period2_only' ? 'selected' : ''}>Periode 16 – Akhir Bulan Saja</option>
                <option value="always" ${s.driver.bpjsPeriodRule === 'always' ? 'selected' : ''}>Semua Periode (P1 &amp; P2)</option>
                <option value="none" ${s.driver.bpjsPeriodRule === 'none' ? 'selected' : ''}>Tidak Dipotong</option>
              </select>
            </label>
            <label class="ops-field"><span>Potong Istirahat jika OT &gt; (jam)</span><input id="set-drv-brk-thr" type="number" step="0.5" class="input" value="${s.driver.overtimeBreakThresholdHours}"></label>
            <label class="ops-field"><span>Durasi Potongan Istirahat (jam)</span><input id="set-drv-brk-ded" type="number" step="0.5" class="input" value="${s.driver.overtimeBreakDeductionHours}"></label>
            <label class="ops-field"><span>Lokasi Cetak Laporan</span><input id="set-drv-loc" type="text" class="input" value="${esc(s.driver.reportLocationLabel)}"></label>
            <label class="ops-field"><span>Ekstra / 0.5j OT Hari Biasa (&gt;15j)</span><input id="set-drv-wk-ext" type="number" class="input" value="${s.driver.extraWeekdayHalfHourIncrement}"></label>
            <label class="ops-field"><span>Ekstra / 0.5j OT Hari Besar (&gt;12j)</span><input id="set-drv-hol-ext" type="number" class="input" value="${s.driver.extraHolidayHalfHourIncrement}"></label>
            <label class="ops-check"><input id="set-drv-confirmed" type="checkbox" ${s.driver.payrollRulesConfirmed ? 'checked' : ''}> <span>Aturan Payroll Driver Aktif</span></label>
          </div>
        </div>

        <div class="ops-schedule-blocks">
          <div class="card ops-card">
            <div class="ops-head">
              <h3>Tabel Tarif Lembur Hari Biasa (Senin–Sabtu)</h3>
              <button type="button" class="btn btn-sm btn-secondary" id="drv-wk-tariff-add">+ Baris</button>
            </div>
            <div class="table-wrap" style="max-height:360px">
              <table>
                <thead><tr><th>Jam Ke</th><th>Nominal (Rp)</th><th>Aksi</th></tr></thead>
                <tbody id="drv-wk-tariff-tbody">
                  ${s.driver.weekdayOvertimeTariff.map(r => `
                    <tr class="drv-wk-row">
                      <td><input type="number" step="0.5" class="input drv-t-hr" value="${r.hours}"></td>
                      <td><input type="number" class="input drv-t-amt" value="${r.amount}"></td>
                      <td><button type="button" class="btn btn-sm btn-secondary drv-t-del">Hapus</button></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="card ops-card">
            <div class="ops-head">
              <h3>Tabel Tarif Lembur Hari Minggu / Besar</h3>
              <button type="button" class="btn btn-sm btn-secondary" id="drv-hol-tariff-add">+ Baris</button>
            </div>
            <div class="table-wrap" style="max-height:360px">
              <table>
                <thead><tr><th>Jam Ke</th><th>Nominal (Rp)</th><th>Aksi</th></tr></thead>
                <tbody id="drv-hol-tariff-tbody">
                  ${s.driver.holidayOvertimeTariff.map(r => `
                    <tr class="drv-hol-row">
                      <td><input type="number" step="0.5" class="input drv-t-hr" value="${r.hours}"></td>
                      <td><input type="number" class="input drv-t-amt" value="${r.amount}"></td>
                      <td><button type="button" class="btn btn-sm btn-secondary drv-t-del">Hapus</button></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 3: PENANDATANGAN LAPORAN -->
      <div class="ops-stack ${activeTab === 'signatories' ? '' : 'hidden'}" data-panel="signatories">
        <div class="card ops-card">
          <h3>Penandatangan Laporan Summary Driver</h3>
          <div class="ops-schedule-blocks" style="margin-top:10px">
            ${renderSigSelector('sig-sum-l', sig.summary.leftLabel, sig.summary.leftNik, sig.summary.leftName, sig.summary.leftTitle)}
            ${renderSigSelector('sig-sum-r', sig.summary.rightLabel, sig.summary.rightNik, sig.summary.rightName, sig.summary.rightTitle)}
          </div>
        </div>
        <div class="card ops-card">
          <h3>Penandatangan Laporan Support, Indoor &amp; Outdoor</h3>
          <div class="ops-schedule-blocks" style="margin-top:10px">
            ${renderSigSelector('sig-dept-l', sig.department.leftLabel, sig.department.leftNik, sig.department.leftName, sig.department.leftTitle)}
            ${renderSigSelector('sig-dept-r', sig.department.rightLabel, sig.department.rightNik, sig.department.rightName, sig.department.rightTitle)}
          </div>
        </div>
        <div class="card ops-card">
          <h3>Penandatangan Laporan Radin (3 Kolom)</h3>
          <div class="ops-schedule-blocks-3" style="margin-top:10px">
            ${renderSigSelector('sig-rad-l', sig.radin.leftLabel, sig.radin.leftNik, sig.radin.leftName, sig.radin.leftTitle)}
            ${renderSigSelector('sig-rad-m', sig.radin.midLabel, sig.radin.midNik, sig.radin.midName, sig.radin.midTitle)}
            ${renderSigSelector('sig-rad-r', sig.radin.rightLabel, sig.radin.rightNik, sig.radin.rightName, sig.radin.rightTitle)}
          </div>
        </div>
        <div class="card ops-card">
          <h3>Penandatangan Time Check Sheet Sopir</h3>
          <div class="ops-schedule-blocks" style="margin-top:10px">
            ${renderSigSelector('sig-cs-l', sig.checksheet.leftLabel, sig.checksheet.leftNik, sig.checksheet.leftName, sig.checksheet.leftTitle)}
            ${renderSigSelector('sig-cs-r', sig.checksheet.rightLabel, sig.checksheet.rightNik, sig.checksheet.rightName, sig.checksheet.rightTitle)}
          </div>
        </div>
      </div>

      <!-- TAB 4: CUTI POLICY -->
      <div class="card ops-card ${activeTab === 'cuti' ? '' : 'hidden'}" data-panel="cuti">
        <h3>Aturan Kuota &amp; Gerbang Konfirmasi Cuti</h3>
        <div class="ops-form-grid">
          <label class="ops-field"><span>Kuota Cuti Tahunan Default</span><input id="set-cuti-quota" type="number" class="input" value="${s.cuti.defaultAnnualQuota}"></label>
          <label class="ops-field"><span>Potongan Cuti Bersama</span><input id="set-cuti-bersama" type="number" class="input" value="${s.cuti.cutiBersamaDeduction}"></label>
          <label class="ops-field"><span>Ambang Hari Peringatan Pembaruan</span><input id="set-cuti-days" type="number" class="input" value="${s.cuti.confirmationDaysThreshold}"></label>
          <label class="ops-check"><input id="set-cuti-gate" type="checkbox" ${s.cuti.enableConfirmationGate ? 'checked' : ''}> <span>Aktifkan Gerbang Konfirmasi Pembaruan Cuti</span></label>
        </div>
      </div>

      <!-- TAB 5: STATIONERY & SLOC -->
      <div class="card ops-card ${activeTab === 'stationery' ? '' : 'hidden'}" data-panel="stationery">
        <h3>Pengaturan Stationery / ATK, SLOC &amp; Purchase Plan</h3>
        <div class="ops-form-grid">
          <label class="ops-field"><span>Horizon Rencana Pembelian</span>
            <select id="set-stk-horizon" class="input">
              <option value="1w" ${s.stationery.purchaseHorizon === '1w' ? 'selected' : ''}>1 Minggu (7 hari)</option>
              <option value="2w" ${s.stationery.purchaseHorizon === '2w' ? 'selected' : ''}>2 Minggu (14 hari)</option>
              <option value="1m" ${s.stationery.purchaseHorizon === '1m' ? 'selected' : ''}>1 Bulan (30 hari)</option>
            </select>
          </label>
          <label class="ops-field"><span>Faktor Pengaman (Safety Multiplier)</span><input id="set-stk-safety" type="number" step="0.1" class="input" value="${s.stationery.safetyStockMultiplier}"></label>
          <label class="ops-field"><span>Min Qty Fast Moving</span><input id="set-stk-fast-qty" type="number" class="input" value="${s.stationery.fastMovingMinOutQty}"></label>
          <label class="ops-field"><span>Min Frekuensi Fast Moving</span><input id="set-stk-fast-freq" type="number" class="input" value="${s.stationery.fastMovingMinFreq}"></label>
          <label class="ops-field"><span>Mode Skor ATK</span>
            <select id="set-stk-score" class="input">
              <option value="legacy_excel" ${s.stationery.scoringMode === 'legacy_excel' ? 'selected' : ''}>Legacy Excel (Qty + Freq)</option>
              <option value="weighted" ${s.stationery.scoringMode === 'weighted' ? 'selected' : ''}>Weighted (0.6 Qty + 0.4 Freq)</option>
            </select>
          </label>
          <label class="ops-field"><span>SLOC Kanonik (Pisah koma)</span><input id="set-stk-slocs" type="text" class="input" value="${esc(s.stationery.canonicalSlocs.join(', '))}"></label>
        </div>
      </div>
    </div>
  `;

  host.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextTab = btn.dataset.tab;
      if (!nextTab) return;
      host.dataset.opsSetTab = nextTab;
      host.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === nextTab));
      host.querySelectorAll('[data-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.panel !== nextTab));
    });
  });

  // Dynamic employee picker for Signatories
  host.querySelectorAll('.ops-sig-emp-pick').forEach(sel => {
    sel.addEventListener('change', () => {
      const opt = sel.selectedOptions[0];
      const prefix = sel.dataset.targetPrefix;
      if (!opt || !opt.value) return;
      host.querySelector(`#${prefix}-nik`).value = opt.value;
      host.querySelector(`#${prefix}-name`).value = opt.dataset.name || '';
      if (opt.dataset.pos) host.querySelector(`#${prefix}-title`).value = opt.dataset.pos;
    });
  });

  // Repeater bindings for Kiln Dry, Manual Exceptions, Tariff tables
  host.querySelectorAll('.ws-kiln-del, .ws-exc-del, .drv-t-del').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('tr')?.remove());
  });

  host.querySelector('#ws-kiln-add')?.addEventListener('click', () => {
    const tr = document.createElement('tr');
    tr.className = 'ws-kiln-row';
    tr.innerHTML = `
      <td><select class="input ws-kiln-emp">${empOptions('')}</select></td>
      <td><input type="time" class="input ws-kiln-wds" value="07:30"></td>
      <td><input type="time" class="input ws-kiln-wde" value="17:00"></td>
      <td><input type="time" class="input ws-kiln-ss" value="07:30"></td>
      <td><input type="time" class="input ws-kiln-se" value="12:00"></td>
      <td><input type="text" class="input ws-kiln-note" value="Jadwal Khusus Kiln Dry — MMD"></td>
      <td><button type="button" class="btn btn-sm btn-secondary ws-kiln-del">Hapus</button></td>
    `;
    tr.querySelector('.ws-kiln-del').addEventListener('click', () => tr.remove());
    host.querySelector('#ws-kiln-tbody')?.appendChild(tr);
  });

  host.querySelector('#ws-exc-add')?.addEventListener('click', () => {
    host.querySelector('#ws-exc-tbody .ws-exc-empty')?.remove();
    const tr = document.createElement('tr');
    tr.className = 'ws-exc-row';
    tr.innerHTML = `
      <td><select class="input ws-exc-emp">${empOptions('')}</select></td>
      <td><input type="text" class="input ws-exc-hb" value="Pengecualian Manual"></td>
      <td><input type="time" class="input ws-exc-wds" value="07:30"></td>
      <td><input type="time" class="input ws-exc-wde" value="17:00"></td>
      <td><input type="time" class="input ws-exc-ss" value="07:30"></td>
      <td><input type="time" class="input ws-exc-se" value="12:00"></td>
      <td><input type="text" class="input ws-exc-reason" placeholder="Alasan khusus"></td>
      <td><button type="button" class="btn btn-sm btn-secondary ws-exc-del">Hapus</button></td>
    `;
    tr.querySelector('.ws-exc-del').addEventListener('click', () => tr.remove());
    host.querySelector('#ws-exc-tbody')?.appendChild(tr);
  });

  const addTariffRow = (tbodyId, rowClass) => {
    const tr = document.createElement('tr');
    tr.className = rowClass;
    tr.innerHTML = `
      <td><input type="number" step="0.5" class="input drv-t-hr" value="0"></td>
      <td><input type="number" class="input drv-t-amt" value="0"></td>
      <td><button type="button" class="btn btn-sm btn-secondary drv-t-del">Hapus</button></td>
    `;
    tr.querySelector('.drv-t-del').addEventListener('click', () => tr.remove());
    host.querySelector(`#${tbodyId}`)?.appendChild(tr);
  };
  host.querySelector('#drv-wk-tariff-add')?.addEventListener('click', () => addTariffRow('drv-wk-tariff-tbody', 'drv-wk-row'));
  host.querySelector('#drv-hol-tariff-add')?.addEventListener('click', () => addTariffRow('drv-hol-tariff-tbody', 'drv-hol-row'));

  // Meal override actions
  host.querySelector('#meal-ov-add')?.addEventListener('click', async () => {
    const empSel = host.querySelector('#meal-ov-emp');
    const nik = empSel?.value;
    const empName = empSel?.selectedOptions?.[0]?.dataset?.name || '';
    const workDate = host.querySelector('#meal-ov-date')?.value;
    const eligible = host.querySelector('#meal-ov-eligible')?.value === 'true';
    const reason = host.querySelector('#meal-ov-reason')?.value?.trim() || '';
    if (!nik || !workDate) {
      showInlineBanner(host, 'Pilih karyawan dan tanggal untuk adjust uang makan.', 'error');
      return;
    }
    const row = {
      id: `meal-${compactNik(nik)}-${workDate}`,
      employee_no: nik,
      employee_name: empName,
      work_date: workDate,
      eligible,
      reason,
      updated_at: new Date().toISOString()
    };
    const nextList = [...(state.staffMealOverrides || [])];
    const idx = nextList.findIndex(x => compactNik(x.employee_no) === compactNik(nik) && x.work_date === workDate);
    if (idx >= 0) nextList[idx] = row;
    else nextList.push(row);
    state.staffMealOverrides = nextList;
    if (ctx.isDemoMode) saveDemoOpsState(state);
    else {
      await ctx.supabase.from('staff_meal_overrides').upsert(row, { onConflict: 'employee_no,work_date' });
      invalidateOpsStateCache();
    }
    await renderOpsSettingsView(host, ctx);
    showInlineBanner(host, `Adjust uang makan ${empName} (${workDate}) tersimpan.`, 'ok');
  });

  host.querySelectorAll('.meal-ov-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      state.staffMealOverrides = (state.staffMealOverrides || []).filter(m => m.id !== id);
      if (ctx.isDemoMode) saveDemoOpsState(state);
      else {
        await ctx.supabase.from('staff_meal_overrides').delete().eq('id', id);
        invalidateOpsStateCache();
      }
      renderOpsSettingsView(host, ctx);
    });
  });

  host.querySelector('#ops-set-reset')?.addEventListener('click', async () => {
    state.settings = normalizeOpsSettings(DEFAULT_OPS_SETTINGS);
    if (ctx.isDemoMode) saveDemoOpsState(state);
    else {
      const { error } = await ctx.supabase.from('portal_settings').upsert({ key: OPS_SETTINGS_KEY, value: state.settings });
      if (error) {
        showInlineBanner(host, `Gagal mereset pengaturan: ${error.message}`, 'error');
        return;
      }
      invalidateOpsStateCache();
    }
    await renderOpsSettingsView(host, ctx);
    showInlineBanner(host, 'Seluruh parameter dikembalikan ke standar default.', 'ok');
  });

  host.querySelector('#ops-set-save')?.addEventListener('click', async () => {
    try {
      const kilnDryPersonnel = [...host.querySelectorAll('.ws-kiln-row')].map(tr => {
        const sel = tr.querySelector('.ws-kiln-emp');
        const opt = sel?.selectedOptions?.[0];
        return {
          employee_no: sel?.value || '',
          full_name: opt?.dataset?.name || '',
          position: opt?.dataset?.pos || 'MMD',
          weekdayStart: tr.querySelector('.ws-kiln-wds')?.value || '07:30',
          weekdayEnd: tr.querySelector('.ws-kiln-wde')?.value || '17:00',
          saturdayStart: tr.querySelector('.ws-kiln-ss')?.value || '07:30',
          saturdayEnd: tr.querySelector('.ws-kiln-se')?.value || '12:00',
          notes: tr.querySelector('.ws-kiln-note')?.value?.trim() || ''
        };
      }).filter(x => x.employee_no || x.full_name);

      const manualExceptions = [...host.querySelectorAll('.ws-exc-row')].map((tr, i) => {
        const sel = tr.querySelector('.ws-exc-emp');
        const opt = sel?.selectedOptions?.[0];
        return {
          id: `exc-${i + 1}`,
          employee_no: sel?.value || '',
          full_name: opt?.dataset?.name || '',
          homeBase: tr.querySelector('.ws-exc-hb')?.value?.trim() || 'Pengecualian Manual',
          weekdayStart: tr.querySelector('.ws-exc-wds')?.value || '07:30',
          weekdayEnd: tr.querySelector('.ws-exc-wde')?.value || '17:00',
          saturdayStart: tr.querySelector('.ws-exc-ss')?.value || '07:30',
          saturdayEnd: tr.querySelector('.ws-exc-se')?.value || '12:00',
          reason: tr.querySelector('.ws-exc-reason')?.value?.trim() || ''
        };
      }).filter(x => x.employee_no || x.full_name);

      const readTariffRows = (selector, fb) => {
        const rows = [...host.querySelectorAll(selector)].map(tr => ({
          hours: Number(tr.querySelector('.drv-t-hr')?.value || 0),
          amount: Math.round(Number(tr.querySelector('.drv-t-amt')?.value || 0))
        })).filter(r => Number.isFinite(r.hours) && r.hours >= 0 && r.amount >= 0);
        return rows.length ? rows : fb;
      };

      const readSig = prefix => ({
        label: host.querySelector(`#${prefix}-label`)?.value?.trim() || '',
        nik: host.querySelector(`#${prefix}-nik`)?.value?.trim() || '',
        name: host.querySelector(`#${prefix}-name`)?.value?.trim() || '',
        title: host.querySelector(`#${prefix}-title`)?.value?.trim() || ''
      });
      const sumL = readSig('sig-sum-l');
      const sumR = readSig('sig-sum-r');
      const deptL = readSig('sig-dept-l');
      const deptR = readSig('sig-dept-r');
      const radL = readSig('sig-rad-l');
      const radM = readSig('sig-rad-m');
      const radR = readSig('sig-rad-r');
      const csL = readSig('sig-cs-l');
      const csR = readSig('sig-cs-r');

      const slocArr = host.querySelector('#set-stk-slocs').value.split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
      const exclArr = host.querySelector('#set-drv-excl').value.split(',').map(x => x.trim().toUpperCase()).filter(Boolean);

      const next = normalizeOpsSettings({
        attendance: {
          ...s.attendance,
          cutoffStartDay: host.querySelector('#set-att-start').value,
          cutoffEndDay: host.querySelector('#set-att-end').value,
          lateThresholdMinutes: host.querySelector('#set-att-late-min').value,
          mealThresholdMinutes: host.querySelector('#set-att-meal-min').value,
          mitraLateCutoffTime: host.querySelector('#set-att-mitra-late').value,
          radinLateCutoffTime: host.querySelector('#set-att-radin-late').value,
          workingDaysBasis: host.querySelector('#set-att-basis').value,
          maxPaidDaysCap: host.querySelector('#set-att-cap').value,
          latePenaltyWeight: host.querySelector('#set-att-tweight').value,
          holidayCreditWeight: host.querySelector('#set-att-hweight').value,
          warningAbsenceThreshold: host.querySelector('#set-att-warn').value,
          autoMarkNoPunchAs: host.querySelector('#set-att-nopunch').value,
          exemptDriverLateFlag: host.querySelector('#set-att-exempt-drv').checked,
          preserveConfirmedReviews: host.querySelector('#set-att-lock-rev').checked,
          workSchedules: {
            pasuruan: {
              label: s.attendance.workSchedules.pasuruan.label,
              weekdayStart: host.querySelector('#ws-pas-wd-s').value,
              weekdayEnd: host.querySelector('#ws-pas-wd-e').value,
              saturdayStart: host.querySelector('#ws-pas-sat-s').value,
              saturdayEnd: host.querySelector('#ws-pas-sat-e').value
            },
            surabayaJakarta: {
              label: s.attendance.workSchedules.surabayaJakarta.label,
              weekdayStart: host.querySelector('#ws-sby-wd-s').value,
              weekdayEnd: host.querySelector('#ws-sby-wd-e').value,
              saturdayStart: host.querySelector('#ws-sby-sat-s').value,
              saturdayEnd: host.querySelector('#ws-sby-sat-e').value
            },
            kilnDryPersonnel,
            manualExceptions,
            radinPolicy: s.attendance.workSchedules.radinPolicy
          }
        },
        cuti: {
          ...s.cuti,
          defaultAnnualQuota: host.querySelector('#set-cuti-quota').value,
          cutiBersamaDeduction: host.querySelector('#set-cuti-bersama').value,
          confirmationDaysThreshold: host.querySelector('#set-cuti-days').value,
          enableConfirmationGate: host.querySelector('#set-cuti-gate').checked
        },
        driver: {
          ...s.driver,
          requiredPositionKeyword: host.querySelector('#set-drv-pos').value,
          excludedDriverNames: exclArr,
          weekdayNormalHours: host.querySelector('#set-drv-wd-norm').value,
          saturdayNormalHours: host.querySelector('#set-drv-sat-norm').value,
          defaultMonthlyWage: host.querySelector('#set-drv-monthly').value,
          workingDayDivisor: host.querySelector('#set-drv-div').value,
          defaultDailyWage: host.querySelector('#set-drv-daily').value,
          bpjsDefaultAmount: host.querySelector('#set-drv-bpjs').value,
          bpjsPeriodRule: host.querySelector('#set-drv-bpjs-rule').value,
          overtimeBreakThresholdHours: host.querySelector('#set-drv-brk-thr').value,
          overtimeBreakDeductionHours: host.querySelector('#set-drv-brk-ded').value,
          reportLocationLabel: host.querySelector('#set-drv-loc').value,
          extraWeekdayHalfHourIncrement: host.querySelector('#set-drv-wk-ext').value,
          extraHolidayHalfHourIncrement: host.querySelector('#set-drv-hol-ext').value,
          payrollRulesConfirmed: host.querySelector('#set-drv-confirmed').checked,
          weekdayOvertimeTariff: readTariffRows('.drv-wk-row', DEFAULT_WEEKDAY_OVERTIME_TARIFF),
          holidayOvertimeTariff: readTariffRows('.drv-hol-row', DEFAULT_HOLIDAY_OVERTIME_TARIFF),
          signatories: {
            summary: {
              leftLabel: sumL.label, leftNik: sumL.nik, leftName: sumL.name, leftTitle: sumL.title,
              rightLabel: sumR.label, rightNik: sumR.nik, rightName: sumR.name, rightTitle: sumR.title
            },
            department: {
              leftLabel: deptL.label, leftNik: deptL.nik, leftName: deptL.name, leftTitle: deptL.title,
              rightLabel: deptR.label, rightNik: deptR.nik, rightName: deptR.name, rightTitle: deptR.title
            },
            radin: {
              leftLabel: radL.label, leftNik: radL.nik, leftName: radL.name, leftTitle: radL.title,
              midLabel: radM.label, midNik: radM.nik, midName: radM.name, midTitle: radM.title,
              rightLabel: radR.label, rightNik: radR.nik, rightName: radR.name, rightTitle: radR.title
            },
            checksheet: {
              leftLabel: csL.label, leftNik: csL.nik, leftName: csL.name, leftTitle: csL.title,
              rightLabel: csR.label, rightNik: csR.nik, rightName: csR.name, rightTitle: csR.title
            }
          }
        },
        stationery: {
          ...s.stationery,
          purchaseHorizon: host.querySelector('#set-stk-horizon').value,
          safetyStockMultiplier: host.querySelector('#set-stk-safety').value,
          fastMovingMinOutQty: host.querySelector('#set-stk-fast-qty').value,
          fastMovingMinFreq: host.querySelector('#set-stk-fast-freq').value,
          scoringMode: host.querySelector('#set-stk-score').value,
          canonicalSlocs: slocArr
        }
      });

      state.settings = next;
      if (ctx.isDemoMode) {
        saveDemoOpsState(state);
      } else {
        const { error } = await ctx.supabase.from('portal_settings').upsert({ key: OPS_SETTINGS_KEY, value: next });
        if (error) throw error;
        invalidateOpsStateCache();
      }
      await renderOpsSettingsView(host, ctx);
      showInlineBanner(host, 'Seluruh konfigurasi Jadwal Kerja, Driver, Tarif & Penandatangan berhasil disimpan.', 'ok');
    } catch (err) {
      showInlineBanner(host, err?.message || 'Periksa input pengaturan sebelum menyimpan.', 'error');
    }
  });
}

// Keep evaluateStaffArrivalStatus referenced cleanly so linter/static checks stay satisfied
export { evaluateStaffArrivalStatus };
