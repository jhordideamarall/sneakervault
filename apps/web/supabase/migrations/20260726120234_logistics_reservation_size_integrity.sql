-- Keep physical stock, active Pre Order reservations, and PO receipt product
-- matching consistent.
--
-- 1. Reservation writes lock the product row and may not allocate more than
--    physical stock. This serializes concurrent reservation creation with the
--    receipt/manual-invoice delete functions below.
-- 2. Deleting inbound stock checks unreserved availability, not only physical
--    quantity.
-- 3. Receiving a PO line matches SKU + free-text size_label before requiring a
--    numeric size, while still using the numeric identity as a fallback.

CREATE OR REPLACE FUNCTION private.validate_active_stock_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_quantity integer;
  v_other_reserved integer;
BEGIN
  IF NEW.status <> 'active'::public.stock_reservation_status THEN
    RETURN NEW;
  END IF;

  -- Lock every involved product in deterministic order. The OLD product is
  -- included when a reservation is moved between variants.
  IF TG_OP = 'UPDATE' THEN
    PERFORM p.id
    FROM public.products p
    WHERE p.id IN (OLD.product_id, NEW.product_id)
    ORDER BY p.id
    FOR UPDATE;
  ELSE
    PERFORM p.id
    FROM public.products p
    WHERE p.id = NEW.product_id
    FOR UPDATE;
  END IF;

  SELECT p.quantity
  INTO v_product_quantity
  FROM public.products p
  WHERE p.id = NEW.product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produk reservasi tidak ditemukan';
  END IF;

  SELECT COALESCE(sum(sr.quantity), 0)::integer
  INTO v_other_reserved
  FROM public.stock_reservations sr
  WHERE sr.product_id = NEW.product_id
    AND sr.status = 'active'::public.stock_reservation_status
    AND sr.id IS DISTINCT FROM NEW.id;

  IF v_other_reserved + NEW.quantity > v_product_quantity THEN
    RAISE EXCEPTION
      'Stok tersedia tidak cukup untuk reservasi: stok %, sudah direservasi %, diminta %',
      v_product_quantity,
      v_other_reserved,
      NEW.quantity;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_active_stock_reservation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_active_stock_reservation
  ON public.stock_reservations;
CREATE TRIGGER trg_validate_active_stock_reservation
BEFORE INSERT OR UPDATE OF product_id, quantity, status
ON public.stock_reservations
FOR EACH ROW
EXECUTE FUNCTION private.validate_active_stock_reservation();

