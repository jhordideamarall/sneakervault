# Plan: Menutup Gap Brief PDF Dewinstsneakers → Dewins.id

> **Status:** ✅ Core plan executed locally; operational hardening migration prepared locally (2026-06-02)
> **Tanggal:** 2026-06-01
> **Sumber gap:** `scoop website gudang dewinst.pdf` (brief final klien, budget Rp20jt)
> **Acuan terkait:** `artifacts/018-production-readiness-gaps/status.md`, `docs/prd.md`, `docs/pos-implementation-plan.md`

---

## Catatan untuk Executor (mis. Codex)

Plan ini ditulis untuk dieksekusi oleh agent lain. Sebelum coding, **wajib**:
1. Baca `CLAUDE.md` (root) — Safety Rules: schema HANYA via **migration file baru** (jangan edit migrasi lama), tidak ada operasi destruktif tanpa konfirmasi, baca file sebelum mengubah.
2. **Audit MCP Supabase dulu tiap phase** (server `supabase-sneaker`, project `jogqvffdjtjqdnflvubi`) — `list_tables`/`execute_sql` untuk verifikasi schema live SEBELUM bikin migrasi. Fakta schema yang sudah diverifikasi 2026-06-01 ada di section **Audit Findings** di bawah (anggap masih berlaku, tapi re-verify cepat).
3. Buat **artifact folder** `artifacts/{nnn}-{nama}/status.md` per phase (mulai `019`), update progress.
4. RLS baru pakai pola `(select auth.uid())` / `(select has_any_role(...))`; RPC baru `revoke execute from anon`; bucket baru tanpa broad listing policy.
5. Reuse-first — jangan tulis ulang yang sudah ada (lihat **Prinsip Wajib #2** untuk daftar fungsi/RPC reusable + path).
6. Build hijau (`pnpm build`) + verifikasi via MCP (jurnal balance, stok benar, RLS) sebelum tutup phase.

---

## Context

Brief PDF adalah scope final klien. Setelah dipetakan ke codebase `vault` (Next.js + Supabase monorepo), core ekosistem akuntansi **sudah solid & reusable** (pembelian → persediaan → auto-journal → laporan keuangan), tapi ada gap fitur yang di brief bersifat **wajib/primary** namun belum dibangun atau salah-label:

- 🔴 **Modul Pengeluaran/Beban** (PDF §7, §6.8): `/kas-bank/pengeluaran` sekarang cuma list debit bank — belum ada kategori beban, approval, upload bukti, audit, jurnal beban.
- 🔴 **POS Kasir Offline** (PDF §6.4): hanya invoice-based, belum ada kasir scan→cart→bayar→struk.
- 🔴 **Stock Opname** (PDF §6.11): `/inbound` (label "Stock Opname") sebenarnya barang-masuk scan; cycle-count + selisih + approval belum ada.
- 🟡 **Lock Periode / Tutup Buku** (PDF §6.12): tabel `fiscal_periods` ada & enforcement read-only parsial di jurnal, tapi belum ada aksi lock/unlock + audit.
- 🟡 **Import Engine** (PDF §6.5, artifact 018 §1.1–1.2): action `bulkImportMarketplaceOrders` sudah jalan, tapi **parser file (xls/csv/pdf) belum ada**; migrasi data Accurate belum ada.
- 🟡 **Polish**: order status state machine, laporan biaya marketplace & profit-per-channel, widget dashboard.

**Outcome:** Sistem memenuhi seluruh scope + Kriteria Sukses PDF §12, siap cutover dari Accurate.

**Keputusan eksekusi (dari diskusi):**
- Jalan **2 track paralel** (A: modul transaksi, B: import & polish).
- Modul Beban = **perluas `/kas-bank/pengeluaran`** (tetap di grup Kas & Bank), bukan menu baru.
- **Import 100% non-AI.** Detail parser **di-outline saja di fase-nya, dikerjakan nanti**.

---

## Audit Findings (MCP-verified, 2026-06-01)

Hasil audit langsung ke Supabase project `jogqvffdjtjqdnflvubi` (31 tabel, semua RLS on, DB masih **kosong/0 row** — fresh, belum ada data produksi).

**Konfirmasi GAP (tabel TIDAK ada → butuh migrasi baru):**
- `expenses`, `expense_categories` — **tidak ada** → Phase A1.
- `stock_opname_sessions`, `stock_opname_lines` — **tidak ada** → Phase A3.

**Pondasi yang SUDAH ada (mengurangi effort besar):**
- `user_role` = `owner, admin_gudang, admin_online, shopkeeper, finance` (5 role ✅).
- `payment_method` enum = `cash, bank_transfer, marketplace, other` ✅ (POS langsung pakai).
- `customer_payments` sudah punya `payment_method`, `bank_account_id`, `attachment_url`, `reference_no` → **POS tinggal reuse** `createSalesInvoice`+`customer_payments`.
- `sales_invoices.channel` = customer_channel (`wa, shopee, tiktok, offline, website, mixed`) ✅; `status` = `draft, issued, partial, paid, cancelled`.
- `stock_movement_type` punya `adjustment` ✅; `journal_source` punya `stock_adjustment`, `opening_balance`, `closing` ✅ → opname & saldo awal & tutup buku siap.
- `returns` exchange-size lengkap (`original_size/new_size`, `original_product_id/new_product_id`) ✅.
- `fiscal_periods` ada: `year, month, status(open|closed), closed_by, closed_at, notes` → **lock = set `closed`**; tabel siap, tinggal aksi + enforcement.
- CoA 32 akun seeded (SAK EMKM). Beban (`type=expense`) yang ADA: `6.1` Adm Marketplace, `6.2` Diskon & Promosi, `6.3` Pengiriman, `6.4` Operasional, `6.5` Gaji, `6.6` Penyusutan, `6.7` Penyesuaian Stok.
- RPC siap pakai: `decrement/increment_product_quantity`, `search_products_fuzzy`, `recalculate_hpp_by_sku`, `generate_{po,sales_invoice,purchase_invoice,vendor_payment,customer_payment,journal_entry}_number`, `has_any_role/has_role/get_my_roles`. Ekstensi `pg_trgm` aktif (fuzzy search).

**Penyesuaian plan akibat audit:**
1. **A1 (Beban)**: CoA beban cuma 7 akun. PDF "Kategori pengeluaran **minimal**" = **14 kategori verbatim** (Gaji, Sewa toko/gudang, Listrik & internet, Packing, Kardus/plastik/bubble wrap, Adm marketplace, Iklan Shopee/TikTok/IG, Ongkir/subsidi ongkir, Transport, Software/tools, Refund/komplain, Service/perbaikan, Makan/operasional, Lain-lain). Kata "minimal" = baseline → **`expense_categories` dibuat CRUD-able** (owner bisa tambah/edit/hapus), **di-seed 14 baris** itu, tiap kategori **map ke `account_code` CoA**. Tambah ~4 akun CoA baru (`6.8` Beban Sewa, `6.9` Beban Iklan/Pemasaran, `6.10` Beban Utilitas Listrik/Internet, `6.11` Beban Lain-lain) supaya Laba Rugi rapi (sisanya map ke `6.4` Operasional / `6.3` Pengiriman / `6.1` Adm Marketplace / `6.5` Gaji). **Tambah nilai enum `journal_source`='expense'** (belum ada). `generate_expense_number` RPC baru.
2. **A4 (Lock Periode)**: lebih ringan dari estimasi — `fiscal_periods` sudah ada. `reopen` perlu audit (tidak ada kolom `reopened_by` → pakai `activity_logs`). Enforcement `isPeriodLocked(date)` wajib dipasang di SEMUA action transaksi.
3. **B1 (Import marketplace)**: `marketplace_imports` ternyata **model batch settlement** (period, total_gmv/fee/net), BUKAN per-order. Jalur per-order tetap lewat `sales_invoices.marketplace_order_id` (dedup) via `bulkImportMarketplaceOrders` yang sudah ada. `marketplace_type` enum: `shopee, tiktok, tokopedia, lazada, other`.
4. **B4 (Order status)**: status order PDF §6.5 terbagi 2 sistem — pembayaran (`sales_invoices.status`) + fulfillment (`packing_sessions.session_status` = `packing, shipped, completed, has_return, cancelled`). `/orders` = view packing sessions. Tugasnya **menyatukan timeline**, bukan bangun ulang.
5. **Laporan (B4)**: `/reports` operasional cover HPP/Profit/Retur/Penjualan; `/laporan-keuangan` cover Neraca/LR/Arus Kas/Ekuitas + export. **Belum ada**: kartu stok formal, laporan biaya marketplace, profit per channel, laporan pengeluaran per kategori (nyambung A1). `lib/export.ts` (`exportToPDF` jsPDF+autoTable, `exportToExcel` XLSX) reusable untuk semua.

**Advisor (non-blocking, jadi pedoman saat bikin objek baru):**
- Security: semua **WARN** (tak ada CRITICAL). Banyak "SECURITY DEFINER executable by authenticated" (desain server-action, sudah di-harden parsial Phase 6) → RPC baru ikuti pola: `revoke execute from anon/public`. Leaked-password protection OFF (toggle di Auth). Bucket `chat-attachments` listing terlalu luas → **bucket `expense-receipts` baru jangan pakai broad SELECT/listing policy**.
- Performance: 113 "Unused Index" (INFO, wajar DB kosong), **9 "Auth RLS Init Plan" (WARN)** → **RLS baru WAJIB pakai pola `(select auth.uid())` / `(select has_any_role(...))`** biar tidak re-eval per row. 7 duplicate index + 2 multiple-permissive (minor).

---

## Prinsip Wajib (berlaku di SETIAP phase)

1. **MCP Supabase audit DULU** sebelum nulis kode. Banyak tabel/enum/CoA/`fiscal_periods` hanya ada di migrasi yang di-apply via MCP (tidak di file SQL lokal) — jangan berasumsi dari SQL lokal. Audit: `list tables`, kolom, enum, RLS policy, RPC functions, triggers, seed CoA, storage buckets. (User connect MCP saat eksekusi.)
2. **Reuse-first.** Manfaatkan yang sudah ada:
   - `apps/web/src/lib/journal-engine.ts` — `createJournalEntry`, template per transaksi, `reverseJournalBySource`. CoA beban sudah ada: `6.1` Adm Marketplace, `6.2` Diskon, `6.3` Pengiriman, `6.7` Beban Penyesuaian Stok. `source_type` sudah ada `stock_adjustment`.
   - `apps/web/src/lib/actions/sales-invoices.ts` — `createSalesInvoice(input,{issue:true})` sudah handle stock-decrement + journal + movements (basis POS).
   - `apps/web/src/lib/actions/marketplace-import.ts` — `bulkImportMarketplaceOrders` (dedup, resolve SKU, cek stok, journal) → tinggal disuapi parser.
   - `apps/web/src/lib/actions/returns.ts` — exchange-size (`new_product` swap) sudah ada.
   - RPC: `decrement_product_quantity`, `increment_product_quantity`, `search_products_fuzzy`, `recalculate_hpp_by_sku`. `stock_movements` = kartu stok.
   - `apps/web/src/lib/export.ts` — export PDF/Excel (struk + laporan).
3. **Schema lewat migration file BARU** (CLAUDE.md). Jangan edit migrasi lama. Tidak ada operasi destruktif tanpa konfirmasi eksplisit.
4. **Tiap phase = 1 artifact folder** `artifacts/{nnn}-{nama}/status.md` (aturan tracking CLAUDE.md), update progress per task. Mulai dari `019`.
5. **Verifikasi via MCP setelah tiap phase**: `journal_entries.total_debit = total_credit`, `product.quantity` benar, RLS menolak role tak berhak, lock periode efektif.
6. **Build hijau** (`pnpm build` / `tsc`) sebelum tutup phase.

---

## Jawaban Import xls/csv/pdf + markitdown (final, NON-AI)

- **xls/csv → SheetJS** (`xlsx` sudah terpasang). In-app, non-AI, paling presisi. Menutup ~95% kebutuhan (Shopee & TikTok export Excel/CSV).
- **pdf → deterministik non-AI**: markitdown (mode konversi non-AI) ATAU lib pdf Node ubah PDF→teks, lalu **parser template berbasis aturan per format** (Shopee settlement, rekening BCA). markitdown bisa tanpa AI — AI di markitdown hanya opsional untuk caption gambar.
- **AI = out of scope** (opsional masa depan, hanya bila perlu handle PDF berformat tak terduga). App tetap non-AI.
- Detail mapping kolom/template parser **dirancang saat masuk Phase B1/B3**.

---

## Phase 0 — Baseline Schema Audit via MCP Supabase (prasyarat semua track) — ✅ SELESAI 2026-06-01

> Sudah dijalankan via MCP `supabase-sneaker`. Hasil terdokumentasi di section **Audit Findings** di atas. Tidak ada kejutan yang membatalkan plan; semua asumsi gap terkonfirmasi.

Tujuan: peta schema live yang akurat sebelum bikin migrasi apa pun.

- Connect MCP Supabase, dump: semua tabel + kolom, enum (`user_role`, `return_type`, `return_status`, `stock_movement_type`, `customer_channel`, dll), RLS policies, RPC functions, triggers, seed `chart_of_accounts` (kode + nama), struktur `fiscal_periods`, `sales_invoices.status` values, `marketplace_imports`, `customer_payments` (ada kolom metode bayar?), storage buckets.
- Reconcile vs migrasi lokal `apps/web/supabase/migrations/*`. **Cek eksistensi**: tabel `expenses`/`expense_categories`? `stock_opname_*`? kolom lock di `fiscal_periods`? `stock_movement_type` punya `adjustment`?
- Output: `artifacts/019-pdf-scope-gap/schema-baseline.md` (jadi acuan migrasi tiap phase).

---

## TRACK A — Modul Transaksi

### Phase A1 — Modul Pengeluaran/Beban (PDF §7, §6.8) — perluas `/kas-bank/pengeluaran`
- **MCP audit**: cek tabel `expenses`/`expense_categories` (kemungkinan belum ada), kode CoA beban `6.x`, bucket storage.
- **Schema (migration baru)**:
  - `expense_categories` (**CRUD-able**, di-seed **14 kategori verbatim PDF "minimal"**: gaji karyawan, sewa toko/gudang, listrik & internet, biaya packing, kardus/plastik/bubble wrap, adm marketplace, iklan Shopee/TikTok/IG, ongkir/subsidi ongkir, transport, software/tools, refund/komplain, service/perbaikan, makan/operasional, lain-lain) — tiap kategori map ke `account_code` CoA; owner bisa tambah kategori baru via UI.
  - `expenses` (no_transaksi, tanggal, category_id, deskripsi, nominal, metode_bayar, bank_account_id, bukti_url, `status` enum `draft|approved|paid|rejected`, created_by, approved_by, created_at, updated_at) + RLS + RPC `generate_expense_number`.
  - Storage bucket `expense-receipts` (reuse pola `20260510180616_setup_chat_storage.sql`).
- **Backend**:
  - `journal-engine.ts`: tambah `journalForExpense({category_account_code, amount, bank_account_id})` → Dr Beban kategori / Cr Kas-Bank; tambah `source_type: "expense"`.
  - `apps/web/src/lib/actions/expenses.ts` (baru): `createExpense` (draft), `submitExpense`, `approveExpense` (owner/finance), `payExpense` → journal + catat `bank_transactions` (debit), `rejectExpense`, void → `reverseJournalBySource`. Semua + `logActivity`.
- **Frontend**: enhance `apps/web/src/app/(dashboard)/kas-bank/pengeluaran/page.tsx` → tab (Daftar Beban | Input Beban | Kategori), form kategori + upload bukti + tombol approval, badge status, filter kategori/periode.
- **Permissions** (`config/permissions.ts`): input admin/finance; approve owner/finance.
- **Verify (MCP)**: expense `paid` → jurnal balance (Dr `6.x` / Cr `1.1.0x`), saldo bank turun, laba-rugi terupdate.

### Phase A2 — POS Kasir Offline (PDF §6.4) — `/penjualan/pos` (baru)
- **MCP audit**: konfirmasi `decrement_product_quantity`, `search_products_fuzzy`, `sales_invoices.channel` punya `offline`, struktur `customer_payments` (+ metode bayar).
- **Backend** (mayoritas reuse): `apps/web/src/lib/actions/pos.ts` (baru) `posCheckout(cart, payment)` → panggil `createSalesInvoice({channel:'offline', issue:true})` + `createCustomerPayment` (cash/transfer/QRIS) 1 langkah. Tambah kolom `payment_method` bila perlu (cek MCP).
- **Frontend**: `apps/web/src/app/(dashboard)/penjualan/pos/` — input scan barcode (reuse `packages/barcode` + search RPC), grid/search produk, cart Zustand, qty/diskon, tombol metode bayar, checkout, **struk PDF** (reuse `export.ts`, layout thermal). Role: shopkeeper.
- **Sidebar**: tambah item "POS Kasir" di grup Penjualan (`components/dashboard/sidebar.tsx`).
- **Verify (MCP)**: checkout → stok turun, `sales_invoice` issued+paid, jurnal posted, `customer_payment` tercatat.

### Phase A3 — Stock Opname (PDF §6.11) — `/inventory/opname` (baru) + perbaiki label `/inbound`
- **MCP audit**: cek tabel `stock_opname_*`, `stock_movement_type` punya `adjustment`, CoA `6.7` ada.
- **Schema (migration baru)**: `stock_opname_sessions` (no, status `open|counting|review|approved`, started_by, approved_by, tanggal), `stock_opname_lines` (product_id, system_qty snapshot, physical_qty, variance, reason) + RLS + `generate_opname_number`.
- **Backend**: `apps/web/src/lib/actions/stock-opname.ts` (baru): `startOpname` (snapshot qty produk terfilter), `inputPhysicalCount`, `computeVariance`, `approveOpname` (owner) → set `product.quantity` + `stock_movements(type:adjustment)` + `journalForStockAdjustment` (Dr/Cr `1.1.05` Persediaan vs `6.7`). Tambah template jurnal (source_type `stock_adjustment` sudah ada).
- **Frontend**: `/inventory/opname` — mulai sesi, grid hitung (system vs fisik, variance auto), input alasan, approve owner, export. **Sidebar**: rename `/inbound` jadi "Barang Masuk", tambah "Stock Opname" → `/inventory/opname`.
- **Verify (MCP)**: variance → jurnal adjustment balance, stok = fisik, riwayat opname tersimpan.

### Phase A4 — Lock Periode / Tutup Buku (PDF §6.12)
- **MCP audit**: kolom `fiscal_periods` (status/locked/start/end/locked_by), enforcement existing di `components/buku-besar/journal-client.tsx` & `account-ledger-client.tsx`.
- **Backend**: `apps/web/src/lib/actions/fiscal-periods.ts` (baru): `closePeriod(year,month,reason)` lock, `reopenPeriod` (owner, reason) + audit. Helper `isPeriodLocked(date)` dan enforce di SEMUA action transaksi (purchase, sales, expense, opname, jurnal manual, vendor/customer payment) — tolak `entry_date` di dalam periode terkunci.
- **Frontend**: `/buku-besar/periode` (atau tab Settings) — daftar periode, lock/unlock + reason, audit trail.
- **Verify (MCP)**: lock bulan → jurnal/invoice tanggal itu ditolak; unlock tercatat di log.

---

## TRACK B — Import & Polish

### Phase B1 — Import Engine: xls/csv (PDF §6.5, 018 §1.1) — `/penjualan/import-marketplace`
> Action `bulkImportMarketplaceOrders` SUDAH ada. Yang dibangun: **parser + UI**. Detail parser dirancang saat masuk fase ini.
- **MCP audit**: `marketplace_imports`, unique `sales_invoices.marketplace_order_id`, index `products.sku`.
- **Outline build (non-AI)**: SheetJS baca Excel/CSV → **template mapping per format** (Shopee, TikTok) → `MarketplaceOrder[]` → tabel preview + highlight duplikat → panggil `bulkImportMarketplaceOrders` → laporan error per baris.
- **Frontend**: dropzone upload, pilih format, preview mapping, import + ringkasan hasil.
- **Verify (MCP)**: invoice masuk, tanpa dobel, stok turun, jurnal balance.

### Phase B2 — Import Engine: master data + saldo awal Accurate (018 §1.2)
- **MCP audit**: kolom `products`/`customers`/`suppliers`, kode `chart_of_accounts`, `source_type: opening_balance`.
- **Outline build (non-AI)**: importer SheetJS generik untuk produk (+HPP), customer, supplier; builder **opening-balance journal** (Dr/Cr per CoA pada tanggal cutoff). Verifikasi trial-balance vs Accurate.
- **Verify (MCP)**: trial balance match, neraca benar di cutoff.

### Phase B3 — Import Engine: PDF deterministik non-AI (sekunder)
- **MCP audit**: struktur `bank_transactions` untuk import rekening koran.
- **Outline build (non-AI)**: markitdown (Python sidecar/script, mode non-AI) ATAU lib pdf Node → teks → **parser template per format** (Shopee settlement PDF, BCA rekening koran) → baris terstruktur → bulk import / rekonsiliasi. 1 template per format dikenal. **Keputusan markitdown-Python vs Node-pdf-lib diambil di fase ini** (pilih dari simplicity deploy). AI out of scope.
- **Verify (MCP)**: baris hasil parse cocok PDF, rekonsiliasi match `bank_transactions`.

### Phase B4 — Polish: order status + laporan + dashboard (PDF §6.5, §9, §10, §4)
- **MCP audit**: enum status `sales_invoices`/orders; query reports; cakupan query dashboard.
- **Build**: lengkapi state machine status order (belum bayar→bayar→diproses→packing→dikirim→selesai→retur→batal); tambah laporan kurang (biaya marketplace, profit per channel, kartu stok) bila absen; pastikan semua laporan export Excel+PDF (`export.ts`); verifikasi widget dashboard (stok defect, slow-moving, stok rendah, terlaris, order pending, retur pending, grafik laba).
- **Verify (MCP)**: angka laporan nyambung ke jurnal/movements.

---

## Critical Files

- `apps/web/src/lib/journal-engine.ts` — tambah `journalForExpense`, `journalForStockAdjustment`, source_type `expense`
- `apps/web/src/lib/actions/{expenses,pos,stock-opname,fiscal-periods}.ts` — baru
- `apps/web/src/lib/actions/{sales-invoices,marketplace-import,returns}.ts` — reuse
- `apps/web/src/app/(dashboard)/kas-bank/pengeluaran/page.tsx` — diperluas
- `apps/web/src/app/(dashboard)/penjualan/pos/*`, `/inventory/opname/*`, `/buku-besar/periode/*` — baru
- `apps/web/src/components/dashboard/sidebar.tsx` — update menu (POS, Stock Opname, label Inbound, Periode)
- `apps/web/src/config/permissions.ts` — route permission halaman baru
- `apps/web/supabase/migrations/2026xxxx_*.sql` — migrasi baru (expenses, opname, lock guards)
- `apps/web/src/lib/export.ts` — struk POS + export laporan
- `scripts/` atau `services/import-extractor/` — sidecar PDF (Phase B3, bila pilih markitdown)

---

## Verification (end-to-end, per phase)

1. **MCP Supabase** (sebelum & sesudah tiap phase): list schema → setelahnya verifikasi `journal_entries` balance (debit=kredit), `product.quantity` benar, RLS menolak role tak berhak, lock periode efektif.
2. **Build**: `pnpm build` / `tsc` hijau.
3. **Manual persona walkthrough** per role: owner, finance, admin_gudang, admin_online, shopkeeper — tiap role selesaikan 1 alur penuh.
4. **Artifact** `status.md` tiap phase di-update (centang task, catat file modified, blockers).
5. **Cross-check Kriteria Sukses PDF §12** sebagai acceptance akhir.

---

## Sequencing (2 track paralel)

| Track A (transaksi) | Track B (import & polish) |
|---|---|
| A1 Pengeluaran/Beban | B1 Import xls/csv marketplace |
| A2 POS Kasir | B2 Import master data + saldo awal |
| A3 Stock Opname | B3 Import PDF (deterministik) |
| A4 Lock Periode | B4 Polish status/laporan/dashboard |

Phase 0 (audit MCP) dikerjakan sekali di awal, jadi pondasi kedua track.

---

## Status Eksekusi

| Phase | Modul | Status |
|---|---|---|
| 0 | MCP schema baseline audit | ✅ Selesai (2026-06-01) |
| A1 | Modul Pengeluaran/Beban | ✅ Selesai (`artifacts/019-expenses-foundation`) |
| A2 | POS Kasir Offline | ✅ Selesai (`artifacts/020-pos-kasir-offline`) |
| A3 | Stock Opname | ✅ Selesai (`artifacts/021-stock-opname`) |
| A4 | Lock Periode | ✅ Selesai (`artifacts/022-fiscal-period-lock`) |
| B1 | Import xls/csv marketplace | ✅ Selesai (`artifacts/023-import-reports-data-sync`) |
| B2 | Import master data + saldo awal | ✅ Selesai (`/settings/data-sync`) |
| B3 | Import PDF deterministik | ✅ Selesai template-based (`/settings/data-sync`) |
| B4 | Polish status/laporan/dashboard | ✅ Selesai (`artifacts/023-import-reports-data-sync`) |

## Catatan Eksekusi 2026-06-02

- Implementasi tetap non-AI. Parser Excel/CSV/PDF berjalan deterministic/template-based.
- B2/B3 sudah punya jalur aplikasi di `/settings/data-sync`, tetapi mapping final tetap perlu sample export asli dari Accurate/Shopee/TikTok/BCA saat review.
- Supabase remote tidak di-reset. Migration hardening baru ada lokal di `apps/web/supabase/migrations/20260602091212_operational_hardening_no_reset.sql` dan sengaja ditahan untuk review sebelum apply.
- Operational hardening 2026-06-02: inactive-user gate, stock movement RPC wrapper, rekonsiliasi XLSX/CSV validator, POS numeric formatter, seed guard, dan error handling accounting flow.
- Verifikasi lokal terakhir: `pnpm --filter @sneakervault/web type-check`, `pnpm --filter @sneakervault/web lint`, dan `pnpm --filter @sneakervault/web build` hijau.
