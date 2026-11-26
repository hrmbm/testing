// Pure Stationery & ATK Inventory, Material/Department Management, Batch Ledger, 4 ATK Reports & Purchase Plan Engine
import { DEFAULT_CANONICAL_SLOCS, DEFAULT_OPS_SETTINGS, normalizeOpsSettings } from './ops-settings-logic.js';

export function normText(v = '') {
  return String(v || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function deriveDefaultPurchaseUnit(itemName = '', stockUnit = 'PCS') {
  const name = normText(itemName);
  const unit = normText(stockUnit) || 'PCS';
  if (unit === 'PACK' || unit === 'RIM' || unit === 'BOX') return unit;
  if (/KERTAS HVS/.test(name)) return 'RIM';
  if (/(BOLPOINT|BULPOIN|BULPOINT|PENSIL KAYU|PENSIL MEKANIK|SPIDOL|STABILLO|ISI CUTTER|ISI STAPLES|TIPEX|REFIL|STICK NOTE|AMPLOP|MAP |STOFMAP|BUKU |KWITANSI|NOTA |SHEET PROTECTOR|DOUBLETAPE|ISOLASI|ISOLASSI|LEM )/.test(name)) {
    return 'PACK';
  }
  return unit;
}

export function normalizeMaterialCode(rawCode = '', fallbackIndex = 1) {
  const clean = String(rawCode || '').trim();
  if (/^\d{5}$/.test(clean)) return clean;
  const legacyMatch = clean.match(/^ATK-(\d+)$/i);
  if (legacyMatch) {
    return String(10000 + Number(legacyMatch[1])).padStart(5, '0');
  }
  const digits = clean.replace(/\D/g, '');
  if (digits.length >= 1 && digits.length <= 5) {
    const n = Number(digits);
    if (n >= 10000 && n <= 99999) return String(n);
    if (n > 0 && n < 10000) return String(10000 + n);
  }
  return String(10000 + Math.max(1, Number(fallbackIndex) || 1)).slice(0, 5);
}

export function generateNextMaterialCode(items = []) {
  let maxNum = 10000;
  for (const it of items || []) {
    const code = normalizeMaterialCode(it?.item_code, 0);
    if (/^\d{5}$/.test(code)) {
      maxNum = Math.max(maxNum, Number(code));
    }
  }
  return String(Math.min(99999, maxNum + 1)).padStart(5, '0');
}

export function generateNextDepartmentCode(departments = []) {
  let maxNum = 100;
  for (const d of departments || []) {
    const clean = String(d?.dept_code || '').replace(/\D/g, '');
    if (clean) maxNum = Math.max(maxNum, Number(clean));
  }
  return String(Math.min(999, maxNum + 1)).padStart(3, '0');
}

export function normalizeStationeryItems(rawItems = []) {
  return (rawItems || []).map((it, idx) => {
    const unit = normText(it?.unit || 'PCS') || 'PCS';
    const itemName = String(it?.item_name || '').trim();
    return {
      ...it,
      id: it?.id || `atk-${String(idx + 1).padStart(3, '0')}`,
      item_code: normalizeMaterialCode(it?.item_code, idx + 1),
      item_name: itemName,
      unit,
      purchase_unit: normText(it?.purchase_unit || '') || deriveDefaultPurchaseUnit(itemName, unit),
      conversion_qty: Math.max(1, Number(it?.conversion_qty ?? it?.unit_conversion ?? 1) || 1),
      min_purchase_qty: Math.max(1, Number(it?.min_purchase_qty) || 1),
      opening_stock: Number(it?.opening_stock ?? it?.current_stock ?? 0),
      current_stock: Number(it?.current_stock ?? 0),
      min_stock: Number(it?.min_stock ?? 2),
      is_active: it?.is_active !== false
    };
  });
}

export function normalizeStationeryDepartments(rawDepts = [], canonicalSlocs = DEFAULT_CANONICAL_SLOCS) {
  const byName = new Map();
  if (Array.isArray(rawDepts)) {
    rawDepts.forEach((d, idx) => {
      const name = normText(typeof d === 'string' ? d : d?.name);
      if (!name) return;
      const code = /^\d{3}$/.test(String(d?.dept_code || '').trim())
        ? String(d.dept_code).trim()
        : String(101 + idx).padStart(3, '0');
      byName.set(name, {
        id: d?.id || `dept-${code}`,
        dept_code: code,
        name
      });
    });
  }
  const sourceNames = Array.isArray(canonicalSlocs) && canonicalSlocs.length
    ? canonicalSlocs.map(normText).filter(Boolean)
    : [...DEFAULT_CANONICAL_SLOCS];

  for (const name of sourceNames) {
    if (!byName.has(name)) {
      const nextCode = generateNextDepartmentCode([...byName.values()]);
      byName.set(name, {
        id: `dept-${nextCode}`,
        dept_code: nextCode,
        name
      });
    }
  }
  return [...byName.values()];
}

export function resolveCanonicalSloc(rawName = '', settings = DEFAULT_OPS_SETTINGS) {
  const cfg = normalizeOpsSettings(settings).stationery;
  const cleanRaw = normText(rawName);
  if (!cleanRaw) return 'HR GA';

  if (cfg.slocAliases && cfg.slocAliases[cleanRaw]) {
    return normText(cfg.slocAliases[cleanRaw]);
  }
  const direct = (cfg.canonicalSlocs || []).find(s => normText(s) === cleanRaw);
  if (direct) return direct;

  for (const [aliasKey, target] of Object.entries(cfg.slocAliases || {})) {
    if (cleanRaw === normText(aliasKey)) return normText(target);
  }
  return cleanRaw;
}

export function applyStationeryTransaction({
  items = [],
  ledger = [],
  tx = {},
  settings = DEFAULT_OPS_SETTINGS
}) {
  const cfg = normalizeOpsSettings(settings).stationery;
  const txType = normText(tx.tx_type || 'OUT');
  if (!['IN', 'OUT', 'ADJUSTMENT'].includes(txType)) {
    throw new Error(`Tipe transaksi tidak valid: ${tx.tx_type}`);
  }

  const rawQty = Number(tx.qty);
  if (!Number.isFinite(rawQty) || (txType !== 'ADJUSTMENT' && rawQty <= 0) || (txType === 'ADJUSTMENT' && rawQty === 0)) {
    throw new Error('Qty transaksi harus berupa angka valid lebih dari 0 (atau delta non-nol untuk Adjustment).');
  }
  if (txType === 'ADJUSTMENT' && cfg.requireApprovalForAdjustment && !String(tx.notes || '').trim()) {
    throw new Error('Stock Adjustment / Opname wajib menyertakan alasan / catatan audit.');
  }

  const needleId = String(tx.item_id || '').trim();
  const needleCode = normText(tx.item_code || '');
  const needleName = normText(tx.item_name || '');

  const idx = items.findIndex(it =>
    (needleId && it.id === needleId) ||
    (needleCode && normText(it.item_code) === needleCode) ||
    (needleName && normText(it.item_name) === needleName)
  );
  if (idx < 0) {
    throw new Error(`Item ATK "${tx.item_name || tx.item_code || tx.item_id || '-'}" tidak ditemukan di master item.`);
  }

  const targetItem = items[idx];
  const prevStock = Number(targetItem.current_stock || 0);
  const delta = txType === 'IN' ? Math.abs(rawQty) : (txType === 'OUT' ? -Math.abs(rawQty) : rawQty);
  const newStock = Math.round((prevStock + delta) * 100) / 100;

  if (newStock < 0) {
    throw new Error(
      `Stok "${targetItem.item_name}" tidak mencukupi (tersedia ${prevStock} ${targetItem.unit}, diminta keluar ${Math.abs(delta)} ${targetItem.unit}). Stok minus diblokir sistem.`
    );
  }

  const deptRaw = String(tx.sloc_raw || tx.department || 'HR GA').trim();
  const deptCanonical = resolveCanonicalSloc(deptRaw, settings);
  const entry = {
    id: tx.id || `mv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tx_date: String(tx.tx_date || new Date().toISOString().slice(0, 10)).slice(0, 10),
    tx_type: txType,
    item_id: targetItem.id,
    item_code: targetItem.item_code,
    item_name: targetItem.item_name,
    qty: txType === 'ADJUSTMENT' ? delta : Math.abs(rawQty),
    unit: targetItem.unit,
    sloc_raw: deptCanonical,
    sloc_canonical: deptCanonical,
    reference_no: '',
    notes: String(tx.notes || '').trim(),
    created_by: String(tx.created_by || 'HR Admin').trim(),
    created_at: tx.created_at || new Date().toISOString(),
    balance_before: prevStock,
    balance_after: newStock
  };

  const nextItems = items.map((it, i) => (i === idx ? { ...it, current_stock: newStock } : it));
  const nextLedger = [entry, ...ledger];
  return { items: nextItems, ledger: nextLedger, entry };
}

export function applyStationeryBatchTransactions({
  items = [],
  ledger = [],
  txDate = '',
  txType = 'OUT',
  department = 'HR GA',
  rows = [],
  createdBy = 'HR Admin',
  settings = DEFAULT_OPS_SETTINGS
}) {
  const cleanType = normText(txType || 'OUT');
  if (!['IN', 'OUT'].includes(cleanType)) {
    throw new Error('Pilih Type transaksi Barang Masuk atau Barang Keluar.');
  }
  const cleanDate = String(txDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const cleanDept = resolveCanonicalSloc(department || 'HR GA', settings);
  const validRows = (rows || []).filter(r => r && (r.item_id || r.item_code || r.item_name));
  if (!validRows.length) {
    throw new Error('Tambahkan minimal 1 barang untuk dicatat.');
  }

  let curItems = [...items];
  let curLedger = [...ledger];
  const entries = [];

  for (let i = 0; i < validRows.length; i++) {
    const r = validRows[i];
    const res = applyStationeryTransaction({
      items: curItems,
      ledger: curLedger,
      tx: {
        id: r.id || `mv-${Date.now()}-${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
        tx_date: cleanDate,
        tx_type: cleanType,
        item_id: r.item_id,
        item_code: r.item_code,
        item_name: r.item_name,
        qty: Number(r.qty),
        sloc_raw: cleanDept,
        notes: String(r.notes || '').trim(),
        created_by: createdBy
      },
      settings
    });
    curItems = res.items;
    curLedger = res.ledger;
    entries.push(res.entry);
  }

  return { items: curItems, ledger: curLedger, entries };
}

