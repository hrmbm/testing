/**
 * HR MBM — Standalone Agreement HTML Renderer (Zero Dependencies)
 * Integrated from HRIS-MBM-HTML-Kit for browser ESM and Node.js testing.
 */

const ONES = [
  '', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima',
  'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas',
];

export function numberToIndonesianWords(num) {
  const n = Math.floor(Math.abs(Number(num) || 0));
  if (!Number.isFinite(n) || n === 0) return 'Nol';
  const convert = (val) => {
    if (val < 12) return ONES[val];
    if (val < 20) return `${ONES[val - 10]} Belas`;
    if (val < 100) {
      const t = Math.floor(val / 10);
      const r = val % 10;
      return `${ONES[t]} Puluh${r ? ` ${convert(r)}` : ''}`;
    }
    if (val < 200) return `Seratus${val - 100 ? ` ${convert(val - 100)}` : ''}`;
    if (val < 1000) {
      const h = Math.floor(val / 100);
      const r = val % 100;
      return `${ONES[h]} Ratus${r ? ` ${convert(r)}` : ''}`;
    }
    if (val < 2000) return `Seribu${val - 1000 ? ` ${convert(val - 1000)}` : ''}`;
    if (val < 1_000_000) {
      const k = Math.floor(val / 1000);
      const r = val % 1000;
      return `${convert(k)} Ribu${r ? ` ${convert(r)}` : ''}`;
    }
    if (val < 1_000_000_000) {
      const m = Math.floor(val / 1_000_000);
      const r = val % 1_000_000;
      return `${convert(m)} Juta${r ? ` ${convert(r)}` : ''}`;
    }
    return String(val);
  };
  return convert(n).replace(/\s+/g, ' ').trim();
}

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return { year: 2026, month: 11, day: 2, weekday: 1 };
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return { year, month, day, weekday: dt.getUTCDay() };
}

function fmtDate(iso) {
  const { year, month, day } = parseIso(iso);
  return `${String(day).padStart(2, '0')} ${MONTHS[(month - 1 + 12) % 12]} ${year}`;
}

