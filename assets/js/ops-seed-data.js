// Deterministic demo seed data grounded in real /Project Tambahan/ workbooks

const ATK_COMPACT_121 = [
  [1, 'AMPLOP COKLAT UKURAN A3', 'PCS', 69],
  [2, 'AMPLOP PUTIH PANJANG PAPERLINE NO 90', 'PACK', 3],
  [3, 'AMPLOP PUTIH POLOS MERK PAPERLINE NO 104', 'PACK', 3],
  [4, 'BANTALAN STAMPLE KECIL NO. 0', 'PCS', 2],
  [5, 'BANTALAN STAMPLE KECIL NO. 00', 'PCS', 2],
  [6, 'BANTALAN STAMPLE KECIL NO. 1', 'PCS', 3],
  [7, 'BINDER CLIP 105', 'PACK', 7],
  [8, 'BINDER CLIP 107', 'PACK', 4],
  [9, 'BINDER CLIP 111', 'PACK', 3],
  [10, 'BINDER CLIP 155', 'PACK', 2], // Excel had -1 because opening 2 < out 3 without IN; seeded cleanly at 2 prior to blocked out-of-stock test
  [11, 'BINDER CLIP 200', 'PACK', 2],
  [12, 'BINDER CLIP 260', 'PACK', 3],
  [13, 'BINDER CLIP 280', 'PACK', 4],
  [14, 'BOLPOINT BIRU', 'PCS', 16],
  [15, 'BOLPOINT DUDUK', 'PACK', 3],
  [16, 'BOLPOINT HITAM', 'PCS', 205],
  [17, 'BOLPOINT HITAM MEIYADA', 'PCS', 0],
  [18, 'BOLPOINT MERAH', 'PCS', 27],
  [19, 'BOX FILE KERANJANG', 'PCS', 2],
  [20, 'BUKU FOLIO 100', 'PCS', 0],
  [21, 'BUKU FOLIO A5 200', 'PCS', 6],
  [22, 'BUKU FOLIO F4 200', 'PCS', 5],
  [23, 'BUKU KECIL ISI 38', 'PCS', 0],
  [24, 'BUKU KECIL ISI 58', 'PCS', 10],
  [25, 'BULPOIN JOYKO HITAM GEL 0.5', 'PCS', 6],
  [26, 'BULPOINT 4 WARNA', 'PCS', 7],
  [27, 'BULPOINT JOIKO GEL BIRU', 'PCS', 2],
  [28, 'BUSINES FILE', 'PCS', 125],
  [29, 'CLIPBOARD PAPAN (PLASTIK)', 'PCS', 1],
  [30, 'CUTTER BESAR', 'PCS', 2],
  [31, 'CUTTER KECIL', 'PCS', 5],
  [32, 'DISPLAY BOOK (60 SHEET) WARNA HIJAU', 'PCS', 0],
  [33, 'DOUBLETAPE 12 MM', 'PCS', 0],
  [34, 'DOUBLETAPE 24 MM', 'PCS', 4],
  [35, 'DOUBLETAPE FOAM 24 MM', 'PCS', 3],
  [36, 'GUNTING BESAR', 'PCS', 4],
  [37, 'GUNTING SEDANG', 'PCS', 3],
  [38, 'ISI CUTTER BESAR', 'PCS', 40],
  [39, 'ISI CUTTER KECIL', 'PCS', 44],
  [40, 'ISI STAPLES BESAR MAX', 'PCS', 25],
  [41, 'ISI STAPLES KECIL MAX', 'PCS', 26],
  [42, 'ISOLASI KERTAS 24 MM', 'PCS', 1],
  [43, 'ISOLASSI BENING 12 MM', 'PCS', 5],
  [44, 'ISOLASSI BENING 24 MM', 'PCS', 2],
  [45, 'ISOLASSI BENING 48 MM', 'PCS', 1],
  [46, 'KALKULATOR', 'PCS', 0],
  [47, 'KERTAS BURAM', 'RIM', 2],
  [48, 'KERTAS HVS A3 70GRAM', 'PCS', 2],
  [49, 'KERTAS HVS A4 70GRAM', 'RIM', 4],
  [50, 'KERTAS HVS FOLIO 70GRAM', 'RIM', 48],
  [51, 'KERTAS HVS WARNA MERAH', 'RIM', 4],
  [52, 'KERTAS KARBON DAITO', 'PACK', 2],
  [53, 'KWITANSI', 'PCS', 3],
  [54, 'LEM CAIR POVINAL', 'PCS', 8],
  [55, 'LEM STICK', 'PCS', 6],
  [56, 'MAP L MIKA', 'PCS', 25],
  [57, 'MAP ZIPPER', 'PCS', 0],
  [58, 'MOUSE PAD', 'PCS', 0],
  [59, 'NOTA BESAR 60*120', 'PCS', 2],
  [60, 'NOTA KECIL 108*155', 'PCS', 1],
  [61, 'ODNER BESAR TIPIS (MERK TEKA)', 'PCS', 0],
  [62, 'ODNER BESAR UK.101 (MERK TEKA)', 'PCS', 3],
  [63, 'ODNER KECIL  (MERK TEKA)', 'PCS', 0],
  [64, 'PAPER CLIP NO 5', 'PACK', 4],
  [65, 'PENGGARIS BESI 30 CM', 'PCS', 4],
  [66, 'PENGGARIS PLASTIK 20 CM', 'PCS', 1],
  [67, 'PENGGARIS PLASTIK 30 CM', 'PCS', 3],
  [68, 'PENGHAPUS PENSIL', 'PCS', 15],
  [69, 'PENGHAPUS PAPAN', 'PCS', 4],
  [70, 'PENSIL KAYU 2B', 'PCS', 13],
  [71, 'PENSIL MEKANIK 0.5 MM STADLER', 'PCS', 3],
  [72, 'PENSIL MEKANIK 2 MM STADLER', 'PCS', 5],
  [73, 'PLONG KERTAS BESAR', 'PCS', 0],
  [74, 'PLONG KERTAS KECIL', 'PCS', 1],
  [75, 'RAUTAN PENSIL', 'PCS', 37],
  [76, 'REFIL PENSIL MEKANIK 2 MM STADLER', 'PACK', 3],
  [77, 'REFIL SPIDOL PERMANENT  MERAH', 'PCS', 31],
  [78, 'REFIL SPIDOL PERMANENT BIRU', 'PCS', 0],
  [79, 'REFIL SPIDOL PERMANENT HITAM', 'PCS', 24],
  [80, 'REFIL SPIDOL WHITEBOARD BIRU', 'PCS', 0],
  [81, 'REFIL SPIDOL WHITEBOARD HITAM', 'PCS', 28],
  [82, 'REFIL SPIDOL WHITEBOARD MERAH', 'PCS', 23],
  [83, 'REFIL STAMPLE BIRU', 'PCS', 5],
  [84, 'REFIL STAMPLE HITAM', 'PCS', 0],
  [85, 'REFIL STAMPLE MERAH', 'PCS', 0],
  [86, 'REFIL STAMPLE UNGU', 'PCS', 0],
  [87, 'REFIL PENSIL MEKANIK 0.5 MM STADLER', 'PCS', 2],
  [88, 'SHEET PROTECTOR F4', 'PCS', 29],
  [89, 'SPIDOL KECIL BIRU', 'PCS', 0],
  [90, 'SPIDOL KECIL HITAM', 'PCS', 16],
  [91, 'SPIDOL KECIL MERAH', 'PCS', 12],
  [92, 'SPIDOL PERMANENT  MERAH', 'PCS', 33],
  [93, 'SPIDOL PERMANENT BIRU', 'PCS', 0],
  [94, 'SPIDOL PERMANENT HITAM', 'PCS', 29],
  [95, 'SPIDOL PERMANENT HITAM UK 500', 'PCS', 0],
  [96, 'SPIDOL PUTIH SNOWMAN', 'PCS', 9],
  [97, 'SPIDOL WHITEBOARD BIRU', 'PCS', 0],
  [98, 'SPIDOL WHITEBOARD HITAM', 'PCS', 32],
  [99, 'SPIDOL WHITEBOARD MERAH', 'PCS', 43],
  [100, 'STABILLO BIRU MUDA', 'PCS', 3],
  [101, 'STABILLO HIJAU', 'PCS', 4],
  [102, 'STABILLO KUNING', 'PCS', 4],
  [103, 'STABILLO MERAH MUDA', 'PCS', 3],
  [104, 'STAMPEL TANGGAL', 'PCS', 0],
  [105, 'STAPLES BESAR', 'PCS', 5],
  [106, 'STAPLES KECIL', 'PCS', 2],
  [107, 'STEMPEL ANGKA 7 DIGIT', 'PCS', 1],
  [108, 'STICK NOTE JARI', 'PCS', 3],
  [109, 'STICK NOTE SEDANG', 'PCS', 0],
  [110, 'STICK NOTE BESAR', 'PCS', 0],
  [111, 'STOFMAP FOLIO', 'PCS', 15],
  [112, 'TEMPAT PENSIL BESI BULAT', 'PCS', 0],
  [113, 'TIPEX CAIR', 'PCS', 2],
  [114, 'TIPEX ROLL', 'PACK', 9],
  [115, 'PAPER CLIP NO 1', 'PACK', 4],
  [116, 'PAPER CLIP NO 3', 'PACK', 8],
  [117, 'BUFALLO', 'RIM', 5],
  [118, 'STICK NOTE 76X102', 'PCS', 1],
  [119, 'STICK NOTE 76X127', 'PCS', 1],
  [120, 'STICK NOTE 76X51', 'PCS', 2],
  [121, 'STICK NOTE 76X76', 'PCS', 4]
];

