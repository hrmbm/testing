export const DISTRICTS_BY_CITY = {
  Pasuruan: [
    'Bangil', 'Beji', 'Gempol', 'Gondang Wetan', 'Grati', 'Kejayan', 'Kraton',
    'Lekok', 'Lumbang', 'Nguling', 'Pandaan', 'Pasrepan', 'Pohjentrek', 'Prigen',
    'Purwodadi', 'Purwosari', 'Puspo', 'Rejoso', 'Rembang', 'Sukorejo', 'Tosari',
    'Tutur', 'Winongan', 'Wonorejo', 'Bugul Kidul (Kota)', 'Gadingrejo (Kota)',
    'Panggungrejo (Kota)', 'Purworejo (Kota)'
  ],
  Sidoarjo: [
    'Balongbendo', 'Buduran', 'Candi', 'Gedangan', 'Jabon', 'Krembung', 'Krian',
    'Prambon', 'Porong', 'Sedati', 'Sidoarjo', 'Sukodono', 'Taman',
    'Tanggulangin', 'Tarik', 'Tulangan', 'Waru', 'Wonoayu'
  ],
  Mojokerto: [
    'Bangsal', 'Dawarblandong', 'Dlanggu', 'Gedeg', 'Gondang', 'Jatirejo', 'Jetis',
    'Kemlagi', 'Kutorejo', 'Mojoanyar', 'Mojosari', 'Ngoro', 'Pacet', 'Pungging',
    'Puri', 'Sooko', 'Trawas', 'Trowulan', 'Kranggan (Kota)', 'Magersari (Kota)',
    'Prajurit Kulon (Kota)'
  ],
  Malang: [
    'Ampelgading', 'Bantur', 'Bululawang', 'Dampit', 'Dau', 'Donomulyo', 'Gedangan',
    'Gondanglegi', 'Jabung', 'Kalipare', 'Karangploso', 'Kasembon', 'Kepanjen',
    'Kromengan', 'Lawang', 'Ngajum', 'Ngantang', 'Pagak', 'Pagelaran', 'Pakis',
    'Pakisaji', 'Poncokusumo', 'Pujon', 'Singosari', 'Sumbermanjing Wetan',
    'Sumberpucung', 'Tajinan', 'Tirtoyudo', 'Tumpang', 'Turen', 'Wagir', 'Wajak',
    'Wonosari', 'Blimbing (Kota)', 'Kedungkandang (Kota)', 'Klojen (Kota)',
    'Lowokwaru (Kota)', 'Sukun (Kota)'
  ],
  Surabaya: [
    'Asemrowo', 'Benowo', 'Bubutan', 'Bulak', 'Dukuh Pakis', 'Gayungan', 'Genteng',
    'Gubeng', 'Gunung Anyar', 'Jambangan', 'Karang Pilang', 'Kenjeran', 'Krembangan',
    'Lakarsantri', 'Mulyorejo', 'Pabean Cantian', 'Pakal', 'Rungkut', 'Sambikerep',
    'Sawahan', 'Semampir', 'Simokerto', 'Sukolilo', 'Sukomanunggal', 'Tambaksari',
    'Tandes', 'Tegalsari', 'Tenggilis Mejoyo', 'Wiyung', 'Wonocolo', 'Wonokromo'
  ],
  Gresik: [
    'Balongpanggang', 'Benjeng', 'Bungah', 'Cerme', 'Driyorejo', 'Duduksampeyan',
    'Dukun', 'Gresik', 'Kebomas', 'Kedamean', 'Manyar', 'Menganti', 'Panceng',
    'Sangkapura', 'Sidayu', 'Tambak', 'Ujungpangkah', 'Wringinanom'
  ]
};

export const APPLY_INFO_SOURCES = [
  'Threads',
  'Instagram',
  'Facebook',
  'Saluran Whatsapp',
  'Lainnya'
];

export const FORM_INFO_SOURCES = [
  'Jobstreet',
  'Glints',
  'Threads',
  'Instagram',
  'Facebook',
  'Saluran Whatsapp',
  'Lainnya'
];

export const QUESTION_TYPES = [
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'radio', label: 'Single Choice' },
  { value: 'checkbox', label: 'Multiple Choice' },
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'number', label: 'Number' }
];

export const HR_WHATSAPP_NUMBER = '628133193313';

const VALID_QUESTION_TYPES = new Set(QUESTION_TYPES.map(item => item.value));

const VALID_SHOW_OPERATORS = new Set(['equals', 'not_equals', 'includes']);

function normalizeShowWhen(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const questionId = String(raw.questionId || '').trim();
  if (!questionId) return null;
  const operator = VALID_SHOW_OPERATORS.has(raw.operator) ? raw.operator : 'equals';
  const value = String(raw.value ?? '').trim();
  if (!value) return null;
  return { questionId, operator, value };
}

function makeQuestion(id, label, type, extra = {}) {
  return {
    id,
    label,
    type,
    required: extra.required !== false,
    placeholder: extra.placeholder || '',
    filledScore: Number.isFinite(Number(extra.filledScore)) ? Number(extra.filledScore) : 0,
    options: Array.isArray(extra.options) ? extra.options : [],
    showWhen: normalizeShowWhen(extra.showWhen)
  };
}

export const RECOMMENDATION_THRESHOLD = 60;

export const DEFAULT_RECRUITMENT_SCORING_CONFIG = {
  defaultMinScore: RECOMMENDATION_THRESHOLD,
  scoringMode: 'percentage', // 'percentage' | 'points'
  requireQualificationForWa: true,
  nonQualifiedMessage: 'Data Anda telah tersimpan di database HR untuk dipertimbangkan sesuai kebutuhan perusahaan.'
};

