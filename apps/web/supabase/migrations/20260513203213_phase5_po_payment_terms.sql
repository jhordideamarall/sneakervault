ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'credit'
    CHECK (payment_type IN ('credit', 'cash', 'dp'));

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS dp_amount numeric(14,2) NOT NULL DEFAULT 0
    CHECK (dp_amount >= 0);

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS dp_bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN purchase_orders.payment_type IS
  'Cara bayar yang dipilih saat buat PO: credit=bayar nanti, cash=bayar lunas di awal, dp=uang muka';
COMMENT ON COLUMN purchase_orders.dp_amount IS
  'Nominal DP atau bayar lunas. Dipakai server saat faktur auto-dibuat.';
COMMENT ON COLUMN purchase_orders.dp_bank_account_id IS
  'Akun bank/kas sumber dana untuk DP/cash payment.';
