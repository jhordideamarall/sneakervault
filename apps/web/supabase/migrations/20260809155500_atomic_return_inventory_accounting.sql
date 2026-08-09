-- Process refund/exchange inventory and its HPP journal in one transaction.
-- Cash/customer refund remains a separate finance operation because its amount
-- and destination account require an explicit operator decision.

CREATE OR REPLACE FUNCTION public.process_return_atomic(
  p_return_id uuid,
  p_new_product_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
-- SECURITY DEFINER is required because journal posting and stock movement
-- helpers are intentionally not executable directly by authenticated users.
-- The function has an explicit active-role gate and a locked search_path.
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_return public.returns%ROWTYPE;
  v_original public.products%ROWTYPE;
  v_replacement public.products%ROWTYPE;
  v_original_unit_hpp numeric := 0;
  v_journal_id uuid;
BEGIN
  IF NOT public.has_any_role(
    ARRAY['owner','admin_gudang','admin_online']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak memproses retur';
  END IF;

  SELECT r.*
  INTO v_return
  FROM public.returns r
  WHERE r.id = p_return_id
  FOR UPDATE;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Retur tidak ditemukan';
  END IF;
  IF v_return.status = 'processed'::public.return_status THEN
    RETURN jsonb_build_object(
      'return_id', v_return.id,
      'status', v_return.status,
      'already_processed', true
    );
  END IF;
  IF v_return.status <> 'verified'::public.return_status THEN
    RAISE EXCEPTION 'Retur belum diverifikasi';
  END IF;

  SELECT p.*
  INTO v_original
  FROM public.products p
  WHERE p.id = v_return.original_product_id
  FOR UPDATE;

  IF v_original.id IS NULL THEN
    RAISE EXCEPTION 'Produk awal retur tidak ditemukan';
  END IF;

  SELECT COALESCE(pi.unit_hpp, v_original.hpp, 0)
  INTO v_original_unit_hpp
  FROM public.packing_items pi
  WHERE pi.id = v_return.packing_item_id;

  IF v_return.type = 'exchange_size'::public.return_type THEN
    IF p_new_product_id IS NULL THEN
      RAISE EXCEPTION 'Produk pengganti wajib dipilih';
    END IF;
    IF p_new_product_id = v_original.id THEN
      RAISE EXCEPTION 'Produk pengganti harus berbeda dari barang awal';
    END IF;

    SELECT p.*
    INTO v_replacement
    FROM public.products p
    WHERE p.id = p_new_product_id
    FOR UPDATE;

    IF v_replacement.id IS NULL OR v_replacement.is_active = false THEN
      RAISE EXCEPTION 'Produk pengganti tidak ditemukan atau nonaktif';
    END IF;
    IF lower(v_replacement.brand) <> lower(v_original.brand)
       OR lower(v_replacement.model) <> lower(v_original.model) THEN
      RAISE EXCEPTION 'Produk pengganti harus brand dan model yang sama';
    END IF;

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

    PERFORM public.create_stock_movement(
      v_original.id, 'return_in'::public.stock_movement_type, 1,
      v_original_unit_hpp, 'return', v_return.id,
      'Barang awal masuk dari tukar size'
    );
    PERFORM public.create_stock_movement(
      v_replacement.id, 'return_out'::public.stock_movement_type, 1,
      COALESCE(v_replacement.hpp, 0), 'return', v_return.id,
      'Barang pengganti keluar untuk tukar size'
    );

    IF v_original_unit_hpp > 0 OR COALESCE(v_replacement.hpp, 0) > 0 THEN
      v_journal_id := public.app_post_journal(
        current_date,
        'Penyesuaian HPP tukar size retur',
        'stock_adjustment'::public.journal_source,
        v_return.id,
        auth.uid(),
        jsonb_build_array(
          jsonb_build_object(
            'code','1.1.05','debit',v_original_unit_hpp,'credit',0,
            'description','Barang awal retur kembali ke persediaan'
          ),
          jsonb_build_object(
            'code','5.1','debit',0,'credit',v_original_unit_hpp,
            'description','Pembalik HPP barang awal retur'
          ),
          jsonb_build_object(
            'code','5.1','debit',COALESCE(v_replacement.hpp, 0),'credit',0,
            'description','HPP barang pengganti tukar size'
          ),
          jsonb_build_object(
            'code','1.1.05','debit',0,'credit',COALESCE(v_replacement.hpp, 0),
            'description','Persediaan barang pengganti keluar'
          )
        )
      );
    END IF;

    UPDATE public.returns
    SET status = 'processed'::public.return_status,
        processed_by = auth.uid(),
        processed_at = now(),
        new_product_id = v_replacement.id,
        new_size = v_replacement.size
    WHERE id = v_return.id;
  ELSIF v_return.type = 'refund'::public.return_type THEN
    UPDATE public.products
    SET quantity = quantity + 1,
        updated_at = now()
    WHERE id = v_original.id;

    PERFORM public.create_stock_movement(
      v_original.id, 'return_in'::public.stock_movement_type, 1,
      v_original_unit_hpp, 'return', v_return.id,
      'Barang refund kembali ke persediaan; pengembalian uang dicatat terpisah'
    );

    IF v_original_unit_hpp > 0 THEN
      v_journal_id := public.app_post_journal(
        current_date,
        'Pembalik HPP barang refund',
        'stock_adjustment'::public.journal_source,
        v_return.id,
        auth.uid(),
        jsonb_build_array(
          jsonb_build_object(
            'code','1.1.05','debit',v_original_unit_hpp,'credit',0,
            'description','Barang refund kembali ke persediaan'
          ),
          jsonb_build_object(
            'code','5.1','debit',0,'credit',v_original_unit_hpp,
            'description','Pembalik HPP barang refund'
          )
        )
      );
    END IF;

    UPDATE public.returns
    SET status = 'processed'::public.return_status,
        processed_by = auth.uid(),
        processed_at = now(),
        new_product_id = NULL,
        new_size = NULL
    WHERE id = v_return.id;
  ELSE
    RAISE EXCEPTION 'Tipe retur tidak didukung';
  END IF;

  RETURN jsonb_build_object(
    'return_id', v_return.id,
    'type', v_return.type,
    'original_product_id', v_original.id,
    'new_product_id', v_replacement.id,
    'journal_id', v_journal_id,
    'already_processed', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.process_return_atomic(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_return_atomic(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_return_atomic(uuid, uuid) TO service_role;
