-- Feedback UAT module: intake + triage + comment threads.
-- Additive + idempotent. RLS owner-sees-all / reporter-sees-own. Triage owner-only.

do $$ begin
  create type feedback_severity as enum ('blocker','mengganggu','minor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type feedback_status as enum ('baru','diproses','selesai','ditolak');
exception when duplicate_object then null; end $$;

create sequence if not exists feedback_report_seq;

create table if not exists feedback_reports (
  id uuid primary key default gen_random_uuid(),
  report_no text unique not null,
  title text not null,
  description text not null,
  severity feedback_severity not null default 'mengganggu',
  status feedback_status not null default 'baru',
  page_path text,
  reporter_role text,
  app_version text,
  user_agent text,
  viewport text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz
);

create table if not exists feedback_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references feedback_reports(id) on delete cascade,
  body text not null,
  author_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists feedback_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references feedback_reports(id) on delete cascade,
  comment_id uuid references feedback_comments(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_reports_created_by on feedback_reports(created_by);
create index if not exists idx_feedback_reports_status on feedback_reports(status);
create index if not exists idx_feedback_comments_report on feedback_comments(report_id);
create index if not exists idx_feedback_attachments_report on feedback_attachments(report_id);
create index if not exists idx_feedback_attachments_comment on feedback_attachments(comment_id);

-- Report number generator: UAT-0001, UAT-0002, ...
create or replace function public.generate_feedback_number()
returns text language sql security definer set search_path = public as $$
  select 'UAT-' || lpad(nextval('feedback_report_seq')::text, 4, '0');
$$;
revoke execute on function public.generate_feedback_number() from anon, public;
grant execute on function public.generate_feedback_number() to authenticated;

alter table feedback_reports enable row level security;
alter table feedback_comments enable row level security;
alter table feedback_attachments enable row level security;

-- reports
drop policy if exists "feedback_reports insert own" on feedback_reports;
create policy "feedback_reports insert own" on feedback_reports
  for insert to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists "feedback_reports select own or owner" on feedback_reports;
create policy "feedback_reports select own or owner" on feedback_reports
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or (select public.has_any_role(array['owner']::user_role[]))
  );

drop policy if exists "feedback_reports update owner" on feedback_reports;
create policy "feedback_reports update owner" on feedback_reports
  for update to authenticated
  using ((select public.has_any_role(array['owner']::user_role[])))
  with check ((select public.has_any_role(array['owner']::user_role[])));

-- comments (visibility follows parent report)
drop policy if exists "feedback_comments select visible" on feedback_comments;
create policy "feedback_comments select visible" on feedback_comments
  for select to authenticated
  using (
    exists (
      select 1 from feedback_reports r
      where r.id = report_id
        and (r.created_by = (select auth.uid())
             or (select public.has_any_role(array['owner']::user_role[])))
    )
  );

drop policy if exists "feedback_comments insert visible" on feedback_comments;
create policy "feedback_comments insert visible" on feedback_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from feedback_reports r
      where r.id = report_id
        and (r.created_by = (select auth.uid())
             or (select public.has_any_role(array['owner']::user_role[])))
    )
  );

-- attachments (visibility follows parent report)
drop policy if exists "feedback_attachments select visible" on feedback_attachments;
create policy "feedback_attachments select visible" on feedback_attachments
  for select to authenticated
  using (
    exists (
      select 1 from feedback_reports r
      where r.id = report_id
        and (r.created_by = (select auth.uid())
             or (select public.has_any_role(array['owner']::user_role[])))
    )
  );

drop policy if exists "feedback_attachments insert own" on feedback_attachments;
create policy "feedback_attachments insert own" on feedback_attachments
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from feedback_reports r
      where r.id = report_id
        and (r.created_by = (select auth.uid())
             or (select public.has_any_role(array['owner']::user_role[])))
    )
  );
