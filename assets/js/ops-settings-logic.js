// Flexible Operational Settings, Formulas, Workflows & Codebooks (System Settings)

export const DEFAULT_WEEKDAY_OVERTIME_TARIFF = [
  { hours: 0, amount: 0 },
  { hours: 1, amount: 18000 },
  { hours: 1.5, amount: 27000 },
  { hours: 2, amount: 36000 },
  { hours: 2.5, amount: 45000 },
  { hours: 3, amount: 57000 },
  { hours: 3.5, amount: 67500 },
  { hours: 4, amount: 78000 },
  { hours: 4.5, amount: 88500 },
  { hours: 5, amount: 104000 },
  { hours: 5.5, amount: 117000 },
  { hours: 6, amount: 130000 },
  { hours: 6.5, amount: 143000 },
  { hours: 7, amount: 156000 },
  { hours: 7.5, amount: 169000 },
  { hours: 8, amount: 182000 },
  { hours: 8.5, amount: 195000 },
  { hours: 9, amount: 208000 },
  { hours: 9.5, amount: 221000 },
  { hours: 10, amount: 234000 },
  { hours: 10.5, amount: 247000 },
  { hours: 11, amount: 260000 },
  { hours: 11.5, amount: 273000 },
  { hours: 12, amount: 286000 },
  { hours: 12.5, amount: 299000 },
  { hours: 13, amount: 312000 },
  { hours: 13.5, amount: 325000 },
  { hours: 14, amount: 338000 },
  { hours: 14.5, amount: 351000 },
  { hours: 15, amount: 364000 }
];

export const DEFAULT_HOLIDAY_OVERTIME_TARIFF = [
  { hours: 0, amount: 0 },
  { hours: 1, amount: 21000 },
  { hours: 1.5, amount: 31500 },
  { hours: 2, amount: 42000 },
  { hours: 2.5, amount: 52500 },
  { hours: 3, amount: 63000 },
  { hours: 3.5, amount: 73500 },
  { hours: 4, amount: 87000 },
  { hours: 4.5, amount: 99000 },
  { hours: 5, amount: 111000 },
  { hours: 5.5, amount: 123000 },
  { hours: 6, amount: 135000 },
  { hours: 6.5, amount: 147000 },
  { hours: 7, amount: 164000 },
  { hours: 7.5, amount: 178500 },
  { hours: 8, amount: 193000 },
  { hours: 8.5, amount: 207500 },
  { hours: 9, amount: 222000 },
  { hours: 9.5, amount: 236500 },
  { hours: 10, amount: 251000 },
  { hours: 10.5, amount: 265500 },
  { hours: 11, amount: 280000 },
  { hours: 11.5, amount: 294500 },
  { hours: 12, amount: 309000 }
];

export const DEFAULT_CANONICAL_SLOCS = [
  'HR GA',
  'INVENTORY & GUDANG',
  'PURCHASING',
  'PPC INDOOR',
  'PPC OUTDOOR',
  'MAINTENANCE',
  'QC INDOOR',
  'QC OUTDOOR',
  'PRODUKSI INDOOR',
  'PRODUKSI OUTDOOR',
  'R & D',
  'F & A',
  'MARKETING SERVICE',
  'RADIN MITRA LESTARI',
  'FOTOCOPY',
  'SECURITY'
];

export const DEFAULT_SLOC_ALIASES = {
  GUDANG: 'INVENTORY & GUDANG',
  MARKETING: 'MARKETING SERVICE',
  RADIN: 'RADIN MITRA LESTARI',
  FINANCE: 'F & A',
  'FINANCE & ACCOUNTING': 'F & A',
  'R&D': 'R & D',
  HRGA: 'HR GA',
  'CONSTRUCTION INSTALATION': 'PRODUKSI OUTDOOR'
};

