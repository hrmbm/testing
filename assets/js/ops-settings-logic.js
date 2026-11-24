// Flexible Operational Settings, General Work Schedules, Driver Payroll Rules & Report Signatories

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

export const DEFAULT_WORK_SCHEDULES = {
  pasuruan: {
    label: 'Home Base Pasuruan (PT MBM)',
    weekdayStart: '07:30',
    weekdayEnd: '17:00',
    saturdayStart: '07:30',
    saturdayEnd: '12:00'
  },
  surabayaJakarta: {
    label: 'Home Base Surabaya & Jakarta (PT MBM)',
    weekdayStart: '08:00',
    weekdayEnd: '17:00',
    saturdayStart: '08:00',
    saturdayEnd: '12:00'
  },
  kilnDryPersonnel: [
    {
      employee_no: 'ST 130116',
      full_name: 'ABD. KHAMID',
      position: 'MMD',
      weekdayStart: '07:00',
      weekdayEnd: '16:30',
      saturdayStart: '07:00',
      saturdayEnd: '11:30',
      notes: 'Jadwal Khusus Kiln Dry — MMD'
    },
    {
      employee_no: 'ST 061105',
      full_name: 'CHOIRIL',
      position: 'MMD',
      weekdayStart: '07:30',
      weekdayEnd: '17:00',
      saturdayStart: '07:30',
      saturdayEnd: '12:00',
      notes: 'Jadwal Khusus Kiln Dry — MMD'
    },
    {
      employee_no: 'ST 061107',
      full_name: 'JUWADI',
      position: 'MMD',
      weekdayStart: '08:00',
      weekdayEnd: '17:30',
      saturdayStart: '08:00',
      saturdayEnd: '12:30',
      notes: 'Jadwal Khusus Kiln Dry — MMD'
    }
  ],
  manualExceptions: [],
  radinPolicy: {
    mode: 'hold_face_clockin',
    notes: 'PT Radin Mitra Lestari menggunakan mesin clock-in wajah dan aturan tersendiri (status hold — siap menyesuaikan kolom pada tahap Staff Reports).'
  }
};

export const DEFAULT_SIGNATORIES = {
  summary: {
    leftLabel: 'DIBUAT OLEH',
    leftNik: 'ST 260501',
    leftName: 'AYUK NUR KHOTIFAH',
    leftTitle: 'STAFF HR & GA',
    rightLabel: 'DISETUJUI',
    rightNik: 'ST 210608',
    rightName: 'DIANA ANITA SARI',
    rightTitle: 'KA. DEPT HR & GA'
  },
  department: {
    leftLabel: 'DIBUAT OLEH',
    leftNik: 'ST 260501',
    leftName: 'AYUK NUR KHOTIFAH',
    leftTitle: 'STAFF HR & GA',
    rightLabel: 'DISETUJUI',
    rightNik: 'ST 210608',
    rightName: 'DIANA ANITA SARI',
    rightTitle: 'KA. DEPT HR & GA'
  },
  radin: {
    leftLabel: 'DIBUAT OLEH',
    leftNik: 'ST 260501',
    leftName: 'AYUK NUR KHOTIFAH',
    leftTitle: 'STAFF HR & GA',
    midLabel: 'DISETUJUI',
    midNik: 'ST 210608',
    midName: 'DIANA ANITA SARI',
    midTitle: 'KA. DEPT HR & GA',
    rightLabel: 'DIKETAHUI',
    rightNik: 'ST 000002',
    rightName: 'FLORENCIA IRENA',
    rightTitle: 'PT RADIN MITRA LESTARI'
  },
  checksheet: {
    leftLabel: 'DIBUAT OLEH',
    leftNik: 'ST 260501',
    leftName: 'AYUK NUR KHOTIFAH',
    leftTitle: 'STAFF HR & GA',
    rightLabel: 'MENGETAHUI',
    rightNik: 'ST 210608',
    rightName: 'DIANA ANITA SARI',
    rightTitle: 'KA. DEPT HR & GA'
  }
};