function fmtRp(num) {
  return Math.max(0, Math.round(Number(num) || 0)).toLocaleString('id-ID');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const UPPERCASE_PROPER_TOKENS = new Set([
  'PT', 'CV', 'UD', 'PD', 'RT', 'RW', 'DKI', 'DIY', 'NTB', 'NTT', 'RI',
  'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'
]);

function formatProperSegment(seg = '') {
  if (!seg) return '';
  const m = seg.match(/^([^a-zA-Z0-9]*)(.*?)([^a-zA-Z0-9]*)$/);
  if (!m) return seg;
  const [, lead, core, trail] = m;
  if (!core) return seg;
  const upperCore = core.toUpperCase();
  if (UPPERCASE_PROPER_TOKENS.has(upperCore)) {
    return `${lead}${upperCore}${trail}`;
  }
  const rtrw = core.match(/^(RT|RW)([./-]?\d+.*)$/i);
  if (rtrw) {
    return `${lead}${rtrw[1].toUpperCase()}${rtrw[2].toUpperCase()}${trail}`;
  }
  if (core.includes('.')) {
    return `${lead}${core.split('.').map(part => formatProperSegment(part)).join('.')}${trail}`;
  }
  if (core.includes('/')) {
    return `${lead}${core.split('/').map(part => formatProperSegment(part)).join('/')}${trail}`;
  }
  if (core.includes('-')) {
    return `${lead}${core.split('-').map(part => formatProperSegment(part)).join('-')}${trail}`;
  }
  return `${lead}${core.charAt(0).toUpperCase()}${core.slice(1).toLowerCase()}${trail}`;
}

export function toProperCase(value = '') {
  const clean = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  return clean.split(' ').map(formatProperSegment).join(' ');
}

export function computeEndDate(startIso, durationMonths) {
  const { year, month, day } = parseIso(startIso);
  const dt = new Date(Date.UTC(year, month - 1 + Math.max(1, durationMonths || 1), day - 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function formatDurationParts(durationMonths) {
  const months = Math.max(1, Math.round(durationMonths || 1));
  if (months % 12 === 0) {
    const years = months / 12;
    const wordsLower = numberToIndonesianWords(years).toLowerCase();
    return {
      displayNum: years,
      unit: 'Tahun',
      wordsLower,
      fullPhrase: `${years} (${wordsLower}) Tahun`,
    };
  }
  const wordsLower = numberToIndonesianWords(months).toLowerCase();
  return {
    displayNum: months,
    unit: 'Bulan',
    wordsLower,
    fullPhrase: `${months} (${wordsLower}) Bulan`,
  };
}

export function renderAgreementHtml(templateHtml, data, companyMaster = null) {
  const cleanData = Object.fromEntries(
    Object.entries(data || {}).filter(([, v]) => v !== undefined)
  );
  const merged = companyMaster ? { ...companyMaster, ...cleanData } : cleanData;
  const signing = parseIso(merged.signingDate);
  const roman = ROMANS[(signing.month - 1 + 12) % 12];
  const months = Math.max(1, Math.round(merged.durationMonths || 6));
  const endDate = merged.endDate || computeEndDate(merged.signingDate, months);
  const dur = formatDurationParts(months);
  const seq = String(merged.docSequence || '184').trim();
  const shortfall = Math.max(0, (Number(merged.currUmkAmount) || 0) - (Number(merged.cashWageAmount) || 0));

  const isReholz = String(merged.companyId || '').trim() === 'comp-rml'
    || String(merged.code || '').trim().toUpperCase() === 'RML'
    || /radin\s+mitra\s+lestari|reholz/i.test(String(merged.companyName || ''));

  const rawContact = String(merged.letterheadContact || '').trim();
  const fallbackEmailMatch = rawContact.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const kopEmail = String(
    merged.letterheadEmail !== undefined
      ? merged.letterheadEmail
      : (isReholz ? '' : (fallbackEmailMatch ? fallbackEmailMatch[1] : 'mitra@mitrabina.com'))
  ).trim();
  const kopPhone = String(
    merged.letterheadPhone !== undefined
      ? merged.letterheadPhone
      : (rawContact
          ? rawContact.replace(/\s*·?\s*E-?mail\s*:\s*\S+/i, '').trim()
          : (isReholz ? '(0343) 632 266' : 'Telp : 62–343–632266, 632366, Fax : 62–343–642127'))
  ).trim();

  const vars = {
    no_pkwt: `${seq}/PKWT/${roman}/${signing.year}`,
    no_pb: `${seq}/PB/${roman}/${signing.year}`,
    no_urut: seq,
    hari_ttd: DAYS[signing.weekday],
    tgl_ttd_angka: String(signing.day),
    tgl_ttd_terbilang: numberToIndonesianWords(signing.day),
    bulan_ttd: MONTHS[(signing.month - 1 + 12) % 12],
    bulan_romawi: roman,
    tahun_ttd: String(signing.year),
    tahun_ttd_terbilang: numberToIndonesianWords(signing.year),
    tgl_mulai: fmtDate(merged.signingDate),
    tgl_akhir: fmtDate(endDate),
    durasi_lengkap: dur.fullPhrase,
    durasi_angka: String(dur.displayNum),
    durasi_bulan: String(months),
    durasi_terbilang: dur.wordsLower,
    durasi_satuan: dur.unit,
    tgl_gajian: String(merged.paydayDay || 10),
    tgl_gajian_terbilang: numberToIndonesianWords(merged.paydayDay || 10),
    kota_ttd: merged.signingCity || 'Pasuruan',
    catatan_tambahan: (merged.customNote || '').trim(),
    nama_karyawan: toProperCase(merged.employeeName || ''),
    nama_karyawan_ttd: String(merged.employeeName || '').trim().toUpperCase(),
    nik_karyawan: (merged.employeeNik || '').trim(),
    no_ktp: (merged.employeeKtp || '').trim(),
    departemen: (merged.employeeDepartment || '').trim(),
    jabatan: merged.employeePosition || '',
    alamat_karyawan: toProperCase(merged.employeeAddress || ''),
    nama_perusahaan: merged.companyName || 'PT. MITRA BINAMANDIRI MAKMUR',
    nama_perusahaan_judul: merged.companyDisplayName || merged.companyName || 'PT. Mitra Binamandiri Makmur',
    alamat_kop_surat: merged.letterheadAddress || 'Ds. Randupitu, Kec. Gempol, Pasuruan – East Java, Indonesia',
    kop_alamat_baris1: merged.letterheadAddressLine1 || merged.letterheadAddress || 'Ds. Randupitu, Kec. Gempol, Pasuruan – East Java, Indonesia',
    kop_alamat_baris2: merged.letterheadAddressLine2 || '',
    kop_telp: kopPhone,
    kop_email: kopEmail,
    logo_reholz_url: merged.reholzLogoUrl || './assets/img/logo-reholz-green.png',
    kontak_kop_surat: merged.letterheadContact || 'Telp : 62–343–632266, 632366, Fax : 62–343–642127 · E-mail : mitra@mitrabina.com',
    alamat_perusahaan_pkwt: merged.companyAddressPkwt || 'Jalan Raya Gunung Gangsir, Ds. Randu Pitu, Kec. Gempol, Kab. Pasuruan – Jawa Timur',
    alamat_perusahaan_pb: merged.companyAddressPb || 'Jalan Raya Gunung Gangsir, Desa Randupitu, RT.002 RW.005, Kec. Gempol - Kab. Pasuruan',
    bidang_usaha_pkwt: merged.companyIndustryPkwt || (isReholz ? 'konstruksi' : 'industri mebel'),
    bidang_usaha_pb: merged.companyIndustryPb || 'industri furniture',
    nama_hrd: merged.hrName || 'Diana Anita Sari',
    nama_hrd_ttd: String(merged.hrName || 'Diana Anita Sari').trim().toUpperCase(),
    jabatan_hrd_pkwt: merged.hrRolePkwt || 'Manager HRD & GA',
    jabatan_hrd_pb: merged.hrRolePb || 'HRD',
    jabatan_ttd_hrd: merged.hrSignatureTitle || 'Manager HR GA',
    tahun_kontrak: String(merged.contractYear || signing.year),
    tahun_kontrak_lalu: String((Number(merged.contractYear) || signing.year) - 1),
    tahun_umk_lalu: String(merged.prevUmkYear || signing.year - 1),
    umk_lalu: fmtRp(merged.prevUmkAmount),
    umk_lalu_terbilang: `${numberToIndonesianWords(merged.prevUmkAmount)} Rupiah`,
    tahun_umk_sekarang: String(merged.currUmkYear || signing.year),
    umk_sekarang: fmtRp(merged.currUmkAmount),
    umk_sekarang_terbilang: `${numberToIndonesianWords(merged.currUmkAmount)} Rupiah`,
    no_sk_gubernur: merged.governorDecreeNo || '',
    gaji_tunai: fmtRp(merged.cashWageAmount),
    gaji_tunai_terbilang: `${numberToIndonesianWords(merged.cashWageAmount)} Rupiah`,
    selisih_hutang: fmtRp(shortfall),
    selisih_hutang_terbilang: `${numberToIndonesianWords(shortfall)} Rupiah`,
    lembur_biasa: fmtRp(merged.overtimeWeekdayRate),
    lembur_biasa_terbilang: `${numberToIndonesianWords(merged.overtimeWeekdayRate)} Rupiah`,
    lembur_libur: fmtRp(merged.overtimeHolidayRate),
    lembur_libur_terbilang: `${numberToIndonesianWords(merged.overtimeHolidayRate)} Rupiah`,
    ...(merged.customVars || {}),
  };

  const flags = {
    nik_karyawan: Boolean(vars.nik_karyawan),
    no_ktp: Boolean(vars.no_ktp),
    departemen: Boolean(vars.departemen),
    catatan_tambahan: Boolean(vars.catatan_tambahan),
    is_reholz: isReholz,
    is_standard_kop: !isReholz,
    kop_email: Boolean(vars.kop_email),
  };

  let out = templateHtml;
  for (let i = 0; i < 3; i++) {
    out = out.replace(/\{\{#if\s+([a-zA-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, k, inner) =>
      flags[k] ? inner : ''
    );
  }
  return out.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, k) =>
    vars[k] !== undefined ? escapeHtml(vars[k]) : ''
  );
}
