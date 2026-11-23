// Pure Stationery & ATK Inventory, Alias Resolution, Non-Negative Ledger, Consumption & Purchase Plan Engine
import { DEFAULT_OPS_SETTINGS, normalizeOpsSettings } from './ops-settings-logic.js';

export function normText(v = '') {
  return String(v || '').trim().replace(/\s+/g, ' ').toUpperCase();
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

  // Prefix / fuzzy alias check on normalized tokens (fallback safely without losing raw label)
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

  const slocRaw = String(tx.sloc_raw || 'HR GA').trim();
  const slocCanonical = resolveCanonicalSloc(slocRaw, settings);
  const entry = {
    id: tx.id || `mv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tx_date: String(tx.tx_date || new Date().toISOString().slice(0, 10)).slice(0, 10),
    tx_type: txType,
    item_id: targetItem.id,
    item_code: targetItem.item_code,
    item_name: targetItem.item_name,
    qty: txType === 'ADJUSTMENT' ? delta : Math.abs(rawQty),
    unit: targetItem.unit,
    sloc_raw: slocRaw,
    sloc_canonical: slocCanonical,
    reference_no: String(tx.reference_no || '').trim(),
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

export function buildStationeryReports({
  items = [],
  ledger = [],
  monthKey = '', // optional 'YYYY-MM' filter
  settings = DEFAULT_OPS_SETTINGS
}) {
  const cfg = normalizeOpsSettings(settings).stationery;
  const activeSlocs = [...(cfg.canonicalSlocs || [])];
  const monthPrefix = String(monthKey || '').trim();

  const filteredLedger = monthPrefix
    ? ledger.filter(mv => String(mv.tx_date || '').startsWith(monthPrefix))
    : ledger;

  const deptTotals = new Map();
  activeSlocs.forEach(s => deptTotals.set(s, { sloc: s, outQty: 0, inQty: 0, freq: 0 }));

  const statsByItemId = new Map();
  items.forEach(it => {
    statsByItemId.set(it.id, {
      item: it,
      openingStock: Number(it.opening_stock ?? it.current_stock ?? 0),
      inQty: 0,
      outQty: 0,
      adjQty: 0,
      outFreq: 0,
      closingStock: Number(it.current_stock ?? 0),
      byDept: {}
    });
  });

  for (const mv of filteredLedger) {
    const st = statsByItemId.get(mv.item_id) || [...statsByItemId.values()].find(x => normText(x.item.item_name) === normText(mv.item_name));
    const sloc = resolveCanonicalSloc(mv.sloc_canonical || mv.sloc_raw || 'HR GA', settings);
    if (!deptTotals.has(sloc)) {
      deptTotals.set(sloc, { sloc, outQty: 0, inQty: 0, freq: 0 });
    }
    const dRow = deptTotals.get(sloc);

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
        st.byDept[sloc] = (st.byDept[sloc] || 0) + q;
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

    // Average daily consumption anchored to window or active month days (30 for monthly study)
    const activeDaysBasis = monthPrefix ? 30 : windowDays;
    const avgDailyOut = st.outQty / activeDaysBasis;
    const targetStock = Math.max(
      Number(st.item.min_stock || 0),
      Math.ceil(avgDailyOut * horizonDays * cfg.safetyStockMultiplier)
    );
    const suggestedPurchase = Math.max(0, Math.ceil(targetStock - st.closingStock));

    itemReports.push({
      id: st.item.id,
      item_code: st.item.item_code,
      item_name: st.item.item_name,
      unit: st.item.unit,
      openingStock: st.openingStock,
      inQty: st.inQty,
      outQty: st.outQty,
      adjQty: st.adjQty,
      closingStock: st.closingStock,
      minStock: Number(st.item.min_stock || 0),
      outFreq: st.outFreq,
      movingClass,
      score,
      targetStock,
      suggestedPurchase,
      belowMin: st.closingStock <= Number(st.item.min_stock || 0),
      byDept: st.byDept
    });
  }

  itemReports.sort((a, b) => b.score - a.score || b.outQty - a.outQty || a.item_name.localeCompare(b.item_name));
  const departmentConsumption = [...deptTotals.values()].sort((a, b) => b.outQty - a.outQty || a.sloc.localeCompare(b.sloc));
  const purchasePlan = itemReports
    .filter(r => r.suggestedPurchase > 0 || (r.outQty > 0 && r.belowMin))
    .sort((a, b) => b.suggestedPurchase - a.suggestedPurchase || b.outQty - a.outQty);

  return {
    monthKey: monthPrefix || 'ALL',
    horizonDays,
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
