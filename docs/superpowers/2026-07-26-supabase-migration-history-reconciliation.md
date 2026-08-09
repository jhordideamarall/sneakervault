# Supabase Migration History Reconciliation

**Date:** 2026-07-26
**Mode:** Read-only audit completed; no remote history mutation performed.

## Objective

Restore a migration workflow where:

1. local migration versions mirror production history;
2. `supabase db push --dry-run` lists only genuinely new migrations;
3. production is never asked to replay historical schema changes;
4. a clean database can still be bootstrapped and tested separately.

## Verified Current State

The production migration history and active local migration directory have
substantial version drift:

- remote history: **72** versions;
- active local directory: **70** versions, including the three new integrity
  migrations from 2026-07-26;
- exact version matches: **12**;
- same migration name but different version: **43**;
- remote-only migration names: **17**;
- local-only migration names: **15**, including the three new migrations.

This is not a one-row history typo. A blanket `migration repair` would rewrite
the wrong side of the history and could cause old migrations to be replayed.

## Canonical Sources

Use these as independent sources of truth:

1. production schema dump for the schema that actually exists;
2. `supabase_migrations.schema_migrations` dump for versions production
   considers applied;
3. the current repository for application intent and historical full SQL;
4. the three new migrations for the pending integrity changes.

Do not assume that every remote history statement can bootstrap a fresh
database. Some remote entries contain only short marker/comment statements
while the corresponding local file contains the full schema operation.

## Safe Reconciliation Procedure

### Phase A — Immutable snapshots

1. Export production `public`, `private`, and `auth` schemas.
2. Export `supabase_migrations.schema_migrations`.
3. Record hashes and sizes for every remote migration statement.
4. Store snapshots outside the active migration directory.

### Phase B — Canonical production-history mirror

Perform this in an isolated branch/worktree:

1. Build a migration directory whose filenames use the exact 72 remote
   versions and names.
2. Preserve every displaced local historical file under
   `migrations.deferred/version-aliases/`; do not delete it.
3. Use the exact remote history statement where it is complete.
4. Where a remote statement is only a marker, keep the marker in the active
   history mirror and retain the full local implementation in the deferred
   archive.
5. Append the three 2026-07-26 integrity migrations unchanged.

Expected checkpoint:

```text
supabase migration list --linked
```

must show all historical versions on both sides, with only the three new
integrity versions present locally.

### Phase C — Bootstrap baseline

Production-history mirroring and clean bootstrap are different concerns.

1. Restore the production schema dump into a disposable Postgres database.
2. Create a reviewed baseline/snapshot for new environments.
3. Apply all post-baseline migrations.
4. Compare the resulting schema against production using a schema-only diff.
5. Keep protected seed/config data in a separate, idempotent seed path.

Do not apply the bootstrap baseline to the existing production database.

### Phase D — Deployment rehearsal

1. Run `supabase db push --dry-run`.
2. Confirm the output contains only:
   - `20260726120234_logistics_reservation_size_integrity.sql`
   - `20260726120800_bank_coa_posting_integrity.sql`
   - `20260726123156_manual_bank_transaction_atomic.sql`
3. Restore the latest production schema into disposable Postgres.
4. Apply those three migrations with `ON_ERROR_STOP=1`.
5. Run the accounting/logistics regression SQL and concurrency tests.
6. Run `plpgsql_check` on every changed RPC/trigger.

### Phase E — Production

1. Take a fresh schema and migration-history snapshot.
2. Apply only the reviewed pending migrations.
3. Verify function definitions, grants, balances, journal linkage, and trigger
   presence.
4. Run read-only smoke queries.
5. Record the deployed migration versions in the artifact.

## Explicitly Prohibited Shortcuts

- Do not mark all local-only versions as applied.
- Do not mark all remote-only versions as reverted.
- Do not run `db pull` directly into the dirty active migration directory.
- Do not replace production schema from a local reset.
- Do not deploy with `--include-all` while version drift remains.
- Do not discard historical local SQL; move it to the deferred archive.

## Current Deployment Gate

The code and SQL changes are locally verified, but production deployment
remains gated on Phase B. The correct next action is an isolated canonical
history branch, not a remote `migration repair`.