export function buildStationeryReports({
  items = [],
  ledger = [],
  monthKey = '', // '' or 'ALL' = global, or 'YYYY-MM'
  settings = DEFAULT_OPS_SETTINGS
}) {
  const cfg = normalizeOpsSettings(settings).stationery;
  const activeDepartments = [...(cfg.canonicalSlocs || [])];
  const cleanMonth = String(monthKey || '').trim();
  const monthPrefix = cleanMonth && cleanMonth !== 'ALL' ? cleanMonth : '';

  const filteredLedger = monthPrefix
    ? ledger.filter(mv => String(mv.tx_date || '').startsWith(monthPrefix))
    : ledger;

  const deptTotals = new Map();
  activeDepartments.forEach(s => deptTotals.set(s, { sloc: s, outQty: 0, inQty: 0, freq: 0 }));

  const statsByItemId = new Map();
  items.forEach(it => {
    statsByItemId.set(it.id, {
      item: it,
      inQty: 0,
      outQty: 0,
      adjQty: 0,
      afterInQty: 0,
      afterOutQty: 0,
      afterAdjQty: 0,
      outFreq: 0,
      currentStock: Number(it.current_stock ?? 0),
      byDept: {}
    });
  });

  const findStat = mv =>
    statsByItemId.get(mv.item_id) ||
    [...statsByItemId.values()].find(x => normText(x.item.item_name) === normText(mv.item_name));

  // Track movements after selected month so Stock Awal + Masuk - Keluar = Saldo Akhir accurately
  if (monthPrefix) {
    for (const mv of ledger) {
      const txMonth = String(mv.tx_date || '').slice(0, 7);
      if (!txMonth || txMonth <= monthPrefix) continue;
      const st = findStat(mv);
      if (!st) continue;
      if (mv.tx_type === 'IN') st.afterInQty += Math.abs(Number(mv.qty || 0));
      else if (mv.tx_type === 'OUT') st.afterOutQty += Math.abs(Number(mv.qty || 0));
      else if (mv.tx_type === 'ADJUSTMENT') st.afterAdjQty += Number(mv.qty || 0);
    }
  }

  for (const mv of filteredLedger) {
    const st = findStat(mv);
    const dept = resolveCanonicalSloc(mv.sloc_canonical || mv.sloc_raw || 'HR GA', settings);
    if (!deptTotals.has(dept)) {
      deptTotals.set(dept, { sloc: dept, outQty: 0, inQty: 0, freq: 0 });
    }
    const dRow = deptTotals.get(dept);

    if (mv.tx_type === 'IN') {
      const q = Math.abs(Number(mv.qty || 0));
      dRow.inQty += q;
      if (st) st.inQty += q;
    } else if (mv.tx_type === 'OUT') {
      const q = Math.abs(Number(mv.qty || 0));
      dRow.outQty += q;
      dRow.freq += 1;
      if (st) {
        st.outQty += q;
        st.outFreq += 1;
        st.byDept[dept] = (st.byDept[dept] || 0) + q;
      }
    } else if (mv.tx_type === 'ADJUSTMENT') {
      if (st) st.adjQty += Number(mv.qty || 0);
    }
  }

  const horizonDaysMap = { '1w': 7, '2w': 14, '1m': 30 };
  const horizonDays = horizonDaysMap[cfg.purchaseHorizon] || 14;
  const windowDays = Math.max(1, cfg.studyWindowMonths * 30);

  const itemReports = [];
  for (const st of statsByItemId.values()) {
    let movingClass = 'DEAD';
    if (st.outQty >= cfg.fastMovingMinOutQty && st.outFreq >= cfg.fastMovingMinFreq) {
      movingClass = 'FAST';
    } else if (st.outQty >= cfg.mediumMovingMinOutQty) {
      movingClass = 'MEDIUM';
    } else if (st.outQty > 0) {
      movingClass = 'SLOW';
    }

    const score = cfg.scoringMode === 'weighted'
      ? Math.round((st.outQty * cfg.scoringWeightQty + st.outFreq * 10 * cfg.scoringWeightFreq) * 100) / 100
      : Math.round((st.outQty + st.outFreq) * 100) / 100;

    const netAfter = st.afterInQty - st.afterOutQty + st.afterAdjQty;
    const periodClosingStock = Math.round((st.currentStock - netAfter) * 100) / 100;
    const netPeriod = st.inQty - st.outQty + st.adjQty;
    const periodOpeningStock = Math.max(0, Math.round((periodClosingStock - netPeriod) * 100) / 100);

    const activeDaysBasis = monthPrefix ? 30 : windowDays;
    const avgDailyOut = st.outQty / activeDaysBasis;
    const targetStock = Math.max(
      Number(st.item.min_stock || 0),
      Math.ceil(avgDailyOut * horizonDays * cfg.safetyStockMultiplier)
    );
    const suggestedPurchase = Math.max(0, Math.ceil(targetStock - periodClosingStock));

    const deptBreakdown = {};
    activeDepartments.forEach(dep => {
      deptBreakdown[dep] = st.byDept[dep] || 0;
    });

    itemReports.push({
      id: st.item.id,
      item_code: normalizeMaterialCode(st.item.item_code),
      item_name: st.item.item_name,
      unit: st.item.unit,
      purchase_unit: st.item.purchase_unit || deriveDefaultPurchaseUnit(st.item.item_name, st.item.unit),
      conversion_qty: Math.max(1, Number(st.item.conversion_qty) || 1),
      min_purchase_qty: Math.max(1, Number(st.item.min_purchase_qty) || 1),
      openingStock: periodOpeningStock,
      inQty: st.inQty,
      outQty: st.outQty,
      adjQty: st.adjQty,
      closingStock: periodClosingStock,
      currentStock: st.currentStock,
      minStock: Number(st.item.min_stock || 0),
      outFreq: st.outFreq,
      movingClass,
      score,
      targetStock,
      suggestedPurchase,
      belowMin: periodClosingStock <= Number(st.item.min_stock || 0),
      byDept: deptBreakdown
    });
  }

  // 1. Report Stock Periodik (sorted by material name)
  const stockPeriodik = [...itemReports]
    .sort((a, b) => a.item_name.localeCompare(b.item_name))
    .map((r, idx) => ({
      no: idx + 1,
      id: r.id,
      item_code: r.item_code,
      item_name: r.item_name,
      openingStock: r.openingStock,
      unit: r.unit,
      inQty: r.inQty,
      outQty: r.outQty,
      closingStock: r.closingStock
    }));

  // 2. Report Barang Keluar Per Departemen
  const deptOutRows = [...itemReports]
    .sort((a, b) => b.outQty - a.outQty || a.item_name.localeCompare(b.item_name))
    .map((r, idx) => ({
      no: idx + 1,
      id: r.id,
      item_code: r.item_code,
      item_name: r.item_name,
      unit: r.unit,
      byDept: r.byDept,
      total: r.outQty
    }));
  const deptOutColumnTotals = {};
  activeDepartments.forEach(dep => {
    deptOutColumnTotals[dep] = deptOutRows.reduce((s, r) => s + (r.byDept[dep] || 0), 0);
  });

  // 3. Barang Terfavorit (Rank 1..N based on Total Qty Keluar)
  const favoriteItems = [...itemReports]
    .sort((a, b) => b.outQty - a.outQty || b.outFreq - a.outFreq || a.item_name.localeCompare(b.item_name))
    .map((r, idx) => ({
      rank: idx + 1,
      id: r.id,
      item_code: r.item_code,
      item_name: r.item_name,
      totalOut: r.outQty,
      outQty: r.outQty,
      outFreq: r.outFreq,
      unit: r.unit,
      purchase_unit: r.purchase_unit,
      conversion_qty: r.conversion_qty,
      min_purchase_qty: r.min_purchase_qty,
      currentStock: r.currentStock,
      byDept: r.byDept
    }));

  itemReports.sort((a, b) => b.score - a.score || b.outQty - a.outQty || a.item_name.localeCompare(b.item_name));
  const departmentConsumption = [...deptTotals.values()].sort((a, b) => b.outQty - a.outQty || a.sloc.localeCompare(b.sloc));
  const purchasePlan = itemReports
    .filter(r => r.suggestedPurchase > 0 || (r.outQty > 0 && r.belowMin))
    .sort((a, b) => b.suggestedPurchase - a.suggestedPurchase || b.outQty - a.outQty);

  return {
    monthKey: monthPrefix || 'ALL',
    departments: activeDepartments,
    horizonDays,
    stockPeriodik,
    deptOutReport: {
      departments: activeDepartments,
      rows: deptOutRows,
      totalsByDept: deptOutColumnTotals,
      grandTotal: deptOutRows.reduce((s, r) => s + r.total, 0)
    },
    favoriteItems,
    itemReports,
    departmentConsumption,
    purchasePlan,
    totals: {
      totalItems: itemReports.length,
      totalIn: itemReports.reduce((s, r) => s + r.inQty, 0),
      totalOut: itemReports.reduce((s, r) => s + r.outQty, 0),
      fastCount: itemReports.filter(r => r.movingClass === 'FAST').length,
      lowStockCount: itemReports.filter(r => r.belowMin).length,
      purchaseItemCount: purchasePlan.length
    }
  };
}