export const SEED_STATIONERY_ITEMS = ATK_COMPACT_121.map(([no, item_name, unit, current_stock]) => ({
  id: `atk-${String(no).padStart(3, '0')}`,
  item_code: `ATK-${String(no).padStart(3, '0')}`,
  item_name,
  unit,
  opening_stock: current_stock,
  current_stock,
  min_stock: ['BOLPOINT HITAM', 'KERTAS HVS FOLIO 70GRAM', 'SPIDOL WHITEBOARD HITAM'].includes(item_name) ? 10 : 2,
  is_active: true
}));

export const SEED_STATIONERY_MOVEMENTS = [
  { id: 'mv-01', tx_date: '2026-11-02', tx_type: 'IN', item_id: 'atk-016', item_code: 'ATK-016', item_name: 'BOLPOINT HITAM', qty: 60, unit: 'PCS', sloc_raw: 'HR GA', sloc_canonical: 'HR GA', reference_no: 'PO-2611-01', notes: 'Stok bulanan November', created_by: 'ADMIN', created_at: '2026-11-02T08:00:00Z' },
  { id: 'mv-02', tx_date: '2026-11-03', tx_type: 'OUT', item_id: 'atk-016', item_code: 'ATK-016', item_name: 'BOLPOINT HITAM', qty: 24, unit: 'PCS', sloc_raw: 'PPC INDOOR', sloc_canonical: 'PPC INDOOR', reference_no: 'REQ-01', notes: 'Permintaan PPC Indoor', created_by: 'ADMIN', created_at: '2026-11-03T09:10:00Z' },
  { id: 'mv-03', tx_date: '2026-11-05', tx_type: 'OUT', item_id: 'atk-016', item_code: 'ATK-016', item_name: 'BOLPOINT HITAM', qty: 18, unit: 'PCS', sloc_raw: 'GUDANG', sloc_canonical: 'INVENTORY & GUDANG', reference_no: 'REQ-02', notes: 'Alias GUDANG dipetakan ke INVENTORY & GUDANG', created_by: 'ADMIN', created_at: '2026-11-05T10:15:00Z' },
  { id: 'mv-04', tx_date: '2026-11-08', tx_type: 'OUT', item_id: 'atk-050', item_code: 'ATK-050', item_name: 'KERTAS HVS FOLIO 70GRAM', qty: 12, unit: 'RIM', sloc_raw: 'MARKETING', sloc_canonical: 'MARKETING SERVICE', reference_no: 'REQ-03', notes: 'Alias MARKETING dipetakan ke MARKETING SERVICE', created_by: 'ADMIN', created_at: '2026-11-08T11:20:00Z' },
  { id: 'mv-05', tx_date: '2026-11-10', tx_type: 'OUT', item_id: 'atk-098', item_code: 'ATK-098', item_name: 'SPIDOL WHITEBOARD HITAM', qty: 8, unit: 'PCS', sloc_raw: 'PRODUKSI INDOOR', sloc_canonical: 'PRODUKSI INDOOR', reference_no: 'REQ-04', notes: 'Papan monitoring line', created_by: 'ADMIN', created_at: '2026-11-10T13:40:00Z' },
  { id: 'mv-06', tx_date: '2026-11-12', tx_type: 'OUT', item_id: 'atk-050', item_code: 'ATK-050', item_name: 'KERTAS HVS FOLIO 70GRAM', qty: 5, unit: 'RIM', sloc_raw: 'RADIN', sloc_canonical: 'RADIN MITRA LESTARI', reference_no: 'REQ-05', notes: 'Operasional Radin', created_by: 'ADMIN', created_at: '2026-11-12T14:05:00Z' },
  { id: 'mv-07', tx_date: '2026-11-14', tx_type: 'OUT', item_id: 'atk-038', item_code: 'ATK-038', item_name: 'ISI CUTTER BESAR', qty: 16, unit: 'PCS', sloc_raw: 'PRODUKSI OUTDOOR', sloc_canonical: 'PRODUKSI OUTDOOR', reference_no: 'REQ-06', notes: 'Kebutuhan packing', created_by: 'ADMIN', created_at: '2026-11-14T15:00:00Z' },
  { id: 'mv-08', tx_date: '2026-11-16', tx_type: 'OUT', item_id: 'atk-016', item_code: 'ATK-016', item_name: 'BOLPOINT HITAM', qty: 12, unit: 'PCS', sloc_raw: 'HR GA', sloc_canonical: 'HR GA', reference_no: 'REQ-07', notes: 'Pengambilan rutin HR GA', created_by: 'ADMIN', created_at: '2026-11-16T08:45:00Z' }
];

