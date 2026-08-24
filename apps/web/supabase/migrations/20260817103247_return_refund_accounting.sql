-- Complete a refund return, its inventory reversal, cash movement, and
-- accounting journals in one atomic database transaction.

INSERT INTO public.chart_of_accounts (
  code,
  name,
  type,
  normal_balance,
  is_system,
  is_active,
  description
)
VALUES (
  '4.1.90',
  'Retur Penjualan',
  'revenue'::public.coa_type,
  'debit'::public.coa_normal_balance,
  true,
  true,
  'Kontra pendapatan untuk pengembalian uang atas retur penjualan.'
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    type = EXCLUDED.type,
    normal_balance = EXCLUDED.normal_balance,
    is_system = true,
    is_active = true,
    description = EXCLUDED.description,
    updated_at = now();

UPDATE public.chart_of_accounts child
SET parent_id = parent.id,
    updated_at = now()
FROM public.chart_of_accounts parent
WHERE child.code = '4.1.90'
  AND parent.code = '4.1'
  AND child.parent_id IS DISTINCT FROM parent.id;

ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS refund_amount numeric,
  ADD COLUMN IF NOT EXISTS refund_bank_account_id uuid,
  ADD COLUMN IF NOT EXISTS refund_bank_transaction_id uuid,
  ADD COLUMN IF NOT EXISTS refund_journal_entry_id uuid,
  ADD COLUMN IF NOT EXISTS refund_inventory_journal_entry_id uuid,
  ADD COLUMN IF NOT EXISTS refund_date date,
  ADD COLUMN IF NOT EXISTS refund_reference_no text,
  ADD COLUMN IF NOT EXISTS refund_settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_settled_by uuid;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'returns_refund_amount_positive'
      AND conrelid = 'public.returns'::regclass
  ) THEN
    ALTER TABLE public.returns
      ADD CONSTRAINT returns_refund_amount_positive
      CHECK (refund_amount IS NULL OR refund_amount > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'returns_refund_bank_account_id_fkey'
      AND conrelid = 'public.returns'::regclass
  ) THEN
    ALTER TABLE public.returns
      ADD CONSTRAINT returns_refund_bank_account_id_fkey
      FOREIGN KEY (refund_bank_account_id)
      REFERENCES public.bank_accounts(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'returns_refund_bank_transaction_id_fkey'
      AND conrelid = 'public.returns'::regclass
  ) THEN
    ALTER TABLE public.returns
      ADD CONSTRAINT returns_refund_bank_transaction_id_fkey
      FOREIGN KEY (refund_bank_transaction_id)
      REFERENCES public.bank_transactions(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'returns_refund_journal_entry_id_fkey'
      AND conrelid = 'public.returns'::regclass
  ) THEN
    ALTER TABLE public.returns
      ADD CONSTRAINT returns_refund_journal_entry_id_fkey
      FOREIGN KEY (refund_journal_entry_id)
      REFERENCES public.journal_entries(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'returns_refund_inventory_journal_entry_id_fkey'
      AND conrelid = 'public.returns'::regclass
  ) THEN
    ALTER TABLE public.returns
      ADD CONSTRAINT returns_refund_inventory_journal_entry_id_fkey
      FOREIGN KEY (refund_inventory_journal_entry_id)
      REFERENCES public.journal_entries(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'returns_refund_settled_by_fkey'
      AND conrelid = 'public.returns'::regclass
  ) THEN
    ALTER TABLE public.returns
      ADD CONSTRAINT returns_refund_settled_by_fkey
      FOREIGN KEY (refund_settled_by)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END;
$constraints$;

CREATE INDEX IF NOT EXISTS idx_returns_refund_bank_account_id
  ON public.returns(refund_bank_account_id);
