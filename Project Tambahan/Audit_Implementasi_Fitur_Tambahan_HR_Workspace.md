# AUDIT & SPESIFIKASI IMPLEMENTASI FITUR TAMBAHAN — HR WORKSPACE

**Versi dokumen:** 1.0  
**Tanggal audit:** 23 November 2026  
**Sumber audit:** Arsip `Project Tambahan.rar` beserta seluruh file teks, workbook `.xlsx`, dan file `.xls` di dalamnya.  
**Tujuan:** Menjadi satu dokumen kerja untuk Google AI Studio agar dapat mengaudit aplikasi HR Workspace yang sudah ada, merencanakan integrasi, lalu membangun fitur tambahan tanpa merusak modul, data, tampilan, maupun aturan yang telah berjalan.

---

## PETUNJUK MEMBACA STATUS

| Penanda | Makna | Tindakan AI Studio |
|---|---|---|
| `[WAJIB]` | Aturan dinyatakan eksplisit di dokumen sumber atau merupakan pengaman data yang diperlukan. | Implementasikan dan uji. Jangan diubah tanpa instruksi pemilik aplikasi. |
| `[FIX]` | Bagian sumber terbukti salah/rusak/tidak aman untuk dijadikan logika aplikasi. | Perbaiki pada implementasi baru; jangan menyalin kesalahan workbook lama. |
| `[KONFIGURASI]` | Aturan seharusnya dapat diatur secara terkontrol, bukan ditanam di kode. | Sediakan konfigurasi dengan hak akses dan riwayat perubahan. Nilai awal hanya boleh diisi jika dinyatakan jelas di dokumen ini. |
| `[PERLU KONFIRMASI]` | Data sumber tidak menjelaskan aturan secara memadai atau terdapat lebih dari satu interpretasi. | Jangan menebak atau mengunci kebijakan. Buat status/configuration placeholder dan daftar keputusan untuk HR/pemilik aplikasi. |
| `[JANGAN DITEBAK]` | AI Studio dilarang membuat asumsi atau menghitung nilai berdasarkan perkiraan. | Hentikan proses yang membutuhkan nilai tersebut atau tandai `Belum Dikonfigurasi`. |
| `[RISIKO DATA]` | Ada potensi salah identitas, kehilangan data, duplikasi, kebocoran, atau kesalahan perhitungan. | Terapkan validasi, audit trail, pembatasan akses, dan mekanisme pemulihan. |
| `[TEMUAN]` | Fakta yang teramati pada file/workbook saat audit. | Perlakukan sebagai bukti kondisi file contoh, bukan otomatis sebagai kebijakan. |

> **Prinsip utama:** Workbook lama adalah bukti proses dan contoh data, bukan spesifikasi kebijakan yang otomatis benar. Ambil aturan yang eksplisit. Perbaiki cacat teknis. Tandai kebijakan yang tidak jelas. Jangan mengubah kesalahan historis menjadi aturan aplikasi.

# BAGIAN 1 — INSTRUKSI UNTUK GOOGLE AI STUDIO

Bagian ini dapat diberikan kepada Google AI Studio sebagai instruksi utama bersama arsip sumber dan repository aplikasi HR Workspace.

## 1.1 Prompt utama — salin seluruh isi blok ini