export const SEED_DRIVERS = [
  { id: 'drv-1', employee_no: 'KT 190403', full_name: 'ACHMAD FAUZI', department: 'HR GA', position: 'SOPIR', employment_status: 'HARIAN', company_entity: 'PT MBM', join_date: '2019-04-12', phone: '81556636256' },
  { id: 'drv-2', employee_no: 'KT 120509', full_name: 'BUDI HARTOYO', department: 'HR GA', position: 'SOPIR', employment_status: 'HARIAN', company_entity: 'PT MBM', join_date: '2013-02-04', phone: '6285536582306' },
  { id: 'drv-3', employee_no: 'KT 260401', full_name: 'M. KHUSEN', department: 'HR GA', position: 'SOPIR', employment_status: 'KONTRAK', company_entity: 'PT MBM', join_date: '2026-04-27', phone: '8892855334' },
  { id: 'drv-4', employee_no: 'KT 200303', full_name: 'MUHAMMAD FATKHAN', department: 'HR GA', position: 'SOPIR', employment_status: 'KONTRAK', company_entity: 'PT MBM', join_date: '2020-03-12', phone: '85853020834' },
  { id: 'drv-5', employee_no: 'ST 140807', full_name: 'SIKUS', department: 'HR GA', position: 'SOPIR', employment_status: 'TETAP', company_entity: 'PT MBM', join_date: '2007-08-14', phone: '6281325339928' },
  { id: 'drv-6', employee_no: 'KT 021010', full_name: 'SUGENG PURWANTO', department: 'HR GA', position: 'SOPIR', employment_status: 'HARIAN', company_entity: 'PT MBM', join_date: '2010-10-11', phone: '85852024564' },
  { id: 'drv-7', employee_no: 'KT 051164', full_name: 'SURYANTO', department: 'HR GA', position: 'SOPIR', employment_status: 'KONTRAK', company_entity: 'PT MBM', join_date: '2005-04-01', phone: '816996881' },
  { id: 'drv-8', employee_no: 'KT 190905', full_name: 'TEGUH SUSANTO', department: 'HR GA', position: 'SOPIR', employment_status: 'KONTRAK', company_entity: 'PT MBM', join_date: '2019-09-13', phone: '6283157160063' }
];

