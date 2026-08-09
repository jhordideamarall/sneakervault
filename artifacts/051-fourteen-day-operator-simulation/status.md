# Simulasi Operasional Operator 14 Hari

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** Post-UAT Operational Endurance
**Tanggal Mulai:** 2026-08-09
**Tanggal Selesai:** 2026-08-09

## Tujuan

Membuktikan bahwa alur gudang, penjualan, marketplace, keuangan, payroll,
audit, dan laporan dapat dioperasikan seperti pemakaian riil selama 14 hari
kalender tanpa mencemari data production. Mutasi simulasi hanya boleh terjadi
di lingkungan disposable; production dibatasi pada pemeriksaan read-only.

## Batas Keselamatan

- Jangan menghapus atau mereset data production.
- Jangan mengubah tabel konfigurasi/seed maupun akun yang dilindungi AGENTS.md.
- Gunakan ID yang dihasilkan database atau ID fixture yang dibuat di dalam
  transaksi pengujian; jangan hardcode ID production.
- Semua pemeriksaan browser dijalankan headless agar tidak mengganggu Arc.
- Screenshot harus bernama bersih berdasarkan hari dan aktivitas.
- Perubahan kode, jika diperlukan, harus melalui feature branch dan PR.

## Skenario 14 Hari

- [x] Hari 01 — baseline, role, akun, supplier, customer, employee, produk.
- [x] Hari 02 — purchase order tunai, kredit, dan uang muka.
- [x] Hari 03 — penerimaan parsial/final, batch, HPP, dan stok.
- [x] Hari 04 — invoice vendor, utang, serta pembayaran supplier.
- [x] Hari 05 — invoice penjualan manual, customer resolver, dan piutang.
- [x] Hari 06 — POS cash, transfer, QRIS, serta pemetaan akun bank/kas.
- [x] Hari 07 — marketplace import, settlement, dan sinkronisasi stok keluar.
- [x] Hari 08 — pre-order, reservasi stok, dan gap pembelian.
- [x] Hari 09 — packing multi-item, kirim, selesai, dan kartu stok.
- [x] Hari 10 — retur refund dan tukar ukuran dengan verifikasi fisik.
- [x] Hari 11 — stock opname, adjustment, dan larangan stok negatif.
- [x] Hari 12 — expense, transfer bank, jurnal, dan rekonsiliasi.
- [x] Hari 13 — payroll, komponen fleksibel, hutang gaji, settlement, payslip.
- [x] Hari 14 — laporan wajib, P&L, neraca, ekuitas/prive, audit, dan periodisasi.

## Verifikasi

- [x] Skenario database lulus; probe atomik/RLS dibungkus transaksi rollback.
- [x] Browser smoke dan alur operator utama lulus tanpa console/page error.
- [x] Role dan RLS menolak tindakan yang tidak berhak di clone production.
- [x] Stok akhir cocok dengan ledger dan tidak pernah negatif.
- [x] Kas/bank, utang, piutang, payroll, serta jurnal saling cocok.
- [x] Neraca seimbang dan laba berjalan cocok dengan laporan laba rugi.
- [x] Screenshot dan tutorial bergambar 14 hari tersedia di Downloads.
- [x] Lint, type-check, build, serta regression terkait lulus setelah audit akhir.
- [x] Production smoke read-only lulus setelah perubahan terdeploy.

## Temuan

- `react-resizable-panels` v4 menafsirkan ukuran numerik sebagai pixel; panel
  utama dashboard sempat hanya 85 px. Ukuran layout diubah menjadi string
  persentase eksplisit dan diberi batas minimum/maksimum.
- Finance tidak mendapat aksi edit harga inventory, sedangkan Owner/Gudang
  tidak dapat memperbaiki identitas produk (brand, model, SKU, size, barcode,
  warna) dari UI. Hak edit kini dipisahkan: Finance harga saja, Owner/Gudang
  identitas dan harga.
- Picker Pembelian Barang dan Invoice Penjualan menampilkan nilai size numerik
  untuk size pecahan. Semua label/pencarian sekarang mengutamakan `size_label`
  sehingga `42 2/3` tidak berubah menjadi `42.666…`.
- Statistik Invoice Penjualan menghitung status `partial` pada piutang tetapi
  tidak pada kartu jumlah belum lunas. Kartu diperbaiki untuk mencakup
  `issued` dan `partial`; aksi tabel dibuat sticky agar tetap mudah dijangkau.
- Tabel Pembelian Barang dan Riwayat Penerimaan memecah nomor dokumen/nominal
  menjadi beberapa baris pada viewport operator. Kolom identitas/nilai penting
  dibuat tidak membungkus.
- Pembatalan item packing memakai `FOR UPDATE OF packing_items` meskipun role
  operator tidak memiliki hak UPDATE pada tabel immutable tersebut. Lock kini
  hanya diambil pada sesi induk; stok, reservasi, movement, dan jurnal reversal
  tetap diproses atomik.
