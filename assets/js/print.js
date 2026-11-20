import {
  TEMPLATE_URL,
  DEFAULT_MASTER_REVISION,
  REHOLZ_TEMPLATE_URL,
  REHOLZ_MASTER_REVISION,
  CV_BUCKET
} from './config.js?v=20261120-hrga-workspace-08';
import { supabase } from './supabase.js?v=20261120-hrga-workspace-08';
import { computeDisc } from './disc-engine.js?v=20261120-hrga-workspace-08';
import { esc } from './common.js?v=20261120-hrga-workspace-08';

const BRAND_LOGOS = {
  mitra: "data:image/png;base64,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",
  reholz: "data:image/png;base64,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"
};

const BRAND_CONFIGS = {
  mitra: {
    key: 'mitra',
    companyName: 'PT. Mitra Binamandiri Makmur',
    eyebrow: 'PT. MITRA BINAMANDIRI MAKMUR · ASESMEN PSIKOLOGIS',
    footerOrg: 'PT. Mitra Binamandiri Makmur · HR&GA Workspace',
    sigSeed: 'MBM',
    sigInitials: 'MB',
    logoAlt: 'Logo PT. Mitra Binamandiri Makmur',
    accents: {
      most: '#1a3052',
      least: '#b08d57',
      change: '#0d5c6b'
    }
  },
  reholz: {
    key: 'reholz',
    companyName: 'PT Radin Mitra Lestari',
    eyebrow: 'PT RADIN MITRA LESTARI · ASESMEN PSIKOLOGIS',
    footerOrg: 'PT Radin Mitra Lestari · HR&GA Workspace',
    sigSeed: 'RML',
    sigInitials: 'RM',
    logoAlt: 'Logo ReHolz · PT Radin Mitra Lestari',
    accents: {
      most: '#33463A',
      least: '#B77932',
      change: '#007850'
    }
  }
};

export function resolvePrintBrand(brand) {
  return String(brand || '').toLowerCase() === 'reholz' ? 'reholz' : 'mitra';
}

const printDate = d => new Date(d || Date.now()).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
const getDiscSubmission = record => Array.isArray(record?.disc_submissions) ? record.disc_submissions[0] : record?.disc_submissions;

async function renderPdfPages(url) {
  const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  const pdf = await pdfjs.getDocument({ url }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1.55 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    pages.push(canvas.toDataURL('image/jpeg', 0.92));
  }
  return pages;
}