export const DEFAULT_OPS_SETTINGS = {
  attendance: {
    timezone: 'Asia/Jakarta',
    cutoffStartDay: 6,
    cutoffEndDay: 5,
    mitraLateCutoffTime: '07:30:59',
    radinLateCutoffTime: '08:00:59',
    lateThresholdMinutes: 1, // >= 1 menit dari jadwal masuk (07:30:59 tepat, 07:31:00 terlambat)
    mealThresholdMinutes: 6, // >= 6 menit dari jadwal masuk (07:35:59 dapat uang makan, 07:36:00 tidak)
    exemptDriverLateFlag: true,
    workingDaysBasis: 26,
    maxPaidDaysCap: 25,
    latePenaltyWeight: 0.25,
    holidayCreditWeight: 0.5,
    warningAbsenceThreshold: 0.05,
    autoMarkNoPunchAs: 'PERLU_PEMERIKSAAN_HR',
    preserveConfirmedReviews: true,
    sourcePriority: ['mitra_transaksi', 'mitra_presensi', 'radin_xlsx'],
    workSchedules: structuredClone(DEFAULT_WORK_SCHEDULES),
    codebook: {
      M: 'Masuk / Hadir Tepat Waktu',
      T: 'Terlambat (>= 1 menit dari jadwal)',
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
    requiredPositionKeyword: 'SOPIR',
    excludedDriverNames: ['SIKUS'],
    defaultMonthlyWage: 3675000,
    workingDayDivisor: 25,
    defaultDailyWage: 147000,
    normalWorkHours: 8,
    weekdayNormalHours: 8,
    saturdayNormalHours: 5,
    normalFloorUnitHours: 1,
    overtimeRoundStepHours: 0.5,
    overtimeBreakThresholdHours: 8,
    overtimeBreakDeductionHours: 1,
    bpjsDefaultAmount: 207507,
    bpjsPeriodRule: 'period2_only', // 'period2_only' | 'always' | 'none'
    claimDailyBase: 36900,
    claimHoursDivisor: 7,
    bkkFeeRate: 0.10,
    pphFeeRate: 0.02,
    extraWeekdayHalfHourIncrement: 13000,
    extraHolidayHalfHourIncrement: 14500,
    payrollPeriodPresets: ['1-15', '16-end'],
    sections: ['Support', 'Indoor', 'Outdoor', 'Radin'],
    reportLocationLabel: 'PASURUAN',
    checksheetCodes: {
      S: 'SUPPORT',
      I: 'INDOOR',
      O: 'OUTDOOR',
      R: 'RADIN'
    },
    signatories: structuredClone(DEFAULT_SIGNATORIES),
    weekdayOvertimeTariff: structuredClone(DEFAULT_WEEKDAY_OVERTIME_TARIFF),
    holidayOvertimeTariff: structuredClone(DEFAULT_HOLIDAY_OVERTIME_TARIFF)
  },
  stationery: {
    allowNegativeStock: false,
    requireApprovalForAdjustment: true,
    canonicalSlocs: [...DEFAULT_CANONICAL_SLOCS],
    slocAliases: { ...DEFAULT_SLOC_ALIASES },
    studyWindowMonths: 3,
    purchaseHorizon: '2w',
    safetyStockMultiplier: 1.0,
    fastMovingMinOutQty: 15,
    fastMovingMinFreq: 3,
    mediumMovingMinOutQty: 5,
    scoringMode: 'legacy_excel',
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

function sanitizeTimeHm(val, fallback) {
  const raw = String(val || '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return fallback;
  return `${String(Math.min(23, Math.max(0, Number(m[1])))).padStart(2, '0')}:${String(Math.min(59, Math.max(0, Number(m[2])))).padStart(2, '0')}`;
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

function normalizeWorkSchedules(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const def = DEFAULT_WORK_SCHEDULES;
  const normBlock = (blk, fb) => ({
    label: String(blk?.label || fb.label).trim() || fb.label,
    weekdayStart: sanitizeTimeHm(blk?.weekdayStart, fb.weekdayStart),
    weekdayEnd: sanitizeTimeHm(blk?.weekdayEnd, fb.weekdayEnd),
    saturdayStart: sanitizeTimeHm(blk?.saturdayStart, fb.saturdayStart),
    saturdayEnd: sanitizeTimeHm(blk?.saturdayEnd, fb.saturdayEnd)
  });
  const kiln = Array.isArray(src.kilnDryPersonnel)
    ? src.kilnDryPersonnel
        .filter(x => x && (x.employee_no || x.full_name))
        .map(x => ({
          employee_no: String(x.employee_no || '').trim(),
          full_name: String(x.full_name || '').trim(),
          position: String(x.position || 'MMD').trim(),
          weekdayStart: sanitizeTimeHm(x.weekdayStart, '07:30'),
          weekdayEnd: sanitizeTimeHm(x.weekdayEnd, '17:00'),
          saturdayStart: sanitizeTimeHm(x.saturdayStart, '07:30'),
          saturdayEnd: sanitizeTimeHm(x.saturdayEnd, '12:00'),
          notes: String(x.notes || '').trim()
        }))
    : structuredClone(def.kilnDryPersonnel);
  const exceptions = Array.isArray(src.manualExceptions)
    ? src.manualExceptions
        .filter(x => x && (x.employee_no || x.full_name))
        .map((x, idx) => ({
          id: String(x.id || `exc-${idx + 1}`).trim(),
          employee_no: String(x.employee_no || '').trim(),
          full_name: String(x.full_name || '').trim(),
          homeBase: String(x.homeBase || 'CUSTOM').trim(),
          weekdayStart: sanitizeTimeHm(x.weekdayStart, '07:30'),
          weekdayEnd: sanitizeTimeHm(x.weekdayEnd, '17:00'),
          saturdayStart: sanitizeTimeHm(x.saturdayStart, '07:30'),
          saturdayEnd: sanitizeTimeHm(x.saturdayEnd, '12:00'),
          reason: String(x.reason || '').trim()
        }))
    : [];
  return {
    pasuruan: normBlock(src.pasuruan, def.pasuruan),
    surabayaJakarta: normBlock(src.surabayaJakarta, def.surabayaJakarta),
    kilnDryPersonnel: kiln,
    manualExceptions: exceptions,
    radinPolicy: {
      mode: String(src.radinPolicy?.mode || def.radinPolicy.mode).trim(),
      notes: String(src.radinPolicy?.notes || def.radinPolicy.notes).trim()
    }
  };
}

function normalizeSignatories(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const def = DEFAULT_SIGNATORIES;
  const normTwo = (inp, fb) => ({
    leftLabel: String(inp?.leftLabel || fb.leftLabel).trim(),
    leftNik: String(inp?.leftNik ?? fb.leftNik).trim(),
    leftName: String(inp?.leftName || fb.leftName).trim(),
    leftTitle: String(inp?.leftTitle || fb.leftTitle).trim(),
    rightLabel: String(inp?.rightLabel || fb.rightLabel).trim(),
    rightNik: String(inp?.rightNik ?? fb.rightNik).trim(),
    rightName: String(inp?.rightName || fb.rightName).trim(),
    rightTitle: String(inp?.rightTitle || fb.rightTitle).trim()
  });
  const normThree = (inp, fb) => ({
    ...normTwo(inp, fb),
    midLabel: String(inp?.midLabel || fb.midLabel).trim(),
    midNik: String(inp?.midNik ?? fb.midNik).trim(),
    midName: String(inp?.midName || fb.midName).trim(),
    midTitle: String(inp?.midTitle || fb.midTitle).trim()
  });
  return {
    summary: normTwo(src.summary, def.summary),
    department: normTwo(src.department, def.department),
    radin: normThree(src.radin, def.radin),
    checksheet: normTwo(src.checksheet, def.checksheet)
  };
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
  const weekdayNormalHours = sanitizeNum(drv.weekdayNormalHours ?? drv.normalWorkHours, defDrv.weekdayNormalHours, 1, 16);

  return {
    attendance: {
      timezone: String(att.timezone || defAtt.timezone).trim() || 'Asia/Jakarta',
      cutoffStartDay: Math.round(sanitizeNum(att.cutoffStartDay, defAtt.cutoffStartDay, 1, 28)),
      cutoffEndDay: Math.round(sanitizeNum(att.cutoffEndDay, defAtt.cutoffEndDay, 1, 28)),
      mitraLateCutoffTime: sanitizeTimeHms(att.mitraLateCutoffTime, defAtt.mitraLateCutoffTime),
      radinLateCutoffTime: sanitizeTimeHms(att.radinLateCutoffTime, defAtt.radinLateCutoffTime),
      lateThresholdMinutes: Math.round(sanitizeNum(att.lateThresholdMinutes, defAtt.lateThresholdMinutes, 0, 60)),
      mealThresholdMinutes: Math.round(sanitizeNum(att.mealThresholdMinutes, defAtt.mealThresholdMinutes, 1, 120)),
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
      workSchedules: normalizeWorkSchedules(att.workSchedules),
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
      autoConvertPendingToApproved: false
    },
    driver: {
      payrollRulesConfirmed: drv.payrollRulesConfirmed !== false,
      requiredPositionKeyword: String(drv.requiredPositionKeyword || defDrv.requiredPositionKeyword).trim().toUpperCase() || 'SOPIR',
      excludedDriverNames: Array.isArray(drv.excludedDriverNames)
        ? drv.excludedDriverNames.map(s => String(s || '').trim().toUpperCase()).filter(Boolean)
        : [...defDrv.excludedDriverNames],
      defaultMonthlyWage: monthlyWage,
      workingDayDivisor: divisor,
      defaultDailyWage: Math.round(sanitizeNum(drv.defaultDailyWage, Math.round(monthlyWage / divisor), 1000)),
      normalWorkHours: weekdayNormalHours,
      weekdayNormalHours,
      saturdayNormalHours: sanitizeNum(drv.saturdayNormalHours, defDrv.saturdayNormalHours, 1, 12),
      normalFloorUnitHours: sanitizeNum(drv.normalFloorUnitHours, defDrv.normalFloorUnitHours, 0.5, 4),
      overtimeRoundStepHours: sanitizeNum(drv.overtimeRoundStepHours, defDrv.overtimeRoundStepHours, 0.25, 1),
      overtimeBreakThresholdHours: sanitizeNum(drv.overtimeBreakThresholdHours, defDrv.overtimeBreakThresholdHours, 1, 24),
      overtimeBreakDeductionHours: sanitizeNum(drv.overtimeBreakDeductionHours, defDrv.overtimeBreakDeductionHours, 0, 4),
      bpjsDefaultAmount: Math.round(sanitizeNum(drv.bpjsDefaultAmount, defDrv.bpjsDefaultAmount, 0)),
      bpjsPeriodRule: ['period2_only', 'always', 'none'].includes(drv.bpjsPeriodRule) ? drv.bpjsPeriodRule : defDrv.bpjsPeriodRule,
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
      reportLocationLabel: String(drv.reportLocationLabel || defDrv.reportLocationLabel).trim().toUpperCase() || 'PASURUAN',
      checksheetCodes: {
        ...defDrv.checksheetCodes,
        ...(drv.checksheetCodes && typeof drv.checksheetCodes === 'object' ? drv.checksheetCodes : {})
      },
      signatories: normalizeSignatories(drv.signatories),
      weekdayOvertimeTariff: normalizeTariffRows(drv.weekdayOvertimeTariff, DEFAULT_WEEKDAY_OVERTIME_TARIFF),
      holidayOvertimeTariff: normalizeTariffRows(drv.holidayOvertimeTariff, DEFAULT_HOLIDAY_OVERTIME_TARIFF)
    },
    stationery: {
      allowNegativeStock: false,
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
