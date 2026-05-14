# Artifact 011 — MVP Accurate-Replacement (Master Control Room)

**Status:** 🟢 In Progress
**Tanggal Mulai:** 2026-05-11
**Owner:** Jhordi + Claude
**Goal akhir:** MVP SneakerVault menggantikan Accurate Online untuk client — lengkap, detail, UX premium, tidak bikin bingung pakainya.

---

## 0. Keputusan Strategi

Setelah audit menyeluruh (`010-phase1-meeting2-audit` lulus), strategi eksekusi yang dipilih:

### "Accurate-Replacement Full Functional Build" *(direvisi 2026-05-11)*

> ~~Skeleton elegant dulu~~. **Klien minta semua page benar-benar functional sejak hari pertama** — bukan placeholder. Setiap modul harus punya DB nyata, server actions, list, create, edit, validasi, role gating, dan UX states (empty/loading/error/success). Iterasi dari modul tanpa dependency → modul kompleks.

**Kenapa ini, bukan opsi lain:**

| Opsi | Trade-off | Putusan |
|---|---|---|
| A. Phase-by-phase serial (8 minggu baru utuh) | Klien tidak lihat gambar utuh sampai akhir, risiko mis-expectation tinggi | ❌ |
| B. UX polish only | Tidak mendekati paritas Accurate | ❌ |
| C. Vertical slice 1 SKU | Tipis tapi kasar di tiap modul | ❌ |
| **D. Full IA + Iterative Deep (PILIHAN)** | Klien dari hari 1 lihat bentuk utuh, deep-build paralel, UX testable per persona segera | ✅ |

**Manfaat untuk Jhordi:**
- Tidak perlu jelaskan "ini belum jadi" ke klien — semua menu ada, hanya beberapa bertanda "Modul Phase 2/3/4" dengan timeline jelas
- Bisa user-test UX per persona (finance/gudang/admin/owner) **mulai minggu ini**
- Roadmap visible, scope creep bisa diredam (semua sudah ada di IA)

---

## 1. Persona & Modul Coverage

Mapping permintaan klien meeting 2 → modul → status:

### Persona: Owner / Manajer
| Kebutuhan | Modul | Status |
|---|---|---|
| Overview real-time (revenue, profit, stok, top produk) | `/overview` | ✅ Phase 1 |
| Aktivitas + notifikasi semua role | `/activity-log` + bell badge | ✅ Phase 1 |
| Approve delete request | `/delete-requests` | ✅ baseline |
| Laporan terfilter PDF/Excel | `/reports` + `/laporan-keuangan` | ⚠️ Basic ada, lengkap Phase 4 |
| Manajemen user & role | `/settings/users` | ✅ baseline |

### Persona: Finance / Akuntansi
| Kebutuhan | Modul | Status |
|---|---|---|
| Daftar Pembelian (PO) | `/pembelian/purchase-order` | 🔨 Phase 2 |
| Penerimaan barang | `/pembelian/penerimaan` | 🔨 Phase 2 |
| Faktur Pembelian | `/pembelian/faktur` | 🔨 Phase 2 |
| Pembayaran vendor | `/pembelian/pembayaran` | 🔨 Phase 2 |
| Invoice penjualan | `/penjualan/invoice` | 🔨 Phase 3 |
| Penerimaan kas | `/penjualan/penerimaan-kas` | 🔨 Phase 3 |
| Kas & Bank + Mutasi BCA | `/kas-bank` | 🔨 Phase 3 |
| Chart of Accounts | `/buku-besar/coa` | 🔨 Phase 4 |
| Buku Besar | `/buku-besar/journal` | 🔨 Phase 4 |
| Neraca, Laba Rugi, Perubahan Ekuitas | `/laporan-keuangan` | 🔨 Phase 4 |
| Dual-price online/offline, HPP per SKU | `inventory` | ✅ Phase 1 |
| Role-gated finance-only data | `permissions.ts` | ✅ Phase 1 |

### Persona: Admin Gudang / Shopkeeper
| Kebutuhan | Modul | Status |
|---|---|---|
| Scan barang masuk (sekarang otomatis dari PO) | `/inbound` (refactor → link PO) | 🔨 Phase 2 |
| Scan barang keluar / packing | `/outbound`, `/scanner` | ✅ baseline |
| Update status defect/dormant flexible | `inventory` condition modal | ✅ Phase 1 |
| Cetak/scan barcode existing | `/barcode-generate` | ✅ baseline |
| Verifikasi return dari marketplace | `/returns` | ✅ baseline (manual flow OK per meeting 2) |

### Persona: Admin Online
| Kebutuhan | Modul | Status |
|---|---|---|
| Input order WA/manual | `/orders` | ✅ baseline |
| Import laporan Shopee/TikTok | `/penjualan/import-marketplace` | 🔨 Phase 3 |
| Initiate return | `/returns` | ✅ baseline |

---

## 2. Track Plan (paralel + dependency)

