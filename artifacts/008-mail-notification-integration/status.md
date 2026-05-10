# Mail Notification Integration & Hardening

**Status:** [x] Done
**Sprint:** Sprint 008 — Mail as Notification System
**Tanggal Mulai:** 2026-05-11
**Tanggal Selesai:** 2026-05-11

## Phase 1 — Fix Sync Gaps ✅
- [x] DB drift di-fix (3 remote migrations pulled to local)
- [x] Migration hardening: `is_system` column, guard trigger, indexes, `app_settings`, `notification_preferences`
- [x] Storage bucket `chat-attachments` configured (10MB, MIME whitelist)
- [x] Helper `create_system_notification()` SECURITY DEFINER
- [x] Types regenerated (`packages/supabase/src/types.ts`)
- [x] Type-check fix: `use-inbox.ts` optimistic message

## Phase 2 — Server-Side Notification Pipeline ✅
- [x] `notify.ts` helper with discriminated union event types
- [x] Recipient resolver (role-based + broadcast for low_stock)
- [x] Mute/digest support via `notification_preferences`
- [x] Hooked into `outbound.ts`, `status.ts`, `returns.ts`, `inbound.ts`, `admin.ts`
- [x] `checkLowStockAndNotify()` helper for post-outbound stock check
- [x] Activity log sync: every `notifyEvent()` also logs `notification_sent` to `activity_logs`

## Phase 3 — UI Enhancement ✅
- [x] `SystemMessageBubble` component — event-specific icons, colors, "Buka detail" deep link
- [x] Tab filter: Semua / Notifikasi / Chat
- [x] Mobile responsive: `95vw/95vh`, hidden sidebar on mobile, back button
- [x] Deep link handler: `?openMail=<user_id>` query param
- [x] Hint visual: Mail icon + kbd `M` badge in topbar
- [x] Exit animation (scale down + fade + blur on close)
- [x] Focus ring removed on tab buttons
- [x] Pre-existing type errors fixed (8 errors resolved)

## Phase 4 — Hardening ✅
- [x] RLS tightened: SELECT/UPDATE → `authenticated` only, no DELETE policy
- [x] Guard trigger verified: only `is_read` updatable
- [x] Storage policy verified: 10MB, 8 MIME types, path enforcement
- [x] pg_cron cleanup job: daily 03:00 UTC, delete attachments > 180 days
- [x] Rate limit trigger: max 30 msg/min per user (configurable via `app_settings`)
- [x] Revoked direct RPC execute on internal functions
- [x] Inbox query limited to 200 most recent messages
- [x] `markAsRead` optimistic update (instant badge decrement)

## Bonus — Realtime & UI Polish ✅
- [x] Global realtime: `RealtimeProvider` subscribes to all key tables
- [x] `supabase_realtime` publication: activity_logs, products, packing_sessions, packing_items, returns, delete_requests, purchase_batches
- [x] All dashboard pages auto-refresh on data changes (no manual refresh needed)
- [x] Right sidebar: separator between calendar & activity log, sticky header fix
- [x] Left sidebar: fully flexible resize (no min/max constraints)
- [x] Both sidebars: reduced border radius (`rounded-md`)

## Migrations Applied
- `20260511020000_mail_notification_hardening.sql`
- `20260511033000_phase4_hardening.sql` (RLS, rate limit, cron, revokes)
- `enable_realtime_all_tables` (publication)
- `tighten_internal_messages_rls_roles`
- `chat_attachment_cleanup_cron`
- `chat_rate_limit`
- `revoke_internal_function_execute`

## Files Modified/Created
- `apps/web/src/components/dashboard/mail/system-message-bubble.tsx` (new)
- `apps/web/src/components/dashboard/mail/mail-global-dialog.tsx`
- `apps/web/src/components/dashboard/mail/mail-inbox.tsx`
- `apps/web/src/components/dashboard/topbar.tsx`
- `apps/web/src/components/dashboard/right-sidebar.tsx`
- `apps/web/src/components/dashboard/realtime-provider.tsx` (new)
- `apps/web/src/lib/use-inbox.ts`
- `apps/web/src/lib/use-realtime-refresh.ts` (new)
- `apps/web/src/lib/actions/notify.ts`
- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/supabase/migrations/20260511033000_phase4_hardening.sql` (new)
