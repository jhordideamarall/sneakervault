-- Private bucket for UAT feedback screenshots. Read via signed URL only.
insert into storage.buckets (id, name, public)
values ('feedback-screenshots', 'feedback-screenshots', false)
on conflict (id) do nothing;

drop policy if exists "feedback shots upload by authenticated" on storage.objects;
create policy "feedback shots upload by authenticated"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'feedback-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "feedback shots read own or owner" on storage.objects;
create policy "feedback shots read own or owner"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'feedback-screenshots'
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or (select public.has_any_role(array['owner']::user_role[])))
  );

drop policy if exists "feedback shots delete own or owner" on storage.objects;
create policy "feedback shots delete own or owner"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'feedback-screenshots'
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or (select public.has_any_role(array['owner']::user_role[])))
  );