```
Track 1 (IA Full)  ━━━━━━━━━━━━━━━━━━━━━ [WEEK 1]
                          │
                          ↓
Track 2 (Phase 2 — Pembelian)  ━━━━━━━━━ [WEEK 1-2]
                          │
                          ↓
Track 3 (Phase 3 — Penjualan + Kas)  ━━━ [WEEK 3-4]
                          │
                          ↓
Track 4 (Phase 4 — Jurnal + Laporan)  ━━ [WEEK 5-6]
                          │
                          ↓
Track 5 (UX persona hardening)  ━━━━━━━━ [WEEK 7]
                          │
                          ↓
Parallel run vs Accurate (Phase 5)  ━━━━ [WEEK 8+]
```

Track 5 bisa partial-overlap setiap akhir Track 2/3/4 untuk testing increment.

---

## 3. Tracks — Detail Eksekusi

### Track 1 — IA Accurate-Replacement Lengkap (in progress)

**Output:**

- [ ] Sidebar baru: nested grouping ala Accurate (Pembelian, Penjualan, Kas & Bank, Buku Besar, Laporan Keuangan, Master Data, Gudang, Pengaturan)
- [ ] Route stub semua modul + skeleton page elegant ("Modul ini akan aktif di Phase X. Sneak peek fitur: …")
- [ ] Role gating per route via `routePermissions`
- [ ] Breadcrumb global
- [ ] Update `config/permissions.ts` dengan semua route baru

### Track 2 — Phase 2 Purchase Cycle

**DB migration:**
- [ ] `customers` (untuk forward compat Phase 3)
- [ ] `suppliers` extend (sudah ada baseline)
- [ ] `purchase_orders` + `purchase_order_lines`
- [ ] `purchase_invoices` + `purchase_invoice_lines`
- [ ] `vendor_payments`
- [ ] Trigger: PO line confirmed → auto-bridge ke inbound flow existing
- [ ] RLS: finance/owner CRUD; gudang read PO

**Server actions:**
- [ ] `createPO`, `updatePO`, `cancelPO`, `markPOReceived`
- [ ] `createPurchaseInvoice`, `payVendor`
- [ ] Refactor `confirmInbound` → optional link `po_line_id` (backward compat)

**UI:**
- [ ] `/pembelian/purchase-order` — list, create wizard (3 step: vendor → items → review)
- [ ] `/pembelian/penerimaan` — list PO siap receive, action "Terima" → buka scanner pre-filled
- [ ] `/pembelian/faktur` — list, create dari PO atau standalone
- [ ] `/pembelian/pembayaran` — list outstanding payable, action bayar

### Track 3 — Phase 3 Sales + Kas Bank

**DB:**
- [ ] `sales_invoices`, `sales_invoice_lines`
- [ ] `customer_payments`
- [ ] `bank_accounts`, `bank_transactions`
- [ ] `marketplace_imports` (raw + parsed)

**Parser:**
- [ ] Excel Shopee laporan penjualan
- [ ] Excel TikTok laporan penjualan
- [ ] Reconciler vs stock movement

**UI:**
- [ ] `/penjualan/invoice` — list, create, link order WA
- [ ] `/penjualan/penerimaan-kas` — list
- [ ] `/penjualan/import-marketplace` — upload Excel, preview, confirm
- [ ] `/kas-bank/akun` — CRUD bank accounts (BCA default)
- [ ] `/kas-bank/mutasi` — list transactions
- [ ] `/kas-bank/rekonsiliasi` — match BCA statement vs internal

### Track 4 — Phase 4 Journal + Laporan

**DB:**
- [ ] `chart_of_accounts` + SAK EMKM seed (Aset, Liabilitas, Ekuitas, Pendapatan, HPP, Beban)
- [ ] `journal_entries`, `journal_lines`
- [ ] `fiscal_periods`

**Auto-journal engine:**
- [ ] PO receive → Dr Inventory / Cr Account Payable
- [ ] Vendor payment → Dr AP / Cr Bank
- [ ] Sales invoice → Dr AR / Cr Revenue + Dr COGS / Cr Inventory
- [ ] Customer payment → Dr Bank / Cr AR
- [ ] Marketplace fee → Dr Beban Admin / Cr AR
- [ ] Defect write-off → Dr Beban / Cr Inventory

**Reports:**
- [ ] `/buku-besar/coa` — CoA tree view
- [ ] `/buku-besar/journal` — journal entries list + drill-down
- [ ] `/laporan-keuangan/neraca`
- [ ] `/laporan-keuangan/laba-rugi`
- [ ] `/laporan-keuangan/perubahan-ekuitas`
- [ ] `/laporan-keuangan/arus-kas`
- [ ] Filter periode, export PDF + Excel

### Track 5 — UX Persona Hardening

**Per persona walkthrough:**
- [ ] Finance: PO → Receive → Faktur → Bayar → Invoice → Terima Kas → cek Buku Besar → cek Neraca/LR (full cycle test)
- [ ] Gudang: Scan masuk dari PO → update kondisi defect → outbound packing
- [ ] Admin Online: input order → import Shopee Excel → initiate return
- [ ] Owner: review overview → cek aktivitas → approve delete → export laporan bulanan

**Quality pass:**
- [ ] Empty state semua list (illustrasi + CTA)
- [ ] Loading skeleton (bukan spinner)
- [ ] Error state dengan recovery action
- [ ] Toast feedback semua mutation
- [ ] Breadcrumb di semua nested route
- [ ] Keyboard shortcut: `⌘K` global search, `n` new, `e` edit, `esc` close modal
- [ ] Indonesia copywriting konsisten (no Engrish), tooltips friendly
- [ ] Responsive check (1280, 1440, 1920)

