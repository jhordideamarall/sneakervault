# SneakerVault — Panduan Project & Cara Pakai (Handoff)

> Dokumen tunggal untuk: (a) memahami isi project, (b) cara pakai tiap fitur
> (simulasi aktivitas per role), (c) handoff untuk agent berikutnya. Terakhir
> diupdate: 2026-06-12.

---

## 1. Apa Ini

**SneakerVault** (brand UI: "Dewinst.id") — sistem manajemen gudang + akuntansi
sneaker, pengganti Accurate Online. Mengelola inventori, penjualan omnichannel
(POS offline + marketplace), pembelian, kas & bank, buku besar (SAK EMKM), dan
laporan keuangan. Fokus terbaru: **sinkronisasi marketplace berbasis file**
(Shopee, Tokopedia, TikTok) + **chip view-as-role** untuk owner.

### Tech Stack
- **Frontend/Backend:** Next.js 16 (App Router, Turbopack), React, TypeScript, Tailwind.
- **DB/Auth:** Supabase (Postgres + RLS + Auth). Project id MCP: `supabase-sneaker`.
- **Monorepo:** pnpm workspace + Turbo. App di `apps/web`; package source-only di `packages/*` (`ui`, `shared`, `supabase`, `barcode`) — di-transpile Next (`transpilePackages`), tidak ada build step terpisah.
- **Excel:** SheetJS (`xlsx`), dynamic import di browser.