const MONTH_SHORT_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function formatYm(ym) {
  const match = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return String(ym || '').trim();
  const m = Number(match[2]);
  return `${MONTH_SHORT_ID[m - 1] || match[2]} ${match[1]}`;
}
function deriveWorkPeriod(app, n) {
  const start = String(app[`kerja${n}_periode_mulai`] || '').trim();
  const end = String(app[`kerja${n}_periode_selesai`] || '').trim();
  if (!start && !end) return '';
  if (start && end) return `${formatYm(start)} – ${formatYm(end)}`;
  if (start) return `${formatYm(start)} – Sekarang`;
  return formatYm(end);
}
function deriveWorkDuration(app, n) {
  const s = String(app[`kerja${n}_periode_mulai`] || '').match(/^(\d{4})-(\d{2})$/);
  const e = String(app[`kerja${n}_periode_selesai`] || '').match(/^(\d{4})-(\d{2})$/);
  if (!s || !e) return '';
  const months = (Number(e[1]) * 12 + Number(e[2])) - (Number(s[1]) * 12 + Number(s[2])) + 1;
  if (months <= 0) return '';
  const yrs = Math.floor(months / 12);
  const rem = months % 12;
  if (yrs && rem) return `${yrs} Thn ${rem} Bln`;
  if (yrs) return `${yrs} Tahun`;
  return `${rem} Bulan`;
}
function signatureInitials(fullName, brandKey = 'mitra') {
  const cfg = BRAND_CONFIGS[resolvePrintBrand(brandKey)];
  const cleaned = String(fullName || '').replace(/,.*$/, '').trim();
  if (!cleaned) return cfg.sigInitials;
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function signatureRefCode(name, nik, date, brandKey = 'mitra') {
  const cfg = BRAND_CONFIGS[resolvePrintBrand(brandKey)];
  const seed = `${String(name || '').trim()}|${String(nik || '').trim()}|${String(date || '').trim()}|${cfg.sigSeed}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const nikSeg = String(nik || '').replace(/\D/g, '').slice(0, 6) || '000000';
  return `${cfg.sigSeed}-${nikSeg}-${hex.slice(0, 4)}`;
}

function fillMaster(doc, data, record = {}, brandKey = 'mitra') {
  const app = data || {};
  const shortGender = { 'Laki-laki': 'L', 'Perempuan': 'P' };
  const approvalDateFallback = (record.created_at || record.updated_at || '').slice(0, 10);

  doc.querySelectorAll('#applicationForm [name]').forEach(el => {
    const name = el.getAttribute('name');
    let value = app[name] ?? '';
    const fillPath = el.getAttribute('data-application-fill');
    if (fillPath === 'applicant.full_name' || name === 'nama_terang') value = record.full_name || app.nama || value;
    if (name === 'tanggal_persetujuan' && !value && approvalDateFallback) value = approvalDateFallback;
    if (name === 'gender' && shortGender[value]) value = shortGender[value];
    if (/_lp$/.test(name) && shortGender[value]) value = shortGender[value];
    if (/^bahasa[1-4]$/.test(name) && value === 'Lainnya' && app[`${name}_lainnya`]) value = app[`${name}_lainnya`];
    const workPeriodMatch = name.match(/^kerja([1-3])_periode$/);
    if (workPeriodMatch && !value) value = deriveWorkPeriod(app, workPeriodMatch[1]);
    const workDurMatch = name.match(/^kerja([1-3])_durasi$/);
    if (workDurMatch && !value) value = deriveWorkDuration(app, workDurMatch[1]);

    if (el.type === 'radio') {
      const checked = String(value) === el.value;
      el.checked = checked;
      if (checked) el.setAttribute('checked', 'checked'); else el.removeAttribute('checked');
    } else if (el.type === 'checkbox') {
      const checked = Array.isArray(value)
        ? value.map(String).includes(String(el.value))
        : value === true || value === 'true' || value === '1' || value === 'on';
      el.checked = checked;
      if (checked) el.setAttribute('checked', 'checked'); else el.removeAttribute('checked');
    } else if (el.tagName === 'SELECT') {
      el.value = String(value);
      [...el.options].forEach(option => {
        if (option.value === String(value)) option.setAttribute('selected', 'selected');
        else option.removeAttribute('selected');
      });
    } else if (el.tagName === 'TEXTAREA') {
      el.value = String(value);
      el.textContent = String(value);
    } else {
      el.value = String(value);
      el.setAttribute('value', String(value));
    }
  });

  const fullName = String(doc.getElementById('nama_terang')?.value || record.full_name || app.nama || '').trim();
  const nikVal = String(doc.getElementById('nik')?.value || record.nik || app.nik || '').trim();
  const tglVal = String(doc.getElementById('tanggal_persetujuan')?.value || approvalDateFallback || '').trim();
  const isApproved = Boolean(doc.getElementById('setuju')?.checked);
  const sigPreview = doc.getElementById('sigPreviewText');
  const esigInitials = doc.getElementById('esigInitials');
  const esigCode = doc.getElementById('esigCode');
  const statusEl = doc.getElementById('approvalStatus');
  if (sigPreview) sigPreview.textContent = fullName || 'Nama Lengkap Pelamar';
  if (esigInitials) esigInitials.textContent = signatureInitials(fullName, brandKey);
  if (esigCode) esigCode.textContent = signatureRefCode(fullName, nikVal, tglVal, brandKey);
  if (statusEl) {
    statusEl.className = isApproved ? 'status-approved' : 'status-pending';
    statusEl.textContent = isApproved ? 'Disetujui Pelamar' : 'Menunggu Persetujuan';
  }
}

function sanitizePrintDocument(doc) {
  doc.querySelectorAll('.toolbar,.toolbar-shell,script,iframe,object,embed').forEach(el => el.remove());
  doc.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      if (['href', 'src', 'action', 'formaction'].includes(attr.name.toLowerCase()) && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    });
  });
  doc.querySelectorAll('form').forEach(form => form.removeAttribute('action'));
}

async function getActiveMasterHtml(brand = 'mitra') {
  const brandKey = resolvePrintBrand(brand);
  if (brandKey === 'reholz') {
    const sep = REHOLZ_TEMPLATE_URL.includes('?') ? '&' : '?';
    const response = await fetch(`${REHOLZ_TEMPLATE_URL}${sep}v=${encodeURIComponent(REHOLZ_MASTER_REVISION)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Master HTML ReHolz tidak ditemukan.');
    return response.text();
  }
  if (supabase) {
    const [tplResult, syncResult] = await Promise.all([
      supabase.from('print_templates').select('source_filename,html_content').eq('is_active', true).maybeSingle(),
      supabase.from('portal_settings').select('value').eq('key', 'default_master_revision').maybeSingle()
    ]);
    const { data, error } = tplResult;
    const synced = !syncResult.error && syncResult.data?.value === DEFAULT_MASTER_REVISION;
    if (!error && data?.html_content && data.source_filename !== 'Master bawaan repository' && synced) {
      return data.html_content;
    }
    if (error && !['42P01', 'PGRST205', 'PGRST204'].includes(error.code)) throw error;
  }
  const sep = TEMPLATE_URL.includes('?') ? '&' : '?';
  const response = await fetch(`${TEMPLATE_URL}${sep}v=${encodeURIComponent(DEFAULT_MASTER_REVISION)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Master HTML lamaran Mitra tidak ditemukan.');
  return response.text();
}

function trimSentences(text = '', maxChars = 255) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '—';
  if (clean.length <= maxChars) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  let out = '';
  for (const sentence of sentences) {
    const candidate = out ? `${out} ${sentence.trim()}` : sentence.trim();
    if (candidate.length > maxChars) break;
    out = candidate;
  }
  if (out) return out;
  const cut = clean.slice(0, maxChars - 1);
  return `${cut.replace(/\s+\S*$/, '').trim()}…`;
}

function formatScore(v) {
  const n = Number(v || 0);
  return n > 0 ? `+${n}` : String(n);
}

function chartSvg(values, label, accent = '#0d5c6b', gridTone = '#e4e7ec') {
  const W = 280, H = 124, gridLeft = 22, gridRight = 10, plotLeft = 34, plotRight = 22, top = 14, bottom = 21, plotH = H - top - bottom;
  const x = i => plotLeft + i * (W - plotLeft - plotRight) / 3;
  const y = v => top + (8 - v) / 16 * plotH;
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const axes = ['D', 'I', 'S', 'C'];
  const y0 = y(0);
  const grid = [-8, -4, 0, 4, 8].map(v => {
    const isZero = v === 0;
    return `<line x1="${gridLeft}" y1="${y(v).toFixed(1)}" x2="${W - gridRight}" y2="${y(v).toFixed(1)}" stroke="${isZero ? '#8c96a4' : gridTone}" ${isZero ? 'stroke-dasharray="3 2.5" stroke-width="1"' : 'stroke-width="0.75"'}/>` +
      `<text x="${gridLeft - 4}" y="${(y(v) + 2.6).toFixed(1)}" text-anchor="end" fill="#6b7280" font-size="7.2" font-family="'JetBrains Mono',ui-monospace,monospace">${v}</text>`;
  }).join('');
  const stems = values.map((v, i) =>
    `<line x1="${x(i).toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x(i).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${accent}" stroke-opacity="0.22" stroke-width="1.4"/>`
  ).join('');
  const vertices = values.map((v, i) => {
    const cy = y(v);
    const labelAbove = v >= 0 ? (v <= 6) : (v <= -6.5);
    const valY = labelAbove ? cy - 6.2 : cy + 10.5;
    return `<circle cx="${x(i).toFixed(1)}" cy="${cy.toFixed(1)}" r="3.4" fill="${accent}" stroke="#ffffff" stroke-width="1.4"/>` +
      `<text x="${x(i).toFixed(1)}" y="${valY.toFixed(1)}" text-anchor="middle" fill="${accent}" font-size="7.2" font-weight="700" font-family="'JetBrains Mono',ui-monospace,monospace">${esc(formatScore(v))}</text>` +
      `<text x="${x(i).toFixed(1)}" y="${H - 5.5}" text-anchor="middle" fill="#1e293b" font-size="8.6" font-weight="800" font-family="'Plus Jakarta Sans',Arial,sans-serif">${axes[i]}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}${stems}<polyline points="${points}" fill="none" stroke="${accent}" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"/>${vertices}</svg>`;
}

export function discReportHtml(record, result, brand = 'mitra') {
  const brandKey = resolvePrintBrand(brand);
  const cfg = BRAND_CONFIGS[brandKey];
  const logoSrc = BRAND_LOGOS[brandKey];
  const app = record.application_data || {};
  const submission = getDiscSubmission(record);
  const rawGender = app.gender || '';
  const genderLabel = rawGender === 'L' ? 'Laki-laki' : rawGender === 'P' ? 'Perempuan' : rawGender || '—';
  const ageText = app.umur ? `${esc(app.umur)} tahun` : '—';
  const id = {
    name: record.full_name || app.nama || '—',
    position: record.position || app.posisi || '—',
    age: ageText,
    gender: genderLabel,
    date: submission?.completed_at || Date.now()
  };
  const panels = [
    { key: 'most', tag: 'MOST · ADAPTASI', title: 'GRAFIK 1 — MOST', desc: 'Citra publik & tuntutan peran', values: result.g1, pattern: result.pola[0], accent: cfg.accents.most },
    { key: 'least', tag: 'LEAST · TEKANAN', title: 'GRAFIK 2 — LEAST', desc: 'Respons di bawah tekanan', values: result.g2, pattern: result.pola[1], accent: cfg.accents.least },
    { key: 'change', tag: 'CHANGE · ALAMI', title: 'GRAFIK 3 — CHANGE', desc: 'Kepribadian alami sejati', values: result.g3, pattern: result.pola[2], accent: cfg.accents.change }
  ];
  const axes = ['D', 'I', 'S', 'C'];
  const gridTone = brandKey === 'reholz' ? '#DCE7DE' : '#e2e8f0';
  const detail = result.detail || {};
  const kecenderungan = (detail.kecenderungan || []).slice(0, 7);
  const pengembangan = (detail.pengembangan || []).slice(0, 7);
  const natural = result.pola[2] || {};
  const professions = trimSentences(natural.professions || '', 245);

  return `<section class="aux-sheet disc-sheet disc-brand-${brandKey}" data-brand="${brandKey}">
    <header class="disc-hero">
      <div class="disc-hero-main">
        <div class="disc-hero-brand">
          <img src="${logoSrc}" alt="${esc(cfg.logoAlt)}" class="disc-hero-logo" />
          <span class="disc-hero-sep" aria-hidden="true"></span>
          <div class="disc-eyebrow">${esc(cfg.eyebrow)}</div>
        </div>
        <h1>Laporan Hasil Tes D.I.S.C.</h1>
        <div class="disc-meta">
          <div><span>Nama</span><b>${esc(id.name)}</b></div>
          <div><span>Posisi</span><b>${esc(id.position)}</b></div>
          <div><span>Usia / Gender</span><b>${id.age} · ${esc(id.gender)}</b></div>
          <div><span>Tanggal Tes</span><b class="tabular-nums">${esc(printDate(id.date))}</b></div>
        </div>
      </div>
      <aside class="disc-badge">
        <span class="disc-badge-kicker">Profil Alami (Change)</span>
        <div class="disc-badge-factor">${esc(result.hurufDominan || '—')}</div>
        <div class="disc-badge-name">${esc(natural.nama || '—')}</div>
        <div class="disc-badge-title">${esc(natural.title || '—')}</div>
      </aside>
    </header>

    <div class="disc-section">
      <div class="disc-sec-head">
        <h2>Tiga Grafik Profil D.I.S.C.</h2>
        <span>Skala Standar -8 s.d. +8</span>
      </div>
      <div class="disc-graphs">${panels.map(p => `
        <article class="disc-chart disc-chart-${p.key}">
          <div class="disc-chart-head">
            <b>${esc(p.title)}</b>
            <small>${esc(p.desc)}</small>
          </div>
          ${chartSvg(p.values, p.title, p.accent, gridTone)}
          <div class="disc-score-strip">${p.values.map((v, i) => `<span>${axes[i]} <b>${esc(formatScore(v))}</b></span>`).join('')}</div>
          <div class="disc-pattern">Pola: <b>${esc(p.pattern.nama)}</b> · ${esc(p.pattern.title)}</div>
        </article>`).join('')}
      </div>
    </div>

    <div class="disc-section">
      <div class="disc-sec-head">
        <h2>Interpretasi Tiga Pola</h2>
        <span>Ringkasan Karakteristik Utama</span>
      </div>
      <div class="disc-pattern-grid">${panels.map(p => `
        <article class="disc-pattern-card disc-pattern-card-${p.key}">
          <div class="disc-card-kicker">${esc(p.tag)}</div>
          <b>${esc(p.pattern.nama)} · ${esc(p.pattern.title)}</b>
          <p>${esc(trimSentences(p.pattern.description, 235))}</p>
          <div class="disc-chips">${(p.pattern.traits || []).slice(0, 6).map(t => `<span>${esc(t)}</span>`).join('')}</div>
        </article>`).join('')}
      </div>
    </div>

    <div class="disc-section">
      <div class="disc-sec-head">
        <h2>Analisis Faktor Dominan · ${esc(result.hurufDominan)}</h2>
        <span>${esc(detail.judul || '')}</span>
      </div>
      <div class="disc-detail">
        <p class="disc-detail-summary">${esc(trimSentences(detail.deskripsi || '', 390))}</p>
        <div class="disc-detail-cols">
          <div class="disc-detail-box">
            <b>Kecenderungan Perilaku</b>
            <ul>${kecenderungan.map(x => `<li>${esc(x.replace(/^[•\-\s]+/, ''))}</li>`).join('')}</ul>
          </div>
          <div class="disc-detail-box disc-detail-box-dev">
            <b>Rekomendasi Pengembangan</b>
            <ul>${pengembangan.map(x => `<li>${esc(x.replace(/^[•\-\s]+/, ''))}</li>`).join('')}</ul>
          </div>
        </div>
        ${professions && professions !== '—' ? `<div class="disc-professions"><span>Kesesuaian Peran Kerja</span><p>${esc(professions)}</p></div>` : ''}
      </div>
    </div>

    <footer class="disc-footer">
      <span>${esc(cfg.footerOrg)}</span>
      <span class="tabular-nums">Dokumen Rahasia Asesmen · Dicetak ${esc(printDate(Date.now()))}</span>
    </footer>
  </section>`;
}

function discEmptyHtml(brand = 'mitra') {
  const brandKey = resolvePrintBrand(brand);
  const cfg = BRAND_CONFIGS[brandKey];
  const logoSrc = BRAND_LOGOS[brandKey];
  return `<section class="aux-sheet disc-sheet disc-brand-${brandKey}" data-brand="${brandKey}">
    <header class="disc-hero">
      <div class="disc-hero-main">
        <div class="disc-hero-brand">
          <img src="${logoSrc}" alt="${esc(cfg.logoAlt)}" class="disc-hero-logo" />
          <span class="disc-hero-sep" aria-hidden="true"></span>
          <div class="disc-eyebrow">${esc(cfg.eyebrow)}</div>
        </div>
        <h1>Laporan Hasil Tes D.I.S.C.</h1>
      </div>
    </header>
    <div class="disc-empty"><h1>HASIL TES D.I.S.C.</h1><p>Belum ada hasil tes DISC untuk kandidat ini.</p></div>
    <footer class="disc-footer">
      <span>${esc(cfg.footerOrg)}</span>
      <span class="tabular-nums">Dicetak ${esc(printDate(Date.now()))}</span>
    </footer>
  </section>`;
}

function fitMasterDocument(targetDoc) {
  const root = targetDoc.getElementById('applicationForm');
  if (!root) return;
  const win = targetDoc.defaultView || window;
  const canvas = targetDoc.createElement('canvas');
  const ctx = canvas.getContext('2d');
  root.querySelectorAll('input[type="date"]').forEach(field => {
    if (!field.value) field.setAttribute('data-print-empty', 'true');
    else field.removeAttribute('data-print-empty');
  });

  targetDoc.body.classList.add('print-measuring');
  try {
    root.querySelectorAll('textarea').forEach(ta => {
      ta.style.removeProperty('--print-h');
      ta.style.removeProperty('--print-fs');
      ta.style.height = 'auto';
      ta.style.fontSize = '';
    });
    const inputs = root.querySelectorAll('input:not([type="checkbox"]):not([type="radio"])');
    inputs.forEach(inp => {
      inp.style.removeProperty('--print-fs');
      inp.style.fontSize = '';
    });
    void targetDoc.body.offsetHeight;

    root.querySelectorAll('textarea.cell-wrap, textarea.inline-wrap-field').forEach(field => {
      field.style.height = 'auto';
      field.style.setProperty('--print-h', `${Math.max(12, field.scrollHeight)}px`);
    });

    root.querySelectorAll('textarea.hobby-box, textarea.answer').forEach(box => {
      const cs = win.getComputedStyle(box);
      let fs = parseFloat(cs.fontSize) || 8.5;
      box.style.height = 'auto';
      while (box.value && box.scrollHeight > 46 && fs > 6.6) {
        fs = Math.max(6.6, fs - 0.35);
        box.style.fontSize = `${fs.toFixed(2)}px`;
      }
      box.style.setProperty('--print-fs', `${fs.toFixed(2)}px`);
      box.style.setProperty('--print-h', `${Math.max(30, box.scrollHeight)}px`);
    });

    inputs.forEach(field => {
      if (!field.value) return;
      const computed = win.getComputedStyle(field);
      const baseSize = parseFloat(computed.fontSize) || 8.7;
      const available = Math.max(12, field.clientWidth - (parseFloat(computed.paddingLeft) || 0) - (parseFloat(computed.paddingRight) || 0) - 3);
      if (ctx) {
        ctx.font = `${computed.fontWeight} ${baseSize}px ${computed.fontFamily}`;
        const textWidth = ctx.measureText(field.value).width;
        if (textWidth > available) {
          field.style.setProperty('--print-fs', `${Math.max(5.8, baseSize * available / textWidth).toFixed(2)}px`);
        }
      }
    });
  } finally {
    root.querySelectorAll('textarea').forEach(ta => {
      ta.style.height = '';
      ta.style.fontSize = '';
    });
    targetDoc.body.classList.remove('print-measuring');
  }

  root.querySelectorAll('textarea.cell-wrap, textarea.inline-wrap-field').forEach(field => {
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  });
}

const DISC_SHARED_AND_BRAND_CSS = `
  @page{size:A4 portrait;margin:0}
  @media print{
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    html,body{width:100%!important;height:auto!important;margin:0!important;padding:0!important;background:#fff!important}
    .toolbar,.toolbar-shell{display:none!important}
    body.combined-print .sheet{page-break-after:always!important;break-after:page!important;margin:0 auto!important;box-shadow:none!important}
    .aux-sheet{width:100%!important;max-width:210mm!important;height:99.6vh!important;min-height:0!important;max-height:none!important;margin:0 auto!important;box-shadow:none!important;border-radius:0!important;page-break-before:auto!important;break-before:auto!important;page-break-after:always!important;break-after:page!important;page-break-inside:avoid!important;break-inside:avoid!important}
    .aux-sheet:last-child{page-break-after:auto!important;break-after:auto!important}
    .cv-page-sheet{padding:4mm!important}
    .cv-page-sheet img{max-width:100%!important;max-height:calc(99.6vh - 12mm)!important}
    .disc-sheet{padding:6.5mm 8.5mm 5.5mm!important;gap:3.2mm!important}
  }
  .aux-sheet{width:210mm;height:297mm;min-height:297mm;max-height:297mm;margin:15px auto;box-sizing:border-box;background:#fff;box-shadow:0 4px 22px rgba(0,0,0,.10);overflow:hidden}
  .sheets-canvas .aux-sheet{margin:0 auto;box-shadow:0 24px 60px -12px rgba(4,9,20,.55),0 0 0 1px rgba(255,255,255,.08);border-radius:2px}
  .cv-page-sheet{position:relative;display:flex;align-items:center;justify-content:center;padding:5mm;color:#111}
  .cv-page-sheet img{display:block;max-width:200mm;max-height:287mm;width:auto;height:auto;object-fit:contain}
  .cv-page-sheet>span{position:absolute;right:8mm;bottom:5mm;color:#9aa3af;font:7px 'Plus Jakarta Sans',Arial,sans-serif}
  .cv-missing{font-family:'Plus Jakarta Sans',Arial,sans-serif;text-align:center}
  .cv-missing h1{font-size:18px}.cv-missing p{font-size:11px;color:#64748b}

  /* Shared Single-Page DISC Aesthetic Architecture */
  .disc-sheet{
    --d-hero-bg:linear-gradient(118deg,#0b1526 0%,#0f1e36 56%,#1a3052 100%);
    --d-hero-border:#b08d57;
    --d-eyebrow:#d4b475;
    --d-badge-border:rgba(212,180,117,.42);
    --d-badge-bg:rgba(255,255,255,.07);
    --d-ink:#0f172a;
    --d-ink-2:#334155;
    --d-muted:#64748b;
    --d-heading:#0f1e36;
    --d-rule:#d4dbe4;
    --d-card-border:#d4dbe4;
    --d-card-soft:#f8fafc;
    --d-change-bg:#f4f7fb;
    --d-change-border:#b08d57;
    --d-change-chip-border:#cbd5e1;
    --d-change-chip-ink:#0f1e36;
    --d-most:#1a3052;
    --d-least:#b08d57;
    --d-change:#0d5c6b;
    display:flex;
    flex-direction:column;
    gap:4.5mm;
    padding:9mm 9.5mm 7.5mm;
    color:var(--d-ink);
    font:8.5px/1.4 'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    -webkit-print-color-adjust:exact;
    print-color-adjust:exact;
  }

  /* ReHolz Botanical Forest Green & Warm Amber DISC Variant */
  .disc-sheet.disc-brand-reholz{
    --d-hero-bg:linear-gradient(118deg,#002E1E 0%,#004C33 54%,#007850 100%);
    --d-hero-border:#B77932;
    --d-eyebrow:#D8EBDE;
    --d-badge-border:rgba(216,235,222,.40);
    --d-badge-bg:rgba(0,38,24,.38);
    --d-ink:#1E2B23;
    --d-ink-2:#33463A;
    --d-muted:#5E6E63;
    --d-heading:#003D29;
    --d-rule:#DCE7DE;
    --d-card-border:#DCE7DE;
    --d-card-soft:#F9FCFA;
    --d-change-bg:#F4FAF6;
    --d-change-border:#3FA877;
    --d-change-chip-border:#B6DFC7;
    --d-change-chip-ink:#004C33;
    --d-most:#33463A;
    --d-least:#B77932;
    --d-change:#007850;
  }

  .disc-hero{
    display:flex;
    align-items:stretch;
    justify-content:space-between;
    gap:5.5mm;
    padding:5.2mm 6mm;
    background:var(--d-hero-bg);
    color:#fff;
    border-radius:6px;
    border-bottom:2.5px solid var(--d-hero-border);
  }
  .disc-hero-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center}
  .disc-hero-brand{display:flex;align-items:center;gap:2.8mm;margin-bottom:1.4mm}
  .disc-hero-logo{height:4.2mm;width:auto;display:block;object-fit:contain;flex-shrink:0}
  .disc-brand-reholz .disc-hero-logo{height:5.4mm}
  .disc-hero-sep{width:1px;height:3.6mm;background:rgba(255,255,255,.28);flex-shrink:0}
  .disc-eyebrow{font-size:6.8px;font-weight:700;letter-spacing:1.1px;color:var(--d-eyebrow);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .disc-hero h1{margin:0 0 2.5mm;font-family:'Playfair Display',Georgia,serif;font-size:17px;font-weight:700;letter-spacing:.01em;line-height:1.12;color:#fff}
  .disc-brand-reholz .disc-hero h1{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:16.2px;letter-spacing:.01em}
  .disc-meta{display:grid;grid-template-columns:1.15fr 1fr;column-gap:4.5mm;row-gap:1mm;font-size:8px;line-height:1.32}
  .disc-meta div{display:flex;gap:2.2mm;min-width:0}
  .disc-meta span{flex:0 0 20mm;color:rgba(248,250,252,.72);font-weight:500}
  .disc-meta b{color:#fff;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

  .disc-badge{
    flex:0 0 46mm;
    display:flex;
    flex-direction:column;
    justify-content:center;
    padding:3mm 3.8mm;
    border-radius:5px;
    border:1px solid var(--d-badge-border);
    background:var(--d-badge-bg);
    text-align:left;
  }
  .disc-badge-kicker{font-size:6.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--d-eyebrow)}
  .disc-badge-factor{margin-top:.8mm;font-size:18.5px;font-weight:800;line-height:1;color:#fff;letter-spacing:.4px}
  .disc-badge-name{margin-top:1.1mm;font-size:9px;font-weight:700;color:#fff}
  .disc-badge-title{font-size:7.4px;font-weight:500;color:rgba(248,250,252,.84)}

  .disc-section{display:flex;flex-direction:column;gap:2.5mm}
  .disc-sec-head{display:flex;align-items:center;justify-content:space-between;padding-bottom:1.2mm;border-bottom:1.2px solid var(--d-rule)}
  .disc-sec-head h2{position:relative;margin:0;padding-left:2.6mm;font-size:9.2px;font-weight:800;letter-spacing:.55px;text-transform:uppercase;color:var(--d-heading)}
  .disc-sec-head h2::before{content:"";position:absolute;left:0;top:1px;bottom:1px;width:2px;background:var(--d-hero-border);border-radius:1px}
  .disc-sec-head span{font-size:7.4px;font-weight:600;color:var(--d-muted)}

  .disc-graphs{display:grid;grid-template-columns:repeat(3,1fr);gap:3.2mm}
  .disc-chart{display:flex;flex-direction:column;border:1px solid var(--d-card-border);border-top:2.5px solid var(--d-change);border-radius:5px;padding:2.6mm 2.8mm 2.2mm;background:#fff}
  .disc-chart-most{border-top-color:var(--d-most)}
  .disc-chart-least{border-top-color:var(--d-least)}
  .disc-chart-change{border-top-color:var(--d-change)}
  .disc-chart-head{margin-bottom:1mm}
  .disc-chart-head b{display:block;font-size:8px;font-weight:800;color:var(--d-heading);letter-spacing:.25px}
  .disc-chart-head small{display:block;font-size:6.9px;color:var(--d-muted)}
  .disc-chart svg{width:100%;height:auto;display:block}
  .disc-score-strip{
    display:grid;
    grid-template-columns:repeat(4,1fr);
    gap:1.2mm;
    margin-top:1mm;
    padding:1mm 1.2mm;
    border-radius:3px;
    background:var(--d-card-soft);
    border:1px solid var(--d-rule);
    font-family:'JetBrains Mono',ui-monospace,monospace;
    font-size:6.8px;
    font-variant-numeric:tabular-nums;
    text-align:center;
    color:var(--d-muted);
  }
  .disc-score-strip b{color:var(--d-ink);font-weight:700}
  .disc-pattern{margin-top:1.2mm;padding-top:1.1mm;border-top:1px solid var(--d-rule);font-size:7.1px;color:var(--d-ink-2);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .disc-pattern b{color:var(--d-heading)}

  .disc-pattern-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3.2mm}
  .disc-pattern-card{display:flex;flex-direction:column;border:1px solid var(--d-card-border);border-radius:5px;padding:3.2mm 3.3mm;background:var(--d-card-soft)}
  .disc-pattern-card-change{background:var(--d-change-bg);border-color:var(--d-change-border);box-shadow:inset 0 2px 0 var(--d-change)}
  .disc-card-kicker{font-size:6.5px;font-weight:800;letter-spacing:.7px;color:var(--d-most);margin-bottom:.7mm}
  .disc-pattern-card-least .disc-card-kicker{color:var(--d-least)}
  .disc-pattern-card-change .disc-card-kicker{color:var(--d-change)}
  .disc-pattern-card>b{display:block;font-size:8.4px;font-weight:700;color:var(--d-heading);margin-bottom:1.2mm}
  .disc-pattern-card p{margin:0 0 2.3mm;font-size:7.7px;line-height:1.42;color:var(--d-ink-2);text-align:left}
  .disc-chips{margin-top:auto;display:flex;flex-wrap:wrap;gap:1mm}
  .disc-chips span{display:inline-block;padding:.65mm 1.6mm;border-radius:3px;border:1px solid var(--d-card-border);background:#fff;color:var(--d-ink-2);font-size:6.6px;font-weight:600;line-height:1.2}
  .disc-pattern-card-change .disc-chips span{border-color:var(--d-change-chip-border);color:var(--d-change-chip-ink)}

  .disc-detail{display:flex;flex-direction:column;gap:2.8mm;border:1px solid var(--d-card-border);border-radius:5px;padding:3.5mm 3.8mm;background:#fff}
  .disc-detail-summary{margin:0;font-size:8px;line-height:1.46;color:var(--d-ink-2)}
  .disc-detail-cols{display:grid;grid-template-columns:1fr 1fr;gap:3.4mm;align-items:stretch}
  .disc-detail-box{border:1px solid var(--d-rule);border-radius:4px;padding:2.9mm 3.2mm;background:var(--d-card-soft)}
  .disc-detail-box b{display:flex;align-items:center;gap:1.5mm;font-size:7.9px;font-weight:800;color:var(--d-change);margin-bottom:1.4mm;text-transform:uppercase;letter-spacing:.35px}
  .disc-detail-box b::before{content:"";width:5px;height:5px;border-radius:1px;background:var(--d-change);display:inline-block}
  .disc-detail-box-dev b{color:var(--d-least)}
  .disc-detail-box-dev b::before{background:var(--d-least)}
  .disc-detail-box ul{margin:0;padding-left:3.6mm;font-size:7.6px;line-height:1.44;color:var(--d-ink-2)}
  .disc-detail-box li{margin-bottom:.85mm}
  .disc-professions{padding-top:2.2mm;border-top:1px solid var(--d-rule);display:grid;grid-template-columns:36mm 1fr;gap:3mm;align-items:baseline}
  .disc-professions span{font-size:7.1px;font-weight:800;text-transform:uppercase;letter-spacing:.45px;color:var(--d-heading)}
  .disc-professions p{margin:0;font-size:7.6px;line-height:1.42;color:var(--d-ink-2)}

  .disc-footer{margin-top:auto;padding-top:1.8mm;border-top:1px solid var(--d-rule);display:flex;justify-content:space-between;align-items:center;color:var(--d-muted);font-size:7px;font-weight:600}
  .disc-empty{margin:auto;text-align:center;color:var(--d-ink-2)}
  .disc-empty h1{font-size:16px;margin:0 0 6px}
`;

export async function printApplication(record, options = {}) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.');
  const brandKey = resolvePrintBrand(options.brand);
  const tab = window.open('', '_blank');
  if (!tab) throw new Error('Izinkan pop-up untuk mencetak dokumen.');
  const cfg = BRAND_CONFIGS[brandKey];
  tab.document.write(`<!doctype html><title>Menyiapkan dokumen ${esc(cfg.companyName)}…</title><p style="font:14px Arial;padding:30px">Menyiapkan Lamaran, CV, dan DISC (${esc(cfg.companyName)})…</p>`);
  try {
    const masterText = await getActiveMasterHtml(brandKey);
    const parser = new DOMParser();
    const doc = parser.parseFromString(masterText, 'text/html');
    if (!doc.querySelector('#applicationForm')) throw new Error('Master aktif tidak memiliki #applicationForm.');
    sanitizePrintDocument(doc);
    fillMaster(doc, record.application_data || {}, record, brandKey);
    doc.body.classList.add('combined-print');

    let cvPages = [];
    if (record.cv_path) {
      const { data: signed, error } = await supabase.storage.from(CV_BUCKET).createSignedUrl(record.cv_path, 180);
      if (error) throw error;
      cvPages = await renderPdfPages(signed.signedUrl);
    }
    const cvSection = cvPages.length
      ? cvPages.map((src, index) => `<section class="aux-sheet cv-page-sheet"><img src="${src}" alt="CV halaman ${index + 1}"><span>CV · ${index + 1} / ${cvPages.length}</span></section>`).join('')
      : '<section class="aux-sheet cv-page-sheet cv-missing"><div><h1>CURRICULUM VITAE</h1><p>CV belum tersedia.</p></div></section>';

    let discSection = discEmptyHtml(brandKey);
    const answerRows = getDiscSubmission(record)?.answers;
    if (Array.isArray(answerRows) && answerRows.length === 24) {
      const result = computeDisc(answerRows);
      discSection = discReportHtml(record, result, brandKey);
    }
    const extras = document.createElement('div');
    extras.innerHTML = cvSection + discSection;
    (doc.querySelector('.sheets-canvas') || doc.body).append(...extras.children);

    const style = doc.createElement('style');
    style.textContent = DISC_SHARED_AND_BRAND_CSS;
    doc.head.append(style);
    tab.document.open();
    tab.document.write('<!doctype html>' + doc.documentElement.outerHTML);
    tab.document.close();
    const images = [...tab.document.images];
    await Promise.all(images.map(image => image.decode?.().catch(() => null)));
    if (tab.document.fonts?.ready) await tab.document.fonts.ready;
    await new Promise(resolve => {
      const raf = tab.requestAnimationFrame || (fn => setTimeout(fn, 16));
      raf(() => raf(resolve));
    });
    fitMasterDocument(tab.document);
    tab.focus();
    setTimeout(() => { try { tab.print(); } catch { /* browser print UI */ } }, 350);
  } catch (error) {
    tab.close();
    throw error;
  }
}
