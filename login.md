1. Buat user:
  
  Buka Supabase Dashboard → Authentication → Users → "Add user" → Create new user:
  
  - Email: owner@sneakervault.com
  - Password: owner123456
  - Auto Confirm: ✓
  
  2. Assign role owner (SQL Editor):
  
  SELECT public.bootstrap_first_owner('owner@sneakervault.com');
  
  Selesai. Langsung bisa login di app.