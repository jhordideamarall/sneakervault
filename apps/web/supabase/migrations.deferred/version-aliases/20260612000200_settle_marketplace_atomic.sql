-- Atomic marketplace settlement import (single step).
--
-- Order import creates unpaid sales invoices. Settlement import happens once
-- after marketplace funds are released: it creates one customer payment batch,
-- allocates it to matched invoices, marks those invoices paid, records the bank
-- receipt, and posts the settlement journal. It never touches stock.
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
      -- Legacy guard: older two-phase uploads already moved AR to marketplace
      -- balance. Do not apply again because that would double-post AR.
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

    -- Allocation amount follows the invoice value being settled. Payment amount
    -- follows actual cash received (net); the difference is booked as marketplace
    -- fee/correction in the journal below.
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