- Retur sebelumnya mengubah status, stok, bank, dan jurnal lewat beberapa call
  terpisah. Proses refund/tukar size kini satu RPC atomik dan menolak saldo/stok
  yang tidak cukup sebelum mutasi apa pun.
- Edit jurnal manual menghapus line lama lewat REST tanpa policy DELETE sehingga
  line baru sempat terduplikasi diam-diam. Update/delete jurnal kini memakai RPC
  atomik, hanya akun aktif leaf, dan total debit/kredit divalidasi ulang.
- Saldo buku besar mengecualikan jurnal berstatus `reversed`, padahal status itu
  adalah jurnal asli yang tetap harus dihitung bersama reversal entry. Query/RPC
  laporan kini mengecualikan draft saja; contra asset mengikuti normal balance.
- Activity Log mencatat event dengan baik, tetapi insert policy mengizinkan actor
  spoof dan tabel mendapat grant mutasi berlebih. Migration hardening membatasi
  insert ke `user_id = auth.uid()`, Owner-only read, serta grant SELECT/INSERT;
  UI mendapat filter operator/aksi lengkap, pagination, dan waktu WIB eksplisit.
- Smoke production menemukan sapaan Workspace dirender UTC di Vercel tetapi WIB
  di browser sehingga terjadi hydration mismatch. Sapaan kini server-rendered
  dengan timezone `Asia/Jakarta`; smoke ulang production menghasilkan 0 error.

## Bukti

- Lingkungan disposable Supabase: API `56321`, database `56322`; 53 tabel dan
  92 fungsi dari schema production. Seluruh transaksi simulasi tetap terisolasi;
  production hanya menerima migration additive yang sudah disetujui.
- Hari 01: 5 role sintetis, 2 akun kas/bank, supplier, customer, employee, dan
  tiga varian `(SIM-SAMBA-WHT, 40/42/42 2/3)` dibuat lewat UI.
- Hari 02: PO tunai Rp5.300.000, kredit Rp3.825.000, dan DP 50% Rp3.650.000;
  saldo BCA tepat Rp17.875.000 setelah approval.
- Hari 03: empat RCV termasuk penerimaan parsial `1 + 2`; stok menjadi
  `4/3/3`, HPP `1.300.000/1.250.000/1.200.000`, tanpa potongan bank ganda.
- Hari 04: dua faktur outstanding dilunasi dalam satu pembayaran Rp5.650.000;
  semua faktur vendor `paid`, saldo BCA Rp12.225.000.
- Hari 05: invoice manual Rp1.700.000 diterbitkan, stok size 40 turun `4 → 3`,
  penerimaan customer parsial Rp700.000 menyisakan piutang Rp1.000.000.
- Hari 06: checkout POS tunai, transfer, dan QRIS masing-masing satu item;
  stok tiga varian turun `3/3/3 → 2/2/2`, seluruh invoice POS `paid`, tujuan
  dana Kas Toko/BCA benar, dan 17 jurnal seluruhnya seimbang.
- Hari 07: order Shopee diimport tanpa mengurangi stok fisik, settlement masuk
  BCA dengan fee sesuai, pemetaan SKU berhasil, dan file update stok marketplace
  mendorong stok sistem ke channel (bukan menarik stok marketplace).
- Hari 08–09: pre-order melebihi stok membentuk reservasi + kebutuhan pembelian;
  penerimaan melengkapi kebutuhan, packing menolak size/order salah, sesi dapat
  dipulihkan/dibatalkan, dan status bergerak sampai dikirim tanpa double stock.
- Hari 10: refund serta tukar size melewati ajukan → verifikasi → proses; stok,
  HPP, refund bank, movement, dan jurnal berubah atomik.
- Hari 11: alasan selisih wajib, compare-only tidak mengubah stok, finalisasi
  opname menyesuaikan stok, dan POS membatasi qty maksimal stok tersedia.
- Hari 12: piutang/utang dilunasi, beban dibayar, transfer BCA→Kas, jurnal manual
  seimbang, dan rekonsiliasi menghasilkan saldo tepat.
- Hari 13: data karyawan edit/nonaktif/aktif lulus; payroll dengan komponen
  fleksibel direvisi, hutang gaji dan settlement tepat, slip individual terunduh.
- Hari 14: seluruh 11 kategori laporan berhasil dibuka/ekspor. Neraca seimbang
  Rp24.395.000 = Rp24.395.000 dan saldo akhir kas/bank cocok dengan mutasi.
- Pre-order WhatsApp `WA-UAT14-001` memakai referensi wajib, reservasi dikonsumsi
  oleh packing WhatsApp, stok turun satu, dan status order/line menjadi packed.
- Smoke headless Owner melintasi 51 route: seluruhnya HTTP 200, tanpa console
  error maupun page error. Finance, Gudang, dan Kasir juga lulus redirect akses;
  HPP tidak terserialisasi ke role non-finance.
- Invariant database clone: 0 stok negatif, 0 jurnal tidak balance, 0 mismatch
  header/line, 0 orphan line, 0 over-reservation, dan 0 packing tanpa outbound.