export const SEED_STAFF_SAMPLES = [
  { id: 'stf-1', employee_no: 'ST 130116', full_name: 'ABD. KHAMID', department: 'PURCHASING', position: 'MMD', employment_status: 'TETAP', company_entity: 'PT MBM', join_date: '2004-11-05', phone: '82230164498' },
  { id: 'stf-2', employee_no: 'ST 130117', full_name: 'ABDUL AJIS', department: 'QC OUTDOOR', position: 'QC INSPEKTUR FRAME OUTDOOR', employment_status: 'TETAP', company_entity: 'PT MBM', join_date: '2005-12-29', phone: '85755468848' },
  { id: 'stf-3', employee_no: 'ST 130607', full_name: 'ABDUL KHAKIM', department: 'R & D', position: 'SAMPLE MAKER OUTDOOR', employment_status: 'KONTRAK', company_entity: 'PT MBM', join_date: '2013-06-12', phone: '85755749957' },
  { id: 'stf-4', employee_no: 'ST 120115', full_name: 'SULIYANTO', department: 'PRODUKSI INDOOR', position: 'OPERATOR PRODUKSI', employment_status: 'TETAP', company_entity: 'PT MBM', join_date: '2012-01-15', phone: '81234567890' },
  { id: 'stf-5', employee_no: 'ST 170702', full_name: 'HERMANTO', department: 'HARIAN INDOOR', position: 'PRODUKSI INDOOR', employment_status: 'HARIAN', company_entity: 'PT MBM', join_date: '2017-07-02', phone: '81299887766' },
  { id: 'stf-6', employee_no: 'ST 191103', full_name: 'ELIAN PURBONEGORO', department: 'CONSTRUCTION INSTALATION', position: 'SITE SUPERVISOR', employment_status: 'TETAP', company_entity: 'PT RADIN', join_date: '2019-11-28', phone: '81355667788' },
  { id: 'stf-7', employee_no: 'ST 210202', full_name: 'NATHANIA DEVI K', department: 'MARKETING & OPERATIONANL', position: 'SALES CONSULTANT', employment_status: 'TETAP', company_entity: 'PT RADIN', join_date: '2021-02-01', phone: '81987654321' }
];

