# Paket Integrasi HTML Kontrak HR — Multi-Perusahaan & Anak Perusahaan

Paket ini berisi 5 templat HTML siap cetak A4 beserta *engine* renderer JavaScript tanpa dependensi (*zero-dependency*) dan daftar master perusahaan untuk ditanam langsung ke aplikasi HRIS Anda.

## Isi Paket
- `templates/01-pkwt.html` — Perjanjian Kerja Waktu Tertentu (PKWT)
- `templates/02-pb-pembayaran-upah.html` — PB Pembayaran Upah
- `templates/03-pb-pembayaran-upah-lembur.html` — PB Pembayaran Upah Lembur
- `templates/04-pb-penyelesaian-upah.html` — PB Penyelesaian Kekurangan Upah
- `templates/05-pb-penyelesaian-lembur.html` — PB Penyelesaian Kekurangan Lembur
- `hris-renderer.mjs` — Fungsi `renderAgreementHtml(templateHtml, data, companyMaster)` (otomatis mengonversi 12 bulan menjadi `1 (satu) Tahun`, menghitung tanggal selesai, nomor Romawi, selisih upah, dan *terbilang*).
- `company-masters.json` — Master data holding & anak perusahaan (nama perusahaan, kop surat, alamat, kontak, bidang usaha, dan pejabat HRD).
- `sample-payload.json` — Contoh payload JSON karyawan dari HRIS.

## Cara Pakai di HRIS Anda

```js
import fs from 'node:fs';
import { renderAgreementHtml } from './hris-renderer.mjs';

const templateHtml = fs.readFileSync('./templates/01-pkwt.html', 'utf-8');
const companies = JSON.parse(fs.readFileSync('./company-masters.json', 'utf-8'));
const employeePayload = JSON.parse(fs.readFileSync('./sample-payload.json', 'utf-8'));

// Pilih master perusahaan berdasarkan companyId dari HRIS
const company = companies.find((c) => c.id === employeePayload.companyId) || companies[0];

// Hasil HTML siap tampil di iframe, cetak window.print(), atau konversi PDF A4
const finalHtml = renderAgreementHtml(templateHtml, employeePayload, company);
```
