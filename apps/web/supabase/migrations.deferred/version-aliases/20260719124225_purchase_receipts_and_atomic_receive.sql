-- Purchase receipt history and atomic PO receiving.
-- "Pembelian Barang" is the supplier purchase flow. Customer Pre Order remains
-- a separate demand flow and is only linked through procurement links.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.transaction_number_counters (
  series text PRIMARY KEY,
  last_value bigint NOT NULL CHECK (last_value >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.transaction_number_counters
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.next_transaction_number(
  p_code text,
  p_date date,
  p_width integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_series text;
  v_value bigint;
BEGIN
  IF p_code !~ '^[A-Z]+$' OR p_width < 1 OR p_width > 12 THEN
    RAISE EXCEPTION 'Invalid transaction number configuration';
  END IF;

  v_series := p_code || '-' || to_char(COALESCE(p_date, current_date), 'YYMM') || '-';

  INSERT INTO private.transaction_number_counters(series, last_value)
  VALUES (v_series, 1)
  ON CONFLICT (series) DO UPDATE
    SET last_value = private.transaction_number_counters.last_value + 1,
        updated_at = now()
  RETURNING last_value INTO v_value;

  RETURN v_series || lpad(v_value::text, p_width, '0');
END;
$$;

REVOKE ALL ON FUNCTION private.next_transaction_number(text, date, integer)
  FROM PUBLIC, anon, authenticated;

-- Seed counters from every deletable numbered transaction so a hard delete can
-- never cause MAX(number)+1 generators to reuse a deleted number.
INSERT INTO private.transaction_number_counters(series, last_value)
SELECT series, max(seq)
FROM (
  SELECT regexp_replace(po_number, '[0-9]+$', '') AS series,
         substring(po_number FROM '([0-9]+)$')::bigint AS seq
  FROM public.purchase_orders
  UNION ALL
  SELECT regexp_replace(invoice_number, '[0-9]+$', ''),
         substring(invoice_number FROM '([0-9]+)$')::bigint
  FROM public.purchase_invoices
  UNION ALL
  SELECT regexp_replace(payment_number, '[0-9]+$', ''),
         substring(payment_number FROM '([0-9]+)$')::bigint
  FROM public.vendor_payments
  UNION ALL
  SELECT regexp_replace(invoice_number, '[0-9]+$', ''),
         substring(invoice_number FROM '([0-9]+)$')::bigint
  FROM public.sales_invoices
  UNION ALL
  SELECT regexp_replace(payment_number, '[0-9]+$', ''),
         substring(payment_number FROM '([0-9]+)$')::bigint
  FROM public.customer_payments
  UNION ALL
  SELECT regexp_replace(entry_number, '[0-9]+$', ''),
         substring(entry_number FROM '([0-9]+)$')::bigint
  FROM public.journal_entries
) numbered
WHERE series IS NOT NULL AND seq IS NOT NULL
GROUP BY series
ON CONFLICT (series) DO UPDATE
  SET last_value = greatest(
        private.transaction_number_counters.last_value,
        excluded.last_value
      ),
      updated_at = now();

CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE,
  po_id uuid NOT NULL
    REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  receipt_date date NOT NULL DEFAULT current_date,
  notes text,
  created_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  source_activity_log_id uuid UNIQUE
    REFERENCES public.activity_logs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL
    REFERENCES public.purchase_receipts(id) ON DELETE CASCADE,
  po_line_id uuid NOT NULL
    REFERENCES public.purchase_order_lines(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL
    REFERENCES public.products(id) ON DELETE RESTRICT,
  stock_movement_id uuid NOT NULL UNIQUE
    REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_po_id
  ON public.purchase_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_date
  ON public.purchase_receipts(receipt_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_created_by
  ON public.purchase_receipts(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_lines_receipt_id
  ON public.purchase_receipt_lines(receipt_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_lines_po_line_id
  ON public.purchase_receipt_lines(po_line_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_lines_product_id
  ON public.purchase_receipt_lines(product_id);

ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_receipts_read_authorized
  ON public.purchase_receipts;
CREATE POLICY purchase_receipts_read_authorized
  ON public.purchase_receipts
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.has_any_role(
      ARRAY['owner','finance','admin_gudang']::public.user_role[]
    ))
  );

DROP POLICY IF EXISTS purchase_receipt_lines_read_authorized
  ON public.purchase_receipt_lines;
CREATE POLICY purchase_receipt_lines_read_authorized
  ON public.purchase_receipt_lines
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.has_any_role(
      ARRAY['owner','finance','admin_gudang']::public.user_role[]
    ))
  );

REVOKE ALL ON TABLE public.purchase_receipts
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.purchase_receipt_lines
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.purchase_receipts TO authenticated;
GRANT SELECT ON TABLE public.purchase_receipt_lines TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_purchase_receipt_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    ARRAY['owner','finance','admin_gudang']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak membuat nomor penerimaan';
  END IF;

  RETURN private.next_transaction_number('RCV', current_date, 4);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_purchase_receipt_number()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_purchase_receipt_number()
  TO authenticated;

-- Backfill receipt headers and lines from the immutable stock movements named
-- in the old receive activity logs.
DO $$
DECLARE
  v_log record;
  v_movement record;
  v_receipt_id uuid;
  v_receipt_number text;
BEGIN
  FOR v_log IN
    SELECT al.id, al.entity_id AS po_id, al.user_id, al.created_at
    FROM public.activity_logs al
    WHERE al.action = 'receive'
      AND al.entity_type = 'purchase_order'
      AND al.entity_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          COALESCE(al.new_data->'movements', '[]'::jsonb)
        ) movement_id
        JOIN public.stock_movements sm
          ON sm.id = movement_id::uuid
        WHERE sm.reference_type = 'purchase_order_line'
      )
    ORDER BY al.created_at, al.id
  LOOP
    v_receipt_number := private.next_transaction_number(
      'RCV',
      v_log.created_at::date,
      4
    );

    INSERT INTO public.purchase_receipts(
      receipt_number,
      po_id,
      receipt_date,
      notes,
      created_by,
      source_activity_log_id,
      created_at
    )
    VALUES (
      v_receipt_number,
      v_log.po_id,
      v_log.created_at::date,
      'Penerimaan historis (backfill)',
      v_log.user_id,
      v_log.id,
      v_log.created_at
    )
    RETURNING id INTO v_receipt_id;

    FOR v_movement IN
      SELECT sm.*
      FROM jsonb_array_elements_text(
        COALESCE(
          (SELECT new_data->'movements'
           FROM public.activity_logs
           WHERE id = v_log.id),
          '[]'::jsonb
        )
      ) movement_id
      JOIN public.stock_movements sm
        ON sm.id = movement_id::uuid
      JOIN public.purchase_order_lines pol
        ON pol.id = sm.reference_id
       AND pol.po_id = v_log.po_id
      WHERE sm.reference_type = 'purchase_order_line'
      ORDER BY sm.created_at, sm.id
    LOOP
      INSERT INTO public.purchase_receipt_lines(
        receipt_id,
        po_line_id,
        product_id,
        stock_movement_id,
        quantity,
        unit_cost,
        created_at
      )
      VALUES (
        v_receipt_id,
        v_movement.reference_id,
        v_movement.product_id,
        v_movement.id,
        v_movement.quantity,
        v_movement.unit_cost,
        v_movement.created_at
      )
      ON CONFLICT (stock_movement_id) DO NOTHING;
    END LOOP;
  END LOOP;

  -- Preserve any legacy PO receipt movement that was not referenced by an
  -- activity snapshot. Each orphan becomes an explicit receipt.
  FOR v_movement IN
    SELECT sm.*, pol.po_id
    FROM public.stock_movements sm
    JOIN public.purchase_order_lines pol ON pol.id = sm.reference_id
    LEFT JOIN public.purchase_receipt_lines prl
      ON prl.stock_movement_id = sm.id
    WHERE sm.reference_type = 'purchase_order_line'
      AND prl.id IS NULL
    ORDER BY sm.created_at, sm.id
  LOOP
    v_receipt_number := private.next_transaction_number(
      'RCV',
      v_movement.created_at::date,
      4
    );

    INSERT INTO public.purchase_receipts(
      receipt_number,
      po_id,
      receipt_date,
      notes,
      created_by,
      created_at
    )
    VALUES (
      v_receipt_number,
      v_movement.po_id,
      v_movement.created_at::date,
      'Penerimaan historis dari mutasi stok (backfill)',
      v_movement.performed_by,
      v_movement.created_at
    )
    RETURNING id INTO v_receipt_id;

    INSERT INTO public.purchase_receipt_lines(
      receipt_id,
      po_line_id,
      product_id,
      stock_movement_id,
      quantity,
      unit_cost,
      created_at
    )
    VALUES (
      v_receipt_id,
      v_movement.reference_id,
      v_movement.product_id,
      v_movement.id,
      v_movement.quantity,
      v_movement.unit_cost,
      v_movement.created_at
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_order_lines pol
    LEFT JOIN (
      SELECT po_line_id, sum(quantity)::integer AS receipt_qty
      FROM public.purchase_receipt_lines
      GROUP BY po_line_id
    ) receipt_totals ON receipt_totals.po_line_id = pol.id
    WHERE pol.received_qty <> COALESCE(receipt_totals.receipt_qty, 0)
  ) THEN
    RAISE EXCEPTION
      'Receipt backfill mismatch: receipt totals must equal purchase_order_lines.received_qty';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.post_atomic_journal(
  p_entry_date date,
  p_description text,
  p_source_type public.journal_source,
  p_source_id uuid,
  p_user_id uuid,
  p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry_id uuid;
  v_entry_number text;
  v_line jsonb;
  v_account_id uuid;
  v_debit numeric;
  v_credit numeric;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_order integer := 0;
BEGIN
  SELECT COALESCE(sum((item.value->>'debit')::numeric), 0),
         COALESCE(sum((item.value->>'credit')::numeric), 0)
  INTO v_total_debit, v_total_credit
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS item(value);

  IF abs(v_total_debit - v_total_credit) > 0.01
     OR v_total_debit <= 0 THEN
    RAISE EXCEPTION 'Jurnal tidak seimbang: debit %, kredit %',
      v_total_debit, v_total_credit;
  END IF;

  v_entry_number := private.next_transaction_number(
    'JRN',
    p_entry_date,
    5
  );

  INSERT INTO public.journal_entries(
    entry_number,
    entry_date,
    description,
    source_type,
    source_id,
    total_debit,
    total_credit,
    status,
    created_by
  )
  VALUES (
    v_entry_number,
    p_entry_date,
    p_description,
    p_source_type,
    p_source_id,
    v_total_debit,
    v_total_credit,
    'posted',
    p_user_id
  )
  RETURNING id INTO v_entry_id;

  FOR v_line IN
    SELECT value
    FROM jsonb_array_elements(p_lines)
  LOOP
    v_debit := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit := COALESCE((v_line->>'credit')::numeric, 0);

    IF NULLIF(v_line->>'account_id', '') IS NOT NULL THEN
      v_account_id := (v_line->>'account_id')::uuid;
    ELSE
      SELECT id INTO v_account_id
      FROM public.chart_of_accounts
      WHERE code = v_line->>'account_code'
        AND is_active = true
      LIMIT 1;
    END IF;

    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'COA % tidak ditemukan',
        COALESCE(v_line->>'account_code', v_line->>'account_id');
    END IF;

    INSERT INTO public.journal_lines(
      entry_id,
      account_id,
      debit,
      credit,
      description,
      line_order
    )
    VALUES (
      v_entry_id,
      v_account_id,
      v_debit,
      v_credit,
      NULLIF(v_line->>'description', ''),
      v_order
    );
    v_order := v_order + 1;
  END LOOP;

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION private.post_atomic_journal(
  date, text, public.journal_source, uuid, uuid, jsonb
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.receive_purchase_order_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_po record;
  v_input record;
  v_line record;
  v_product record;
  v_existing_product_id uuid;
  v_product_id uuid;
  v_receipt_id uuid;
  v_receipt_number text;
  v_stock_movement_id uuid;
  v_new_status public.po_status;
  v_received_lines integer := 0;
  v_total_qty integer := 0;
  v_auto_invoice_id uuid;
  v_invoice_number text;
  v_auto_payment_id uuid;
  v_payment_number text;
  v_auto_payment_amount numeric := 0;
  v_invoice_status public.purchase_invoice_status;
  v_bank record;
  v_bank_account_id uuid;
  v_payment_method public.payment_method;
  v_activity_id uuid;
  v_notes text := NULLIF(btrim(COALESCE(p_payload->>'notes', '')), '');
  v_journal_lines jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_any_role(
    ARRAY['owner','finance','admin_gudang']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak memproses penerimaan barang';
  END IF;

  SELECT *
  INTO v_po
  FROM public.purchase_orders
  WHERE id = (p_payload->>'po_id')::uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO Pembelian tidak ditemukan';
  END IF;

  IF v_po.status NOT IN ('approved','receiving') THEN
    RAISE EXCEPTION 'PO Pembelian tidak dalam status siap diterima';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fiscal_periods
    WHERE year = extract(year FROM current_date)::integer
      AND month = extract(month FROM current_date)::integer
      AND status = 'closed'
  ) THEN
    RAISE EXCEPTION 'Periode fiskal penerimaan sudah ditutup';
  END IF;

  -- Validate and aggregate duplicate payload lines before doing any write.
  FOR v_input IN
    SELECT (item->>'line_id')::uuid AS line_id,
           sum((item->>'receive_qty')::integer)::integer AS receive_qty
    FROM jsonb_array_elements(COALESCE(p_payload->'lines', '[]'::jsonb)) item
    GROUP BY (item->>'line_id')::uuid
  LOOP
    IF v_input.receive_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT *
    INTO v_line
    FROM public.purchase_order_lines
    WHERE id = v_input.line_id
      AND po_id = v_po.id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Baris PO Pembelian % tidak ditemukan', v_input.line_id;
    END IF;

    IF v_line.received_qty + v_input.receive_qty > v_line.ordered_qty THEN
      RAISE EXCEPTION 'Qty diterima melebihi sisa baris PO Pembelian';
    END IF;

    v_received_lines := v_received_lines + 1;
    v_total_qty := v_total_qty + v_input.receive_qty;
  END LOOP;

  IF v_received_lines = 0 THEN
    RAISE EXCEPTION 'Tidak ada item yang diterima';
  END IF;

  v_receipt_number := private.next_transaction_number('RCV', current_date, 4);
  INSERT INTO public.purchase_receipts(
    receipt_number,
    po_id,
    receipt_date,
    notes,
    created_by
  )
  VALUES (
    v_receipt_number,
    v_po.id,
    current_date,
    v_notes,
    v_uid
  )
  RETURNING id INTO v_receipt_id;

  FOR v_input IN
    SELECT (item->>'line_id')::uuid AS line_id,
           sum((item->>'receive_qty')::integer)::integer AS receive_qty
    FROM jsonb_array_elements(COALESCE(p_payload->'lines', '[]'::jsonb)) item
    GROUP BY (item->>'line_id')::uuid
  LOOP
    IF v_input.receive_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT *
    INTO v_line
    FROM public.purchase_order_lines
    WHERE id = v_input.line_id
      AND po_id = v_po.id
    FOR UPDATE;

    v_product_id := v_line.product_id;

    IF v_product_id IS NULL THEN
      IF NULLIF(btrim(COALESCE(v_line.new_sku, '')), '') IS NULL
         OR NULLIF(btrim(COALESCE(v_line.new_brand, '')), '') IS NULL
         OR NULLIF(btrim(COALESCE(v_line.new_model, '')), '') IS NULL
         OR NULLIF(btrim(COALESCE(v_line.new_size_label, '')), '') IS NULL
         OR v_line.new_size IS NULL THEN
        RAISE EXCEPTION
          'Item baru PO Pembelian belum lengkap (brand/model/size/SKU)';
      END IF;

      SELECT id
      INTO v_existing_product_id
      FROM public.products
      WHERE sku = btrim(v_line.new_sku)
        AND round(size, 2) = round(v_line.new_size, 2)
      LIMIT 1
      FOR UPDATE;

      IF v_existing_product_id IS NULL THEN
        INSERT INTO public.products(
          brand,
          model,
          sku,
          size,
          size_label,
          color,
          barcode,
          quantity,
          hpp,
          sell_price,
          price_offline,
          is_active,
          first_inbound_at
        )
        VALUES (
          btrim(v_line.new_brand),
          btrim(v_line.new_model),
          btrim(v_line.new_sku),
          v_line.new_size,
          btrim(v_line.new_size_label),
          NULLIF(btrim(COALESCE(v_line.new_color, '')), ''),
          btrim(v_line.new_sku),
          0,
          0,
          v_line.unit_cost,
          v_line.unit_cost,
          true,
          now()
        )
        RETURNING id INTO v_product_id;
      ELSE
        v_product_id := v_existing_product_id;
      END IF;

      UPDATE public.purchase_order_lines
      SET product_id = v_product_id
      WHERE id = v_line.id;
    END IF;

    SELECT id, quantity, hpp
    INTO v_product
    FROM public.products
    WHERE id = v_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produk pada baris PO Pembelian tidak ditemukan';
    END IF;

    UPDATE public.products
    SET hpp = (
          (v_product.quantity * v_product.hpp)
          + (v_input.receive_qty * v_line.unit_cost)
        ) / (v_product.quantity + v_input.receive_qty),
        quantity = v_product.quantity + v_input.receive_qty,
        first_inbound_at = COALESCE(first_inbound_at, now()),
        updated_at = now()
    WHERE id = v_product_id;

    INSERT INTO public.stock_movements(
      product_id,
      type,
      quantity,
      unit_cost,
      reference_type,
      reference_id,
      notes,
      performed_by
    )
    VALUES (
      v_product_id,
      'inbound',
      v_input.receive_qty,
      v_line.unit_cost,
      'purchase_order_line',
      v_line.id,
      'Penerimaan ' || v_receipt_number,
      v_uid
    )
    RETURNING id INTO v_stock_movement_id;

    INSERT INTO public.purchase_receipt_lines(
      receipt_id,
      po_line_id,
      product_id,
      stock_movement_id,
      quantity,
      unit_cost
    )
    VALUES (
      v_receipt_id,
      v_line.id,
      v_product_id,
      v_stock_movement_id,
      v_input.receive_qty,
      v_line.unit_cost
    );

    UPDATE public.purchase_order_lines
    SET received_qty = received_qty + v_input.receive_qty
    WHERE id = v_line.id;
  END LOOP;

  SELECT CASE
    WHEN bool_and(received_qty >= ordered_qty) THEN 'completed'::public.po_status
    WHEN bool_or(received_qty > 0) THEN 'receiving'::public.po_status
    ELSE 'approved'::public.po_status
  END
  INTO v_new_status
  FROM public.purchase_order_lines
  WHERE po_id = v_po.id;

  UPDATE public.purchase_orders
  SET status = v_new_status,
      updated_at = now()
  WHERE id = v_po.id;

  IF v_new_status = 'completed' THEN
    SELECT id
    INTO v_auto_invoice_id
    FROM public.purchase_invoices
    WHERE po_id = v_po.id
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;

    IF v_auto_invoice_id IS NULL THEN
      v_invoice_number := private.next_transaction_number('FB', current_date, 4);

      INSERT INTO public.purchase_invoices(
        invoice_number,
        supplier_id,
        po_id,
        invoice_date,
        due_date,
        subtotal,
        tax,
        total,
        paid_amount,
        status,
        notes,
        created_by
      )
      VALUES (
        v_invoice_number,
        v_po.supplier_id,
        v_po.id,
        current_date,
        NULL,
        v_po.subtotal + v_po.shipping,
        v_po.tax,
        v_po.total,
        0,
        'unpaid',
        'Dibuat otomatis dari ' || v_po.po_number
          || ' saat penerimaan selesai',
        v_uid
      )
      RETURNING id INTO v_auto_invoice_id;

      v_journal_lines := jsonb_build_array(
        jsonb_build_object(
          'account_code', '1.1.05',
          'debit', v_po.subtotal + v_po.shipping,
          'credit', 0,
          'description', 'Pembelian persediaan'
        )
      );
      IF v_po.tax > 0 THEN
        v_journal_lines := v_journal_lines || jsonb_build_array(
          jsonb_build_object(
            'account_code', '2.1.02',
            'debit', v_po.tax,
            'credit', 0,
            'description', 'PPN masukan'
          )
        );
      END IF;
      v_journal_lines := v_journal_lines || jsonb_build_array(
        jsonb_build_object(
          'account_code', '2.1.01',
          'debit', 0,
          'credit', v_po.total,
          'description', 'Hutang vendor'
        )
      );

      PERFORM private.post_atomic_journal(
        current_date,
        'Faktur pembelian ' || v_invoice_number,
        'purchase_invoice',
        v_auto_invoice_id,
        v_uid,
        v_journal_lines
      );

      v_auto_payment_amount := CASE v_po.payment_type
        WHEN 'cash' THEN v_po.total
        WHEN 'dp' THEN least(v_po.dp_amount, v_po.total)
        ELSE 0
      END;

      IF v_auto_payment_amount > 0 THEN
        IF v_po.dp_bank_account_id IS NULL THEN
          RAISE EXCEPTION
            'Akun kas/bank wajib dipilih untuk pembayaran PO Pembelian';
        END IF;

        SELECT *
        INTO v_bank
        FROM public.bank_accounts
        WHERE id = v_po.dp_bank_account_id
        FOR UPDATE;

        IF NOT FOUND OR NOT v_bank.is_active THEN
          RAISE EXCEPTION 'Akun kas/bank pembayaran tidak aktif';
        END IF;
        IF v_bank.current_balance < v_auto_payment_amount THEN
          RAISE EXCEPTION
            'Saldo kas/bank tidak cukup untuk pembayaran PO Pembelian';
        END IF;

        v_payment_number := private.next_transaction_number(
          'BV',
          current_date,
          4
        );
        v_payment_method := CASE
          WHEN v_bank.type = 'cash' THEN 'cash'::public.payment_method
          ELSE 'bank_transfer'::public.payment_method
        END;

        INSERT INTO public.vendor_payments(
          payment_number,
          supplier_id,
          payment_date,
          amount,
          payment_method,
          bank_account_id,
          notes,
          created_by
        )
        VALUES (
          v_payment_number,
          v_po.supplier_id,
          current_date,
          v_auto_payment_amount,
          v_payment_method,
          v_po.dp_bank_account_id,
          CASE v_po.payment_type
            WHEN 'cash' THEN 'Bayar Lunas otomatis dari ' || v_po.po_number
            ELSE 'DP otomatis dari ' || v_po.po_number
          END,
          v_uid
        )
        RETURNING id INTO v_auto_payment_id;

        INSERT INTO public.vendor_payment_allocations(
          payment_id,
          invoice_id,
          amount
        )
        VALUES (
          v_auto_payment_id,
          v_auto_invoice_id,
          v_auto_payment_amount
        );

        v_invoice_status := CASE
          WHEN v_auto_payment_amount >= v_po.total
            THEN 'paid'::public.purchase_invoice_status
          ELSE 'partial'::public.purchase_invoice_status
        END;

        UPDATE public.purchase_invoices
        SET paid_amount = v_auto_payment_amount,
            status = v_invoice_status,
            updated_at = now()
        WHERE id = v_auto_invoice_id;

        UPDATE public.bank_accounts
        SET current_balance = current_balance - v_auto_payment_amount,
            updated_at = now()
        WHERE id = v_po.dp_bank_account_id;

        INSERT INTO public.bank_transactions(
          bank_account_id,
          transaction_date,
          type,
          amount,
          balance_after,
          reference_no,
          description,
          related_entity_type,
          related_entity_id,
          is_reconciled,
          created_by
        )
        VALUES (
          v_po.dp_bank_account_id,
          current_date,
          'debit',
          v_auto_payment_amount,
          v_bank.current_balance - v_auto_payment_amount,
          v_payment_number,
          'Pembayaran vendor ' || v_payment_number,
          'vendor_payment',
          v_auto_payment_id,
          false,
          v_uid
        );

        v_bank_account_id := v_bank.coa_account_id;
        IF v_bank_account_id IS NULL THEN
          SELECT id
          INTO v_bank_account_id
          FROM public.chart_of_accounts
          WHERE code = CASE
            WHEN v_bank.type = 'cash' THEN '1.1.01'
            WHEN v_bank.type = 'marketplace_balance' THEN '1.1.03'
            ELSE '1.1.02'
          END
            AND is_active = true
          LIMIT 1;
        END IF;

        PERFORM private.post_atomic_journal(
          current_date,
          'Pembayaran vendor ' || v_payment_number,
          'vendor_payment',
          v_auto_payment_id,
          v_uid,
          jsonb_build_array(
            jsonb_build_object(
              'account_code', '2.1.01',
              'debit', v_auto_payment_amount,
              'credit', 0,
              'description', 'Pelunasan hutang vendor'
            ),
            jsonb_build_object(
              'account_id', v_bank_account_id,
              'debit', 0,
              'credit', v_auto_payment_amount,
              'description', 'Kas/Bank keluar'
            )
          )
        );
      END IF;
    END IF;
  END IF;

  INSERT INTO public.activity_logs(
    user_id,
    action,
    entity_type,
    entity_id,
    new_data
  )
  VALUES (
    v_uid,
    'receive',
    'purchase_receipt',
    v_receipt_id,
    jsonb_build_object(
      'receipt_number', v_receipt_number,
      'po_number', v_po.po_number
    )
  )
  RETURNING id INTO v_activity_id;

  UPDATE public.purchase_receipts
  SET source_activity_log_id = v_activity_id
  WHERE id = v_receipt_id;

  RETURN jsonb_build_object(
    'success', true,
    'receipt_id', v_receipt_id,
    'receipt_number', v_receipt_number,
    'new_status', v_new_status,
    'received_lines', v_received_lines,
    'total_qty', v_total_qty,
    'auto_invoice_id', v_auto_invoice_id,
    'auto_payment_id', v_auto_payment_id,
    'auto_payment_amount', v_auto_payment_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_order_atomic(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_atomic(jsonb)
  TO authenticated;

COMMENT ON TABLE public.purchase_receipts IS
  'Header history for each physical receipt against a supplier Purchase Order.';
COMMENT ON TABLE public.purchase_receipt_lines IS
  'Receipt lines tied to PO lines and the exact inbound stock movements.';
COMMENT ON FUNCTION public.receive_purchase_order_atomic(jsonb) IS
  'Atomically creates a purchase receipt, stock/HPP effects, PO status, automatic invoice/payment, bank mutation, and journals.';
