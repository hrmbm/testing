import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPLY_INFO_SOURCES,
  FORM_INFO_SOURCES,
  RECOMMENDATION_THRESHOLD,
  DEFAULT_VACANCIES,
  normalizeVacancy,
  normalizeVacancyList,
  extractActivePositionNames,
  mergeVacanciesWithPositions,
  calculateVacancyMaxScore,
  calculateCandidateScore,
  buildShareUrl
} from '../assets/js/vacancy-logic.js';

test('info source options match exact requirements for /apply and /form', () => {
  assert.deepEqual(APPLY_INFO_SOURCES, [
    'Threads',
    'Instagram',
    'Facebook',
    'Saluran Whatsapp',
    'Lainnya'
  ]);
  assert.deepEqual(FORM_INFO_SOURCES, [
    'Jobstreet',
    'Glints',
    'Threads',
    'Instagram',
    'Facebook',
    'Saluran Whatsapp',
    'Lainnya'
  ]);
});

test('all DEFAULT_VACANCIES calibrate cleanly to 100 maximum points', () => {
  assert.equal(RECOMMENDATION_THRESHOLD, 60);
  for (const vacancy of DEFAULT_VACANCIES) {
    assert.equal(
      calculateVacancyMaxScore(vacancy),
      100,
      `Expected ${vacancy.name} max score to equal 100`
    );
  }
});

test('normalizeVacancy supports flexible dropdown, radio, checkbox, text, textarea, and number questions', () => {
  const v = normalizeVacancy({
    name: 'Operator Finishing',
    primaryDistricts: ['Pasuruan - Purwosari', 'Pasuruan - Purwosari', 'Pasuruan - Pandaan'],
    primaryLocationScore: '15',
    otherLocationLabel: 'Luar area pabrik',
    otherLocationScore: '3',
    questions: [
      {
        label: 'Pengalaman amplas?',
        type: 'dropdown',
        options: [
          { label: 'Jawaban A (> 1 tahun)', score: '20' },
          { label: 'Jawaban B (< 1 tahun)', score: '10' }
        ]
      },
      {
        label: 'Bersedia shift?',
        type: 'radio',
        options: [
          { label: 'Ya', score: 10 },
          { label: 'Tidak', score: 0 }
        ]
      },
      {
        label: 'Alat yang dikuasai',
        type: 'checkbox',
        options: [
          { label: 'Sander', score: 5 },
          { label: 'Spray Gun', score: 8 }
        ]
      },
      {
        label: 'Domisili detail',
        type: 'text',
        filledScore: '4'
      },
      {
        label: 'Ceritakan pengalaman',
        type: 'textarea',
        filledScore: 6
      },
      {
        label: 'Usia (tahun)',
        type: 'number',
        filledScore: 2
      }
    ]
  });

  assert.equal(v.name, 'Operator Finishing');
  assert.deepEqual(v.primaryDistricts, ['Pasuruan - Purwosari', 'Pasuruan - Pandaan']);
  assert.equal(v.primaryLocationScore, 15);
  assert.equal(v.otherLocationScore, 3);
  assert.equal(v.questions.length, 6);
  assert.deepEqual(
    v.questions.map(q => q.type),
    ['dropdown', 'radio', 'checkbox', 'text', 'textarea', 'number']
  );
  assert.equal(v.questions[0].options[0].score, 20);
  assert.equal(v.questions[3].filledScore, 4);
});