export function normalizeRecruitmentScoringConfig(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const mode = src.scoringMode === 'points' ? 'points' : 'percentage';
  const rawMin = Number(src.defaultMinScore);
  const defaultMinScore = Number.isFinite(rawMin)
    ? Math.max(0, mode === 'percentage' ? Math.min(100, rawMin) : rawMin)
    : RECOMMENDATION_THRESHOLD;
  return {
    defaultMinScore: Math.round(defaultMinScore * 100) / 100,
    scoringMode: mode,
    requireQualificationForWa: src.requireQualificationForWa !== false,
    nonQualifiedMessage: String(src.nonQualifiedMessage || '').trim() || DEFAULT_RECRUITMENT_SCORING_CONFIG.nonQualifiedMessage
  };
}

export function buildApplicationPdfTitle(record = {}) {
  const app = (record && typeof record.application_data === 'object' && record.application_data) || {};
  const rawName = String(record?.full_name || app.nama || '').trim();
  const rawPos = String(record?.position || app.posisi || '').trim();
  const clean = s => s.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const name = clean(rawName);
  const pos = clean(rawPos);
  if (name && pos) return `${name} - ${pos}`;
  return name || pos || 'Formulir Lamaran Kerja';
}

export const DEFAULT_PRIMARY_DISTRICTS = ['Pasuruan - Purwosari', 'Pasuruan - Purwodadi', 'Pasuruan - Sukorejo', 'Pasuruan - Pandaan', 'Pasuruan - Prigen'];

export const DEFAULT_VACANCIES = [
  {
    id: 'spray',
    name: 'Spray',
    active: true,
    primaryDistricts: [...DEFAULT_PRIMARY_DISTRICTS],
    primaryLocationScore: 20,
    otherLocationLabel: 'Area selain lokasi utama',
    otherLocationScore: 10,
    questions: [
      makeQuestion('sprayType', 'Pernah nyepray apa?', 'dropdown', {
        options: [
          { label: 'Kayu', score: 35 },
          { label: 'Besi', score: 20 }
        ]
      }),
      makeQuestion('company', 'Pengalamannya di mana?', 'text', {
        placeholder: 'Nama perusahaan / tempat kerja',
        filledScore: 0
      }),
      makeQuestion('duration', 'Berapa lama pengalaman?', 'dropdown', {
        options: [
          { label: 'Lebih dari 6 bulan', score: 35 },
          { label: 'Kurang dari 6 bulan', score: 15 }
        ]
      }),
      makeQuestion('explanation', 'Jelaskan pekerjaanmu ketika nyepray', 'textarea', {
        placeholder: 'Jenis material, proses, alat, dan pekerjaan yang biasa dilakukan',
        filledScore: 10
      })
    ]
  },
  {
    id: 'las',
    name: 'Las',
    active: true,
    primaryDistricts: [...DEFAULT_PRIMARY_DISTRICTS],
    primaryLocationScore: 20,
    otherLocationLabel: 'Area selain lokasi utama',
    otherLocationScore: 10,
    questions: [
      makeQuestion('weldingType', 'Pernah menggunakan las apa?', 'dropdown', {
        options: [
          { label: 'SMAW', score: 20 },
          { label: 'GMAW', score: 35 },
          { label: 'GTAW', score: 35 }
        ]
      }),
      makeQuestion('company', 'Pengalamannya di mana?', 'text', {
        placeholder: 'Nama perusahaan / tempat kerja',
        filledScore: 0
      }),
      makeQuestion('duration', 'Berapa lama pengalaman?', 'dropdown', {
        options: [
          { label: 'Lebih dari 6 bulan', score: 35 },
          { label: 'Kurang dari 6 bulan', score: 15 }
        ]
      }),
      makeQuestion('explanation', 'Jelaskan pengalaman pengelasan', 'textarea', {
        placeholder: 'Material dan pekerjaan yang pernah dikerjakan',
        filledScore: 10
      })
    ]
  },
  {
    id: 'cnc',
    name: 'CNC',
    active: true,
    primaryDistricts: [...DEFAULT_PRIMARY_DISTRICTS],
    primaryLocationScore: 20,
    otherLocationLabel: 'Area selain lokasi utama',
    otherLocationScore: 10,
    questions: [
      makeQuestion('cncMachine', 'Pernah mengoperasikan mesin CNC apa?', 'text', {
        placeholder: 'Jenis / merek / tipe mesin',
        filledScore: 25
      }),
      makeQuestion('company', 'Pengalamannya di mana?', 'text', {
        placeholder: 'Nama perusahaan / tempat kerja',
        filledScore: 0
      }),
      makeQuestion('duration', 'Berapa lama pengalaman?', 'dropdown', {
        options: [
          { label: 'Lebih dari 6 bulan', score: 45 },
          { label: 'Kurang dari 6 bulan', score: 15 }
        ]
      }),
      makeQuestion('explanation', 'Jelaskan pekerjaan CNC yang dikuasai', 'textarea', {
        placeholder: 'Mesin, setting, program, dan proses yang dikerjakan',
        filledScore: 10
      })
    ]
  },
  {
    id: 'spindel-kayu',
    name: 'Spindel Kayu',
    active: true,
    primaryDistricts: [...DEFAULT_PRIMARY_DISTRICTS],
    primaryLocationScore: 20,
    otherLocationLabel: 'Area selain lokasi utama',
    otherLocationScore: 10,
    questions: [
      makeQuestion('spindleOperate', 'Pernah mengoperasikan & menyeting mesin spindel kayu?', 'dropdown', {
        options: [
          { label: 'Ya', score: 40 },
          { label: 'Tidak', score: 0 }
        ]
      }),
      makeQuestion('company', 'Pengalamannya di mana?', 'text', {
        placeholder: 'Nama perusahaan / tempat kerja',
        filledScore: 0
      }),
      makeQuestion('duration', 'Berapa lama pengalaman?', 'dropdown', {
        options: [
          { label: 'Lebih dari 6 bulan', score: 30 },
          { label: 'Kurang dari 6 bulan', score: 10 }
        ]
      }),
      makeQuestion('explanation', 'Jelaskan bagaimana pekerjaan spindel dilakukan', 'textarea', {
        placeholder: 'Pengoperasian, setting, jenis produk, dan proses kerja',
        filledScore: 10
      })
    ]
  },
  {
    id: 'maintenance',
    name: 'Maintenance',
    active: true,
    primaryDistricts: [...DEFAULT_PRIMARY_DISTRICTS],
    primaryLocationScore: 20,
    otherLocationLabel: 'Area selain lokasi utama',
    otherLocationScore: 10,
    questions: [
      makeQuestion('maintenanceSkill', 'Bidang maintenance yang dikuasai?', 'checkbox', {
        options: [
          { label: 'Listrik', score: 10 },
          { label: 'Perbaikan Mesin', score: 10 },
          { label: 'AC', score: 10 },
          { label: 'Las', score: 10 }
        ]
      }),
      makeQuestion('woodIndustry', 'Punya pengalaman maintenance di pabrik kayu / mebel / furniture?', 'dropdown', {
        options: [
          { label: 'Ya', score: 20 },
          { label: 'Tidak', score: 0 }
        ]
      }),
      makeQuestion('company', 'Pengalamannya di mana?', 'text', {
        placeholder: 'Nama perusahaan / tempat kerja',
        filledScore: 0
      }),
      makeQuestion('duration', 'Berapa lama pengalaman?', 'dropdown', {
        options: [
          { label: 'Lebih dari 1 tahun', score: 15 },
          { label: 'Kurang dari 1 tahun', score: 5 }
        ]
      }),
      makeQuestion('explanation', 'Jelaskan pekerjaan maintenance yang dikuasai', 'textarea', {
        placeholder: 'Mesin/peralatan yang ditangani dan jenis perbaikannya',
        filledScore: 5
      })
    ]
  },
  {
    id: 'op-produksi',
    name: 'OP. Produksi',
    active: true,
    primaryDistricts: [...DEFAULT_PRIMARY_DISTRICTS],
    primaryLocationScore: 20,
    otherLocationLabel: 'Area selain lokasi utama',
    otherLocationScore: 10,
    questions: [
      makeQuestion('companyType', 'Jenis perusahaan tempat bekerja?', 'dropdown', {
        options: [
          { label: 'Mebel / Kayu / Furniture', score: 35 },
          { label: 'Perusahaan lain bukan Mebel / Kayu / Furniture', score: 15 }
        ]
      }),
      makeQuestion('company', 'Pengalaman di perusahaan mana?', 'text', {
        placeholder: 'Nama perusahaan / tempat kerja',
        filledScore: 0
      }),
      makeQuestion('duration', 'Berapa lama pengalaman?', 'dropdown', {
        options: [
          { label: 'Lebih dari 6 bulan', score: 35 },
          { label: 'Kurang dari 6 bulan', score: 15 }
        ]
      }),
      makeQuestion('explanation', 'Jelaskan pengalaman pekerjaan produksi', 'textarea', {
        placeholder: 'Bagian produksi, mesin, target, atau proses yang dikerjakan',
        filledScore: 10
      })
    ]
  }
];