```text
PERAN ANDA
Anda bertindak sebagai Senior Software Architect, Senior Full-Stack Engineer, Database Engineer, QA Engineer, dan Business Analyst untuk mengintegrasikan fitur tambahan ke aplikasi HR Workspace yang SUDAH ADA.

TARGET
Integrasikan modul tambahan berikut ke aplikasi yang sudah berjalan:
1. Attendance Upload Center / pusat data absensi.
2. Employee Directory dan data Cuti.
3. Staff Attendance Processing.
4. Drivers Attendance, Jadwal Driver, Checksheets, Payroll Output, dan BKK.
5. Stationery / ATK Inventory.

DOKUMEN SPESIFIKASI
Gunakan dokumen “AUDIT & SPESIFIKASI IMPLEMENTASI FITUR TAMBAHAN — HR WORKSPACE” sebagai spesifikasi audit utama. Periksa pula semua file di Project Tambahan.rar. Jangan hanya membaca file Keterangan.txt; workbook contoh mengandung struktur, formula, kode, dan cacat yang juga harus diperiksa.

ATURAN KERJA YANG TIDAK BOLEH DILANGGAR
1. Jangan membangun aplikasi baru dari nol. Audit dan pahami repository, UI, routing, komponen, autentikasi, role/permission, database, API, Edge Functions, storage, notifikasi, dan pola coding aplikasi yang sudah ada terlebih dahulu.
2. Jangan menghapus, mengganti nama, memindahkan, atau mengubah perilaku modul yang sudah berjalan tanpa kebutuhan yang terbukti dan tanpa instruksi eksplisit.
3. Jangan membuat tabel, kolom, RPC, Edge Function, bucket, enum, atau nama role baru sebelum memeriksa struktur Supabase dan pola yang sudah ada. Bila perlu perubahan, buat usulan perubahan yang kompatibel dan migration yang aman.
4. Jangan membuat salinan master karyawan baru jika aplikasi sudah memiliki master karyawan. Identifikasi master karyawan yang benar dan gunakan relasi/ID internal yang sudah berlaku.
5. Jangan menganggap file Data_Karyawan_2026-11-23.xlsx boleh menggantikan seluruh master karyawan production. Bandingkan dengan database aktual, identifikasi penambahan/perubahan/ketidaksesuaian, lalu minta persetujuan untuk operasi massal.
6. Jangan menaruh data absensi, hasil perhitungan, saldo stok, status persetujuan, atau transaksi bisnis utama hanya di localStorage/sessionStorage. Database aplikasi adalah sumber kebenaran; cache hanya untuk mempercepat tampilan.
7. Jangan menampilkan atau menyalin data pribadi sensitif (alamat, tanggal lahir, nomor identitas pribadi, agama, jenis kelamin, nomor telepon) ke modul yang tidak membutuhkannya. Terapkan least privilege, masking, dan RLS/permission server-side.
8. Jangan mengirim data pribadi atau data payroll ke console log, error tracker publik, prompt AI eksternal, maupun file hasil debug yang tidak diperlukan.
9. Jangan menyalin formula Excel yang error, formula external-link, VLOOKUP approximate-match, atau hasil perhitungan yang tidak dapat diverifikasi. Implementasikan ulang aturan bisnis yang tervalidasi sebagai logika aplikasi/database yang dapat diuji.
10. Jangan menghapus histori upload, absensi, jadwal, approval, transaksi ATK, atau hasil yang sudah disimpan hanya karena ada file upload baru. Gunakan mekanisme append, deduplication, reconciliation, correction/reversal, dan versioning.
11. Semua operasi penting harus memiliki audit trail: aktor, waktu, objek, tindakan, nilai sebelum/sesudah jika relevan, alasan, sumber data, dan referensi batch.
12. Jangan mengarang kebijakan yang diberi status [PERLU KONFIRMASI] atau [JANGAN DITEBAK]. Buat konfigurasi/status “Belum Dikonfigurasi”, tampilkan peringatan yang dapat dipahami HR, dan jangan menghasilkan nominal/hasil final jika rumus wajib belum disetujui.
13. Jangan mengubah desain UI global. Ikuti design system, layout, bahasa, pola navigasi, responsivitas, dan komponen yang sudah dipakai aplikasi. Tambahkan modul dengan tampilan konsisten, bukan membuat aplikasi terasa seperti produk terpisah.
14. Pertahankan fungsi yang sudah ada. Perubahan harus minimal, terisolasi, backward-compatible, dan disertai catatan file/komponen/database yang berubah.
15. Jangan langsung deploy ke production atau menjalankan import data massal. Gunakan staging/development, preview, migration review, dan acceptance test terlebih dahulu.

TAHAP 0 — AUDIT APLIKASI SEBELUM CODING
Sebelum menulis kode:
A. Petakan arsitektur frontend/backend dan cara komunikasi dengan Supabase.
B. Petakan seluruh route/menu, komponen layout, design tokens, auth/session, role/permission, RLS, tabel terkait, RPC, Edge Functions, storage bucket, audit log, dan pola notifikasi.
C. Temukan modul yang sudah mempunyai fungsi serupa. Reuse, jangan duplikasi.
D. Petakan master karyawan dan identifier permanen yang dipakai aplikasi. Jangan memakai nama sebagai foreign key.
E. Petakan struktur kalender, hari libur, shift/jam kerja, cuti, approval, cabang, departemen, dan status karyawan yang sudah ada.
F. Buat matriks dampak: file/komponen/tabel/function lama yang akan disentuh, alasan perubahan, risiko, dan cara rollback.
G. Laporkan temuan dan gap antara sistem eksisting dengan kebutuhan dokumen ini.
H. Jangan lanjut ke implementasi data atau migration destruktif sebelum hasil audit dan rencana perubahan tersedia.

TAHAP 1 — DESAIN INTEGRASI
Buat rancangan yang memanfaatkan struktur eksisting. Secara konseptual sistem membutuhkan:
- Batch/riwayat import file dan metadata sumber.
- Raw source record atau salinan sumber yang dapat ditelusuri.
- Normalized attendance event.
- Employee identity mapping / exception queue.
- Periodic processing run dan status pemrosesan.
- Saved staff attendance result beserta alasan/konfirmasi manual.
- Driver daily schedule/assignment, checksheet, dan output payroll yang hanya aktif jika aturan payroll telah dikonfirmasi.
- Stationery item master, unit, location/department mapping, stock ledger, dan stock adjustment yang disetujui.
Nama tabel/kolom aktual harus mengikuti konvensi aplikasi setelah audit; daftar konseptual ini BUKAN perintah membuat nama tabel persis.

TAHAP 2 — IMPLEMENTASI BERTAHAP
Implementasikan dalam urutan:
1. Shared foundation: employee identity mapping, role/permission, audit trail, date/time standard, import batch, validation/exception queue.
2. Attendance Upload Center dan parser per sumber.
3. Employee Directory/Cuti integration.
4. Staff Attendance Processing.
5. Drivers Schedule/Attendance Processing. Pisahkan perhitungan kehadiran dari payroll rate/policy.
6. Stationery Inventory.
7. Output PDF/XLSX, laporan, approval, dan notifikasi setelah data serta perhitungan tervalidasi.

TAHAP 3 — IMPORT DAN DATA SAFETY
- Setiap upload harus memiliki ID batch, nama file, jenis sumber, periode tanggal, pengunggah, waktu upload, file hash, status validasi, jumlah baris, jumlah diterima, jumlah duplikat, jumlah ditolak, dan daftar exception.
- Upload file yang sama dua kali tidak boleh menggandakan event/transaksi.
- Upload periode yang tumpang tindih harus melakukan deduplication berbasis identitas kejadian, bukan menghapus data lama.
- Simpan jejak sumber agar event yang sudah dinormalisasi dapat ditelusuri ke file, sheet, dan nomor baris asal bila tersedia.
- Data yang ambigu masuk exception queue dan tidak dipaksakan terhubung ke karyawan hanya berdasarkan kemiripan nama.
- Perubahan/correction harus direkam sebagai koreksi, pembatalan dengan alasan, atau versi baru; jangan menghilangkan histori.
- File import dan data mentah memiliki retention/access policy yang sesuai; jangan menyimpan salinan file pribadi tanpa alasan dan izin.

TAHAP 4 — LOGIKA KHUSUS
A. STAFF
- Periode laporan adalah tanggal 6 bulan sebelumnya sampai tanggal 5 bulan berjalan, inklusif. Gunakan timezone Asia/Jakarta.
- Ambang terlambat dari sumber: jam mulai 07:30; 07:30:59 masih tepat waktu; terlambat mulai 07:31:00. Aturan ini hanya untuk Staff, tidak untuk Driver.
- Simpan hasil olahan dan status review. Upload tambahan tidak boleh menghapus alasan, status review, atau hasil yang sudah dikonfirmasi.
- Ketidakhadiran yang belum dapat dijelaskan harus tampil sebagai “Perlu Pemeriksaan HR”, bukan otomatis Alpa.
- Cuti yang sudah diajukan tidak boleh otomatis menjadi cuti final jika status approval/ketentuan penggunaannya belum diketahui. Buat indikator kandidat cuti dan minta konfirmasi sesuai workflow aplikasi yang ditemukan.
- Kode status lama yang belum terdefinisi harus ditandai; jangan ditebak.

B. DRIVERS
- Input absensi dibaca dari Attendance Upload Center.
- Admin mengisi jadwal driver harian dan kategori bantuan/tim: Support, Indoor, Outdoor, Radin, Lainnya.
- Jadwal yang disimpan menjadi salah satu sumber untuk membentuk Time Checksheet dan laporan.
- Output yang diminta: Time Checksheet per driver, laporan per bagian Support/Indoor/Outdoor/Radin dan summary, slip gaji, serta Bukti Kas Keluar (BKK).
- Jangan menghitung gaji/lembur/BPJS/potongan/fee secara final sebelum tarif dan aturan yang belum dijelaskan dikonfirmasi. Boleh bangun kerangka output dengan status “Belum Siap Hitung”.
- Kode S/R/I dalam checksheet harus memiliki codebook yang disetujui sebelum ditafsirkan.

C. STATIONERY
- Kelola master barang, satuan, Barang Masuk, Barang Keluar, stok per lokasi/SLOC, dan laporan.
- Barang dipilih dari master item; satuan otomatis dari master dan tidak boleh bergantung pada approximate lookup.
- Saldo stok tidak boleh minus. Tolak transaksi keluar yang melebihi saldo tersedia, kecuali ada mekanisme stock adjustment yang disetujui dan dicatat terpisah.
- Perbaiki alias departemen melalui mapping terkontrol; jangan mengganti histori secara destruktif.
- Bedakan lokasi penyimpanan fisik (SLOC) dari departemen pemakai/cost center setelah arti kolom sumber dikonfirmasi.
- Jangan mengimplementasikan “skor fav/scoring” sebelum rumus, bobot, dan kegunaannya dijelaskan.

TAHAP 5 — QA WAJIB
Buat automated tests dan manual acceptance tests minimal untuk:
- Upload file identik dua kali, file periode overlap, file dengan baris invalid, dan perbedaan parser sumber.
- NIK tidak ditemukan, NIK ganda, nama mirip, karyawan nonaktif, karyawan baru, dan perubahan master.
- Batas waktu Staff: 07:30:00, 07:30:59, 07:31:00; pastikan Driver tidak terkena flag T otomatis.
- Periode Staff lintas bulan dan tahun, termasuk tanggal 5/6.
- Hasil Staff tersimpan tetap utuh setelah upload tambahan.
- Pengajuan cuti pending vs approved dan cuti yang tidak cocok dengan tanggal absen.
- Driver tanpa jadwal, jadwal ganda, perubahan jadwal, kategori Lainnya, dan driver yang belum ada di master.
- Payroll tanpa konfigurasi tarif tidak boleh mengeluarkan nominal gaji final.
- Stationery stok cukup, stok tepat nol, stok kurang, unit berbeda, item tidak ada di master, koreksi transaksi, dan stock adjustment.
- RLS/role access untuk setiap operasi dan setiap output.
- PDF/XLSX konsisten dengan data yang terlihat di halaman.

TAHAP 6 — DELIVERABLE SEBELUM SELESAI
Sampaikan:
1. Audit repository dan database eksisting.
2. Rencana implementasi dan migration yang akan dilakukan.
3. Daftar seluruh file yang akan diubah/ditambah beserta alasannya.
4. Daftar keputusan yang masih menunggu konfirmasi.
5. Implementasi per tahap, bukan perubahan besar yang sulit ditinjau.
6. Hasil test, screenshot/preview UI, hasil validasi import contoh, dan bukti bahwa fitur lama tidak rusak.
7. Dokumentasi cara kerja untuk HR/Admin dan rollback plan.

FORMAT LAPORAN SETIAP TAHAP
- Perubahan yang dilakukan.
- File/komponen/tabel/function yang disentuh.
- Aturan bisnis yang diterapkan.
- Aturan yang belum aktif karena perlu konfirmasi.
- Risiko dan mitigasi.
- Test yang dijalankan dan hasilnya.
- Dampak terhadap modul eksisting.
- Cara rollback.

MULAI SEKARANG DARI TAHAP 0. JANGAN LANGSUNG CODING. Laporkan hasil audit aplikasi eksisting dan matriks dampak terlebih dahulu. Setelah itu rancang integrasi mengikuti spesifikasi ini.
```

## 1.2 Instruksi tambahan saat memberikan file ke AI Studio

1. Berikan **repository HR Workspace yang benar-benar sedang dipakai**, bukan hanya file arsip fitur tambahan. AI Studio tidak dapat memastikan kompatibilitas tanpa melihat kode, konfigurasi, dan pola database aktual.
2. Berikan dokumen ini beserta seluruh folder `Project Tambahan` agar AI Studio dapat membuka workbook sumber, bukan sekadar membaca ringkasan.
3. Jangan berikan `service_role` key, password database, token pribadi, atau secret ke prompt/chat, file frontend, atau repository. Gunakan secret manager/environment server-side yang sudah dipakai proyek.
4. Untuk contoh data, gunakan staging atau salinan yang sudah dimasking. Workbook Employee Directory mengandung data pribadi; jangan menampilkan seluruh kolom PII ke UI atau log.
5. Minta AI Studio mengerjakan satu tahap dan satu kelompok perubahan pada satu waktu. Review diff dan migration sebelum tahap berikutnya.
6. Jika AI Studio menemukan perbedaan antara dokumen ini dan sistem yang berjalan, sistem aktual harus diaudit dahulu. Jangan otomatis mengubah salah satunya; laporkan konflik dan dampaknya.

## 1.3 Batasan yang wajib diakui AI Studio

- Arsip ini menjelaskan proses dan menyediakan contoh file, tetapi **tidak menyertakan source code/repository HR Workspace**. Kompatibilitas aplikasi belum dapat dinyatakan lulus sebelum repository dan database aktual diperiksa.
- Tidak semua kebijakan payroll Driver, cuti, kode absensi, dan stock location dijelaskan. Bagian tersebut tidak boleh diaktifkan sebagai perhitungan final sampai ada keputusan pemilik proses.
- Workbook mengandung formula rusak, external links, data historis yang tidak sempurna, dan kemungkinan salah input. Output Excel lama bukan golden result untuk seluruh skenario.

---

# BAGIAN 2 — LAPORAN AUDIT

## 2.1 Ringkasan eksekutif

Arsip memiliki lima kelompok kerja yang saling terhubung:

1. **Attendance Upload Center** — menerima beberapa format data kehadiran Mitra dan Radin serta menjadi sumber bersama untuk Staff dan Drivers.
2. **Employee Directory & Cuti** — menyediakan referensi identitas karyawan dan ringkasan hak/riwayat cuti.
3. **Staff Attendance** — mengolah absensi dalam periode tanggal 6 sampai tanggal 5, dengan pemeriksaan manual HR dan penyimpanan hasil review.
4. **Drivers** — jadwal harian, pembentukan checksheet, rekap per bagian, summary, slip gaji, dan BKK.
5. **Stationery** — pencatatan barang masuk/keluar, stok, dan laporan per departemen/SLOC.

