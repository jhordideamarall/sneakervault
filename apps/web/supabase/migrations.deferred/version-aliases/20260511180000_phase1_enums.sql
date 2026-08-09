-- ============================================================================
-- SneakerVault — Phase 1 Meeting 2: enum extensions
-- ============================================================================
-- ALTER TYPE ... ADD VALUE must run outside a multi-statement transaction in
-- some Postgres versions when followed by usage in the same file. Supabase
-- applies each migration file in its own transaction, so we isolate enum
-- additions here and reference them in the next migration file.
-- ============================================================================

-- New role for finance team (read-only access to financial data)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'finance';

-- New enum for product physical condition (orthogonal to is_active soft-delete)
-- normal  = barang siap dijual penuh
-- defect  = cacat, masih di gudang, mungkin perlu dijual diskon
-- dormant = lama tidak laku (aging alert), flag untuk review owner
DO $$ BEGIN
  CREATE TYPE product_condition AS ENUM ('normal', 'defect', 'dormant');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