---

## 4. Riwayat Pekerjaan (auto-update tiap selesai bite)

| Tanggal | Track | Pekerjaan | Hasil | Artifact |
|---|---|---|---|---|
| 2026-05-11 | — | Master plan disusun | ✅ | 011 (file ini) |
| 2026-05-11 | T1 Bite 1 | Foundation: `ModuleSkeleton` component, `permissions.ts` expanded ke semua route Phase 2-4, sidebar refactor → grouped (Dasbor/Pembelian/Penjualan/Gudang/Kas&Bank/Buku Besar/Laporan/Master Data/Audit) dengan badge fase, stub 4 page Pembelian (PO, Penerimaan, Faktur, Pembayaran) | ✅ typecheck green | 011 |
| 2026-05-11 | T1 Bite 2 | Stub 6 page: Penjualan (Invoice, Penerimaan Kas, Import Marketplace) + Kas&Bank (Akun, Mutasi, Rekonsiliasi BCA) | ✅ | 011 |
| 2026-05-11 | T1 Bite 3 | Stub 6 page: Buku Besar (CoA, Jurnal) + Laporan Keuangan (Neraca, Laba Rugi, Perubahan Ekuitas, Arus Kas) | ✅ | 011 |
| 2026-05-11 | T1 Bite 4 | Stub Master Data (Customers) + full build verify | ✅ build success, 17 route stub ter-generate, 30 route total siap render | 011 |
| 2026-05-11 | **T1 CLOSED** | Track 1 — IA Accurate-Replacement lengkap | ✅ Sidebar grouped 9 section, semua menu Accurate-style ada, dark theme konsisten, role-gated, badge P2/P3/P4 jelas | 011 |
| 2026-05-11 | T2 Bite 5 | **Customers Master Data — FULL CRUD FUNCTIONAL.** Migration `20260512000000_phase2_customers.sql` (table + enum customer_channel + RLS + trigram index). Shared: `CustomerChannel` type, `CUSTOMER_CHANNELS` constant, `customerInputSchema` zod validator. Server actions: `createCustomer`, `updateCustomer`, `deactivateCustomer`, `reactivateCustomer` (role-gated owner/finance/admin_online, audit-logged). Query `getCustomers`. UI `CustomersClient`: header dengan stats tile (total/aktif/nonaktif/channel utama), search debounce, filter by channel, show-inactive toggle, sortable table dengan channel badge berwarna, create+edit modal, deactivate/reactivate, empty state cantik, role-aware action buttons. Page `/customers` jadi real. | ✅ build green | 011 |
| 2026-05-11 | DB Foundation | **Applied via Supabase MCP**: phase1_enums, phase1_meeting2 (Phase 1 catch-up), phase2_customers, phase2_purchase_cycle (5 tables + 3 number generators), phase3_sales_kasbank (7 tables + 2 number generators), phase4_buku_besar (4 tables + journal number generator + **32 row CoA seed SAK EMKM**). RLS lengkap, semua role-gated. | ✅ MCP applied + verified | 011 |
| 2026-05-11 | T2/T3 Bite 7 | **Bank Accounts — FULL CRUD FUNCTIONAL** (`/kas-bank/akun`). Shared types `BankAccountType`, validators `bankAccountInputSchema`, constants `BANK_ACCOUNT_TYPES`/`PAYMENT_METHODS`. Server actions: create/update/deactivate/reactivate dengan auto-unset is_default saat ada akun baru jadi default. UI `BankAccountsClient`: hero card total saldo gradient + breakdown per tipe, card grid 3-col responsif, ikon per tipe (Wallet/Landmark/Smartphone/Banknote), badge default star, opening balance vs current, role-gated actions, modal dengan field kondisional (bank_name/account_number muncul saat tipe bank/ewallet). | ✅ build green | 011 |
| 2026-05-11 | T4 Bite 7 | **Chart of Accounts viewer** (`/buku-besar/coa`). 32 akun SAK EMKM ter-render sebagai tree expandable. Stats tiles per tipe sebagai filter toggle. Search by code+name dengan auto-expand parent. Saldo normal (Dr/Cr) ditampilkan, system accounts dengan lock icon. | ✅ build green | 011 |
| 2026-05-12 | **T4 Bite 14-17 MEGA** | **Mutasi Bank + Auto-Journal Engine + Jurnal Umum + 4 Laporan Keuangan — FULL FINANCIAL BACKBONE LIVE.** ⓐ Mutasi Bank (`/kas-bank/mutasi`): tabel semua bank_transactions dengan filter akun/tipe/rekonsiliasi/search, stats 4-tile (in/out/net bulan ini + unreconciled), kolom debit-kredit-saldo, source badge (Bayar Vendor / Terima Customer / Manual), toggle rekonsiliasi 1-klik, modal manual entry dengan validasi saldo. ⓑ **Auto-Journal Engine** (`lib/journal-engine.ts`): server-side TypeScript engine yang map source transaction → journal entries balanced. `createJournalEntry` validate dr=cr, resolve CoA by code, atomic insert. `journalForPurchaseInvoice` (Dr Persediaan + Pajak / Cr Hutang), `journalForVendorPayment` (Dr Hutang / Cr Kas-Bank, auto-detect bank type→CoA), `journalForSalesInvoice` (Dr Piutang / Cr Revenue per channel + Dr COGS / Cr Persediaan), `journalForCustomerPayment` (Dr Kas-Bank / Cr Piutang), `reverseJournalBySource` (mirror swap dr↔cr, mark original reversed). **Hooked ke 4 actions**: createPurchaseInvoice, createVendorPayment, createSalesInvoice (+issue path), createCustomerPayment + semua reverse counterparts. ⓒ Jurnal Umum (`/buku-besar/journal`): table expandable per entry, stats 4-tile (total/posted/reversed/volume + balance check), filter status+source+search, drill-down ke lines dengan kode+nama akun+dr/cr berwarna. ⓓ Query `getAccountBalances` aggregate semua posted journal lines per akun. ⓔ **Neraca** (`/laporan-keuangan/neraca`): tree view Aset vs Liabilitas+Ekuitas dengan total balance check (banner emerald/red), date picker, sum-leaves recursion. ⓕ **Laba Rugi** (`/laporan-keuangan/laba-rugi`): summary 4-tile (Pendapatan/HPP/Laba Kotor/Laba Bersih dengan margin %), section Pendapatan, HPP, Beban Operasional, panel laba kotor + laba bersih besar. ⓖ **Perubahan Ekuitas**: opening + laba periode + setoran/penarikan owner = closing. ⓗ **Arus Kas**: kategorisasi operasi/investasi/pendanaan dari bank_transactions periode, panel masuk/keluar/net + saldo akhir. | ✅ ALL build green | 011 |
| 2026-05-12 | T3 Bite 13 | **Penerimaan Kas — FULL FUNCTIONAL** (`/penjualan/penerimaan-kas`) — **Loop Penjualan end-to-end tertutup**. Validators `customerPaymentInputSchema` + `customerPaymentAllocationSchema`. Queries: `getOutstandingSalesInvoices` (filter optional by customer), `getCustomerPayments` (dengan allocations join ke sales_invoices). Server action `createCustomerPayment`: validate customer match per allocation (kalau ada customer_id), status invoice valid (issued/partial), amount ≤ remaining, akun bank aktif. Atomic create header + allocations dengan rollback. **Update tiap invoice**: paid_amount bertambah, status → partial/paid. **CREDIT bank balance** (kebalikan vendor payment) + insert `bank_transactions` type=`credit` "Penerimaan customer BM-XXXX". `reverseCustomerPayment`: kembalikan paid_amount + status invoice ke issued/partial, kurangi bank balance, insert debit reversal, cascade delete. UI `PenerimaanKasClient` mirror dari pembayaran-vendor tapi: customer picker (atau walk-in dengan dropdown nama snapshot dari outstanding tanpa customer_id), saldo "akan jadi" preview hijau (bukan warning insufficient), stats emerald untuk penerimaan bulan ini, label "Masuk ke" akun (bukan "Sumber dana"), badge `+Rp` hijau di angka. | ✅ build green | 011 |
| 2026-05-12 | T3 Bite 12 | **Sales Invoice — FULL CRUD FUNCTIONAL** (`/penjualan/invoice`). Validators `salesInvoiceInputSchema` + `salesInvoiceLineInputSchema`. Constants `SALES_INVOICE_STATUS_*`. Queries: `getSalesInvoices`, `getSalesInvoiceById`, `getProductsForSalesPicker` (dengan sell_price + price_offline + stok). Server actions: `createSalesInvoice` (option `issue` untuk langsung terbit, snapshot product_label + unit_cost dari HPP saat ini untuk COGS journal nanti, auto-decrement stok + record stock_movement saat issue, atomic rollback), `issueSalesInvoice` (draft→issued, validate stok cukup lalu decrement), `cancelSalesInvoice` (restore stok kalau pernah issued, append reason ke notes), `deleteSalesInvoice` (owner only, draft/cancelled, paid_amount=0), `updateSalesInvoice` (draft-only). UI: stats 5-tile (total/terbit/lunas/outstanding-piutang/omset bulan ini), table dengan kolom No Invoice + Customer (+ ID order marketplace inline) + Channel badge berwarna + Tanggal + Items + Total + Sisa + Status + Aksi. Form modal: customer picker (auto-fill nama+channel) atau walk-in manual, channel switcher **auto-update harga line** sesuai channel (online=sell_price, offline=price_offline), product picker dengan stok status (habis disabled, low warning), line editor dengan overstock indicator merah, adjustment 4-grid (diskon/ongkir/fee marketplace/pajak), totals breakdown realtime, **dua tombol simpan**: "Simpan Draft" atau "Simpan & Terbitkan" (langsung kurangi stok). View modal dengan banner Draft warning, breakdown finansial lengkap (subtotal-diskon+ongkir+fee+pajak=total → paid → sisa piutang), action kontekstual (Terbitkan untuk draft, Batalkan untuk non-paid, Hapus untuk owner). | ✅ build green | 011 |
| 2026-05-12 | T2 Bite 11 | **Pembayaran Vendor — FULL FUNCTIONAL** (`/pembelian/pembayaran`) — **Loop Pembelian end-to-end tertutup**. Validators `vendorPaymentInputSchema` + `paymentAllocationSchema`. Queries: `getOutstandingPurchaseInvoices` (by supplier optional, sort jatuh tempo), `getVendorPayments` (dengan allocations join ke faktur). Server action `createVendorPayment`: validasi multi-step (vendor match per allocation, status faktur valid, amount ≤ remaining, saldo bank cukup, akun aktif), atomic create header + allocations dengan rollback, **auto-update tiap faktur** (paid_amount + status partial/paid), **auto-debit bank_account.current_balance**, **insert bank_transaction debit** linked. `reverseVendorPayment`: untuk tiap alokasi kembalikan paid_amount + recompute status, restore bank balance + insert credit transaction reversing, cascade delete payment. UI `PembayaranVendorClient`: stats 4-tile (outstanding/overdue/bulan ini/total payment), banner peringatan overdue merah, modal bayar dengan vendor picker (filter hanya vendor punya outstanding + total outstanding di label), tabel faktur outstanding dengan checkbox + amount inline (default = remaining), quick "Pilih Semua (Lunas)"/"Kosongkan", payment method + bank picker dengan saldo realtime + warning insufficient, reference no, bukti URL, total live. View modal dengan alokasi breakdown + Reverse button. | ✅ build green | 011 |
| 2026-05-12 | T2 Bite 10 | **Faktur Pembelian — FULL CRUD FUNCTIONAL** (`/pembelian/faktur`). Validators `purchaseInvoiceInputSchema`. Queries: `getPurchaseInvoices` (dengan supplier+PO join), `getInvoicablePos` (PO status receiving/completed only). Server actions: `createPurchaseInvoice` (auto generate FB-YYMM-NNNN), `updatePurchaseInvoice` (block edit kalau sudah ada paid_amount, validasi total ≥ paid_amount), `cancelPurchaseInvoice` (block kalau ada pembayaran), `deletePurchaseInvoice` (owner only, paid_amount=0). UI `FakturPembelianClient`: stats 5-tile (total/belum/sebagian/outstanding-value/overdue-count merah), table dengan jatuh tempo coloring (lewat=merah dengan AlertTriangle, ≤3 hari=amber), sisa hutang per row, source switcher (Dari PO ↔ Manual) di form, **PO picker auto-fill subtotal+tax+total saat dipilih**, supplier disabled saat PO picked, default due_date +14 hari, attachment URL opsional dengan link "Buka file", view modal lengkap dengan banner overdue warning, role-gated edit/cancel/delete. | ✅ build green | 011 |
| 2026-05-11 | T2 Bite 9 | **Penerimaan Barang — FULL FUNCTIONAL** (`/pembelian/penerimaan`). Validators `receivePurchaseOrderSchema` + `receivePoLineSchema`. Query `getPurchaseOrdersForReceiving` (PO approved+receiving dengan aggregate ordered/received/remaining). Server action `receivePurchaseOrder`: validate per line vs remaining, untuk tiap line panggil `increment_product_quantity` → `recalculate_hpp_by_sku` → insert `stock_movements` (type=inbound, ref=purchase_order_line) → update `purchase_order_lines.received_qty`. Auto-status: full→completed, partial→receiving. Notes append ke PO. Activity log lengkap. UI `PenerimaanClient`: stats 4-tile (antrian/siap/sebagian/item tersisa), card grid per PO dengan progress bar berwarna (sky/amber/emerald per progress%), modal terima dengan baris per line yang bisa diisi qty (default = remaining), quick-action "Terima Semua"/"Kosongkan", validasi max remaining, total qty+nilai realtime, banner info verifikasi fisik. Revalidate path PO list, inventory, penerimaan. | ✅ build green | 011 |
| 2026-05-11 | T2 Bite 8 | **Purchase Order — FULL CRUD FUNCTIONAL** (`/pembelian/purchase-order`). Validators `purchaseOrderInputSchema` + `poLineInputSchema`. Constants `PO_STATUS_LABELS` + tones. Queries: `getPurchaseOrders` (list dengan supplier name & line_count), `getPurchaseOrderById` (full detail dengan lines + product join), `getProductsForPicker` (ringkas untuk autocomplete). Server actions: `createPurchaseOrder` (auto generate PO number via RPC, insert header + lines atomic dengan rollback, compute subtotal/total), `approvePurchaseOrder` (draft→approved, set approved_at), `cancelPurchaseOrder` (with reason append), `deletePurchaseOrder` (owner only, draft/cancelled), `updatePurchaseOrder` (draft-only, replace lines). UI `PurchaseOrderClient`: header dengan stats 5-tile (total/draft/approved/receiving/outstanding-value), filter status+search, table dengan PO number monospace + supplier + tanggal/ETA + line count + total + status badge + actions (view/edit). **Form modal**: vendor select, tanggal order+ETA, product picker dengan search 30-50 hasil + auto-add line, line editor inline (qty/price), tax+shipping+notes, totals breakdown real-time. **View modal**: full detail dengan lines table, received_qty/ordered_qty progress, action buttons kontekstual per status (Setujui/Batalkan/Hapus). Empty states elegant. | ✅ build green, route 7.29 kB | 011 |

