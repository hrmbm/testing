// Driver Payroll Reports (Summary, Support, Indoor, Outdoor, Radin), Manual Kurang Gaji Input,
// Time Check Sheet, Audit, and Cetak-Lamaran-style Standalone Print Window
import {
  CHECKSHEET_TIME_SLOTS,
  getEligibleDrivers,
  calculateDriverPayrollPeriod
} from './driver-logic.js?v=20261123-hrga-workspace-18';

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtRpCell(val, bold = false) {
  const n = Math.round(Number(val || 0));
  const cls = n === 0 ? 'drv-rp-zero' : 'drv-rp-val';
  const txt = n === 0
    ? '-'
    : (n < 0 ? `-${Math.abs(n).toLocaleString('id-ID')}` : n.toLocaleString('id-ID'));
  const inner = `<span>Rp</span><span>${txt}</span>`;
  return bold ? `<span class="${cls} is-bold">${inner}</span>` : `<span class="${cls}">${inner}</span>`;
}

function fmtNum(val, decimals = 1) {
  const n = Number(val || 0);
  if (!Number.isFinite(n) || Math.abs(n) < 0.0001) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(decimals).replace(/\.0+$/, '');
}

function fmtFixed1(val) {
  const n = Number(val || 0);
  if (!Number.isFinite(n) || Math.abs(n) < 0.0001) return '0.0';
  return n.toFixed(1);
}