**Kesimpulan:** kebutuhan bisnis dasarnya dapat dibangun, tetapi tidak aman untuk menyalin formula Excel secara langsung. Bagian paling siap untuk ditetapkan adalah struktur upload bertahap, penyimpanan hasil Staff, ambang keterlambatan Staff, master referensi karyawan, jadwal harian Driver, dan larangan stok minus. Bagian yang belum siap menjadi aturan final adalah rumus payroll Driver, codebook checksheet, sebagian kode Staff, kebijakan cuti, definisi SLOC, alias departemen, serta scoring Stationery.

## 2.2 Inventaris sumber yang diperiksa

| Kelompok | File utama | Cakupan |
|---|---|---|
| Drivers | `DRIVERS/Input/Input.txt`, `Output/Output.txt`, `Process/Keterangan.txt` | Sumber data, jadwal manual, output checksheet/laporan/payroll/BKK |
| Driver workbook | `Gaji Driver November 1 2026 (1).xlsx` | Sheet jadwal, checksheet, summary, detail bagian, slip gaji, BKK |
| Driver legacy | `SALARY DRIVER FORMAT BARU 16 - 31 MEI 2022 ... .xls` | Format payroll lama; file dikenali tetapi rumus BIFF legacy tidak dipakai sebagai aturan final |
| Staff | `STAFF/Input/Input.txt`, `Output/Output.txt`, `Process/Keterangan.txt` | Periode, pengolahan bertahap, pemeriksaan ketidakhadiran, ambang terlambat |
| Staff workbook | `November 26.xlsx` | Contoh data finger, kode absensi, rekap, output per periode |
| Upload absensi | `Upload Absensi/Keterangan.txt` | Upload harian/periode, sumber utama dan opsional |
| Upload sumber Mitra | `Input Utama - Laporan Transaksi.xls` | Event transaksi masuk/keluar perangkat absensi |
| Upload opsional Mitra | `Input Pendukung Opsional - Data Presensi.xls` | Data presensi fingerprint alternatif |
| Upload Radin | `Input Utama - Karyawan Radin PRESENSI ...xlsx` | Data presensi Radin dalam format tabel |
| Employee Directory | `Data_Karyawan_2026-11-23.xlsx`, `Cuti.xlsx`, `Keterangan.txt` | Master karyawan dan snapshot cuti |
| Stationery | `Stationery/Input/Input.txt`, `Process/Process.txt`, `ATK.xlsx` | Input manual, master barang/departemen, kartu/rekap stok |

## 2.3 Temuan kritis lintas fitur

### A. Identitas karyawan dan master data

- `[WAJIB]` `Data_Karyawan_2026-11-23.xlsx` berisi 175 data karyawan pada sheet `Data Karyawan`.
- `[WAJIB]` Tidak ditemukan duplikasi nama atau NIK setelah normalisasi dasar pada 175 baris yang diperiksa.
- `[WAJIB]` Dokumen Employee Directory menyatakan data tersebut sebagai patokan nama/NIK dan koreksi referensi yang salah di file lain.
- `[RISIKO DATA]` Workbook juga memuat alamat, tanggal lahir, nomor telepon, jenis kelamin, agama, dan kolom identitas lain. Kolom-kolom ini tidak perlu disalin ke modul absensi/payroll/ATK jika tidak ada kebutuhan bisnis dan otorisasi.
- `[FIX]` Semua modul harus menghubungkan transaksi ke internal employee ID/UUID milik aplikasi. NIK dinormalisasi untuk pencocokan dan ditampilkan sebagai referensi; nama tidak boleh dijadikan foreign key.
- `[RISIKO DATA]` File karyawan merupakan snapshot tanggal 23 November 2026, bukan jaminan selalu lebih baru daripada master aplikasi. Lakukan compare-and-review sebelum sinkronisasi. Jangan melakukan replace-all.

### B. Normalisasi tanggal/waktu

- `[FIX]` Sumber tanggal memakai campuran serial Excel dan teks. Konversi semua tanggal ke format database yang baku (date/timestamp), simpan timezone `Asia/Jakarta` untuk waktu absensi, dan simpan nilai sumber mentah untuk audit.
- `[RISIKO DATA]` Jangan mengandalkan locale browser/Excel untuk menebak `DD/MM/YYYY` atau `MM/DD/YYYY`. Parsing harus menggunakan format khusus per sumber dan menolak nilai ambigu yang tidak dapat dipastikan.
- `[WAJIB]` Setiap periode absensi harus memakai batas inklusif dan tanggal kalender yang eksplisit.

### C. Impor data

- `[WAJIB]` Upload absensi boleh dilakukan harian atau per periode.
- `[WAJIB]` Modul Staff dan Drivers membaca/copy dari state terakhir Upload Center; kedua modul tersebut tidak boleh menghapus database sumber Upload Center.
- `[FIX]` Terapkan batch import yang idempotent. Upload file identik atau periode yang tumpang tindih tidak boleh menggandakan punch/event.
- `[FIX]` Data baru harus menambah/memperbarui hasil melalui reconciliation yang dapat dilacak, bukan reset proses dari awal.
- `[RISIKO DATA]` Dua sumber bisa melaporkan event berbeda untuk karyawan/tanggal yang sama. Source precedence, konflik jam, dan aturan koreksi belum sepenuhnya dijelaskan; konflik harus masuk exception queue, bukan dipilih diam-diam.

## 2.4 Audit Employee Directory dan Cuti

### Data Karyawan

| Pemeriksaan | Hasil |
|---|---|
| Sheet | `Data Karyawan` |
| Jumlah karyawan | 175 baris data |
| Rentang baris | 2–176 (header di baris 1; beberapa baris akhir/metadata tidak dihitung sebagai karyawan) |
| Duplikasi NIK | Tidak ditemukan setelah normalisasi dasar |
| Duplikasi nama | Tidak ditemukan setelah normalisasi dasar |
| Timestamp export | 23/11/2026 09:38:29 |

**Tindakan:** `[WAJIB]` gunakan sebagai referensi pencocokan; `[PERLU KONFIRMASI]` tentukan apakah snapshot tersebut hanya untuk validasi atau akan diimpor sebagai delta ke master aplikasi. Pastikan status aktif/nonaktif dan perubahan NIK mengikuti workflow master yang sudah ada.

### Cuti.xlsx

- Terdapat 130 baris data karyawan.
- Seluruh 130 nama cocok dengan nama pada Employee Directory setelah normalisasi nama saat audit.
- Data menggunakan nama sebagai penghubung dan tidak menyertakan NIK pada tabel cuti.
- Nilai `Sisa Cuti` yang diperiksa cocok dengan `Cuti Bisa` dikurangi jumlah tanggal terisi pada kolom `CT1` sampai `CT6`.
- Terdapat `#REF!` pada kolom nomor di baris 121–124; nomor tersebut bukan data yang boleh diimpor.
- Format tanggal campuran: tanggal masuk terdiri dari 73 serial Excel dan 57 teks; tanggal cuti terdiri dari 98 serial dan 153 teks; tanggal terbit cuti baru terdiri dari 69 serial dan 61 teks.

**Temuan/perbaikan:**

1. `[FIX]` Jangan memakai nama sebagai key permanen. Mapping saat import harus diarahkan ke employee ID/NIK, dan semua baris yang tidak memiliki kecocokan pasti masuk exception queue.
2. `[FIX]` Buang error formula `#REF!` dari proses import; jangan mengimpor string error sebagai nomor urut.
3. `[FIX]` Normalisasikan tanggal secara eksplisit per kolom/sumber dan simpan raw value untuk audit.
4. `[PERLU KONFIRMASI]` Arti `Jml Cuti`, `Cuti Bersama`, `Cuti Bisa`, dan hubungan antara hak cuti dengan periode `P/Q` belum dijelaskan.
5. `[PERLU KONFIRMASI]` Belum ada aturan accrual, tanggal hak cuti timbul, pembulatan, carry-over, cuti setengah hari, hari libur/weekend, cuti di luar hak, dan apa yang terjadi jika jumlah hari cuti lebih dari enam kolom `CT1–CT6`.
6. `[JANGAN DITEBAK]` Jangan menganggap angka 6 sebagai hak cuti universal, jangan menghitung ulang entitlement, dan jangan menetapkan periode P/Q tanpa definisi.
7. `[WAJIB]` Angka saldo dari workbook dapat disimpan sebagai snapshot saldo historis yang perlu direkonsiliasi, bukan otomatis dijadikan policy engine.

## 2.5 Audit Attendance Upload Center

### Ragam sumber

**Sumber utama Mitra — `Laporan Transaksi.xls`**
- Header yang teridentifikasi: `No. ID`, `Nama`, `Waktu`, `Status`, `Status baru`, `Pengecualian`, `Operasi`.
- Contoh event memiliki waktu, identitas karyawan, dan jenis kejadian `C/Masuk`/`C/Keluar`.
- Bentuknya event log; parser perlu memisahkan event masuk dan keluar.

**Sumber opsional Mitra — `Data Presensi.xls`**
- Header yang teridentifikasi: `Departemen`, `Nama`, `No.ID`, `Tgl/Waktu`, `Lokasi ID`, `No.PIN`, `Kode Verifikasi`, `No.Kartu`.
- Memiliki metode verifikasi seperti `FP`, `PW`, `RF`, `FACE` pada sampel.
- Struktur berbeda dari `Laporan Transaksi`; wajib memakai parser/adaptor tersendiri.

**Sumber Radin — file XLSX `Export Attendance`**
- 63 baris data termasuk header, 23 kolom.
- Kolom meliputi `Employee ID`, `Date`, `Full Name`, `Attendance Code`, `Check In`, `Check Out`, overtime in/out, overtime before/after, overtime break, time-off fields, branch, organization, job position/level, employment status, join date, dan lock status.