test('calculateCandidateScore computes location score + option scores + filled scores and >= 60 recommendation', () => {
  const vacancy = normalizeVacancy({
    name: 'Las',
    primaryDistricts: ['Pasuruan - Purwosari', 'Pasuruan - Sukorejo'],
    primaryLocationScore: 10,
    otherLocationScore: 4,
    questions: [
      {
        id: 'q1',
        label: 'Jenis las?',
        type: 'dropdown',
        options: [
          { label: 'SMAW', score: 10 },
          { label: 'GTAW', score: 20 }
        ]
      },
      {
        id: 'q2',
        label: 'Keahlian tambahan',
        type: 'checkbox',
        options: [
          { label: 'Baca gambar teknik', score: 8 },
          { label: 'Gerinda', score: 4 }
        ]
      },
      {
        id: 'q3',
        label: 'Pengalaman kerja',
        type: 'textarea',
        filledScore: 5
      }
    ]
  });

  const primaryHit = calculateCandidateScore(vacancy, 'Pasuruan', 'Purwosari', {
    q1: 'GTAW',
    q2: ['Baca gambar teknik', 'Gerinda'],
    q3: 'Pengelasan rangka besi 2 tahun'
  });
  assert.equal(primaryHit.locationType, 'Lokasi Utama');
  assert.equal(primaryHit.locationScore, 10);
  assert.equal(primaryHit.questionScore, 37);
  assert.equal(primaryHit.totalScore, 47);
  assert.equal(primaryHit.maxScore, 47);
  assert.equal(primaryHit.percentageScore, 100);
  assert.equal(primaryHit.recommended, true);
  assert.equal(primaryHit.recommendation, 'Direkomendasikan');

  const otherAreaHit = calculateCandidateScore(vacancy, 'Malang', 'Singosari', {
    q1: 'SMAW',
    q2: ['Gerinda'],
    q3: ''
  });
  assert.equal(otherAreaHit.locationType, 'Lokasi Lain');
  assert.equal(otherAreaHit.locationScore, 4);
  assert.equal(otherAreaHit.questionScore, 14);
  assert.equal(otherAreaHit.totalScore, 18);
  assert.equal(otherAreaHit.percentageScore, 38.3);
  assert.equal(otherAreaHit.recommended, false);
  assert.equal(otherAreaHit.recommendation, 'Belum Ditentukan');
});

test('calculateCandidateScore respects exact 59 vs 60 boundary and zero-max safety', () => {
  const vacancy100 = normalizeVacancy({
    name: 'Tester Boundary',
    primaryDistricts: ['Pasuruan - Pandaan'],
    primaryLocationScore: 20,
    otherLocationScore: 10,
    questions: [
      {
        id: 'q1',
        label: 'Skor test',
        type: 'dropdown',
        options: [
          { label: 'Tepat 60', score: 50 },
          { label: 'Skor 49', score: 49 }
        ]
      },
      {
        id: 'q2',
        label: 'Penuh 100',
        type: 'text',
        filledScore: 30
      }
    ]
  });

  // 10 (other location) + 49 + 0 = 59 / 100 -> NOT recommended
  const score59 = calculateCandidateScore(vacancy100, 'Malang', 'Singosari', { q1: 'Skor 49', q2: '' });
  assert.equal(score59.totalScore, 59);
  assert.equal(score59.maxScore, 100);
  assert.equal(score59.percentageScore, 59);
  assert.equal(score59.recommended, false);
  assert.equal(score59.recommendation, 'Belum Ditentukan');

  // 10 (other location) + 50 + 0 = 60 / 100 -> RECOMMENDED (>= 60)
  const score60 = calculateCandidateScore(vacancy100, 'Malang', 'Singosari', { q1: 'Tepat 60', q2: '' });
  assert.equal(score60.totalScore, 60);
  assert.equal(score60.percentageScore, 60);
  assert.equal(score60.recommended, true);
  assert.equal(score60.recommendation, 'Direkomendasikan');

  // Zero-max vacancy never produces NaN or false-positive recommendation
  const emptyScoreVacancy = normalizeVacancy({
    name: 'Zero Scoring',
    primaryLocationScore: 0,
    otherLocationScore: 0,
    questions: [{ id: 'q', label: 'Nama', type: 'text', filledScore: 0 }]
  });
  const zeroRes = calculateCandidateScore(emptyScoreVacancy, 'Malang', 'Lawang', { q: 'Ada' });
  assert.equal(zeroRes.percentageScore, 0);
  assert.equal(zeroRes.recommended, false);
  assert.equal(zeroRes.recommendation, 'Belum Ditentukan');
});

test('extractActivePositionNames and mergeVacanciesWithPositions preserve active string array compatibility', () => {
  const list = normalizeVacancyList([
    ...DEFAULT_VACANCIES.slice(0, 2),
    { name: 'Arsip Posisi', active: false }
  ]);
  const activeNames = extractActivePositionNames(list);
  assert.deepEqual(activeNames, ['Spray', 'Las']);

  const merged = mergeVacanciesWithPositions(list, ['Spray', 'Las', 'QC Inspektur']);
  assert.equal(merged.some(v => v.name === 'QC Inspektur'), true);
});

test('buildShareUrl constructs clean position and source query parameters', () => {
  assert.equal(
    buildShareUrl('https://karir.test/apply/', 'Operator CNC', 'Instagram'),
    'https://karir.test/apply/?posisi=Operator+CNC&sumber=Instagram'
  );
  assert.equal(
    buildShareUrl('https://karir.test/apply/?foo=bar', 'Las', ''),
    'https://karir.test/apply/?posisi=Las'
  );
});
