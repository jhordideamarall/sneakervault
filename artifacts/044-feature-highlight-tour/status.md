# Feature Highlight Tour

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** Client Revision Follow-up
**Tanggal Mulai:** 2026-07-14
**Tanggal Selesai:** 2026-07-14

## Tasks
- [x] Create additive Supabase migration for per-user tour dismissal state
- [x] Tighten tour-state RLS to read/upsert only for the logged-in user
- [x] Restrict authenticated table grants to SELECT/INSERT/UPDATE only
- [x] Add feature tour constants and route-aware visibility
- [x] Add server actions for reading and dismissing tour state
- [x] Add dashboard feature tour gate and modal
- [x] Wire modal into authenticated dashboard layout
- [x] Run type-check, lint, and build verification

## Blockers
- None.

## Files Modified
- `apps/web/supabase/migrations/20260713210218_user_feature_tour_states.sql`
- `apps/web/supabase/migrations/20260713211116_tighten_feature_tour_rls.sql`
- `apps/web/supabase/migrations/20260713211251_restrict_feature_tour_grants.sql`
- `packages/supabase/src/types.ts`
- `apps/web/src/lib/feature-tour.ts`
- `apps/web/src/lib/actions/feature-tour.ts`
- `apps/web/src/components/dashboard/feature-tour-gate.tsx`
- `apps/web/src/components/dashboard/feature-tour-modal.tsx`
- `apps/web/src/app/(dashboard)/layout.tsx`
- `artifacts/044-feature-highlight-tour/status.md`

## Verification
- `pnpm --filter @sneakervault/web type-check` passed.
- `pnpm type-check` passed.
- `pnpm --filter @sneakervault/web lint` passed with warnings only (0 errors; existing React hook/typing warnings remain).
- `pnpm --filter @sneakervault/web build` passed.
- Supabase MCP migration applied successfully as `20260713210218_user_feature_tour_states`.
- Supabase MCP migration applied successfully as `20260713211116_tighten_feature_tour_rls`.
- Supabase MCP migration applied successfully as `20260713211251_restrict_feature_tour_grants`.
- Supabase MCP verification confirmed `user_feature_tour_states` exists with RLS enabled, own-user SELECT/INSERT/UPDATE policies, and authenticated grants limited to SELECT/INSERT/UPDATE.
