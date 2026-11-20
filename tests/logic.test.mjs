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
    assert.ok(html.includes('99.6vh !important'), `${label} .sheet must use 99.6vh flex height in print`);
    assert.ok(html.includes('computePrintMetrics'), `${label} must compute print metrics`);
  }

  assert.ok(printJs.includes('print-measuring'), 'print.js must use print-measuring');
  assert.ok(printJs.includes('--print-h'), 'print.js must set --print-h');
  assert.ok(printJs.includes('--print-fs'), 'print.js must set --print-fs');
  assert.ok(printJs.includes('print-color-adjust:exact!important'), 'print.js DISC CSS must enforce exact print colors');
  assert.ok(printJs.includes('99.6vh!important'), 'print.js .aux-sheet must use 99.6vh in print');
});