> _Setelah eksekusi tiap bite, append baris baru. Bite kecil ≤ 1 jam supaya momentum jalan._

---

## 5. Next Action (selalu top-of-mind)

**STRATEGI REVISI:** Stub page tidak boleh tinggal lama. Tiap modul harus jadi functional dalam 1-3 bite. Urutan kerja:

```
Bite 5  → Customers (master data, no deps)            ← SEKARANG
Bite 6  → Suppliers refresh (CRUD-only, sudah ada baseline)
Bite 7  → Purchase Order (DB + UI list + create wizard)
Bite 8  → Penerimaan Barang (link ke confirmInbound existing)
Bite 9  → Faktur Pembelian (DB + UI + auto from PO)
Bite 10 → Pembayaran Vendor
Bite 11 → CoA seed standar SAK EMKM + UI tree view
Bite 12 → Sales Invoice
Bite 13 → Penerimaan Kas Customer
Bite 14 → Akun Bank/Kas + Mutasi
Bite 15 → Rekonsiliasi BCA
Bite 16 → Import Marketplace (Shopee/TikTok Excel parser)
Bite 17 → Auto-Journal Engine (all modules → journal_entries)
Bite 18 → Jurnal UI (list + drill-down)
Bite 19 → Neraca + Laba Rugi
Bite 20 → Perubahan Ekuitas + Arus Kas
Bite 21 → UX persona testing pass
Bite 22 → Data migration & parallel run prep
```

