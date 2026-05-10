# Refine Chat/Mail Feature

**Status:** [x] Done
**Sprint:** Sprint Chat Refinement
**Tanggal Mulai:** 2026-05-11
**Tanggal Selesai:** 2026-05-11

## Tasks
- [x] **Database Migration**
    - [x] Add `parent_id` to `internal_messages`.
    - [x] Add `attachment_urls` to `internal_messages`.
    - [x] Add `metadata` to `internal_messages`.
- [x] **Hook Update (`useInbox`)**
    - [x] Update `InternalMessage` type.
    - [x] Update fetch logic to include parent message snippet.
    - [x] Support `parentId` and `attachments` in `sendMessage`.
- [x] **UI Overhaul (`MailGlobalDialog`)**
    - [x] Implement 'm' key toggle (open/close).
    - [x] Professional Chat Bubbles with threading support.
    - [x] Seen status indicators (checkmarks).
    - [x] Modern input with auto-grow and reply context.
- [x] **Consolidation & Cleanup**
    - [x] Remove redundant logic and components (`ComposeMail` integration simplified).
    - [x] Update `MailInbox` popover for cleaner preview.

## Blockers
- (none)

## Files Modified
- apps/web/src/lib/use-inbox.ts
- apps/web/src/components/dashboard/mail/mail-global-dialog.tsx
- apps/web/src/components/dashboard/mail/mail-inbox.tsx