**Risiko dan perbaikan:**

- `[WAJIB]` Buat parser berbeda untuk setiap format, dengan version/format detection dan schema mapping yang tervalidasi.
- `[FIX]` Jangan menganggap `Status`, `Status baru`, `Pengecualian`, `Operasi`, `Attendance Code`, atau `Time Off Code` mempunyai arti sama antar-sumber.
- `[PERLU KONFIRMASI]` Tentukan prioritas ketika `Laporan Transaksi` dan `Data Presensi` berisi punch berbeda untuk karyawan/waktu yang sama.
- `[FIX]` Simpan waktu asli, timezone, metode verifikasi, file/batch sumber, dan raw status jika tersedia.
- `[PERLU KONFIRMASI]` Makna kode `H` pada Radin tidak dijelaskan. Jangan menganggapnya sebagai Hadir sebelum codebook disahkan.
- `[RISIKO DATA]` Data absensi yang tidak bisa dipetakan ke karyawan jangan dibuang atau dipasangkan berdasarkan kemiripan nama. Tampilkan sebagai unmatched record.

## 2.6 Audit Staff Attendance

### Aturan yang dapat ditetapkan

- `[WAJIB]` Periode laporan: tanggal 6 bulan sebelumnya sampai tanggal 5 bulan berjalan, inklusif.
- `[WAJIB]` Timezone: `Asia/Jakarta` untuk menentukan tanggal dan waktu lokal.
- `[WAJIB]` Jam masuk referensi pada instruksi: 07:30.
- `[WAJIB]` 07:30:59 masih tepat waktu. Maka flag keterlambatan berbasis timestamp dimulai pada 07:31:00 (jika data presisi detik tersedia).
- `[WAJIB]` Aturan keterlambatan tersebut tidak berlaku untuk Driver.
- `[WAJIB]` Admin memeriksa karyawan yang tidak memiliki catatan masuk dan memeriksa dokumen/alasan.
- `[WAJIB]` Upload harian/dua harian/periode tambahan tidak boleh memulai ulang pekerjaan HR dari nol.
- `[WAJIB]` Ketika hasil telah disimpan, alasan dan status yang telah dikonfirmasi harus tetap ada ketika sumber upload bertambah.

### Temuan workbook Staff

- Contoh workbook memiliki beberapa sheet periode, termasuk `06 Nov -05 Des 2026 STAFF`, `06 Nov -05 Des 2026 HARIAN`, dan `06 Nov -05 Des 2026 RADIN`.
- Terdapat sheet `Nov`, `Agt`, `ABSENSI LIBUR`, `Inspira`, data finger Mitra/Radin, dan beberapa sheet historis.
- Kode yang terlihat pada sheet `Nov`: `CT`, `PA`, `T`, `ITB`, `DS`, `A`, `L`, `CI`.
- Definisi sumber yang terlihat: `CT` = Cuti; `PA` = Pulang Awal/izin setengah hari; `T` = Terlambat; `ITB` = Ijin Tidak Bekerja; `DS` = Datang Siang; `A` = Alpa; `L` = Diliburkan; `CI` = Cuti Istimewa.
- Arti `SDR`, `BPJS`, dan `PC` di kolom summary tidak dijelaskan.
- Kode `H` pada sumber Radin belum tervalidasi.
- Ada satu NIK pada output periode Staff, `ST 261002` untuk `RYAN JONATHAN S.`, yang tidak ditemukan pada snapshot Employee Directory. Perlakukan sebagai exception/new joiner sampai diverifikasi, bukan langsung dibuat atau dipasangkan.

### Cacat teknis workbook

- Sheet `Nov`: 3.310 formula/error cells (3.152 `#NUM!`, 158 `#VALUE!`).
- Sheet `Agt`: 3.407 formula/error cells (2.958 `#NUM!`, 448 `#VALUE!`, 1 `#NAME?`).
- Sheet `ABSENSI LIBUR`: 351 error cells (248 `#N/A`, 103 `#REF!`).
- `Inspira`: 4 `#VALUE!`; sheet periode lama juga memiliki 8 `#N/A`.
- Terdapat 382 defined names yang merujuk ke `#REF!`.
- Sheet output periode terbaru yang diperiksa tidak menunjukkan error cell.

**Keputusan:** `[FIX]` jangan port formula dan named ranges rusak; `[WAJIB]` bangun engine teruji dari rules yang eksplisit; `[PERLU KONFIRMASI]` verifikasi arti kode tambahan/summary yang belum dikenal.

### Model penyimpanan hasil Staff yang direkomendasikan

- Simpan setiap `processing run` dengan period key dan versi sumber/batch.
- Simpan hasil per karyawan per tanggal dengan sumber event yang mendasari.
- Simpan keputusan HR terpisah dari hasil deteksi sistem: alasan, lampiran/referensi dokumen, reviewer, status, dan waktu konfirmasi.
- Jika upload baru datang, hitung ulang hanya bagian yang terdampak dan tampilkan perbedaan (`new`, `changed`, `conflict`, `unchanged`).
- Jangan menimpa alasan atau status yang sudah dikonfirmasi. Jika data baru bertentangan, tandai `Perlu Review Ulang` dan pertahankan nilai/keputusan sebelumnya dalam audit trail.
- Jangan otomatis mengisi `Alpa` hanya karena tidak ada punch. Gunakan status `Perlu Pemeriksaan HR` sampai jadwal, hari libur, cuti, izin, dan sumber alternatif diverifikasi.

## 2.7 Audit Drivers

### Proses sesuai dokumen sumber

- Input berasal dari Upload Absensi.
- Admin menginput jadwal Driver harian.
- Admin mengelompokkan dukungan tim/tujuan kerja: `Support`, `Indoor`, `Outdoor`, `Radin`, atau `Lainnya`.
- Informasi jadwal terhubung ke Time Checksheet dan laporan.
- Output yang diminta: Time Checksheet per Driver, laporan per bagian Supporting dan summary, slip gaji, serta BKK.

### Workbook dan temuan

Workbook `Gaji Driver November 1 2026 (1).xlsx` memiliki sheet `Jadwal Driver`, `checksheet`, `FINGER`, `Summary`, `Support Indoor`, `Indoor`, `Support Outdoor`, `Outdoor`, `Radin`, `TANDA TERIMA`, `Slip gaji`, `BASE BKK-BKM`, `BKK`, dan sheet pendukung lain.

- Contoh checksheet/payroll menggunakan periode `01–15 Nov 2026`. Ini hanya membuktikan periode pada contoh, bukan aturan payroll universal.
- Summary membagi hasil ke `Div Indoor`, `Div Outdoor`, `PT Radin`, dan `Support`, serta menampilkan jumlah hari/pekerjaan, upah, jam/nominal lembur, BPJS, total upah, total lembur, dan grand total.
- `Jadwal Driver` memuat hari/tanggal, NIK, nama, tujuan, kendaraan, kategori, dan kolom waktu/lembur.
- Checksheet memiliki kode `S`, `R`, `I` pada grid jam, tetapi tidak terdapat codebook yang menjelaskan artinya.
- Formula Summary merujuk ke workbook eksternal `[1]ABSENSI`; terdapat external references lain `[2]Radin` dan `[3]Support`.
- Ada 12 defined names/print names yang rusak (`#REF!`).
- Sheet `FINGER` memiliki 10 formula errors (5 `#NUM!`, 5 `#REF!`), termasuk nilai waktu negatif `-0.125` hari (−3 jam) pada H44 serta formula rusak di AF54/AG54.
- `Slip gaji` memiliki 546 nilai `#N/A` dan 27 external formulas.
- `Summary` mempunyai 6 formula external link.
- `Radin` juga mengandung external reference.
- `Order Kendaraan` hanya berisi kerangka/header; tidak ada transaksi yang dapat menjadi dasar logika pemesanan.
- Formula lama menunjukkan variasi threshold lembur, termasuk `TIME(8,0,0)` dan pada baris tertentu `TIME(5,0,0)`. Ada juga variasi per orang/row dan rounding.
- Beberapa perhitungan BKK/BKM menampilkan fee 10%, tetapi tujuan dan cakupannya tidak dijelaskan.
- Ada satu ketidaksesuaian identitas pada contoh: `BUDI HARTOYO`, NIK `KT 130201`, tidak ditemukan pada snapshot Employee Directory.

### Risiko dan keputusan Driver

1. `[FIX]` Hapus ketergantungan terhadap external links Excel. Jadwal, event attendance, dan hasil proses harus berasal dari database aplikasi.
2. `[WAJIB]` Jadwal Driver harian harus disimpan sebagai data terstruktur, bukan hanya input dalam workbook.
3. `[PERLU KONFIRMASI]` Definisi kode `S/R/I`, jam kerja normal, kategori kerja, crossing midnight, pergantian jadwal, istirahat, hari libur, dan overtime break belum ditetapkan.
4. `[JANGAN DITEBAK]` Jangan menghitung upah, lembur, BPJS, fee 10%, potongan, pembulatan, atau grand total sebagai payroll final dari formula lama.
5. `[PERLU KONFIRMASI]` Pastikan apakah periode payroll Driver selalu tanggal 1–15 dan 16–akhir bulan, atau dapat dipilih admin. Contoh satu workbook saja tidak cukup untuk menyimpulkan kebijakan.
6. `[RISIKO DATA]` BUDI HARTOYO / `KT 130201` harus masuk exception queue sampai NIK/identitas diklarifikasi.
7. `[FIX]` Data jam negatif, `#NUM!`, `#REF!`, `#N/A`, dan named range rusak tidak boleh dibawa sebagai hasil valid.
8. `[WAJIB]` Jadwal harus dapat direvisi dengan versi dan alasan; perubahan jadwal setelah payroll diproses tidak boleh mengubah hasil final tanpa proses reopen/reapproval.