- Activity Log clone berisi 97 event/40 kombinasi aksi-entitas; production dibaca
  read-only via MCP berisi 38 event dengan 0 actor/action/entity kosong. Probe RLS
  membuktikan self-insert diterima, actor palsu ditolak, Finance 0 row, Owner bisa
  membaca, dan tidak meninggalkan fixture karena rollback.
- Enam migration `20260809154500` sampai `20260809164000` diterapkan melalui
  Supabase CLI ke project `jogqvffdjtjqdnflvubi`; dry-run sesudahnya melaporkan
  database up to date. MCP membuktikan 8 RPC tersedia, policy Activity Log actor
  terkunci ke `auth.uid()`, dan grant authenticated hanya SELECT/INSERT.
- Laporan production `UAT-0001` dibaca read-only melalui Supabase MCP pada
  project `jogqvffdjtjqdnflvubi`; status `selesai` dan daftar permintaan client
  dijadikan acceptance criteria lanjutan Hari 07–14.
- Screenshot tutorial privat sementara tersimpan di
  `/private/tmp/dewinst-14-day-operator-2026-08-09/` dengan nama bersih `00`–`87`.
- Modul lengkap 117 halaman, Modul Gudang 43 halaman, Modul Kasir 23 halaman,
  Modul Finance 55 halaman, serta Modul Verifikasi Production 55 halaman tersedia di
  `/Users/jhordideamarall/Downloads/Dewinst-Modul-Operasional-14-Hari-2026-08-09/`;
  seluruh PDF A4 landscape sudah dirender-sampling dan ZIP 62 MB lulus integrity
  check tanpa `__MACOSX`/`.DS_Store`.
- PR #22 di-merge sebagai `aa59ef2`; hotfix hydration PR #23 di-merge sebagai
  `bbdac3b`. Vercel production Ready dan alias `https://dewinst.vercel.app`
  menunjuk release final.
- Gate final: TypeScript lulus, ESLint 0 error/0 warning, production build lulus,
  serta smoke production ulang 51/51 route HTTP 200 dengan 0 application console
  error dan 0 page error. Ada 53 screenshot production bernama bersih dan berurutan.

## Blockers

- Tidak ada blocker release tersisa.

## Known Limitations

- Bootstrap database kosong memang belum didukung migration history aktif dan
  sudah dipisahkan sebagai Phase C pada dokumen rekonsiliasi 2026-07-26; release
  ini diverifikasi pada clone schema production, bukan `db reset` kosong.
- Supabase Advisor masih memuat warning historis/generik (SECURITY DEFINER,
  index/policy, dan leaked-password protection). RPC baru yang memakai definer
  sudah memiliki role gate, actor, search path, serta grant minimal; warning lama
  tetap perlu ditangani sebagai backlog terpisah agar tidak mengubah izin bisnis
  secara otomatis saat release operasional ini.

## Files Modified

- `apps/web/src/app/(dashboard)/activity-log/page.tsx`
- `apps/web/src/app/(dashboard)/inventory/page.tsx`
- `apps/web/src/app/(dashboard)/laporan-keuangan/*`
- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/app/(dashboard)/outbound/page.tsx`
- `apps/web/src/app/(dashboard)/panduan/page.tsx`
- `apps/web/src/app/(dashboard)/reports/page.tsx`
- `apps/web/src/components/buku-besar/*`
- `apps/web/src/components/dashboard/*`
- `apps/web/src/components/dashboard/greeting.tsx`
- `apps/web/src/components/employees/*`
- `apps/web/src/components/inventory/*`
- `apps/web/src/components/kas-bank/*`
- `apps/web/src/components/laporan-keuangan/*`
- `apps/web/src/components/outbound/*`
- `apps/web/src/components/payroll/*`
- `apps/web/src/components/pembelian/*`
- `apps/web/src/components/penjualan/*`
- `apps/web/src/components/pre-order/*`
- `apps/web/src/components/reports/*`
- `apps/web/src/components/returns/*`
- `apps/web/src/components/ui/shoe-size-picker.tsx`
- `apps/web/src/components/export-buttons.tsx`
- `apps/web/src/lib/actions/*`
- `apps/web/src/lib/export.ts`
- `apps/web/src/lib/queries/index.ts`
- `apps/web/supabase/migrations/20260809154500_fix_packing_item_cancel_lock.sql`
- `apps/web/supabase/migrations/20260809155500_atomic_return_inventory_accounting.sql`
- `apps/web/supabase/migrations/20260809162000_include_reversed_journals_in_balances.sql`
- `apps/web/supabase/migrations/20260809162500_atomic_manual_journal_mutations.sql`
- `apps/web/supabase/migrations/20260809163000_atomic_pre_order_lifecycle.sql`
- `apps/web/supabase/migrations/20260809164000_harden_activity_log_audit_trail.sql`
- `packages/shared/src/constants.ts`
- `packages/shared/src/types.ts`
- `packages/shared/src/validators.ts`
- `docs/PROJECT-GUIDE.md`
- `docs/manual-book.md`