export const SEED_CALENDAR_DAYS = [
  { cal_date: '2026-11-01', day_type: 'WEEKEND', label: 'Hari Minggu', notes: '' },
  { cal_date: '2026-11-07', day_type: 'WEEKEND', label: 'Sabtu Libur / Half', notes: '' },
  { cal_date: '2026-11-08', day_type: 'WEEKEND', label: 'Hari Minggu', notes: '' },
  { cal_date: '2026-11-10', day_type: 'HOLIDAY', label: 'Hari Pahlawan (Conditional)', notes: 'Jadwal operasional khusus' },
  { cal_date: '2026-11-15', day_type: 'WEEKEND', label: 'Hari Minggu', notes: '' },
  { cal_date: '2026-11-22', day_type: 'WEEKEND', label: 'Hari Minggu', notes: '' },
  { cal_date: '2026-11-29', day_type: 'WEEKEND', label: 'Hari Minggu', notes: '' },
  { cal_date: '2026-12-25', day_type: 'HOLIDAY', label: 'Hari Raya Natal', notes: 'Libur Nasional' }
];

export const SEED_CUTI_BALANCES = [
  { id: 'cuti-1', employee_no: 'ST 130116', employee_name: 'ABD. KHAMID', pt_entity: 'MITRA', join_date: '2004-11-05', period_label: 'November 2025 - November 2026', annual_quota: 12, cuti_bersama_used: 6, diambil_dates: [], pending_dates: [], remaining_leave: 6, renewal_date: '2026-11-05', confirmation_required: false },
  { id: 'cuti-2', employee_no: 'ST 130117', employee_name: 'ABDUL AJIS', pt_entity: 'MITRA', join_date: '2005-12-29', period_label: 'Desember 2025 - Desember 2026', annual_quota: 12, cuti_bersama_used: 6, diambil_dates: ['2026-06-20', '2026-10-03'], pending_dates: [], remaining_leave: 4, renewal_date: '2026-12-30', confirmation_required: true },
  { id: 'cuti-3', employee_no: 'ST 130607', employee_name: 'ABDUL KHAKIM', pt_entity: 'MITRA', join_date: '2013-06-12', period_label: 'Juni 2026 - Juni 2027', annual_quota: 12, cuti_bersama_used: 6, diambil_dates: [], pending_dates: ['2026-11-28'], remaining_leave: 6, renewal_date: '2027-06-13', confirmation_required: false },
  { id: 'cuti-4', employee_no: 'ST 191103', employee_name: 'ELIAN PURBONEGORO', pt_entity: 'RADIN', join_date: '2019-11-28', period_label: 'November 2025 - November 2026', annual_quota: 12, cuti_bersama_used: 6, diambil_dates: ['2026-08-18'], pending_dates: [], remaining_leave: 5, renewal_date: '2026-11-28', confirmation_required: true }
];

