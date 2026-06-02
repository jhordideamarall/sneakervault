# Stock Opname

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** PDF Scope Gap A3
**Tanggal Mulai:** 2026-06-01
**Tanggal Selesai:** 2026-06-02

## Tasks
- [x] Add stock opname schema migration
- [x] Add shared validators and stock opname types
- [x] Build start/count/submit/approve/cancel server actions
- [x] Add stock adjustment journal template
- [x] Create `/inventory/opname` page and client UI
- [x] Rename `/inbound` sidebar label to Barang Masuk
- [x] Add FK indexes after Supabase advisor warning

## Blockers
- None.

## Files Modified
- apps/web/supabase/migrations/20260601141627_pdf_scope_gap_remaining.sql
- apps/web/supabase/migrations/20260601143849_pdf_scope_gap_fk_indexes.sql
- packages/shared/src/types.ts
- packages/shared/src/validators.ts
- apps/web/src/lib/actions/stock-opname.ts
- apps/web/src/lib/journal-engine.ts
- apps/web/src/lib/queries/index.ts
- apps/web/src/app/(dashboard)/inventory/opname/page.tsx
- apps/web/src/components/inventory/stock-opname-client.tsx
- apps/web/src/components/dashboard/sidebar.tsx
- apps/web/src/config/permissions.ts

## Verification
- `pnpm --filter @sneakervault/web type-check` ✅
- `pnpm --filter @sneakervault/web build` ✅
- MCP verification: `stock_opname_sessions`, `stock_opname_lines`, enum `stock_opname_status`, generator `generate_opname_number`, FK indexes ✅

