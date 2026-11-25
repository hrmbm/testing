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

export function buildPurchasePlanSuggestions({
  items = [],
  ledger = [],
  purchasePeriod = '1w',
  referenceDate = new Date(),
  manualOverrides = {},
  settings = DEFAULT_OPS_SETTINGS
}) {
  const normalizedItems = normalizeStationeryItems(items);
  const globalReport = buildStationeryReports({
    items: normalizedItems,
    ledger,
    monthKey: '',
    settings
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

  const rows = globalReport.favoriteItems.map(fav => {
    const ov = manualOverrides?.[fav.id] || {};
    const avgDaily = (fav.totalOut || 0) / observedDays;
    const periodRequirement = avgDaily > 0 ? Math.ceil(avgDaily * planWindow.periodDays) : 0;
    const minStock = periodRequirement * 2;
    const minPurchase = ov.minPurchase !== undefined && ov.minPurchase !== ''
      ? Math.max(1, Number(ov.minPurchase) || 1)
      : Math.max(1, Number(fav.min_purchase_qty) || 1);
    const decisionQty = ov.decisionQty !== undefined && ov.decisionQty !== null
      ? String(ov.decisionQty)
      : '';

    return {
      rank: fav.rank,
      id: fav.id,
      item_code: fav.item_code,
      item_name: fav.item_name,
      currentStock: fav.currentStock,
      totalGlobalOut: fav.totalOut,
      periodRequirement,
      minStock,
      unit: fav.unit,
      minPurchase,
      purchaseUnit: fav.purchase_unit,
      decisionQty
    };
  });

  return {
    window: planWindow,
    observedMonths: Math.max(1, outMonths.size),
    rows
  };
}
