# Sprint 1 — Auth + Layout + Backend Logic

**Status:** Done
**Sprint:** Sprint 1
**Tanggal Mulai:** 2026-05-10
**Tanggal Selesai:** 2026-05-10

## Tasks
- [x] Supabase Auth: login/register server actions
- [x] Auth middleware (session check + redirect)
- [x] Dashboard layout: sidebar + topbar
- [x] Login page UI
- [x] Workspace page (role-based quick actions)
- [x] Route permission config
- [x] Zod validators (all entities)
- [x] Server actions: inbound (scan, register, confirm, HPP recalc)
- [x] Server actions: outbound (create session, scan item, remove, cancel, finalize)
- [x] Server actions: status transitions (with validation)
- [x] Server actions: returns (initiate, verify, process)
- [x] Server actions: admin (delete request/approve/reject)
- [x] Server actions: suppliers CRUD
- [x] Activity log helper + wired into all mutations
- [x] Query functions (inventory, sessions, dashboard, logs, sold)
- [x] UI pages: inbound, outbound, orders, inventory
- [x] Placeholder pages: overview, sold, returns, suppliers, reports, settings
- [x] Tailwind CSS 4 setup
- [x] Build passes ✓

## Files Created/Modified
- packages/shared/src/validators.ts
- packages/shared/src/index.ts
- packages/supabase/package.json (added next peerDep)
- apps/web/package.json (added tsconfig dep)
- apps/web/postcss.config.mjs
- apps/web/src/app/globals.css
- apps/web/src/app/layout.tsx
- apps/web/src/app/login/page.tsx
- apps/web/src/app/(dashboard)/layout.tsx
- apps/web/src/app/(dashboard)/workspace/page.tsx
- apps/web/src/app/(dashboard)/inbound/page.tsx
- apps/web/src/app/(dashboard)/outbound/page.tsx
- apps/web/src/app/(dashboard)/orders/page.tsx
- apps/web/src/app/(dashboard)/inventory/page.tsx
- apps/web/src/app/(dashboard)/overview/page.tsx
- apps/web/src/app/(dashboard)/sold/page.tsx
- apps/web/src/app/(dashboard)/returns/page.tsx
- apps/web/src/app/(dashboard)/suppliers/page.tsx
- apps/web/src/app/(dashboard)/reports/page.tsx
- apps/web/src/app/(dashboard)/settings/page.tsx
- apps/web/src/middleware.ts
- apps/web/src/config/permissions.ts
- apps/web/src/lib/actions/auth.ts
- apps/web/src/lib/actions/inbound.ts
- apps/web/src/lib/actions/outbound.ts
- apps/web/src/lib/actions/status.ts
- apps/web/src/lib/actions/returns.ts
- apps/web/src/lib/actions/admin.ts
- apps/web/src/lib/actions/suppliers.ts
- apps/web/src/lib/queries/index.ts
- apps/web/src/components/dashboard/sidebar.tsx
- apps/web/src/components/dashboard/topbar.tsx
- apps/web/src/components/auth/login-form.tsx