export const DEFAULT_OPS_SETTINGS = {
  attendance: {
    timezone: 'Asia/Jakarta',
    cutoffStartDay: 6,
    cutoffEndDay: 5,
    mitraLateCutoffTime: '07:30:59',
    radinLateCutoffTime: '08:00:59',
    exemptDriverLateFlag: true,
    workingDaysBasis: 26,
    maxPaidDaysCap: 25,
    latePenaltyWeight: 0.25,
    holidayCreditWeight: 0.5,
    warningAbsenceThreshold: 0.05,
    autoMarkNoPunchAs: 'PERLU_PEMERIKSAAN_HR', // 'PERLU_PEMERIKSAAN_HR' | 'A'
    preserveConfirmedReviews: true,
    sourcePriority: ['mitra_transaksi', 'mitra_presensi', 'radin_xlsx'],
    codebook: {
      M: 'Masuk / Hadir Tepat Waktu',
      T: 'Terlambat (>= 07:31:00)',
      S: 'Sakit (Dengan Surat)',
      I: 'Izin Pribadi',
      ITB: 'Ijin Tidak Bekerja (Potong)',
      A: 'Alpa (Tanpa Keterangan)',
      CT: 'Cuti Tahunan',
      CI: 'Cuti Istimewa',
      DS: 'Datang Siang (Izin)',
      PA: 'Pulang Awal (Izin)',
      L: 'Diliburkan / Shift Libur',
      O: 'Off / Libur Jadwal',
      SDR: 'Sakit Dengan Resep / Surat Dokter Resmi',
      PC: 'Pulang Cepat (Terjadwalkan)',
      BPJS: 'Izin Medis / BPJS',
      H: 'Hadir (Kode Export Radin)',
      PERLU_PEMERIKSAAN_HR: 'Perlu Pemeriksaan HR'
    }
  },
  cuti: {
    defaultAnnualQuota: 12,
    cutiBersamaDeduction: 6,
    enableConfirmationGate: true,
    confirmationDaysThreshold: 40,
    allowCarryOver: false,
    autoConvertPendingToApproved: false
  },
  driver: {
    payrollRulesConfirmed: true,
    defaultMonthlyWage: 3675000,
    workingDayDivisor: 25,
    defaultDailyWage: 147000,
    normalWorkHours: 8,
    claimDailyBase: 36900,
    claimHoursDivisor: 7,
    bkkFeeRate: 0.10,
    pphFeeRate: 0.02,
    extraWeekdayHalfHourIncrement: 13000,
    extraHolidayHalfHourIncrement: 14500,
    payrollPeriodPresets: ['1-15', '16-end'],
    sections: ['Support', 'Indoor', 'Outdoor', 'Radin', 'Lainnya'],
    checksheetCodes: {
      S: 'Driver Masuk Kerja / Siap Tugas (Jam Kerja)',
      I: 'Istirahat / Jeda Operasional',
      R: 'Ritase Tambahan / Tugas Khusus',
      O: 'Off / Selesai Tugas',
      L: 'Lembur'
    },
    weekdayOvertimeTariff: structuredClone(DEFAULT_WEEKDAY_OVERTIME_TARIFF),
    holidayOvertimeTariff: structuredClone(DEFAULT_HOLIDAY_OVERTIME_TARIFF)
  },
  stationery: {
    allowNegativeStock: false,
    requireApprovalForAdjustment: true,
    canonicalSlocs: [...DEFAULT_CANONICAL_SLOCS],
    slocAliases: { ...DEFAULT_SLOC_ALIASES },
    studyWindowMonths: 3,
    purchaseHorizon: '2w', // '1w' | '2w' | '1m'
    safetyStockMultiplier: 1.0,
    fastMovingMinOutQty: 15,
    fastMovingMinFreq: 3,
    mediumMovingMinOutQty: 5,
    scoringMode: 'legacy_excel', // 'legacy_excel' | 'weighted'
    scoringWeightQty: 0.6,
    scoringWeightFreq: 0.4
  }
};