### Status kesiapan payroll

**Belum siap untuk payroll otomatis final.** Modul jadwal, attendance timeline, time checksheet, rekonsiliasi, dan draft laporan dapat dibangun. Nominal slip gaji dan BKK hanya boleh aktif setelah rate table dan semua ketentuan penghitungan disetujui dan diuji terhadap contoh pembanding yang tervalidasi.

## 2.8 Audit Stationery / ATK

### Struktur workbook

Sheet: `Barang Masuk`, `Barang Keluar`, `OKT`, `NOV`, `DES`, `PERIODE GLOBAL`, `Daftar Item - Departemen`.

- Master item memiliki 121 nama barang unik setelah normalisasi dasar.
- Tidak ditemukan konflik satuan untuk nama barang yang sama pada master yang diperiksa.
- `Barang Masuk`: 43 transaksi nonkosong; seluruhnya tercatat pada HR GA.
- `Barang Keluar`: 309 transaksi nonkosong; memakai 14 variasi label departemen historis.
- Master departemen pada workbook mempunyai 15 kategori, sedangkan daftar yang diminta pada `Process.txt` mempunyai 16 kategori.

### Departemen/SLOC kanonis dari Process.txt

1. HR GA
2. INVENTORY & GUDANG
3. PURCHASING
4. PPC INDOOR
5. PPC OUTDOOR
6. MAINTENANCE
7. QC INDOOR
8. QC OUTDOOR
9. PRODUKSI INDOOR
10. PRODUKSI OUTDOOR
11. R & D
12. F & A
13. MARKETING SERVICE
14. RADIN MITRA LESTARI
15. FOTOCOPY
16. SECURITY

### Cacat dan inkonsistensi yang terdeteksi

- `[FIX]` Pada `Barang Keluar!E2:E20`, ditemukan 19 formula `VLOOKUP` tanpa argumen exact-match (menggunakan approximate match). Hal ini dapat mengembalikan satuan yang salah.
- `[TEMUAN]` Contoh kesalahan: `TIPEX ROLL` pada `Barang Keluar` baris 18 memperoleh satuan `PCS`, padahal satuan master adalah `PACK`.
- `[FIX]` Jangan gunakan approximate lookup untuk item/unit. Gunakan item ID/foreign key dan ambil satuan langsung dari master; field satuan transaksi sebaiknya readonly kecuali terdapat transaksi multi-unit yang secara eksplisit diizinkan.
- `[RISIKO STOK]` Pada `NOV!G12`, item `BINDER CLIP 155` memiliki stok awal 2, barang masuk 0, barang keluar 3, saldo akhir −1. `PERIODE GLOBAL!G12` juga menunjukkan saldo −1 (stok awal 3, masuk 0, keluar 4).
- `[TEMUAN]` Rekap `OKT` menunjukkan stok awal 3, keluar 1, sisa 2, sehingga nilai awal bulan berikutnya 2 konsisten secara aritmetika.
- `[FIX]` Transaksi keluar tidak boleh membuat saldo kurang dari nol. Data negatif lama harus diselesaikan lewat rekonsiliasi/stock opname atau stock adjustment yang beralasan dan disetujui, bukan dengan mengubah transaksi historis diam-diam.
- `[PERLU KONFIRMASI]` Label historis `GUDANG`, `MARKETING`, dan `RADIN` mungkin alias dari `INVENTORY & GUDANG`, `MARKETING SERVICE`, dan `RADIN MITRA LESTARI`, tetapi pemetaan ini belum disahkan. Buat alias mapping dan minta validasi.
- `[WAJIB]` `FOTOCOPY` ada di daftar kanonis namun belum ada sebagai departemen dalam master yang diperiksa; sediakan master baru hanya setelah konfirmasi pemilik data.
- `[PERLU KONFIRMASI]` Karena 43 transaksi Barang Masuk seluruhnya HR GA, belum jelas apakah kolom departemen menunjukkan pemilik persediaan, lokasi fisik gudang, departemen penerima, atau cost center. Jangan menyamakan otomatis Departemen dengan SLOC.
- `[JANGAN DITEBAK]` Rumus/arti `skor fav` dan `scoring` di rekap belum dijelaskan; jangan mengaktifkan ranking/rekomendasi otomatis.

### Rancangan kontrol stok

- Saldo dihitung dari ledger transaksi: saldo awal yang disahkan + penerimaan − pengeluaran ± adjustment yang disetujui.
- Saldo harus dihitung pada dimensi item + lokasi stok (SLOC) yang terdefinisi. Departemen pemakai/cost center disimpan sebagai dimensi terpisah jika memang diperlukan.
- Simpan transaksi sebagai ledger; koreksi dilakukan menggunakan reversal/correction record dengan alasan dan pengguna yang melakukan.
- Sebelum menyimpan Barang Keluar, lakukan validasi stok pada server/database secara atomik agar dua pengguna tidak dapat mengeluarkan stok yang sama secara bersamaan.
- Tolak transaksi jika saldo tidak cukup. Jangan hanya mengandalkan validasi frontend.
- Stock opname/adjustment wajib memiliki alasan, tanggal efektif, bukti/rujukan, pembuat, approver, dan audit log.

## 2.9 Matriks risiko dan prioritas

| Prioritas | Temuan | Dampak jika diabaikan | Tindakan |
|---|---|---|---|
| P0 | Identitas karyawan tidak cocok / memakai nama sebagai key | Absensi, cuti, atau payroll salah orang | Gunakan employee ID, matching NIK, exception queue |
| P0 | Upload menimpa atau menggandakan data | Hilang/duplikat absensi dan hasil proses | Batch, hash, idempotency, reconciliation |
| P0 | Stok minus dan race condition | Saldo ATK tidak dapat dipercaya | Validasi atomik server-side, ledger, adjustment approval |
| P0 | Payroll dihitung dari formula rusak/aturan tidak disahkan | Salah bayar dan sengketa payroll | Nonaktifkan nominal final sampai policy disahkan |
| P1 | Formula dan external links Excel rusak | Hasil tidak stabil/tidak dapat direproduksi | Rebuild calculation engine dan test |
| P1 | Tanggal campur serial/teks | Salah periode, salah hari absensi/cuti | Parser format-spesifik dan timezone |
| P1 | PII berlebihan | Kebocoran data personal | Least privilege, masking, RLS |
| P1 | Kode absensi tidak didefinisikan | Salah klasifikasi hadir/izin/alpa | Codebook per sumber |
| P1 | SLOC vs departemen tidak jelas | Stok dibebankan/disimpan pada lokasi salah | Pisahkan dimensi dan konfirmasi makna kolom |
| P2 | Score/favorite Stationery tidak jelas | Ranking yang menyesatkan | Jangan aktifkan sampai definisi tersedia |
| P2 | Output PDF/XLSX legacy | Laporan berbeda format/isi | Gunakan format contoh sebagai referensi UI, bukan formula |

---

# BAGIAN 3 — DAFTAR LOGIKA YANG DITERAPKAN PER FITUR

Bagian ini adalah spesifikasi perilaku aplikasi. Gunakan sebagai acuan acceptance criteria. Kata “harus” berarti perilaku minimum yang diharapkan.

## 3.1 Shared Foundation — Master Karyawan, Identity Mapping, Audit Trail

### Input
- Master karyawan yang sudah ada dalam HR Workspace.
- Snapshot `Data_Karyawan_2026-11-23.xlsx` sebagai sumber pembanding/import terkendali.
- NIK, nama, departemen, jabatan, tanggal masuk, status kerja, dan atribut minimum lain yang dibutuhkan modul.

### Logika
1. Setiap karyawan mempunyai primary key internal aplikasi yang stabil.
2. NIK menjadi business identifier yang divalidasi; nama hanya atribut tampilan/pencarian.
3. Normalisasi NIK boleh merapikan whitespace dan kapitalisasi, tetapi jangan menghapus karakter yang berpotensi membedakan identifier tanpa aturan resmi.
4. Simpan nilai sumber dan nilai normalisasi secara terpisah bila sistem mendukung.
5. Matching otomatis hanya jika hasilnya unik dan pasti. NIK tidak ditemukan, NIK ganda, nama mirip, atau perubahan identitas masuk exception queue.
6. Data baru dari workbook diproses sebagai delta: `new`, `changed`, `unchanged`, `conflict`, `not found`.
7. Tidak boleh menghapus karyawan historis yang sudah memiliki attendance/payroll/leave/transaction record.
8. Status aktif/nonaktif dan tanggal efektif harus diperhatikan ketika menilai absensi pada tanggal lampau.
9. Modul yang tidak membutuhkan PII hanya memperoleh subset data yang diperlukan.

### Output
- Employee ID yang tervalidasi.
- Mapping NIK dan alias historis bila disetujui.
- Exception list untuk data yang belum cocok.
- Riwayat perubahan master.

### Acceptance criteria
- Nama yang sama tidak membuat dua karyawan tergabung jika NIK berbeda.
- NIK yang belum dikenal tidak otomatis menciptakan employee record production.
- Perubahan nama tidak memutus histori karena foreign key memakai internal ID.
- User tanpa izin tidak dapat membuka alamat/tanggal lahir/atribut sensitif.

## 3.2 Attendance Upload Center

### Input dan jenis file
1. `Laporan Transaksi.xls` — event log Mitra.
2. `Data Presensi.xls` — fingerprint/device attendance Mitra sebagai sumber opsional.
3. Radin attendance XLSX — per record/tanggal dengan check-in/out dan field terkait.
4. Format tambahan di masa depan harus memiliki parser terpisah dan terdaftar.

