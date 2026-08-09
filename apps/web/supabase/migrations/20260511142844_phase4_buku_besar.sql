-- ============================================================================
-- Phase 4 — Buku Besar (Chart of Accounts + Journal + Fiscal Periods)
-- ============================================================================

CREATE TYPE coa_type AS ENUM ('asset','liability','equity','revenue','expense','cogs');
CREATE TYPE coa_normal_balance AS ENUM ('debit','credit');
CREATE TYPE journal_status AS ENUM ('draft','posted','reversed');
CREATE TYPE journal_source AS ENUM (
  'manual',
  'purchase_invoice',
  'vendor_payment',
  'sales_invoice',
  'customer_payment',
  'stock_adjustment',
  'opening_balance',
  'closing',
  'other'
);
CREATE TYPE fiscal_period_status AS ENUM ('open','closed');

-- ─── Chart of Accounts ──────────────────────────────────────────────────────
CREATE TABLE chart_of_accounts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            text NOT NULL UNIQUE,
  name            text NOT NULL,
  type            coa_type NOT NULL,
  normal_balance  coa_normal_balance NOT NULL,
  parent_id       uuid REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  is_active       boolean NOT NULL DEFAULT true,
  is_system       boolean NOT NULL DEFAULT false,  -- system accounts cannot be deleted
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX coa_type_idx ON chart_of_accounts (type) WHERE is_active = true;
CREATE INDEX coa_parent_idx ON chart_of_accounts (parent_id);
CREATE TRIGGER coa_set_updated_at BEFORE UPDATE ON chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Journal Entries ────────────────────────────────────────────────────────
CREATE TABLE journal_entries (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_number    text NOT NULL UNIQUE,
  entry_date      date NOT NULL DEFAULT CURRENT_DATE,
  description     text NOT NULL,
  source_type     journal_source NOT NULL DEFAULT 'manual',
  source_id       uuid,
  total_debit     numeric NOT NULL DEFAULT 0,
  total_credit    numeric NOT NULL DEFAULT 0,
  status          journal_status NOT NULL DEFAULT 'posted',
  notes           text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reversed_by     uuid REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT je_balanced CHECK (total_debit = total_credit)
);

