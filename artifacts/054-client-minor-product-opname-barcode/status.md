# Penyesuaian Minor Produk, Stock Opname, dan Cetak Barcode

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** Client Review Follow-up
**Tanggal Mulai:** 2026-08-25
**Tanggal Selesai:** 2026-08-25

## Tasks
- [x] Audit kontrak produk, barcode, stock opname, dan reset demo yang berjalan
- [x] Tambahkan create batch SKU dengan beberapa variant secara atomik
- [x] Sinkronkan edit field bersama per SKU dan kunci barcode setelah dibuat
- [x] Hubungkan kamera dan input manual stock opname ke increment Supabase
- [x] Ubah halaman barcode menjadi antrean cetak multi-produk dengan ukuran mm
- [x] Hapus action generate/regenerate barcode dan amankan script reset demo
- [x] Tambahkan regression test serta jalankan type-check, lint, build, dan pemeriksaan database
- [x] Padatkan form multi-size dengan harga channel di bagian lanjutan
- [x] Tambahkan alur size baru dari modal edit produk
- [x] Jalankan regression UI dan deploy follow-up ke production

## Blockers
- (kosong)

## Files Modified
- `artifacts/054-client-minor-product-opname-barcode/status.md`
- `docs/superpowers/2026-08-25-client-minor-product-opname-barcode.md`
- `apps/web/supabase/migrations/20260824191318_client_product_opname_barcode_hardening.sql`
- `apps/web/supabase/tests/20260825_client_product_opname_barcode.sql`
- `apps/web/src/lib/actions/products.ts`
- `apps/web/src/lib/actions/stock-opname.ts`
- `apps/web/src/lib/actions/barcode.ts`
- `apps/web/src/components/inventory/inventory-client.tsx`
- `apps/web/src/components/inventory/edit-product-modal.tsx`
- `apps/web/src/components/inventory/stock-opname-client.tsx`
- `apps/web/src/components/scanner/camera-scanner.tsx`
- `apps/web/src/app/(dashboard)/barcode-generate/page.tsx`
- `apps/web/src/app/(dashboard)/inventory/opname/page.tsx`
- `apps/web/src/components/dashboard/sidebar.tsx`
- `apps/web/src/components/dashboard/right-sidebar-slot.tsx`
- `apps/web/src/app/(dashboard)/panduan/page.tsx`
- `packages/shared/src/validators.ts`
- `packages/supabase/src/types.ts`
- `scripts/reset-demo-db.sql`

## Verification

- `pnpm --filter @sneakervault/web type-check` — lulus
- `pnpm --filter @sneakervault/web lint` — lulus tanpa warning
- `pnpm --filter @sneakervault/web build` — lulus, 30 static pages selesai dibuat
- `git diff --check` — lulus
- `supabase db push --dry-run --linked` sebelum deploy — hanya mendeteksi migration baru ini
- Regression migration + SQL dijalankan terhadap project terhubung dalam transaksi `BEGIN ... ROLLBACK` — lulus; sesudah rollback tetap 2 produk, 3 profile, 46 COA, 14 kategori biaya, 6 app settings, 12 periode fiskal, 3 rekening bank, dan 0 preferensi notifikasi
- Browser smoke Playwright — lulus untuk batch add multi-size, barcode read-only, antrean cetak multi-produk, ukuran label mm, layout stock opname 390px, input manual, dan pembukaan kamera dengan fake media device; tidak ada page error
- Follow-up UX: type-check, lint, build, dan `git diff --check` lulus; browser smoke desktop + 390px memastikan tiga baris size tetap ringkas, harga marketplace progressive disclosure, serta modal edit menyediakan tab Tambah size
- Regression SQL diperluas untuk alur Tambah size dan lulus dalam transaksi rollback; sesudahnya tetap 2 produk, 3 profile, 46 COA, 14 kategori biaya, 6 app settings, 12 periode fiskal, dan 3 rekening bank

## Production Deployment

- Migration `20260824191318` diterapkan ke Supabase production dan tercatat sinkron pada migration history.
- Regression SQL dijalankan ulang terhadap schema production dalam transaksi rollback — lulus.
- Verifikasi production: 2 produk dan seluruh akun/config tetap utuh; kedua RPC dan trigger barcode aktif; `anon` tidak memiliki execute dan `authenticated` memiliki execute.
- Vercel deployment `dpl_H5rkA5ujBTwNj6jTGqkgK7XG5tjR` berstatus Ready dan dipromosikan ke `https://dewinst.vercel.app`.
- Browser smoke pada domain production lulus seluruh alur UI di atas tanpa page error.
- Follow-up deployment `dpl_DmyQ7XrZ4yToMJKeowCcS1uFWQH6` berstatus Ready dan aktif di `https://dewinst.vercel.app`; smoke test production untuk UX ringkas dan Tambah size lulus tanpa mutasi data bisnis.
- `supabase db lint` masih mendeteksi empat error lama pada fungsi marketplace/payroll/POS yang memakai temporary table; fungsi baru tidak menghasilkan temuan.
