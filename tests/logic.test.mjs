import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeDisc, ageFromDate } from '../assets/js/disc-engine.js';
import {
  TEMPLATE_URL,
  DEFAULT_MASTER_REVISION,
  REHOLZ_TEMPLATE_URL,
  REHOLZ_MASTER_REVISION
} from '../assets/js/config.js';

test('config defines distinct Mitra and ReHolz print masters', () => {
  assert.equal(TEMPLATE_URL, './templates/application-master.html');
  assert.equal(REHOLZ_TEMPLATE_URL, './templates/application-master-reholz.html');
  assert.ok(DEFAULT_MASTER_REVISION.includes('mbm'));
  assert.ok(REHOLZ_MASTER_REVISION.includes('reholz'));
});

test('Mitra and ReHolz application masters maintain 100% form field parity', () => {
  const mitraHtml = fs.readFileSync('templates/application-master.html', 'utf8');
  const reholzHtml = fs.readFileSync('templates/application-master-reholz.html', 'utf8');

  const extractNames = (html) => {
    const formMatch = html.match(/<form[^>]*id="applicationForm"[\s\S]*?<\/form>/i);
    assert.ok(formMatch, 'applicationForm must exist');
    return new Set([...formMatch[0].matchAll(/\bname="([^"]+)"/g)].map(m => m[1]));
  };

  const mitraNames = extractNames(mitraHtml);
  const reholzNames = extractNames(reholzHtml);

  assert.equal(mitraNames.size, reholzNames.size);
  assert.deepEqual([...mitraNames].filter(n => !reholzNames.has(n)), []);
  assert.deepEqual([...reholzNames].filter(n => !mitraNames.has(n)), []);
  assert.ok(mitraNames.has('saudara4_nama'));
  assert.ok(mitraNames.has('nama_terang'));
  assert.ok(mitraNames.has('setuju'));
});

test('computeDisc computes g1, g2, g3, pola, and dominant factor from 24 answers', () => {
  const answers = Array.from({ length: 24 }, (_, idx) => ({
    most: idx % 4,
    least: (idx + 2) % 4
  }));
  const result = computeDisc(answers);
  assert.equal(result.g1.length, 4);
  assert.equal(result.g2.length, 4);
  assert.equal(result.g3.length, 4);
  assert.equal(result.pola.length, 3);
  assert.ok(['D', 'I', 'S', 'C'].includes(result.hurufDominan));
  assert.ok(result.detail?.judul);
});

test('computeDisc rejects malformed or incomplete answers', () => {
  assert.throws(() => computeDisc([]), /24 jawaban/);
  assert.throws(() => computeDisc(Array.from({ length: 24 }, () => ({ most: 1, least: 1 }))), /tidak valid/);
});

test('ageFromDate handles valid and invalid dates safely', () => {
  assert.equal(ageFromDate(''), '');
  assert.equal(ageFromDate('not-a-date'), '');
  const age = ageFromDate('1996-08-15');
  assert.ok(typeof age === 'number' && age >= 25 && age < 60);
});

test('Mitra and ReHolz masters isolate mobile query to screen and support robust print sizing', () => {
  const mitraHtml = fs.readFileSync('templates/application-master.html', 'utf8');
  const reholzHtml = fs.readFileSync('templates/application-master-reholz.html', 'utf8');
  const printJs = fs.readFileSync('assets/js/print.js', 'utf8');

  assert.match(mitraHtml, new RegExp(`name="form-master-revision"\\s+content="${DEFAULT_MASTER_REVISION}"`));
  assert.match(reholzHtml, new RegExp(`name="form-master-revision"\\s+content="${REHOLZ_MASTER_REVISION}"`));

  for (const [label, html] of [['Mitra', mitraHtml], ['ReHolz', reholzHtml]]) {
    assert.ok(!/@media\s*\(max-width:\s*760px\)/.test(html), `${label} must scope 760px query to @media screen`);
    assert.ok(/@media\s+screen\s+and\s+\(max-width:\s*760px\)/.test(html), `${label} must have @media screen and (max-width: 760px)`);
    assert.ok(html.includes('body.print-measuring'), `${label} must define body.print-measuring`);
    assert.ok(html.includes('print-color-adjust: exact !important'), `${label} must enforce exact print colors`);
    assert.ok(html.includes('var(--print-h'), `${label} must consume --print-h in print CSS`);
    assert.ok(html.includes('min-height: 99.4vh !important'), `${label} .sheet must use 99.4vh min-height in print`);
    assert.ok(html.includes('overflow: visible !important'), `${label} .sheet must allow overflow onto extra pages when essays expand`);
    assert.ok(!html.includes('--print-fs'), `${label} must expand fields rather than shrinking font sizes`);
    assert.ok(html.includes('computePrintMetrics'), `${label} must compute print metrics`);
  }

  assert.ok(printJs.includes('print-measuring'), 'print.js must use print-measuring');
  assert.ok(printJs.includes('--print-h'), 'print.js must set --print-h');
  assert.ok(!printJs.includes('--print-fs'), 'print.js must not shrink font sizes with --print-fs');
  assert.ok(printJs.includes('print-color-adjust:exact!important'), 'print.js DISC CSS must enforce exact print colors');
  assert.ok(printJs.includes('99.6vh!important'), 'print.js .aux-sheet must use 99.6vh in print');
});

import {
  calculateContractDates,
  buildDuplicateCandidatePayload,
  deriveCandidateProgress,
  parseEmployeeSpreadsheetRows,
  formatEmployeeExportRow,
  verifyPinRevealPassword,
  normalizeLoginIdentifier,
  validateLoginIdentifier,
  validatePin,
  findDefaultInterviewer,
  isRootAdminAccount,
  buildEmployeeUserOptionLabel,
  EMPLOYEE_TABLE_HEADERS
} from '../assets/js/workspace-logic.js';

test('calculateContractDates computes exact inclusive end date matching 17 Maret 2026 - 16 Maret 2027', () => {
  const oneYear = calculateContractDates('2026-03-17', 12);
  assert.deepEqual(oneYear, {
    startIso: '2026-03-17',
    endIso: '2027-03-16',
    months: 12,
    displayRange: '17 Maret 2026 - 16 Maret 2027'
  });
  const sixMonths = calculateContractDates('2026-07-13', 6);
  assert.equal(sixMonths.endIso, '2027-01-12');
  const threeMonths = calculateContractDates('2026-01-31', 3);
  assert.equal(threeMonths.endIso, '2026-04-29');
  assert.equal(calculateContractDates('2026-03-17', 2), null);
  assert.equal(calculateContractDates('invalid', 12), null);
});

test('NIK login normalization and PIN reveal password check enforce rules', () => {
  assert.equal(normalizeLoginIdentifier(' ST 130116 '), 'st130116');
  assert.equal(validateLoginIdentifier('ST 130116'), true);
  assert.equal(validateLoginIdentifier('ab'), false);
  assert.equal(validatePin('123456'), true);
  assert.equal(validatePin('12ab'), false);
  assert.equal(verifyPinRevealPassword('8karakterH!'), true);
  assert.equal(verifyPinRevealPassword('wrong'), false);
});

test('buildDuplicateCandidatePayload enforces position change and strips heavy KTP base64', () => {
  const source = {
    id: 'app-1',
    full_name: 'Budi Santoso',
    nik: '3514122006840004',
    position: 'CNC',
    cv_path: 'candidate-cv/uuid/cv.pdf',
    ktp_path: 'candidate-identity/uuid/ktp.jpg',
    application_data: { nama: 'Budi Santoso', posisi: 'CNC', ktp_foto: 'data:image/jpeg;base64,HUGE' }
  };
  assert.throws(() => buildDuplicateCandidatePayload(source, 'CNC'), /berbeda/);
  const dup = buildDuplicateCandidatePayload(source, 'Maintenance');
  assert.equal(dup.position, 'Maintenance');
  assert.equal(dup.application_data.posisi, 'Maintenance');
  assert.equal(dup.application_data.ktp_foto, undefined);
  assert.equal(dup.duplicated_from, 'app-1');
  assert.equal(dup.stage, 'application_submitted');
});

test('deriveCandidateProgress follows interview and employee progression', () => {
  const base = { id: 'a1', stage: 'application_submitted', disc_submissions: [] };
  assert.equal(deriveCandidateProgress(base, [], null).label, 'Formulir Masuk');
  assert.equal(
    deriveCandidateProgress({ ...base, stage: 'disc_completed' }, [{ interview_stage: 'HR 1', decision: 'Direkomendasikan', created_at: '2026-03-01T00:00:00Z' }], null).label,
    'Interview HR 1 · Direkomendasikan'
  );
  assert.equal(
    deriveCandidateProgress(base, [{ interview_stage: 'Final Interview', decision: 'Kirim Ke OS', created_at: '2026-03-05T00:00:00Z' }], null).label,
    'Final Interview · Kirim Ke OS'
  );
  assert.equal(
    deriveCandidateProgress(base, [{ interview_stage: 'Final Interview', decision: 'Ditolak', created_at: '2026-03-05T00:00:00Z' }], null).label,
    'Final Interview · Ditolak'
  );
  assert.equal(
    deriveCandidateProgress(base, [], { id: 'emp-1' }).label,
    'Diterima · Karyawan'
  );
});

test('Employee Directory spreadsheet parser and formatter align with 16-column format', () => {
  assert.equal(EMPLOYEE_TABLE_HEADERS.length, 16);
  const { rows, errors } = parseEmployeeSpreadsheetRows([
    {
      Nama: 'ABD. KHAMID',
      Nik: 'ST 130116',
      Departement: 'PURCHASING',
      'Tgl Masuk': '05-11-2004',
      Jabatan: 'MMD',
      'Mulai Kontrak': '-',
      'Kontrak Berakhir': '-',
      Alamat: 'Subontoro Rt 16/07',
      Nik2: '3516112304830004',
      'Tempat Lahir': 'Mojokerto',
      'Tanggal Lahir': '31-12-1983',
      'No. Telp': '82230164498',
      Status: 'TETAP',
      Pendidikan: 'SMP',
      'Jenis Kelamin': 'Laki-laki',
      Agama: 'Islam'
    }
  ]);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].employee_no, 'ST 130116');
  assert.equal(rows[0].join_date, '2004-11-05');
  assert.equal(rows[0].contract_start_date, null);
  assert.equal(rows[0].birth_date, '1983-12-31');
  const exported = formatEmployeeExportRow(rows[0]);
  assert.deepEqual(Object.keys(exported), EMPLOYEE_TABLE_HEADERS);
  assert.equal(exported['Tgl Masuk'], '05-11-2004');
  assert.equal(exported['Mulai Kontrak'], '-');
});

