// Operational Views: Attendance Upload, Calendar, Staff Management & Reports, Directory Delta & Cuti, Drivers & Payroll, Stationery & ATK, and System Operations Settings
import { DEFAULT_OPS_SETTINGS, normalizeOpsSettings } from './ops-settings-logic.js?v=20261123-hrga-workspace-18';
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
  SEED_DRIVER_ADJUSTMENTS,
  SEED_STAFF_REVIEWS
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
  evaluateCutiConfirmationGate
} from './attendance-logic.js?v=20261123-hrga-workspace-18';
import {
  computeDriverWorkHours,
  validateDriverSchedules,
  generateDriverChecksheetGrid,
  calculateDriverPayroll,
  terbilangRupiah
} from './driver-logic.js?v=20261123-hrga-workspace-18';
import {
  resolveCanonicalSloc,
  applyStationeryTransaction,
  buildStationeryReports
} from './stationery-logic.js?v=20261123-hrga-workspace-18';
import { parseEmployeeSpreadsheetRows, paginateRows } from './workspace-logic.js?v=20261123-hrga-workspace-18';

const DEMO_OPS_STORAGE_KEY = 'hrga_demo_ops_v1';
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

function openPrintHtml(title, bodyHtml) {
  const tab = window.open('', '_blank', 'noopener');
  if (!tab) return;
  const doc = tab.document;
  doc.open();
  doc.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#0f172a;margin:18px}
    h1,h2,h3{margin:0 0 6px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left;vertical-align:top}
    th{background:#f1f5f9;font-size:10.5px;text-transform:uppercase}
    .num{text-align:right;font-variant-numeric:tabular-nums}
    .meta{color:#475569;margin-bottom:10px;font-size:11px}
    .box{border:1px solid #94a3b8;padding:12px;margin-bottom:14px;page-break-inside:avoid}
    @media print{body{margin:10mm} .no-print{display:none}}
  </style></head><body>${bodyHtml}<script>window.onload=function(){try{window.print()}catch{}}</script></body></html>`);
  doc.close();
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
    conditionalHolidays: [],
    cutiBalances: structuredClone(SEED_CUTI_BALANCES),
    driverSchedules: structuredClone(SEED_DRIVER_SCHEDULES),
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
        conditionalHolidays: Array.isArray(raw.conditionalHolidays) ? raw.conditionalHolidays : [],
        cutiBalances: Array.isArray(raw.cutiBalances) ? raw.cutiBalances : seed.cutiBalances,
        driverSchedules: Array.isArray(raw.driverSchedules) ? raw.driverSchedules : seed.driverSchedules,
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
// 2. ATTENDANCE CALENDAR SETTINGS & CONDITIONAL HOLIDAY SCHEDULE
// ============================================================================
export async function renderAttendanceCalendarView(host, ctx) {
  const state = await loadOpsState(ctx);
  const currentMonth = host.dataset.calMonth || '2026-11';
  const [yr, mo] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(yr, mo, 0)).getUTCDate();
  const calMap = new Map(state.calendarDays.map(c => [c.cal_date, c]));

  const rowsHtml = Array.from({ length: daysInMonth }, (_, i) => {
    const dStr = `${yr}-${String(mo).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
    const dow = new Date(`${dStr}T00:00:00Z`).getUTCDay();
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const existing = calMap.get(dStr);
    const type = existing?.day_type || (dow === 0 ? 'WEEKEND' : 'WORKING');
    return `
      <tr>
        <td><b>${dStr}</b></td>
        <td>${dayNames[dow]}</td>
        <td>
          <select class="input ops-cal-type" data-date="${dStr}" aria-label="Tipe hari ${dStr}">
            <option value="WORKING" ${type === 'WORKING' ? 'selected' : ''}>WORKING (Hari Kerja)</option>
            <option value="WEEKEND" ${type === 'WEEKEND' ? 'selected' : ''}>WEEKEND (Libur Akhir Pekan)</option>
            <option value="HOLIDAY" ${type === 'HOLIDAY' ? 'selected' : ''}>HOLIDAY (Tanggal Merah)</option>
            <option value="CUTI_BERSAMA" ${type === 'CUTI_BERSAMA' ? 'selected' : ''}>CUTI_BERSAMA</option>
          </select>
        </td>
        <td><input type="text" class="input ops-cal-label" data-date="${dStr}" value="${esc(existing?.label || (dow === 0 ? 'Hari Minggu' : ''))}" placeholder="Keterangan hari libur"></td>
      </tr>
    `;
  }).join('');

  host.innerHTML = `
    <div class="card ops-card">
      <div class="ops-head">
        <div>
          <h2>Calendar Settings</h2>
          <p class="ops-sub">Atur hari kerja, hari libur nasional, dan cuti bersama yang langsung memengaruhi penentuan <code>O</code> / <code>L</code> / <code>H_LIBUR</code> dan pembobotan absensi.</p>
        </div>
        <div class="ops-actions">
          <input type="month" id="ops-cal-month" class="input" value="${esc(currentMonth)}" aria-label="Pilih bulan kalender">
          <button type="button" class="btn btn-primary" id="ops-cal-save">Simpan Kalender Bulan Ini</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Tanggal</th><th>Hari</th><th>Jenis Hari</th><th>Keterangan</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  `;

  host.querySelector('#ops-cal-month')?.addEventListener('change', e => {
    host.dataset.calMonth = e.target.value || '2026-11';
    renderAttendanceCalendarView(host, ctx);
  });

  host.querySelector('#ops-cal-save')?.addEventListener('click', async () => {
    const entries = [...host.querySelectorAll('.ops-cal-type')].map(sel => {
      const date = sel.dataset.date;
      const label = host.querySelector(`.ops-cal-label[data-date="${date}"]`)?.value?.trim() || '';
      return { cal_date: date, day_type: sel.value, label, notes: '' };
    });
    const nonWorking = entries.filter(e => e.day_type !== 'WORKING' || e.label);
    if (ctx.isDemoMode) {
      const others = state.calendarDays.filter(c => !c.cal_date.startsWith(currentMonth));
      state.calendarDays = [...others, ...nonWorking].sort((a, b) => a.cal_date.localeCompare(b.cal_date));
      saveDemoOpsState(state);
    } else {
      const { error } = await ctx.supabase.from('attendance_calendar_days').upsert(entries, { onConflict: 'cal_date' });
      if (error) {
        showInlineBanner(host, `Gagal menyimpan kalender: ${error.message}`, 'error');
        return;
      }
      invalidateOpsStateCache();
    }
    showInlineBanner(host, `Kalender ${currentMonth} berhasil disimpan.`, 'ok');
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
      // Support row 0 metadata header automatically
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
// 4. STAFF ATTENDANCE MANAGEMENT & REPORTS
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

  host.innerHTML = `
    <div class="ops-stack">
      <div class="card ops-card">
        <div class="ops-head">
          <div>
            <h2>Staff Attendance Management</h2>
            <p class="ops-sub">Periode cutoff <b>${esc(computed.window.startDate)}</b> s/d <b>${esc(computed.window.endDate)}</b>. Batas tepat waktu Mitra <code>&le; ${esc(attCfg.mitraLateCutoffTime)}</code>, Driver dikecualikan: <b>${attCfg.exemptDriverLateFlag ? 'Ya' : 'Tidak'}</b>. Koreksi HR terkonfirmasi tetap terkunci saat re-upload.</p>
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
        <div class="card kpi-card"><div class="kpi-label">Bobot Terlambat / Libur</div><div class="kpi-val">-${attCfg.latePenaltyWeight} / +${attCfg.holidayCreditWeight}</div></div>
      </div>

      <div class="card ops-card">
        <h3>Ringkasan Kehadiran &amp; Koreksi Harian</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NIK</th>
                <th>Nama</th>
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
                const flaggedDay = row.days.find(d => d.code === 'PERLU_PEMERIKSAAN_HR' || d.code === 'T') || row.days.find(d => d.code !== 'O' && d.code !== '-');
                return `
                  <tr>
                    <td><code>${esc(row.employee_no)}</code></td>
                    <td><b>${esc(row.employee_name)}</b> ${row.is_driver ? '<span class="pill">Driver</span>' : ''}</td>
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
// 5. DRIVERS: MANUAL SCHEDULE, CHECKSHEET & CONSOLIDATION, PAYROLL & BKK/BKM
// ============================================================================
export async function renderDriverScheduleView(host, ctx) {
  const state = await loadOpsState(ctx);
  const allEmployees = getAllKnownEmployees(ctx);
  const drivers = allEmployees.filter(e => /SOPIR|DRIVER/i.test(e.position || ''));
  const driverList = drivers.length ? drivers : SEED_DRIVERS;
  const validation = validateDriverSchedules(state.driverSchedules, allEmployees, state.settings);
  const drvCfg = state.settings.driver;

  host.innerHTML = `
    <div class="ops-stack">
      <div class="card ops-card">
        <div class="ops-head">
          <div>
            <h2>Manual Driver Schedule</h2>
            <p class="ops-sub">Input penugasan harian sopir ke seksi <b>${esc(drvCfg.sections.join(', '))}</b> dengan detektor otomatis jadwal bentrok dan selisih format NIK.</p>
          </div>
        </div>
        ${validation.conflicts.length || validation.nikWarnings.length ? `
          <div class="ops-flash-banner ops-flash-warn" role="alert">
            <b>Peringatan Validasi:</b> ${validation.conflicts.length} konflik jadwal, ${validation.nikWarnings.length} catatan NIK.
            ${validation.conflicts.map(c => `<div>• ${esc(c.message)}</div>`).join('')}
            ${validation.nikWarnings.map(w => `<div>• ${esc(w.message)}</div>`).join('')}
          </div>
        ` : ''}
        <div class="ops-form-grid">
          <label class="ops-field"><span>Tanggal</span><input id="ops-ds-date" type="date" class="input" value="2026-11-05"></label>
          <label class="ops-field"><span>Driver</span>
            <select id="ops-ds-driver" class="input">
              ${driverList.map(d => `<option value="${esc(d.employee_no)}">${esc(d.employee_no)} — ${esc(d.full_name)}</option>`).join('')}
            </select>
          </label>
          <label class="ops-field"><span>Seksi</span>
            <select id="ops-ds-section" class="input">
              ${drvCfg.sections.map(sec => `<option value="${esc(sec)}">${esc(sec)}</option>`).join('')}
            </select>
          </label>
          <label class="ops-field"><span>Jam Mulai</span><input id="ops-ds-start" type="time" class="input" value="07:00"></label>
          <label class="ops-field"><span>Jam Selesai</span><input id="ops-ds-end" type="time" class="input" value="18:00"></label>
          <label class="ops-field"><span>Jenis Hari</span>
            <select id="ops-ds-holiday" class="input">
              <option value="false">Hari Kerja (Weekday)</option>
              <option value="true">Hari Libur / Minggu (Holiday OT)</option>
            </select>
          </label>
          <label class="ops-field"><span>Tujuan / Nopol</span><input id="ops-ds-dest" type="text" class="input" placeholder="Surabaya / N 8142 WA"></label>
          <div class="ops-field ops-field-end"><button type="button" class="btn btn-primary" id="ops-ds-add">Simpan Jadwal</button></div>
        </div>
      </div>

      <div class="card ops-card">
        <h3>Daftar Penugasan Driver (${state.driverSchedules.length})</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Tanggal</th><th>NIK</th><th>Nama Driver</th><th>Seksi</th><th>Jam Kerja</th><th>Status Hari</th><th class="num">Normal</th><th class="num">Lembur</th><th>Tujuan</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              ${state.driverSchedules.map(s => `
                <tr>
                  <td>${esc(s.work_date)}</td>
                  <td><code>${esc(s.employee_no)}</code></td>
                  <td><b>${esc(s.driver_name)}</b></td>
                  <td><span class="pill">${esc(s.section)}</span></td>
                  <td>${esc(s.start_time)} – ${esc(s.end_time)}</td>
                  <td>${s.is_holiday ? '<span class="pill gold">Holiday</span>' : 'Weekday'}</td>
                  <td class="num">${s.normal_hours}j</td>
                  <td class="num"><b>${s.overtime_hours}j</b></td>
                  <td>${esc(s.destination || s.vehicle_no || '-')}</td>
                  <td><button type="button" class="btn btn-sm btn-secondary ops-ds-del" data-id="${esc(s.id)}">Hapus</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  host.querySelector('#ops-ds-add')?.addEventListener('click', async () => {
    const work_date = host.querySelector('#ops-ds-date')?.value;
    const employee_no = host.querySelector('#ops-ds-driver')?.value;
    const section = host.querySelector('#ops-ds-section')?.value || 'Support';
    const start_time = host.querySelector('#ops-ds-start')?.value || '07:00';
    const end_time = host.querySelector('#ops-ds-end')?.value || '15:00';
    const is_holiday = host.querySelector('#ops-ds-holiday')?.value === 'true';
    const destination = host.querySelector('#ops-ds-dest')?.value?.trim() || '';
    const emp = driverList.find(d => d.employee_no === employee_no);
    const hrs = computeDriverWorkHours(start_time, end_time, {
      normalWorkHours: drvCfg.normalWorkHours,
      isHoliday: is_holiday
    });
    const newRow = {
      id: `ds-${Date.now()}`,
      work_date,
      employee_no,
      driver_name: emp?.full_name || employee_no,
      section,
      start_time,
      end_time,
      is_holiday,
      normal_hours: hrs.normalHours,
      overtime_hours: hrs.overtimeHours,
      destination,
      notes: ''
    };
    const nextCheck = validateDriverSchedules([...state.driverSchedules, newRow], allEmployees, state.settings);
    if (!nextCheck.valid) {
      showInlineBanner(host, nextCheck.conflicts[0]?.message || 'Jadwal bentrok pada tanggal dan jam yang sama.', 'error');
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
    await renderDriverScheduleView(host, ctx);
    showInlineBanner(host, `Jadwal ${newRow.driver_name} (${newRow.work_date}) tersimpan.`, 'ok');
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
  const grid = generateDriverChecksheetGrid(state.driverSchedules, 6, 22);
  const payroll = calculateDriverPayroll({
    periodKey: '2026-11-P1',
    schedules: state.driverSchedules,
    adjustmentsByNik: state.driverAdjustments,
    employees: getAllKnownEmployees(ctx),
    settings: state.settings
  });

  host.innerHTML = `
    <div class="ops-stack">
      <div class="card ops-card">
        <div class="ops-head">
          <div>
            <h2>Driver Time Checksheet &amp; Konsolidasi Seksi</h2>
            <p class="ops-sub">Legenda: <code>S</code> Masuk/Kerja · <code>I</code> Istirahat · <code>R</code> Ritase · <code>L</code> Lembur · <code>O</code> Off</p>
          </div>
          <div class="ops-actions">
            <button type="button" class="btn btn-secondary" id="ops-drv-cs-print">Cetak Checksheet</button>
          </div>
        </div>
        <div class="table-wrap ops-checksheet-wrap">
          <table class="ops-checksheet-table">
            <thead>
              <tr>
                <th>Tanggal</th><th>Driver</th><th>Seksi</th>
                ${grid.hours.map(h => `<th>${String(h).padStart(2, '0')}</th>`).join('')}
                <th class="num">OT</th>
              </tr>
            </thead>
            <tbody>
              ${grid.rows.map(r => `
                <tr>
                  <td>${esc(r.work_date)}</td>
                  <td><b>${esc(r.driver_name)}</b></td>
                  <td>${esc(r.section)}</td>
                  ${r.cells.map(c => `<td class="ops-cs-cell ops-cs-${c}">${c}</td>`).join('')}
                  <td class="num"><b>${r.overtime_hours}</b></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card ops-card">
        <h3>Ringkasan per Seksi Operasional</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Seksi</th><th class="num">Total Shift</th><th class="num">Jam Normal</th><th class="num">Jam Lembur</th><th class="num">Nominal Lembur</th><th class="num">Subtotal Gaji + Lembur</th></tr></thead>
            <tbody>
              ${payroll.sections.map(s => `
                <tr>
                  <td><b>${esc(s.section)}</b></td>
                  <td class="num">${s.shifts}</td>
                  <td class="num">${s.normalHours} jam</td>
                  <td class="num">${s.overtimeHours} jam</td>
                  <td class="num">${fmtIdr(s.overtimePay)}</td>
                  <td class="num"><b>${fmtIdr(s.grossPay)}</b></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  host.querySelector('#ops-drv-cs-print')?.addEventListener('click', () => {
    openPrintHtml('Time Checksheet Driver', `<h2>TIME CHECKSHEET DRIVER</h2>${host.querySelector('.ops-checksheet-wrap').innerHTML}`);
  });
}

export async function renderDriverReportsView(host, ctx) {
  const state = await loadOpsState(ctx);
  const employees = getAllKnownEmployees(ctx);
  let payroll;
  let rulesError = '';
  try {
    payroll = calculateDriverPayroll({
      periodKey: '2026-11-P1',
      schedules: state.driverSchedules,
      adjustmentsByNik: state.driverAdjustments,
      employees,
      settings: state.settings
    });
  } catch (err) {
    rulesError = err.message;
  }

  if (rulesError) {
    host.innerHTML = `<div class="card ops-card"><div class="ops-flash-banner ops-flash-error">${esc(rulesError)}</div></div>`;
    return;
  }

  host.innerHTML = `
    <div class="ops-stack">
      <div class="card ops-card">
        <div class="ops-head">
          <div>
            <h2>Driver Payroll, Claim, BPJS, Slip Gaji &amp; BKK/BKM</h2>
            <p class="ops-sub">Upah Harian: <code>${fmtIdr(state.settings.driver.defaultMonthlyWage)} / ${state.settings.driver.workingDayDivisor} = ${fmtIdr(state.settings.driver.defaultDailyWage)}/hari</code> · Claim: <code>${fmtIdr(state.settings.driver.claimDailyBase)} / ${state.settings.driver.claimHoursDivisor} jam</code> · Fee BKK: <b>${(state.settings.driver.bkkFeeRate * 100).toFixed(1)}%</b> · PPh: <b>${(state.settings.driver.pphFeeRate * 100).toFixed(1)}%</b>.</p>
          </div>
          <div class="ops-actions">
            <button type="button" class="btn btn-secondary" id="ops-drv-slip-print">Cetak Slip Gaji</button>
            <button type="button" class="btn btn-secondary" id="ops-drv-bkk-print">Cetak BKK / BKM</button>
            <button type="button" class="btn btn-primary" id="ops-drv-xlsx">Export Payroll XLSX</button>
          </div>
        </div>

        <div class="table-wrap" style="margin-top:12px">
          <table>
            <thead>
              <tr>
                <th>NIK</th>
                <th>Nama Driver</th>
                <th class="num">Hadir (H)</th>
                <th class="num">Gaji Pokok</th>
                <th class="num">Jam OT</th>
                <th class="num">Nominal Lembur</th>
                <th class="num">Kurang Lalu</th>
                <th class="num">Pot. BPJS</th>
                <th class="num">Jam Claim</th>
                <th class="num">Pot. Claim</th>
                <th class="num">Gaji Bersih</th>
              </tr>
            </thead>
            <tbody>
              ${payroll.drivers.map(d => `
                <tr>
                  <td><code>${esc(d.employee_no)}</code></td>
                  <td><b>${esc(d.driver_name)}</b></td>
                  <td class="num">${d.presentDays}</td>
                  <td class="num">${fmtIdr(d.basicPay)}</td>
                  <td class="num">${d.overtimeHours}j</td>
                  <td class="num">${fmtIdr(d.overtimePay)}</td>
                  <td class="num"><input type="number" class="input ops-adj-short" data-nik="${esc(d.employee_no)}" value="${d.priorShortfall}" style="width:95px" aria-label="Kekurangan bulan lalu ${esc(d.driver_name)}"></td>
                  <td class="num"><input type="number" class="input ops-adj-bpjs" data-nik="${esc(d.employee_no)}" value="${d.bpjsDeduction}" style="width:95px" aria-label="Potongan BPJS ${esc(d.driver_name)}"></td>
                  <td class="num"><input type="number" step="0.5" class="input ops-adj-claim" data-nik="${esc(d.employee_no)}" value="${d.claimHours}" style="width:70px" aria-label="Jam claim ${esc(d.driver_name)}"></td>
                  <td class="num">${fmtIdr(d.claimDeduction)}</td>
                  <td class="num"><b>${fmtIdr(d.netPay)}</b></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <th colspan="2">GRAND TOTAL</th>
                <th class="num">${payroll.grandTotal.presentDays}</th>
                <th class="num">${fmtIdr(payroll.grandTotal.basicPay)}</th>
                <th class="num">${payroll.grandTotal.overtimeHours}j</th>
                <th class="num">${fmtIdr(payroll.grandTotal.overtimePay)}</th>
                <th class="num">${fmtIdr(payroll.grandTotal.priorShortfall)}</th>
                <th class="num">${fmtIdr(payroll.grandTotal.bpjsDeduction)}</th>
                <th></th>
                <th class="num">${fmtIdr(payroll.grandTotal.claimDeduction)}</th>
                <th class="num"><b>${fmtIdr(payroll.grandTotal.netPay)}</b></th>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style="margin-top:10px;display:flex;justify-content:flex-end">
          <button type="button" class="btn btn-primary" id="ops-drv-save-adj">Simpan &amp; Hitung Ulang Potongan</button>
        </div>
      </div>

      <div class="card ops-card">
        <h3>Rekap Voucher BKK / BKM per Seksi (Fee ${(state.settings.driver.bkkFeeRate * 100).toFixed(0)}% &amp; PPh ${(state.settings.driver.pphFeeRate * 100).toFixed(0)}%)</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Seksi</th><th class="num">Subtotal Gaji</th><th class="num">Fee Managemen</th><th class="num">Total Rp BKK</th><th class="num">PPh Atas Fee</th><th class="num">Net Transfer</th><th>Terbilang Net Transfer</th></tr>
            </thead>
            <tbody>
              ${payroll.bkkRows.map(b => `
                <tr>
                  <td><b>${esc(b.section)}</b></td>
                  <td class="num">${fmtIdr(b.subtotalGaji)}</td>
                  <td class="num">${fmtIdr(b.feeAmount)}</td>
                  <td class="num"><b>${fmtIdr(b.totalBkk)}</b></td>
                  <td class="num">${fmtIdr(b.pphAmount)}</td>
                  <td class="num"><b>${fmtIdr(b.netTransfer)}</b></td>
                  <td><small>${esc(b.terbilangTransfer)}</small></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <th>TOTAL BKK/BKM</th>
                <th class="num">${fmtIdr(payroll.bkkTotals.subtotalGaji)}</th>
                <th class="num">${fmtIdr(payroll.bkkTotals.feeAmount)}</th>
                <th class="num">${fmtIdr(payroll.bkkTotals.totalBkk)}</th>
                <th class="num">${fmtIdr(payroll.bkkTotals.pphAmount)}</th>
                <th class="num">${fmtIdr(payroll.bkkTotals.netTransfer)}</th>
                <th><small>${esc(payroll.bkkTotals.terbilangTransfer)}</small></th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  `;

  host.querySelector('#ops-drv-save-adj')?.addEventListener('click', async () => {
    const nextAdj = { ...state.driverAdjustments };
    host.querySelectorAll('.ops-adj-short').forEach(inp => {
      const nik = inp.dataset.nik;
      const bpjs = Number(host.querySelector(`.ops-adj-bpjs[data-nik="${nik}"]`)?.value || 0);
      const claim = Number(host.querySelector(`.ops-adj-claim[data-nik="${nik}"]`)?.value || 0);
      nextAdj[nik] = { priorShortfall: Number(inp.value || 0), bpjsDeduction: bpjs, claimHours: claim };
    });
    state.driverAdjustments = nextAdj;
    if (ctx.isDemoMode) {
      saveDemoOpsState(state);
    } else {
      const { error } = await ctx.supabase.from('portal_settings').upsert({ key: DRIVER_ADJUSTMENTS_KEY, value: nextAdj });
      if (error) {
        showInlineBanner(host, `Gagal menyimpan potongan BPJS/Claim driver: ${error.message}`, 'error');
        return;
      }
      invalidateOpsStateCache();
    }
    await renderDriverReportsView(host, ctx);
    showInlineBanner(host, 'Potongan BPJS/Claim dan rekap BKK berhasil diperbarui.', 'ok');
  });

  host.querySelector('#ops-drv-xlsx')?.addEventListener('click', async () => {
    const aoa = [
      ['NIK', 'Nama Driver', 'Hadir', 'Gaji Pokok', 'Jam OT', 'Lembur', 'Kurang Lalu', 'BPJS', 'Claim', 'Gaji Bersih'],
      ...payroll.drivers.map(d => [
        d.employee_no, d.driver_name, d.presentDays, d.basicPay, d.overtimeHours,
        d.overtimePay, d.priorShortfall, d.bpjsDeduction, d.claimDeduction, d.netPay
      ])
    ];
    await exportSheetXlsx(`Gaji_Driver_${payroll.periodKey}.xlsx`, 'Gaji Driver', aoa);
  });

  host.querySelector('#ops-drv-slip-print')?.addEventListener('click', () => {
    const slips = payroll.drivers.map(d => `
      <div class="box">
        <h3>SLIP GAJI DRIVER — PT. MITRA BINAMANDIRI MAKMUR</h3>
        <div class="meta">NIK: <b>${esc(d.employee_no)}</b> · Nama: <b>${esc(d.driver_name)}</b> · Periode: ${esc(payroll.periodKey)}</div>
        <table>
          <tr><td>Gaji Pokok (${d.presentDays} hari x ${fmtIdr(d.dailyWage)})</td><td class="num">${fmtIdr(d.basicPay)}</td></tr>
          <tr><td>Lembur (${d.overtimeHours} jam)</td><td class="num">${fmtIdr(d.overtimePay)}</td></tr>
          <tr><td>Kekurangan Bulan Lalu</td><td class="num">${fmtIdr(d.priorShortfall)}</td></tr>
          <tr><td>Potongan BPJS</td><td class="num">- ${fmtIdr(d.bpjsDeduction)}</td></tr>
          <tr><td>Potongan Claim (${d.claimHours} jam)</td><td class="num">- ${fmtIdr(d.claimDeduction)}</td></tr>
          <tr><th>TOTAL DITERIMA BERSIH</th><th class="num">${fmtIdr(d.netPay)}</th></tr>
        </table>
        <div style="margin-top:6px"><i>Terbilang: ${esc(terbilangRupiah(d.netPay))}</i></div>
      </div>
    `).join('');
    openPrintHtml(`Slip Gaji Driver ${payroll.periodKey}`, slips);
  });

  host.querySelector('#ops-drv-bkk-print')?.addEventListener('click', () => {
    openPrintHtml(`BKK BKM Driver ${payroll.periodKey}`, `
      <h2>BUKTI KAS KELUAR (BKK) — PEMBAYARAN DRIVER HARIAN</h2>
      <div class="meta">Periode: ${esc(payroll.periodKey)} · Total Transfer: ${fmtIdr(payroll.bkkTotals.netTransfer)}</div>
      <div class="box">
        <table>
          <thead><tr><th>Seksi</th><th class="num">Subtotal Gaji</th><th class="num">Fee 10%</th><th class="num">Total BKK</th><th class="num">PPh 2%</th><th class="num">Net Transfer</th></tr></thead>
          <tbody>
            ${payroll.bkkRows.map(b => `<tr><td>${esc(b.section)}</td><td class="num">${fmtIdr(b.subtotalGaji)}</td><td class="num">${fmtIdr(b.feeAmount)}</td><td class="num">${fmtIdr(b.totalBkk)}</td><td class="num">${fmtIdr(b.pphAmount)}</td><td class="num"><b>${fmtIdr(b.netTransfer)}</b></td></tr>`).join('')}
          </tbody>
        </table>
        <p style="margin-top:8px"><b>Terbilang:</b> ${esc(payroll.bkkTotals.terbilangTransfer)}</p>
      </div>
    `);
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
            <p class="ops-sub">Setiap transaksi tervalidasi saldo akhir <b>&ge; 0</b> (stok minus seperti kasus Excel lama diblokir) dan SLOC langsung dipetakan ke nama kanonik (<code>GUDANG &rarr; INVENTORY &amp; GUDANG</code>, dll).</p>
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
// 7. SYSTEM SETTINGS -> OPERATIONS & FORMULAS (ROOT ADMIN ONLY)
// ============================================================================
export async function renderOpsSettingsView(host, ctx) {
  const state = await loadOpsState(ctx);
  const s = state.settings;
  const activeTab = host.dataset.opsSetTab || 'attendance';

  host.innerHTML = `
    <div class="ops-stack">
      <div class="card ops-card">
        <div class="ops-head">
          <div>
            <h2>System &amp; Settings — Operations, Formulas &amp; Workflows</h2>
            <p class="ops-sub">Seluruh parameter cutoff, batas terlambat, pembobotan absensi, kuota cuti, tarif gaji &amp; lembur driver, dan SLOC ATK dapat diubah fleksibel tanpa menyentuh kode.</p>
          </div>
          <div class="ops-actions">
            <button type="button" class="btn btn-secondary" id="ops-set-reset">Reset Default Pabrik</button>
            <button type="button" class="btn btn-primary" id="ops-set-save">Simpan Semua Pengaturan</button>
          </div>
        </div>
        <div class="tab-bar" role="tablist" style="margin-top:12px">
          <button type="button" class="tab-btn ${activeTab === 'attendance' ? 'active' : ''}" data-tab="attendance">Attendance &amp; Staff</button>
          <button type="button" class="tab-btn ${activeTab === 'cuti' ? 'active' : ''}" data-tab="cuti">Cuti Policy</button>
          <button type="button" class="tab-btn ${activeTab === 'driver' ? 'active' : ''}" data-tab="driver">Driver &amp; Payroll Tariffs</button>
          <button type="button" class="tab-btn ${activeTab === 'stationery' ? 'active' : ''}" data-tab="stationery">Stationery &amp; SLOC</button>
        </div>
      </div>

      <div class="card ops-card ${activeTab === 'attendance' ? '' : 'hidden'}" data-panel="attendance">
        <h3>Aturan Periode Cutoff, Keterlambatan &amp; Bobot Kehadiran Staff</h3>
        <div class="ops-form-grid">
          <label class="ops-field"><span>Hari Mulai Cutoff</span><input id="set-att-start" type="number" class="input" value="${s.attendance.cutoffStartDay}"></label>
          <label class="ops-field"><span>Hari Akhir Cutoff</span><input id="set-att-end" type="number" class="input" value="${s.attendance.cutoffEndDay}"></label>
          <label class="ops-field"><span>Batas Tepat Waktu Mitra (HH:MM:SS)</span><input id="set-att-mitra-late" type="text" class="input" value="${esc(s.attendance.mitraLateCutoffTime)}"></label>
          <label class="ops-field"><span>Batas Tepat Waktu Radin (HH:MM:SS)</span><input id="set-att-radin-late" type="text" class="input" value="${esc(s.attendance.radinLateCutoffTime)}"></label>
          <label class="ops-field"><span>Basis Hari Kerja</span><input id="set-att-basis" type="number" class="input" value="${s.attendance.workingDaysBasis}"></label>
          <label class="ops-field"><span>Batas Maksimal Hari Dibayar (Cap)</span><input id="set-att-cap" type="number" class="input" value="${s.attendance.maxPaidDaysCap}"></label>
          <label class="ops-field"><span>Bobot Potongan Terlambat (T)</span><input id="set-att-tweight" type="number" step="0.05" class="input" value="${s.attendance.latePenaltyWeight}"></label>
          <label class="ops-field"><span>Kredit Masuk Hari Libur</span><input id="set-att-hweight" type="number" step="0.05" class="input" value="${s.attendance.holidayCreditWeight}"></label>
          <label class="ops-field"><span>Ambang SP (Rasio Ketidakhadiran)</span><input id="set-att-warn" type="number" step="0.01" class="input" value="${s.attendance.warningAbsenceThreshold}"></label>
          <label class="ops-field"><span>Default Hari Kerja Tanpa Tap</span>
            <select id="set-att-nopunch" class="input">
              <option value="PERLU_PEMERIKSAAN_HR" ${s.attendance.autoMarkNoPunchAs === 'PERLU_PEMERIKSAAN_HR' ? 'selected' : ''}>Perlu Pemeriksaan HR (Aman)</option>
              <option value="A" ${s.attendance.autoMarkNoPunchAs === 'A' ? 'selected' : ''}>Alpa (A) Otomatis</option>
            </select>
          </label>
          <label class="ops-check"><input id="set-att-exempt-drv" type="checkbox" ${s.attendance.exemptDriverLateFlag ? 'checked' : ''}> <span>Kecualikan Driver / Sopir dari status Terlambat (T)</span></label>
          <label class="ops-check"><input id="set-att-lock-rev" type="checkbox" ${s.attendance.preserveConfirmedReviews ? 'checked' : ''}> <span>Kunci koreksi HR terkonfirmasi saat upload ulang</span></label>
        </div>
      </div>

      <div class="card ops-card ${activeTab === 'cuti' ? '' : 'hidden'}" data-panel="cuti">
        <h3>Aturan Kuota &amp; Gerbang Konfirmasi Cuti</h3>
        <div class="ops-form-grid">
          <label class="ops-field"><span>Kuota Cuti Tahunan Default</span><input id="set-cuti-quota" type="number" class="input" value="${s.cuti.defaultAnnualQuota}"></label>
          <label class="ops-field"><span>Potongan Cuti Bersama</span><input id="set-cuti-bersama" type="number" class="input" value="${s.cuti.cutiBersamaDeduction}"></label>
          <label class="ops-field"><span>Ambang Hari Peringatan Pembaruan</span><input id="set-cuti-days" type="number" class="input" value="${s.cuti.confirmationDaysThreshold}"></label>
          <label class="ops-check"><input id="set-cuti-gate" type="checkbox" ${s.cuti.enableConfirmationGate ? 'checked' : ''}> <span>Aktifkan Gerbang Konfirmasi Pembaruan Cuti</span></label>
        </div>
      </div>

      <div class="card ops-card ${activeTab === 'driver' ? '' : 'hidden'}" data-panel="driver">
        <h3>Formula Gaji Driver, Claim, BPJS, BKK/BKM &amp; Tabel Tarif Lembur</h3>
        <div class="ops-form-grid">
          <label class="ops-field"><span>Upah Bulanan Dasar Driver</span><input id="set-drv-monthly" type="number" class="input" value="${s.driver.defaultMonthlyWage}"></label>
          <label class="ops-field"><span>Pembagi Hari Kerja</span><input id="set-drv-div" type="number" class="input" value="${s.driver.workingDayDivisor}"></label>
          <label class="ops-field"><span>Basis Claim / Hari</span><input id="set-drv-claim-base" type="number" class="input" value="${s.driver.claimDailyBase}"></label>
          <label class="ops-field"><span>Pembagi Jam Claim</span><input id="set-drv-claim-hrs" type="number" class="input" value="${s.driver.claimHoursDivisor}"></label>
          <label class="ops-field"><span>Tarif Fee BKK/BKM (Desimal, mis. 0.10)</span><input id="set-drv-fee" type="number" step="0.01" class="input" value="${s.driver.bkkFeeRate}"></label>
          <label class="ops-field"><span>Tarif PPh Atas Fee (Desimal, mis. 0.02)</span><input id="set-drv-pph" type="number" step="0.01" class="input" value="${s.driver.pphFeeRate}"></label>
          <label class="ops-field"><span>Ekstra / 0.5 Jam OT Hari Kerja (Lanjutan)</span><input id="set-drv-wk-ext" type="number" class="input" value="${s.driver.extraWeekdayHalfHourIncrement}"></label>
          <label class="ops-field"><span>Ekstra / 0.5 Jam OT Hari Libur (Lanjutan)</span><input id="set-drv-hol-ext" type="number" class="input" value="${s.driver.extraHolidayHalfHourIncrement}"></label>
          <label class="ops-check"><input id="set-drv-confirmed" type="checkbox" ${s.driver.payrollRulesConfirmed ? 'checked' : ''}> <span>Aturan Tarif &amp; Lembur Driver Terkonfirmasi Aktif</span></label>
        </div>
        <div class="ops-form-grid" style="margin-top:12px">
          <label class="ops-field"><span>Tarif Lembur Hari Kerja (JSON)</span><textarea id="set-drv-wk-json" class="input" rows="5">${esc(JSON.stringify(s.driver.weekdayOvertimeTariff))}</textarea></label>
          <label class="ops-field"><span>Tarif Lembur Hari Libur (JSON)</span><textarea id="set-drv-hol-json" class="input" rows="5">${esc(JSON.stringify(s.driver.holidayOvertimeTariff))}</textarea></label>
        </div>
      </div>

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
      host.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === nextTab);
      });
      host.querySelectorAll('[data-panel]').forEach(panel => {
        panel.classList.toggle('hidden', panel.dataset.panel !== nextTab);
      });
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
    showInlineBanner(host, 'Seluruh parameter rumus dikembalikan ke standar awal.', 'ok');
  });

  host.querySelector('#ops-set-save')?.addEventListener('click', async () => {
    try {
      const wkJson = JSON.parse(host.querySelector('#set-drv-wk-json').value);
      const holJson = JSON.parse(host.querySelector('#set-drv-hol-json').value);
      const slocArr = host.querySelector('#set-stk-slocs').value.split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
      const next = normalizeOpsSettings({
        attendance: {
          ...s.attendance,
          cutoffStartDay: host.querySelector('#set-att-start').value,
          cutoffEndDay: host.querySelector('#set-att-end').value,
          mitraLateCutoffTime: host.querySelector('#set-att-mitra-late').value,
          radinLateCutoffTime: host.querySelector('#set-att-radin-late').value,
          workingDaysBasis: host.querySelector('#set-att-basis').value,
          maxPaidDaysCap: host.querySelector('#set-att-cap').value,
          latePenaltyWeight: host.querySelector('#set-att-tweight').value,
          holidayCreditWeight: host.querySelector('#set-att-hweight').value,
          warningAbsenceThreshold: host.querySelector('#set-att-warn').value,
          autoMarkNoPunchAs: host.querySelector('#set-att-nopunch').value,
          exemptDriverLateFlag: host.querySelector('#set-att-exempt-drv').checked,
          preserveConfirmedReviews: host.querySelector('#set-att-lock-rev').checked
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
          defaultMonthlyWage: host.querySelector('#set-drv-monthly').value,
          workingDayDivisor: host.querySelector('#set-drv-div').value,
          defaultDailyWage: Math.round(Number(host.querySelector('#set-drv-monthly').value) / Math.max(1, Number(host.querySelector('#set-drv-div').value))),
          claimDailyBase: host.querySelector('#set-drv-claim-base').value,
          claimHoursDivisor: host.querySelector('#set-drv-claim-hrs').value,
          bkkFeeRate: host.querySelector('#set-drv-fee').value,
          pphFeeRate: host.querySelector('#set-drv-pph').value,
          extraWeekdayHalfHourIncrement: host.querySelector('#set-drv-wk-ext').value,
          extraHolidayHalfHourIncrement: host.querySelector('#set-drv-hol-ext').value,
          payrollRulesConfirmed: host.querySelector('#set-drv-confirmed').checked,
          weekdayOvertimeTariff: wkJson,
          holidayOvertimeTariff: holJson
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
      showInlineBanner(host, 'Pengaturan Operations & Formulas berhasil disimpan dan aktif.', 'ok');
    } catch (err) {
      showInlineBanner(host, err?.message || 'Periksa format JSON/angka pengaturan sebelum menyimpan.', 'error');
    }
  });
}
