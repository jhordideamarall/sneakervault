# Fase A UAT — Size free-text · Rename PO · Role import

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** UAT prep (post-meeting 13 Jun)
**Tanggal Mulai:** 2026-06-14
**Tanggal Selesai:** 2026-06-14
**Branch:** `feat/fase-a-uat-ux` (belum di-commit/push — menunggu instruksi)

## Maksud & Tujuan
Prasyarat agar client bisa input stok sendiri (Senin) tanpa mentok, dan rapikan UX/role sebelum UAT. Tidak menyentuh mesin rekonsiliasi marketplace (Fase B). Sumber: `newmeeting.md` → `docs/improvement-plan-uat-meeting.md`. Desain: `docs/superpowers/specs/2026-06-14-fase-a-uat-design.md`.

## Tasks
### #6 Size free-text (gating) — DONE
- [x] Migration `20260614120000_size_label_freetext.sql`: `parse_size_to_numeric()` + kolom `size_label` + trigger dua-arah `products_sync_size` + recreate `get_inventory_page` (+size_label). Applied & verified via MCP.
- [x] Fix bug parser: `substring(from pattern)` dengan grup-tangkap salah ('40'→0); regex diperbaiki tanpa grup-tangkap.
- [x] Validators: `productInputSchema` size→size_label; `productUpdateSchema` += size_label
- [x] `products.ts`: `createProductSchema`, `importRowSchema` (size→string label), `importPayload`, `updateProductCondition` (label pakai size_label)
- [x] Form input text: `inventory-client` (Tambah Produk), `inbound-client` (Barang Masuk)
- [x] Display size_label: `inventory-client` (kolom size, export, condition label), `edit-product-modal` header
- [x] `queries/index.ts` `PRODUCT_FIELDS` += size_label (jalur legacy)
- [x] Types `packages/supabase/types.ts`: products Row/Insert/Update (size jadi optional, size_label ditambah)
- [x] Verifikasi MCP: `42 2/3`→42.667 · `37,5`→37.5 · `40`→40 · trigger dua-arah OK

### #2 Rename PO → Pembelian Barang (label only, route tetap) — DONE
- [x] sidebar, po-client, faktur-client, penerimaan-client, finance/page, activity-log, panduan (0 sisa "Purchase Order")

### #9 Role import = Finance — DONE
- [x] `permissions.ts`: `/penjualan/import-marketplace` → `["owner","finance"]`
- [x] `marketplace-import.ts`: konstanta `ROLES` buang `admin_online` (4 fungsi import ikut: reconcile/commit/map/search)
- [x] Migration `20260614120100_import_role_finance.sql`: RPC `import_marketplace_order_atomic` role check → `['owner','finance']`. Applied.
- [x] `panduan`: teks aturan size numerik → free-text

### Verifikasi akhir — DONE
- [x] `pnpm --filter web build` HIJAU
- [x] Advisor DB tanpa regresi (semua INFO unused-index dari DB kosong + 2 WARN pre-existing)

## Ditunda (Fase A.2 — tracked, tidak blocking)
- Sweep display size sekunder ke `size_label`: POS (`pos-product-card`, `pos-client`), `invoice-client`, `sold/riwayat`, `search-bar`, `returns-client`, `outbound-client`, `po-client` manual, `barcode-generate`, `pending-actions-table`. Saat ini tampil `size` numerik (non-pecahan identik; Adidas pecahan tampil desimal mis. 42.6667).
- Pesan `bulk-import-button` (line ~188) & parser template marketplace masih asumsi "size numerik" — owner-only tooling, bukan input manual Senin.

## Hardening pasca-review Codex (2026-06-14) — DONE
Review `codex review --uncommitted` menemukan 3 MEDIUM + 2 LOW. #2 (size pecahan jalur marketplace) tetap ditunda ke Fase B. Sisanya difix via workflow Claude-plan → `codex exec` → Claude apply DB. Plan: `docs/superpowers/plans/2026-06-14-fase-a-fixes.md`.
- [x] **#1** RLS `marketplace_sku_map` write → owner+finance (buang admin_online). Migration `20260614130000_sku_map_role_finance.sql`. Applied & verified (policy = owner,finance).
- [x] **#3** `updateProduct` gate `size_label`: hanya owner/admin_gudang, bukan finance (`products.ts`).
- [x] **#4** types.ts: RPC `get_inventory_page` Returns += `size_label`.
- [x] **#5** Search cakup size_label: RPC `get_inventory_page` (migration `20260614130100_inventory_search_size_label.sql`, applied) + legacy query `.or()`. Verified: cari "2/3" menemukan "42 2/3".
- [x] Build hijau (dijalankan Codex) + verifikasi MCP.

## Blockers
- (kosong)

## Files Modified
- apps/web/supabase/migrations/20260614120000_size_label_freetext.sql (new)
- apps/web/supabase/migrations/20260614120100_import_role_finance.sql (new)
- packages/shared/src/validators.ts
- packages/supabase/src/types.ts
- apps/web/src/lib/actions/products.ts
- apps/web/src/lib/queries/index.ts
- apps/web/src/lib/actions/marketplace-import.ts
- apps/web/src/config/permissions.ts
- apps/web/src/components/inbound/inbound-client.tsx
- apps/web/src/components/inventory/inventory-client.tsx
- apps/web/src/components/inventory/edit-product-modal.tsx
- apps/web/src/components/dashboard/sidebar.tsx
- apps/web/src/components/pembelian/po-client.tsx
- apps/web/src/components/pembelian/faktur-client.tsx
- apps/web/src/components/pembelian/penerimaan-client.tsx
- apps/web/src/app/finance/page.tsx
- apps/web/src/app/(dashboard)/activity-log/page.tsx
- apps/web/src/app/(dashboard)/panduan/page.tsx
- docs/superpowers/specs/2026-06-14-fase-a-uat-design.md (new)
- artifacts/036-fase-a-uat-ux/ (status + notes)