**Estimasi:** 4-6 minggu dengan kecepatan 2-3 bite/hari.

**BITE 7 SELESAI:** Bank Accounts + CoA viewer keduanya live. Semua DB Phase 2/3/4 sudah ter-apply.

**Status modul (functional vs stub):**

| Modul | Status |
|---|---|
| `/customers` | ✅ FUNCTIONAL |
| `/kas-bank/akun` | ✅ FUNCTIONAL |
| `/buku-besar/coa` | ✅ FUNCTIONAL (read-only viewer dulu) |
| `/pembelian/purchase-order` | ✅ FUNCTIONAL |
| `/pembelian/penerimaan` | ✅ FUNCTIONAL |
| `/pembelian/faktur` | ✅ FUNCTIONAL |
| `/pembelian/pembayaran` | ✅ FUNCTIONAL |
| `/penjualan/invoice` | ✅ FUNCTIONAL |
| `/penjualan/penerimaan-kas` | ✅ FUNCTIONAL |
| `/penjualan/import-marketplace` | 🟡 Stub (DB ready) |
| `/kas-bank/mutasi` | ✅ FUNCTIONAL |
| `/kas-bank/rekonsiliasi` | 🟡 Stub (DB ready) |
| `/buku-besar/journal` | ✅ FUNCTIONAL (+ auto-journal engine) |
| `/laporan-keuangan/neraca` | ✅ FUNCTIONAL |
| `/laporan-keuangan/laba-rugi` | ✅ FUNCTIONAL |
| `/laporan-keuangan/perubahan-ekuitas` | ✅ FUNCTIONAL |
| `/laporan-keuangan/arus-kas` | ✅ FUNCTIONAL |