### Siklus upload
1. Pengunggah memilih tipe sumber/jenis file dan mengunggah file.
2. Sistem membuat batch dengan timestamp, pengunggah, hash file, periode terdeteksi, parser version, dan status.
3. Sistem memvalidasi header, tipe data, tanggal, waktu, employee mapping, dan duplikasi.
4. Sistem menampilkan preview: diterima, duplikat, tidak valid, identitas tidak ditemukan, konflik, dan peringatan.
5. Pengguna melakukan konfirmasi import untuk baris yang lolos.
6. Batch dan raw source disimpan untuk ditelusuri.
7. Data yang sudah diterima tersedia untuk Staff dan Drivers melalui read/reference; mereka tidak menghapus sumber.

### Deduplication dan reconciliation
- File hash identik + parser/source sama harus dikenali sebagai upload ulang.
- Event duplikat pada upload overlap harus dideduplikasi menggunakan kombinasi sumber, employee identity, event timestamp, event type, device/source ID, serta fingerprint lain yang sesuai format.
- Jangan menggabungkan event hanya karena employee dan tanggal sama; seorang karyawan dapat memiliki beberapa punch dalam sehari.
- Perbedaan Check In/Check Out atau source collision harus tampil sebagai conflict untuk review.
- Koreksi manual memerlukan alasan dan audit trail; nilai raw tetap tersedia.
- Upload baru tidak boleh menghapus keputusan manual atau hasil modul downstream.

### Status batch yang disarankan
`Uploaded` → `Validating` → `Needs Review` / `Ready to Import` → `Imported` / `Partially Imported` / `Rejected`.

### Exception minimum
- Format/header tidak dikenal.
- Tanggal/waktu invalid atau ambigu.
- Employee ID/NIK tidak ditemukan.
- Identitas ganda.
- Event tidak memiliki jenis masuk/keluar yang dikenali.
- Konflik antarsumber.
- Event sebelum tanggal join atau setelah status kerja berakhir.

### Acceptance criteria
- Mengupload file identik dua kali tidak menggandakan event.
- Upload periode tumpang tindih tidak menghapus event lama.
- Data yang tidak cocok tidak hilang; tampil di exception queue.
- Staff dan Drivers dapat mengambil data dari batch yang sama tanpa memiliki hak delete ke Upload Center.

## 3.3 Employee Directory

### Tujuan
Menyediakan pencarian data karyawan dan satu referensi identitas yang konsisten untuk Staff, Drivers, Leave, dan modul lain.

### Logika
- Gunakan master karyawan eksisting sebagai sumber kebenaran setelah diperiksa.
- Workbook 175 karyawan hanya menjadi referensi sinkronisasi; bukan auto-replace.
- Cari berdasarkan nama/NIK; detail ditampilkan sesuai hak akses.
- Status kerja, departemen, jabatan, dan tanggal efektif digunakan sebagai referensi saat memproses periode lampau.
- Ketika terjadi ketidaksesuaian NIK/nama, tampilkan flag untuk HR/Admin yang berwenang.

### Batasan data
- Jangan tampilkan semua kolom dari workbook di halaman absensi atau ATK.
- Alamat, tanggal lahir, nomor telepon pribadi, agama, dan atribut sensitif lain hanya tersedia pada halaman yang memang berwenang.

## 3.4 Cuti

### Input
- Snapshot `Cuti.xlsx` (130 karyawan; saat ini berbasis nama).
- Pengajuan cuti aktif dari modul cuti HR Workspace jika sudah tersedia.
- Persetujuan dan riwayat cuti dari sistem aktual.

### Logika import
1. Cocokkan setiap nama dengan master karyawan.
2. Ubah hasil pencocokan ke employee ID/NIK permanen.
3. Jika pencocokan tidak unik, hentikan otomatisasi baris dan masukkan ke exception.
4. Normalisasikan tanggal ke date ISO berdasarkan parser khusus dan review tanggal ambigu.
5. Jangan mengimpor `#REF!`, formula error, atau row number yang rusak.
6. Simpan saldo snapshot lama sebagai nilai legacy/imported balance dengan tanggal cut-off, bukan otomatis sebagai formula hak cuti baru.

### Logika operasional
- Pengajuan, approval, penggunaan, dan saldo cuti harus mengikuti policy/workflow modul yang ada setelah audit.
- Staff boleh menampilkan kemungkinan bahwa ketidakhadiran berhubungan dengan pengajuan cuti.
- Cuti baru boleh dianggap sebagai alasan final sesuai status approval dan aturan HR yang disahkan.

### Parameter yang wajib dikonfirmasi
- Total entitlement dan cuti bersama.
- Cara menghitung `Cuti Bisa`.
- Kapan hak cuti timbul/accrual.
- Makna periode `P/Q`.
- Carry-over, expiry, half-day, weekend/holiday counting, cuti melebihi saldo, cuti khusus, pembulatan, dan jumlah maksimum hari.

### Acceptance criteria
- Cuti pending tidak diam-diam menjadi approved.
- Tidak ada saldo final yang dihitung dari policy yang belum disetujui.
- Setiap saldo dapat ditelusuri ke saldo awal, penggunaan, dan adjustment.

## 3.5 STAFF — Attendance Processing

### Input
- Event Mitra/Radin dari Upload Center.
- Employee master dan status kerja.
- Kalender kerja/hari libur/jadwal/shift yang sudah ada.
- Pengajuan cuti/izin dan approval.
- Keputusan HR atas ketidakhadiran dan dokumen pendukung.

### Periode
- Periode laporan dimulai tanggal 6 bulan sebelumnya dan berakhir tanggal 5 bulan berjalan, inklusif.
- Gunakan timezone `Asia/Jakarta`.
- Contoh periode yang terlihat pada workbook: `06 Nov–05 Des 2026`.
- Periode harus dapat dinavigasi dan dikunci setelah proses final sesuai hak akses.

### Deteksi kehadiran
1. Ambil seluruh attendance event yang valid pada periode yang dipilih.
2. Cocokkan employee ID dan kalender kerja.
3. Kelompokkan event per karyawan/per tanggal.
4. Bentuk pasangan masuk/keluar berdasarkan source adapter dan aturan yang telah disahkan.
5. Tandai missing/inconsistent punch untuk review; jangan mengarang jam yang hilang.
6. Evaluasi cuti, izin, libur, status karyawan, dan jadwal sebelum mengklasifikasikan ketidakhadiran.

### Tardiness — aturan eksplisit
- Jam masuk referensi: 07:30.
- 07:30:00 sampai 07:30:59 = tepat waktu.
- Mulai 07:31:00 = terlambat (flag `T`).
- Hanya berlaku untuk Staff.
- Tidak berlaku untuk Drivers.
- `[KONFIGURASI]` Jika nantinya ada departemen/shift dengan jam masuk berbeda, gunakan jadwal/parameter per kelompok yang disahkan; jangan mengubah aturan default diam-diam.

### Review ketidakhadiran
- Karyawan tanpa punch pada hari yang dijadwalkan harus masuk daftar `Perlu Pemeriksaan HR`.
- HR memeriksa dokumen/alasan dan menentukan status sesuai codebook/workflow.
- Sistem dapat menampilkan kandidat cuti dari pengajuan sebelumnya, tetapi keputusan final mengikuti status approval dan kebijakan yang dikonfirmasi.
- Jangan menganggap tidak ada punch otomatis `Alpa`.

### Persistence dan upload tambahan
- Setiap hasil proses terhubung dengan period ID dan versi sumber.
- Simpan hasil klasifikasi sistem, keputusan manual HR, alasan, dokumen, dan status approval pada struktur terpisah/terlacak.
- Upload tambahan melakukan reconciliation; baris baru ditambahkan dan perubahan ditandai.
- Keputusan HR yang sudah disimpan tidak boleh dihapus oleh processing run baru.
- Bila event baru menyebabkan perubahan material pada hari yang sudah dikonfirmasi, sistem menandainya `Perlu Review Ulang` dan menunjukkan perubahan sebelum pengguna menyimpan revisi.

### Kode legacy yang ditemukan
| Kode | Arti yang tertulis/teridentifikasi | Status |
|---|---|---|
| CT | Cuti | Terdefinisi pada workbook |
| PA | Pulang Awal / izin setengah hari | Terdefinisi pada workbook |
| T | Terlambat | Terdefinisi; aturan ambang ada pada instruksi sumber |
| ITB | Ijin Tidak Bekerja | Terdefinisi pada workbook |
| DS | Datang Siang | Terdefinisi pada workbook |
| A | Alpa | Terdefinisi pada workbook; jangan dipakai otomatis sebelum review |
| L | Diliburkan | Terdefinisi pada workbook |
| CI | Cuti Istimewa | Terdefinisi pada workbook |
| SDR | Tidak diketahui | `PERLU KONFIRMASI` |
| BPJS | Label ditemukan, arti/pengaruh pada rekap Staff belum jelas | `PERLU KONFIRMASI` |
| PC | Tidak diketahui | `PERLU KONFIRMASI` |
| H | Muncul pada sumber Radin; arti belum dikonfirmasi | `PERLU KONFIRMASI` |

### Output
- Attendance recap per Staff per periode.
- Detail per tanggal dan event asal.
- Status exception/review.
- Rekap summary dengan kode yang sudah disahkan.
- PDF print dan XLSX export.

### Acceptance criteria
- Uji tepat waktu pada 07:30:59 dan terlambat pada 07:31:00.
- Upload tambahan tidak mereset alasan dan status review.
- Missing punch tidak langsung dianggap Alpa.
- Periode 6–5 inklusif benar pada pergantian bulan/tahun.
- Driver tidak terkena tardiness rule Staff.

## 3.6 DRIVERS — Jadwal, Time Checksheet, Summary, Payroll, BKK

### A. Jadwal Driver harian