export function slugifyKey(value = '', fallback = 'item') {
  const slug = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || fallback;
}

export function toNumberScore(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : fallback;
}

export function normalizeQuestion(raw = {}, index = 0) {
  const label = String(raw.label || '').trim();
  const type = VALID_QUESTION_TYPES.has(raw.type) ? raw.type : 'text';
  const id = String(raw.id || '').trim() || slugifyKey(label, `pertanyaan_${index + 1}`);
  const hasOptions = type === 'dropdown' || type === 'radio' || type === 'checkbox';
  const options = hasOptions
    ? (Array.isArray(raw.options) ? raw.options : [])
        .map(opt => {
          if (typeof opt === 'string') {
            const optLabel = opt.trim();
            return optLabel ? { label: optLabel, score: 0 } : null;
          }
          const optLabel = String(opt?.label || '').trim();
          if (!optLabel) return null;
          return {
            label: optLabel,
            score: toNumberScore(opt?.score, 0)
          };
        })
        .filter(Boolean)
    : [];

  return {
    id,
    label: label || `Pertanyaan ${index + 1}`,
    type,
    required: raw.required !== false,
    placeholder: String(raw.placeholder || '').trim(),
    filledScore: hasOptions ? 0 : toNumberScore(raw.filledScore, 0),
    options,
    showWhen: normalizeShowWhen(raw.showWhen)
  };
}

export function normalizeDistrictToken(city, district) {
  const c = String(city || '').trim();
  const d = String(district || '').trim();
  if (!d) return '';
  return c ? `${c} - ${d}` : d;
}

