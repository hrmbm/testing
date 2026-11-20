import { TEMPLATE_URL, CV_BUCKET } from './config.js?v=20261120-hrga-workspace-02';
import { supabase } from './supabase.js?v=20261120-hrga-workspace-02';
import { computeDisc } from './disc-engine.js?v=20261120-hrga-workspace-02';
import { esc } from './common.js?v=20261120-hrga-workspace-02';

const printDate = d => new Date(d || Date.now()).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
const getDiscSubmission = record => Array.isArray(record?.disc_submissions) ? record.disc_submissions[0] : record?.disc_submissions;

async function renderPdfPages(url) {
  const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  const pdf = await pdfjs.getDocument({ url }).promise;
  const pages = [];
  for (let n=1; n<=pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({scale:1.55});
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    pages.push(canvas.toDataURL('image/jpeg',0.92));
  }
  return pages;
}

function fillMaster(doc, data, record = {}) {
  const app = data || {};
  doc.querySelectorAll('#applicationForm [name]').forEach(el => {
    const name = el.getAttribute('name');
    let value = app[name] ?? '';
    const fillPath = el.getAttribute('data-application-fill');
    if (fillPath === 'applicant.full_name' || name === 'nama_terang') value = record.full_name || app.nama || value;
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
}

function sanitizePrintDocument(doc) {
  doc.querySelectorAll('.toolbar,script,iframe,object,embed').forEach(el => el.remove());
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

async function getActiveMasterHtml() {
  if (supabase) {
    const { data, error } = await supabase.from('print_templates')
      .select('html_content').eq('is_active', true).maybeSingle();
    if (!error && data?.html_content) return data.html_content;
    // Before the Stage 3 migration, keep printing operational with the bundled master.
    if (error && !['42P01', 'PGRST205', 'PGRST204'].includes(error.code)) throw error;
  }
  const response = await fetch(TEMPLATE_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('Master HTML lamaran tidak ditemukan.');
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

function chartSvg(values, label, accent = '#0d5c6b') {
  const W = 280, H = 120, left = 24, right = 12, top = 12, bottom = 22, plotH = H - top - bottom;
  const x = i => left + i * (W - left - right) / 3;
  const y = v => top + (8 - v) / 16 * plotH;
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const axes = ['D', 'I', 'S', 'C'];
  const grid = [-8, -4, 0, 4, 8].map(v => {
    const isZero = v === 0;
    return `<line x1="${left}" y1="${y(v)}" x2="${W - right}" y2="${y(v)}" stroke="${isZero ? '#9ea5ae' : '#ebe7df'}" ${isZero ? 'stroke-dasharray="3 3" stroke-width="1"' : 'stroke-width="0.8"'}/>` +
      `<text x="${left - 6}" y="${y(v) + 2.8}" text-anchor="end" fill="#7c828a" font-size="7.5" font-family="ui-monospace,monospace">${v}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}<polyline points="${points}" fill="none" stroke="${accent}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>${values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.4" fill="${accent}" stroke="#ffffff" stroke-width="1.3"/><text x="${x(i)}" y="${H - 6}" text-anchor="middle" fill="#16181a" font-size="8.5" font-weight="700">${axes[i]}</text>`).join('')}</svg>`;
}

function discReportHtml(record, result) {
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
    { key: 'most', tag: 'MOST · ADAPTASI', title: 'GRAFIK 1 — MOST', desc: 'Citra publik & tuntutan peran', values: result.g1, pattern: result.pola[0], accent: '#334155' },
    { key: 'least', tag: 'LEAST · TEKANAN', title: 'GRAFIK 2 — LEAST', desc: 'Respons di bawah tekanan', values: result.g2, pattern: result.pola[1], accent: '#8d6239' },
    { key: 'change', tag: 'CHANGE · ALAMI', title: 'GRAFIK 3 — CHANGE', desc: 'Kepribadian alami sejati', values: result.g3, pattern: result.pola[2], accent: '#0d5c6b' }
  ];
  const detail = result.detail || {};
  const kecenderungan = (detail.kecenderungan || []).slice(0, 8);
  const pengembangan = (detail.pengembangan || []).slice(0, 8);
  const natural = result.pola[2] || {};
  const professions = trimSentences(natural.professions || '', 260);
  return `<section class="aux-sheet disc-sheet">
    <header class="disc-hero">
      <div class="disc-hero-main">
        <div class="disc-eyebrow">PT. MITRA BINAMANDIRI MAKMUR · ASESMEN PSIKOLOGIS</div>
        <h1>Laporan Hasil Tes D.I.S.C.</h1>
        <div class="disc-meta">
          <div><span>Nama</span><b>${esc(id.name)}</b></div>
          <div><span>Posisi</span><b>${esc(id.position)}</b></div>
          <div><span>Usia / Gender</span><b>${id.age} · ${esc(id.gender)}</b></div>
          <div><span>Tanggal Tes</span><b>${esc(printDate(id.date))}</b></div>
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
          ${chartSvg(p.values, p.title, p.accent)}
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
          <p>${esc(trimSentences(p.pattern.description, 265))}</p>
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
        <p class="disc-detail-summary">${esc(trimSentences(detail.deskripsi || '', 420))}</p>
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
      <span>PT. Mitra Binamandiri Makmur · HR&amp;GA Workspace</span>
      <span>Dokumen Rahasia Asesmen · Dicetak ${esc(printDate(Date.now()))}</span>
    </footer>
  </section>`;
}

export async function printApplication(record) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.');
  const tab = window.open('', '_blank');
  if (!tab) throw new Error('Izinkan pop-up untuk mencetak dokumen.');
  tab.document.write('<!doctype html><title>Menyiapkan dokumen…</title><p style="font:14px Arial;padding:30px">Menyiapkan Lamaran, CV, dan DISC…</p>');
  try {
    const masterText = await getActiveMasterHtml();
    const parser = new DOMParser();
    const doc = parser.parseFromString(masterText, 'text/html');
    if (!doc.querySelector('#applicationForm')) throw new Error('Master aktif tidak memiliki #applicationForm.');
    sanitizePrintDocument(doc);
    fillMaster(doc, record.application_data || {}, record);
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

    let discSection = '<section class="aux-sheet disc-sheet"><div class="disc-empty"><h1>HASIL TES D.I.S.C.</h1><p>Belum ada hasil tes DISC untuk kandidat ini.</p></div></section>';
    const answerRows = getDiscSubmission(record)?.answers;
    if (Array.isArray(answerRows) && answerRows.length === 24) {
      const result = computeDisc(answerRows);
      discSection = discReportHtml(record, result);
    }
    const extras = document.createElement('div');
    extras.innerHTML = cvSection + discSection;
    doc.body.append(...extras.children);

    const style = doc.createElement('style');
    style.textContent = `
      @page{size:A4 portrait;margin:0}
      @media print{
        html,body{margin:0!important;padding:0!important;background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .toolbar{display:none!important}
        .sheet{page-break-after:always;break-after:page;margin:0!important;box-shadow:none!important}
        .aux-sheet{page-break-before:always;break-before:page;page-break-after:auto;break-after:auto;margin:0!important;box-shadow:none!important}
        .aux-sheet:last-child{page-break-after:avoid;break-after:avoid}
      }
      .aux-sheet{width:210mm;height:297mm;min-height:297mm;max-height:297mm;margin:15px auto;box-sizing:border-box;background:#fff;box-shadow:0 4px 22px rgba(0,0,0,.10);overflow:hidden}
      .cv-page-sheet{position:relative;display:flex;align-items:center;justify-content:center;padding:5mm;color:#111}
      .cv-page-sheet img{display:block;max-width:200mm;max-height:287mm;width:auto;height:auto;object-fit:contain}
      .cv-page-sheet>span{position:absolute;right:8mm;bottom:5mm;color:#9aa3af;font:7px Arial,sans-serif}
      .cv-missing{font-family:Arial,sans-serif;text-align:center}
      .cv-missing h1{font-size:18px}.cv-missing p{font-size:11px;color:#64748b}

      .disc-sheet{display:flex;flex-direction:column;gap:4.4mm;padding:9mm 10.5mm 8mm;color:#16181a;font:8.6px/1.4 'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .disc-hero{display:flex;align-items:stretch;justify-content:space-between;gap:6mm;padding:5.5mm 6.5mm;background:linear-gradient(115deg,#16181a 0%,#1d2226 52%,#0d4550 100%);color:#fff;border-radius:6px;border-bottom:2px solid #8d6239}
      .disc-hero-main{flex:1 1 auto;min-width:0}
      .disc-eyebrow{font-size:7px;font-weight:700;letter-spacing:1.4px;color:#dfc5a4;text-transform:uppercase}
      .disc-hero h1{margin:1.3mm 0 2.8mm;font-size:17px;font-weight:700;letter-spacing:-.2px;line-height:1.1;color:#fff}
      .disc-meta{display:grid;grid-template-columns:1.15fr 1fr;column-gap:5mm;row-gap:1.1mm;font-size:8.2px;line-height:1.35}
      .disc-meta div{display:flex;gap:2.5mm;min-width:0}
      .disc-meta span{flex:0 0 21mm;color:rgba(248,250,252,.68);font-weight:500}
      .disc-meta b{color:#fff;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .disc-badge{flex:0 0 46mm;display:flex;flex-direction:column;justify-content:center;padding:3.2mm 4mm;border-radius:5px;border:1px solid rgba(223,197,164,.36);background:rgba(255,255,255,.06);text-align:left}
      .disc-badge-kicker{font-size:6.6px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:#dfc5a4}
      .disc-badge-factor{margin-top:.8mm;font-size:19px;font-weight:700;line-height:1;color:#fff;letter-spacing:.5px}
      .disc-badge-name{margin-top:1.2mm;font-size:9.2px;font-weight:700;color:#fff}
      .disc-badge-title{font-size:7.6px;font-weight:500;color:rgba(248,250,252,.82)}

      .disc-section{display:flex;flex-direction:column;gap:2.4mm}
      .disc-sec-head{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:1.3mm;border-bottom:1px solid #dfd9ce}
      .disc-sec-head h2{margin:0;font-size:9.4px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#16181a}
      .disc-sec-head span{font-size:7.6px;font-weight:600;color:#666b73}

      .disc-graphs{display:grid;grid-template-columns:repeat(3,1fr);gap:3.4mm}
      .disc-chart{display:flex;flex-direction:column;border:1px solid #e4e0d8;border-top:2.5px solid #0d5c6b;border-radius:5px;padding:2.8mm 3mm 2.5mm;background:#fff}
      .disc-chart-most{border-top-color:#334155}
      .disc-chart-least{border-top-color:#8d6239}
      .disc-chart-change{border-top-color:#0d5c6b}
      .disc-chart-head{margin-bottom:1.2mm}
      .disc-chart-head b{display:block;font-size:8.2px;font-weight:700;color:#16181a;letter-spacing:.3px}
      .disc-chart-head small{display:block;font-size:7px;color:#666b73}
      .disc-chart svg{width:100%;height:auto;display:block}
      .disc-pattern{margin-top:1.4mm;padding-top:1.4mm;border-top:1px solid #f0ede6;font-size:7.2px;color:#4a5058;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .disc-pattern b{color:#16181a}

      .disc-pattern-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3.4mm}
      .disc-pattern-card{display:flex;flex-direction:column;border:1px solid #e4e0d8;border-radius:5px;padding:3mm 3.2mm;background:#faf9f6}
      .disc-pattern-card-change{background:#f3f8f9;border-color:#cde1e5}
      .disc-card-kicker{font-size:6.7px;font-weight:700;letter-spacing:.7px;color:#666b73;margin-bottom:.8mm}
      .disc-pattern-card-least .disc-card-kicker{color:#8d6239}
      .disc-pattern-card-change .disc-card-kicker{color:#0d5c6b}
      .disc-pattern-card>b{display:block;font-size:8.4px;font-weight:700;color:#16181a;margin-bottom:1.3mm}
      .disc-pattern-card p{margin:0 0 2.2mm;font-size:7.6px;line-height:1.42;color:#35393e;text-align:left}
      .disc-chips{margin-top:auto;display:flex;flex-wrap:wrap;gap:1.1mm}
      .disc-chips span{display:inline-block;padding:.75mm 1.8mm;border-radius:3px;border:1px solid #dcd6ca;background:#fff;color:#35393e;font-size:6.7px;font-weight:600;line-height:1.2}
      .disc-pattern-card-change .disc-chips span{border-color:#c7dfe4;color:#094552}

      .disc-detail{display:flex;flex-direction:column;gap:2.8mm;border:1px solid #e4e0d8;border-radius:5px;padding:3.4mm 3.8mm;background:#fff}
      .disc-detail-summary{margin:0;font-size:7.9px;line-height:1.45;color:#35393e}
      .disc-detail-cols{display:grid;grid-template-columns:1fr 1fr;gap:3.6mm;align-items:start}
      .disc-detail-box{border:1px solid #ebe7df;border-radius:4px;padding:2.8mm 3.2mm;background:#faf9f6}
      .disc-detail-box b{display:flex;align-items:center;gap:1.5mm;font-size:8px;font-weight:700;color:#0d5c6b;margin-bottom:1.5mm;text-transform:uppercase;letter-spacing:.35px}
      .disc-detail-box b::before{content:"";width:5px;height:5px;border-radius:1px;background:#0d5c6b;display:inline-block}
      .disc-detail-box-dev b{color:#8d6239}
      .disc-detail-box-dev b::before{background:#8d6239}
      .disc-detail-box ul{margin:0;padding-left:3.8mm;font-size:7.5px;line-height:1.42;color:#35393e}
      .disc-detail-box li{margin-bottom:.8mm}
      .disc-professions{padding-top:2.2mm;border-top:1px solid #ebe7df;display:grid;grid-template-columns:36mm 1fr;gap:3mm;align-items:baseline}
      .disc-professions span{font-size:7.2px;font-weight:700;text-transform:uppercase;letter-spacing:.45px;color:#0d5c6b}
      .disc-professions p{margin:0;font-size:7.5px;line-height:1.4;color:#4a5058}

      .disc-footer{margin-top:auto;padding-top:2mm;border-top:1px solid #dfd9ce;display:flex;justify-content:space-between;align-items:center;color:#666b73;font-size:7.2px;font-weight:500}
      .disc-empty{margin:auto;text-align:center;color:#35393e}
      .disc-empty h1{font-size:16px;margin:0 0 6px}
    `;
    doc.head.append(style);
    tab.document.open();
    tab.document.write('<!doctype html>' + doc.documentElement.outerHTML);
    tab.document.close();
    const images = [...tab.document.images];
    await Promise.all(images.map(image => image.decode?.().catch(() => null)));
    if (tab.document.fonts?.ready) await tab.document.fonts.ready;
    tab.focus();
    setTimeout(() => { try { tab.print(); } catch { /* browser print UI */ } }, 350);
  } catch (error) {
    tab.close();
    throw error;
  }
}