**Input admin:** tanggal, karyawan/Driver, NIK/employee ID, tujuan, kendaraan (bila wajib), kategori penugasan, waktu atau informasi shift yang dibutuhkan, tim/section yang dibantu, dan catatan.

**Kategori yang disebutkan sumber:**
- Support
- Indoor
- Outdoor
- Radin
- Lainnya

**Logika:**
1. Pilih Driver dari Employee Directory; jangan mengetik nama/NIK bebas bila karyawan sudah ada di master.
2. Pilih tanggal dan kategori/section.
3. Simpan jadwal sebagai record dengan pembuat, waktu, versi, dan status.
4. Jadwal boleh diubah oleh role yang berwenang; perubahan harus mencatat alasan dan nilai lama/baru.
5. Jika jadwal bentrok atau Driver terjadwal ganda pada waktu yang sama, tampilkan konflik dan minta keputusan.
6. Penugasan `Lainnya` wajib mempunyai keterangan/tujuan yang jelas.
7. Jadwal yang sudah dipakai pada payroll final tidak boleh diubah langsung; gunakan reopen/revision workflow.

### B. Time Checksheet

- Dibentuk dari jadwal Driver dan attendance event yang valid.
- Menampilkan per Driver dan periode yang dipilih.
- Tampilkan sumber punch, jam, jadwal, kategori/section, missing event, dan konflik.
- Jangan memberi arti pada kode S/R/I sebelum codebook resmi disetujui.
- Jangan menerapkan rule keterlambatan Staff ke Driver.

### C. Laporan per bagian dan summary

- Kelompok laporan harus dapat memisahkan Support, Indoor, Outdoor, Radin dan kategori lain sesuai konfigurasi yang disetujui.
- Summary harus menampilkan sumber angka dan detail drill-down; angka hasil tidak boleh berdiri tanpa trace ke jadwal/event.
- Format tampilan mengikuti workbook hanya sebagai referensi struktur output, bukan untuk menyalin rumus yang rusak.

### D. Payroll / Slip Gaji / BKK

**Belum boleh dihitung final sebelum parameter berikut dikonfirmasi:**
- Tarif dasar per jenis penugasan/kategori.
- Definisi satuan pembayaran (hari, trip, jam, borongan, atau kombinasi).
- Jam kerja normal dan threshold overtime.
- Tarif overtime per jenis hari/jam.
- Istirahat dan pengurang jam.
- Hari libur, akhir pekan, shift malam, lintas tengah malam.
- Pembulatan jam dan nominal.
- BPJS: komponen, tarif, batas, pihak yang menanggung, dan cara potong.
- Potongan/uang muka/tunjangan lain.
- Fee 10% yang terlihat pada contoh BKK/BKM: definisi, dasar pengenaan, dan cakupan.
- Periode payroll dan aturan prorata.
- Approval payroll serta siapa yang dapat membuka/mengunci/reopen periode.

**Perilaku aman:**
- Tanpa parameter lengkap, output diberi status `Draft — Aturan Payroll Belum Lengkap`; jangan menerbitkan nominal sebagai angka final.
- Setelah disahkan, parameter payroll diberi effective date/version dan perubahan tidak boleh mengubah slip historis yang telah final.
- Simpan kalkulasi per komponen dan formula version agar bisa diaudit.
- Slip gaji menampilkan detail penghasilan, overtime, potongan, dan total hanya sesuai formula yang disetujui.
- BKK merujuk pada batch/periode payroll dan approval yang sama.

### E. Output yang diminta
1. Time Checksheet per Driver (PDF).
2. Laporan per bagian Support/Indoor/Outdoor/Radin dan laporan Summary (PDF/XLSX bila diperlukan).
3. Slip gaji Driver (PDF).
4. Bukti Kas Keluar/BKK (PDF).

### Acceptance criteria
- Driver tanpa jadwal tampil sebagai exception.
- Jadwal ganda/bentrok terdeteksi.
- Perubahan jadwal tidak menimpa histori payroll final.
- Payroll belum lengkap tidak menghasilkan slip nominal final.
- Setiap total dapat ditelusuri ke detail jadwal, absensi, dan parameter tarif.

## 3.7 STATIONERY — ATK Inventory

### Master data
- Master item minimal mempunyai internal item ID, nama baku, satuan dasar, status aktif, dan alias nama.
- Daftar awal contoh memiliki 121 item unik.
- Satuan ditarik dari master dan tidak menggunakan approximate lookup.
- Master lokasi/SLOC dan master departemen pemakai harus dibedakan jika definisinya memang berbeda.

### Master departemen kanonis
Gunakan daftar 16 nama dari `Stationery/Process/Process.txt`, tetapi jangan otomatis menimpa label histori. Buat alias mapping untuk label lama dan minta validasi atas:
- `GUDANG` → kemungkinan `INVENTORY & GUDANG`.
- `MARKETING` → kemungkinan `MARKETING SERVICE`.
- `RADIN` → kemungkinan `RADIN MITRA LESTARI`.
- `FOTOCOPY` → kategori baru yang belum ada pada daftar departemen dalam workbook.

Mapping di atas adalah kandidat, belum disahkan.

### Barang Masuk
1. Pilih tanggal, item, kuantitas, dan lokasi stok penerimaan.
2. Nama item dipilih dari master; satuan otomatis.
3. Validasi kuantitas harus positif.
4. Departemen penerima/cost center, lokasi gudang, dan pemilik stok dicatat dalam field terpisah bila memang mewakili konsep berbeda.
5. Simpan pengguna, waktu, referensi dokumen, dan catatan.
6. Barang Masuk menambah saldo hanya setelah transaksi berhasil disimpan dan lolos validasi.

### Barang Keluar
1. Pilih tanggal, item, kuantitas, lokasi stok sumber, dan departemen pemakai/cost center.
2. Satuan otomatis dari item master.
3. Validasi saldo tersedia pada server/database secara atomik.
4. Jika kuantitas melebihi saldo, tolak transaksi dan tampilkan stok tersedia.
5. Jangan izinkan stok negatif melalui bypass UI.
6. Simpan tujuan/pemakai dan alasan jika dibutuhkan.

### Stock ledger dan adjustment
- Semua transaksi masuk, keluar, reversal, dan adjustment direkam sebagai ledger.
- Histori yang sudah disahkan tidak diedit/hapus langsung; gunakan reversal/adjustment.
- Stock opname menghasilkan selisih dan usulan adjustment.
- Adjustment wajib memiliki alasan, referensi stock opname, pelaku, approver, dan tanggal efektif.
- Saldo item dihitung per SLOC; bila kebutuhan bisnis memerlukan saldo per departemen, pastikan apakah itu kepemilikan stok atau hanya konsumsi.

### Laporan
- Saldo awal, masuk, keluar, adjustment, dan saldo akhir.
- Mutasi per item dan SLOC.
- Pengeluaran per departemen/cost center.
- Riwayat transaksi dan audit.
- Rekap periode bulanan dan global.
- Frekuensi penggunaan dapat ditampilkan bila definisinya jelas.
- `Skor Fav`/`scoring` tidak diaktifkan sampai formula dan tujuannya dijelaskan.

### Acceptance criteria
- `TIPEX ROLL` selalu menampilkan unit master `PACK`, bukan hasil approximate lookup `PCS`.
- Barang Keluar ditolak saat stok tidak cukup.
- Dua transaksi bersamaan tidak dapat membuat saldo negatif.
- Reversal/adjustment tetap meninggalkan jejak transaksi awal.
- Saldo historis negatif pada workbook tidak diimpor sebagai aturan; tampil sebagai discrepancy untuk diselesaikan.

## 3.8 Hak akses dan kontrol operasional lintas fitur

AI Studio harus memetakan hak akses ke role yang benar-benar ada dalam aplikasi. Jangan membuat role baru dengan nama sendiri sebelum audit.

| Aktivitas | Kontrol minimum |
|---|---|
| Upload absensi | Hanya role operasional yang ditunjuk; upload/import/reject tercatat |
| Melihat data karyawan | Sesuai kebutuhan kerja; PII dibatasi |
| Review ketidakhadiran Staff | HR/role approver sesuai struktur yang ada |
| Mengubah jadwal Driver | Admin operasional yang ditunjuk; perubahan tercatat |
| Finalisasi payroll/BKK | Pembuat dan approver terpisah bila kebijakan mengharuskan |
| Mengubah parameter tarif | Role terbatas; effective date dan version wajib |
| Input Barang Masuk/Keluar | Petugas Stationery sesuai kewenangan |
| Stock adjustment | Wajib alasan dan approval; idealnya pembuat tidak menyetujui transaksi sendiri |
| Mengubah master item/SLOC/departemen | Role master-data terbatas |
| Melihat audit trail | Admin/HR/auditor sesuai hak akses |

## 3.9 Keputusan yang masih harus dikonfirmasi pemilik proses

Daftar ini bukan alasan untuk menghentikan pengembangan seluruh modul. AI Studio dapat membangun kerangka data, UI, validasi, dan alur draft, tetapi jangan mengaktifkan kalkulasi final yang bergantung pada keputusan ini.