function sanitizeNum(val, fallback, min = -Infinity, max = Infinity) {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeTimeHms(val, fallback) {
  const raw = String(val || '').trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:59`;
  return fallback;
}

function normalizeTariffRows(rows, fallback) {
  if (!Array.isArray(rows) || !rows.length) return structuredClone(fallback);
  const cleaned = rows
    .map(r => ({
      hours: sanitizeNum(r?.hours, -1, 0, 24),
      amount: Math.round(sanitizeNum(r?.amount, -1, 0))
    }))
    .filter(r => r.hours >= 0 && r.amount >= 0)
    .sort((a, b) => a.hours - b.hours);
  return cleaned.length ? cleaned : structuredClone(fallback);
}

export function normalizeOpsSettings(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const att = src.attendance || {};
  const cuti = src.cuti || {};
  const drv = src.driver || {};
  const stk = src.stationery || {};

  const defAtt = DEFAULT_OPS_SETTINGS.attendance;
  const defCuti = DEFAULT_OPS_SETTINGS.cuti;
  const defDrv = DEFAULT_OPS_SETTINGS.driver;
  const defStk = DEFAULT_OPS_SETTINGS.stationery;

  const monthlyWage = Math.round(sanitizeNum(drv.defaultMonthlyWage, defDrv.defaultMonthlyWage, 100000));
  const divisor = sanitizeNum(drv.workingDayDivisor, defDrv.workingDayDivisor, 1, 31);

  return {
    attendance: {
      timezone: String(att.timezone || defAtt.timezone).trim() || 'Asia/Jakarta',
      cutoffStartDay: Math.round(sanitizeNum(att.cutoffStartDay, defAtt.cutoffStartDay, 1, 28)),
      cutoffEndDay: Math.round(sanitizeNum(att.cutoffEndDay, defAtt.cutoffEndDay, 1, 28)),
      mitraLateCutoffTime: sanitizeTimeHms(att.mitraLateCutoffTime, defAtt.mitraLateCutoffTime),
      radinLateCutoffTime: sanitizeTimeHms(att.radinLateCutoffTime, defAtt.radinLateCutoffTime),
      exemptDriverLateFlag: att.exemptDriverLateFlag !== false,
      workingDaysBasis: sanitizeNum(att.workingDaysBasis, defAtt.workingDaysBasis, 1, 31),
      maxPaidDaysCap: sanitizeNum(att.maxPaidDaysCap, defAtt.maxPaidDaysCap, 1, 31),
      latePenaltyWeight: sanitizeNum(att.latePenaltyWeight, defAtt.latePenaltyWeight, 0, 2),
      holidayCreditWeight: sanitizeNum(att.holidayCreditWeight, defAtt.holidayCreditWeight, 0, 2),
      warningAbsenceThreshold: sanitizeNum(att.warningAbsenceThreshold, defAtt.warningAbsenceThreshold, 0, 1),
      autoMarkNoPunchAs: att.autoMarkNoPunchAs === 'A' ? 'A' : 'PERLU_PEMERIKSAAN_HR',
      preserveConfirmedReviews: att.preserveConfirmedReviews !== false,
      sourcePriority: Array.isArray(att.sourcePriority) && att.sourcePriority.length
        ? att.sourcePriority.map(s => String(s || '').trim()).filter(Boolean)
        : [...defAtt.sourcePriority],
      codebook: {
        ...defAtt.codebook,
        ...(att.codebook && typeof att.codebook === 'object' ? att.codebook : {})
      }
    },
    cuti: {
      defaultAnnualQuota: Math.round(sanitizeNum(cuti.defaultAnnualQuota, defCuti.defaultAnnualQuota, 0, 60)),
      cutiBersamaDeduction: Math.round(sanitizeNum(cuti.cutiBersamaDeduction, defCuti.cutiBersamaDeduction, 0, 30)),
      enableConfirmationGate: cuti.enableConfirmationGate !== false,
      confirmationDaysThreshold: Math.round(sanitizeNum(cuti.confirmationDaysThreshold, defCuti.confirmationDaysThreshold, 0, 365)),
      allowCarryOver: Boolean(cuti.allowCarryOver),
      autoConvertPendingToApproved: false // safety lock: never auto-approve unapproved leave
    },
    driver: {
      payrollRulesConfirmed: drv.payrollRulesConfirmed !== false,
      defaultMonthlyWage: monthlyWage,
      workingDayDivisor: divisor,
      defaultDailyWage: Math.round(sanitizeNum(drv.defaultDailyWage, Math.round(monthlyWage / divisor), 1000)),
      normalWorkHours: sanitizeNum(drv.normalWorkHours, defDrv.normalWorkHours, 1, 16),
      claimDailyBase: Math.round(sanitizeNum(drv.claimDailyBase, defDrv.claimDailyBase, 0)),
      claimHoursDivisor: sanitizeNum(drv.claimHoursDivisor, defDrv.claimHoursDivisor, 1, 24),
      bkkFeeRate: sanitizeNum(drv.bkkFeeRate, defDrv.bkkFeeRate, 0, 1),
      pphFeeRate: sanitizeNum(drv.pphFeeRate, defDrv.pphFeeRate, 0, 1),
      extraWeekdayHalfHourIncrement: Math.round(sanitizeNum(drv.extraWeekdayHalfHourIncrement, defDrv.extraWeekdayHalfHourIncrement, 0)),
      extraHolidayHalfHourIncrement: Math.round(sanitizeNum(drv.extraHolidayHalfHourIncrement, defDrv.extraHolidayHalfHourIncrement, 0)),
      payrollPeriodPresets: Array.isArray(drv.payrollPeriodPresets) && drv.payrollPeriodPresets.length
        ? drv.payrollPeriodPresets
        : [...defDrv.payrollPeriodPresets],
      sections: Array.isArray(drv.sections) && drv.sections.length
        ? drv.sections.map(s => String(s || '').trim()).filter(Boolean)
        : [...defDrv.sections],
      checksheetCodes: {
        ...defDrv.checksheetCodes,
        ...(drv.checksheetCodes && typeof drv.checksheetCodes === 'object' ? drv.checksheetCodes : {})
      },
      weekdayOvertimeTariff: normalizeTariffRows(drv.weekdayOvertimeTariff, DEFAULT_WEEKDAY_OVERTIME_TARIFF),
      holidayOvertimeTariff: normalizeTariffRows(drv.holidayOvertimeTariff, DEFAULT_HOLIDAY_OVERTIME_TARIFF)
    },
    stationery: {
      allowNegativeStock: false, // strict requirement from Process.txt & Audit: negative stock always blocked
      requireApprovalForAdjustment: stk.requireApprovalForAdjustment !== false,
      canonicalSlocs: Array.isArray(stk.canonicalSlocs) && stk.canonicalSlocs.length
        ? [...new Set(stk.canonicalSlocs.map(s => String(s || '').trim().toUpperCase()).filter(Boolean))]
        : [...defStk.canonicalSlocs],
      slocAliases: {
        ...defStk.slocAliases,
        ...(stk.slocAliases && typeof stk.slocAliases === 'object' ? stk.slocAliases : {})
      },
      studyWindowMonths: Math.round(sanitizeNum(stk.studyWindowMonths, defStk.studyWindowMonths, 1, 12)),
      purchaseHorizon: ['1w', '2w', '1m'].includes(stk.purchaseHorizon) ? stk.purchaseHorizon : defStk.purchaseHorizon,
      safetyStockMultiplier: sanitizeNum(stk.safetyStockMultiplier, defStk.safetyStockMultiplier, 0.5, 5),
      fastMovingMinOutQty: sanitizeNum(stk.fastMovingMinOutQty, defStk.fastMovingMinOutQty, 1),
      fastMovingMinFreq: sanitizeNum(stk.fastMovingMinFreq, defStk.fastMovingMinFreq, 1),
      mediumMovingMinOutQty: sanitizeNum(stk.mediumMovingMinOutQty, defStk.mediumMovingMinOutQty, 1),
      scoringMode: stk.scoringMode === 'weighted' ? 'weighted' : 'legacy_excel',
      scoringWeightQty: sanitizeNum(stk.scoringWeightQty, defStk.scoringWeightQty, 0, 1),
      scoringWeightFreq: sanitizeNum(stk.scoringWeightFreq, defStk.scoringWeightFreq, 0, 1)
    }
  };
}