export const SEED_ATTENDANCE_BATCHES = [
  {
    id: 'batch-demo-01',
    source_type: 'mitra_transaksi',
    filename: 'Input Utama - Laporan Transaksi.xls',
    file_hash: 'demo-sha-laporan-transaksi-202611',
    period_start: '2026-11-01',
    period_end: '2026-11-12',
    row_count: 10,
    inserted_count: 10,
    duplicate_count: 0,
    exception_count: 1,
    status: 'completed',
    created_at: '2026-11-23T08:15:00Z'
  }
];

export const SEED_ATTENDANCE_EVENTS = [
  { id: 'ev-01', batch_id: 'batch-demo-01', source_type: 'mitra_transaksi', source_priority: 1, employee_no: 'ST 120115', employee_name: 'SULIYANTO', work_date: '2026-11-02', check_in: '07:07:00', check_out: '17:01:00', source_status: 'M', raw_code: 'M', fingerprint: 'st120115|2026-11-02|07:07:00', is_exception: false },
  { id: 'ev-02', batch_id: 'batch-demo-01', source_type: 'mitra_transaksi', source_priority: 1, employee_no: 'ST 120115', employee_name: 'SULIYANTO', work_date: '2026-11-03', check_in: '06:37:00', check_out: '16:40:00', source_status: 'M', raw_code: 'M', fingerprint: 'st120115|2026-11-03|06:37:00', is_exception: false },
  { id: 'ev-03', batch_id: 'batch-demo-01', source_type: 'mitra_transaksi', source_priority: 1, employee_no: 'ST 130116', employee_name: 'ABD. KHAMID', work_date: '2026-11-02', check_in: '07:30:59', check_out: '16:32:00', source_status: 'M', raw_code: 'M', fingerprint: 'st130116|2026-11-02|07:30:59', is_exception: false },
  { id: 'ev-04', batch_id: 'batch-demo-01', source_type: 'mitra_transaksi', source_priority: 1, employee_no: 'ST 130117', employee_name: 'ABDUL AJIS', work_date: '2026-11-02', check_in: '07:31:00', check_out: '16:35:00', source_status: 'T', raw_code: 'T', fingerprint: 'st130117|2026-11-02|07:31:00', is_exception: false },
  { id: 'ev-05', batch_id: 'batch-demo-01', source_type: 'mitra_presensi', source_priority: 2, employee_no: 'ST 170702', employee_name: 'HERMANTO', work_date: '2026-11-02', check_in: '07:23:01', check_out: '17:08:26', source_status: 'M', raw_code: 'M', fingerprint: 'st170702|2026-11-02|07:23:01', is_exception: false },
  { id: 'ev-06', batch_id: 'batch-demo-01', source_type: 'mitra_transaksi', source_priority: 1, employee_no: 'KT 190403', employee_name: 'ACHMAD FAUZI', work_date: '2026-11-02', check_in: '08:12:00', check_out: '17:30:00', source_status: 'M', raw_code: 'M', fingerprint: 'kt190403|2026-11-02|08:12:00', is_exception: false },
  { id: 'ev-07', batch_id: 'batch-demo-01', source_type: 'radin_xlsx', source_priority: 3, employee_no: 'ST 191103', employee_name: 'ELIAN PURBONEGORO', work_date: '2026-11-11', check_in: '07:42:00', check_out: '16:31:00', source_status: 'H', raw_code: 'H', fingerprint: 'st191103|2026-11-11|07:42:00', is_exception: false },
  { id: 'ev-08', batch_id: 'batch-demo-01', source_type: 'radin_xlsx', source_priority: 3, employee_no: 'ST 210202', employee_name: 'NATHANIA DEVI K', work_date: '2026-11-12', check_in: '08:16:00', check_out: '', source_status: 'H', raw_code: 'H', fingerprint: 'st210202|2026-11-12|08:16:00', is_exception: false },
  { id: 'ev-09', batch_id: 'batch-demo-01', source_type: 'mitra_presensi', source_priority: 2, employee_no: '1106', employee_name: '1106 (Pin Mesin)', work_date: '2026-11-02', check_in: '08:36:42', check_out: '17:02:04', source_status: 'PERLU_PEMERIKSAAN_HR', raw_code: 'UNMAPPED', fingerprint: '1106|2026-11-02|08:36:42', is_exception: true, exception_reason: 'NIK PIN mesin "1106" belum terpetakan di Employee Directory' }
];

