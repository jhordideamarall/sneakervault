-- Seed a 90-day demo story for SneakerVault.
--
-- Prerequisite:
--   1. Run scripts/seed-demo-users.mjs with service role env.
--   2. Run scripts/reset-demo-db.sql if you want a clean demo.
--
-- Scope:
--   - 5 active staff profiles with notification preferences
--   - 8 suppliers, 20 customers, 40 product SKUs
--   - purchase, receive, vendor payment, sales, packing, customer payment
--   - balanced journal entries, bank mutations, returns
--   - activity_logs and internal_messages for system notifications + staff chat

begin;

do $$
declare
  v_owner uuid;
  v_finance uuid;
  v_gudang uuid;
  v_online uuid;
  v_shop uuid;
  v_system_sender uuid;

  v_bca uuid;
  v_mandiri uuid;
  v_cash uuid;
  v_bca_balance numeric := 325000000;
  v_mandiri_balance numeric := 94000000;
  v_cash_balance numeric := 18500000;

  v_inventory uuid;
  v_ap uuid;
  v_ar uuid;
  v_bank uuid;
  v_cash_coa uuid;
  v_sales_wa uuid;
  v_sales_shopee uuid;
  v_sales_tiktok uuid;
  v_cogs uuid;
  v_market_fee uuid;
  v_discount uuid;

  v_start timestamptz := date_trunc('day', now()) - interval '90 days';
  v_event_at timestamptz;
  v_supplier_id uuid;
  v_customer_id uuid;
  v_product_id uuid;
  v_new_product_id uuid;
  v_po_id uuid;
  v_po_line_id uuid;
  v_purchase_invoice_id uuid;
  v_vendor_payment_id uuid;
  v_sales_invoice_id uuid;
  v_sales_line_id uuid;
  v_customer_payment_id uuid;
  v_session_id uuid;
  v_item_id uuid;
  v_return_id uuid;
  v_journal_id uuid;

  v_qty integer;
  v_unit_cost numeric;
  v_sell_price numeric;
  v_subtotal numeric;
  v_total numeric;
  v_fee numeric;
  v_discount_amount numeric;
  v_payment numeric;
  v_channel text;
  v_original_size numeric;
  v_revenue_account uuid;
  v_bank_account_id uuid;
  v_balance numeric;
  v_order_no text;
  v_product_label text;
  v_idx integer;
  v_line integer;
  v_has_phase_tables boolean;