test('findDefaultInterviewer matches Samsul Hariyadi for HR 1 and Diana Anita Sari for HR 2 strictly from Employee Directory', () => {
  const list = [
    { id: 'e1', employee_no: 'ST 1001', full_name: 'Samsul Hariyadi' },
    { id: 'e2', employee_no: 'ST 1002', full_name: 'Diana Anita Sari' }
  ];
  assert.equal(findDefaultInterviewer('HR 1', list).employeeId, 'e1');
  assert.equal(findDefaultInterviewer('HR 2', list).employeeId, 'e2');
  assert.equal(findDefaultInterviewer('HR 1', []), null);
  assert.equal(findDefaultInterviewer('User 1', list), null);
});

test('isRootAdminAccount and buildEmployeeUserOptionLabel identify root Admin and format options cleanly', () => {
  assert.equal(isRootAdminAccount({ username: 'admin' }), true);
  assert.equal(isRootAdminAccount({ employeeNik: 'ADMIN' }), true);
  assert.equal(isRootAdminAccount({ displayName: 'Administrator' }), true);
  assert.equal(isRootAdminAccount({ username: 'st130116', displayName: 'ABD. KHAMID' }), false);
  assert.equal(
    buildEmployeeUserOptionLabel({ employee_no: 'ST 130116', full_name: 'ABD. KHAMID', position: 'MMD' }),
    'ST 130116 — ABD. KHAMID (MMD)'
  );
});


