CREATE OR REPLACE FUNCTION public.import_marketplace_order_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_channel       customer_channel := (p_payload->>'channel')::customer_channel;
  v_channel_txt   text := (p_payload->>'channel');
  v_invoice_date  date := (p_payload->>'invoice_date')::date;
  v_customer_name text := COALESCE(NULLIF(btrim(p_payload->>'customer_name'), ''), 'Marketplace Customer');
  v_order_id      text := NULLIF(btrim(p_payload->>'marketplace_order_id'), '');
  v_discount      numeric := COALESCE((p_payload->>'discount')::numeric, 0);
  v_shipping      numeric := COALESCE((p_payload->>'shipping_fee')::numeric, 0);
  v_admin_fee     numeric := COALESCE((p_payload->>'admin_fee')::numeric, 0);
  v_notes         text := COALESCE(NULLIF(p_payload->>'notes',''), 'Import marketplace ' || upper(v_channel_txt));

  v_distinct_ids  int;
  v_found_ids     int;
  v_subtotal      numeric := 0;
  v_cogs          numeric := 0;
  v_total         numeric;
  v_revenue_code  text;
  v_invoice_number text;
  v_invoice_id    uuid;
  v_updated       int;
  r               record;
  v_lines         jsonb;
BEGIN
  IF NOT public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[]) THEN
    RAISE EXCEPTION 'Tidak berhak import marketplace';
  END IF;

  IF v_order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM sales_invoices WHERE marketplace_order_id = v_order_id
  ) THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  DROP TABLE IF EXISTS pg_temp._mp_cart;
  CREATE TEMP TABLE _mp_cart ON COMMIT DROP AS
  WITH raw AS (
    SELECT (l->>'product_id')::uuid AS pid,
           (l->>'qty')::int           AS qty,
           (l->>'unit_price')::numeric AS price,
           ord
    FROM jsonb_array_elements(p_payload->'lines') WITH ORDINALITY AS t(l, ord)
  ),
  agg AS (
    SELECT pid, sum(qty)::int AS qty, (array_agg(price ORDER BY ord DESC))[1] AS price
    FROM raw GROUP BY pid
  )
  SELECT a.pid, a.qty, a.price,
         p.brand, p.model, p.color, p.size, p.sku, p.hpp, p.is_active
  FROM agg a JOIN products p ON p.id = a.pid;

  SELECT count(DISTINCT (l->>'product_id')) INTO v_distinct_ids
  FROM jsonb_array_elements(p_payload->'lines') l;
  SELECT count(*) INTO v_found_ids FROM _mp_cart;
  IF v_found_ids <> v_distinct_ids THEN
    RAISE EXCEPTION 'Beberapa produk tidak ditemukan saat import';
  END IF;

  SELECT COALESCE(sum(qty * price), 0), COALESCE(sum(hpp * qty), 0)
  INTO v_subtotal, v_cogs FROM _mp_cart;
  v_total := v_subtotal - v_discount + v_shipping - v_admin_fee;

  v_revenue_code := CASE v_channel_txt
                      WHEN 'shopee'    THEN '4.1.02'
                      WHEN 'tiktok'    THEN '4.1.03'
                      WHEN 'tokopedia' THEN '4.1.04'
                      ELSE '4.1.01'
                    END;

  v_invoice_number := public.generate_sales_invoice_number();
  INSERT INTO sales_invoices (
    invoice_number, customer_name, channel, invoice_date, due_date,
    subtotal, discount, shipping, marketplace_fee, tax, total, paid_amount,
    status, marketplace_order_id, notes, created_by
  )
  VALUES (
    v_invoice_number, v_customer_name, v_channel, v_invoice_date, NULL,
    v_subtotal, v_discount, v_shipping, v_admin_fee, 0, v_total, 0,
    'issued', v_order_id, v_notes, v_uid
  )
  RETURNING id INTO v_invoice_id;

  FOR r IN SELECT * FROM _mp_cart LOOP
    IF r.is_active = false THEN
      RAISE EXCEPTION 'Produk % sudah tidak aktif', r.sku;
    END IF;

    INSERT INTO sales_invoice_lines (
      invoice_id, product_id, product_label, qty, unit_price, unit_cost, subtotal, notes
    )
    VALUES (
      v_invoice_id, r.pid,
      r.brand || ' ' || r.model || ' ' || COALESCE(r.color,'') || ' • Size ' || COALESCE(r.size::text,'') || ' • ' || r.sku,
      r.qty, r.price, r.hpp, r.qty * r.price, NULL
    );

    UPDATE products SET quantity = quantity - r.qty, updated_at = now()
    WHERE id = r.pid AND quantity >= r.qty;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'Stok % % size % tidak cukup', r.brand, r.model, r.size;
    END IF;

    INSERT INTO stock_movements (
      product_id, type, quantity, unit_cost, reference_type, reference_id, notes, performed_by
    )
    VALUES (
      r.pid, 'outbound', r.qty, r.hpp, 'sales_invoice_line', v_invoice_id,
      'Import marketplace ' || upper(v_channel_txt), v_uid
    );
  END LOOP;

  v_lines := jsonb_build_array(
    jsonb_build_object('code','1.1.04','debit',v_total,'credit',0,'description','Piutang penjualan')
  );
  IF v_admin_fee > 0 THEN
    v_lines := v_lines || jsonb_build_object('code','6.1','debit',v_admin_fee,'credit',0,'description','Beban administrasi marketplace');
  END IF;
  IF v_discount > 0 THEN
    v_lines := v_lines || jsonb_build_object('code','6.2','debit',v_discount,'credit',0,'description','Beban diskon & promosi');
  END IF;
  v_lines := v_lines || jsonb_build_object('code',v_revenue_code,'debit',0,'credit',v_subtotal + v_shipping,'description','Pendapatan penjualan');
  IF v_cogs > 0 THEN
    v_lines := v_lines
      || jsonb_build_object('code','5.1','debit',v_cogs,'credit',0,'description','HPP barang terjual')
      || jsonb_build_object('code','1.1.05','debit',0,'credit',v_cogs,'description','Persediaan keluar');
  END IF;

  PERFORM public.app_post_journal(
    v_invoice_date, 'Invoice penjualan ' || v_invoice_number,
    'sales_invoice'::journal_source, v_invoice_id, v_uid, v_lines
  );

  RETURN jsonb_build_object(
    'skipped', false,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'total', v_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_marketplace_order_atomic(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_marketplace_order_atomic(jsonb) TO authenticated;

COMMENT ON FUNCTION public.import_marketplace_order_atomic(jsonb) IS
  'Atomic marketplace order import: dup-guard + invoice + lines + guarded stock decrement + movements + sales journal in one transaction.';

CREATE OR REPLACE FUNCTION public.settle_marketplace_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_channel   customer_channel := (p_payload->>'channel')::customer_channel;
  v_channel_txt text := p_payload->>'channel';
  v_bank_id   uuid := NULLIF(p_payload->>'bank_account_id','')::uuid;
  v_date      date := COALESCE((p_payload->>'settled_date')::date, current_date);
  v_ref       text := NULLIF(p_payload->>'settlement_ref','');

  v_matched   int := 0;
  v_skipped   int := 0;
  v_unmatched jsonb := '[]'::jsonb;

  v_item      jsonb;
  v_oid       text;
  v_net       numeric;
  v_fee       numeric;
  v_inv       record;

  v_bank       record;
  v_bank_code  text;
  v_newbal     numeric;
  v_payment_id uuid;
  v_paynum     text;
  v_total_net  numeric := 0;
  v_total_ar   numeric := 0;
  v_delta      numeric := 0;
  v_lines      jsonb;
BEGIN
  IF NOT public.has_any_role(ARRAY['owner','finance']::user_role[]) THEN
    RAISE EXCEPTION 'Tidak berhak rekonsiliasi settlement';
  END IF;

  SELECT id, name, current_balance, type, is_active INTO v_bank
  FROM bank_accounts WHERE id = v_bank_id;
  IF v_bank.id IS NULL OR v_bank.is_active = false THEN
    RAISE EXCEPTION 'Akun bank tujuan pencairan tidak valid';
  END IF;
  IF v_bank.type::text = 'marketplace_balance' THEN
    RAISE EXCEPTION 'Settlement cair harus masuk ke akun kas/bank, bukan Saldo Marketplace';
  END IF;
  v_bank_code := CASE v_bank.type::text
                   WHEN 'cash' THEN '1.1.01'
                   ELSE '1.1.02'
                 END;
  v_newbal := v_bank.current_balance;

  DROP TABLE IF EXISTS pg_temp._settlement_apply;
  CREATE TEMP TABLE _settlement_apply (
    order_id text,
    invoice_id uuid,
    invoice_total numeric,
    net numeric,
    fee numeric
  ) ON COMMIT DROP;

  FOR v_item IN SELECT jsonb_array_elements(p_payload->'items') LOOP
    v_oid := v_item->>'order_id';
    v_net := COALESCE((v_item->>'net')::numeric, 0);
    v_fee := COALESCE((v_item->>'fee')::numeric, 0);

    SELECT id, total, paid_amount, status, settlement_status INTO v_inv
    FROM sales_invoices
    WHERE marketplace_order_id = v_oid
      AND channel = v_channel
    ORDER BY created_at
    LIMIT 1;

    IF v_inv.id IS NULL THEN
      v_unmatched := v_unmatched || to_jsonb(v_oid);
      CONTINUE;
    END IF;

    IF v_inv.settlement_status = 'released' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_inv.settlement_status = 'pending' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_inv.status <> 'issued' OR COALESCE(v_inv.paid_amount, 0) > 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_net <= 0 OR v_inv.total <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO _settlement_apply(order_id, invoice_id, invoice_total, net, fee)
    VALUES (v_oid, v_inv.id, v_inv.total, v_net, v_fee);
  END LOOP;

  SELECT count(*), COALESCE(sum(net), 0), COALESCE(sum(invoice_total), 0)
  INTO v_matched, v_total_net, v_total_ar
  FROM _settlement_apply;

  IF v_matched > 0 THEN
    v_paynum := public.generate_customer_payment_number();

    INSERT INTO customer_payments (
      payment_number, customer_id, customer_name, payment_date, amount,
      payment_method, bank_account_id, reference_no, notes, attachment_url, created_by
    )
    VALUES (
      v_paynum, NULL, 'Marketplace Settlement ' || upper(v_channel_txt), v_date, v_total_net,
      'marketplace'::payment_method, v_bank_id, COALESCE(v_ref, v_paynum),
      'Import settlement ' || upper(v_channel_txt), NULL, v_uid
    )
    RETURNING id INTO v_payment_id;

    INSERT INTO customer_payment_allocations (payment_id, invoice_id, amount)
    SELECT v_payment_id, invoice_id, invoice_total FROM _settlement_apply;

    UPDATE sales_invoices si
    SET settlement_status = 'released',
        settled_at = now(),
        settlement_ref = v_ref,
        settlement_fee_actual = s.fee,
        settlement_net = s.net,
        status = 'paid',
        paid_amount = si.total
    FROM _settlement_apply s
    WHERE si.id = s.invoice_id;

    v_newbal := v_newbal + v_total_net;
    UPDATE bank_accounts SET current_balance = v_newbal WHERE id = v_bank_id;

    INSERT INTO bank_transactions (
      bank_account_id, transaction_date, type, amount, balance_after,
      reference_no, description, related_entity_type, related_entity_id, created_by
    )
    VALUES (
      v_bank_id, v_date, 'credit', v_total_net, v_newbal,
      COALESCE(v_ref, v_paynum), 'Pencairan settlement ' || upper(v_channel_txt),
      'customer_payment', v_payment_id, v_uid
    );

    v_delta := v_total_ar - v_total_net;
    v_lines := jsonb_build_array(
      jsonb_build_object('code',v_bank_code,'debit',v_total_net,'credit',0,'description','Kas/Bank masuk settlement marketplace')
    );
    IF v_delta > 0 THEN
      v_lines := v_lines || jsonb_build_object('code','6.1','debit',v_delta,'credit',0,'description','Biaya marketplace aktual');
    ELSIF v_delta < 0 THEN
      v_lines := v_lines || jsonb_build_object('code','6.1','debit',0,'credit',-v_delta,'description','Koreksi biaya marketplace');
    END IF;
    v_lines := v_lines || jsonb_build_object('code','1.1.04','debit',0,'credit',v_total_ar,'description','Pelunasan piutang marketplace');

    PERFORM public.app_post_journal(
      v_date, 'Penerimaan settlement ' || v_paynum,
      'customer_payment'::journal_source, v_payment_id, v_uid, v_lines
    );
  END IF;

  RETURN jsonb_build_object(
    'matched', v_matched,
    'skipped', v_skipped,
    'unmatched', v_unmatched
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_marketplace_atomic(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_marketplace_atomic(jsonb) TO authenticated;

COMMENT ON FUNCTION public.settle_marketplace_atomic(jsonb) IS
  'Atomic single-step marketplace settlement: creates customer payment + allocations, marks invoices paid, records bank receipt, and posts settlement journal.';
