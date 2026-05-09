# Sprint 2-7 — UI & Feature Completion

**Status:** Done (19/19) ✓
**Sprint:** Sprint 2-7 (batched)
**Tanggal Mulai:** 2026-05-10
**Tanggal Selesai:** 2026-05-10

## Scope
Selesaikan seluruh UI, flows, dan fitur ekspor agar sistem siap pakai setelah migrasi DB dideploy.

## Tasks

### Shared Infrastructure
- [x] Shared UI primitives di packages/ui (Button, Input, Select, Card, Badge, Alert)
- [x] Toast notification system + provider di root layout

### Core Flows
- [x] Inbound page — scan → register/confirm batch → commit
- [x] Outbound page — create session → scan items → cancel/finalize → shipped
- [x] Orders page — list + role-aware status transition buttons
- [x] Inventory — search/filter + product detail + edit + live refresh
- [x] Suppliers — full CRUD

### Returns & Sold
- [x] Returns — initiate (admin_online) / verify (admin_gudang) / process (refund/exchange_size)
- [x] Sold — filterable history with totals + export PDF/Excel

### Owner-only Pages
- [x] Overview dashboard — stats cards (stock items, stock value, monthly revenue, monthly profit), bestsellers
- [x] Reports — stock value + profit with date range + top 10 bestsellers + aging report
- [x] Settings — user management (list, assign roles via modal, activate/deactivate)
- [x] Activity log viewer — action filter + JSON diff
- [x] Delete requests list + approve/reject

### Export & Backup
- [x] Export PDF (jsPDF + jspdf-autotable) via reusable ExportButtons
- [x] Export Excel (SheetJS / xlsx) via reusable ExportButtons
- [x] Barcode generate UI — JsBarcode Code128, SVG/PNG download + print
- [x] Backup shell script (pg_dump with gzip + rotation)

### Realtime & Bulk Data (PRD D5 + Architecture §5.3)
- [x] Realtime subscriptions — useLiveRefresh hook wired to inventory (products) + orders (packing_sessions)
- [x] Bulk import CSV/Excel — BulkImportButton + template download + bulkImportProducts action

### Final
- [x] Update artifacts
- [x] Verify build (✓ all 17 routes compile)

## Architecture Adherence (vs PRD + architecture.md + Riwayatmeeting.md)

| Requirement | Status |
|---|---|
| Single source of truth untuk stok (no spreadsheet) | ✓ All stock flows through DB |
| Integrasi Accurate via barcode yang sama | ✓ Scan barcode → auto-fill |
| Scan masuk + auto-complete + quick-add | ✓ Inbound flow |
| 1 sesi packing = banyak item | ✓ packing_sessions + packing_items |
| Stok berkurang SAAT SCAN | ✓ scanPackingItem uses atomic RPC |
| Status flow: Packing → Dikirim → Selesai/Return | ✓ With role-based transitions |
| Return 2-step verification | ✓ Online initiate → Gudang verify → Process |
| HPP rata-rata per MODEL | ✓ recalculate_hpp_by_model DB RPC |
| Anti-fraud: no delete button | ✓ Request-approval workflow |
| Activity log immutable | ✓ RLS: owner-read only, no update/delete |
| Role-based access | ✓ 4 roles, route guard, RLS, server action checks |
| Export PDF + Excel + SQL dump | ✓ All three |
| Bahasa Indonesia | ✓ All UI strings |
| Max 2 clicks untuk aksi utama | ✓ Scan → confirm |
| Feedback instan setiap aksi | ✓ Toast notifications |
| Monorepo siap integrasi website | ✓ packages/shared, packages/supabase, packages/barcode |

## Files Created/Modified

### Shared packages/ui
- packages/ui/src/button.tsx (5 variants)
- packages/ui/src/input.tsx (Input, Textarea, FieldLabel, FieldError)
- packages/ui/src/select.tsx
- packages/ui/src/card.tsx (Card, CardHeader, CardTitle)
- packages/ui/src/badge.tsx (6 tones)
- packages/ui/src/alert.tsx (4 tones)
- packages/ui/src/index.ts

### packages/barcode
- packages/barcode/src/generate.ts (JsBarcode wrapper)
- packages/barcode/src/index.ts

### apps/web — components
- apps/web/src/components/toast.tsx
- apps/web/src/components/export-buttons.tsx
- apps/web/src/components/inbound/inbound-client.tsx
- apps/web/src/components/outbound/outbound-client.tsx
- apps/web/src/components/orders/orders-client.tsx
- apps/web/src/components/inventory/inventory-client.tsx
- apps/web/src/components/inventory/bulk-import-button.tsx
- apps/web/src/components/suppliers/suppliers-client.tsx
- apps/web/src/components/returns/returns-client.tsx
- apps/web/src/components/settings/settings-client.tsx
- apps/web/src/components/delete-requests/delete-requests-client.tsx
- apps/web/src/components/dashboard/sidebar.tsx (+nav items)

### apps/web — pages
- apps/web/src/app/layout.tsx (ToastProvider)
- apps/web/src/app/(dashboard)/inbound/page.tsx
- apps/web/src/app/(dashboard)/outbound/page.tsx
- apps/web/src/app/(dashboard)/orders/page.tsx
- apps/web/src/app/(dashboard)/inventory/page.tsx
- apps/web/src/app/(dashboard)/suppliers/page.tsx
- apps/web/src/app/(dashboard)/returns/page.tsx
- apps/web/src/app/(dashboard)/sold/page.tsx
- apps/web/src/app/(dashboard)/overview/page.tsx
- apps/web/src/app/(dashboard)/reports/page.tsx
- apps/web/src/app/(dashboard)/settings/page.tsx
- apps/web/src/app/(dashboard)/activity-log/page.tsx
- apps/web/src/app/(dashboard)/delete-requests/page.tsx
- apps/web/src/app/(dashboard)/barcode-generate/page.tsx
- apps/web/src/app/api/products-by-model/route.ts

### apps/web — backend
- apps/web/src/lib/actions/products.ts (updateProduct, bulkImportProducts)
- apps/web/src/lib/actions/users.ts (listUsers, assignRoles, setUserActive)
- apps/web/src/lib/queries/index.ts (+ getReturns, getReturnableItems, getActiveProductsByModel, getStockValue, getProfitReport, getAgingReport)
- apps/web/src/lib/export.ts (exportToPDF, exportToExcel)
- apps/web/src/lib/use-live-refresh.ts (realtime hook)
- apps/web/src/config/permissions.ts (+activity-log, delete-requests, barcode-generate)

### Scripts
- scripts/backup.sh (pg_dump + gzip + rotation)

## Known Gaps (not blocking MVP)
- Supplier lead time display (getSupplierLeadTime) — architecture mentions it, not implemented
- Profile self-update (name/avatar) — low priority
- Multi-gudang (PRD F21) — future
- Auto notification for low stock — future (PRD F20)

## Next Steps (handover)
1. Deploy 5 migration files via Supabase Dashboard SQL Editor (see `artifacts/001-database-migration/status.md`)
2. Sign up owner account di app `/login`
3. Run `SELECT public.bootstrap_first_owner('owner@email.com');`
4. Import produk awal via tombol "Import CSV/Excel" di /inventory
5. Assign role ke tim via /settings