| ID | Fitur | Pertanyaan / keputusan | Default aman sampai ada jawaban |
|---|---|---|---|
| C-01 | Employee Directory | Apakah file 175 karyawan merupakan delta, snapshot lengkap, atau hanya bahan validasi? | Tidak replace master; hanya preview rekonsiliasi |
| C-02 | Employee Directory | Bagaimana menangani perubahan NIK, NIK lama, dan status karyawan historis? | Simpan alias/riwayat; tidak memutus employee ID |
| C-03 | Upload | Jika dua sumber punya jam berbeda, sumber mana yang menjadi prioritas? | Conflict queue, tidak pilih otomatis |
| C-04 | Upload | Apa definisi event duplicate lintas alat dan format? | Idempotency per source dengan review konflik |
| C-05 | Radin | Apa arti Attendance Code `H` dan kode lain? | Unknown code, perlu mapping |
| C-06 | Staff | Apakah jam masuk 07:30 berlaku untuk semua Staff/cabang/departemen? | Pakai aturan explicit hanya pada kelompok yang terkonfirmasi; konfigurasi lain nonaktif |
| C-07 | Staff | Bagaimana aturan shift, hari libur, tanggal kerja, crossing midnight? | Baca kalender eksisting; konflik ditandai |
| C-08 | Staff | Apakah cuti yang sudah diajukan tetapi belum disetujui boleh mengubah status absen? | Hanya kandidat/indikator, belum final |
| C-09 | Staff | Apa arti SDR, BPJS, PC? | Tidak dihitung/dipakai dalam summary final |
| C-10 | Cuti | Apa arti P/Q dan kapan entitlement baru timbul? | Saldo legacy saja, tidak accrual otomatis |
| C-11 | Cuti | Aturan entitlement, cuti bersama, carry-over, half-day, weekend/holiday, expiry? | Tidak membuat policy baru |
| C-12 | Drivers | Apa arti kode S/R/I? | Tampilkan kode mentah dan status belum terdefinisi |
| C-13 | Drivers | Periode payroll Driver tetap 1–15 dan 16–akhir bulan? | Periode configurable, belum final |
| C-14 | Drivers | Tarif dasar, overtime threshold/rate, istirahat, hari libur, rounding? | Payroll draft tanpa nominal final |
| C-15 | Drivers | Bagaimana BPJS, deductions, allowance, advance, dan fee 10% dihitung? | Tidak menghitung nominal final |
| C-16 | Drivers | Validasi BUDI HARTOYO / `KT 130201` dan RYAN JONATHAN / `ST 261002`? | Exception queue, bukan auto-create |
| C-17 | Stationery | Apakah lokasi fisik gudang berbeda dari departemen/cost center? | Pisahkan field konseptual, jangan samakan |
| C-18 | Stationery | Arti kolom Departemen pada Barang Masuk, seluruhnya HR GA? | Jangan menyimpulkan HR GA satu-satunya SLOC |
| C-19 | Stationery | Sahkan alias GUDANG/MARKETING/RADIN dan penambahan FOTOCOPY? | Alias pending; simpan label sumber |
| C-20 | Stationery | Rumus `Skor Fav` dan `scoring`? | Tidak ditampilkan sebagai keputusan/rekomendasi |
| C-21 | Stationery | Saldo awal per SLOC yang valid dan hasil rekonsiliasi stok opname? | Jangan impor saldo negatif; perlu opening balance yang disetujui |

---

# BAGIAN 4 — RENCANA IMPLEMENTASI DAN URUTAN PENGERJAAN

## 4.1 Tahapan yang direkomendasikan

| Tahap | Ruang lingkup | Kriteria selesai |
|---|---|---|
| 0 | Audit HR Workspace dan database aktual | Ada peta arsitektur, role, tabel, modul terkait, impact map, dan risiko |
| 1 | Shared identity + audit + import foundation | Employee mapping, audit trail, file batch, dedup, exception queue siap |
| 2 | Attendance Upload Center | Ketiga format dapat dipreview/validasi/import tanpa duplikasi |
| 3 | Employee Directory + Cuti import/reconciliation | Data dapat dicocokkan ke master, exception tertangani, policy gap terlihat |
| 4 | Staff Attendance | Periode 6–5, tardiness rule, review manual, save state, incremental reconciliation lulus test |
| 5 | Drivers scheduling + checksheet | Jadwal manual, category, time matching, exception dan output checksheet berjalan |
| 6 | Drivers payroll & BKK | Hanya setelah seluruh C-12 s.d. C-15 disahkan dan test nominal cocok |
| 7 | Stationery | Master item, SLOC, ledger, masuk/keluar, saldo nonnegatif, adjustment dan report |
| 8 | PDF/XLSX, final QA, staging acceptance | Output, role/RLS, regression, rollback, dokumentasi diterima |

## 4.2 Aturan database dan backend

- Periksa schema dan fungsi existing sebelum menentukan migration.
- Gunakan foreign key internal yang tepat dan unique constraints untuk deduplication.
- Terapkan transaksi database untuk operasi kritis (import commit, stock issue, stock adjustment, payroll finalization).
- Untuk stok, lakukan pengecekan dan pengurangan saldo dalam satu transaksi/operasi atomik agar tidak terjadi race condition.
- RLS harus membatasi akses data per role dan operasi; menyembunyikan tombol di frontend tidak cukup.
- Server-side validation wajib untuk kuantitas, periode, employee ID, status approval, dan parameter payroll.
- Migrations harus idempotent, dapat direview, serta memiliki rencana rollback. Jangan drop/rename kolom existing tanpa analisis dependency.
- Tanggal/timestamp di database harus konsisten; gunakan date untuk tanggal kalender dan timestamptz untuk event yang membutuhkan zona waktu.
- Simpan provenance: source file, batch, row number/sheet, parser version, created_by, created_at.

## 4.3 UX minimum

- Pertahankan pola tampilan HR Workspace.
- Sediakan preview sebelum import/commit.
- Gunakan label yang jelas: `Siap Diproses`, `Perlu Review`, `Ditolak`, `Draft`, `Final`.
- Tampilkan mengapa baris ditolak dan tindakan koreksi yang dapat dilakukan.
- Jangan tampilkan formula/database error kepada HR sebagai `#REF!` atau `#N/A`; tampilkan pesan yang dapat ditindaklanjuti sambil menyimpan detail teknis pada log terbatas.
- Untuk daftar besar, gunakan filter pencarian, pagination/virtualization, dan export yang tidak membebani browser.
- Jangan mengunci halaman saat proses batch besar; tampilkan progress dan hasil ringkas.

## 4.4 Release gate

Fitur belum boleh dinyatakan siap production sebelum:
- Repository dan database aktual telah diaudit.
- Tidak ada perubahan destructive tanpa persetujuan.
- Import file identik/overlap lulus idempotency test.
- Tidak ada hasil Staff yang hilang akibat upload tambahan.
- Tidak ada kesalahan tardiness di batas 07:30:59/07:31:00.
- Payroll Driver tidak memfinalkan nominal dengan policy yang belum lengkap.
- Transaksi Stationery tidak dapat membuat stok minus, termasuk dua transaksi simultan.
- RLS/permission diuji dari sisi server.
- PDF/XLSX dibandingkan dengan data transaksi yang menjadi sumbernya.
- Regression test terhadap modul HR Workspace existing lulus.
- Ada dokumentasi dan rollback plan.

---

# BAGIAN 5 — RINGKASAN KEPUTUSAN AUDIT

## Dapat langsung dijadikan requirement

1. Upload absensi boleh harian atau per periode.
2. Upload Center menjadi sumber data bersama; Staff dan Drivers tidak menghapus sumber tersebut.
3. Upload baru harus bersifat inkremental dan tidak mereset hasil/review Staff yang telah disimpan.
4. Periode Staff adalah tanggal 6 bulan sebelumnya sampai tanggal 5 bulan berjalan, inklusif.
5. Keterlambatan Staff mulai 07:31:00; 07:30:59 masih tepat waktu; tidak berlaku untuk Driver.
6. Employee Directory menjadi referensi pencocokan nama/NIK, tetapi sinkronisasi ke master aktual tetap harus direkonsiliasi.
7. Admin menginput Jadwal Driver harian dengan kategori Support, Indoor, Outdoor, Radin, atau Lainnya.
8. Output Driver yang dibutuhkan: Time Checksheet per Driver, laporan bagian dan summary, slip gaji, BKK.
9. Stationery memiliki Barang Masuk dan Barang Keluar dengan interface sederhana untuk input admin.
10. Stok minus tidak boleh terjadi.
11. Departemen kanonis mengikuti 16 label yang tercantum pada `Stationery/Process/Process.txt`.

## Harus diperbaiki dari sumber lama

1. Formula Excel yang error (`#REF!`, `#NUM!`, `#VALUE!`, `#N/A`, `#NAME?`) tidak boleh dipindahkan menjadi business logic.
2. External workbook links pada Driver harus diganti sumber database internal.
3. Approximate VLOOKUP pada Barang Keluar harus diganti exact item ID/master relation.
4. Data tanggal serial/teks harus dinormalisasi dengan parser eksplisit.
5. NIK/nama yang tidak cocok harus masuk exception queue, bukan dipaksa match.
6. Saldo negatif historis ditangani melalui rekonsiliasi/adjustment beralasan, bukan diadopsi sebagai saldo normal.
7. Data PII harus dibatasi sesuai kebutuhan role.

## Tidak boleh diputuskan AI Studio sendiri

1. Rumus dan tarif gaji/lembur Driver.
2. Formula BPJS, potongan, fee 10%, dan rounding payroll.
3. Arti kode S/R/I checksheet.
4. Arti kode H Radin dan kode summary Staff yang belum terdefinisi.
5. Kebijakan accrual/entitlement/carry-over/periode cuti P/Q.
6. Status pengajuan cuti yang boleh otomatis menjelaskan absen.
7. Prioritas konflik antarsumber attendance.
8. Pemetaan alias departemen historis dan definisi SLOC vs departemen/cost center.
9. Formula `Skor Fav`/`scoring` Stationery.
10. Saldo awal stok final per lokasi.

---

**Akhir dokumen.** Dokumen ini adalah spesifikasi audit dan panduan implementasi awal berdasarkan arsip yang diberikan. Kebijakan yang belum didefinisikan harus diselesaikan oleh pemilik proses; AI Studio bertugas menyiapkan struktur yang aman dan menandai gap, bukan mengarang kebijakan bisnis.