export function sliceTopFavoriteItems(favoriteItems = [], topN = 'all') {
  if (topN === 'all' || topN === 'ALL' || !Number(topN)) {
    return [...favoriteItems];
  }
  const n = Math.max(1, Number(topN));
  return favoriteItems.slice(0, n);
}

export function buildDepartmentUsageChartData({
  favoriteItems = [],
  departments = DEFAULT_CANONICAL_SLOCS,
  topN = 10,
  scaleMax = 0, // multiple of 10, or 0 for auto multiple of 10
  scopeMode = 'both', // 'global' | 'per_dept' | 'both'
  selectedDept = 'ALL'
}) {
  const rankedItems = sliceTopFavoriteItems(favoriteItems, topN);
  const maxObserved = Math.max(
    1,
    ...rankedItems.map(r => r.totalOut || 0),
    ...rankedItems.flatMap(r => departments.map(d => r.byDept?.[d] || 0))
  );
  const autoScaleMax = Math.max(10, Math.ceil(maxObserved / 10) * 10);
  const chosenScale = Number(scaleMax) >= 10
    ? Math.ceil(Number(scaleMax) / 10) * 10
    : autoScaleMax;

  const ticks = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    ticks.push(Math.round((chosenScale * i) / tickCount));
  }

  const globalSeries = {
    key: 'GLOBAL',
    title: 'Global (Semua Departemen)',
    totalQty: rankedItems.reduce((s, r) => s + (r.totalOut || 0), 0),
    bars: rankedItems.map(r => ({
      rank: r.rank,
      item_id: r.id,
      item_name: r.item_name,
      unit: r.unit,
      qty: r.totalOut || 0
    }))
  };

  const deptList = selectedDept && selectedDept !== 'ALL'
    ? departments.filter(d => d === selectedDept)
    : departments;

  const departmentSeries = deptList.map(dept => ({
    key: dept,
    title: dept,
    totalQty: rankedItems.reduce((s, r) => s + (r.byDept?.[dept] || 0), 0),
    bars: rankedItems.map(r => ({
      rank: r.rank,
      item_id: r.id,
      item_name: r.item_name,
      unit: r.unit,
      qty: r.byDept?.[dept] || 0
    }))
  }));

  return {
    scopeMode: ['global', 'per_dept', 'both'].includes(scopeMode) ? scopeMode : 'both',
    topN,
    scaleMax: chosenScale,
    ticks,
    rankedItems,
    globalSeries: scopeMode === 'per_dept' ? null : globalSeries,
    departmentSeries: scopeMode === 'global' ? [] : departmentSeries
  };
}

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function computeNextPurchasePlanWindow(purchasePeriod = '1w', referenceDate = new Date()) {
  const refIso = typeof referenceDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(referenceDate)
    ? referenceDate.slice(0, 10)
    : toIsoDate(referenceDate instanceof Date ? referenceDate : new Date());
  const refDate = new Date(`${refIso}T00:00:00Z`);
  const dow = refDate.getUTCDay(); // 0=Sun..6=Sat

  if (purchasePeriod === '1m') {
    const yr = refDate.getUTCFullYear();
    const mo = refDate.getUTCMonth(); // 0..11
    const firstNextMonth = new Date(Date.UTC(yr, mo + 1, 1));
    const lastNextMonth = new Date(Date.UTC(yr, mo + 2, 0));
    const startDate = toIsoDate(firstNextMonth);
    const endDate = toIsoDate(lastNextMonth);
    return {
      period: '1m',
      periodLabel: 'Monthly',
      requirementColumnLabel: 'Monthly Avg Requirement',
      periodDays: 30,
      startDate,
      endDate,
      dateRangeLabel: `${startDate} to ${endDate}`
    };
  }

  // Next Sunday (always starts next week Sunday - Saturday)
  const daysToNextSunday = 7 - dow;
  const startDate = addUtcDays(refIso, daysToNextSunday);
  const periodDays = purchasePeriod === '2w' ? 14 : 7;
  const endDate = addUtcDays(startDate, periodDays - 1);

  return {
    period: purchasePeriod === '2w' ? '2w' : '1w',
    periodLabel: purchasePeriod === '2w' ? 'Bi-Weekly (2 Weeks)' : 'Weekly',
    requirementColumnLabel: purchasePeriod === '2w' ? '2-Week Avg Requirement' : 'Weekly Avg Requirement',
    periodDays,
    startDate,
    endDate,
    dateRangeLabel: `${startDate} to ${endDate} (Sun - Sat)`
  };
}