export function normalizeVacancy(raw = {}, index = 0) {
  const name = String(raw.name || raw.position || '').trim();
  const id = String(raw.id || '').trim() || slugifyKey(name, `lowongan_${index + 1}`);
  const primaryDistricts = [...new Set(
    (Array.isArray(raw.primaryDistricts) ? raw.primaryDistricts : [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
  )];
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map((q, qIndex) => normalizeQuestion(q, qIndex))
    .filter(q => q.label);

  const seenIds = new Set();
  for (let i = 0; i < questions.length; i++) {
    let qid = questions[i].id;
    let suffix = 2;
    while (seenIds.has(qid)) {
      qid = `${questions[i].id}_${suffix++}`;
    }
    questions[i].id = qid;
    seenIds.add(qid);
  }
  for (const q of questions) {
    if (q.showWhen && (q.showWhen.questionId === q.id || !seenIds.has(q.showWhen.questionId))) {
      q.showWhen = null;
    }
  }

  const rawMinScore = raw.minScore;
  const minScore = rawMinScore === '' || rawMinScore === null || rawMinScore === undefined
    ? null
    : (Number.isFinite(Number(rawMinScore)) ? Math.max(0, Math.round(Number(rawMinScore) * 100) / 100) : null);
  const minScoreMode = ['percentage', 'points'].includes(raw.minScoreMode) ? raw.minScoreMode : 'inherit';

  return {
    id,
    name,
    active: raw.active !== false,
    minScore,
    minScoreMode,
    primaryDistricts,
    primaryLocationScore: toNumberScore(raw.primaryLocationScore, 0),
    otherLocationLabel: String(raw.otherLocationLabel || 'Area selain lokasi utama').trim() || 'Area selain lokasi utama',
    otherLocationScore: toNumberScore(raw.otherLocationScore, 0),
    questions
  };
}

export function normalizeVacancyList(list = []) {
  const result = [];
  const seenNames = new Set();
  const seenIds = new Set();
  (Array.isArray(list) ? list : []).forEach((item, index) => {
    const normalized = normalizeVacancy(item, index);
    if (!normalized.name) return;
    const nameKey = normalized.name.toLocaleLowerCase('id');
    if (seenNames.has(nameKey)) return;
    seenNames.add(nameKey);
    let id = normalized.id;
    let suffix = 2;
    while (seenIds.has(id)) {
      id = `${normalized.id}_${suffix++}`;
    }
    normalized.id = id;
    seenIds.add(id);
    result.push(normalized);
  });
  return result;
}

export function extractActivePositionNames(vacancies = []) {
  return normalizeVacancyList(vacancies)
    .filter(item => item.active !== false)
    .map(item => item.name);
}

function findMatchingDefaultVacancy(name) {
  const lower = String(name || '').trim().toLocaleLowerCase('id');
  if (!lower) return null;
  const exact = DEFAULT_VACANCIES.find(v => v.name.toLocaleLowerCase('id') === lower);
  if (exact) return exact;
  if (lower.includes('spray')) return DEFAULT_VACANCIES.find(v => v.id === 'spray');
  if (lower.includes('las')) return DEFAULT_VACANCIES.find(v => v.id === 'las');
  if (lower.includes('cnc')) return DEFAULT_VACANCIES.find(v => v.id === 'cnc');
  if (lower.includes('spindel')) return DEFAULT_VACANCIES.find(v => v.id === 'spindel-kayu');
  if (lower.includes('maintenance')) return DEFAULT_VACANCIES.find(v => v.id === 'maintenance');
  if (lower.includes('produksi') && !lower.includes('kepala')) return DEFAULT_VACANCIES.find(v => v.id === 'op-produksi');
  return null;
}

export function createStarterVacancy(name = '', index = 0) {
  const template = findMatchingDefaultVacancy(name);
  if (template) {
    return normalizeVacancy({
      ...structuredClone(template),
      id: slugifyKey(name, `lowongan_${index + 1}`),
      name: String(name).trim(),
      active: true
    }, index);
  }
  return normalizeVacancy({
    id: slugifyKey(name, `lowongan_${index + 1}`),
    name: String(name).trim(),
    active: true,
    primaryDistricts: [...DEFAULT_PRIMARY_DISTRICTS],
    primaryLocationScore: 20,
    otherLocationLabel: 'Area selain lokasi utama',
    otherLocationScore: 10,
    questions: [
      makeQuestion('company', 'Pengalamannya di mana?', 'text', {
        placeholder: 'Nama perusahaan / tempat kerja',
        filledScore: 0
      }),
      makeQuestion('duration', 'Berapa lama pengalaman?', 'dropdown', {
        options: [
          { label: 'Lebih dari 6 bulan', score: 60 },
          { label: 'Kurang dari 6 bulan', score: 20 }
        ]
      }),
      makeQuestion('explanation', 'Jelaskan pengalaman kerja yang relevan', 'textarea', {
        placeholder: 'Uraikan tugas, alat, atau keahlian yang dikuasai',
        filledScore: 20
      })
    ]
  }, index);
}

export function mergeVacanciesWithPositions(vacancies = [], positionNames = []) {
  const base = normalizeVacancyList(vacancies);
  const existingByName = new Map(base.map(v => [v.name.toLocaleLowerCase('id'), v]));
  const names = Array.isArray(positionNames)
    ? positionNames.map(x => String(x || '').trim()).filter(Boolean)
    : [];
  if (!names.length) return base;

  const merged = [...base];
  names.forEach((name, idx) => {
    const key = name.toLocaleLowerCase('id');
    if (!existingByName.has(key)) {
      const created = createStarterVacancy(name, merged.length + idx);
      merged.push(created);
      existingByName.set(key, created);
    }
  });
  return merged;
}

function normalizeDistrictCompare(value = '') {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('id')
    .replace(/\s+/g, ' ');
}

export function isPrimaryDistrictMatch(primaryDistricts = [], city = '', district = '') {
  const cleanDistrict = normalizeDistrictCompare(district);
  if (!cleanDistrict) return false;
  const combined = normalizeDistrictCompare(normalizeDistrictToken(city, district));

  return (Array.isArray(primaryDistricts) ? primaryDistricts : []).some(entry => {
    const normEntry = normalizeDistrictCompare(entry);
    if (!normEntry) return false;
    if (normEntry === combined || normEntry === cleanDistrict) return true;
    const parts = normEntry.split(/\s*-\s*/);
    if (parts.length === 2) {
      const [entryCity, entryDistrict] = parts;
      if (city && normalizeDistrictCompare(city) === entryCity && entryDistrict === cleanDistrict) {
        return true;
      }
      if (!city && entryDistrict === cleanDistrict) return true;
    }
    return false;
  });
}

function matchesShowWhenRule(rule, rawAnswer) {
  if (!rule) return true;
  const target = String(rule.value ?? '').trim().toLocaleLowerCase('id');
  if (!target) return true;
  const op = VALID_SHOW_OPERATORS.has(rule.operator) ? rule.operator : 'equals';

  if (Array.isArray(rawAnswer)) {
    const cleanArr = rawAnswer.map(x => String(x ?? '').trim().toLocaleLowerCase('id')).filter(Boolean);
    if (!cleanArr.length) return false;
    if (op === 'not_equals') return !cleanArr.some(v => v === target);
    if (op === 'includes') return cleanArr.some(v => v.includes(target));
    return cleanArr.some(v => v === target);
  }

  const strVal = String(rawAnswer ?? '').trim().toLocaleLowerCase('id');
  if (!strVal) return false;
  if (op === 'not_equals') return strVal !== target;
  if (op === 'includes') return strVal.includes(target);
  return strVal === target;
}

export function isQuestionVisible(question, answers = {}, allQuestions = [], visited = new Set()) {
  if (!question) return false;
  const rule = question.showWhen;
  if (!rule || !rule.questionId) return true;
  if (visited.has(question.id)) return false;

  const nextVisited = new Set(visited);
  nextVisited.add(question.id);

  if (Array.isArray(allQuestions) && allQuestions.length) {
    const parent = allQuestions.find(q => q.id === rule.questionId);
    if (!parent) return false;
    if (!isQuestionVisible(parent, answers, allQuestions, nextVisited)) return false;
  }

  return matchesShowWhenRule(rule, answers?.[rule.questionId]);
}

export function questionMaxPossibleScore(q) {
  if (!q) return 0;
  if (q.type === 'dropdown' || q.type === 'radio') {
    return q.options?.length ? Math.max(...q.options.map(opt => Number(opt.score) || 0), 0) : 0;
  }
  if (q.type === 'checkbox') {
    let sum = 0;
    for (const opt of q.options || []) {
      if (Number(opt.score) > 0) sum += Number(opt.score);
    }
    return sum;
  }
  return Math.max(0, Number(q.filledScore) || 0);
}

function calculateQuestionTreeMaxScore(questions = []) {
  if (!Array.isArray(questions) || !questions.length) return 0;
  const byId = new Map(questions.map(q => [q.id, q]));
  const childrenByParent = new Map();
  const roots = [];

  for (const q of questions) {
    const pid = q.showWhen?.questionId;
    if (pid && byId.has(pid) && pid !== q.id) {
      if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
      childrenByParent.get(pid).push(q);
    } else {
      roots.push(q);
    }
  }

  const evalSubtree = (node, visited = new Set()) => {
    if (!node || visited.has(node.id)) return 0;
    const nextVisited = new Set(visited);
    nextVisited.add(node.id);

    const children = childrenByParent.get(node.id) || [];
    if (!children.length) return questionMaxPossibleScore(node);

    const isSingleChoice = node.type === 'dropdown' || node.type === 'radio';
    const hasMutuallyExclusiveEquals = isSingleChoice && children.some(c => c.showWhen?.operator === 'equals');

    if (hasMutuallyExclusiveEquals) {
      const candidateBranches = [];
      const optMap = new Map();
      for (const opt of node.options || []) {
        optMap.set(String(opt.label || '').trim(), Number(opt.score) || 0);
      }
      for (const c of children) {
        const val = String(c.showWhen?.value || '').trim();
        if (c.showWhen?.operator === 'equals' && val && !optMap.has(val)) {
          optMap.set(val, 0);
        }
      }
      if (!optMap.size) optMap.set('', 0);

      for (const [ansVal, baseScore] of optMap.entries()) {
        let totalBranch = Math.max(0, baseScore);
        for (const child of children) {
          if (matchesShowWhenRule(child.showWhen, ansVal)) {
            totalBranch += evalSubtree(child, nextVisited);
          }
        }
        candidateBranches.push(totalBranch);
      }
      return Math.max(0, ...candidateBranches);
    }

    let total = questionMaxPossibleScore(node);
    for (const child of children) {
      total += evalSubtree(child, nextVisited);
    }
    return total;
  };

  let sum = 0;
  for (const r of roots) {
    sum += evalSubtree(r, new Set());
  }
  return Math.round(sum * 100) / 100;
}

export function calculateVacancyMaxScore(vacancy) {
  const v = normalizeVacancy(vacancy || {});
  const maxLocationScore = Math.max(v.primaryLocationScore, v.otherLocationScore, 0);
  const maxQuestionScore = calculateQuestionTreeMaxScore(v.questions);
  return Math.round((maxLocationScore + maxQuestionScore) * 100) / 100;
}

export function calculateCandidateScore(vacancy, city = '', district = '', answers = {}, globalScoringConfig = null) {
  const v = normalizeVacancy(vacancy || {});
  const cfg = normalizeRecruitmentScoringConfig(globalScoringConfig || {});
  const isPrimary = isPrimaryDistrictMatch(v.primaryDistricts, city, district);
  const locationType = isPrimary ? 'Lokasi Utama' : 'Lokasi Lain';
  const locationScore = isPrimary ? v.primaryLocationScore : v.otherLocationScore;
  const maxLocationScore = Math.max(v.primaryLocationScore, v.otherLocationScore, 0);

  let questionScore = 0;
  const maxQuestionScore = calculateQuestionTreeMaxScore(v.questions);
  const questionBreakdown = [];

  for (const q of v.questions) {
    const visible = isQuestionVisible(q, answers, v.questions);
    if (!visible) continue;

    const rawVal = answers?.[q.id];
    let earned = 0;

    if (q.type === 'dropdown' || q.type === 'radio') {
      const selectedText = String(rawVal ?? '').trim();
      const matched = q.options.find(opt => opt.label === selectedText);
      earned = matched ? matched.score : 0;
    } else if (q.type === 'checkbox') {
      const selectedList = Array.isArray(rawVal)
        ? rawVal.map(x => String(x || '').trim())
        : (typeof rawVal === 'string' && rawVal.trim() ? [rawVal.trim()] : []);
      for (const opt of q.options) {
        if (selectedList.includes(opt.label)) earned += opt.score;
      }
    } else {
      const hasValue = String(rawVal ?? '').trim() !== '';
      earned = hasValue ? q.filledScore : 0;
    }

    questionScore += earned;
    questionBreakdown.push({
      id: q.id,
      label: q.label,
      type: q.type,
      answer: rawVal ?? '',
      score: earned
    });
  }

  const totalScore = Math.round((locationScore + questionScore) * 100) / 100;
  const maxScore = Math.round((maxLocationScore + maxQuestionScore) * 100) / 100;
  const percentageScore = maxScore > 0
    ? Math.max(0, Math.round((totalScore / maxScore) * 10000) / 100)
    : 0;
  const activeMode = v.minScoreMode !== 'inherit' ? v.minScoreMode : cfg.scoringMode;
  const threshold = v.minScore !== null && v.minScore !== undefined ? v.minScore : cfg.defaultMinScore;
  const effectiveScore = activeMode === 'points' ? totalScore : percentageScore;
  const recommended = activeMode === 'points'
    ? effectiveScore >= threshold
    : (maxScore > 0 && percentageScore >= threshold);
  const recommendation = recommended ? 'Direkomendasikan' : 'Belum Ditentukan';

  return {
    locationType,
    locationScore,
    questionScore: Math.round(questionScore * 100) / 100,
    totalScore,
    maxScore,
    percentageScore,
    threshold,
    scoringMode: activeMode,
    recommended,
    recommendation,
    questionBreakdown
  };
}

export function buildShareUrl(baseHref, positionName = '', sourceName = '') {
  const url = new URL(baseHref);
  url.search = '';
  if (String(positionName || '').trim()) {
    url.searchParams.set('posisi', String(positionName).trim());
  }
  if (String(sourceName || '').trim()) {
    url.searchParams.set('sumber', String(sourceName).trim());
  }
  return url.toString();
}

function formatWaAnswerValue(val) {
  if (Array.isArray(val)) return val.map(x => String(x ?? '').trim()).filter(Boolean).join(', ');
  return String(val ?? '').trim();
}

export function buildStage1WhatsAppMessage(payload = {}, vacancy = null, applySchema = null, referenceId = '') {
  const name = String(payload.name || payload.full_name || '').trim() || '-';
  const position = String(payload.position || '').trim() || '-';
  const city = String(payload.city || '').trim() || '-';
  const district = String(payload.district || '').trim() || '-';
  const ref = String(referenceId || payload.referenceId || payload.id || '').trim() || '-';
  const exp = (payload.experience && typeof payload.experience === 'object') ? payload.experience : {};
  const custom = (payload.customFields && typeof payload.customFields === 'object') ? payload.customFields : {};
  const normalizedVacancy = vacancy ? normalizeVacancy(vacancy) : null;

  const experienceLines = [];
  const coveredKeys = new Set();

  if (normalizedVacancy && Array.isArray(normalizedVacancy.questions)) {
    for (const q of normalizedVacancy.questions) {
      coveredKeys.add(q.id);
      if (!isQuestionVisible(q, exp, normalizedVacancy.questions)) continue;
      const ans = formatWaAnswerValue(exp[q.id]);
      if (ans) {
        const cleanLabel = String(q.label || q.id).trim().replace(/:$/, '');
        experienceLines.push(`* ${cleanLabel}: ${ans}`);
      }
    }
  }

  for (const [key, val] of Object.entries(exp)) {
    if (coveredKeys.has(key)) continue;
    const ans = formatWaAnswerValue(val);
    if (ans) {
      experienceLines.push(`* ${key}: ${ans}`);
    }
  }

  if (applySchema && Array.isArray(applySchema.fields)) {
    for (const field of applySchema.fields) {
      if (field.system) continue;
      const ans = formatWaAnswerValue(custom[field.id]);
      if (ans) {
        const cleanLabel = String(field.label || field.id).trim().replace(/:$/, '');
        experienceLines.push(`* ${cleanLabel}: ${ans}`);
      }
    }
  } else {
    for (const [key, val] of Object.entries(custom)) {
      const ans = formatWaAnswerValue(val);
      if (ans) experienceLines.push(`* ${key}: ${ans}`);
    }
  }

  const lines = [
    'Yth. HRD',
    'PT. MITRA BINAMANDIRI MAKMUR',
    '',
    `Nama kandidat: ${name}`,
    `Posisi dilamar: ${position}`,
    `Kabupaten/Kota: ${city}`,
    `Kecamatan: ${district}`
  ];

  if (experienceLines.length) {
    lines.push('', 'PENGALAMAN KERJA', ...experienceLines);
  }

  lines.push('', `Referensi: ${ref}`, '', 'Terimakasih');
  return lines.join('\n');
}

export function buildStage1WhatsAppUrl(payload = {}, vacancy = null, applySchema = null, referenceId = '', waNumber = HR_WHATSAPP_NUMBER) {
  const cleanNumber = String(waNumber || HR_WHATSAPP_NUMBER).replace(/\D/g, '') || HR_WHATSAPP_NUMBER;
  const text = buildStage1WhatsAppMessage(payload, vacancy, applySchema, referenceId);
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(text)}`;
}

// ============================================================================
// Recruitment (/apply) Import / Export & Kota - Kecamatan Reference Catalog
// ============================================================================
export const RECRUIT_VACANCY_IMPORT_HEADERS = [
  'Position',
  'Active',
  'Primary_Districts',
  'Primary_Loc_Score',
  'Other_Loc_Label',
  'Other_Loc_Score',
  'Min_Score',
  'Min_Mode'
];

export const RECRUIT_QUESTION_IMPORT_HEADERS = [
  'Position',
  'Order',
  'Question_ID',
  'Question_Text',
  'Type',
  'Required',
  'Placeholder',
  'Filled_Score',
  'Options_Score',
  'Show_If_Question_ID',
  'Show_If_Operator',
  'Show_If_Value'
];

export const RECRUIT_CITY_REF_HEADERS = [
  'No',
  'Kota_Kabupaten',
  'Kecamatan',
  'Token_Primary_Districts'
];

export function buildDistrictReferenceRows(districtsByCity = DISTRICTS_BY_CITY) {
  const rows = [];
  let no = 1;
  for (const [city, districts] of Object.entries(districtsByCity || {})) {
    for (const district of (districts || [])) {
      rows.push({
        No: no++,
        Kota_Kabupaten: city,
        Kecamatan: district,
        Token_Primary_Districts: normalizeDistrictToken(city, district)
      });
    }
  }
  return rows;
}

export function formatOptionsScoreString(options = []) {
  return (Array.isArray(options) ? options : [])
    .filter(opt => String(opt?.label || '').trim())
    .map(opt => `${String(opt.label).trim()}:${toNumberScore(opt.score, 0)}`)
    .join(' | ');
}

export function parseOptionsScoreString(raw = '') {
  if (Array.isArray(raw)) {
    return raw.map(opt => {
      if (typeof opt === 'string') return parseOptionsScoreString(opt)[0] || null;
      const label = String(opt?.label || '').trim();
      return label ? { label, score: toNumberScore(opt?.score, 0) } : null;
    }).filter(Boolean);
  }
  const text = String(raw ?? '').trim();
  if (!text) return [];
  const parts = text.split(/\s*(?:\||;|\r?\n)\s*/).map(s => s.trim()).filter(Boolean);
  return parts.map(part => {
    const colonIdx = part.lastIndexOf(':');
    if (colonIdx > 0) {
      const candidateScore = part.slice(colonIdx + 1).trim();
      if (/^-?\d+(?:[.,]\d+)?$/.test(candidateScore)) {
        const label = part.slice(0, colonIdx).trim();
        const score = toNumberScore(candidateScore.replace(',', '.'), 0);
        return label ? { label, score } : null;
      }
    }
    return { label: part, score: 0 };
  }).filter(Boolean);
}

export function buildRecruitmentExportSheets(vacancies = DEFAULT_VACANCIES, districtsByCity = DISTRICTS_BY_CITY) {
  const list = normalizeVacancyList(vacancies);
  const vacancyRows = list.map(v => ({
    Position: v.name,
    Active: v.active !== false ? 'YES' : 'NO',
    Primary_Districts: (v.primaryDistricts || []).join(', '),
    Primary_Loc_Score: v.primaryLocationScore,
    Other_Loc_Label: v.otherLocationLabel,
    Other_Loc_Score: v.otherLocationScore,
    Min_Score: v.minScore ?? '',
    Min_Mode: v.minScoreMode || 'inherit'
  }));

  const questionRows = [];
  for (const v of list) {
    (v.questions || []).forEach((q, idx) => {
      const hasOptions = ['dropdown', 'radio', 'checkbox'].includes(q.type);
      questionRows.push({
        Position: v.name,
        Order: idx + 1,
        Question_ID: q.id,
        Question_Text: q.label,
        Type: q.type,
        Required: q.required !== false ? 'YES' : 'NO',
        Placeholder: q.placeholder || '',
        Filled_Score: hasOptions ? 0 : toNumberScore(q.filledScore, 0),
        Options_Score: hasOptions ? formatOptionsScoreString(q.options) : '',
        Show_If_Question_ID: q.showWhen?.questionId || '',
        Show_If_Operator: q.showWhen?.operator || '',
        Show_If_Value: q.showWhen?.value || ''
      });
    });
  }

  return {
    vacancyRows,
    questionRows,
    districtRefRows: buildDistrictReferenceRows(districtsByCity)
  };
}

function readRowCell(row, aliases = []) {
  if (!row || typeof row !== 'object') return '';
  const keys = Object.keys(row);
  for (const alias of aliases) {
    if (alias in row && row[alias] !== undefined && row[alias] !== null) return row[alias];
  }
  const normAliases = aliases.map(a => a.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const k of keys) {
    const nk = String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normAliases.includes(nk) && row[k] !== undefined && row[k] !== null) return row[k];
  }
  return '';
}

function parseBoolCell(raw, fallback = true) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return fallback;
  if (['NO', 'TIDAK', 'FALSE', '0', 'NONAKTIF', 'INACTIVE', 'N'].includes(s)) return false;
  if (['YES', 'YA', 'TRUE', '1', 'AKTIF', 'ACTIVE', 'Y'].includes(s)) return true;
  return fallback;
}

export function parseRecruitmentImportRows(vacancyRawRows = [], questionRawRows = [], existingVacancies = []) {
  const errors = [];
  const warnings = [];
  const existingList = normalizeVacancyList(existingVacancies || []);
  const existingByName = new Map(existingList.map(v => [v.name.toLocaleLowerCase('id'), v]));

  const qGrouped = new Map();
  const qRowsArr = Array.isArray(questionRawRows) ? questionRawRows : [];
  qRowsArr.forEach((rawRow, idx) => {
    const posName = String(readRowCell(rawRow, ['Position', 'Posisi', 'Lowongan'])).trim();
    const qText = String(readRowCell(rawRow, ['Question_Text', 'Question', 'Pertanyaan', 'Label'])).trim();
    if (!posName && !qText) return;
    if (!posName || !qText) {
      errors.push(`Questions baris ${idx + 2}: Position dan Question_Text wajib diisi.`);
      return;
    }
    const key = posName.toLocaleLowerCase('id');
    if (!qGrouped.has(key)) qGrouped.set(key, []);
    const orderNum = Number(readRowCell(rawRow, ['Order', 'Urutan', 'No']));
    const rawType = String(readRowCell(rawRow, ['Type', 'Tipe'])).trim().toLowerCase() || 'text';
    const type = VALID_QUESTION_TYPES.has(rawType) ? rawType : 'text';
    if (!VALID_QUESTION_TYPES.has(rawType) && rawType !== '') {
      warnings.push(`Pertanyaan "${qText}" (${posName}): tipe "${rawType}" diubah ke "text".`);
    }
    const qId = String(readRowCell(rawRow, ['Question_ID', 'ID'])).trim() || slugifyKey(qText, `q_${idx + 1}`);
    const optionsRaw = readRowCell(rawRow, ['Options_Score', 'Options', 'Opsi_Skor']);
    const hasOptions = ['dropdown', 'radio', 'checkbox'].includes(type);
    const options = hasOptions ? parseOptionsScoreString(optionsRaw) : [];
    if (hasOptions && !options.length) {
      warnings.push(`Pertanyaan "${qText}" (${posName}) bertipe ${type} namun Options_Score kosong.`);
    }
    const showParent = String(readRowCell(rawRow, ['Show_If_Question_ID', 'Parent_ID', 'Tampil_Jika_ID'])).trim();
    const showOpRaw = String(readRowCell(rawRow, ['Show_If_Operator', 'Operator'])).trim().toLowerCase() || 'equals';
    const showVal = String(readRowCell(rawRow, ['Show_If_Value', 'Show_If_Answer', 'Jawaban_Pemicu'])).trim();

    qGrouped.get(key).push({
      _order: Number.isFinite(orderNum) ? orderNum : idx + 1,
      id: qId,
      label: qText,
      type,
      required: parseBoolCell(readRowCell(rawRow, ['Required', 'Wajib']), true),
      placeholder: String(readRowCell(rawRow, ['Placeholder'])).trim(),
      filledScore: hasOptions ? 0 : toNumberScore(readRowCell(rawRow, ['Filled_Score', 'Skor_Isi']), 0),
      options,
      showWhen: showParent && showVal
        ? { questionId: showParent, operator: VALID_SHOW_OPERATORS.has(showOpRaw) ? showOpRaw : 'equals', value: showVal }
        : null
    });
  });

  const resultMap = new Map();
  const vRowsArr = Array.isArray(vacancyRawRows) ? vacancyRawRows : [];
  vRowsArr.forEach((rawRow, idx) => {
    const posName = String(readRowCell(rawRow, ['Position', 'Posisi', 'Lowongan', 'Name'])).trim();
    if (!posName) return;
    const key = posName.toLocaleLowerCase('id');
    const prev = existingByName.get(key);
    const rawDistricts = String(readRowCell(rawRow, ['Primary_Districts', 'Lokasi_Utama', 'Districts'])).trim();
    const primaryDistricts = rawDistricts
      ? rawDistricts.split(/\s*(?:,|;|\||\r?\n)\s*/).map(s => s.trim()).filter(Boolean)
      : (prev?.primaryDistricts ? [...prev.primaryDistricts] : [...DEFAULT_PRIMARY_DISTRICTS]);

    const rawMinScore = readRowCell(rawRow, ['Min_Score', 'Skor_Minimal']);
    const minScore = String(rawMinScore ?? '').trim() === '' ? null : toNumberScore(rawMinScore, null);
    const rawMinMode = String(readRowCell(rawRow, ['Min_Mode', 'Mode_Minimal'])).trim().toLowerCase();
    const minScoreMode = ['percentage', 'points', 'inherit'].includes(rawMinMode) ? rawMinMode : 'inherit';

    const questionsFromSheet = qGrouped.get(key);
    const orderedQuestions = questionsFromSheet
      ? [...questionsFromSheet].sort((a, b) => a._order - b._order)
      : (prev?.questions ? structuredClone(prev.questions) : []);

    resultMap.set(key, normalizeVacancy({
      id: prev?.id || slugifyKey(posName, `lowongan_${idx + 1}`),
      name: posName,
      active: parseBoolCell(readRowCell(rawRow, ['Active', 'Aktif', 'Status']), true),
      primaryDistricts,
      primaryLocationScore: toNumberScore(readRowCell(rawRow, ['Primary_Loc_Score', 'Skor_Lokasi_Utama']), prev?.primaryLocationScore ?? 20),
      otherLocationLabel: String(readRowCell(rawRow, ['Other_Loc_Label', 'Label_Lokasi_Lain'])).trim() || prev?.otherLocationLabel || 'Area selain lokasi utama',
      otherLocationScore: toNumberScore(readRowCell(rawRow, ['Other_Loc_Score', 'Skor_Lokasi_Lain']), prev?.otherLocationScore ?? 10),
      minScore,
      minScoreMode,
      questions: orderedQuestions
    }, idx));
  });

  // Allow questions-only import when no Vacancies sheet rows were passed
  if (!resultMap.size && qGrouped.size) {
    for (const [key, qList] of qGrouped.entries()) {
      const prev = existingByName.get(key);
      const posName = prev?.name || qList[0]?.Position || key;
      const ordered = [...qList].sort((a, b) => a._order - b._order);
      resultMap.set(key, normalizeVacancy({
        ...(prev ? structuredClone(prev) : createStarterVacancy(posName)),
        questions: ordered
      }));
    }
  }

  const vacancies = normalizeVacancyList([...resultMap.values()]);
  return { vacancies, errors, warnings };
}
