-- ============================================================================
-- SneakerVault — Seed Mock Data
-- Run this in Supabase SQL Editor after bootstrap_first_owner
-- ============================================================================

-- Get owner ID
DO $$
DECLARE
  owner_id uuid;
  sup_nike uuid;
  sup_adidas uuid;
  sup_nb uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid;
  p6 uuid; p7 uuid; p8 uuid; p9 uuid; p10 uuid;
  p11 uuid; p12 uuid;
  sess1 uuid; sess2 uuid; sess3 uuid;
BEGIN
  SELECT id INTO owner_id FROM profiles WHERE 'owner' = ANY(roles) LIMIT 1;

  -- Suppliers
  INSERT INTO suppliers (id, name, contact_person, phone, address, notes)
  VALUES
    (gen_random_uuid(), 'PT Nike Indonesia', 'Budi Santoso', '081234567890', 'Jakarta Selatan', 'Distributor resmi Nike')
  RETURNING id INTO sup_nike;

  INSERT INTO suppliers (id, name, contact_person, phone, address, notes)
  VALUES
    (gen_random_uuid(), 'Adidas Official Store', 'Sari Dewi', '081298765432', 'Surabaya', 'Supplier Adidas original')
  RETURNING id INTO sup_adidas;

  INSERT INTO suppliers (id, name, contact_person, phone, address, notes)
  VALUES
    (gen_random_uuid(), 'NB Bali Distributor', 'Made Agung', '081345678901', 'Denpasar, Bali', 'New Balance lokal Bali')
  RETURNING id INTO sup_nb;

  -- Products: Nike
  INSERT INTO products (id, brand, model, sku, size, color, barcode, quantity, hpp, sell_price, default_supplier_id, first_inbound_at)
  VALUES
    (gen_random_uuid(), 'Nike', 'Air Force 1', 'NK-AF1-WHT-42', 42, 'White', '200101', 8, 1200000, 1800000, sup_nike, now() - interval '30 days')
  RETURNING id INTO p1;
  INSERT INTO products (id, brand, model, sku, size, color, barcode, quantity, hpp, sell_price, default_supplier_id, first_inbound_at)
  VALUES
    (gen_random_uuid(), 'Nike', 'Air Force 1', 'NK-AF1-WHT-43', 43, 'White', '200102', 5, 1200000, 1800000, sup_nike, now() - interval '30 days')
  RETURNING id INTO p2;
  INSERT INTO products (id, brand, model, sku, size, color, barcode, quantity, hpp, sell_price, default_supplier_id, first_inbound_at)
  VALUES
    (gen_random_uuid(), 'Nike', 'Dunk Low', 'NK-DUNK-BLK-41', 41, 'Black/White', '200201', 12, 1400000, 2100000, sup_nike, now() - interval '20 days')
  RETURNING id INTO p3;
  INSERT INTO products (id, brand, model, sku, size, color, barcode, quantity, hpp, sell_price, default_supplier_id, first_inbound_at)
  VALUES
    (gen_random_uuid(), 'Nike', 'Dunk Low', 'NK-DUNK-BLK-42', 42, 'Black/White', '200202', 6, 1400000, 2100000, sup_nike, now() - interval '20 days')
  RETURNING id INTO p4;

  -- Products: Adidas
  INSERT INTO products (id, brand, model, sku, size, color, barcode, quantity, hpp, sell_price, default_supplier_id, first_inbound_at)
  VALUES
    (gen_random_uuid(), 'Adidas', 'Samba OG', 'ADS-SAMBA-WHT-40', 40, 'White/Black', '300101', 15, 1300000, 1900000, sup_adidas, now() - interval '25 days')
  RETURNING id INTO p5;
  INSERT INTO products (id, brand, model, sku, size, color, barcode, quantity, hpp, sell_price, default_supplier_id, first_inbound_at)
  VALUES
    (gen_random_uuid(), 'Adidas', 'Samba OG', 'ADS-SAMBA-WHT-41', 41, 'White/Black', '300102', 10, 1300000, 1900000, sup_adidas, now() - interval '25 days')
  RETURNING id INTO p6;
  INSERT INTO products (id, brand, model, sku, size, color, barcode, quantity, hpp, sell_price, default_supplier_id, first_inbound_at)
  VALUES
    (gen_random_uuid(), 'Adidas', 'Samba OG', 'ADS-SAMBA-WHT-42', 42, 'White/Black', '300103', 7, 1300000, 1900000, sup_adidas, now() - interval '25 days')
  RETURNING id INTO p7;
  INSERT INTO products (id, brand, model, sku, size, color, barcode, quantity, hpp, sell_price, default_supplier_id, first_inbound_at)
  VALUES
    (gen_random_uuid(), 'Adidas', 'Gazelle', 'ADS-GAZ-BLK-42', 42, 'Black', '300201', 4, 1100000, 1650000, sup_adidas, now() - interval '15 days')
  RETURNING id INTO p8;

  -- Products: New Balance
  INSERT INTO products (id, brand, model, sku, size, color, barcode, quantity, hpp, sell_price, default_supplier_id, first_inbound_at)
  VALUES
    (gen_random_uuid(), 'New Balance', '530', 'NB-530-SLV-40', 40, 'Silver', '400101', 9, 1100000, 1700000, sup_nb, now() - interval '18 days')
  RETURNING id INTO p9;
  INSERT INTO products (id, brand, model, sku, size, color, barcode, quantity, hpp, sell_price, default_supplier_id, first_inbound_at)
  VALUES
    (gen_random_uuid(), 'New Balance', '530', 'NB-530-SLV-41', 41, 'Silver', '400102', 6, 1100000, 1700000, sup_nb, now() - interval '18 days')
  RETURNING id INTO p10;
  INSERT INTO products (id, brand, model, sku, size, color, barcode, quantity, hpp, sell_price, default_supplier_id, first_inbound_at)
  VALUES
    (gen_random_uuid(), 'New Balance', '550', 'NB-550-WHT-42', 42, 'White/Green', '400201', 11, 1250000, 1850000, sup_nb, now() - interval '10 days')
  RETURNING id INTO p11;
  INSERT INTO products (id, brand, model, sku, size, color, barcode, quantity, hpp, sell_price, default_supplier_id, first_inbound_at)
  VALUES
    (gen_random_uuid(), 'New Balance', '550', 'NB-550-WHT-43', 43, 'White/Green', '400202', 3, 1250000, 1850000, sup_nb, now() - interval '10 days')
  RETURNING id INTO p12;

  -- Packing Sessions (completed = sold)
  INSERT INTO packing_sessions (id, packed_by, platform, platform_order_id, courier, status, created_by, packed_at, shipped_at, completed_at, created_at)
  VALUES (gen_random_uuid(), owner_id, 'shopee', 'SHP-240510001', 'jne', 'completed', owner_id, now() - interval '5 days', now() - interval '4 days', now() - interval '2 days', now() - interval '5 days')
  RETURNING id INTO sess1;

  INSERT INTO packing_sessions (id, packed_by, platform, platform_order_id, courier, status, created_by, packed_at, shipped_at, completed_at, created_at)
  VALUES (gen_random_uuid(), owner_id, 'tiktok', 'TT-240510002', 'jnt', 'completed', owner_id, now() - interval '3 days', now() - interval '2 days', now() - interval '1 day', now() - interval '3 days')
  RETURNING id INTO sess2;

  INSERT INTO packing_sessions (id, packed_by, platform, platform_order_id, courier, status, created_by, packed_at, shipped_at, created_at)
  VALUES (gen_random_uuid(), owner_id, 'shopee', 'SHP-240510003', 'sicepat', 'shipped', owner_id, now() - interval '1 day', now() - interval '12 hours', now() - interval '1 day')
  RETURNING id INTO sess3;

  -- Packing Items (sold items)
  INSERT INTO packing_items (packing_session_id, product_id, barcode_scanned, unit_hpp, sell_price) VALUES
    (sess1, p5, '300101', 1300000, 1900000),
    (sess1, p3, '200201', 1400000, 2100000),
    (sess1, p9, '400101', 1100000, 1700000);

  INSERT INTO packing_items (packing_session_id, product_id, barcode_scanned, unit_hpp, sell_price) VALUES
    (sess2, p5, '300101', 1300000, 1900000),
    (sess2, p6, '300102', 1300000, 1900000),
    (sess2, p11, '400201', 1250000, 1850000),
    (sess2, p1, '200101', 1200000, 1800000);

  INSERT INTO packing_items (packing_session_id, product_id, barcode_scanned, unit_hpp, sell_price) VALUES
    (sess3, p5, '300101', 1300000, 1900000),
    (sess3, p7, '300103', 1300000, 1900000);

  -- Stock movements for inbound
  INSERT INTO stock_movements (product_id, type, quantity, unit_cost, reference_type, performed_by, created_at) VALUES
    (p1, 'inbound', 10, 1200000, 'purchase_batch', owner_id, now() - interval '30 days'),
    (p2, 'inbound', 7, 1200000, 'purchase_batch', owner_id, now() - interval '30 days'),
    (p3, 'inbound', 15, 1400000, 'purchase_batch', owner_id, now() - interval '20 days'),
    (p4, 'inbound', 8, 1400000, 'purchase_batch', owner_id, now() - interval '20 days'),
    (p5, 'inbound', 20, 1300000, 'purchase_batch', owner_id, now() - interval '25 days'),
    (p6, 'inbound', 12, 1300000, 'purchase_batch', owner_id, now() - interval '25 days'),
    (p7, 'inbound', 10, 1300000, 'purchase_batch', owner_id, now() - interval '25 days'),
    (p8, 'inbound', 5, 1100000, 'purchase_batch', owner_id, now() - interval '15 days'),
    (p9, 'inbound', 12, 1100000, 'purchase_batch', owner_id, now() - interval '18 days'),
    (p10, 'inbound', 8, 1100000, 'purchase_batch', owner_id, now() - interval '18 days'),
    (p11, 'inbound', 14, 1250000, 'purchase_batch', owner_id, now() - interval '10 days'),
    (p12, 'inbound', 5, 1250000, 'purchase_batch', owner_id, now() - interval '10 days');

  -- Activity logs
  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, new_data, created_at) VALUES
    (owner_id, 'scan_in', 'product', p1, '{"quantity": 10, "brand": "Nike", "model": "Air Force 1"}', now() - interval '30 days'),
    (owner_id, 'scan_in', 'product', p5, '{"quantity": 20, "brand": "Adidas", "model": "Samba OG"}', now() - interval '25 days'),
    (owner_id, 'scan_in', 'product', p9, '{"quantity": 12, "brand": "New Balance", "model": "530"}', now() - interval '18 days'),
    (owner_id, 'scan_out', 'packing_item', p5, '{"brand": "Adidas", "model": "Samba OG", "size": 40}', now() - interval '5 days'),
    (owner_id, 'status_change', 'packing_session', sess1, '{"status": "completed"}', now() - interval '2 days'),
    (owner_id, 'scan_out', 'packing_item', p6, '{"brand": "Adidas", "model": "Samba OG", "size": 41}', now() - interval '3 days'),
    (owner_id, 'status_change', 'packing_session', sess2, '{"status": "completed"}', now() - interval '1 day'),
    (owner_id, 'create', 'packing_session', sess3, '{"platform": "shopee", "courier": "sicepat"}', now() - interval '1 day'),
    (owner_id, 'status_change', 'packing_session', sess3, '{"status": "shipped"}', now() - interval '12 hours');

END $$;
