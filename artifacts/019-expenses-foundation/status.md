# Expenses Foundation

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** PDF Scope Gap A1
**Tanggal Mulai:** 2026-06-01
**Tanggal Selesai:** 2026-06-01

## Tasks
- [x] Read PDF scope and confirm A1 expense requirements
- [x] Create artifact folder and migration scaffold
- [x] Add expenses schema, seed, RLS, RPC, and storage bucket
- [x] Add shared validators, queries, server actions, and journal support
- [x] Build `/kas-bank/pengeluaran` expenses UI
- [x] Run type/build verification

## Blockers
- None.
- Supabase remote migration sudah diterapkan dan diverifikasi via MCP.

## Files Modified
- apps/web/supabase/migrations/20260601135230_expenses_foundation.sql
- packages/shared/src/types.ts
- packages/shared/src/validators.ts
- apps/web/src/lib/journal-engine.ts
- apps/web/src/lib/queries/index.ts
- apps/web/src/lib/actions/expenses.ts
- apps/web/src/components/kas-bank/expenses-client.tsx
- apps/web/src/components/kas-bank/mutasi-client.tsx
- apps/web/src/app/(dashboard)/kas-bank/pengeluaran/page.tsx
- apps/web/src/config/permissions.ts

## Verification
- `pnpm --filter @sneakervault/web type-check` ✅
- `pnpm --filter @sneakervault/web build` ✅
- MCP verification: `expense_categories`, `expenses`, enum `expense_status`, source jurnal `expense`, bucket `expense-receipts`, dan jurnal balance ✅
