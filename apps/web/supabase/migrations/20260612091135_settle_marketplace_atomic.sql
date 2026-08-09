CREATE OR REPLACE FUNCTION public.settle_marketplace_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_phase   text := p_payload->>'phase';
  v_bank_id uuid := NULLIF(p_payload->>'bank_account_id','')::uuid;
  v_date    date := COALESCE((p_payload->>'settled_date')::date, current_date);
  v_ref     text := NULLIF(p_payload->>'settlement_ref','');
  v_matched int := 0;
  v_skipped int := 0;
  v_unmatched jsonb := '[]'::jsonb;
  v_item  jsonb;
  v_oid   text;
  v_net   numeric;
  v_fee   numeric;
  v_inv   record;
  v_delta numeric;
  v_lines jsonb;
  v_bank      record;
  v_bank_code text;
  v_newbal    numeric;
BEGIN
  IF NOT public.has_any_role(ARRAY['owner','finance']::user_role[]) THEN
    RAISE EXCEPTION 'Tidak berhak rekonsiliasi settlement';
  END IF;
  IF v_phase NOT IN ('pending','released') THEN
    RAISE EXCEPTION 'Phase settlement tidak valid';
  END IF;

  IF v_phase = 'released' THEN
    SELECT id, name, current_balance, type, is_active INTO v_bank
    FROM bank_accounts WHERE id = v_bank_id;
    IF v_bank.id IS NULL OR v_bank.is_active = false THEN
      RAISE EXCEPTION 'Akun bank tujuan pencairan tidak valid';
    END IF;
    v_bank_code := CASE v_bank.type::text
                     WHEN 'cash' THEN '1.1.01'
                     WHEN 'marketplace_balance' THEN '1.1.03'
                     ELSE '1.1.02'
                   END;
    v_newbal := v_bank.current_balance;
  END IF;

  FOR v_item IN SELECT jsonb_array_elements(p_payload->'items') LOOP
    v_oid := v_item->>'order_id';
    v_net := COALESCE((v_item->>'net')::numeric, 0);
    v_fee := COALESCE((v_item->>'fee')::numeric, 0);

    SELECT id, total, settlement_status INTO v_inv
    FROM sales_invoices
    WHERE marketplace_order_id = v_oid
    ORDER BY created_at
    LIMIT 1;

    IF v_inv.id IS NULL THEN
      v_unmatched := v_unmatched || to_jsonb(v_oid);
      CONTINUE;
    END IF;

    IF v_phase = 'pending' THEN
      IF v_inv.settlement_status <> 'none' THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      UPDATE sales_invoices
      SET settlement_status = 'pending',
          settlement_fee_actual = v_fee,
          settlement_net = v_net
      WHERE id = v_inv.id;

      v_delta := v_inv.total - v_net;
      v_lines := jsonb_build_array(
        jsonb_build_object('code','1.1.03','debit',v_net,'credit',0,'description','Saldo marketplace tertahan'),
        jsonb_build_object('code','1.1.04','debit',0,'credit',v_inv.total,'description','Pelunasan piutang (settlement)')
      );
      IF v_delta > 0 THEN
        v_lines := v_lines || jsonb_build_object('code','6.1','debit',v_delta,'credit',0,'description','Biaya marketplace aktual');
      ELSIF v_delta < 0 THEN
        v_lines := v_lines || jsonb_build_object('code','6.1','debit',0,'credit',-v_delta,'description','Koreksi biaya marketplace');
      END IF;
      PERFORM public.app_post_journal(
        v_date, 'Settlement pending ' || v_oid,
        'other'::journal_source, v_inv.id, v_uid, v_lines
      );
      v_matched := v_matched + 1;

    ELSE
      IF v_inv.settlement_status = 'released' THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
      IF v_inv.settlement_status <> 'pending' THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      UPDATE sales_invoices
      SET settlement_status = 'released',
          settled_at = now(),
          settlement_ref = v_ref,
          status = 'paid',
          paid_amount = total
      WHERE id = v_inv.id;

      v_newbal := v_newbal + v_net;
      UPDATE bank_accounts SET current_balance = v_newbal WHERE id = v_bank_id;
      INSERT INTO bank_transactions (
        bank_account_id, transaction_date, type, amount, balance_after,
        reference_no, description, related_entity_type, related_entity_id, created_by
      )
      VALUES (
        v_bank_id, v_date, 'credit', v_net, v_newbal,
        COALESCE(v_ref, v_oid), 'Pencairan settlement ' || v_oid,
        'marketplace_settlement', v_inv.id, v_uid
      );

      v_lines := jsonb_build_array(
        jsonb_build_object('code',v_bank_code,'debit',v_net,'credit',0,'description','Pencairan settlement marketplace'),
        jsonb_build_object('code','1.1.03','debit',0,'credit',v_net,'description','Saldo marketplace cair')
      );
      PERFORM public.app_post_journal(
        v_date, 'Settlement cair ' || v_oid,
        'other'::journal_source, v_inv.id, v_uid, v_lines
      );
      v_matched := v_matched + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('matched', v_matched, 'skipped', v_skipped, 'unmatched', v_unmatched);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_marketplace_atomic(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_marketplace_atomic(jsonb) TO authenticated;

COMMENT ON FUNCTION public.settle_marketplace_atomic(jsonb) IS
  'Atomic 2-phase marketplace settlement: pending (AR -> Saldo Marketplace + actual fee) and released (Saldo Marketplace -> bank + mark paid). Idempotent; never touches stock.';
