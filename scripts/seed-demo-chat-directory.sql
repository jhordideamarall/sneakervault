-- Seed recent manual chat threads so the owner demo sees every staff member.
-- Safe to rerun.

begin;

delete from public.internal_messages
where metadata @> '{"demo_chat_directory": true}'::jsonb;

with users as (
  select
    (select id from public.profiles where email = 'owner@sneakervault.com') as owner_id,
    (select id from public.profiles where email = 'finance@sneakervault.com') as finance_id,
    (select id from public.profiles where email = 'budi@sneakervault.com') as gudang_id,
    (select id from public.profiles where email = 'siti@sneakervault.com') as online_id,
    (select id from public.profiles where email = 'agus@sneakervault.com') as shop_id
)
insert into public.internal_messages (
  sender_id, receiver_id, subject, content, metadata, is_system, is_read, created_at
)
select *
from (
  select owner_id, finance_id, 'Follow up pembayaran', 'Rani, tolong cek settlement marketplace dan outstanding vendor hari ini.', '{"demo_chat_directory": true, "thread": "finance"}'::jsonb, false, true, now() - interval '18 minutes' from users
  union all
  select finance_id, owner_id, 'Re: Follow up pembayaran', 'Siap, settlement sudah masuk Mandiri. Sisa 3 faktur vendor masih open untuk demo aging.', '{"demo_chat_directory": true, "thread": "finance"}'::jsonb, false, false, now() - interval '16 minutes' from users
  union all
  select owner_id, gudang_id, 'Restock dan return', 'Budi, cek return yang baru diverifikasi dan pastikan stok size pengganti sudah sesuai.', '{"demo_chat_directory": true, "thread": "warehouse"}'::jsonb, false, true, now() - interval '14 minutes' from users
  union all
  select gudang_id, owner_id, 'Re: Restock dan return', 'Sudah dicek. Return aman, stok pengganti sudah keluar sebagai return_out.', '{"demo_chat_directory": true, "thread": "warehouse"}'::jsonb, false, false, now() - interval '12 minutes' from users
  union all
  select owner_id, online_id, 'Order marketplace', 'Siti, prioritaskan invoice Shopee/TikTok yang belum lunas untuk follow up customer.', '{"demo_chat_directory": true, "thread": "online"}'::jsonb, false, true, now() - interval '10 minutes' from users
  union all
  select online_id, owner_id, 'Re: Order marketplace', 'Siap, list partial payment sudah saya tandai dan notifikasi customer sudah dikirim.', '{"demo_chat_directory": true, "thread": "online"}'::jsonb, false, false, now() - interval '8 minutes' from users
  union all
  select owner_id, shop_id, 'Kas toko', 'Agus, setelah close shift cocokkan kas toko dengan mutasi hari ini ya.', '{"demo_chat_directory": true, "thread": "store"}'::jsonb, false, true, now() - interval '6 minutes' from users
  union all
  select shop_id, owner_id, 'Re: Kas toko', 'Siap, kas offline sudah cocok dengan transaksi terakhir.', '{"demo_chat_directory": true, "thread": "store"}'::jsonb, false, false, now() - interval '4 minutes' from users
) rows(sender_id, receiver_id, subject, content, metadata, is_system, is_read, created_at)
where sender_id is not null and receiver_id is not null;

commit;