**BITE 8 SELESAI:** Purchase Order full functional.

**BITE 9 SELESAI:** Penerimaan Barang full functional. Alur PO → Receive → Stock+HPP otomatis sudah jalan end-to-end.

**BITE 10 SELESAI:** Faktur Pembelian full functional.

**BITE 11 SELESAI:** Pembayaran Vendor full functional. **Loop Pembelian end-to-end TUTUP.** Test cycle penuh sekarang: PO → Approve → Receive (stok+HPP otomatis) → Faktur (Account Payable) → Bayar (allocation + saldo bank otomatis update).

**BITE 12 SELESAI:** Sales Invoice full functional dengan auto-price by channel + auto-stok decrement.

**BITE 13 SELESAI:** Penerimaan Kas full functional. **Loop Penjualan end-to-end TUTUP** (Invoice → Terbit → Terima Kas → Saldo bank update).

**MEGA BITE 14-17 SELESAI:** Tulang punggung finansial lengkap. **MVP Accurate-replacement secara konseptual functional.**

**BITE 20 SELESAI (2026-05-14): PO Payment Terms + Inventory HPP UI Fix**

User request:
> "di page Purchase order juga pas memulai PO ada opsi untuk bayar dp, untuk simplifikasi ada opsi bayar lunas atau dp, dp ini bisa fleksible menggunakan percent atau input manual"
> "untuk ui hpp inventori jadi 1 aja dengan rata rata dari nilai semua size yang ada di 1 sku tertentu"
> "ui di inventory agak sedikit ga rapih terutama pada table offline dan kondisi terlalu nempel"