const STANDALONE_PRINT_CSS = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body {
    margin: 0;
    padding: 0;
    background: #1e293b;
    color: #000000;
    font-family: Arial, Helvetica, sans-serif;
  }
  .print-app-toolbar {
    position: sticky;
    top: 0;
    z-index: 80;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 22px;
    background: #0f172a;
    color: #f8fafc;
    border-bottom: 1px solid rgba(255,255,255,.14);
    font-family: 'Plus Jakarta Sans', Arial, sans-serif;
  }
  .print-app-toolbar-title { font-size: 13px; font-weight: 600; }
  .print-app-toolbar-actions { display: flex; gap: 8px; }
  .print-app-toolbar button {
    border: 1px solid rgba(255,255,255,.24);
    border-radius: 7px;
    padding: 7px 14px;
    font: 600 12.5px inherit;
    cursor: pointer;
    background: rgba(255,255,255,.08);
    color: #fff;
  }
  .print-app-toolbar button.primary { background: #0d5c6b; border-color: #0d5c6b; }
  .drv-print-canvas {
    padding: 20px 16px 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }
  .drv-pdf-sheet {
    width: 210mm;
    min-height: 297mm;
    max-width: calc(100vw - 32px);
    padding: 14mm 10mm;
    background: #ffffff;
    box-shadow: 0 18px 46px rgba(0,0,0,.38);
    font-size: 9.5px;
    line-height: 1.28;
    color: #000000;
  }
  .drv-pdf-header {
    font-weight: 700;
    font-size: 10px;
    text-transform: uppercase;
    margin-bottom: 10px;
    line-height: 1.4;
    color: #000000;
  }
  .drv-pdf-header-line {
    display: flex;
    align-items: baseline;
  }
  .drv-pdf-header-lbl {
    display: inline-block;
    width: 96px;
  }
  .drv-pdf-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9px;
    font-variant-numeric: tabular-nums;
    color: #000000;
  }
  .drv-pdf-table th,
  .drv-pdf-table td {
    border: 1px solid #000000;
    padding: 4px 5px;
    vertical-align: middle;
    color: #000000;
    background: #ffffff;
  }
  .drv-pdf-table thead th {
    background: #ffffff;
    font-weight: 700;
    text-align: center;
    line-height: 1.22;
  }
  .drv-pdf-table tfoot th {
    background: #ffffff;
    font-weight: 700;
  }
  .drv-pdf-table td.c, .drv-pdf-table th.c { text-align: center; }
  .drv-pdf-table td.nowrap { white-space: nowrap; }
  .drv-pdf-table td.num, .drv-pdf-table th.num { text-align: right; white-space: nowrap; }
  .drv-rp-val, .drv-rp-zero {
    display: flex;
    justify-content: space-between;
    gap: 5px;
    width: 100%;
    white-space: nowrap;
  }
  .drv-rp-val.is-bold { font-weight: 700; }
  .drv-rp-zero { color: #000000; }
  .drv-empty-row td { height: 21px; }
  .drv-pdf-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-top: 26px;
    font-size: 9.5px;
    color: #000000;
  }
  .drv-pdf-footer-3 {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 24px;
  }
  .drv-pdf-sig-col {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .drv-pdf-sig-right {
    align-items: center;
    text-align: center;
    min-width: 140px;
  }
  .drv-pdf-sig-center {
    align-items: center;
    text-align: center;
  }
  .drv-pdf-loc { margin-bottom: 2px; }
  .drv-pdf-sig-role { font-weight: 400; }
  .drv-pdf-sig-space { height: 50px; }
  .drv-pdf-sig-name { font-weight: 400; text-decoration: underline; text-underline-offset: 2px; }
  .drv-pdf-sig-title { font-weight: 400; margin-top: 1px; }

  .cs-landscape-page {
    width: 297mm;
    min-height: 210mm;
    max-width: calc(100vw - 32px);
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8mm;
    padding: 8mm 8mm;
    background: #ffffff;
    box-shadow: 0 18px 46px rgba(0,0,0,.38);
    align-items: start;
  }
  .cs-sheet-box {
    border: 1px solid #333333;
    padding: 4mm 4mm 5mm;
    background: #ffffff;
    color: #000000;
    font-size: 8.5px;
  }
  .cs-sheet-empty { border: 0; background: transparent; }
  .cs-sheet-title {
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    margin-bottom: 6px;
  }
  .cs-sheet-meta {
    font-size: 8.5px;
    margin-bottom: 6px;
    line-height: 1.4;
  }
  .cs-sheet-meta div span {
    display: inline-block;
    width: 72px;
    font-weight: 700;
  }
  .cs-grid-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8px;
    font-variant-numeric: tabular-nums;
    color: #000000;
  }
  .cs-grid-table th,
  .cs-grid-table td {
    border: 1px solid #000000;
    padding: 1.5px 2px;
    text-align: center;
    height: 16px;
    color: #000000;
    background: #ffffff;
  }
  .cs-th-waktu { width: 88px; font-weight: 700; }
  .cs-th-day { min-width: 15px; font-weight: 700; background: #ffffff !important; }
  .cs-th-total { width: 28px; font-weight: 700; }
  .cs-waktu {
    text-align: center !important;
    white-space: nowrap;
    font-weight: 400;
    background: #ffffff;
  }
  .cs-cell { font-weight: 400; }
  .cs-vlabel {
    width: 24px;
    padding: 2px 1px !important;
    background: #ffffff;
    vertical-align: middle;
  }
  .cs-vlabel span {
    display: inline-block;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 7px;
    font-weight: 700;
    line-height: 1.1;
    text-align: center;
    white-space: nowrap;
  }
  .cs-sec-label {
    text-align: center !important;
    font-weight: 400;
    width: 50px;
    font-size: 7.5px;
    background: #ffffff;
  }
  .cs-tot-col { background: #ffffff; font-weight: 400; }
  .cs-col-sun { background: #ffff00 !important; }
  .cs-col-hol { background: #fca5a5 !important; }
  .cs-note-row {
    margin-top: 6px;
    font-size: 8px;
    line-height: 1.45;
  }
  .cs-note-row > b {
    display: inline-block;
    width: 44px;
    vertical-align: top;
  }
  .cs-note-grid {
    display: inline-grid;
    grid-template-columns: auto auto;
    column-gap: 24px;
    row-gap: 2px;
    vertical-align: top;
  }
  .cs-sig-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-top: 12px;
    font-size: 8.5px;
  }
  .cs-sig-block { min-width: 120px; }
  .cs-sig-right { text-align: center; }
  .cs-sig-gap { height: 34px; }
  .cs-sig-name { font-weight: 400; text-decoration: underline; text-underline-offset: 2px; }
  .cs-sig-title { font-weight: 700; margin-top: 1px; }

  @page drvPortrait { size: A4 portrait; margin: 10mm 8mm; }
  @page drvLandscape { size: A4 landscape; margin: 7mm 7mm; }
  @media print {
    html, body { background: #ffffff !important; height: auto !important; overflow: visible !important; }
    .print-app-toolbar { display: none !important; }
    .drv-print-canvas { padding: 0 !important; gap: 0 !important; display: block !important; }
    .drv-pdf-sheet {
      page: drvPortrait;
      width: 100% !important;
      min-height: 0 !important;
      max-width: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      margin: 0 !important;
      page-break-after: always;
      break-after: page;
    }
    .cs-landscape-page {
      page: drvLandscape;
      width: 100% !important;
      min-height: 0 !important;
      max-width: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      margin: 0 !important;
      gap: 6mm !important;
      page-break-after: always;
      break-after: page;
    }
    .drv-pdf-sheet:last-child, .cs-landscape-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
  }
`;

export function buildStandalonePrintHtml({ title = 'Cetak Laporan', pagesHtml = '', landscape = false, mixed = false }) {
  const defaultPageRule = mixed
    ? ''
    : `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: ${landscape ? '7mm 7mm' : '10mm 8mm'}; }`;
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <style>${STANDALONE_PRINT_CSS}\n${defaultPageRule}</style>
</head>
<body>
  <div class="print-app-toolbar">
    <span class="print-app-toolbar-title">${esc(title)}</span>
    <div class="print-app-toolbar-actions">
      <button type="button" onclick="window.close()">Close</button>
      <button type="button" class="primary" onclick="window.print()">Print / Save PDF ↗</button>
    </div>
  </div>
  <main class="drv-print-canvas">${pagesHtml}</main>
  <script>
    (function () {
      var fontWait = (document.fonts && document.fonts.ready)
        ? document.fonts.ready.catch(function () {})
        : Promise.resolve();
      Promise.race([
        fontWait,
        new Promise(function (resolve) { setTimeout(resolve, 200); })
      ]).then(function () {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            try { window.print(); } catch (_) {}
          });
        });
      });
    })();
  </script>
</body>
</html>`;
}

// Replicates Cetak Lamaran (printApplication) & Tracking Report (printTrackingReport):
// Opens clean standalone print tab directly with sticky Print/Save PDF toolbar and auto-print,
// falling back to #pkwt-print-stage if browser popup blocker blocks window.open.
export function openDomPrintPreview({ title = 'Cetak Laporan', pagesHtml = '', landscape = false, mixed = false }) {
  const fullHtml = buildStandalonePrintHtml({ title, pagesHtml, landscape, mixed });
  let tab = null;
  try {
    tab = window.open('', '_blank');
  } catch {
    tab = null;
  }

  if (tab && !tab.closed) {
    try {
      tab.document.open();
      tab.document.write(fullHtml);
      tab.document.close();
      tab.document.title = title;
      try { tab.focus(); } catch {}
      return;
    } catch {
      try { tab.close(); } catch {}
    }
  }

  // Fallback to in-page #pkwt-print-stage if popup was blocked
  let stage = document.getElementById('pkwt-print-stage');
  if (!stage) {
    stage = document.createElement('div');
    stage.id = 'pkwt-print-stage';
    document.body.appendChild(stage);
  }
  let pageRule = document.getElementById('ops-dynamic-page-style');
  if (!pageRule) {
    pageRule = document.createElement('style');
    pageRule.id = 'ops-dynamic-page-style';
    document.head.appendChild(pageRule);
  }
  pageRule.textContent = mixed
    ? `@media print {
        @page drvPortrait { size: A4 portrait; margin: 10mm 8mm; }
        @page drvLandscape { size: A4 landscape; margin: 7mm 7mm; }
        #pkwt-print-stage .drv-pdf-sheet { page: drvPortrait; }
        #pkwt-print-stage .cs-landscape-page { page: drvLandscape; }
      }`
    : `@media print { @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: ${landscape ? '7mm 7mm' : '10mm 8mm'}; } }`;

  stage.innerHTML = pagesHtml;
  document.body.classList.add('pkwt-printing');

  const cleanup = () => {
    document.body.classList.remove('pkwt-printing');
    stage.innerHTML = '';
    if (pageRule) pageRule.textContent = '';
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(cleanup, 12000);
  requestAnimationFrame(() => {
    setTimeout(() => {
      try { window.print(); } catch {}
    }, 60);
  });
}

function renderTwoSignatoriesHtml(sig, locationLabel, printDateLabel) {
  return `
    <div class="drv-pdf-footer">
      <div class="drv-pdf-sig-col">
        <div class="drv-pdf-loc">${esc(locationLabel)}, ${esc(printDateLabel)}</div>
        <div class="drv-pdf-sig-role">${esc(sig.leftLabel)}</div>
        <div class="drv-pdf-sig-space"></div>
        <div class="drv-pdf-sig-name">${esc(sig.leftName)}</div>
        <div class="drv-pdf-sig-title">${esc(sig.leftTitle)}</div>
      </div>
      <div class="drv-pdf-sig-col drv-pdf-sig-right">
        <div class="drv-pdf-loc">&nbsp;</div>
        <div class="drv-pdf-sig-role">${esc(sig.rightLabel)}</div>
        <div class="drv-pdf-sig-space"></div>
        <div class="drv-pdf-sig-name">${esc(sig.rightName)}</div>
        <div class="drv-pdf-sig-title">${esc(sig.rightTitle)}</div>
      </div>
    </div>
  `;
}

function renderThreeSignatoriesHtml(sig, locationLabel, printDateLabel) {
  return `
    <div class="drv-pdf-footer drv-pdf-footer-3">
      <div class="drv-pdf-sig-col">
        <div class="drv-pdf-loc">${esc(locationLabel)}, ${esc(printDateLabel)}</div>
        <div class="drv-pdf-sig-role">${esc(sig.leftLabel)}</div>
        <div class="drv-pdf-sig-space"></div>
        <div class="drv-pdf-sig-name">${esc(sig.leftName)}</div>
        <div class="drv-pdf-sig-title">${esc(sig.leftTitle)}</div>
      </div>
      <div class="drv-pdf-sig-col drv-pdf-sig-center">
        <div class="drv-pdf-loc">&nbsp;</div>
        <div class="drv-pdf-sig-role">${esc(sig.midLabel)}</div>
        <div class="drv-pdf-sig-space"></div>
        <div class="drv-pdf-sig-name">${esc(sig.midName)}</div>
        <div class="drv-pdf-sig-title">${esc(sig.midTitle)}</div>
      </div>
      <div class="drv-pdf-sig-col drv-pdf-sig-center">
        <div class="drv-pdf-loc">&nbsp;</div>
        <div class="drv-pdf-sig-role">${esc(sig.rightLabel)}</div>
        <div class="drv-pdf-sig-space"></div>
        <div class="drv-pdf-sig-name">${esc(sig.rightName)}</div>
        <div class="drv-pdf-sig-title">${esc(sig.rightTitle)}</div>
      </div>
    </div>
  `;
}

function buildSummaryTableHtml(payroll, { includeFillerRows = true } = {}) {
  const win = payroll.window;
  const rows = payroll.summaryRows;
  const minRows = includeFillerRows ? Math.max(rows.length, 7) : rows.length;
  const fillerCount = Math.max(0, minRows - rows.length);
  const tot = payroll.summaryTotals;

  const bodyRows = rows.map((r, idx) => `
    <tr>
      <td class="c">${idx + 1}</td>
      <td class="nowrap">${esc(r.driver_name)}</td>
      <td class="c nowrap">${esc(r.employee_no)}</td>
      <td class="num">${fmtRpCell(r.monthlyWage)}</td>
      <td class="c">${fmtFixed1(r.presentDays)}</td>
      <td class="c">${fmtFixed1(r.overtimeHours)}</td>
      <td class="num">${fmtRpCell(r.normalPay)}</td>
      <td class="num">${fmtRpCell(r.overtimePay)}</td>
      <td class="num">${fmtRpCell(r.priorShortfall)}</td>
      <td class="num">${fmtRpCell(r.grossPay)}</td>
      <td class="num">${fmtRpCell(r.bpjsDeduction)}</td>
      <td class="num">${fmtRpCell(r.netPay)}</td>
    </tr>
  `).join('') + Array.from({ length: fillerCount }, () => `
    <tr class="drv-empty-row">
      <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
    </tr>
  `).join('');

  return `
    <table class="drv-pdf-table drv-pdf-table-summary">
      <thead>
        <tr>
          <th rowspan="3" style="width:26px">NO</th>
          <th rowspan="3">NAMA</th>
          <th rowspan="3" style="width:72px">NIK</th>
          <th rowspan="3" style="width:84px">UPAH PER<br>BULAN</th>
          <th colspan="4">${esc(win.headerLabel)}</th>
          <th rowspan="3" style="width:74px">KURANG<br>GAJI</th>
          <th rowspan="3" style="width:82px">UPAH BRUTO</th>
          <th rowspan="3" style="width:80px">JUMLAH<br>POT. BPJS</th>
          <th rowspan="3" style="width:82px">UPAH NETTO</th>
        </tr>
        <tr>
          <th colspan="2">TOTAL</th>
          <th colspan="2">TOTAL UPAH</th>
        </tr>
        <tr>
          <th style="width:44px">HADIR</th>
          <th style="width:50px">LEMBUR</th>
          <th style="width:74px">HADIR (RP)</th>
          <th style="width:74px">LEMBUR</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
      <tfoot>
        <tr>
          <th colspan="4" class="c">TOTAL</th>
          <th class="c">${fmtFixed1(tot.presentDays)}</th>
          <th class="c">${fmtFixed1(tot.overtimeHours)}</th>
          <th class="num">${fmtRpCell(tot.normalPay, true)}</th>
          <th class="num">${fmtRpCell(tot.overtimePay, true)}</th>
          <th class="num">${fmtRpCell(tot.priorShortfall, true)}</th>
          <th class="num">${fmtRpCell(tot.grossPay, true)}</th>
          <th class="num">${fmtRpCell(tot.bpjsDeduction, true)}</th>
          <th class="num">${fmtRpCell(tot.netPay, true)}</th>
        </tr>
      </tfoot>
    </table>
  `;
}

function buildSummaryPdfSheetHtml(payroll, settings) {
  const drvCfg = settings.driver;
  const win = payroll.window;
  return `
    <div class="drv-pdf-sheet pkwt-print-sheet">
      <div class="drv-pdf-header">
        <div>PT. MITRA BINAMANDIRI MAKMUR</div>
        <div>LAPORAN GAJI DRIVER</div>
        <div>SUMMARY</div>
        <div class="drv-pdf-header-line"><span class="drv-pdf-header-lbl">PERIODE</span>: ${esc(win.headerLabel)}</div>
      </div>
      ${buildSummaryTableHtml(payroll, { includeFillerRows: true })}
      ${renderTwoSignatoriesHtml(drvCfg.signatories.summary, drvCfg.reportLocationLabel, win.printDateLabel)}
    </div>
  `;
}

function buildDeptTableHtml(sectionName, payroll, { includeFillerRows = true } = {}) {
  const win = payroll.window;
  const rows = payroll.deptTables[sectionName] || [];
  const tot = payroll.deptTotals[sectionName] || { presentDays: 0, normalHours: 0, overtimeHours: 0, normalPay: 0, overtimePay: 0, priorShortfall: 0, grossPay: 0 };
  const minRows = includeFillerRows ? Math.max(rows.length, 6) : Math.max(rows.length, 1);
  const fillerCount = Math.max(0, minRows - rows.length);

  const bodyRows = rows.map((r, idx) => `
    <tr>
      <td class="c">${idx + 1}</td>
      <td class="nowrap">${esc(r.driver_name)}</td>
      <td class="c nowrap">${esc(r.employee_no)}</td>
      <td class="c">${fmtFixed1(r.presentDays)}</td>
      <td class="c">${fmtFixed1(r.overtimeHours)}</td>
      <td class="num">${fmtRpCell(r.normalPay)}</td>
      <td class="num">${fmtRpCell(r.overtimePay)}</td>
      <td class="num">${fmtRpCell(r.priorShortfall)}</td>
      <td class="num">${fmtRpCell(r.grossPay)}</td>
    </tr>
  `).join('') + Array.from({ length: fillerCount }, () => `
    <tr class="drv-empty-row">
      <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
    </tr>
  `).join('');

  return `
    <table class="drv-pdf-table drv-pdf-table-dept">
      <thead>
        <tr>
          <th rowspan="3" style="width:28px">NO</th>
          <th rowspan="3">NAMA</th>
          <th rowspan="3" style="width:80px">NIK</th>
          <th colspan="4">${esc(win.headerLabel)}</th>
          <th rowspan="3" style="width:88px">KURANG<br>GAJI</th>
          <th rowspan="3" style="width:94px">UPAH BRUTO</th>
        </tr>
        <tr>
          <th colspan="2">TOTAL</th>
          <th colspan="2">TOTAL UPAH</th>
        </tr>
        <tr>
          <th style="width:54px">HADIR</th>
          <th style="width:60px">LEMBUR</th>
          <th style="width:88px">HADIR (RP)</th>
          <th style="width:88px">LEMBUR (RP)</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
      <tfoot>
        <tr>
          <th colspan="3" class="c">TOTAL</th>
          <th class="c">${fmtFixed1(tot.presentDays)}</th>
          <th class="c">${fmtFixed1(tot.overtimeHours)}</th>
          <th class="num">${fmtRpCell(tot.normalPay, true)}</th>
          <th class="num">${fmtRpCell(tot.overtimePay, true)}</th>
          <th class="num">${fmtRpCell(tot.priorShortfall, true)}</th>
          <th class="num">${fmtRpCell(tot.grossPay, true)}</th>
        </tr>
      </tfoot>
    </table>
  `;
}

function buildDeptPdfSheetHtml(sectionName, payroll, settings) {
  const drvCfg = settings.driver;
  const win = payroll.window;
  const isRadin = sectionName.toUpperCase() === 'RADIN';
  return `
    <div class="drv-pdf-sheet pkwt-print-sheet">
      <div class="drv-pdf-header">
        <div>PT. MITRA BINAMANDIRI MAKMUR</div>
        <div>LAPORAN GAJI DRIVER</div>
        <div>${esc(sectionName.toUpperCase())}</div>
        <div class="drv-pdf-header-line"><span class="drv-pdf-header-lbl">PERIODE</span>: ${esc(win.headerLabel)}</div>
      </div>
      ${buildDeptTableHtml(sectionName, payroll, { includeFillerRows: true })}
      ${isRadin
        ? renderThreeSignatoriesHtml(drvCfg.signatories.radin, drvCfg.reportLocationLabel, win.printDateLabel)
        : renderTwoSignatoriesHtml(drvCfg.signatories.department, drvCfg.reportLocationLabel, win.printDateLabel)}
    </div>
  `;
}

function buildSingleChecksheetCardHtml(cs, settings, { forPrint = true } = {}) {
  const sig = settings.driver.signatories.checksheet;
  const colClass = mark => (mark === 'yellow' ? 'cs-col-sun' : (mark === 'red' ? 'cs-col-hol' : ''));
  const dayCount = cs.dayMeta.length;

  const slotRowsHtml = cs.timeRows.map(tr => `
    <tr>
      <td colspan="2" class="cs-waktu">${esc(tr.label)}</td>
      ${tr.cells.map((code, i) => `<td class="cs-cell ${colClass(cs.dayMeta[i]?.colorMark)}">${esc(code)}</td>`).join('')}
      <td class="cs-total-blank"></td>
    </tr>
  `).join('');

  const normalRowsHtml = cs.normalRows.map((nr, idx) => `
    <tr>
      ${idx === 0 ? `<td rowspan="${cs.normalRows.length}" class="cs-vlabel"><span>TOTAL JAM<br>NORMAL</span></td>` : ''}
      <td class="cs-sec-label">${esc(nr.label)}</td>
      ${nr.dailyValues.map((v, i) => `<td class="cs-cell ${colClass(cs.dayMeta[i]?.colorMark)}">${v > 0 ? esc(fmtNum(v, 2)) : ''}</td>`).join('')}
      <td class="cs-cell cs-tot-col">${esc(fmtNum(nr.total, 2) || '0')}</td>
    </tr>
  `).join('');

  const otRowsHtml = cs.overtimeRows.map((or, idx) => `
    <tr>
      ${idx === 0 ? `<td rowspan="${cs.overtimeRows.length}" class="cs-vlabel"><span>TOTAL<br>LEMBUR</span></td>` : ''}
      <td class="cs-sec-label">${esc(or.label)}</td>
      ${or.dailyValues.map((v, i) => `<td class="cs-cell ${colClass(cs.dayMeta[i]?.colorMark)}">${v > 0 ? esc(fmtNum(v, 1)) : ''}</td>`).join('')}
      <td class="cs-cell cs-tot-col">${esc(fmtNum(or.total, 1) || '0')}</td>
    </tr>
  `).join('');

  const footerPrintHtml = forPrint ? `
      <div class="cs-note-row">
        <b>NOTE :</b>
        <div class="cs-note-grid">
          <span>I = INDOOR</span><span>S = SUPPORT</span>
          <span>O = OUTDOOR</span><span>R = RADIN</span>
        </div>
      </div>
      <div class="cs-sig-row">
        <div class="cs-sig-block">
          <div class="cs-sig-role">${esc(sig.leftLabel)}</div>
          <div class="cs-sig-gap"></div>
          <div class="cs-sig-name">${esc(sig.leftName)}</div>
          <div class="cs-sig-title">${esc(sig.leftTitle)}</div>
        </div>
        <div class="cs-sig-block cs-sig-right">
          <div class="cs-sig-role">${esc(sig.rightLabel)}</div>
          <div class="cs-sig-gap"></div>
          <div class="cs-sig-name">${esc(sig.rightName)}</div>
          <div class="cs-sig-title">${esc(sig.rightTitle)}</div>
        </div>
      </div>
  ` : '';

  return `
    <div class="cs-sheet-box">
      <div class="cs-sheet-title">TIME CHECKSHEET SOPIR</div>
      <div class="cs-sheet-meta">
        <div><span>NAMA SOPIR</span>: ${esc(cs.driver.full_name)}</div>
        <div><span>PERIODE</span>: ${esc(cs.periodWindow.checksheetLabel)}</div>
      </div>
      <table class="cs-grid-table">
        <thead>
          <tr>
            <th rowspan="2" colspan="2" class="cs-th-waktu">WAKTU</th>
            <th colspan="${dayCount}">TANGGAL</th>
            <th rowspan="2" class="cs-th-total">TOTAL</th>
          </tr>
          <tr>
            ${cs.dayMeta.map(d => `<th class="cs-th-day">${d.dayNum}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${slotRowsHtml}
          ${normalRowsHtml}
          ${otRowsHtml}
        </tbody>
      </table>
      ${footerPrintHtml}
    </div>
  `;
}

function buildChecksheetsPrintHtml(checksheets, settings) {
  const pairs = [];
  for (let i = 0; i < checksheets.length; i += 2) {
    const a = buildSingleChecksheetCardHtml(checksheets[i], settings, { forPrint: true });
    const b = checksheets[i + 1] ? buildSingleChecksheetCardHtml(checksheets[i + 1], settings, { forPrint: true }) : '<div class="cs-sheet-box cs-sheet-empty"></div>';
    pairs.push(`<div class="cs-landscape-page pkwt-print-sheet">${a}${b}</div>`);
  }
  return pairs.join('');
}

export async function renderDriverReportsView(host, ctx, helpers) {
  const {
    loadOpsState,
    saveDemoOpsState,
    invalidateOpsStateCache,
    getAllKnownEmployees,
    showInlineBanner,
    exportSheetXlsx,
    DRIVER_ADJUSTMENTS_KEY
  } = helpers;

  const state = await loadOpsState(ctx);
  const allEmployees = getAllKnownEmployees(ctx);
  const eligibleDrivers = getEligibleDrivers(allEmployees, state.settings);
  const monthKey = host.dataset.drvRepMonth || '2026-11';
  const halfPeriod = host.dataset.drvRepHalf || 'P1';
  const activeCard = host.dataset.drvRepCard || 'upah';
  const activeUpahTab = host.dataset.drvUpahTab || 'summary';
  const csFilterNik = host.dataset.drvCsFilter || 'ALL';

  const payroll = calculateDriverPayrollPeriod({
    monthKey,
    halfPeriod,
    drivers: eligibleDrivers,
    schedules: state.driverSchedules,
    rawEvents: state.rawEvents,
    reconciliations: state.driverReconciliations || [],
    adjustmentsByPeriod: state.driverAdjustments,
    calendarDays: state.calendarDays,
    settings: state.settings
  });

  const win = payroll.window;
  const periodAdj = state.driverAdjustments?.[win.periodKey] || {};
  const anomalies = payroll.reconciliation.anomalies;

  const renderUpahActionHtml = () => {
    if (activeUpahTab === 'summary') {
      return '<button type="button" class="btn btn-secondary" id="drv-print-summary">Print Summary</button>';
    }
    if (['Support', 'Indoor', 'Outdoor', 'Radin'].includes(activeUpahTab)) {
      return `<button type="button" class="btn btn-secondary" id="drv-print-dept" data-sec="${esc(activeUpahTab)}">Print ${esc(activeUpahTab)}</button>`;
    }
    if (activeUpahTab === 'kurang_gaji') {
      return '<button type="button" class="btn btn-primary" id="drv-adj-save-all">Simpan Penyesuaian</button>';
    }
    const deptSumGross = ['Support', 'Indoor', 'Outdoor', 'Radin'].reduce((s, k) => s + (payroll.deptTotals[k]?.grossPay || 0), 0);
    const matchedAll = deptSumGross === payroll.summaryTotals.grossPay;
    return `<span class="pill ${matchedAll ? 'green' : 'danger'}">${matchedAll ? 'Rekonsiliasi Cocok' : 'Selisih Rekonsiliasi'}</span>`;
  };

  const renderUpahBodyHtml = () => {
    if (activeUpahTab === 'summary') {
      return `<div class="table-wrap">${buildSummaryTableHtml(payroll, { includeFillerRows: false })}</div>`;
    }
    if (['Support', 'Indoor', 'Outdoor', 'Radin'].includes(activeUpahTab)) {
      return `<div class="table-wrap">${buildDeptTableHtml(activeUpahTab, payroll, { includeFillerRows: false })}</div>`;
    }
    if (activeUpahTab === 'kurang_gaji') {
      const isP2 = win.halfPeriod === 'P2';
      return `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NIK</th>
                <th>Nama Driver</th>
                <th class="num">Support (Rp)</th>
                <th class="num">Indoor (Rp)</th>
                <th class="num">Outdoor (Rp)</th>
                <th class="num">Radin (Rp)</th>
                <th class="num">Total Kurang Gaji</th>
                <th class="num">BPJS (${isP2 ? 'Aktif' : 'Non BPJS'})</th>
              </tr>
            </thead>
            <tbody>
              ${eligibleDrivers.map(d => {
                const adj = periodAdj[d.employee_no] || {};
                const bySec = adj.bySection || {};
                const sVal = Number(bySec.Support || 0);
                const iVal = Number(bySec.Indoor || 0);
                const oVal = Number(bySec.Outdoor || 0);
                const rVal = Number(bySec.Radin || 0);
                const totalSf = bySec && Object.keys(bySec).length ? (sVal + iVal + oVal + rVal) : Number(adj.priorShortfall || 0);
                const bpjsVal = adj.bpjsOverride !== undefined && adj.bpjsOverride !== ''
                  ? Number(adj.bpjsOverride)
                  : (isP2 ? state.settings.driver.bpjsDefaultAmount : 0);
                return `
                  <tr data-adj-nik="${esc(d.employee_no)}">
                    <td class="nowrap"><code>${esc(d.employee_no)}</code></td>
                    <td class="nowrap"><b>${esc(d.full_name)}</b></td>
                    <td class="num"><input type="number" class="input drv-sf-input" data-sec="Support" value="${sVal}" style="width:105px" aria-label="Kurang gaji Support ${esc(d.full_name)}"></td>
                    <td class="num"><input type="number" class="input drv-sf-input" data-sec="Indoor" value="${iVal}" style="width:105px" aria-label="Kurang gaji Indoor ${esc(d.full_name)}"></td>
                    <td class="num"><input type="number" class="input drv-sf-input" data-sec="Outdoor" value="${oVal}" style="width:105px" aria-label="Kurang gaji Outdoor ${esc(d.full_name)}"></td>
                    <td class="num"><input type="number" class="input drv-sf-input" data-sec="Radin" value="${rVal}" style="width:105px" aria-label="Kurang gaji Radin ${esc(d.full_name)}"></td>
                    <td class="num nowrap"><b>Rp ${totalSf.toLocaleString('id-ID')}</b></td>
                    <td class="num"><input type="number" class="input drv-bpjs-input" value="${bpjsVal}" style="width:115px" aria-label="BPJS ${esc(d.full_name)}"></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Driver</th>
              <th>Jam Kerja</th>
              <th class="num">Hadir</th>
              <th class="num">Lembur</th>
              <th class="num">Upah</th>
              <th>Departemen</th>
            </tr>
          </thead>
          <tbody>
            ${payroll.reconciliation.rows.length ? payroll.reconciliation.rows.map(r => {
              const splitText = Object.values(r.bySection)
                .filter(s => s.presentDays > 0 || s.overtimeHours > 0)
                .map(s => `${s.code}: ${s.presentDays.toFixed(1)}h / OT ${s.overtimeHours}j`)
                .join(' · ');
              return `
                <tr>
                  <td class="nowrap"><b>${esc(r.work_date)}</b>${r.isOvernight ? ' <span class="pill gold">Lewat Hari</span>' : ''}</td>
                  <td class="nowrap"><b>${esc(r.driver_name)}</b></td>
                  <td class="nowrap">${esc(r.effectiveIn || '-')} – ${esc(r.effectiveOut || '-')}</td>
                  <td class="num">${fmtFixed1(r.metrics.presentDays)}</td>
                  <td class="num">${fmtFixed1(r.metrics.overtimeHours)}</td>
                  <td class="num nowrap"><b>Rp ${(r.metrics.normalPay + r.metrics.overtimePay).toLocaleString('id-ID')}</b></td>
                  <td>${esc(splitText || '-')}</td>
                </tr>
              `;
            }).join('') : '<tr><td colspan="7" class="empty">Belum ada aktivitas driver pada periode ini.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  };

  const shownChecksheets = csFilterNik === 'ALL'
    ? payroll.checksheets
    : payroll.checksheets.filter(c => c.driver.employee_no === csFilterNik);

  host.innerHTML = `
    <div class="ops-stack">
      <div class="card ops-card">
        <div class="ops-head">
          <div>
            <h2>Laporan Driver</h2>
          </div>
          <div class="ops-actions">
            <input type="month" id="drv-rep-month" class="input" value="${esc(monthKey)}" aria-label="Pilih bulan laporan driver">
            <select id="drv-rep-half" class="input" aria-label="Pilih periode payroll driver">
              <option value="P1" ${halfPeriod === 'P1' ? 'selected' : ''}>1 – 15 (Non BPJS)</option>
              <option value="P2" ${halfPeriod === 'P2' ? 'selected' : ''}>16 – Akhir Bulan (Pot. BPJS)</option>
            </select>
            <button type="button" class="btn btn-secondary" id="drv-rep-xlsx">Download Excel</button>
            <button type="button" class="btn btn-primary" id="drv-rep-print-all">Print Semua</button>
          </div>
        </div>

        ${anomalies.length ? `
          <div class="ops-flash-banner ops-flash-error" role="alert">
            <b>Peringatan (${anomalies.length} Data Janggal):</b> Masih ada absensi driver belum diselesaikan di Attendance Management.
          </div>
        ` : ''}

        <div class="drv-report-cards">
          <button type="button" class="drv-report-card ${activeCard === 'upah' ? 'is-active' : ''}" data-card="upah">
            <div class="drv-report-card-title">1. Laporan Upah Driver</div>
          </button>
          <button type="button" class="drv-report-card ${activeCard === 'checksheet' ? 'is-active' : ''}" data-card="checksheet">
            <div class="drv-report-card-title">2. Time Check Sheet</div>
          </button>
        </div>
      </div>

      ${activeCard === 'upah' ? `
        <div class="card ops-card">
          <div class="drv-upah-toolbar">
            <div class="tab-bar" role="tablist">
              <button type="button" class="tab-btn ${activeUpahTab === 'summary' ? 'active' : ''}" data-upah-tab="summary">Summary</button>
              <button type="button" class="tab-btn ${activeUpahTab === 'Support' ? 'active' : ''}" data-upah-tab="Support">Support</button>
              <button type="button" class="tab-btn ${activeUpahTab === 'Indoor' ? 'active' : ''}" data-upah-tab="Indoor">Indoor</button>
              <button type="button" class="tab-btn ${activeUpahTab === 'Outdoor' ? 'active' : ''}" data-upah-tab="Outdoor">Outdoor</button>
              <button type="button" class="tab-btn ${activeUpahTab === 'Radin' ? 'active' : ''}" data-upah-tab="Radin">Radin</button>
              <button type="button" class="tab-btn ${activeUpahTab === 'kurang_gaji' ? 'active' : ''}" data-upah-tab="kurang_gaji">Kurang Gaji &amp; BPJS</button>
              <button type="button" class="tab-btn ${activeUpahTab === 'audit' ? 'active' : ''}" data-upah-tab="audit">Audit</button>
            </div>
            <div class="ops-actions">${renderUpahActionHtml()}</div>
          </div>
          ${renderUpahBodyHtml()}
        </div>
      ` : `
        <div class="card ops-card">
          <div class="drv-upah-toolbar">
            <div></div>
            <div class="ops-actions">
              <select id="drv-cs-filter" class="input" aria-label="Filter sopir checksheet">
                <option value="ALL" ${csFilterNik === 'ALL' ? 'selected' : ''}>Semua Sopir (${payroll.checksheets.length})</option>
                ${payroll.checksheets.map(c => `<option value="${esc(c.driver.employee_no)}" ${csFilterNik === c.driver.employee_no ? 'selected' : ''}>${esc(c.driver.full_name)}</option>`).join('')}
              </select>
              <button type="button" class="btn btn-primary" id="drv-print-cs">Print Time Checksheet</button>
            </div>
          </div>
          <div class="cs-screen-grid">
            ${shownChecksheets.map(c => buildSingleChecksheetCardHtml(c, state.settings, { forPrint: false })).join('')}
          </div>
        </div>
      `}
    </div>
  `;

  host.querySelector('#drv-rep-month')?.addEventListener('change', e => {
    host.dataset.drvRepMonth = e.target.value || '2026-11';
    renderDriverReportsView(host, ctx, helpers);
  });
  host.querySelector('#drv-rep-half')?.addEventListener('change', e => {
    host.dataset.drvRepHalf = e.target.value || 'P1';
    renderDriverReportsView(host, ctx, helpers);
  });
  host.querySelector('#drv-cs-filter')?.addEventListener('change', e => {
    host.dataset.drvCsFilter = e.target.value || 'ALL';
    renderDriverReportsView(host, ctx, helpers);
  });

  host.querySelectorAll('.drv-report-card').forEach(btn => {
    btn.addEventListener('click', () => {
      host.dataset.drvRepCard = btn.dataset.card;
      renderDriverReportsView(host, ctx, helpers);
    });
  });

  host.querySelectorAll('[data-upah-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      host.dataset.drvUpahTab = btn.dataset.upahTab;
      renderDriverReportsView(host, ctx, helpers);
    });
  });

  host.querySelector('#drv-print-summary')?.addEventListener('click', () => {
    openDomPrintPreview({
      title: `Laporan Gaji Driver Summary — ${win.headerLabel}`,
      pagesHtml: buildSummaryPdfSheetHtml(payroll, state.settings),
      landscape: false
    });
  });

  host.querySelector('#drv-print-dept')?.addEventListener('click', btnEv => {
    const sec = btnEv.currentTarget.dataset.sec || 'Support';
    openDomPrintPreview({
      title: `Laporan Gaji Driver ${sec} — ${win.headerLabel}`,
      pagesHtml: buildDeptPdfSheetHtml(sec, payroll, state.settings),
      landscape: false
    });
  });

  host.querySelector('#drv-print-cs')?.addEventListener('click', () => {
    openDomPrintPreview({
      title: `Time Check Sheet Sopir — ${win.checksheetLabel}`,
      pagesHtml: buildChecksheetsPrintHtml(shownChecksheets, state.settings),
      landscape: true
    });
  });

  host.querySelector('#drv-rep-print-all')?.addEventListener('click', () => {
    const upahAll = [
      buildSummaryPdfSheetHtml(payroll, state.settings),
      ...['Support', 'Indoor', 'Outdoor', 'Radin'].map(sec => buildDeptPdfSheetHtml(sec, payroll, state.settings))
    ].join('');
    const csAll = buildChecksheetsPrintHtml(payroll.checksheets, state.settings);
    openDomPrintPreview({
      title: `Paket Lengkap Laporan Driver (${win.headerLabel})`,
      pagesHtml: `${upahAll}${csAll}`,
      landscape: true,
      mixed: true
    });
  });

  host.querySelector('#drv-rep-xlsx')?.addEventListener('click', async () => {
    const aoa = [
      ['NO', 'NAMA', 'NIK', 'UPAH PER BULAN', 'HADIR', 'LEMBUR', 'HADIR (RP)', 'LEMBUR (RP)', 'KURANG GAJI', 'UPAH BRUTO', 'POT. BPJS', 'UPAH NETTO'],
      ...payroll.summaryRows.map((r, i) => [
        i + 1, r.driver_name, r.employee_no, r.monthlyWage, Number(r.presentDays.toFixed(1)), Number(r.overtimeHours.toFixed(1)),
        r.normalPay, r.overtimePay, r.priorShortfall, r.grossPay, r.bpjsDeduction, r.netPay
      ])
    ];
    await exportSheetXlsx(`Laporan_Upah_Driver_${win.periodKey}.xlsx`, 'Summary Upah', aoa);
  });

  host.querySelector('#drv-adj-save-all')?.addEventListener('click', async () => {
    const nextPeriodMap = { ...(state.driverAdjustments?.[win.periodKey] || {}) };
    const isP2 = win.halfPeriod === 'P2';
    const defaultBpjs = isP2 ? state.settings.driver.bpjsDefaultAmount : 0;

    host.querySelectorAll('tr[data-adj-nik]').forEach(tr => {
      const nik = tr.dataset.adjNik;
      const bySection = {};
      let sumSf = 0;
      tr.querySelectorAll('.drv-sf-input').forEach(inp => {
        const val = Math.round(Number(inp.value || 0));
        bySection[inp.dataset.sec] = val;
        sumSf += val;
      });
      const bpjsVal = Math.round(Number(tr.querySelector('.drv-bpjs-input')?.value ?? defaultBpjs));
      nextPeriodMap[nik] = {
        priorShortfall: sumSf,
        bySection,
        bpjsOverride: bpjsVal === defaultBpjs ? '' : bpjsVal
      };
    });

    const nextAllAdj = {
      ...(state.driverAdjustments || {}),
      [win.periodKey]: nextPeriodMap
    };
    state.driverAdjustments = nextAllAdj;

    if (ctx.isDemoMode) {
      saveDemoOpsState(state);
    } else {
      const { error } = await ctx.supabase.from('portal_settings').upsert({ key: DRIVER_ADJUSTMENTS_KEY, value: nextAllAdj });
      if (error) {
        showInlineBanner(host, `Gagal menyimpan penyesuaian kurang gaji: ${error.message}`, 'error');
        return;
      }
      invalidateOpsStateCache();
    }
    await renderDriverReportsView(host, ctx, helpers);
    showInlineBanner(host, `Penyesuaian Kurang Gaji & BPJS periode ${win.periodKey} berhasil disimpan.`, 'ok');
  });
}

export { CHECKSHEET_TIME_SLOTS };