export const SEED_DRIVER_SCHEDULES = [
  { id: 'ds-01', work_date: '2026-11-02', employee_no: 'KT 190403', driver_name: 'ACHMAD FAUZI', section: 'Indoor', start_time: '07:00', end_time: '17:30', is_holiday: false, normal_hours: 8, overtime_hours: 2.5, vehicle_no: 'N 8142 WA', destination: 'Kirim Surabaya', notes: 'Trip 2' },
  { id: 'ds-02', work_date: '2026-11-03', employee_no: 'KT 190403', driver_name: 'ACHMAD FAUZI', section: 'Support', start_time: '07:00', end_time: '19:00', is_holiday: false, normal_hours: 8, overtime_hours: 4, vehicle_no: 'N 8142 WA', destination: 'Bongkar Gempol', notes: '' },
  { id: 'ds-03', work_date: '2026-11-02', employee_no: 'KT 120509', driver_name: 'BUDI HARTOYO', section: 'Outdoor', start_time: '06:30', end_time: '16:30', is_holiday: false, normal_hours: 8, overtime_hours: 2, vehicle_no: 'N 8821 XB', destination: 'Malang', notes: '' },
  { id: 'ds-04', work_date: '2026-11-08', employee_no: 'KT 120509', driver_name: 'BUDI HARTOYO', section: 'Radin', start_time: '08:00', end_time: '13:00', is_holiday: true, normal_hours: 0, overtime_hours: 5, vehicle_no: 'N 8821 XB', destination: 'Support Radin Minggu', notes: 'Lembur hari libur' },
  { id: 'ds-05', work_date: '2026-11-02', employee_no: 'KT 260401', driver_name: 'M. KHUSEN', section: 'Support', start_time: '07:00', end_time: '15:00', is_holiday: false, normal_hours: 8, overtime_hours: 0, vehicle_no: 'N 9011 CD', destination: 'Pasuruan Kota', notes: '' },
  { id: 'ds-06', work_date: '2026-11-03', employee_no: 'KT 200303', driver_name: 'MUHAMMAD FATKHAN', section: 'Outdoor', start_time: '07:00', end_time: '18:00', is_holiday: false, normal_hours: 8, overtime_hours: 3, vehicle_no: 'N 8220 AB', destination: 'Sidoarjo', notes: '' },
  { id: 'ds-07', work_date: '2026-11-04', employee_no: 'ST 140807', driver_name: 'SIKUS', section: 'Indoor', start_time: '07:00', end_time: '16:30', is_holiday: false, normal_hours: 8, overtime_hours: 1.5, vehicle_no: 'N 8331 EF', destination: 'Mojokerto', notes: '' }
];

export const SEED_DRIVER_ADJUSTMENTS = {
  'KT 190403': { priorShortfall: 0, bpjsDeduction: 45000, claimHours: 2 },
  'KT 120509': { priorShortfall: 50000, bpjsDeduction: 45000, claimHours: 0 },
  'KT 260401': { priorShortfall: 0, bpjsDeduction: 0, claimHours: 0 },
  'KT 200303': { priorShortfall: 0, bpjsDeduction: 45000, claimHours: 1 },
  'ST 140807': { priorShortfall: 0, bpjsDeduction: 45000, claimHours: 0 }
};

export const SEED_STAFF_REVIEWS = [
  {
    id: 'rev-demo-1',
    period_key: '2026-11',
    employee_no: 'ST 130117',
    work_date: '2026-11-02',
    final_code: 'T',
    reason: 'Finger 07:31:00 terkonfirmasi HR',
    is_confirmed: true,
    confirmed_by: 'ADMIN',
    confirmed_at: '2026-11-23T08:20:00Z'
  }
];