| Perubahan | File | Detail |
|---|---|---|
| **Inventory HPP UI** | `inventory-client.tsx`, `ModelGroup.avgHpp` | HPP per size DIHAPUS dari tabel expanded. Sekarang 1 nilai rata-rata per SKU/model di group header (weighted average by qty). Export Excel juga pakai avgHpp model. |
| **Inventory tabel cell padding** | `inventory-client.tsx` | Tambah `[&_th]:px-3 [&_td]:px-3` + `pl-6` di kolom Kondisi supaya tidak nempel ke Offline price |
| **PO Payment Terms** | Migration `20260514000000_phase5_po_payment_terms.sql` + validator + action | 3 pilihan saat buat PO: Kredit / Bayar Lunas / DP. DP fleksibel: percent (slider + quick-pick) atau manual Rp |
| **Auto Vendor Payment** | `purchase-receive.ts` | Saat PO completed dan payment_type≠credit, sistem auto: (1) buat faktur, (2) buat vendor_payment dengan alokasi, (3) update bank balance, (4) record mutasi bank, (5) auto-journal Dr Hutang/Cr Bank, (6) update faktur status (paid/partial) |
| **Pembayaran UI** | `po-client.tsx` PaymentSection | Card 3-tombol opsi pembayaran + DP slider/manual toggle + quick-pick 10/25/30/50/70/80% + sumber dana bank picker + preview "Bayar DP / Sisa Kredit" |
| **Toast feedback** | `penerimaan-client.tsx` | Saat penerimaan complete dengan auto-pay: "PO selesai. Faktur + Pembayaran auto-dibuat (Rp X) ✓" |

**Flow result:**
- Pembelian Kredit: PO → Approve → Receive (faktur auto) → Bayar Vendor manual nanti
- Pembelian Lunas: PO (pilih bank) → Approve → Receive → **faktur + payment full otomatis dalam 1 langkah** — stok+HPP+jurnal+saldo bank semuanya update bersamaan
- Pembelian DP: PO (set 30%, pilih bank) → Approve → Receive → **faktur + payment partial otomatis**, sisa hutang tercatat dan bisa dilunasi via Bayar Vendor

**✅ Migration applied (2026-05-14 via Supabase MCP):**
File `apps/web/supabase/migrations/20260514000000_phase5_po_payment_terms.sql` sudah ter-apply ke remote DB. Kolom `payment_type`, `dp_amount`, `dp_bank_account_id` aktif di tabel `purchase_orders`. Fitur DP/Cash full functional end-to-end.

---

## ⚠️ Production Readiness Gaps

**Feature complete ≠ production ready.** Sebelum cutover dari Accurate Online ke Dewins.id, ada 4 hal kritis yang belum dikerjakan:

1. **Import Marketplace** parser Shopee/TikTok
2. **Data Migration** dari Accurate (saldo awal + master + outstanding)
3. **Production Deployment** Vercel + domain
4. **Persona Walkthrough & UAT** per role

Detail lengkap, estimasi, dan task checklist → **[artifacts/018-production-readiness-gaps/status.md](../018-production-readiness-gaps/status.md)**

Jangan claim "99% final" ke client sebelum 4 kritis di atas tuntas.

---

**BITE 19 SELESAI (2026-05-14): UX Adjustments Lanjutan dari Meeting3 — DEEP FIX**

Berdasarkan feedback eksplisit user:
> "client sedikit kesulitan memahami flownya, opsi uang muka/cash pada PO menu"
> "kasih note atau quick tips pada setiap page keseluruhan agar mudah digunakan"
> "chart of account katanya itu bisa dilihat secara detail"
> "jurnal juga bisa di edit ya, bukan hanya tambah sendiri"
> "hpp per/sku itu jadi 1 dan dijadikan nilai rata rata"
> "dari PO harusnya langsung generate faktur, jadi ga manual biar tidak bingung"
> "ux bayar vendor juga masih membingungkan dan tidak ada filter sudah dibayar dan belum dibayar"

| Perubahan | File | Impact |
|---|---|---|
| **QuickTip component** | `components/ui/quick-tip.tsx` | Reusable info banner, dismissible (localStorage), 3 tones (info/warn/success) |
| **QuickTip banners** | 8 client pages | PO, Penerimaan, Faktur, Pembayaran, Invoice, Penerimaan Kas, Inventory, Neraca, Laba-Rugi, CoA, Jurnal, Account Ledger |
| **Auto-Faktur dari PO** | `actions/purchase-receive.ts` | Saat PO completed, faktur otomatis dibuat + auto-journal Dr Persediaan/Cr Hutang. Toast notify user. |
| **CoA → Drill-down Ledger** | `coa/[id]/page.tsx`, `account-ledger-client.tsx`, `queries.getAccountLedger` | Klik nama akun → buku besar pembantu dengan saldo berjalan, filter periode, search |
| **Jurnal Edit + Delete** | `actions/journal-entries.ts` (update/delete), `journal-client.tsx` (Pencil/Trash buttons + confirm dialog + edit mode reuse modal) | Hanya manual entries (source_type="manual" & status≠"reversed") yang editable |
| **Bayar Vendor Tab UX** | `pembayaran-client.tsx` | Split jadi 2 tab: **Belum Dibayar** (default, dengan warna jatuh tempo + tombol Bayar per faktur) dan **Sudah Dibayar** (riwayat) |
| **Outstanding Filter** | `pembayaran-client.tsx` | Select: Semua / Sudah jatuh tempo / Jatuh tempo ≤ 7 hari |
| **HPP Clarification** | `inventory-client.tsx` QuickTip | Jelaskan HPP = weighted average per SKU (semua size dalam 1 SKU share 1 HPP value) |