CREATE INDEX IF NOT EXISTS idx_returns_refund_bank_transaction_id
  ON public.returns(refund_bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_returns_refund_journal_entry_id
  ON public.returns(refund_journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_returns_refund_inventory_journal_entry_id
  ON public.returns(refund_inventory_journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_returns_refund_settled_by
  ON public.returns(refund_settled_by);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_transactions_return_refund
  ON public.bank_transactions(related_entity_id)
  WHERE related_entity_type = 'return_refund'
    AND related_entity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.process_return_refund_atomic_core(
  p_return_id uuid,
  p_new_product_id uuid,
  p_refund_bank_account_id uuid,
  p_refund_amount numeric,
  p_refund_date date,
  p_refund_reference_no text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_return public.returns%ROWTYPE;
  v_original public.products%ROWTYPE;
  v_replacement public.products%ROWTYPE;
  v_bank public.bank_accounts%ROWTYPE;
  v_original_unit_hpp numeric := 0;
  v_bank_coa_id uuid;
  v_return_coa_id uuid;
  v_inventory_journal_id uuid;
  v_refund_journal_id uuid;
  v_bank_transaction_id uuid;
  v_reference_no text := NULLIF(btrim(p_refund_reference_no), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesi pengguna tidak valid';
  END IF;

  SELECT r.*
  INTO v_return
  FROM public.returns r
  WHERE r.id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Retur tidak ditemukan';
  END IF;
  IF v_return.status = 'processed'::public.return_status THEN
    RETURN jsonb_build_object(
      'return_id', v_return.id,
      'status', v_return.status,
      'already_processed', true,
      'bank_transaction_id', v_return.refund_bank_transaction_id,
      'refund_journal_id', v_return.refund_journal_entry_id,
      'inventory_journal_id', v_return.refund_inventory_journal_entry_id
    );
  END IF;
  IF v_return.status <> 'verified'::public.return_status THEN
    RAISE EXCEPTION 'Retur belum diverifikasi';
  END IF;

  IF v_return.type = 'exchange_size'::public.return_type THEN
    IF NOT public.has_any_role(
      ARRAY['owner', 'admin_gudang', 'admin_online']::public.user_role[]
    ) THEN
      RAISE EXCEPTION 'Tidak berhak memproses tukar size';
    END IF;
    IF p_new_product_id IS NULL THEN
      RAISE EXCEPTION 'Produk pengganti wajib dipilih';
    END IF;
    IF p_new_product_id = v_return.original_product_id THEN
      RAISE EXCEPTION 'Produk pengganti harus berbeda dari barang awal';
    END IF;

    -- Lock both variants in a deterministic order to avoid cross-exchange
    -- deadlocks when two returns are processed concurrently.
    PERFORM 1
    FROM public.products p
    WHERE p.id IN (v_return.original_product_id, p_new_product_id)
    ORDER BY p.id
    FOR UPDATE;

    SELECT p.* INTO v_original
    FROM public.products p
    WHERE p.id = v_return.original_product_id;

    SELECT p.* INTO v_replacement
    FROM public.products p
    WHERE p.id = p_new_product_id;

    IF v_original.id IS NULL THEN
      RAISE EXCEPTION 'Produk awal retur tidak ditemukan';
    END IF;
    IF v_replacement.id IS NULL OR v_replacement.is_active = false THEN
      RAISE EXCEPTION 'Produk pengganti tidak ditemukan atau nonaktif';
    END IF;
    IF lower(v_replacement.brand) <> lower(v_original.brand)
       OR lower(v_replacement.model) <> lower(v_original.model) THEN
      RAISE EXCEPTION 'Produk pengganti harus brand dan model yang sama';
    END IF;

    SELECT COALESCE(
      (SELECT pi.unit_hpp
       FROM public.packing_items pi
       WHERE pi.id = v_return.packing_item_id),
      v_original.hpp,
      0
    )
    INTO v_original_unit_hpp;

    UPDATE public.products
    SET quantity = quantity - 1,
        updated_at = now()
    WHERE id = v_replacement.id
      AND quantity > 0;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stok produk pengganti habis';
    END IF;

    UPDATE public.products
    SET quantity = quantity + 1,
        updated_at = now()
    WHERE id = v_original.id;

    INSERT INTO public.stock_movements (
      product_id, type, quantity, unit_cost, reference_type,
      reference_id, notes, performed_by
    )
    VALUES
      (
        v_original.id, 'return_in'::public.stock_movement_type, 1,
        v_original_unit_hpp, 'return', v_return.id,
        'Barang awal masuk dari tukar size', v_uid
      ),
      (
        v_replacement.id, 'return_out'::public.stock_movement_type, 1,
        COALESCE(v_replacement.hpp, 0), 'return', v_return.id,
        'Barang pengganti keluar untuk tukar size', v_uid
      );

    IF v_original_unit_hpp > 0 OR COALESCE(v_replacement.hpp, 0) > 0 THEN
      v_inventory_journal_id := private.post_atomic_journal(
        current_date,
        'Penyesuaian HPP tukar size retur',
        'stock_adjustment'::public.journal_source,
        v_return.id,
        v_uid,
        jsonb_build_array(
          jsonb_build_object(
            'account_code', '1.1.05', 'debit', v_original_unit_hpp, 'credit', 0,
            'description', 'Barang awal retur kembali ke persediaan'
          ),
          jsonb_build_object(
            'account_code', '5.1', 'debit', 0, 'credit', v_original_unit_hpp,
            'description', 'Pembalik HPP barang awal retur'
          ),
          jsonb_build_object(
            'account_code', '5.1', 'debit', COALESCE(v_replacement.hpp, 0), 'credit', 0,
            'description', 'HPP barang pengganti tukar size'
          ),
          jsonb_build_object(
            'account_code', '1.1.05', 'debit', 0, 'credit', COALESCE(v_replacement.hpp, 0),
            'description', 'Persediaan barang pengganti keluar'
          )
        )
      );
    END IF;

    UPDATE public.returns
    SET status = 'processed'::public.return_status,
        processed_by = v_uid,
        processed_at = now(),
        new_product_id = v_replacement.id,
        new_size = v_replacement.size
    WHERE id = v_return.id;
  ELSIF v_return.type = 'refund'::public.return_type THEN
    IF NOT public.has_any_role(
      ARRAY['owner', 'finance']::public.user_role[]
    ) THEN
      RAISE EXCEPTION 'Refund uang hanya dapat diselesaikan Owner atau Finance';
    END IF;
    IF p_refund_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'Rekening refund wajib dipilih';
    END IF;
    IF p_refund_amount IS NULL OR p_refund_amount <= 0 THEN
      RAISE EXCEPTION 'Nominal refund harus lebih dari 0';
    END IF;
    IF p_refund_date IS NULL THEN
      RAISE EXCEPTION 'Tanggal refund wajib diisi';
    END IF;
    IF private.is_fiscal_period_closed(p_refund_date) THEN
      RAISE EXCEPTION 'Periode akuntansi untuk tanggal refund sudah ditutup';
    END IF;

    SELECT p.*
    INTO v_original
    FROM public.products p
    WHERE p.id = v_return.original_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produk awal retur tidak ditemukan';
    END IF;

    SELECT b.*
    INTO v_bank
    FROM public.bank_accounts b
    WHERE b.id = p_refund_bank_account_id
    FOR UPDATE;

    IF NOT FOUND OR v_bank.is_active = false THEN
      RAISE EXCEPTION 'Rekening refund tidak ditemukan atau nonaktif';
    END IF;
    IF v_bank.current_balance < p_refund_amount THEN
      RAISE EXCEPTION 'Saldo rekening % tidak mencukupi', v_bank.name;
    END IF;

    SELECT COALESCE(
      (SELECT pi.unit_hpp
       FROM public.packing_items pi
       WHERE pi.id = v_return.packing_item_id),
      v_original.hpp,
      0
    )
    INTO v_original_unit_hpp;

    SELECT coa.id
    INTO v_bank_coa_id
    FROM public.chart_of_accounts coa
    WHERE coa.id = v_bank.coa_account_id
      AND coa.is_active = true;

    IF v_bank_coa_id IS NULL THEN
      SELECT coa.id
      INTO v_bank_coa_id
      FROM public.chart_of_accounts coa
      WHERE coa.code = CASE v_bank.type
        WHEN 'cash'::public.bank_account_type THEN '1.1.01'
        WHEN 'marketplace_balance'::public.bank_account_type THEN '1.1.03'
        ELSE '1.1.02'
      END
        AND coa.is_active = true
      LIMIT 1;
    END IF;

    SELECT coa.id
    INTO v_return_coa_id
    FROM public.chart_of_accounts coa
    WHERE coa.code = '4.1.90'
      AND coa.is_active = true
    LIMIT 1;

    IF v_bank_coa_id IS NULL THEN
      RAISE EXCEPTION 'COA rekening refund belum tersedia';
    END IF;
    IF v_return_coa_id IS NULL THEN
      RAISE EXCEPTION 'COA Retur Penjualan 4.1.90 belum tersedia';
    END IF;

    UPDATE public.products
    SET quantity = quantity + 1,
        updated_at = now()
    WHERE id = v_original.id;

    INSERT INTO public.stock_movements (
      product_id, type, quantity, unit_cost, reference_type,
      reference_id, notes, performed_by
    )
    VALUES (
      v_original.id, 'return_in'::public.stock_movement_type, 1,
      v_original_unit_hpp, 'return', v_return.id,
      'Barang refund kembali ke persediaan', v_uid
    );

    IF v_original_unit_hpp > 0 THEN
      v_inventory_journal_id := private.post_atomic_journal(
        p_refund_date,
        'Pembalik HPP barang refund',
        'stock_adjustment'::public.journal_source,
        v_return.id,
        v_uid,
        jsonb_build_array(
          jsonb_build_object(
            'account_code', '1.1.05', 'debit', v_original_unit_hpp, 'credit', 0,
            'description', 'Barang refund kembali ke persediaan'
          ),
          jsonb_build_object(
            'account_code', '5.1', 'debit', 0, 'credit', v_original_unit_hpp,
            'description', 'Pembalik HPP barang refund'
          )
        )
      );
    END IF;

    UPDATE public.bank_accounts
    SET current_balance = current_balance - p_refund_amount,
        updated_at = now()
    WHERE id = v_bank.id;

    INSERT INTO public.bank_transactions (
      bank_account_id,
      transaction_date,
      type,
      amount,
      description,
      reference_no,
      counterpart_account_id,
      balance_after,
      related_entity_type,
      related_entity_id,
      created_by
    )
    VALUES (
      v_bank.id,
      p_refund_date,
      'debit'::public.bank_transaction_type,
      p_refund_amount,
      'Refund retur penjualan',
      v_reference_no,
      v_return_coa_id,
      v_bank.current_balance - p_refund_amount,
      'return_refund',
      v_return.id,
      v_uid
    )
    RETURNING id INTO v_bank_transaction_id;

    v_refund_journal_id := private.post_atomic_journal(
      p_refund_date,
      'Refund retur penjualan',
      'other'::public.journal_source,
      v_bank_transaction_id,
      v_uid,
      jsonb_build_array(
        jsonb_build_object(
          'account_id', v_return_coa_id, 'debit', p_refund_amount, 'credit', 0,
          'description', 'Kontra pendapatan retur penjualan'
        ),
        jsonb_build_object(
          'account_id', v_bank_coa_id, 'debit', 0, 'credit', p_refund_amount,
          'description', 'Pengeluaran kas/bank untuk refund'
        )
      )
    );

    UPDATE public.returns
    SET status = 'processed'::public.return_status,
        processed_by = v_uid,
        processed_at = now(),
        new_product_id = NULL,
        new_size = NULL,
        refund_amount = p_refund_amount,
        refund_bank_account_id = v_bank.id,
        refund_bank_transaction_id = v_bank_transaction_id,
        refund_journal_entry_id = v_refund_journal_id,
        refund_inventory_journal_entry_id = v_inventory_journal_id,
        refund_date = p_refund_date,
        refund_reference_no = v_reference_no,
        refund_settled_at = now(),
        refund_settled_by = v_uid
    WHERE id = v_return.id;
  ELSE
    RAISE EXCEPTION 'Tipe retur tidak didukung';
  END IF;

  INSERT INTO public.activity_logs (
    user_id, action, entity_type, entity_id, new_data
  )
  VALUES (
    v_uid,
    'process',
    'return',
    v_return.id,
    jsonb_build_object(
      'type', v_return.type,
      'original_product_id', v_original.id,
      'new_product_id', v_replacement.id,
      'refund_bank_account_id', CASE
        WHEN v_return.type = 'refund'::public.return_type THEN v_bank.id
        ELSE NULL
      END,
      'refund_amount', CASE
        WHEN v_return.type = 'refund'::public.return_type THEN p_refund_amount
        ELSE NULL
      END,
      'bank_transaction_id', v_bank_transaction_id,
      'refund_journal_id', v_refund_journal_id,
      'inventory_journal_id', v_inventory_journal_id
    )
  );

  RETURN jsonb_build_object(
    'return_id', v_return.id,
    'type', v_return.type,
    'original_product_id', v_original.id,
    'new_product_id', v_replacement.id,
    'bank_account_id', v_bank.id,
    'bank_transaction_id', v_bank_transaction_id,
    'refund_journal_id', v_refund_journal_id,
    'inventory_journal_id', v_inventory_journal_id,
    'already_processed', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.process_return_refund_atomic_core(
  uuid, uuid, uuid, numeric, date, text
) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.process_return_refund_atomic_core(
  uuid, uuid, uuid, numeric, date, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION private.process_return_refund_atomic_core(
  uuid, uuid, uuid, numeric, date, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.process_return_atomic(
  p_return_id uuid,
  p_new_product_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.process_return_refund_atomic_core(
    p_return_id,
    p_new_product_id,
    NULL,
    NULL,
    current_date,
    NULL
  );
$function$;

CREATE OR REPLACE FUNCTION public.process_return_atomic(
  p_return_id uuid,
  p_new_product_id uuid,
  p_refund_bank_account_id uuid,
  p_refund_amount numeric,
  p_refund_date date,
  p_refund_reference_no text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.process_return_refund_atomic_core(
    p_return_id,
    p_new_product_id,
    p_refund_bank_account_id,
    p_refund_amount,
    p_refund_date,
    p_refund_reference_no
  );
$function$;

REVOKE ALL ON FUNCTION public.process_return_atomic(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_return_atomic(uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.process_return_atomic(
  uuid, uuid, uuid, numeric, date, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_return_atomic(
  uuid, uuid, uuid, numeric, date, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.process_return_atomic(uuid, uuid) IS
  'Compatibility wrapper for atomic return processing; refund calls require the six-argument overload.';
COMMENT ON FUNCTION public.process_return_atomic(
  uuid, uuid, uuid, numeric, date, text
) IS
  'Atomically processes an exchange or refund, including stock, cash/bank, journals, and audit log.';
