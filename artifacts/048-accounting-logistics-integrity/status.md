# Accounting & Logistics Integrity

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** Accounting & Logistics Integrity
**Tanggal Mulai:** 2026-07-26
**Tanggal Selesai:** 2026-07-26

## Tasks
- [x] Protect active stock reservations during receipt and manual-invoice hard delete
- [x] Reject active reservations above physical stock
- [x] Restore free-text size matching before numeric-size validation on PO receipt
- [x] Prevent POS from consuming stock reserved for a Pre Order
- [x] Post POS and marketplace settlement cash movements to the selected bank COA
- [x] Lock products, invoices, and bank balances in deterministic workflow order
- [x] Replace manual bank multi-write flow with one atomic RPC
- [x] Support automatic two-sided bank subledger entries for interbank transfer
- [x] Add rollback-safe SQL regression coverage
- [x] Run true concurrent same-bank receipts and opposite-direction transfers
- [x] Audit remote/local migration history without mutating production
- [x] Run type-check, migration verification, PL/pgSQL check, and final diff review

## Blockers
- Implementation is complete. Production rollout is gated by the divergent
  remote/local Supabase migration history described below.

## Deployment Note
- Supabase MCP was not available in this session.
- The linked Supabase CLI was used read-only to dump the remote schema.
- Remote and local migration histories are divergent. No migration history
  repair, database pull, or production push was performed.
- Read-only history audit found 72 remote versions versus 70 active local
  versions: only 12 exact version matches, 43 same-name/different-version
  migrations, 17 remote-only names, and 15 local-only names.
- All three new migrations were applied to a disposable Postgres database restored
  from the remote schema; regression fixtures ran inside `BEGIN`/`ROLLBACK`.
- A safe reconciliation procedure is documented in
  `docs/superpowers/2026-07-26-supabase-migration-history-reconciliation.md`.

## Durable Handoff — 2026-07-27

### Current State
- Working branch: `fix/accounting-logistics-integrity`.
- The implementation is present locally and has not been committed.
- The three new migration files are the intended deployable schema delta; do
  not edit older migration files to make history appear aligned.
- No production schema, migration history, or transaction data was mutated.
- `.codex/` is unrelated, untracked user state and must remain untouched.
- Supabase MCP is optional for the remaining work. The linked Supabase CLI and
  read-only SQL access are sufficient, but all production verification must be
  recorded here.

### Remaining Work — Not Started
- [ ] Create an isolated reconciliation branch/worktree; do not rewrite
      migration history in the current implementation worktree.
- [ ] Take immutable read-only snapshots of remote migration history and the
      current local migration directory.
- [ ] Build and review the canonical production-history mirror according to
      `docs/superpowers/2026-07-26-supabase-migration-history-reconciliation.md`.
- [ ] Restore a clean disposable database from the canonical baseline and
      apply the three new migrations with `ON_ERROR_STOP=1`.
- [ ] Run `supabase db push --dry-run` and confirm that only the three new
      migrations are pending.
- [ ] Obtain explicit confirmation before any migration-history repair or
      production schema push because those are high-risk operations.
- [ ] Apply the migrations to production, then smoke-test reservation-aware
      deletion, free-text PO receipt, POS, Shopee settlement, manual bank
      mutation, and interbank transfer.
- [ ] Verify production GL/subledger balance, audit records, grants, and
      migration history; update this artifact with evidence.
- [ ] Commit only when explicitly requested.

### Do Not Use as a Shortcut
- Do not run `supabase db push --include-all`.
- Do not blindly mark divergent versions as repaired.
- Do not run `supabase db pull` into the dirty implementation worktree.
- Do not edit, rename, or delete historical migrations merely to satisfy the
  CLI migration list.
- Do not reset, truncate, or otherwise modify production data during history
  reconciliation.

### Production Completion Criteria
- Remote history and the canonical repository history agree.
- Dry-run reports exactly the three intended migrations and no historical
  replay.
- All three migrations apply atomically without manual SQL patching.
- Post-deployment smoke tests pass and bank subledger totals reconcile to GL.
- No reservation can exceed or outlive its available physical stock.

## Validation
- `pnpm --filter @sneakervault/web type-check` — pass
- `git diff --check` — pass
- All three migrations applied with `ON_ERROR_STOP=1` — pass
- `plpgsql_check` on all changed RPCs and the reservation trigger — no findings
- ESLint on `bank-transactions.ts` — pass
- SQL regression scenarios — pass:
  - manual purchase invoice deletion blocked by active reservation
  - purchase receipt deletion blocked by active reservation
  - over-reservation rejected
  - existing `SKU + "42 2/3"` product matched with `new_size = NULL`
  - POS payment posted to the selected bank COA
  - POS sale of reserved stock rejected without balance mutation
  - Shopee settlement posted to the selected bank COA and AR counterpart
  - regular manual bank mutation updates bank + GL + audit atomically
  - insufficient manual withdrawal leaves no partial mutation
  - interbank transfer creates two linked bank rows and one balanced journal
  - closed fiscal period rejects manual bank mutation
- True concurrency verification — pass:
  - 12 parallel same-bank receipts: balance `120`, 12 distinct
    `balance_after` values, 12 journals, 12 audits
  - 20 parallel opposite-direction interbank transfers: both balances remain
    `120`, 40 linked bank rows, 20 journals, zero deadlocks

## Files Modified
- `apps/web/supabase/migrations/20260726120234_logistics_reservation_size_integrity.sql`
- `apps/web/supabase/migrations/20260726120800_bank_coa_posting_integrity.sql`
- `apps/web/supabase/migrations/20260726123156_manual_bank_transaction_atomic.sql`
- `apps/web/supabase/tests/20260726_accounting_logistics_integrity.sql`
- `apps/web/src/lib/actions/bank-transactions.ts`
- `packages/supabase/src/types.ts`
- `docs/superpowers/2026-07-26-supabase-migration-history-reconciliation.md`
- `artifacts/048-accounting-logistics-integrity/status.md`