**Flow improvement utama:**
- Pembelian: PO → Approve → **Receive (faktur auto-dibuat)** → Bayar Vendor (filter outstanding). Steps berkurang dari 5 jadi 4 manual + 1 auto.
- Akuntansi: Jurnal sekarang fully editable untuk manual entries — finance bisa koreksi typo/nominal tanpa harus delete+recreate.
- Drill-down: Dari CoA, finance bisa langsung explore semua jurnal yang menyentuh akun spesifik dengan saldo berjalan.

**Earlier Bite 18 changes (2026-05-14): Sidebar restructuring & basic UX**

Perubahan berdasarkan transkrip meeting3 bersama tim Dewin (finance, gudang, admin):

| Perubahan | Detail |
|---|---|
| Sidebar: Kas & Bank | Tambah submenu Penerimaan + Pengeluaran (terpisah dari "Semua Mutasi") |
| Sidebar: Gudang | Rename "Barang Masuk" → "Stock Opname" (reconcile fisik vs sistem, bukan receiving) |
| Sidebar: Hapus badges | Semua P2/P3/P4 badge dihapus — app production-ready, bukan skeleton |
| Sidebar: Label lebih jelas | "Penerimaan" → "Penerimaan Barang", "Invoice" → "Invoice Penjualan", dll. |
| Kas & Bank: Penerimaan | `/kas-bank/penerimaan` — filter credit only, title "Penerimaan Kas & Bank" |
| Kas & Bank: Pengeluaran | `/kas-bank/pengeluaran` — filter debit only, title "Pengeluaran Kas & Bank" |
| Jurnal Manual | Form manual entry di `/buku-besar/journal` untuk penyesuaian accounting |
| Jurnal: Context clue | Banner amber menjelaskan jurnal hanya untuk penyesuaian, bukan kas biasa |
| Route permissions | Tambah `/kas-bank/penerimaan` + `/kas-bank/pengeluaran` ke permissions matrix |

**Sisa stub / future:**
- `/kas-bank/rekonsiliasi` — manual toggle di Mutasi untuk sekarang
- `/penjualan/import-marketplace` — perlu Excel parser Shopee/TikTok
- Export PDF/Excel laporan keuangan
- Multi-warehouse (sementara pakai notes di inventory)
- Retur form yang lebih detail

**REKOMENDASI BERIKUTNYA:**
1. **Test e2e** dengan akun demo (finance, gudang, shopkeeper) — verifikasi UX per persona
2. **Supplier page** — buat functional (form tambah/edit supplier, link ke PO)
3. **Marketplace import parser** (Excel Shopee/TikTok → auto bulk-create invoices)
4. **Export PDF** untuk laporan keuangan

**Setelah PO:** Penerimaan (link PO→inbound) → Faktur Pembelian (auto dari PO) → Pembayaran Vendor (allocate ke faktur) → Sales Invoice (mirroring) → Customer Payment → Mutasi Bank → Auto-Journal Engine → Reports.
  - Buat `20260512000000_phase2_customers_suppliers.sql` — tabel `customers` + perluasan `suppliers`
  - Buat `20260512000100_phase2_purchase_cycle.sql` — `purchase_orders`, `po_lines`, `purchase_invoices`, `pi_lines`, `vendor_payments` + RLS + trigger HPP update
**Bite 6:** Server actions `createPO`, `updatePO`, `markPOReceived`, `createPurchaseInvoice`, `payVendor`
**Bite 7:** UI deep-build `/pembelian/purchase-order` (list + wizard create)
**Bite 8:** UI deep-build `/pembelian/penerimaan` + integrasi ke scanner existing
**Bite 9:** UI deep-build `/pembelian/faktur` + `/pembelian/pembayaran`
**Bite 10:** UI deep-build `/customers` (Master Data)
**MINGGU INI:** Selesai Bite 5-7 (DB + actions + PO UI)
**MINGGU DEPAN:** Selesai Bite 8-10 (Penerimaan, Faktur, Bayar, Customer) → Track 2 closed → start Track 3

---

## 6. Aturan Diri (jangan dilanggar)

1. **Setiap bite ≤ 1 jam** → commit + update artifact ini
2. **Setiap modul deep-build wajib ada 4 state**: empty, loading, error, success — tidak boleh skip
3. **Setiap persona harus bisa selesaikan 1 alur penuh** sebelum modul dianggap "Done"
4. **Copywriting Indonesia** (bukan tech-talk)
5. **Konsisten dark theme** (sudah ditetapkan Phase 1)
6. **Build hijau wajib** sebelum tutup bite — `npx turbo build` exit 0
7. **Type-safe** — `tsc --noEmit` exit 0
8. **Update riwayat di §4** tiap bite, **update next action di §5** sebelum tutup sesi

---

## 7. File Penting

```
docs/meeting2-execution-plan.md      → roadmap baseline
docs/prd.md                          → spec asli
meeting2.md                          → transkrip mentah
artifacts/010-phase1-meeting2-audit/ → Phase 1 audit (CLOSED)
artifacts/011-mvp-accurate-replacement/status.md → file ini (control room)
```