export function classifyPurchasePlanFrequency(rank = 1, stationerySettings = DEFAULT_OPS_SETTINGS.stationery) {
  const r = Math.max(1, Number(rank) || 999);
  const ft = stationerySettings?.frequencyTiers || DEFAULT_OPS_SETTINGS.stationery.frequencyTiers;
  const veryFastMax = Number(ft.veryFastMaxRank) || 10;
  const fastMax = Number(ft.fastMaxRank) || 30;
  const slowMax = Number(ft.slowMaxRank) || 50;
  if (r <= veryFastMax) return ft.veryFastLabel || 'Very Fast Moving';
  if (r <= fastMax) return ft.fastLabel || 'Fast Moving';
  if (r <= slowMax) return ft.slowLabel || 'Slow Moving';
  return ft.verySlowLabel || 'Very Slow Moving';
}

export function buildPurchasePlanSuggestions({
  items = [],
  ledger = [],
  purchasePeriod = '1w',
  referenceDate = new Date(),
  manualOverrides = {},
  settings = DEFAULT_OPS_SETTINGS
}) {
  const normalizedSettings = normalizeOpsSettings(settings);
  const stkCfg = normalizedSettings.stationery;
  const normalizedItems = normalizeStationeryItems(items);
  const globalReport = buildStationeryReports({
    items: normalizedItems,
    ledger,
    monthKey: '',
    settings: normalizedSettings
  });
  const planWindow = computeNextPurchasePlanWindow(purchasePeriod, referenceDate);

  // Measure observed monthly horizon from global OUT movements (minimum 1 month = 30 days)
  const outMonths = new Set(
    (ledger || [])
      .filter(mv => normText(mv.tx_type) === 'OUT' && mv.tx_date)
      .map(mv => String(mv.tx_date).slice(0, 7))
      .filter(Boolean)
  );
  const observedDays = Math.max(1, outMonths.size) * 30;

  const mappedRows = globalReport.favoriteItems.map(fav => {
    const ov = manualOverrides?.[fav.id] || {};
    const avgDaily = (fav.totalOut || 0) / observedDays;
    const periodRequirement = avgDaily > 0 ? Math.ceil(avgDaily * planWindow.periodDays) : 0;
    const minStock = periodRequirement * 2;
    const currentStock = Number(fav.currentStock ?? 0);
    const deficit = Math.max(0, minStock - currentStock);
    const conversionQty = Math.max(1, Number(fav.conversion_qty) || 1);
    const minPurchase = ov.minPurchase !== undefined && ov.minPurchase !== ''
      ? Math.max(1, Number(ov.minPurchase) || 1)
      : Math.max(1, Number(fav.min_purchase_qty) || 1);
    const decisionQty = ov.decisionQty !== undefined && ov.decisionQty !== null
      ? String(ov.decisionQty)
      : '';
    const decisionNum = Number(decisionQty);
    const convertedDecisionQty = decisionQty !== '' && Number.isFinite(decisionNum)
      ? Math.round(decisionNum * conversionQty * 100) / 100
      : '';

    return {
      favRank: fav.rank,
      id: fav.id,
      item_code: fav.item_code,
      item_name: fav.item_name,
      currentStock,
      totalGlobalOut: fav.totalOut,
      periodRequirement,
      minStock,
      deficit,
      unit: fav.unit,
      conversionQty,
      minPurchase,
      purchaseUnit: fav.purchase_unit,
      decisionQty,
      convertedDecisionQty,
      note: String(ov.note || '')
    };
  });

  mappedRows.sort((a, b) => {
    if (b.deficit !== a.deficit) return b.deficit - a.deficit;
    if (b.periodRequirement !== a.periodRequirement) return b.periodRequirement - a.periodRequirement;
    return a.favRank - b.favRank;
  });

  const rows = mappedRows.map((r, idx) => {
    const rank = idx + 1;
    return {
      ...r,
      rank,
      frequency: classifyPurchasePlanFrequency(rank, stkCfg)
    };
  });

  return {
    window: planWindow,
    observedMonths: Math.max(1, outMonths.size),
    rows
  };
}

