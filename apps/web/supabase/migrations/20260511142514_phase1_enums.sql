ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'finance';
DO $$ BEGIN
  CREATE TYPE product_condition AS ENUM ('normal', 'defect', 'dormant');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
