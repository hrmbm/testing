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


// Header tabel dapat diklik untuk mengurutkan baris naik/turun.
// Listener delegasi ini juga menangani tabel yang dirender ulang secara dinamis.
if (typeof document !== 'undefined' && !window.__portalTableSortingInstalled) {
  window.__portalTableSortingInstalled = true;
  const tableSortCollator = new Intl.Collator('id', { numeric: true, sensitivity: 'base' });
  document.addEventListener('click', event => {
    const header = event.target.closest('table thead th');
    if (!header || header.dataset.sortable === 'false') return;
    const table = header.closest('table');
    const body = table?.tBodies?.[0];
    if (!body) return;

    const dataRows = [...body.rows].filter(row => !row.querySelector('.table-empty'));
    const emptyRows = [...body.rows].filter(row => row.querySelector('.table-empty'));
    if (dataRows.length < 2) return;

    const columnIndex = header.cellIndex;
    const direction = header.dataset.sortDirection === 'asc' ? 'desc' : 'asc';
    const multiplier = direction === 'asc' ? 1 : -1;
    const getValue = row => {
      const cell = row.cells[columnIndex];
      if (!cell) return '';
      const raw = (cell.dataset.sortValue ?? cell.innerText ?? cell.textContent ?? '').trim().replace(/\s+/g, ' ');
      return raw === '—' ? '' : raw;
    };
    const comparable = value => {
      if (/^-?\d+(?:[.,]\d+)?%?$/.test(value)) return { type: 'number', value: Number(value.replace(',', '.').replace('%', '')) };
      if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return { type: 'date', value: Date.parse(value) };
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