export function buildPurchaseRequisitionWorkspaceRows({
  planRows = [],
  manualItemIds = [],
  rowOverrides = {},
  stationerySettings = DEFAULT_OPS_SETTINGS.stationery
}) {
  const manualSet = new Set((manualItemIds || []).map(id => String(id)));
  const activeRows = [];
  const availableToAdd = [];

  for (const r of planRows || []) {
    const isNonZeroSuggestion = Number(r.periodRequirement || 0) > 0 || Number(r.deficit || 0) > 0;
    const isManualAdded = manualSet.has(String(r.id));
    if (!isNonZeroSuggestion && !isManualAdded) {
      availableToAdd.push(r);
      continue;
    }

    const ov = rowOverrides?.[r.id] || {};
    const minPurchase = ov.minPurchase !== undefined && ov.minPurchase !== ''
      ? Math.max(1, Number(ov.minPurchase) || 1)
      : Math.max(1, Number(r.minPurchase) || 1);
    const decisionQty = ov.decisionQty !== undefined && ov.decisionQty !== null
      ? String(ov.decisionQty)
      : String(r.decisionQty || '');
    const decisionNum = Number(decisionQty);
    const convQty = Math.max(1, Number(r.conversionQty) || 1);
    const convertedDecisionQty = decisionQty !== '' && Number.isFinite(decisionNum)
      ? Math.round(decisionNum * convQty * 100) / 100
      : '';
    const note = ov.note !== undefined ? String(ov.note) : String(r.note || '');

    activeRows.push({
      ...r,
      minPurchase,
      decisionQty,
      convertedDecisionQty,
      frequency: r.frequency || classifyPurchasePlanFrequency(r.rank, stationerySettings),
      note,
      isNonZeroSuggestion,
      isManualAdded: !isNonZeroSuggestion && isManualAdded
    });
  }

  return { rows: activeRows, availableToAdd };
}

