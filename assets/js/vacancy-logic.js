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

function makeQuestion(id, label, type, extra = {}) {
  return {
    id,
    label,
    type,
    required: extra.required !== false,
    placeholder: extra.placeholder || '',
    filledScore: Number.isFinite(Number(extra.filledScore)) ? Number(extra.filledScore) : 0,
    options: Array.isArray(extra.options) ? extra.options : []
  };
}

export const RECOMMENDATION_THRESHOLD = 60;

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
    options
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

  return {
    id,
    name,
    active: raw.active !== false,
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

export function calculateVacancyMaxScore(vacancy) {
  const v = normalizeVacancy(vacancy || {});
  const maxLocationScore = Math.max(v.primaryLocationScore, v.otherLocationScore, 0);
  let maxQuestionScore = 0;

  for (const q of v.questions) {
    if (q.type === 'dropdown' || q.type === 'radio') {
      maxQuestionScore += q.options.length ? Math.max(...q.options.map(opt => opt.score), 0) : 0;
    } else if (q.type === 'checkbox') {
      for (const opt of q.options) {
        if (opt.score > 0) maxQuestionScore += opt.score;
      }
    } else {
      maxQuestionScore += Math.max(0, q.filledScore);
    }
  }

  return Math.round((maxLocationScore + maxQuestionScore) * 100) / 100;
}

export function calculateCandidateScore(vacancy, city = '', district = '', answers = {}) {
  const v = normalizeVacancy(vacancy || {});
  const isPrimary = isPrimaryDistrictMatch(v.primaryDistricts, city, district);
  const locationType = isPrimary ? 'Lokasi Utama' : 'Lokasi Lain';
  const locationScore = isPrimary ? v.primaryLocationScore : v.otherLocationScore;
  const maxLocationScore = Math.max(v.primaryLocationScore, v.otherLocationScore, 0);

  let questionScore = 0;
  let maxQuestionScore = 0;
  const questionBreakdown = [];

  for (const q of v.questions) {
    const rawVal = answers?.[q.id];
    let earned = 0;
    let maxForQ = 0;

    if (q.type === 'dropdown' || q.type === 'radio') {
      const selectedText = String(rawVal ?? '').trim();
      const matched = q.options.find(opt => opt.label === selectedText);
      earned = matched ? matched.score : 0;
      maxForQ = q.options.length ? Math.max(...q.options.map(opt => opt.score), 0) : 0;
    } else if (q.type === 'checkbox') {
      const selectedList = Array.isArray(rawVal)
        ? rawVal.map(x => String(x || '').trim())
        : (typeof rawVal === 'string' && rawVal.trim() ? [rawVal.trim()] : []);
      for (const opt of q.options) {
        if (opt.score > 0) maxForQ += opt.score;
        if (selectedList.includes(opt.label)) earned += opt.score;
      }
    } else {
      const hasValue = String(rawVal ?? '').trim() !== '';
      earned = hasValue ? q.filledScore : 0;
      maxForQ = Math.max(0, q.filledScore);
    }

    questionScore += earned;
    maxQuestionScore += maxForQ;
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
  const threshold = RECOMMENDATION_THRESHOLD;
  const recommended = maxScore > 0 && percentageScore >= threshold;
  const recommendation = recommended ? 'Direkomendasikan' : 'Belum Ditentukan';

  return {
    locationType,
    locationScore,
    questionScore: Math.round(questionScore * 100) / 100,
    totalScore,
    maxScore,
    percentageScore,
    threshold,
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
