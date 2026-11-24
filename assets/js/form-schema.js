import { APPLY_INFO_SOURCES, FORM_INFO_SOURCES, slugifyKey } from './vacancy-logic.js?v=20261123-hrga-workspace-18';

export const DEFAULT_FORM_POSITIONS = [
  'Spray',
  'Las',
  'CNC',
  'Spindel Kayu',
  'Maintenance',
  'OP. Produksi',
  'Kepala Bagian Produksi',
  'PPIC',
  'Sales Project Lead',
  'QC Inspektur',
  'QC Head',
  'Staff Safety Health & Environment'
];

export const APPLY_CUSTOM_FIELD_TYPES = [
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'number', label: 'Number' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'radio', label: 'Single Choice' },
  { value: 'checkbox', label: 'Multiple Choice' }
];

export const FORM_CUSTOM_FIELD_TYPES = [
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency (IDR)' },
  { value: 'date', label: 'Date' },
  { value: 'tel', label: 'Phone / WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'select', label: 'Dropdown' },
  { value: 'radio', label: 'Single Choice' },
  { value: 'checkbox', label: 'Multiple Choice' }
];

export const DEFAULT_APPLY_SCHEMA = {
  fields: [
    {
      id: 'position',
      label: 'Posisi yang dilamar',
      type: 'system_position',
      required: true,
      enabled: true,
      system: true,
      placeholder: 'Pilih posisi',
      options: []
    },
    {
      id: 'infoSource',
      label: 'Sumber Informasi',
      type: 'system_source',
      required: true,
      enabled: true,
      system: true,
      placeholder: 'Pilih sumber informasi',
      options: [...APPLY_INFO_SOURCES]
    },
    {
      id: 'name',
      label: 'Nama lengkap',
      type: 'text',
      required: true,
      enabled: true,
      system: true,
      placeholder: 'Nama sesuai identitas',
      options: []
    },
    {
      id: 'location',
      label: 'Kabupaten / Kota & Kecamatan',
      type: 'system_location',
      required: true,
      enabled: true,
      system: true,
      placeholder: 'Pilih wilayah',
      options: []
    },
    {
      id: 'whatsapp',
      label: 'Nomor WhatsApp aktif',
      type: 'tel',
      required: true,
      enabled: true,
      system: true,
      placeholder: 'Contoh: 081234567890',
      options: []
    }
  ]
};

export const MANDATORY_APPLY_IDS = new Set(['position', 'name']);

export function normalizeApplyField(raw = {}, index = 0) {
  const id = String(raw.id || '').trim() || slugifyKey(raw.label, `field_${index + 1}`);
  const isSystem = raw.system === true || DEFAULT_APPLY_SCHEMA.fields.some(f => f.id === id);
  const baseDef = DEFAULT_APPLY_SCHEMA.fields.find(f => f.id === id);
  const type = isSystem && baseDef
    ? baseDef.type
    : (APPLY_CUSTOM_FIELD_TYPES.some(t => t.value === raw.type) ? raw.type : 'text');

  const needsOptions = type === 'system_source' || type === 'dropdown' || type === 'radio' || type === 'checkbox';
  let options = [];
  if (needsOptions) {
    const srcOpts = Array.isArray(raw.options) ? raw.options : (baseDef?.options || []);
    options = [...new Set(srcOpts.map(item => String(item ?? '').trim()).filter(Boolean))];
    if (type === 'system_source' && !options.length) {
      options = [...APPLY_INFO_SOURCES];
    }
  }

  const mandatory = MANDATORY_APPLY_IDS.has(id);
  const enabled = mandatory ? true : raw.enabled !== false;
  const required = mandatory ? true : (enabled ? raw.required === true || (raw.required === undefined && isSystem) : false);

  return {
    id,
    label: String(raw.label || baseDef?.label || `Field ${index + 1}`).trim(),
    type,
    required,
    enabled,
    system: isSystem,
    placeholder: String(raw.placeholder ?? baseDef?.placeholder ?? '').trim(),
    options
  };
}

export function normalizeApplySchema(raw = {}) {
  const incoming = Array.isArray(raw?.fields) ? raw.fields : DEFAULT_APPLY_SCHEMA.fields;
  const seen = new Set();
  const normalized = [];

  for (let i = 0; i < incoming.length; i++) {
    const field = normalizeApplyField(incoming[i], i);
    let finalId = field.id;
    if (seen.has(finalId)) {
      if (field.system) continue;
      let suffix = 2;
      while (seen.has(`${field.id}_${suffix}`)) suffix++;
      finalId = `${field.id}_${suffix}`;
      field.id = finalId;
    }
    seen.add(finalId);
    normalized.push(field);
  }

  for (const sysField of DEFAULT_APPLY_SCHEMA.fields) {
    if (!seen.has(sysField.id)) {
      normalized.push(structuredClone(sysField));
      seen.add(sysField.id);
    }
  }

  return { fields: normalized };
}

export const STEP_SECTION_DEFAULTS = {
  0: ['personal', 'address', 'application'],
  1: ['family', 'education'],
  2: ['languages', 'hobby', 'work'],
  3: ['expectation', 'references', 'openQuestions']
};

export const STEP0_SECTION_IDS = [...STEP_SECTION_DEFAULTS[0]];
export const STEP0_SECTION_LABELS = {
  personal: 'A · Personal Identity',
  address: '⌖ · KTP Address',
  application: 'P · Application Info'
};

export const STAGE2_SECTION_META = [
  { id: 'personal', step: 0, code: 'A', defaultTitle: 'DATA PRIBADI', stepLabel: 'Step 1 · Identity' },
  { id: 'address', step: 0, code: '⌖', defaultTitle: 'ALAMAT SESUAI KTP', stepLabel: 'Step 1 · Identity' },
  { id: 'application', step: 0, code: 'P', defaultTitle: 'INFORMASI LAMARAN', stepLabel: 'Step 1 · Identity' },
  { id: 'family', step: 1, code: 'B', defaultTitle: 'SUSUNAN KELUARGA', stepLabel: 'Step 2 · Family & Education' },
  { id: 'education', step: 1, code: 'C', defaultTitle: 'PENDIDIKAN FORMAL', stepLabel: 'Step 2 · Family & Education' },
  { id: 'languages', step: 2, code: 'D', defaultTitle: 'KEMAMPUAN BAHASA (SELAIN BAHASA INDONESIA)', stepLabel: 'Step 3 · Skills & Experience' },
  { id: 'hobby', step: 2, code: 'E', defaultTitle: 'HOBI', stepLabel: 'Step 3 · Skills & Experience' },
  { id: 'work', step: 2, code: 'F', defaultTitle: 'PENGALAMAN KERJA', stepLabel: 'Step 3 · Skills & Experience' },
  { id: 'expectation', step: 3, code: 'G', defaultTitle: 'EKSPEKTASI', stepLabel: 'Step 4 · Additional Info' },
  { id: 'references', step: 3, code: 'H', defaultTitle: 'ORANG YANG BISA DIHUBUNGI DALAM KEADAAN DARURAT', stepLabel: 'Step 4 · Additional Info' },
  { id: 'openQuestions', step: 3, code: 'I', defaultTitle: 'PERTANYAAN TERBUKA', stepLabel: 'Step 4 · Additional Info' }
];

export const MANDATORY_STAGE2_SECTIONS = new Set(['personal', 'application']);
export const MANDATORY_STAGE2_FIELDS = new Set(['nama', 'nik', 'posisi']);

const EDUCATION_LEVEL_OPTIONS = [
  'Tidak sekolah',
  'SD / Sederajat',
  'SMP / Sederajat',
  'SMA / SMK',
  'D1',
  'D2',
  'D3',
  'D4',
  'S1',
  'S2',
  'S3'
];

export const DEFAULT_STAGE2_SCHEMA = {
  positions: [...DEFAULT_FORM_POSITIONS],
  infoSources: [...FORM_INFO_SOURCES],
  consentText: 'Dengan ini saya menyatakan semua data yang saya isi benar.',
  step0SectionOrder: [...STEP_SECTION_DEFAULTS[0]],
  stepSectionOrder: {
    0: [...STEP_SECTION_DEFAULTS[0]],
    1: [...STEP_SECTION_DEFAULTS[1]],
    2: [...STEP_SECTION_DEFAULTS[2]],
    3: [...STEP_SECTION_DEFAULTS[3]]
  },
  sections: {
    personal: {
      title: 'DATA PRIBADI',
      enabled: true,
      fields: [
        { name: 'nama', label: 'Nama lengkap', type: 'text', required: true, enabled: true, system: true },
        { name: 'nik', label: 'NIK', type: 'text', required: true, enabled: true, system: true, inputmode: 'numeric', maxlength: 16, pattern: '[0-9]{16}' },
        { name: 'tempat_lahir', label: 'Tempat lahir', type: 'text', required: true, enabled: true, system: true },
        { name: 'tanggal_lahir', label: 'Tanggal lahir', type: 'date', required: true, enabled: true, system: true },
        { name: 'gender', label: 'Jenis kelamin', type: 'select', options: ['Laki-laki', 'Perempuan'], required: true, enabled: true, system: true },
        { name: 'gol_darah', label: 'Golongan darah', type: 'select', options: ['A', 'B', 'AB', 'O', 'Tidak tahu'], required: false, enabled: true, system: true },
        { name: 'agama', label: 'Agama', type: 'select', options: ['Islam', 'Kristen Protestan', 'Katolik', 'Hindu', 'Buddha', 'Konghucu', 'Kepercayaan', 'Lainnya'], required: false, enabled: true, system: true },
        { name: 'warga_negara', label: 'Kewarganegaraan', type: 'select', options: ['WNI', 'WNA'], defaultValue: 'WNI', required: false, enabled: true, system: true }
      ]
    },
    address: {
      title: 'ALAMAT SESUAI KTP',
      enabled: true,
      fields: [
        { name: 'alamat_provinsi', label: 'Provinsi', type: 'system_region_province', required: true, enabled: true, system: true },
        { name: 'alamat_kota_nama', label: 'Kabupaten / kota', type: 'system_region_regency', required: true, enabled: true, system: true },
        { name: 'alamat_kecamatan', label: 'Kecamatan', type: 'system_region_district', required: true, enabled: true, system: true },
        { name: 'alamat_desa', label: 'Desa / kelurahan', type: 'system_region_village', required: true, enabled: true, system: true },
        { name: 'alamat_tipe', label: 'Jenis alamat', type: 'select', options: ['Jalan', 'Dusun', 'Kampung', 'Perumahan', 'Komplek', 'Lingkungan', 'Gang', 'Lorong', 'Blok', 'Apartemen', 'Lainnya'], required: false, enabled: true, system: true },
        { name: 'alamat_jalan', label: 'Nama jalan / dusun / perumahan', type: 'text', wide: true, required: true, enabled: true, system: true },
        { name: 'alamat_rt', label: 'RT', type: 'text', inputmode: 'numeric', maxlength: 3, required: true, enabled: true, system: true },
        { name: 'alamat_rw', label: 'RW', type: 'text', inputmode: 'numeric', maxlength: 3, required: true, enabled: true, system: true },
        { name: 'alamat_kodepos', label: 'Kode pos (otomatis dari desa / kelurahan)', type: 'text', inputmode: 'numeric', maxlength: 5, readonly: true, required: false, enabled: true, system: true },
        { name: 'domisili', label: 'Alamat domisili berbeda', type: 'system_domicile', wide: true, required: false, enabled: true, system: true }
      ]
    },
    application: {
      title: 'INFORMASI LAMARAN',
      enabled: true,
      fields: [
        { name: 'posisi', label: 'Posisi yang dilamar', type: 'system_form_position', required: true, enabled: true, system: true },
        { name: 'sumber_informasi', label: 'Sumber Informasi', type: 'system_form_source', required: true, enabled: true, system: true },
        { name: 'telepon', label: 'No. telepon / WhatsApp', type: 'tel', required: true, enabled: true, system: true },
        { name: 'email', label: 'Email', type: 'email', required: false, enabled: true, system: true },
        { name: 'tinggi', label: 'Tinggi badan (cm)', type: 'number', min: 80, max: 240, required: false, enabled: true, system: true },
        { name: 'berat', label: 'Berat badan (kg)', type: 'number', min: 20, max: 250, required: false, enabled: true, system: true }
      ]
    },
    family: {
      title: 'SUSUNAN KELUARGA',
      enabled: true,
      fields: [
        { name: 'ayah_nama', label: 'Nama ayah', type: 'text', required: false, enabled: true, system: true },
        { name: 'ayah_umur', label: 'Umur ayah (isi 0 jika meninggal dunia)', type: 'number', min: 0, max: 120, required: false, enabled: true, system: true },
        { name: 'ayah_pendidikan', label: 'Pendidikan ayah', type: 'select', options: [...EDUCATION_LEVEL_OPTIONS], required: false, enabled: true, system: true },
        { name: 'ayah_pekerjaan', label: 'Pekerjaan ayah', type: 'text', required: false, enabled: true, system: true },
        { name: 'ibu_nama', label: 'Nama ibu', type: 'text', required: false, enabled: true, system: true },
        { name: 'ibu_umur', label: 'Umur ibu (isi 0 jika meninggal dunia)', type: 'number', min: 0, max: 120, required: false, enabled: true, system: true },
        { name: 'ibu_pendidikan', label: 'Pendidikan ibu', type: 'select', options: [...EDUCATION_LEVEL_OPTIONS], required: false, enabled: true, system: true },
        { name: 'ibu_pekerjaan', label: 'Pekerjaan ibu', type: 'text', required: false, enabled: true, system: true },
        { name: 'saudara_count', label: 'Jumlah saudara kandung', type: 'system_siblings_repeater', required: false, enabled: true, wide: true, system: true },
        { name: 'status_kawin', label: 'Status Perkawinan Anda', type: 'select', options: ['Belum kawin', 'Kawin', 'Cerai hidup', 'Cerai mati'], required: true, enabled: true, wide: true, system: true },
        { name: 'pasangan_group', label: 'Suami / istri (tampil saat Kawin)', type: 'system_spouse_group', required: false, enabled: true, wide: true, system: true },
        { name: 'anak_count', label: 'Jumlah anak (tampil saat bukan Belum kawin)', type: 'system_children_repeater', required: false, enabled: true, wide: true, system: true }
      ]
    },
    education: {
      title: 'PENDIDIKAN FORMAL',
      enabled: true,
      fields: [
        { name: 'pendidikan_terakhir', label: 'Pendidikan Terakhir', type: 'system_education_repeater', required: true, enabled: true, wide: false, system: true }
      ]
    },
    languages: {
      title: 'KEMAMPUAN BAHASA (SELAIN BAHASA INDONESIA)',
      enabled: true,
      fields: [
        { name: 'bahasa_count', label: 'Jumlah bahasa', type: 'system_languages_repeater', required: false, enabled: true, wide: false, system: true }
      ]
    },
    hobby: {
      title: 'HOBI',
      enabled: true,
      fields: [
        { name: 'hobby', label: 'Hobi dan minat', type: 'textarea', wide: true, required: false, enabled: true, system: true }
      ]
    },
    work: {
      title: 'PENGALAMAN KERJA',
      enabled: true,
      fields: [
        { name: 'kerja_count', label: 'Jumlah pengalaman kerja', type: 'system_work_repeater', required: false, enabled: true, wide: false, system: true }
      ]
    },
    expectation: {
      title: 'EKSPEKTASI',
      enabled: true,
      fields: [
        { name: 'mulai_kerja', label: 'Tanggal mulai bisa bekerja', type: 'date', required: false, enabled: true, system: true },
        { name: 'gaji_harapan', label: 'Gaji yang diharapkan (Rp)', type: 'currency', required: false, enabled: true, system: true },
        { name: 'fasilitas_harapan', label: 'Fasilitas lain yang diharapkan', type: 'text', wide: true, required: false, enabled: true, system: true }
      ]
    },
    references: {
      title: 'ORANG YANG BISA DIHUBUNGI DALAM KEADAAN DARURAT',
      enabled: true,
      fields: [
        { name: 'referensi1_nama', label: 'Nama kontak darurat', type: 'text', required: false, enabled: true, system: true },
        { name: 'referensi1_alamat', label: 'Alamat', type: 'textarea', wide: true, required: false, enabled: true, system: true },
        { name: 'referensi1_telepon', label: 'Telepon', type: 'tel', required: false, enabled: true, system: true },
        { name: 'referensi1_pekerjaan', label: 'Pekerjaan', type: 'text', required: false, enabled: true, system: true },
        { name: 'referensi1_hubungan', label: 'Hubungan dengan Anda', type: 'select', options: ['Orang tua', 'Pasangan', 'Saudara', 'Teman', 'Atasan', 'Lainnya'], required: false, enabled: true, system: true }
      ]
    },
    openQuestions: {
      title: 'PERTANYAAN TERBUKA',
      enabled: true,
      fields: [
        { name: 'jawaban1', label: 'Apa yang Anda ketahui tentang perusahaan kami?', type: 'textarea', wide: true, required: false, enabled: true, system: true },
        { name: 'jawaban2', label: 'Ceritakan tentang pribadi Anda.', type: 'textarea', wide: true, required: false, enabled: true, system: true },
        { name: 'jawaban3', label: 'Apa yang akan Anda lakukan untuk perusahaan kami jika diterima?', type: 'textarea', wide: true, required: false, enabled: true, system: true }
      ]
    }
  }
};

const CHOICE_TYPES = new Set(['select', 'radio', 'checkbox']);
const REPEATER_SYSTEM_TYPES = new Set([
  'system_siblings_repeater',
  'system_spouse_group',
  'system_children_repeater',
  'system_languages_repeater',
  'system_work_repeater',
  'system_domicile'
]);

function normalizeStage2Field(raw = {}, defaultsList = [], index = 0) {
  const name = String(raw.name || '').trim() || slugifyKey(raw.label, `custom_${index + 1}`);
  const baseDef = defaultsList.find(f => f.name === name);
  const isSystem = raw.system === true || Boolean(baseDef);
  const type = isSystem && baseDef
    ? baseDef.type
    : (FORM_CUSTOM_FIELD_TYPES.some(t => t.value === raw.type) ? raw.type : 'text');

  const options = CHOICE_TYPES.has(type)
    ? [...new Set((Array.isArray(raw.options) ? raw.options : (baseDef?.options || [])).map(o => String(o ?? '').trim()).filter(Boolean))]
    : [];

  const mandatory = MANDATORY_STAGE2_FIELDS.has(name);
  const enabled = mandatory ? true : raw.enabled !== false;
  const required = mandatory
    ? true
    : (REPEATER_SYSTEM_TYPES.has(type) ? false : (enabled ? raw.required === true : false));

  return {
    ...(baseDef || {}),
    name,
    label: String(raw.label || baseDef?.label || `Field ${index + 1}`).trim(),
    placeholder: String(raw.placeholder ?? baseDef?.placeholder ?? '').trim(),
    type,
    required,
    enabled,
    system: isSystem,
    wide: raw.wide !== undefined ? raw.wide === true : (baseDef?.wide === true || type === 'textarea'),
    options
  };
}

function normalizeStepOrderList(rawOrder, defaultIds) {
  const list = Array.isArray(rawOrder) ? rawOrder : defaultIds;
  const result = [];
  for (const id of list) {
    if (defaultIds.includes(id) && !result.includes(id)) {
      result.push(id);
    }
  }
  for (const id of defaultIds) {
    if (!result.includes(id)) result.push(id);
  }
  return result;
}

export function normalizeStage2Schema(raw = {}) {
  const positions = [...new Set(
    (Array.isArray(raw?.positions) && raw.positions.length ? raw.positions : DEFAULT_STAGE2_SCHEMA.positions)
      .map(p => String(p ?? '').trim())
      .filter(Boolean)
  )];

  const infoSources = [...new Set(
    (Array.isArray(raw?.infoSources) && raw.infoSources.length ? raw.infoSources : DEFAULT_STAGE2_SCHEMA.infoSources)
      .map(s => String(s ?? '').trim())
      .filter(Boolean)
  )];

  const stepSectionOrder = {
    0: normalizeStepOrderList(raw?.stepSectionOrder?.[0] ?? raw?.step0SectionOrder, STEP_SECTION_DEFAULTS[0]),
    1: normalizeStepOrderList(raw?.stepSectionOrder?.[1], STEP_SECTION_DEFAULTS[1]),
    2: normalizeStepOrderList(raw?.stepSectionOrder?.[2], STEP_SECTION_DEFAULTS[2]),
    3: normalizeStepOrderList(raw?.stepSectionOrder?.[3], STEP_SECTION_DEFAULTS[3])
  };

  const sections = {};
  for (const meta of STAGE2_SECTION_META) {
    const defaultSection = DEFAULT_STAGE2_SCHEMA.sections[meta.id];
    const rawSection = raw?.sections?.[meta.id] || {};
    const incomingFields = Array.isArray(rawSection.fields) ? rawSection.fields : defaultSection.fields;

    const seen = new Set();
    const fields = [];
    for (let i = 0; i < incomingFields.length; i++) {
      const f = normalizeStage2Field(incomingFields[i], defaultSection.fields, i);
      let finalName = f.name;
      if (seen.has(finalName)) {
        if (f.system) continue;
        let suffix = 2;
        while (seen.has(`${f.name}_${suffix}`)) suffix++;
        finalName = `${f.name}_${suffix}`;
        f.name = finalName;
      }
      seen.add(finalName);
      fields.push(f);
    }

    for (const defField of defaultSection.fields) {
      if (!seen.has(defField.name)) {
        fields.push(structuredClone(defField));
        seen.add(defField.name);
      }
    }

    const mandatorySection = MANDATORY_STAGE2_SECTIONS.has(meta.id);
    sections[meta.id] = {
      title: String(rawSection.title || defaultSection.title).trim() || defaultSection.title,
      enabled: mandatorySection ? true : rawSection.enabled !== false,
      fields
    };
  }

  return {
    positions: positions.length ? positions : [...DEFAULT_STAGE2_SCHEMA.positions],
    infoSources: infoSources.length ? infoSources : [...DEFAULT_STAGE2_SCHEMA.infoSources],
    consentText: String(raw?.consentText || DEFAULT_STAGE2_SCHEMA.consentText).trim() || DEFAULT_STAGE2_SCHEMA.consentText,
    step0SectionOrder: [...stepSectionOrder[0]],
    stepSectionOrder,
    sections
  };
}