export function buildNextPrDraftCode(existingDrafts = [], prefix = 'PR', docDate = '') {
  const cleanPrefix = String(prefix || 'PR').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'PR';
  const yyyymm = (/^\d{4}-\d{2}/.test(String(docDate || '')) ? String(docDate).slice(0, 7) : new Date().toISOString().slice(0, 7)).replace('-', '');
  const base = `${cleanPrefix}-${yyyymm}-`;
  let maxSeq = 0;
  for (const d of existingDrafts || []) {
    const code = String(d?.draftCode || '').trim().toUpperCase();
    if (code.startsWith(base)) {
      const seq = Number(code.slice(base.length).replace(/\D/g, ''));
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  return `${base}${String(maxSeq + 1).padStart(3, '0')}`;
}

export function buildPurchaseRequisitionPrintData({
  draft = {},
  reqRows = [],
  stationerySettings = DEFAULT_OPS_SETTINGS.stationery
}) {
  const prCfg = stationerySettings?.prConfig || DEFAULT_OPS_SETTINGS.stationery.prConfig;
  const useConvertedUnit = prCfg.qtyPrintMode === 'converted_unit';

  const purchaseItems = (reqRows || [])
    .filter(r => r.decisionQty !== '' && Number.isFinite(Number(r.decisionQty)) && Number(r.decisionQty) > 0)
    .map((r, idx) => {
      const qtyVal = useConvertedUnit && r.convertedDecisionQty !== ''
        ? Number(r.convertedDecisionQty)
        : Number(r.decisionQty);
      const unitLbl = useConvertedUnit ? r.unit : r.purchaseUnit;
      return {
        no: idx + 1,
        item_code: normalizeMaterialCode(r.item_code),
        item_name: r.item_name,
        purchaseQty: qtyVal,
        unit: unitLbl
      };
    });

  const attachmentItems = [...(reqRows || [])];

  return {
    meta: {
      draftCode: String(draft.draftCode || '').trim() || 'PR-DRAFT',
      title: String(draft.title || 'Purchase Requisition ATK').trim(),
      periodLabel: String(draft.periodLabel || '').trim(),
      dateRangeLabel: String(draft.dateRangeLabel || '').trim(),
      docDate: String(draft.docDate || new Date().toISOString().slice(0, 10)).slice(0, 10),
      locationLabel: String(draft.locationLabel || prCfg.locationLabel || 'Pasuruan').trim(),
      preparedLabel: String(prCfg.preparedLabel || 'Dibuat oleh,').trim(),
      approvedLabel: String(prCfg.approvedLabel || 'Menyetujui,').trim(),
      signatureLayout: prCfg.signatureLayout === 'columns' ? 'columns' : 'stacked',
      preparedBy: {
        nik: String(draft.preparedBy?.nik || '').trim(),
        name: String(draft.preparedBy?.name || prCfg.defaultPreparedName || '').trim(),
        title: String(draft.preparedBy?.title || prCfg.defaultPreparedTitle || '').trim()
      },
      approvedBy: {
        nik: String(draft.approvedBy?.nik || '').trim(),
        name: String(draft.approvedBy?.name || prCfg.defaultApprovedName || '').trim(),
        title: String(draft.approvedBy?.title || prCfg.defaultApprovedTitle || '').trim()
      },
      prTitle: String(prCfg.prTitle || 'PURCHASE REQUISITION').trim(),
      attachmentTitle: String(prCfg.attachmentTitle || 'LAMPIRAN PURCHASE REQUISITION').trim()
    },
    purchaseItems,
    attachmentItems
  };
}

// ============================================================================
// ATK / Stationery Data Import (Master Item & Stock Movement)
// ============================================================================
export const STATIONERY_MASTER_IMPORT_HEADERS = [
  'Kode Material',
  'Nama Item',
  'Satuan',
  'Satuan Minimal Pembelian',
  'Konversi Satuan',
  'Saldo Awal'
];

export const STATIONERY_MASTER_SAMPLE_ROW = {
  'Kode Material': '10016',
  'Nama Item': 'BOLPOINT HITAM',
  'Satuan': 'PCS',
  'Satuan Minimal Pembelian': 'PACK',
  'Konversi Satuan': 36,
  'Saldo Awal': 0
};

export const STATIONERY_MOVEMENT_IMPORT_HEADERS = [
  'Tanggal',
  'Type',
  'Departemen',
  'Item',
  'Qty',
  'Satuan',
  'Keterangan'
];

export const STATIONERY_MOVEMENT_SAMPLE_ROWS = [
  { Tanggal: '2026-11-01', Type: 'Barang Masuk', Departemen: 'HR GA', Item: 'BOLPOINT HITAM', Qty: 100, Satuan: 'PCS', Keterangan: 'Stok awal masuk November' },
  { Tanggal: '2026-11-02', Type: 'Barang Keluar', Departemen: 'HR GA', Item: 'BOLPOINT HITAM', Qty: 15, Satuan: 'PCS', Keterangan: 'Kebutuhan HR GA' },
  { Tanggal: '2026-11-03', Type: 'Barang Keluar', Departemen: 'PPC INDOOR', Item: 'BOLPOINT HITAM', Qty: 20, Satuan: 'PCS', Keterangan: 'Operasional PPC Indoor' },
  { Tanggal: '2026-11-04', Type: 'Barang Masuk', Departemen: 'PURCHASING', Item: 'KERTAS HVS FOLIO 70GRAM', Qty: 30, Satuan: 'RIM', Keterangan: 'PO ATK Bulanan' },
  { Tanggal: '2026-11-05', Type: 'Barang Keluar', Departemen: 'MARKETING SERVICE', Item: 'KERTAS HVS FOLIO 70GRAM', Qty: 12, Satuan: 'RIM', Keterangan: 'Cetak dokumen marketing' },
  { Tanggal: '2026-11-06', Type: 'Barang Keluar', Departemen: 'PRODUKSI INDOOR', Item: 'ISI CUTTER BESAR', Qty: 10, Satuan: 'PCS', Keterangan: 'Packing indoor' }
];

function getCellCI(row, candidates = []) {
  if (!row || typeof row !== 'object') return '';
  const map = new Map();
  for (const [k, v] of Object.entries(row)) {
    const cleanKey = String(k || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanKey && !map.has(cleanKey)) map.set(cleanKey, v);
  }
  for (const c of candidates) {
    const cleanC = String(c || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (map.has(cleanC)) {
      const val = map.get(cleanC);
      if (val !== undefined && val !== null && String(val).trim() !== '') return val;
    }
  }
  return '';
}

function parseImportDateValue(raw) {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 20000 && raw < 90000) {
    const utcMs = Math.round((raw - 25569) * 86400 * 1000);
    return new Date(utcMs).toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const slashMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slashMatch) {
    let a = Number(slashMatch[1]);
    let b = Number(slashMatch[2]);
    let y = Number(slashMatch[3]);
    if (y < 100) y += 2000;
    // Assume DD/MM/YYYY unless month > 12 fallback
    let day = a;
    let month = b;
    if (month > 12 && day <= 12) {
      month = a;
      day = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}

function parseImportTxType(raw) {
  const txt = normText(raw);
  if (!txt) return '';
  if (txt === 'IN' || txt.includes('MASUK')) return 'IN';
  if (txt === 'OUT' || txt.includes('KELUAR')) return 'OUT';
  if (txt === 'ADJUSTMENT' || txt === 'ADJUST' || txt.includes('PENYESUAIAN')) return 'ADJUSTMENT';
  return '';
}

export function parseStationeryMasterImportRows(rawRows = []) {
  const rows = [];
  const errors = [];
  (rawRows || []).forEach((raw, idx) => {
    const rowNo = idx + 2;
    const itemName = normText(getCellCI(raw, ['Nama Item', 'Item', 'Item Name', 'Nama Barang', 'Material']));
    if (!itemName) {
      errors.push(`Baris ${rowNo}: Nama Item kosong.`);
      return;
    }
    const rawCode = String(getCellCI(raw, ['Kode Material', 'Item Code', 'Kode', 'Code']) || '').trim();
    const unit = normText(getCellCI(raw, ['Satuan', 'Unit', 'Satuan Stock']) || 'PCS') || 'PCS';
    const purchaseUnit = normText(getCellCI(raw, ['Satuan Minimal Pembelian', 'Purchase Unit', 'Satuan Pembelian', 'Satuan Beli']) || '') || deriveDefaultPurchaseUnit(itemName, unit);
    const convRaw = getCellCI(raw, ['Konversi Satuan', 'Conversion Qty', 'Isi per Satuan', 'Isi Satuan', 'Konversi']);
    const conversionQty = Math.max(1, Number(String(convRaw !== '' ? convRaw : 1).replace(/,/g, '.')) || 1);
    const openingRaw = getCellCI(raw, ['Saldo Awal', 'Stock Awal', 'Opening Stock', 'Current Stock', 'Stok Awal', 'Stok']);
    const openingStock = Math.max(0, Number(String(openingRaw || 0).replace(/,/g, '.')) || 0);
    const minRaw = getCellCI(raw, ['Min Stock', 'Minimum Stock', 'Minimal Stock', 'Min Stok']);
    const minStock = Math.max(0, Number(String(minRaw !== '' ? minRaw : 2).replace(/,/g, '.')) || 2);
    const minPurchaseRaw = getCellCI(raw, ['Min Purchase', 'Minimal Pembelian', 'Min Pembelian']);
    const minPurchaseQty = Math.max(1, Number(String(minPurchaseRaw !== '' ? minPurchaseRaw : 1).replace(/,/g, '.')) || 1);

    rows.push({
      raw_code: rawCode,
      item_name: itemName,
      unit,
      purchase_unit: purchaseUnit,
      conversion_qty: conversionQty,
      opening_stock: openingStock,
      min_stock: minStock,
      min_purchase_qty: minPurchaseQty
    });
  });
  return { rows, errors };
}

export function importStationeryMasterDataset({
  existingItems = [],
  existingLedger = [],
  parsedRows = [],
  replaceExisting = false
}) {
  if (!parsedRows.length) {
    throw new Error('Tidak ada baris Master Item ATK yang valid untuk diimport.');
  }
  const baseItems = replaceExisting ? [] : normalizeStationeryItems(existingItems);
  const byName = new Map(baseItems.map(it => [normText(it.item_name), { ...it }]));
  const byCode = new Map(baseItems.map(it => [it.item_code, { ...it }]));
  const resultList = [...baseItems];

  let insertedCount = 0;
  let updatedCount = 0;

  for (const r of parsedRows) {
    const cleanName = normText(r.item_name);
    const desiredCode = /^\d{5}$/.test(String(r.raw_code || '').trim())
      ? String(r.raw_code).trim()
      : '';
    const existing = byName.get(cleanName) || (desiredCode ? byCode.get(desiredCode) : null);

    if (existing) {
      existing.item_name = cleanName;
      if (desiredCode && !byCode.has(desiredCode)) existing.item_code = desiredCode;
      existing.unit = r.unit || existing.unit;
      existing.purchase_unit = r.purchase_unit || existing.purchase_unit;
      existing.conversion_qty = Math.max(1, Number(r.conversion_qty ?? existing.conversion_qty ?? 1));
      existing.opening_stock = Number(r.opening_stock ?? existing.opening_stock);
      if (replaceExisting) {
        existing.current_stock = Number(r.opening_stock ?? 0);
      } else {
        existing.current_stock = Number(r.opening_stock ?? existing.current_stock);
      }
      existing.min_stock = Number(r.min_stock ?? existing.min_stock);
      existing.min_purchase_qty = Math.max(1, Number(r.min_purchase_qty ?? existing.min_purchase_qty ?? 1));
      updatedCount += 1;
    } else {
      const nextCode = desiredCode || generateNextMaterialCode(resultList);
      const newItem = {
        id: `atk-${nextCode}-${Math.random().toString(36).slice(2, 6)}`,
        item_code: nextCode,
        item_name: cleanName,
        unit: r.unit || 'PCS',
        purchase_unit: r.purchase_unit || deriveDefaultPurchaseUnit(cleanName, r.unit || 'PCS'),
        conversion_qty: Math.max(1, Number(r.conversion_qty) || 1),
        min_purchase_qty: Math.max(1, Number(r.min_purchase_qty) || 1),
        opening_stock: Number(r.opening_stock || 0),
        current_stock: Number(r.opening_stock || 0),
        min_stock: Number(r.min_stock ?? 2),
        is_active: true
      };
      resultList.push(newItem);
      byName.set(cleanName, newItem);
      byCode.set(newItem.item_code, newItem);
      insertedCount += 1;
    }
  }

  return {
    items: normalizeStationeryItems(resultList),
    ledger: replaceExisting ? [] : existingLedger,
    insertedCount,
    updatedCount
  };
}

export function parseStationeryMovementImportRows(rawRows = [], settings = DEFAULT_OPS_SETTINGS) {
  const rows = [];
  const errors = [];
  (rawRows || []).forEach((raw, idx) => {
    const rowNo = idx + 2;
    const txDate = parseImportDateValue(getCellCI(raw, ['Tanggal', 'Date', 'Tgl', 'Transaction Date']));
    const txType = parseImportTxType(getCellCI(raw, ['Type', 'Tipe', 'Jenis', 'Jenis Transaksi', 'Tx Type']));
    const deptRaw = String(getCellCI(raw, ['Departemen', 'Dept', 'Department', 'Bagian', 'Unit Kerja']) || 'HR GA').trim();
    const deptCanonical = resolveCanonicalSloc(deptRaw, settings);
    const itemRef = String(getCellCI(raw, ['Item', 'Nama Item', 'Item Name', 'Nama Barang', 'Material']) || '').trim();
    const codeRef = String(getCellCI(raw, ['Kode Material', 'Kode', 'Item Code']) || '').trim();
    const qtyVal = Number(String(getCellCI(raw, ['Qty', 'Jumlah', 'Quantity']) || '').replace(/,/g, '.'));
    const unitVal = normText(getCellCI(raw, ['Satuan', 'Unit']) || '');
    const notes = String(getCellCI(raw, ['Keterangan', 'Notes', 'Catatan', 'Remark']) || '').trim();

    if (!txDate) {
      errors.push(`Baris ${rowNo}: Tanggal tidak valid.`);
      return;
    }
    if (!txType) {
      errors.push(`Baris ${rowNo}: Type harus Barang Masuk atau Barang Keluar.`);
      return;
    }
    if (!itemRef && !codeRef) {
      errors.push(`Baris ${rowNo}: Item wajib diisi.`);
      return;
    }
    if (!Number.isFinite(qtyVal) || qtyVal <= 0) {
      errors.push(`Baris ${rowNo}: Qty harus > 0.`);
      return;
    }

    rows.push({
      tx_date: txDate,
      tx_type: txType,
      department: deptCanonical,
      item_name: normText(itemRef),
      item_code: codeRef,
      qty: qtyVal,
      unit: unitVal,
      notes
    });
  });

  // Sort chronologically; on equal date process IN before OUT
  rows.sort((a, b) => {
    const d = a.tx_date.localeCompare(b.tx_date);
    if (d !== 0) return d;
    const rank = t => (t === 'IN' ? 0 : 1);
    return rank(a.tx_type) - rank(b.tx_type);
  });

  return { rows, errors };
}

export function importStationeryMovementsDataset({
  items = [],
  existingLedger = [],
  parsedRows = [],
  replaceLedger = false,
  autoSeedOpeningIfShort = true,
  createdBy = 'HR Admin',
  settings = DEFAULT_OPS_SETTINGS
}) {
  if (!parsedRows.length) {
    throw new Error('Tidak ada transaksi Stock Movement valid untuk diimport.');
  }

  let curItems = normalizeStationeryItems(items).map(it => ({
    ...it,
    current_stock: replaceLedger ? Number(it.opening_stock ?? 0) : Number(it.current_stock ?? 0)
  }));
  let curLedger = replaceLedger ? [] : [...existingLedger];

  const findItemIdx = (r) => {
    const cleanCode = normalizeMaterialCode(r.item_code || '', 0);
    const cleanName = normText(r.item_name);
    let idx = curItems.findIndex(it =>
      (cleanName && normText(it.item_name) === cleanName) ||
      (r.item_code && it.item_code === cleanCode)
    );
    if (idx === -1 && cleanName) {
      // Also allow partial/case-insensitive exact prefix or substring only on exact name normalized
      idx = curItems.findIndex(it => normText(it.item_name) === cleanName);
    }
    return idx;
  };

  let createdItemsCount = 0;
  let autoSeededCount = 0;
  const importedEntries = [];
  const createdItems = [];

  for (let i = 0; i < parsedRows.length; i++) {
    const r = parsedRows[i];
    let idx = findItemIdx(r);
    if (idx === -1) {
      const nextCode = /^\d{5}$/.test(String(r.item_code || '').trim())
        ? String(r.item_code).trim()
        : generateNextMaterialCode(curItems);
      const unit = r.unit || 'PCS';
      const newItem = {
        id: `atk-${nextCode}-${Math.random().toString(36).slice(2, 6)}`,
        item_code: nextCode,
        item_name: r.item_name || `ITEM ${nextCode}`,
        unit,
        purchase_unit: deriveDefaultPurchaseUnit(r.item_name || '', unit),
        conversion_qty: 1,
        min_purchase_qty: 1,
        opening_stock: 0,
        current_stock: 0,
        min_stock: 2,
        is_active: true
      };
      curItems.push(newItem);
      createdItems.push(newItem);
      createdItemsCount += 1;
      idx = curItems.length - 1;
    }

    const targetItem = curItems[idx];
    if (r.tx_type === 'OUT' && autoSeedOpeningIfShort && targetItem.current_stock < r.qty) {
      const shortfall = Number((r.qty - targetItem.current_stock).toFixed(2));
      curItems[idx] = {
        ...targetItem,
        opening_stock: Number((Number(targetItem.opening_stock || 0) + shortfall).toFixed(2)),
        current_stock: Number((Number(targetItem.current_stock || 0) + shortfall).toFixed(2))
      };
      autoSeededCount += 1;
    }

    const res = applyStationeryTransaction({
      items: curItems,
      ledger: curLedger,
      tx: {
        id: `mv-imp-${Date.now()}-${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
        tx_date: r.tx_date,
        tx_type: r.tx_type,
        item_id: curItems[idx].id,
        item_code: curItems[idx].item_code,
        item_name: curItems[idx].item_name,
        qty: r.qty,
        sloc_raw: r.department,
        notes: r.notes,
        created_by: createdBy
      },
      settings
    });
    curItems = res.items;
    curLedger = res.ledger;
    importedEntries.push(res.entry);
  }

  return {
    items: curItems,
    ledger: curLedger,
    importedEntries,
    createdItems,
    createdItemsCount,
    autoSeededCount
  };
}

