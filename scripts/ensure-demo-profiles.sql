-- Sync demo profile names, roles, and notification preferences.
-- This assumes auth.users already contains these emails.

begin;

alter table public.profiles disable trigger guard_profiles_roles;

with desired(email, full_name, role_name) as (
  values
    ('owner@sneakervault.com', 'Jhordi Owner', 'owner'),
    ('finance@sneakervault.com', 'Rani Finance', 'finance'),
    ('budi@sneakervault.com', 'Budi Gudang', 'admin_gudang'),
    ('siti@sneakervault.com', 'Siti Online', 'admin_online'),
    ('agus@sneakervault.com', 'Agus Shopkeeper', 'shopkeeper')
),
updated_profiles as (
  update public.profiles p
  set
    full_name = d.full_name,
    roles = array[d.role_name::public.user_role],
    is_active = true,
    updated_at = now()
  from desired d
  where p.email = d.email
  returning p.id
)
insert into public.notification_preferences (user_id, muted_event_types, digest_mode, updated_at)
select id, '{}', false, now()
from updated_profiles
on conflict (user_id) do update
set muted_event_types = excluded.muted_event_types,
    digest_mode = excluded.digest_mode,
    updated_at = excluded.updated_at;

alter table public.profiles enable trigger guard_profiles_roles;

commit;

select email, full_name, roles
from public.profiles
where email in (
  'owner@sneakervault.com',
  'finance@sneakervault.com',
  'budi@sneakervault.com',
  'siti@sneakervault.com',
  'agus@sneakervault.com'
)
order by email;