CREATE OR REPLACE FUNCTION public.delete_purchase_invoice_atomic(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := private.assert_accounting_delete_role();
  v_invoice record;
  v_blockers text[];
  v_stock record;
  v_product record;
  v_new_qty integer;
  v_new_hpp numeric;
BEGIN
  SELECT *
  INTO v_invoice
  FROM public.purchase_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Faktur pembelian tidak ditemukan';
  END IF;

  IF private.is_fiscal_period_closed(v_invoice.invoice_date) THEN
    RETURN private.deleted_result(
      false, v_invoice.invoice_number, 'closed_period',
      ARRAY[to_char(v_invoice.invoice_date, 'MM/YYYY')]
    );
  END IF;

  SELECT array_agg(DISTINCT vp.payment_number ORDER BY vp.payment_number)
  INTO v_blockers
  FROM public.vendor_payment_allocations vpa
  JOIN public.vendor_payments vp ON vp.id = vpa.payment_id
  WHERE vpa.invoice_id = p_invoice_id;

  IF cardinality(COALESCE(v_blockers, ARRAY[]::text[])) > 0 THEN
    RETURN private.deleted_result(
      false, v_invoice.invoice_number, 'vendor_payment', v_blockers
    );
  END IF;

  -- A manual invoice owns its inbound stock. PO-based invoice stock belongs to
  -- purchase receipts and is intentionally untouched here.
  IF v_invoice.po_id IS NULL AND v_invoice.status <> 'cancelled' THEN
    -- Match the lock order used by reservation writes. A reservation attempting
    -- to start concurrently must wait and revalidate against the resulting
    -- stock quantity.
    PERFORM p.id
    FROM public.products p
    WHERE p.id IN (
      SELECT pil.product_id
      FROM public.purchase_invoice_lines pil
      WHERE pil.invoice_id = p_invoice_id
        AND pil.product_id IS NOT NULL
    )
    ORDER BY p.id
    FOR UPDATE;

    SELECT array_agg(product_label ORDER BY product_label)
    INTO v_blockers
    FROM (
      SELECT min(pil.product_label) AS product_label
      FROM public.purchase_invoice_lines pil
      JOIN public.products p ON p.id = pil.product_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(sr.quantity), 0)::integer AS active_reserved
        FROM public.stock_reservations sr
        WHERE sr.product_id = pil.product_id
          AND sr.status = 'active'::public.stock_reservation_status
      ) reserved ON true
      WHERE pil.invoice_id = p_invoice_id
      GROUP BY pil.product_id, p.quantity, reserved.active_reserved
      HAVING p.quantity - reserved.active_reserved < sum(pil.qty)
    ) blocked_stock;

    IF cardinality(COALESCE(v_blockers, ARRAY[]::text[])) > 0 THEN
      RETURN private.deleted_result(
        false, v_invoice.invoice_number, 'stock_usage', v_blockers
      );
    END IF;

    FOR v_stock IN
      SELECT pil.product_id,
             sum(pil.qty)::integer AS quantity,
             sum(pil.qty * pil.unit_cost)::numeric AS cost_value
      FROM public.purchase_invoice_lines pil
      WHERE pil.invoice_id = p_invoice_id
        AND pil.product_id IS NOT NULL
      GROUP BY pil.product_id
      ORDER BY pil.product_id
    LOOP
      SELECT id, quantity, hpp
      INTO v_product
      FROM public.products
      WHERE id = v_stock.product_id
      FOR UPDATE;

      v_new_qty := v_product.quantity - v_stock.quantity;
      v_new_hpp := CASE
        WHEN v_new_qty <= 0 THEN 0
        ELSE greatest(
          ((v_product.quantity * v_product.hpp) - v_stock.cost_value)
          / v_new_qty,
          0
        )
      END;

      UPDATE public.products
      SET quantity = v_new_qty,
          hpp = v_new_hpp,
          updated_at = now()
      WHERE id = v_stock.product_id;
    END LOOP;
  END IF;

  DELETE FROM public.stock_movements
  WHERE (
    reference_type = 'purchase_invoice_line'
    AND reference_id IN (
      SELECT id
      FROM public.purchase_invoice_lines
      WHERE invoice_id = p_invoice_id
    )
  ) OR (
    reference_type = 'purchase_invoice_cancel'
    AND reference_id IN (
      SELECT id
      FROM public.purchase_invoice_lines
      WHERE invoice_id = p_invoice_id
    )
  );

  PERFORM private.delete_source_journals(
    'purchase_invoice', p_invoice_id
  );
  PERFORM private.write_minimal_delete_audit(
    v_uid,
    'purchase_invoice',
    v_invoice.invoice_number,
    'purchase_invoice',
    p_invoice_id
  );

  DELETE FROM public.purchase_invoices
  WHERE id = p_invoice_id;

  RETURN private.deleted_result(true, v_invoice.invoice_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_purchase_receipt_atomic(p_receipt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := private.assert_accounting_delete_role();
  v_receipt record;
  v_blockers text[];
  v_stock record;
  v_product record;
  v_movement_ids uuid[];
  v_new_qty integer;
  v_new_hpp numeric;
  v_new_status public.po_status;
BEGIN
  SELECT *
  INTO v_receipt
  FROM public.purchase_receipts
  WHERE id = p_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Penerimaan barang tidak ditemukan';
  END IF;

  PERFORM po.id
  FROM public.purchase_orders po
  WHERE po.id = v_receipt.po_id
  FOR UPDATE;

  IF private.is_fiscal_period_closed(v_receipt.receipt_date) THEN
    RETURN private.deleted_result(
      false, v_receipt.receipt_number, 'closed_period',
      ARRAY[to_char(v_receipt.receipt_date, 'MM/YYYY')]
    );
  END IF;

  SELECT array_agg(invoice_number ORDER BY invoice_number)
  INTO v_blockers
  FROM public.purchase_invoices
  WHERE po_id = v_receipt.po_id;

  IF cardinality(COALESCE(v_blockers, ARRAY[]::text[])) > 0 THEN
    RETURN private.deleted_result(
      false, v_receipt.receipt_number, 'purchase_invoice', v_blockers
    );
  END IF;

  PERFORM p.id
  FROM public.products p
  WHERE p.id IN (
    SELECT prl.product_id
    FROM public.purchase_receipt_lines prl
    WHERE prl.receipt_id = p_receipt_id
  )
  ORDER BY p.id
  FOR UPDATE;

  SELECT array_agg(product_label ORDER BY product_label)
  INTO v_blockers
  FROM (
    SELECT min(
      p.brand || ' ' || p.model || ' - Size ' || p.size_label
    ) AS product_label
    FROM public.purchase_receipt_lines prl
    JOIN public.products p ON p.id = prl.product_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(sum(sr.quantity), 0)::integer AS active_reserved
      FROM public.stock_reservations sr
      WHERE sr.product_id = prl.product_id
        AND sr.status = 'active'::public.stock_reservation_status
    ) reserved ON true
    WHERE prl.receipt_id = p_receipt_id
    GROUP BY prl.product_id, p.quantity, reserved.active_reserved
    HAVING p.quantity - reserved.active_reserved < sum(prl.quantity)
  ) blocked_stock;

  IF cardinality(COALESCE(v_blockers, ARRAY[]::text[])) > 0 THEN
    RETURN private.deleted_result(
      false, v_receipt.receipt_number, 'stock_usage', v_blockers
    );
  END IF;

  SELECT array_agg(stock_movement_id ORDER BY stock_movement_id)
  INTO v_movement_ids
  FROM public.purchase_receipt_lines
  WHERE receipt_id = p_receipt_id;

  FOR v_stock IN
    SELECT product_id,
           sum(quantity)::integer AS quantity,
           sum(quantity * unit_cost)::numeric AS cost_value
    FROM public.purchase_receipt_lines
    WHERE receipt_id = p_receipt_id
    GROUP BY product_id
    ORDER BY product_id
  LOOP
    SELECT id, quantity, hpp
    INTO v_product
    FROM public.products
    WHERE id = v_stock.product_id
    FOR UPDATE;

    v_new_qty := v_product.quantity - v_stock.quantity;
    v_new_hpp := CASE
      WHEN v_new_qty <= 0 THEN 0
      ELSE greatest(
        ((v_product.quantity * v_product.hpp) - v_stock.cost_value)
        / v_new_qty,
        0
      )
    END;

    UPDATE public.products
    SET quantity = v_new_qty,
        hpp = v_new_hpp,
        updated_at = now()
    WHERE id = v_stock.product_id;
  END LOOP;

  UPDATE public.purchase_order_lines pol
  SET received_qty = pol.received_qty - receipt_totals.quantity
  FROM (
    SELECT po_line_id, sum(quantity)::integer AS quantity
    FROM public.purchase_receipt_lines
    WHERE receipt_id = p_receipt_id
    GROUP BY po_line_id
  ) receipt_totals
  WHERE pol.id = receipt_totals.po_line_id;

  IF v_receipt.source_activity_log_id IS NOT NULL THEN
    DELETE FROM public.activity_logs
    WHERE id = v_receipt.source_activity_log_id;
  END IF;

  DELETE FROM public.purchase_receipts
  WHERE id = p_receipt_id;

  DELETE FROM public.stock_movements
  WHERE id = ANY(COALESCE(v_movement_ids, ARRAY[]::uuid[]));

  SELECT CASE
    WHEN bool_and(received_qty >= ordered_qty)
      THEN 'completed'::public.po_status
    WHEN bool_or(received_qty > 0)
      THEN 'receiving'::public.po_status
    ELSE 'approved'::public.po_status
  END
  INTO v_new_status
  FROM public.purchase_order_lines
  WHERE po_id = v_receipt.po_id;

  UPDATE public.purchase_orders
  SET status = CASE
        WHEN status = 'cancelled' THEN status
        ELSE v_new_status
      END,
      updated_at = now()
  WHERE id = v_receipt.po_id;

  PERFORM private.write_minimal_delete_audit(
    v_uid,
    'purchase_receipt',
    v_receipt.receipt_number,
    'purchase_receipt',
    p_receipt_id
  );

  RETURN private.deleted_result(true, v_receipt.receipt_number);
END;
$$;

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
  v_resolved_size numeric;
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
    v_existing_product_id := NULL;
    v_resolved_size := NULL;

    IF v_product_id IS NULL THEN
      IF NULLIF(btrim(COALESCE(v_line.new_sku, '')), '') IS NULL
         OR NULLIF(btrim(COALESCE(v_line.new_size_label, '')), '') IS NULL THEN
        RAISE EXCEPTION
          'Item baru PO Pembelian belum lengkap (size/SKU)';
      END IF;

      -- Preserve free-text identity first. This restores receiving for custom
      -- Pre Order sizes such as "42 2/3" whose numeric value was left null.
      SELECT p.id
      INTO v_existing_product_id
      FROM public.products p
      WHERE p.sku = btrim(v_line.new_sku)
        AND lower(btrim(replace(p.size_label, ',', '.'))) =
            lower(btrim(replace(v_line.new_size_label, ',', '.')))
      ORDER BY p.id
      LIMIT 1
      FOR UPDATE;

      v_resolved_size := COALESCE(
        v_line.new_size,
        NULLIF(public.parse_size_to_numeric(v_line.new_size_label), 0)
      );

      -- Numeric identity remains the canonical fallback, so equivalent labels
      -- such as "42 2/3" and "42.67" still converge to one variant.
      IF v_existing_product_id IS NULL AND v_resolved_size IS NOT NULL THEN
        SELECT p.id
        INTO v_existing_product_id
        FROM public.products p
        WHERE p.sku = btrim(v_line.new_sku)
          AND round(p.size, 2) = round(v_resolved_size, 2)
        ORDER BY p.id
        LIMIT 1
        FOR UPDATE;
      END IF;

      IF v_existing_product_id IS NULL THEN
        IF NULLIF(btrim(COALESCE(v_line.new_brand, '')), '') IS NULL
           OR NULLIF(btrim(COALESCE(v_line.new_model, '')), '') IS NULL
           OR v_resolved_size IS NULL THEN
          RAISE EXCEPTION
            'Item baru PO Pembelian belum lengkap (brand/model/size/SKU)';
        END IF;

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
          v_resolved_size,
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
      SET product_id = v_product_id,
          new_size = COALESCE(new_size, v_resolved_size)
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

COMMENT ON FUNCTION private.validate_active_stock_reservation() IS
  'Serializes active reservation writes by product and rejects allocations above physical stock.';
COMMENT ON FUNCTION public.delete_purchase_invoice_atomic(uuid) IS
  'Hard-deletes a manual purchase invoice only when unreserved stock can absorb its inbound reversal.';
COMMENT ON FUNCTION public.delete_purchase_receipt_atomic(uuid) IS
  'Hard-deletes a purchase receipt only when unreserved stock can absorb its inbound reversal.';
COMMENT ON FUNCTION public.receive_purchase_order_atomic(jsonb) IS
  'Atomically receives a PO and resolves free-text SKU/size variants before requiring numeric size data.';
