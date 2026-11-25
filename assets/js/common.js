export const $ = (selector, root=document) => root.querySelector(selector);
export const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
export const esc = (value='') => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const idDate = value => value ? new Date(value).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '—';
export const ageFrom = value => {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`); if (Number.isNaN(d.getTime())) return '';
  const now = new Date(); let n = now.getFullYear()-d.getFullYear();
  if (now.getMonth()<d.getMonth() || (now.getMonth()===d.getMonth() && now.getDate()<d.getDate())) n--;
  return n >= 0 && n < 120 ? n : '';
};

const siteRoot = new URL('../../', import.meta.url);
const candidateRoutes = {1:'apply/',2:'form/',3:'disc/',4:'spm/'};
const CANDIDATE_NIK_CACHE = 'portal_candidate_nik_cache_v1';

export function cacheCandidateNik(nik) {
  const value = String(nik || '').replace(/\D/g, '');
  if (!/^\d{16}$/.test(value)) return;
  try {
    sessionStorage.setItem(CANDIDATE_NIK_CACHE, JSON.stringify({nik:value, savedAt:Date.now()}));
  } catch {}
}
export function getCachedCandidateNik(maxAgeMinutes=60) {
  try {
    const item = JSON.parse(sessionStorage.getItem(CANDIDATE_NIK_CACHE) || 'null');
    if (!item || !/^\d{16}$/.test(String(item.nik || '')) || Date.now() - Number(item.savedAt || 0) > maxAgeMinutes * 60000) {
      sessionStorage.removeItem(CANDIDATE_NIK_CACHE);
      return '';
    }
    return item.nik;
  } catch { return ''; }
}
export function clearCachedCandidateNik() {
  try { sessionStorage.removeItem(CANDIDATE_NIK_CACHE); } catch {}
}
export const stageUrl = (stage) => new URL(candidateRoutes[stage] || 'form/', siteRoot).href;
export function setCandidateMessage(root, title, body='', tone='success') {
  root.innerHTML = `<section class="candidate-card completion-card"><div class="completion-mark">${tone==='success'?'✓':'!'}</div><h1>${esc(title)}</h1><p>${esc(body)}</p></section>`;
}
export function showError(element, message) { if (element) element.textContent = message || ''; }
export function setBusy(button, busy, label='Memproses…') {
  if (!button) return;
  if (busy) { button.dataset.oldText = button.textContent; button.textContent = label; button.disabled = true; }
  else { button.textContent = button.dataset.oldText || button.textContent; button.disabled = false; }
}

export function formatAppError(err, fallback = 'Terjadi kesalahan sistem.') {
  if (!err) return fallback;
  const code = String(err?.code || '').trim().toUpperCase();
  const status = Number(err?.status || 0);
  const raw = String(err?.message || err?.error_description || err?.details || err?.hint || (typeof err === 'string' ? err : '')).trim();
  const combined = `${code} ${raw}`.trim();

  if (code === '42501' || status === 403 || /permission denied|row-level security|insufficient privilege|not authorized/i.test(combined)) {
    return 'Izin akses database ditolak (42501). Pastikan akun Anda terdaftar sebagai admin aktif dan skrip migrasi RLS terbaru sudah dijalankan di Supabase SQL Editor.';
  }
  if (code === '23505' || /duplicate key|already exists|unique constraint/i.test(combined)) {
    return 'Data duplikat terdeteksi (NIK/kode/kunci yang sama sudah ada). Periksa data sebelum menyimpan kembali.';
  }
  if (['PGRST204', '42703', '42P01'].includes(code) || /schema cache|column .* does not exist|relation .* does not exist|could not find the .* column/i.test(combined)) {
    return 'Kolom atau tabel database belum sinkron. Jalankan skrip migrasi database terbaru di Supabase SQL Editor.';
  }
  if (status === 401 || /jwt|token expired|invalid token|not authenticated/i.test(combined)) {
    return 'Sesi login Anda telah habis atau tidak valid. Silakan muat ulang halaman dan login kembali.';
  }
  if (/failed to fetch|networkerror|network request failed|fetch failed|timeout|econnrefused/i.test(combined)) {
    return 'Koneksi ke server database terputus atau gagal dijangkau. Periksa koneksi internet lalu coba lagi.';
  }
  return raw || fallback;
}

export async function savePortalSettingsBatch(supabase, entries) {
  if (!supabase) {
    return { error: new Error('Koneksi Supabase tidak tersedia.') };
  }
  const list = Array.isArray(entries) ? entries : [entries];
  const rows = list
    .filter(item => item && String(item.key || '').trim())
    .map(item => ({
      key: String(item.key).trim(),
      value: item.value
    }));
  if (!rows.length) return { error: null };

  const res = await supabase
    .from('portal_settings')
    .upsert(rows, { onConflict: 'key' });

  if (!res?.error) {
    return { error: null };
  }

  const errCode = String(res.error?.code || '').trim().toUpperCase();
  const errMsg = String(res.error?.message || '');
  if (errCode === '42501' || /permission denied|row-level security/i.test(errMsg)) {
    try {
      const rpcRes = await supabase.rpc('upsert_portal_settings_batch', { p_entries: rows });
      if (!rpcRes?.error) {
        return { error: null, viaRpc: true };
      }
      return { error: rpcRes.error || res.error };
    } catch {
      return { error: res.error };
    }
  }
  return { error: res.error };
}

const SORT_MONTHS = {
  jan: 0, januari: 0, january: 0,
  feb: 1, februari: 1, february: 1,
  mar: 2, maret: 2, march: 2,
  apr: 3, april: 3,
  mei: 4, may: 4,
  jun: 5, juni: 5, june: 5,
  jul: 6, juli: 6, july: 6,
  agu: 7, agt: 7, agustus: 7, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  okt: 9, oktober: 9, oct: 9, october: 9,
  nov: 10, november: 10,
  des: 11, desember: 11, dec: 11, december: 11
};

export function parseSortableDateMs(value = '') {
  const s = String(value ?? '').trim();
  if (!s || s === '-' || s === '—') return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return Date.UTC(y, m - 1, d, Number(iso[4] || 0), Number(iso[5] || 0), Number(iso[6] || 0));
    }
  }

  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    let day = Number(dmy[1]);
    let month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    if (month > 12 && day <= 12) [day, month] = [month, day];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return Date.UTC(year, month - 1, day);
    }
  }

  const named = s.match(/^(\d{1,2})[\s\-]+([a-zA-Z]+)[\s\-,]+(\d{2,4})$/);
  if (named) {
    const day = Number(named[1]);
    const month = SORT_MONTHS[named[2].toLowerCase()];
    let year = Number(named[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    if (month !== undefined && day >= 1 && day <= 31) {
      return Date.UTC(year, month, day);
    }
  }

  return null;
}

// Header tabel dapat diklik untuk mengurutkan baris naik/turun.
// Listener delegasi ini juga menangani tabel yang dirender ulang secara dinamis.
if (typeof document !== 'undefined' && !window.__portalTableSortingInstalled) {
  window.__portalTableSortingInstalled = true;
  const tableSortCollator = new Intl.Collator('id', { numeric: true, sensitivity: 'base' });
  document.addEventListener('click', event => {
    const header = event.target.closest('table thead th');
    if (!header || header.dataset.sortable === 'false' || header.dataset.noSort === 'true') return;
    const table = header.closest('table');
    if (!table || table.dataset.customSort === 'true') return;
    const body = table.tBodies?.[0];
    if (!body) return;

    const dataRows = [...body.rows].filter(row => !row.querySelector('.table-empty') && !row.querySelector('.empty'));
    const emptyRows = [...body.rows].filter(row => row.querySelector('.table-empty') || row.querySelector('.empty'));
    if (dataRows.length < 2) return;

    const columnIndex = header.cellIndex;
    const direction = header.dataset.sortDirection === 'asc' ? 'desc' : 'asc';
    const multiplier = direction === 'asc' ? 1 : -1;
    const getValue = row => {
      const cell = row.cells[columnIndex];
      if (!cell) return '';
      const rawVal = cell.dataset.sortValue !== undefined
        ? cell.dataset.sortValue
        : (cell.innerText ?? cell.textContent ?? '');
      const raw = String(rawVal).trim().replace(/\s+/g, ' ');
      return raw === '—' || raw === '-' ? '' : raw;
    };
    const comparable = value => {
      const dateMs = parseSortableDateMs(value);
      if (dateMs !== null) return { type: 'date', value: dateMs };
      if (/^-?\d+(?:[.,]\d+)?%?$/.test(value)) {
        return { type: 'number', value: Number(value.replace(',', '.').replace('%', '')) };
      }
      if (/^Rp\.?\s*-?[\d.,]+$/i.test(value) || /^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(value)) {
        const cleaned = value.replace(/^Rp\.?\s*/i, '').replace(/\./g, '').replace(',', '.');
        const num = Number(cleaned);
        if (Number.isFinite(num)) return { type: 'number', value: num };
      }
      return { type: 'text', value };
    };
    dataRows.sort((rowA, rowB) => {
      const valueA = getValue(rowA);
      const valueB = getValue(rowB);
      if (!valueA && !valueB) return 0;
      if (!valueA) return 1;
      if (!valueB) return -1;
      const a = comparable(valueA), b = comparable(valueB);
      if (a.type === b.type && a.type !== 'text') return (a.value - b.value) * multiplier;
      return tableSortCollator.compare(valueA, valueB) * multiplier;
    });

    table.querySelectorAll('thead th').forEach(th => {
      delete th.dataset.sortDirection;
      th.removeAttribute('aria-sort');
    });
    header.dataset.sortDirection = direction;
    header.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
    [...dataRows, ...emptyRows].forEach(row => body.append(row));
  });
}