CREATE INDEX je_date_idx ON journal_entries (entry_date DESC);
CREATE INDEX je_source_idx ON journal_entries (source_type, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX je_status_idx ON journal_entries (status);

CREATE TABLE journal_lines (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id        uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  debit           numeric NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit          numeric NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description     text,
  line_order      integer NOT NULL DEFAULT 0,
  CONSTRAINT jl_one_side CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE INDEX jl_entry_idx ON journal_lines (entry_id);
CREATE INDEX jl_account_idx ON journal_lines (account_id);

-- ─── Fiscal Periods ─────────────────────────────────────────────────────────
CREATE TABLE fiscal_periods (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  year            integer NOT NULL CHECK (year > 2000),
  month           integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  status          fiscal_period_status NOT NULL DEFAULT 'open',
  closed_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  closed_at       timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

CREATE OR REPLACE FUNCTION public.generate_journal_entry_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prefix text; next_seq int;
BEGIN
  prefix := 'JRN-' || to_char(now(), 'YYMM') || '-';
  SELECT COALESCE(MAX(SUBSTRING(entry_number FROM '\d+$')::int), 0) + 1
    INTO next_seq FROM journal_entries WHERE entry_number LIKE prefix || '%';
  RETURN prefix || LPAD(next_seq::text, 5, '0');
END; $$;

GRANT EXECUTE ON FUNCTION public.generate_journal_entry_number() TO authenticated;

-- ─── Seed standar SAK EMKM ─────────────────────────────────────────────────
INSERT INTO chart_of_accounts (code, name, type, normal_balance, is_system, description) VALUES
  -- ASET
  ('1','ASET','asset','debit',true,'Aset / Aktiva'),
  ('1.1','Aset Lancar','asset','debit',true,'Aset Lancar'),
  ('1.1.01','Kas','asset','debit',true,'Kas di tangan'),
  ('1.1.02','Bank','asset','debit',true,'Saldo bank'),
  ('1.1.03','Saldo Marketplace','asset','debit',true,'Saldo Shopee/TikTok/dll'),
  ('1.1.04','Piutang Usaha','asset','debit',true,'Account Receivable'),
  ('1.1.05','Persediaan Barang','asset','debit',true,'Inventory'),
  ('1.2','Aset Tetap','asset','debit',true,'Aset Tetap'),

  -- LIABILITAS
  ('2','LIABILITAS','liability','credit',true,'Liabilitas / Kewajiban'),
  ('2.1','Liabilitas Lancar','liability','credit',true,'Liabilitas Jangka Pendek'),
  ('2.1.01','Hutang Usaha','liability','credit',true,'Account Payable - hutang vendor'),
  ('2.1.02','Hutang Pajak','liability','credit',true,'Pajak Terhutang'),

  -- EKUITAS
  ('3','EKUITAS','equity','credit',true,'Ekuitas / Modal'),
  ('3.1','Modal Pemilik','equity','credit',true,'Modal awal pemilik'),
  ('3.2','Laba Ditahan','equity','credit',true,'Retained Earnings'),
  ('3.3','Laba Tahun Berjalan','equity','credit',true,'Current Year Earnings'),

  -- PENDAPATAN
  ('4','PENDAPATAN','revenue','credit',true,'Revenue'),
  ('4.1','Penjualan','revenue','credit',true,'Penjualan barang'),
  ('4.1.01','Penjualan WA/Offline','revenue','credit',true,'Penjualan offline & WA'),
  ('4.1.02','Penjualan Shopee','revenue','credit',true,'Penjualan via Shopee'),
  ('4.1.03','Penjualan TikTok','revenue','credit',true,'Penjualan via TikTok Shop'),
  ('4.2','Pendapatan Lain','revenue','credit',true,'Pendapatan non-operasi'),

  -- HPP (COGS)
  ('5','HARGA POKOK PENJUALAN','cogs','debit',true,'COGS'),
  ('5.1','HPP Barang Terjual','cogs','debit',true,'Cost of Goods Sold'),

  -- BEBAN
  ('6','BEBAN','expense','debit',true,'Beban Operasional'),
  ('6.1','Beban Administrasi Marketplace','expense','debit',true,'Fee admin Shopee/TikTok'),
  ('6.2','Beban Diskon & Promosi','expense','debit',true,'Diskon penjualan, promo'),
  ('6.3','Beban Pengiriman','expense','debit',true,'Ongkir & ekspedisi'),
  ('6.4','Beban Operasional','expense','debit',true,'Listrik, internet, sewa, dll'),
  ('6.5','Beban Gaji','expense','debit',true,'Gaji karyawan'),
  ('6.6','Beban Penyusutan','expense','debit',true,'Depresiasi'),
  ('6.7','Beban Penyesuaian Stok','expense','debit',true,'Defect write-off, susut');

-- Setup parent_id relationships
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code='1') WHERE code IN ('1.1','1.2');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code='1.1') WHERE code LIKE '1.1.%';
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code='2') WHERE code IN ('2.1');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code='2.1') WHERE code LIKE '2.1.%';
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code='3') WHERE code IN ('3.1','3.2','3.3');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code='4') WHERE code IN ('4.1','4.2');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code='4.1') WHERE code LIKE '4.1.%';
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code='5') WHERE code IN ('5.1');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code='6') WHERE code LIKE '6.%' AND code <> '6';

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY coa_select ON chart_of_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY coa_write ON chart_of_accounts FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY coa_update ON chart_of_accounts FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY coa_delete ON chart_of_accounts FOR DELETE TO authenticated
  USING (public.has_role('owner'::user_role) AND is_system = false);

CREATE POLICY je_select ON journal_entries FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY je_write ON journal_entries FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY je_update ON journal_entries FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));

CREATE POLICY jl_select ON journal_lines FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY jl_write ON journal_lines FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY jl_update ON journal_lines FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));

CREATE POLICY fp_select ON fiscal_periods FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY fp_write ON fiscal_periods FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY fp_update ON fiscal_periods FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
