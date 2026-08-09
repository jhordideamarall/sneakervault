# Deferred migration aliases

The files under `version-aliases/` preserve the repository's former local
migration timeline. Production recorded many of the same logical changes under
different timestamps, so these files must not stay in the active
`migrations/` directory: Supabase would otherwise attempt to replay historical
schema changes.

The active `migrations/` directory mirrors the exact 72 versions recorded by
production, followed by the four reviewed migrations added on 2026-07-26 and
2026-08-08. Do not delete or execute the deferred files against production.