begin
  select id into v_owner from public.profiles where is_active and roles @> array['owner'::user_role] limit 1;
  select id into v_finance from public.profiles where is_active and roles @> array['finance'::user_role] limit 1;
  select id into v_gudang from public.profiles where is_active and roles @> array['admin_gudang'::user_role] limit 1;
  select id into v_online from public.profiles where is_active and roles @> array['admin_online'::user_role] limit 1;
  select id into v_shop from public.profiles where is_active and roles @> array['shopkeeper'::user_role] limit 1;

  if v_owner is null or v_finance is null or v_gudang is null or v_online is null or v_shop is null then
    raise exception 'Missing demo users. Run scripts/seed-demo-users.mjs first, then rerun this SQL.';
  end if;
  v_system_sender := v_owner;

  v_has_phase_tables :=
    to_regclass('public.purchase_orders') is not null
    and to_regclass('public.sales_invoices') is not null
    and to_regclass('public.bank_accounts') is not null
    and to_regclass('public.journal_entries') is not null;

  if not v_has_phase_tables then
    raise exception 'Phase 2-4 accounting tables are missing. Apply migrations before demo seeding.';
  end if;

  insert into public.notification_preferences (user_id, muted_event_types, digest_mode)
  values
    (v_owner, '{}', false),
    (v_finance, '{}', false),
    (v_gudang, '{}', false),
    (v_online, '{}', false),
    (v_shop, '{}', false)
  on conflict (user_id) do update
  set muted_event_types = excluded.muted_event_types,
      digest_mode = excluded.digest_mode,
      updated_at = now();

  select id into v_inventory from public.chart_of_accounts where code = '1.1.05';
  select id into v_ap from public.chart_of_accounts where code = '2.1.01';
  select id into v_ar from public.chart_of_accounts where code = '1.1.04';
  select id into v_bank from public.chart_of_accounts where code = '1.1.02';
  select id into v_cash_coa from public.chart_of_accounts where code = '1.1.01';
  select id into v_sales_wa from public.chart_of_accounts where code = '4.1.01';
  select id into v_sales_shopee from public.chart_of_accounts where code = '4.1.02';
  select id into v_sales_tiktok from public.chart_of_accounts where code = '4.1.03';
  select id into v_cogs from public.chart_of_accounts where code = '5.1';
  select id into v_market_fee from public.chart_of_accounts where code = '6.1';
  select id into v_discount from public.chart_of_accounts where code = '6.2';

  if v_inventory is null or v_ap is null or v_ar is null or v_bank is null or v_cash_coa is null
     or v_sales_wa is null or v_sales_shopee is null or v_sales_tiktok is null
     or v_cogs is null or v_market_fee is null or v_discount is null then
    raise exception 'Missing chart_of_accounts seed rows. Apply phase 4 CoA seed before demo seeding.';
  end if;

  insert into public.suppliers (name, contact_person, phone, email, address, notes, created_at)
  values
    ('Jakarta Sneaker Supply', 'Kevin', '0812-1100-9001', 'order@jakartasneakersupply.id', 'Jakarta Barat', 'Vendor utama Nike dan Adidas', v_start),
    ('Bandung Retro Kicks', 'Dimas', '0812-1100-9002', 'hello@retro-kicks.id', 'Bandung', 'Spesialis seri retro dan basket', v_start),
    ('Surabaya Streetwear Hub', 'Maya', '0812-1100-9003', 'supply@streetwearhub.id', 'Surabaya', 'Restock cepat untuk marketplace', v_start),
    ('Tangerang Sport Outlet', 'Andre', '0812-1100-9004', 'sales@sportoutlet.id', 'Tangerang', 'Harga kompetitif untuk running shoes', v_start),
    ('Bekasi Authentic Store', 'Fajar', '0812-1100-9005', 'fajar@authenticstore.id', 'Bekasi', 'Cek authenticity lengkap', v_start),
    ('Semarang Footwear Co', 'Nadia', '0812-1100-9006', 'nadia@footwearco.id', 'Semarang', 'Size curve lengkap', v_start),
    ('Depok Sneaker Partner', 'Riko', '0812-1100-9007', 'riko@sneakerpartner.id', 'Depok', 'Supplier cadangan', v_start),
    ('Bogor Lifestyle Goods', 'Putri', '0812-1100-9008', 'putri@lifestylegoods.id', 'Bogor', 'Lifestyle dan casual', v_start);

  insert into public.customers (name, phone, email, address, channel, notes, created_at)
  select
    format('Customer Demo %s', lpad(i::text, 2, '0')),
    format('0813-22%s', lpad(i::text, 6, '0')),
    format('customer%s@sneakervault.demo', lpad(i::text, 2, '0')),
    format('Area Jabodetabek %s', i),
    ((array['wa', 'shopee', 'tiktok', 'offline', 'website'])[(i % 5) + 1])::public.customer_channel,
    'Customer historis demo 90 hari',
    v_start + (i || ' hours')::interval
  from generate_series(1, 20) i;

  insert into public.bank_accounts (
    name, type, bank_name, account_number, account_holder,
    opening_balance, current_balance, currency, is_default, is_active, notes, created_at
  )
  values
    ('BCA Operasional', 'bank'::public.bank_account_type, 'BCA', '1234567890', 'SneakerVault', v_bca_balance, v_bca_balance, 'IDR', true, true, 'Rekening utama transaksi demo', v_start),
    ('Mandiri Marketplace', 'bank'::public.bank_account_type, 'Mandiri', '8877665544', 'SneakerVault', v_mandiri_balance, v_mandiri_balance, 'IDR', false, true, 'Settlement marketplace', v_start),
    ('Kas Toko', 'cash'::public.bank_account_type, null, null, 'SneakerVault Store', v_cash_balance, v_cash_balance, 'IDR', false, true, 'Kas offline', v_start);

  select id into v_bca from public.bank_accounts where name = 'BCA Operasional';
  select id into v_mandiri from public.bank_accounts where name = 'Mandiri Marketplace';
  select id into v_cash from public.bank_accounts where name = 'Kas Toko';

  insert into public.products (
    brand, model, sku, size, color, barcode, quantity, hpp, sell_price,
    default_supplier_id, image_url, first_inbound_at, created_at
  )
  select
    model_data.brand,
    model_data.model,
    format('%s-%s-%s', upper(left(model_data.brand, 3)), regexp_replace(upper(model_data.model), '[^A-Z0-9]', '', 'g'), size_data.size),
    size_data.size::numeric,
    model_data.color,
    format('899%03s%02s', model_data.idx, size_data.size),
    0,
    0,
    model_data.sell_price,
    (select id from public.suppliers order by name offset (model_data.idx % 8) limit 1),
    model_data.image_url,
    null,
    v_start
  from (
    values
      (1, 'Nike', 'Air Jordan 1 Low Panda', 'Black White', 1899000, 'https://images.unsplash.com/photo-1556906781-9a412961c28c'),
      (2, 'Nike', 'Dunk Low Grey Fog', 'Grey White', 1799000, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff'),
      (3, 'Adidas', 'Samba OG White Black', 'White Black', 1699000, 'https://images.unsplash.com/photo-1560769629-975ec94e6a86'),
      (4, 'New Balance', '530 Silver Navy', 'Silver Navy', 1599000, 'https://images.unsplash.com/photo-1608231387042-66d1773070a5'),
      (5, 'Asics', 'Gel Kayano 14 Cream', 'Cream Silver', 2099000, 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519'),
      (6, 'Converse', 'Chuck 70 High Black', 'Black', 1099000, 'https://images.unsplash.com/photo-1494496195158-c3becb4f2475'),
      (7, 'Puma', 'Palermo Green', 'Green Gum', 1299000, 'https://images.unsplash.com/photo-1603808033192-082d6919d3e1'),
      (8, 'Vans', 'Old Skool Classic', 'Black White', 999000, 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77')
  ) as model_data(idx, brand, model, color, sell_price, image_url)
  cross join (values (39), (40), (41), (42), (43)) as size_data(size);

  insert into public.activity_logs (user_id, action, entity_type, new_data, created_at)
  values
    (v_finance, 'create', 'bank_account', jsonb_build_object('count', 3), v_start + interval '1 hour'),
    (v_owner, 'demo_seed_started', 'demo_dataset', jsonb_build_object('range_days', 90), v_start + interval '2 hours');

  -- Purchase cycle: 14 POs, each with 3 lines.
  for v_idx in 1..14 loop
    v_event_at := v_start + ((v_idx - 1) * interval '6 days') + interval '10 hours';
    select id into v_supplier_id from public.suppliers order by name offset ((v_idx - 1) % 8) limit 1;

    insert into public.purchase_orders (
      po_number, supplier_id, order_date, expected_date, subtotal, tax, shipping, total,
      status, notes, created_by, approved_by, approved_at, created_at
    )
    values (
      format('PO-DEMO-%s', lpad(v_idx::text, 3, '0')),
      v_supplier_id,
      v_event_at::date,
      (v_event_at + interval '3 days')::date,
      0, 0, 50000, 50000,
      'completed'::public.po_status,
      'Restock demo terjadwal 90 hari',
      v_finance,
      v_owner,
      v_event_at + interval '2 hours',
      v_event_at
    )
    returning id into v_po_id;

    v_subtotal := 0;
    for v_line in 1..3 loop
      select id, sell_price
      into v_product_id, v_sell_price
      from public.products
      order by sku
      offset (((v_idx - 1) * 3 + v_line - 1) % 40)
      limit 1;

      v_qty := 6 + ((v_idx + v_line) % 5);
      v_unit_cost := round((v_sell_price * (0.58 + (((v_idx + v_line) % 4) * 0.03)))::numeric, 0);
      v_subtotal := v_subtotal + (v_qty * v_unit_cost);

      insert into public.purchase_order_lines (
        po_id, product_id, ordered_qty, received_qty, unit_cost, subtotal, notes
      )
      values (v_po_id, v_product_id, v_qty, v_qty, v_unit_cost, v_qty * v_unit_cost, 'Full received')
      returning id into v_po_line_id;

      insert into public.purchase_batches (
        supplier_id, brand, model, product_id, quantity, unit_cost,
        authenticity_confirmed, notes, ordered_at, received_at, created_by, created_at
      )
      select
        v_supplier_id, brand, model, id, v_qty, v_unit_cost,
        true, format('Linked to %s', format('PO-DEMO-%s', lpad(v_idx::text, 3, '0'))),
        v_event_at, v_event_at + interval '3 days', v_gudang, v_event_at
      from public.products where id = v_product_id;

      insert into public.stock_movements (
        product_id, type, quantity, unit_cost, reference_type, reference_id, notes, performed_by, created_at
      )
      values (
        v_product_id, 'inbound', v_qty, v_unit_cost, 'purchase_order', v_po_id,
        'Penerimaan PO demo', v_gudang, v_event_at + interval '3 days'
      );

      update public.products
      set quantity = quantity + v_qty,
          hpp = v_unit_cost,
          first_inbound_at = coalesce(first_inbound_at, v_event_at + interval '3 days'),
          updated_at = v_event_at + interval '3 days'
      where id = v_product_id;

      insert into public.activity_logs (user_id, action, entity_type, entity_id, new_data, created_at)
      values
        (v_gudang, 'receive_stock', 'product', v_product_id, jsonb_build_object('quantity', v_qty, 'unit_cost', v_unit_cost, 'po_id', v_po_id), v_event_at + interval '3 days'),
        (v_system_sender, 'notification_sent', 'purchase_order', v_po_id, jsonb_build_object('event_type', 'inbound.batch_received', 'recipient', 'owner'), v_event_at + interval '3 days 5 minutes');
    end loop;

    v_total := v_subtotal + 50000;
    update public.purchase_orders
    set subtotal = v_subtotal, total = v_total
    where id = v_po_id;

    insert into public.purchase_invoices (
      invoice_number, supplier_id, po_id, invoice_date, due_date, subtotal, tax, total,
      paid_amount, status, notes, created_by, created_at
    )
    values (
      format('FP-DEMO-%s', lpad(v_idx::text, 3, '0')),
      v_supplier_id,
      v_po_id,
      (v_event_at + interval '3 days')::date,
      (v_event_at + interval '17 days')::date,
      v_subtotal,
      0,
      v_total,
      case when v_idx <= 11 then v_total else 0 end,
      (case when v_idx <= 11 then 'paid' else 'unpaid' end)::public.purchase_invoice_status,
      'Faktur vendor demo',
      v_finance,
      v_event_at + interval '3 days 2 hours'
    )
    returning id into v_purchase_invoice_id;

    insert into public.journal_entries (
      entry_number, entry_date, description, source_type, source_id,
      total_debit, total_credit, status, created_by, created_at
    )
    values (
      format('JRN-DEMO-PI-%s', lpad(v_idx::text, 3, '0')),
      (v_event_at + interval '3 days')::date,
      format('Faktur pembelian FP-DEMO-%s', lpad(v_idx::text, 3, '0')),
      'purchase_invoice',
      v_purchase_invoice_id,
      v_total,
      v_total,
      'posted',
      v_finance,
      v_event_at + interval '3 days 2 hours'
    )
    returning id into v_journal_id;

    insert into public.journal_lines (entry_id, account_id, debit, credit, description, line_order)
    values
      (v_journal_id, v_inventory, v_total, 0, 'Persediaan masuk', 1),
      (v_journal_id, v_ap, 0, v_total, 'Hutang vendor', 2);

    insert into public.activity_logs (user_id, action, entity_type, entity_id, new_data, created_at)
    values (v_finance, 'create_purchase_invoice', 'purchase_invoice', v_purchase_invoice_id, jsonb_build_object('total', v_total), v_event_at + interval '3 days 3 hours');

    if v_idx <= 11 then
      v_bca_balance := v_bca_balance - v_total;

      insert into public.vendor_payments (
        payment_number, supplier_id, payment_date, amount, payment_method,
        bank_account_id, reference_no, notes, created_by, created_at
      )
      values (
        format('PV-DEMO-%s', lpad(v_idx::text, 3, '0')),
        v_supplier_id,
        (v_event_at + interval '7 days')::date,
        v_total,
        'bank_transfer'::public.payment_method,
        v_bca,
        format('BCA-OUT-%s', lpad(v_idx::text, 3, '0')),
        'Pelunasan vendor demo',
        v_finance,
        v_event_at + interval '7 days'
      )
      returning id into v_vendor_payment_id;

      insert into public.vendor_payment_allocations (payment_id, invoice_id, amount)
      values (v_vendor_payment_id, v_purchase_invoice_id, v_total);

      insert into public.bank_transactions (
        bank_account_id, transaction_date, type, amount, balance_after, reference_no,
        description, related_entity_type, related_entity_id, is_reconciled, created_by, created_at
      )
      values (
        v_bca, (v_event_at + interval '7 days')::date, 'debit'::public.bank_transaction_type, v_total, v_bca_balance,
        format('BCA-OUT-%s', lpad(v_idx::text, 3, '0')), 'Pembayaran vendor demo',
        'vendor_payment', v_vendor_payment_id, true, v_finance, v_event_at + interval '7 days'
      );

      insert into public.journal_entries (
        entry_number, entry_date, description, source_type, source_id,
        total_debit, total_credit, status, created_by, created_at
      )
      values (
        format('JRN-DEMO-PV-%s', lpad(v_idx::text, 3, '0')),
        (v_event_at + interval '7 days')::date,
        format('Pembayaran vendor PV-DEMO-%s', lpad(v_idx::text, 3, '0')),
        'vendor_payment',
        v_vendor_payment_id,
        v_total,
        v_total,
        'posted',
        v_finance,
        v_event_at + interval '7 days'
      )
      returning id into v_journal_id;

      insert into public.journal_lines (entry_id, account_id, debit, credit, description, line_order)
      values
        (v_journal_id, v_ap, v_total, 0, 'Pelunasan hutang vendor', 1),
        (v_journal_id, v_bank, 0, v_total, 'Bank keluar', 2);

      insert into public.activity_logs (user_id, action, entity_type, entity_id, new_data, created_at)
      values (v_finance, 'pay_vendor', 'vendor_payment', v_vendor_payment_id, jsonb_build_object('amount', v_total), v_event_at + interval '7 days 1 hour');
    end if;
  end loop;

  -- Sales cycle: 120 invoices with packing sessions, payments, journals, logs, and notifications.
  for v_idx in 1..120 loop
    v_event_at := v_start + interval '12 days' + (v_idx * interval '15 hours');
    select id, sell_price, hpp, format('%s %s size %s', brand, model, size)
    into v_product_id, v_sell_price, v_unit_cost, v_product_label
    from public.products
    where quantity > 0
    order by sku
    offset ((v_idx - 1) % greatest((select count(*) from public.products where quantity > 0), 1))
    limit 1;

    if v_product_id is null then
      exit;
    end if;

    select id into v_customer_id from public.customers order by name offset ((v_idx - 1) % 20) limit 1;
    v_channel := (array['wa', 'shopee', 'tiktok', 'offline', 'website'])[(v_idx % 5) + 1];
    v_fee := case when v_channel in ('shopee', 'tiktok') then round((v_sell_price * 0.045)::numeric, 0) else 0 end;
    v_discount_amount := case when v_idx % 9 = 0 then 50000 else 0 end;
    v_total := v_sell_price - v_fee - v_discount_amount;
    v_payment := case when v_idx % 7 = 0 then 0 when v_idx % 11 = 0 then round(v_total * 0.5, 0) else v_total end;
    v_order_no := format('%s-DEMO-%s', upper(v_channel), lpad(v_idx::text, 4, '0'));

    insert into public.sales_invoices (
      invoice_number, customer_id, customer_name, channel, invoice_date, due_date,
      subtotal, discount, shipping, marketplace_fee, tax, total, paid_amount,
      status, marketplace_order_id, notes, created_by, created_at
    )
    select
      format('INV-DEMO-%s', lpad(v_idx::text, 4, '0')),
      c.id,
      c.name,
      v_channel::public.customer_channel,
      v_event_at::date,
      (v_event_at + interval '7 days')::date,
      v_sell_price,
      v_discount_amount,
      0,
      v_fee,
      0,
      v_total,
      v_payment,
      (case when v_payment = v_total then 'paid' when v_payment > 0 then 'partial' else 'issued' end)::public.sales_invoice_status,
      case when v_channel in ('shopee', 'tiktok') then v_order_no else null end,
      'Invoice penjualan demo 90 hari',
      case when v_channel = 'offline' then v_shop else v_online end,
      v_event_at
    from public.customers c
    where c.id = v_customer_id
    returning id into v_sales_invoice_id;

    insert into public.sales_invoice_lines (
      invoice_id, product_id, product_label, qty, unit_price, unit_cost, subtotal, notes
    )
    values (v_sales_invoice_id, v_product_id, v_product_label, 1, v_sell_price, v_unit_cost, v_sell_price, 'Demo sale')
    returning id into v_sales_line_id;

    insert into public.packing_sessions (
      packed_by, platform, platform_order_id, courier, status, status_updated_by,
      packed_at, shipped_at, completed_at, created_by, created_at, updated_at
    )
    values (
      v_shop,
      case when v_channel = 'offline' then 'offline' else v_channel end,
      v_order_no,
      case when v_channel = 'offline' then 'offline' else (array['jne', 'jnt', 'sicepat'])[(v_idx % 3) + 1] end,
      (case when v_idx % 13 = 0 then 'shipped' else 'completed' end)::public.session_status,
      v_online,
      v_event_at + interval '1 hour',
      v_event_at + interval '3 hours',
      case when v_idx % 13 = 0 then null else v_event_at + interval '2 days' end,
      v_online,
      v_event_at,
      v_event_at + interval '2 days'
    )
    returning id into v_session_id;

    insert into public.packing_items (
      packing_session_id, product_id, barcode_scanned, unit_hpp, sell_price, created_at
    )
    select v_session_id, id, barcode, hpp, sell_price, v_event_at + interval '1 hour'
    from public.products where id = v_product_id
    returning id into v_item_id;

    insert into public.stock_movements (
      product_id, type, quantity, unit_cost, reference_type, reference_id, notes, performed_by, created_at
    )
    values (v_product_id, 'outbound', 1, v_unit_cost, 'packing_item', v_item_id, 'Penjualan demo', v_shop, v_event_at + interval '1 hour');

    update public.products
    set quantity = quantity - 1,
        updated_at = v_event_at + interval '1 hour'
    where id = v_product_id;

    insert into public.activity_logs (user_id, action, entity_type, entity_id, new_data, created_at)
    values
      (case when v_channel = 'offline' then v_shop else v_online end, 'create_sales_invoice', 'sales_invoice', v_sales_invoice_id, jsonb_build_object('channel', v_channel, 'total', v_total), v_event_at),
      (v_shop, 'scan_out', 'packing_item', v_item_id, jsonb_build_object('product', v_product_label, 'order_id', v_order_no), v_event_at + interval '1 hour');

    v_revenue_account := case
      when v_channel = 'shopee' then v_sales_shopee
      when v_channel = 'tiktok' then v_sales_tiktok
      else v_sales_wa
    end;

    insert into public.journal_entries (
      entry_number, entry_date, description, source_type, source_id,
      total_debit, total_credit, status, created_by, created_at
    )
    values (
      format('JRN-DEMO-SI-%s', lpad(v_idx::text, 4, '0')),
      v_event_at::date,
      format('Invoice penjualan INV-DEMO-%s', lpad(v_idx::text, 4, '0')),
      'sales_invoice',
      v_sales_invoice_id,
      v_total + v_fee + v_discount_amount + v_unit_cost,
      v_sell_price + v_unit_cost,
      'posted',
      case when v_channel = 'offline' then v_shop else v_online end,
      v_event_at
    )
    returning id into v_journal_id;

    insert into public.journal_lines (entry_id, account_id, debit, credit, description, line_order)
    select v_journal_id, account_id, debit, credit, description, line_order
    from (
      values
        (v_ar, v_total, 0::numeric, 'Piutang penjualan', 1),
        (v_market_fee, v_fee, 0::numeric, 'Beban marketplace', 2),
        (v_discount, v_discount_amount, 0::numeric, 'Diskon penjualan', 3),
        (v_revenue_account, 0::numeric, v_sell_price, 'Pendapatan penjualan', 4),
        (v_cogs, v_unit_cost, 0::numeric, 'HPP', 5),
        (v_inventory, 0::numeric, v_unit_cost, 'Persediaan keluar', 6)
    ) as lines(account_id, debit, credit, description, line_order)
    where debit > 0 or credit > 0;

    if v_payment > 0 then
      v_bank_account_id := case when v_channel = 'offline' then v_cash when v_channel in ('shopee', 'tiktok') then v_mandiri else v_bca end;
      if v_bank_account_id = v_cash then
        v_cash_balance := v_cash_balance + v_payment;
        v_balance := v_cash_balance;
      elsif v_bank_account_id = v_mandiri then
        v_mandiri_balance := v_mandiri_balance + v_payment;
        v_balance := v_mandiri_balance;
      else
        v_bca_balance := v_bca_balance + v_payment;
        v_balance := v_bca_balance;
      end if;

      insert into public.customer_payments (
        payment_number, customer_id, customer_name, payment_date, amount, payment_method,
        bank_account_id, reference_no, notes, created_by, created_at
      )
      select
        format('RC-DEMO-%s', lpad(v_idx::text, 4, '0')),
        c.id,
        c.name,
        (v_event_at + interval '1 day')::date,
        v_payment,
        (case when v_channel = 'offline' then 'cash' else 'bank_transfer' end)::public.payment_method,
        v_bank_account_id,
        format('IN-%s', lpad(v_idx::text, 4, '0')),
        'Penerimaan kas demo',
        v_finance,
        v_event_at + interval '1 day'
      from public.customers c
      where c.id = v_customer_id
      returning id into v_customer_payment_id;

      insert into public.customer_payment_allocations (payment_id, invoice_id, amount)
      values (v_customer_payment_id, v_sales_invoice_id, v_payment);

      insert into public.bank_transactions (
        bank_account_id, transaction_date, type, amount, balance_after, reference_no,
        description, related_entity_type, related_entity_id, is_reconciled, created_by, created_at
      )
      values (
        v_bank_account_id, (v_event_at + interval '1 day')::date, 'credit'::public.bank_transaction_type, v_payment, v_balance,
        format('IN-%s', lpad(v_idx::text, 4, '0')), 'Penerimaan customer demo',
        'customer_payment', v_customer_payment_id, v_idx % 8 <> 0, v_finance, v_event_at + interval '1 day'
      );

      insert into public.journal_entries (
        entry_number, entry_date, description, source_type, source_id,
        total_debit, total_credit, status, created_by, created_at
      )
      values (
        format('JRN-DEMO-CP-%s', lpad(v_idx::text, 4, '0')),
        (v_event_at + interval '1 day')::date,
        format('Penerimaan customer RC-DEMO-%s', lpad(v_idx::text, 4, '0')),
        'customer_payment',
        v_customer_payment_id,
        v_payment,
        v_payment,
        'posted',
        v_finance,
        v_event_at + interval '1 day'
      )
      returning id into v_journal_id;

      insert into public.journal_lines (entry_id, account_id, debit, credit, description, line_order)
      values
        (v_journal_id, case when v_bank_account_id = v_cash then v_cash_coa else v_bank end, v_payment, 0, 'Kas/Bank masuk', 1),
        (v_journal_id, v_ar, 0, v_payment, 'Pelunasan piutang', 2);

      insert into public.activity_logs (user_id, action, entity_type, entity_id, new_data, created_at)
      values (v_finance, 'receive_customer_payment', 'customer_payment', v_customer_payment_id, jsonb_build_object('amount', v_payment), v_event_at + interval '1 day');
    end if;

    if v_idx in (12, 18, 25, 33, 48, 61, 76, 90, 105, 117) then
      insert into public.internal_messages (
        sender_id, receiver_id, subject, content, related_entity_type, related_entity_id,
        metadata, is_system, is_read, created_at
      )
      values
        (v_system_sender, v_owner, 'Pesanan selesai', format('Pesanan %s sudah selesai dan terjurnal otomatis.', v_order_no), 'packing_session', v_session_id, jsonb_build_object('event_type', 'packing.completed', 'auto_generated', true), true, true, v_event_at + interval '2 days'),
        (v_system_sender, v_finance, 'Penerimaan kas tercatat', format('Pembayaran invoice %s masuk ke kas/bank.', format('INV-DEMO-%s', lpad(v_idx::text, 4, '0'))), 'sales_invoice', v_sales_invoice_id, jsonb_build_object('event_type', 'customer_payment.created', 'auto_generated', true), true, v_idx % 2 = 0, v_event_at + interval '1 day 5 minutes');
    end if;
  end loop;

  -- Returns: mix pending, verified, refund, and exchange_size.
  for v_idx in 1..10 loop
    select pi.id, pi.product_id, p.size, p.hpp, p.sell_price
    into v_item_id, v_product_id, v_original_size, v_unit_cost, v_sell_price
    from public.packing_items pi
    join public.products p on p.id = pi.product_id
    order by pi.created_at
    offset ((v_idx - 1) * 5)
    limit 1;

    if v_item_id is null then
      exit;
    end if;

    select id into v_new_product_id
    from public.products
    where id <> v_product_id and quantity > 0
    order by sku
    limit 1;

    v_event_at := v_start + interval '55 days' + (v_idx * interval '3 days');

    insert into public.returns (
      packing_item_id, type, reason, original_size, new_size,
      original_product_id, new_product_id, status, verified_by, verified_at,
      processed_by, created_at, processed_at
    )
    values (
      v_item_id,
      (case when v_idx % 3 = 0 then 'exchange_size' else 'refund' end)::public.return_type,
      case when v_idx % 2 = 0 then 'Size kurang pas' else 'Customer request refund' end,
      v_original_size,
      case when v_idx % 3 = 0 then v_original_size + 1 else null end,
      v_product_id,
      case when v_idx % 3 = 0 and v_idx <= 8 then v_new_product_id else null end,
      (case when v_idx <= 6 then 'processed' when v_idx <= 8 then 'verified' else 'pending' end)::public.return_status,
      case when v_idx <= 8 then v_gudang else null end,
      case when v_idx <= 8 then v_event_at + interval '1 day' else null end,
      case when v_idx <= 6 then v_gudang else null end,
      v_event_at,
      case when v_idx <= 6 then v_event_at + interval '2 days' else null end
    )
    returning id into v_return_id;

    insert into public.activity_logs (user_id, action, entity_type, entity_id, new_data, created_at)
    values
      (v_online, 'return_initiated', 'return', v_return_id, jsonb_build_object('reason', 'customer_return'), v_event_at),
      (v_gudang, 'return_verified', 'return', v_return_id, jsonb_build_object('status', case when v_idx <= 8 then 'verified' else 'pending' end), v_event_at + interval '1 day');

    insert into public.internal_messages (
      sender_id, receiver_id, subject, content, related_entity_type, related_entity_id,
      metadata, is_system, is_read, created_at
    )
    values
      (v_system_sender, v_owner, 'Return baru diinisiasi', 'Return demo masuk dan menunggu verifikasi gudang.', 'return', v_return_id, jsonb_build_object('event_type', 'return.initiated', 'auto_generated', true), true, v_idx <= 7, v_event_at),
      (v_system_sender, v_gudang, 'Return perlu dicek', 'Mohon cek fisik barang return dari pesanan marketplace/offline.', 'return', v_return_id, jsonb_build_object('event_type', 'return.initiated', 'auto_generated', true), true, v_idx <= 5, v_event_at + interval '5 minutes');

    if v_idx <= 6 then
      insert into public.stock_movements (
        product_id, type, quantity, unit_cost, reference_type, reference_id, notes, performed_by, created_at
      )
      values (v_product_id, 'return_in', 1, v_unit_cost, 'return', v_return_id, 'Barang return masuk stok', v_gudang, v_event_at + interval '2 days');

      update public.products
      set quantity = quantity + 1,
          updated_at = v_event_at + interval '2 days'
      where id = v_product_id;

      if v_idx % 3 = 0 and v_new_product_id is not null then
        insert into public.stock_movements (
          product_id, type, quantity, unit_cost, reference_type, reference_id, notes, performed_by, created_at
        )
        select id, 'return_out', 1, hpp, 'return', v_return_id, 'Barang pengganti exchange size', v_gudang, v_event_at + interval '2 days 15 minutes'
        from public.products
        where id = v_new_product_id;

        update public.products
        set quantity = quantity - 1,
            updated_at = v_event_at + interval '2 days 15 minutes'
        where id = v_new_product_id
          and quantity > 0;
      end if;
    end if;
  end loop;

  -- Product condition notes for UX demo: owner can see aging/defect context.
  update public.products
  set condition = 'defect',
      defect_reason = 'Box penyok dari return demo',
      condition_updated_by = v_gudang,
      condition_updated_at = now() - interval '12 days'
  where sku in (select sku from public.products order by sku limit 2);

  insert into public.product_condition_history (
    product_id, previous_condition, new_condition, reason, changed_by, changed_at
  )
  select
    id,
    'normal',
    'defect',
    'Box penyok dari return demo',
    v_gudang,
    now() - interval '12 days'
  from public.products
  where condition = 'defect';

  update public.products
  set condition = 'dormant',
      defect_reason = 'Tidak ada outbound lebih dari 60 hari',
      condition_updated_by = v_owner,
      condition_updated_at = now() - interval '7 days'
  where sku in (select sku from public.products order by sku offset 2 limit 3);

  insert into public.product_condition_history (
    product_id, previous_condition, new_condition, reason, changed_by, changed_at
  )
  select
    id,
    'normal',
    'dormant',
    'Tidak ada outbound lebih dari 60 hari',
    v_owner,
    now() - interval '7 days'
  from public.products
  where condition = 'dormant';

  -- Staff chat history: operational conversations mixed with system notifications.
  insert into public.internal_messages (
    sender_id, receiver_id, subject, content, related_entity_type, metadata, is_system, is_read, created_at
  )
  values
    (v_owner, v_finance, 'Review cashflow minggu ini', 'Tolong cek outstanding piutang dan hutang vendor sebelum presentasi.', 'finance_review', '{"thread":"cashflow"}', false, true, now() - interval '12 days'),
    (v_finance, v_owner, 'Re: Review cashflow minggu ini', 'Sudah saya rapikan. Ada beberapa invoice partial yang sengaja dibiarkan untuk demo aging.', 'finance_review', '{"thread":"cashflow"}', false, true, now() - interval '12 days' + interval '25 minutes'),
    (v_online, v_gudang, 'Cek return marketplace', 'Ada return size issue. Setelah barang sampai, update status verified ya.', 'return_coordination', '{"thread":"return"}', false, true, now() - interval '9 days'),
    (v_gudang, v_online, 'Re: Cek return marketplace', 'Siap, saya cek fisik dulu. Kalau aman saya proses masuk stok.', 'return_coordination', '{"thread":"return"}', false, true, now() - interval '9 days' + interval '18 minutes'),
    (v_shop, v_online, 'Order offline sudah selesai', 'Order toko hari ini sudah dipacking dan pembayaran cash sudah diterima.', 'packing_session', '{"thread":"offline"}', false, false, now() - interval '3 days'),
    (v_finance, v_shop, 'Kas toko', 'Nanti sore tolong cocokkan kas fisik dengan mutasi Kas Toko.', 'bank_transaction', '{"thread":"cash"}', false, false, now() - interval '2 days'),
    (v_owner, v_gudang, 'Restock minggu depan', 'Prioritaskan size 41-42 untuk model yang low stock.', 'purchase_order', '{"thread":"restock"}', false, false, now() - interval '1 day');

  -- Delete request samples for anti-fraud flow.
  insert into public.delete_requests (
    requested_by, entity_type, entity_id, reason, status, reviewed_by, review_notes, created_at, reviewed_at
  )
  select
    v_gudang,
    'product',
    p.id,
    'SKU duplikat saat import awal demo',
    'rejected',
    v_owner,
    'Ditolak untuk menjaga audit trail stok.',
    now() - interval '18 days',
    now() - interval '17 days'
  from public.products p
  order by p.sku
  limit 1;

  insert into public.delete_requests (
    requested_by, entity_type, entity_id, reason, status, created_at
  )
  select
    v_online,
    'packing_session',
    ps.id,
    'Order marketplace terinput dua kali, perlu review owner.',
    'pending',
    now() - interval '2 days'
  from public.packing_sessions ps
  order by ps.created_at desc
  limit 1;

  update public.bank_accounts set current_balance = v_bca_balance where id = v_bca;
  update public.bank_accounts set current_balance = v_mandiri_balance where id = v_mandiri;
  update public.bank_accounts set current_balance = v_cash_balance where id = v_cash;

  insert into public.activity_logs (user_id, action, entity_type, new_data, created_at)
  values (v_owner, 'demo_seed_completed', 'demo_dataset', jsonb_build_object('range_days', 90, 'sales_invoices', 120), now());
end $$;

commit;
