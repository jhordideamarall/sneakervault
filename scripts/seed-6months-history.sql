-- ============================================================================
-- SneakerVault — Seed 6 Months Sales History + Activity Logs
-- Run AFTER seed-mock-data.sql in Supabase SQL Editor
-- ============================================================================

DO $$
DECLARE
  owner_id uuid;
  p_ids uuid[];
  p_id uuid;
  sess_id uuid;
  i int;
  sale_date timestamp;
  platforms text[] := ARRAY['shopee', 'tiktok', 'tokopedia', 'instagram'];
  couriers text[] := ARRAY['jne', 'jnt', 'sicepat', 'anteraja'];
  actions text[] := ARRAY['scan_in', 'scan_out', 'status_change', 'create', 'cancel_session', 'initiate_return', 'verify_return', 'process_return'];
  entities text[] := ARRAY['product', 'packing_session', 'packing_item', 'return'];
BEGIN
  SELECT id INTO owner_id FROM profiles WHERE 'owner' = ANY(roles) LIMIT 1;
  SELECT array_agg(id) INTO p_ids FROM products LIMIT 12;

  -- Generate sales for last 6 months
  FOR month_offset IN 1..5 LOOP
    -- Each past month: 8-15 sales
    FOR i IN 1..( 8 + floor(random() * 8)::int ) LOOP
      sale_date := now() - (month_offset || ' months')::interval + (floor(random() * 28) || ' days')::interval + (floor(random() * 12) || ' hours')::interval;
      p_id := p_ids[1 + floor(random() * array_length(p_ids, 1))::int];

      INSERT INTO packing_sessions (id, packed_by, platform, platform_order_id, courier, status, created_by, packed_at, shipped_at, completed_at, created_at)
      VALUES (gen_random_uuid(), owner_id, platforms[1 + floor(random() * 4)::int], 'ORD-' || to_char(sale_date, 'YYMMDD') || '-' || lpad(i::text, 3, '0'), couriers[1 + floor(random() * 4)::int], 'completed', owner_id, sale_date, sale_date + interval '1 day', sale_date + interval '3 days', sale_date)
      RETURNING id INTO sess_id;

      INSERT INTO packing_items (packing_session_id, product_id, barcode_scanned, unit_hpp, sell_price, created_at)
      VALUES (sess_id, p_id, (SELECT barcode FROM products WHERE id = p_id), (SELECT hpp FROM products WHERE id = p_id), (SELECT sell_price FROM products WHERE id = p_id), sale_date);

      -- Sometimes 2 items per session
      IF random() > 0.6 THEN
        p_id := p_ids[1 + floor(random() * array_length(p_ids, 1))::int];
        INSERT INTO packing_items (packing_session_id, product_id, barcode_scanned, unit_hpp, sell_price, created_at)
        VALUES (sess_id, p_id, (SELECT barcode FROM products WHERE id = p_id), (SELECT hpp FROM products WHERE id = p_id), (SELECT sell_price FROM products WHERE id = p_id), sale_date);
      END IF;
    END LOOP;
  END LOOP;

  -- Generate activity logs spread across 6 months
  FOR month_offset IN 0..5 LOOP
    FOR i IN 1..( 10 + floor(random() * 15)::int ) LOOP
      sale_date := now() - (month_offset || ' months')::interval + (floor(random() * 28) || ' days')::interval + (floor(random() * 14) || ' hours')::interval;
      p_id := p_ids[1 + floor(random() * array_length(p_ids, 1))::int];

      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, new_data, created_at)
      VALUES (
        owner_id,
        actions[1 + floor(random() * array_length(actions, 1))::int],
        entities[1 + floor(random() * array_length(entities, 1))::int],
        p_id,
        json_build_object(
          'brand', (SELECT brand FROM products WHERE id = p_id),
          'model', (SELECT model FROM products WHERE id = p_id),
          'size', (SELECT size FROM products WHERE id = p_id)
        )::jsonb,
        sale_date
      );
    END LOOP;
  END LOOP;

END $$;
