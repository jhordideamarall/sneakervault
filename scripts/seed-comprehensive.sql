-- ============================================================================
-- SneakerVault — Comprehensive Seed (Employees, Products, Logs)
-- ============================================================================

DO $$
DECLARE
  owner_id uuid;
  admin_g uuid := '11111111-1111-1111-1111-111111111111';
  admin_o uuid := '22222222-2222-2222-2222-222222222222';
  sk1 uuid     := '33333333-3333-3333-3333-333333333333';
  sk2 uuid     := '44444444-4444-4444-4444-444444444444';
  
  sup_nike uuid;
  sup_adidas uuid;
  sup_nb uuid;
  sup_asics uuid;
  
  p1 uuid; p2 uuid; p3 uuid; p4 uuid;
  sess uuid;
BEGIN
  SELECT id INTO owner_id FROM profiles WHERE 'owner' = ANY(roles) LIMIT 1;

  -- 1. Create Employees (Profiles only for mock purposes)
  INSERT INTO profiles (id, full_name, email, roles, is_active)
  VALUES 
    (admin_g, 'Budi Gudang', 'budi@sneakervault.com', '{admin_gudang}', true),
    (admin_o, 'Siti Online', 'siti@sneakervault.com', '{admin_online}', true),
    (sk1, 'Agus Shopkeeper', 'agus@sneakervault.com', '{shopkeeper}', true),
    (sk2, 'Dewi Shopkeeper', 'dewi@sneakervault.com', '{shopkeeper}', true)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  -- Ensure owner is named Radit
  UPDATE profiles SET full_name = 'Radit' WHERE 'owner' = ANY(roles);

  -- 2. New Supplier
  INSERT INTO suppliers (id, name, contact_person, phone, address, notes)
  VALUES (gen_random_uuid(), 'Asics Indonesia', 'Hendri', '081999888777', 'Jakarta', 'Official Asics')
  RETURNING id INTO sup_asics;

  -- 3. More Products
  INSERT INTO products (brand, model, sku, size, color, barcode, quantity, hpp, sell_price, image_url, is_active)
  VALUES
    ('Asics', 'Gel-Kayano 14', 'ASC-GK14-SLV-41', 41, 'Silver/Black', '500101', 12, 1800000, 2800000, 'https://images.unsplash.com/photo-1721200006766-96b6f722971a?w=600&q=80', true),
    ('Asics', 'Gel-Kayano 14', 'ASC-GK14-SLV-42', 42, 'Silver/Black', '500102', 8, 1800000, 2800000, 'https://images.unsplash.com/photo-1721200006766-96b6f722971a?w=600&q=80', true),
    ('Nike', 'Jordan 1 Low', 'NK-J1L-BRED-40', 40, 'Bred', '200301', 5, 1600000, 2400000, 'https://images.unsplash.com/photo-1597041066774-5927705857f4?w=600&q=80', true),
    ('Nike', 'Jordan 1 Low', 'NK-J1L-BRED-41', 41, 'Bred', '200302', 10, 1600000, 2400000, 'https://images.unsplash.com/photo-1597041066774-5927705857f4?w=600&q=80', true),
    ('Adidas', 'Campus 00s', 'ADS-CMP-BLK-39', 39, 'Core Black', '300301', 15, 1200000, 1750000, 'https://images.unsplash.com/photo-1520639889313-7519702330a0?w=600&q=80', true),
    ('New Balance', '2002R', 'NB-2002R-GRY-43', 43, 'Grey', '400301', 6, 1500000, 2200000, 'https://images.unsplash.com/photo-1539185441755-769473a23570?w=600&q=80', true);

  -- 4. Realistic Activity Logs for Employees
  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, new_data, created_at)
  VALUES
    (admin_g, 'scan_in', 'product', gen_random_uuid(), '{"brand": "Asics", "model": "Gel-Kayano 14", "quantity": 20}', now() - interval '2 hours'),
    (sk1, 'scan_out', 'packing_item', gen_random_uuid(), '{"brand": "Nike", "model": "Dunk Low", "size": 42}', now() - interval '1 hour'),
    (admin_o, 'status_change', 'packing_session', gen_random_uuid(), '{"status": "completed", "order_id": "SHP-9901"}', now() - interval '45 minutes'),
    (owner_id, 'update', 'product', gen_random_uuid(), '{"brand": "Adidas", "model": "Samba OG", "manual_hpp": 1350000, "note": "Koreksi harga dari invoice baru"}', now() - interval '30 minutes'),
    (sk2, 'create', 'packing_session', gen_random_uuid(), '{"platform": "tiktok", "courier": "jnt"}', now() - interval '10 minutes');

END $$;