### Jalankan Lokal
```bash
pnpm install
pnpm --filter @sneakervault/web dev    # atau: pnpm dev (turbo)
# buka http://localhost:3000
```
Env (`apps/web/.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`.

**UAT feedback module:** tombol "Lapor Masalah" (FAB) + menu Feedback UAT **tampil default** (fase UAT). Untuk menyembunyikan FAB pasca go-live, set `NEXT_PUBLIC_UAT_MODE=false` lalu redeploy (env `NEXT_PUBLIC_*` di-inline saat build, jadi perlu build ulang). `NEXT_PUBLIC_APP_VERSION` terisi otomatis dari `VERCEL_GIT_COMMIT_SHA` (fallback `dev` saat lokal) — dipakai sebagai konteks build di tiap laporan. Lihat `docs/superpowers/specs/2026-06-13-uat-feedback-module-design.md`.

### Login Demo (setelah reset DB 2026-06-12)
- **owner@sneakervault.com** — satu-satunya akun, role `owner`. (4 user demo lain sudah dihapus saat reset.)
- DB bersih: tanpa produk/transaksi. CoA (37 akun) + 14 kategori beban tetap ada.

---

## 2. Role & Hak Akses

5 role (enum DB `user_role`, konstanta `packages/shared/src/constants.ts`):

| Role | Label | View utama |
|---|---|---|
| `owner` | Owner | Semua |
| `admin_gudang` | Admin Gudang | Inventori, Barang Masuk, Stock Opname, Packing, Retur, Supplier |
| `admin_online` | Admin Online | Order, Invoice, Import/Export Marketplace, Customer, Terjual |
| `shopkeeper` | Shopkeeper (kasir) | POS Kasir, Order, **Inventori (cek stok)**, Packing |
| `finance` | Finance | Buku Besar, Kas & Bank, Laporan Keuangan, Pembelian, Settlement, Overview |

- **Sumber kebenaran akses:** `apps/web/src/config/permissions.ts` (`routePermissions` + `hasRouteAccess`).
- **Enforcement:** proxy (`apps/web/src/proxy.ts` → `packages/supabase/src/middleware.ts`) set header `x-pathname`; `(dashboard)/layout.tsx` panggil `hasRouteAccess` → redirect `/workspace` kalau tak boleh. Sidebar (`filterGroupsByRole`) sembunyikan menu yang tak boleh.
- **Field-level:** `canSeeHpp` / `canEditPrice` (owner+finance), dll di `permissions.ts`.

### Chip "View as Role" (owner-only)
Bar tipis di atas konten (muncul utk owner asli). Owner klik chip role → **seluruh app** render seperti role itu (sidebar + isi halaman + HPP). Tombol **Reset (Owner)** kembali penuh.
- Mekanisme: cookie `view_as_role`, di-overlay jadi *effective roles* di `getCurrentUserCached` (`apps/web/src/lib/auth-session.ts`). `real_roles` tetap disimpan utk gate aksi set/reset.
- Aman: hanya mempersempit (owner→role lebih rendah), tak escalate; DB RLS tetap sesi owner asli (preview = read/test).
- **Cara pakai:** login owner → klik chip "Finance"/"Admin Gudang"/dll di bar atas → cek view → klik **Reset (Owner)**.

---

## 3. Modul & Cara Pakai (Simulasi Aktivitas)

### A. Dasbor
- **/workspace** — landing semua role; quick action per role; owner dapat chart.
- **/overview** — analitik (stok fisik, nilai HPP, bestseller, grafik penjualan, laba-rugi per model). Owner + Finance.
- **/finance** — command center finance (layout terpisah). Owner + Finance.

### B. Gudang
1. **/inbound (Barang Masuk)** — scan barcode barang masuk → tambah stok. (owner, admin_gudang)
2. **/inventory (Inventori)** — daftar produk + stok + harga; cari produk. Kasir pakai ini untuk jawab "produk A ada/tidak". HPP hanya owner/finance.
3. **/inventory/opname (Stock Opname)** — hitung fisik, variance, approval owner.
4. **/outbound (Packing/Outbound)** — scan barcode untuk packing pesanan → kurangi stok → halaman Terjual.
5. **/returns (Retur)** — proses retur.
6. **/barcode-generate** — generate barcode.

### C. Penjualan
1. **/penjualan/pos (POS Kasir)** — penjualan offline. Atomic via RPC `pos_checkout` (invoice + stok + jurnal + pembayaran + bank dalam 1 transaksi). (owner, shopkeeper, finance)
2. **/penjualan/invoice** — daftar invoice penjualan.
3. **/orders (Order Masuk)** — pesanan masuk.
4. **/sold (Terjual)** — riwayat barang dikirim (silo packing, BUKAN semua penjualan — lihat catatan §5).
5. **/penjualan/import-marketplace** — **lihat §4.1**.
6. **/penjualan/export-stok** — **lihat §4.2**.
7. **/penjualan/settlement** — **lihat §4.3**.

### D. Pembelian (owner, finance)
PO → Penerimaan Barang → Faktur Pembelian → Bayar Vendor.

### E. Kas & Bank (owner, finance)
Akun Bank, Penerimaan, Pengeluaran, Mutasi, Rekonsiliasi.

### F. Buku Besar (owner, finance)
Chart of Accounts (37 akun seed), Jurnal Umum, Tutup Buku. Jurnal otomatis dari transaksi via `journal-engine.ts` (TS) atau `app_post_journal` (SQL, internal).

### G. Laporan (owner, finance)
Laporan Operasional, Neraca, Laba Rugi, Perubahan Ekuitas, Arus Kas.

### H. Master Data
Supplier (owner, admin_gudang, finance), Customer (owner, finance, admin_online).

### I. Audit & Pengaturan (owner)
Activity Log, Req. Hapus, **Sinkronisasi Data** (`/settings/data-sync` — cutover import awal), Pengaturan (user, dll).

---

## 4. Fitur Sinkronisasi Marketplace (BARU 2026-06-12)

Template referensi: `docs/marketplace-templates/`. Sistem = **single source of
truth**; owner pegang **kendali manual** (review diff + approve/remap).

### 4.1 Import Order Marketplace — `/penjualan/import-marketplace`
**Tujuan:** tarik laporan pesanan jadi invoice + jurnal + kurangi stok.
**Cara pakai (simulasi):**
1. Pilih tab channel: **Shopee / Tokopedia / TikTok** (= label sumber). Sistem tidak auto-switch; template harus sesuai tab yang dipilih.
2. Upload file Excel/CSV laporan pesanan dari Seller Center.
3. Sistem parse + **reconcile** → layar **Review Diff**: per order/baris tampil status
   - ✅ OK (SKU cocok, stok cukup) · ⚠️ stok kurang · ❌ SKU tak dikenal · 🔁 sudah diimport (skip).
4. Baris ❌ → klik **Petakan SKU** untuk produk existing, atau **Buat Produk** untuk bootstrap dari baris order → tersimpan ke `marketplace_sku_map` (diingat utk next import). Klik baris re-reconcile otomatis.
5. **Konfirmasi Import (N)** → commit hanya order "Siap" via RPC atomik `import_marketplace_order_atomic` (invoice+lines+stok+jurnal 1 transaksi). Batch dicatat ke `marketplace_imports` (kind=order).
- Idempotent: re-upload file yang sama → semua skip (dup-guard `marketplace_order_id`).
- Revenue per channel: Shopee 4.1.02, TikTok 4.1.03, Tokopedia 4.1.04.
- Baris order batal/cancel/refund/return tidak dibuat jadi invoice.
- Produk bootstrap dari order dibuat dengan stok awal sebesar qty order supaya import bisa lanjut; HPP default 0 dan review memberi warning bahwa COGS/laba belum final sampai HPP diisi lewat Barang Masuk, Stock Opname, atau cutover Accurate.
- File: `lib/marketplace/parsers.ts`, `lib/actions/marketplace-import.ts`, `components/penjualan/import-marketplace-client.tsx`.

### 4.2 Export Stok (Round-Trip) — `/penjualan/export-stok`
**Tujuan:** dorong stok sistem ke marketplace agar sinkron.
**Cara pakai (simulasi):**
1. Pilih channel: **Shopee** (Mass Update) / **TikTok** (Batch Edit). Sistem memvalidasi template sesuai tab, bukan auto-detect.
2. Download template "Mass Update / Batch Edit" dari Seller Center → upload di sini.
3. Sistem cocokkan `seller_sku ↔ products.sku` (+ `marketplace_sku_map`) → tampil ringkasan (cocok / tidak ada di sistem).
4. (Opsional) centang "Ikut update harga jual".
5. **Generate** → file `.xlsx` ter-download (struktur asli dipertahankan, hanya kolom stok/harga ditimpa; product_id/variation_id marketplace tetap dari file).
6. Upload file hasil balik ke Seller Center.
- Read-only (tak menulis DB). File: `lib/marketplace/export.ts`, `lib/actions/stock-export.ts`, `components/penjualan/export-stok-client.tsx`.
- Catatan: Tokopedia export menyusul (template stok/update produk Tokopedia belum disediakan). Template TikTok yang tersedia saat ini masih instruction-only bila tidak berisi row SKU produk.
- Jika inventory kosong, mulai dari `/inventory` → **Import Produk**. Modal ini bisa bootstrap produk dari template internal, Shopee Mass Update, TikTok Batch Edit, atau report Tokopedia berisi SKU. HPP hasil bootstrap marketplace = 0 sampai diisi lewat Barang Masuk/Stock Opname/cutover Accurate.
- Shopee Mass Update sering tidak punya seller SKU per variasi; sistem membuat key internal per variasi dari product/variation data dan menyimpan `marketplace_sku_map` agar upload template yang sama bisa match di round-trip berikutnya.

### 4.3 Settlement Sekali Import — `/penjualan/settlement` (owner, finance)
**Tujuan:** rekonsiliasi pencairan dana marketplace ke finance. Upload **1x** saat dana sudah dilepas/cair.
**Cara pakai (simulasi):**
1. Pilih channel.
2. Upload file settlement → layar review (akan diterapkan / dilewati / tak ada invoice).
3. Pilih **bank tujuan**, tanggal cair, no. referensi.
4. **Terapkan** → RPC atomik `settle_marketplace_atomic`.
   - Membuat `customer_payments` + `customer_payment_allocations` supaya muncul di **Penerimaan Penjualan**.
   - Mark invoice `paid`, `settlement_status = released`, `paid_amount = total`.
   - Dr Bank (net cair) + Dr/Cr 6.1 selisih biaya marketplace aktual ; Cr 1.1.04 Piutang.
- Idempotent (skip invoice yang sudah settlement/terbayar). **Tidak menyentuh stok** (hindari double-count vs packing).
- Format settlement ketat per channel tapi aman untuk workbook multi-sheet resmi:
  - Shopee: baca sheet `Income` dengan kolom `No. Pesanan` + `Total Penghasilan`.
  - TikTok/Tokopedia: baca sheet `Detail pesanan` dengan kolom `ID Pesanan/Penyesuaian` + `Jumlah penyelesaian pembayaran` + `Total Biaya`.
  - Sheet ringkasan/penjelasan/detail fee diabaikan supaya angka tidak dobel. Custom Excel bebas tidak didukung.
- File: `lib/marketplace/settlement-parsers.ts`, `lib/actions/settlement-import.ts`, `components/penjualan/settlement-import-client.tsx`, migrasi `20260612000200_settle_marketplace_atomic.sql`.

---

## 5. Catatan Arsitektur Penting
- **Silo Terjual vs Akuntansi** (`docs/data-flow-map.md` §7): Packing → `packing_sessions` → halaman **Terjual** (fulfillment). POS/Invoice/Import → `sales_invoices` → Laporan Keuangan. **Dua jalur tidak sinkron.** Import marketplace bikin invoice + kurangi stok TAPI tidak bikin packing_session. Settlement hanya finansial. Jangan packing manual order yang sudah diimport (double-decrement).
- **Atomicity:** transaksi multi-write pakai RPC PL/pgSQL (`pos_checkout`, `import_marketplace_order_atomic`, `settle_marketplace_atomic`) + `app_post_journal` (poster jurnal balanced internal). Migrasi divergence: **verifikasi objek via MCP sebelum migrate**; semua DDL additive + idempotent.
- **Tabel baru:** `marketplace_sku_map` (jembatan SKU, learned), `marketplace_imports` (audit batch, kolom +kind/file_name/match counts), kolom `sales_invoices.settlement_*`.

---

## 6. Deploy ke Vercel (Demo)
1. Import repo ke Vercel. **Framework:** Next.js.
2. **Root Directory:** `apps/web` (Vercel auto-detect pnpm workspace + transpile packages; tak perlu build packages).
3. **Build Command:** default (`next build`). **Install:** default (`pnpm install`).
4. **Environment Variables** (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` (isi domain Vercel setelah deploy, mis. `https://xxx.vercel.app`)
5. Deploy. Login demo: `owner@sneakervault.com`.
- Build lokal terverifikasi hijau (`pnpm --filter @sneakervault/web build`).

---

## 7. Status & Handoff untuk Agent Berikutnya

### Selesai (2026-06-12)
- Pondasi DB marketplace sync (sku_map, staging, settlement cols, RPC, enum tokopedia, CoA 4.1.04).
- Chip view-as-role (cookie, owner-only, anti-lockout).
- Import order per-marketplace + review diff + Tokopedia + learned SKU map; template validasi per tab dan skip baris batal/refund/return.
- Export stok round-trip (Shopee + TikTok), dengan template Shopee nyata dan TikTok batch edit nyata terverifikasi untuk deteksi kolom.
- Settlement sekali import → Penerimaan Penjualan + finance.
- Fix bug: `/overview` query owner-only (`getDashboardStats`/`getBestsellers`/`getMonthlySales`) → `requireOwnerOrFinance` (finance & preview-finance tak lagi error).
- Reset DB (1 owner, slate bersih).
- Artifacts: `artifacts/026..031`, `artifacts/034-marketplace-template-finance-alignment`.

### Pending / Perlu Diperhatikan
- **E2E browser dengan upload/download nyata belum dijalankan.** Parser order sudah diuji offline dengan file Shopee/TikTok/Tokopedia di `docs/marketplace-templates`; export stok sudah diuji offline dengan template Shopee/TikTok; parser settlement sudah membaca workbook multi-sheet resmi Shopee (`Income`) dan TikTok/Tokopedia (`Detail pesanan`).
- RPC marketplace belum di-smoke-test runtime (butuh sesi auth; mirror pola `pos_checkout` yang terbukti).
- Tokopedia **export stok** belum (template stok belum ada).
- Jika muncul "view error" saat preview role: penyebab umum = page diizinkan ke role X tapi query internal `requireOwner()` throw. Pola fix: samakan gate query dengan `routePermissions`, atau sembunyikan section owner-only (lihat fix `/overview`). Audit lain bila perlu: `grep "requireOwner()" apps/web/src/lib/queries/index.ts` lalu cek page pemakainya vs matrix.

### File Kunci (peta cepat)
- Akses: `apps/web/src/config/permissions.ts`, `proxy.ts`, `app/(dashboard)/layout.tsx`, `components/dashboard/sidebar.tsx`.
- Auth/role + view-as: `lib/auth-session.ts`, `lib/actions/view-as.ts`, `components/dashboard/view-as-banner.tsx`.
- Marketplace: `lib/marketplace/*`, `lib/actions/{marketplace-import,stock-export,settlement-import}.ts`, `components/penjualan/{import-marketplace,export-stok,settlement-import}-client.tsx`.
- Migrasi baru: `apps/web/supabase/migrations/20260612000000..000200_*.sql`.
- Jurnal: `lib/journal-engine.ts` (TS) + `app_post_journal` (SQL).
