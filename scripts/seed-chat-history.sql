-- Seed chat history for internal_messages
-- Assumes profiles with names like 'Radit', 'Budi Gudang', 'Siti Online', 'Agus Shopkeeper' exist

DO $$
DECLARE
  v_owner_id UUID;
  v_warehouse_admin_id UUID;
  v_online_admin_id UUID;
  v_shopkeeper_id UUID;
BEGIN
  -- Get user IDs based on names from seed-employees.ts or profiles table
  SELECT id INTO v_owner_id FROM public.profiles WHERE full_name ILIKE '%Radit%' LIMIT 1;
  SELECT id INTO v_warehouse_admin_id FROM public.profiles WHERE roles @> ARRAY['admin_gudang']::user_role[] LIMIT 1;
  SELECT id INTO v_online_admin_id FROM public.profiles WHERE roles @> ARRAY['admin_online']::user_role[] LIMIT 1;
  SELECT id INTO v_shopkeeper_id FROM public.profiles WHERE roles @> ARRAY['shopkeeper']::user_role[] LIMIT 1;

  -- Default to something if not found (rare in local dev)
  IF v_owner_id IS NULL THEN SELECT id INTO v_owner_id FROM public.profiles LIMIT 1; END IF;
  
  -- Insert Messages
  INSERT INTO public.internal_messages (sender_id, receiver_id, subject, content, is_read, created_at)
  VALUES
    -- From Owner to Online Admin
    (v_owner_id, v_online_admin_id, 'Prioritas Order VIP', 'Siti, tolong prioritaskan order #7829 ya. Itu pelanggan tetap kita.', true, now() - interval '2 days'),
    -- Reply from Online Admin to Owner
    (v_online_admin_id, v_owner_id, 'Re: Prioritas Order VIP', 'Siap Pak Radit, sudah saya instruksikan ke Agus untuk packing segera.', true, now() - interval '1 day 23 hours'),
    
    -- From Warehouse Admin to Owner
    (v_warehouse_admin_id, v_owner_id, 'Laporan Stok Selisih', 'Pak, ada selisih stok 2 unit untuk Nike Dunk Low di rak B-10. Sedang saya investigasi.', true, now() - interval '1 day'),
    -- Reply from Owner to Warehouse Admin
    (v_owner_id, v_warehouse_admin_id, 'Re: Laporan Stok Selisih', 'Oke Budi, tolong cek rekaman CCTV area packing kalau perlu.', false, now() - interval '5 hours'),
    
    -- From Shopkeeper to Online Admin
    (v_shopkeeper_id, v_online_admin_id, 'Kendala Lakban', 'Mbak Siti, lakban di area packing sisa 1 roll lagi. Bisa bantu order ke supplier?', true, now() - interval '18 hours'),
    
    -- From Online Admin to Shopkeeper
    (v_online_admin_id, v_shopkeeper_id, 'Update Resi JNE', 'Gus, resi JNE untuk batch siang ini sudah di-print semua ya di meja.', false, now() - interval '2 hours'),
    
    -- From Owner to All (simulated via multiple messages)
    (v_owner_id, v_warehouse_admin_id, 'Meeting Evaluasi', 'Budi, besok pagi jam 10 meeting di kantor ya.', false, now() - interval '30 minutes'),
    (v_owner_id, v_online_admin_id, 'Meeting Evaluasi', 'Siti, besok pagi jam 10 meeting di kantor ya.', false, now() - interval '25 minutes'),
    (v_owner_id, v_shopkeeper_id, 'Meeting Evaluasi', 'Agus, besok pagi jam 10 meeting di kantor ya.', false, now() - interval '20 minutes');

END $$;
