# UAT Feedback Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-app UAT feedback module so testers report issues (with auto-captured context + screenshots) directly inside the app, and the owner tracks status + comment threads — feeding clean, reproducible reports to whoever fixes the code.

**Architecture:** New route `/feedback` (all roles), a floating "Lapor Masalah" button mounted globally in the dashboard layout, three Supabase tables (`feedback_reports`, `feedback_comments`, `feedback_attachments`) + a private storage bucket, server actions for create/comment/triage, RLS so owners see all and others see their own. Auto-context (page, effective role, app version, viewport) is captured at submit — role & version server-side (anti-spoof), page & viewport client-side.

**Tech Stack:** Next.js 16 App Router (server actions), Supabase (Postgres + RLS + Storage), Zod (`@sneakervault/shared` validators), TypeScript, Tailwind. Source-only packages (`@sneakervault/supabase`, `@sneakervault/shared`).

> **Testing reality:** this repo has **no unit-test runner** (no vitest/jest/playwright). Verification follows the project's established gates: `pnpm --filter @sneakervault/web type-check`, `pnpm --filter @sneakervault/web lint`, `pnpm --filter @sneakervault/web build`, MCP Supabase SQL assertions, and manual UI walkthrough. "Test" steps below use these gates instead of a fabricated test suite.

> **Safety (CLAUDE.md):** schema changes via NEW migration files only; additive + idempotent (`IF NOT EXISTS`/`ON CONFLICT`); verify live schema via MCP `supabase-sneaker` before apply; no destructive ops; new RLS uses `(select auth.uid())` / `(select has_any_role(...))`; new RPC `revoke execute from anon, public`; new bucket without broad listing policy. Create an artifact folder `artifacts/035-uat-feedback-module/status.md` and update it per task.

---

## File Structure

**Created:**
- `apps/web/supabase/migrations/{ts}_feedback_tables.sql` — enums, 3 tables, RLS, RPC, indexes
- `apps/web/supabase/migrations/{ts}_feedback_storage.sql` — private bucket + policies
- `apps/web/src/lib/actions/feedback.ts` — server actions (create, comment, status, signed URL)
- `apps/web/src/lib/queries/feedback.ts` — read queries (list/detail)
- `apps/web/src/app/(dashboard)/feedback/page.tsx` — list/board page
- `apps/web/src/components/feedback/feedback-fab.tsx` — floating button + drawer
- `apps/web/src/components/feedback/feedback-form.tsx` — report form
- `apps/web/src/components/feedback/feedback-detail.tsx` — detail + comments + status
- `artifacts/035-uat-feedback-module/status.md` — artifact tracking

**Modified:**
- `packages/shared/src/validators.ts` — add `feedbackInputSchema`, `feedbackCommentSchema`
- `packages/shared/src/types.ts` — add `FeedbackSeverity`, `FeedbackStatus` types
- `apps/web/src/config/permissions.ts` — add `/feedback` → all roles
- `apps/web/src/app/(dashboard)/layout.tsx` — mount `<FeedbackFab />`
- `apps/web/src/components/dashboard/sidebar.tsx` — add "Feedback UAT" menu item
- `apps/web/src/lib/sidebar-signals.ts` — owner signal for new (`baru`) reports
- `apps/web/next.config.ts` — expose `NEXT_PUBLIC_APP_VERSION` from git SHA

---

## Task 1: Database tables, enums, RLS, RPC

**Files:**
- Create: `apps/web/supabase/migrations/{ts}_feedback_tables.sql` (use a timestamp later than the latest existing migration, e.g. `20260613090000`)

- [ ] **Step 1: Verify live schema via MCP before writing**

Run (MCP `supabase-sneaker`): confirm tables `feedback_reports/comments/attachments` do NOT exist, and `user_role` enum + `has_any_role(user_role[])` function exist.
```sql
select table_name from information_schema.tables where table_name like 'feedback%';
select proname from pg_proc where proname = 'has_any_role';
```
Expected: 0 feedback tables; `has_any_role` present.

- [ ] **Step 2: Write the migration**

```sql
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
```

- [ ] **Step 3: Apply via MCP and verify**

Apply with MCP `apply_migration` (name `feedback_tables`). Then verify:
```sql
select count(*) from information_schema.tables where table_name in
  ('feedback_reports','feedback_comments','feedback_attachments'); -- expect 3
select public.generate_feedback_number(); -- expect 'UAT-0001'
select public.generate_feedback_number(); -- expect 'UAT-0002'
```
Expected: 3 tables; sequential UAT numbers.

- [ ] **Step 4: Commit**

```bash
git add apps/web/supabase/migrations/*_feedback_tables.sql
git commit -m "feat(db): feedback UAT tables, RLS, report-number RPC"
```

---

## Task 2: Private storage bucket for screenshots

**Files:**
- Create: `apps/web/supabase/migrations/{ts}_feedback_storage.sql` (timestamp after Task 1)

- [ ] **Step 1: Write the migration** (pattern mirrors `20260602190100_product_photos_bucket.sql`, but PRIVATE + no listing policy)

```sql
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
```

- [ ] **Step 2: Apply via MCP and verify**

Apply with MCP `apply_migration` (name `feedback_storage`). Verify:
```sql
select id, public from storage.buckets where id = 'feedback-screenshots'; -- public = false
```
Expected: bucket exists, `public = false`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/supabase/migrations/*_feedback_storage.sql
git commit -m "feat(db): private feedback-screenshots bucket + policies"
```

---

## Task 3: Shared types & Zod schemas

**Files:**
- Modify: `packages/shared/src/types.ts` (append)
- Modify: `packages/shared/src/validators.ts` (append)

- [ ] **Step 1: Add types** to end of `packages/shared/src/types.ts`

```typescript
export type FeedbackSeverity = "blocker" | "mengganggu" | "minor";
export type FeedbackStatus = "baru" | "diproses" | "selesai" | "ditolak";
```

- [ ] **Step 2: Add schemas** to end of `packages/shared/src/validators.ts`

```typescript
import { z } from "zod"; // reuse existing import at top of file — do NOT duplicate

export const feedbackInputSchema = z.object({
  title: z.string().trim().min(3, "Judul minimal 3 karakter").max(160),
  description: z.string().trim().min(5, "Deskripsi minimal 5 karakter").max(4000),
  severity: z.enum(["blocker", "mengganggu", "minor"]),
  page_path: z.string().trim().max(300).optional(),
  // client-captured context (untrusted; role/version added server-side):
  user_agent: z.string().max(500).optional(),
  viewport: z.string().max(40).optional(),
});

export const feedbackCommentSchema = z.object({
  report_id: z.string().uuid(),
  body: z.string().trim().min(1, "Komentar kosong").max(4000),
});

export const feedbackStatusSchema = z.object({
  report_id: z.string().uuid(),
  status: z.enum(["baru", "diproses", "selesai", "ditolak"]),
});
```
> Note: if `validators.ts` already imports `z`, reuse that import; do not add a second one.

- [ ] **Step 3: Ensure exports** — confirm `packages/shared/src/index.ts` re-exports `./types` and `./validators` (it already does for existing schemas). No change needed if barrel uses `export * from`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @sneakervault/web type-check`
Expected: PASS (new symbols resolve).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/validators.ts
git commit -m "feat(shared): feedback types + zod schemas"
```

---

## Task 4: Expose app version (git SHA)

**Files:**
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Add env exposure** — inside the exported config object add an `env` key (merge if one exists):

```typescript
const nextConfig = {
  // ...existing config...
  env: {
    NEXT_PUBLIC_APP_VERSION:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
  },
};
```
> If `next.config.ts` already has an `env` block, add the single key into it instead of a new block.

- [ ] **Step 2: Verify**

Run: `pnpm --filter @sneakervault/web type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/next.config.ts
git commit -m "chore(web): expose NEXT_PUBLIC_APP_VERSION from git sha"
```

---

## Task 5: Server actions — create / comment / triage / signed URL

**Files:**
- Create: `apps/web/src/lib/actions/feedback.ts`

- [ ] **Step 1: Write the actions**

```typescript
"use server";

import { createClient } from "@sneakervault/supabase/server";
import {
  feedbackInputSchema,
  feedbackCommentSchema,
  feedbackStatusSchema,
} from "@sneakervault/shared";
import { requireRole, requireOwner } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";

const ALL_ROLES = [
  "owner",
  "finance",
  "admin_gudang",
  "admin_online",
  "shopkeeper",
] as const;

const BUCKET = "feedback-screenshots";

type UploadedFile = { file_path: string; file_name: string };

/** Create a feedback report. Manual fields validated; role+version added server-side. */
export async function createFeedback(input: unknown, attachments: UploadedFile[] = []) {
  const profile = await requireRole([...ALL_ROLES]);
  const parsed = feedbackInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data: numberRow, error: numErr } = await supabase.rpc("generate_feedback_number");
  if (numErr || !numberRow) return { error: { _form: ["Gagal membuat nomor laporan"] } };

  const reporterRole = (profile.roles ?? []).join(",") || "unknown";
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

  const { data: report, error } = await supabase
    .from("feedback_reports")
    .insert({
      report_no: numberRow as string,
      title: parsed.data.title,
      description: parsed.data.description,
      severity: parsed.data.severity,
      page_path: parsed.data.page_path ?? null,
      reporter_role: reporterRole,
      app_version: appVersion,
      user_agent: parsed.data.user_agent ?? null,
      viewport: parsed.data.viewport ?? null,
      created_by: profile.id,
    })
    .select("id, report_no")
    .single();

  if (error || !report) return { error: { _form: ["Gagal menyimpan laporan"] } };

  if (attachments.length > 0) {
    const rows = attachments.map((a) => ({
      report_id: report.id,
      file_path: a.file_path,
      file_name: a.file_name,
      created_by: profile.id,
    }));
    await supabase.from("feedback_attachments").insert(rows);
  }

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "feedback_report",
    entity_id: report.id,
    new_data: { report_no: report.report_no, severity: parsed.data.severity },
  });

  revalidatePath("/feedback");
  return { ok: true, id: report.id, report_no: report.report_no };
}

/** Add a comment to a report. RLS enforces visibility; we also attach files. */
export async function addFeedbackComment(input: unknown, attachments: UploadedFile[] = []) {
  const profile = await requireRole([...ALL_ROLES]);
  const parsed = feedbackCommentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data: comment, error } = await supabase
    .from("feedback_comments")
    .insert({
      report_id: parsed.data.report_id,
      body: parsed.data.body,
      author_id: profile.id,
    })
    .select("id")
    .single();

  if (error || !comment) return { error: { _form: ["Gagal menyimpan komentar (cek akses)"] } };

  if (attachments.length > 0) {
    const rows = attachments.map((a) => ({
      report_id: parsed.data.report_id,
      comment_id: comment.id,
      file_path: a.file_path,
      file_name: a.file_name,
      created_by: profile.id,
    }));
    await supabase.from("feedback_attachments").insert(rows);
  }

  revalidatePath("/feedback");
  return { ok: true };
}

/** Owner-only: change report status; stamp resolver on terminal states. */
export async function updateFeedbackStatus(input: unknown) {
  const profile = await requireOwner();
  const parsed = feedbackStatusSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const terminal = parsed.data.status === "selesai" || parsed.data.status === "ditolak";
  const { error } = await supabase
    .from("feedback_reports")
    .update({
      status: parsed.data.status,
      updated_at: new Date().toISOString(),
      resolved_by: terminal ? profile.id : null,
      resolved_at: terminal ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.report_id);

  if (error) return { error: { _form: ["Gagal mengubah status"] } };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "feedback_report",
    entity_id: parsed.data.report_id,
    new_data: { status: parsed.data.status },
  });

  revalidatePath("/feedback");
  return { ok: true };
}

/** Short-lived signed URL for a private screenshot path. */
export async function getFeedbackScreenshotUrl(path: string) {
  await requireRole([...ALL_ROLES]);
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data) return { error: "Gagal membuat URL" };
  return { url: data.signedUrl };
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @sneakervault/web type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/actions/feedback.ts
git commit -m "feat(feedback): server actions create/comment/triage/signed-url"
```

---

## Task 6: Read queries (list + detail)

**Files:**
- Create: `apps/web/src/lib/queries/feedback.ts`

- [ ] **Step 1: Write queries** — RLS already scopes rows (owner: all, others: own), so no manual role filter needed for SELECT.

```typescript
import { createClient } from "@sneakervault/supabase/server";
import type { FeedbackSeverity, FeedbackStatus } from "@sneakervault/shared";

export type FeedbackReportRow = {
  id: string;
  report_no: string;
  title: string;
  severity: FeedbackSeverity;
  status: FeedbackStatus;
  page_path: string | null;
  reporter_role: string | null;
  app_version: string | null;
  created_at: string;
  created_by: string;
};

export async function listFeedback(filters?: {
  status?: FeedbackStatus;
  severity?: FeedbackSeverity;
}): Promise<FeedbackReportRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("feedback_reports")
    .select(
      "id, report_no, title, severity, status, page_path, reporter_role, app_version, created_at, created_by",
    )
    .order("created_at", { ascending: false });
  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.severity) q = q.eq("severity", filters.severity);
  const { data } = await q;
  return (data ?? []) as FeedbackReportRow[];
}

export async function getFeedback(id: string) {
  const supabase = await createClient();
  const { data: report } = await supabase
    .from("feedback_reports")
    .select("*")
    .eq("id", id)
    .single();
  if (!report) return null;

  const { data: comments } = await supabase
    .from("feedback_comments")
    .select("id, body, author_id, created_at")
    .eq("report_id", id)
    .order("created_at", { ascending: true });

  const { data: attachments } = await supabase
    .from("feedback_attachments")
    .select("id, comment_id, file_path, file_name")
    .eq("report_id", id);

  return { report, comments: comments ?? [], attachments: attachments ?? [] };
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @sneakervault/web type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/queries/feedback.ts
git commit -m "feat(feedback): list + detail read queries"
```

---

## Task 7: Route permission

**Files:**
- Modify: `apps/web/src/config/permissions.ts` (the `routePermissions` object, around line 12)

- [ ] **Step 1: Add entry** inside `routePermissions`:

```typescript
  "/feedback": ["owner", "finance", "admin_gudang", "admin_online", "shopkeeper"],
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @sneakervault/web type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/config/permissions.ts
git commit -m "feat(feedback): allow /feedback for all roles"
```

---

## Task 8: Feedback form component

**Files:**
- Create: `apps/web/src/components/feedback/feedback-form.tsx`

- [ ] **Step 1: Write the form** — uploads screenshots to the private bucket from the browser, then calls `createFeedback` with returned paths. Captures `user_agent`/`viewport` client-side; `page_path` is passed in (prefilled, editable).

```tsx
"use client";

import { useState } from "react";
import { createBrowserClient } from "@sneakervault/supabase/client";
import { createFeedback } from "@/lib/actions/feedback";

type Props = {
  defaultPath: string;
  userId: string;
  onDone: () => void;
};

const SEVERITIES = [
  { v: "blocker", label: "🔴 Blocker (tidak bisa lanjut)" },
  { v: "mengganggu", label: "🟡 Mengganggu (ada workaround)" },
  { v: "minor", label: "🟢 Minor (kosmetik)" },
] as const;

export function FeedbackForm({ defaultPath, userId, onDone }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"blocker" | "mengganggu" | "minor">("mengganggu");
  const [pagePath, setPagePath] = useState(defaultPath);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const supabase = createBrowserClient();
      const uploaded: { file_path: string; file_name: string }[] = [];
      for (const f of files) {
        const path = `${userId}/${crypto.randomUUID()}-${f.name}`;
        const { error } = await supabase.storage.from("feedback-screenshots").upload(path, f);
        if (error) throw new Error("Upload screenshot gagal: " + error.message);
        uploaded.push({ file_path: path, file_name: f.name });
      }
      const viewport = `${window.innerWidth}x${window.innerHeight}`;
      const res = await createFeedback(
        {
          title,
          description,
          severity,
          page_path: pagePath,
          user_agent: navigator.userAgent,
          viewport,
        },
        uploaded,
      );
      if ("error" in res) {
        setErr("Periksa input: judul/deskripsi wajib diisi.");
        return;
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal mengirim");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-white/50">Judul masalah</span>
        <input
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Stok tidak turun setelah checkout"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-white/50">Langkah + apa yang terjadi</span>
        <textarea
          className="min-h-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Jual Samba size 42, klik bayar cash, struk keluar tapi stok tetap 5."
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-white/50">Tingkat</span>
        <select
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as typeof severity)}
        >
          {SEVERITIES.map((s) => (
            <option key={s.v} value={s.v} className="bg-neutral-900">
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-white/50">Halaman (otomatis, bisa diedit)</span>
        <input
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs"
          value={pagePath}
          onChange={(e) => setPagePath(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-white/50">Screenshot (boleh lebih dari satu)</span>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </label>
      {err && <p className="text-red-400">{err}</p>}
      <button
        disabled={busy || !title.trim() || !description.trim()}
        onClick={submit}
        className="rounded-lg bg-white/90 px-4 py-2 font-medium text-black disabled:opacity-40"
      >
        {busy ? "Mengirim…" : "Kirim Laporan"}
      </button>
    </div>
  );
}
```
> Verify the browser Supabase client export name: this repo uses `@sneakervault/supabase/client`. If the export is named differently (e.g. `createClient`), match the existing usage in other `"use client"` components (grep `from "@sneakervault/supabase/client"`).

- [ ] **Step 2: Verify**

Run: `pnpm --filter @sneakervault/web type-check`
Expected: PASS. If the client import name mismatches, fix per the grep note, then re-run.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/feedback/feedback-form.tsx
git commit -m "feat(feedback): report form with screenshot upload"
```

---

## Task 9: Floating action button + drawer

**Files:**
- Create: `apps/web/src/components/feedback/feedback-fab.tsx`

- [ ] **Step 1: Write the FAB** — gated by `NEXT_PUBLIC_UAT_MODE`, reads current path, opens a panel hosting `FeedbackForm`.

```tsx
"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, X } from "lucide-react";
import { FeedbackForm } from "./feedback-form";

export function FeedbackFab({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  if (process.env.NEXT_PUBLIC_UAT_MODE !== "true") return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-amber-500 px-4 py-3 text-sm font-medium text-black shadow-lg hover:bg-amber-400"
        aria-label="Lapor Masalah UAT"
      >
        <MessageSquarePlus size={18} />
        Lapor Masalah
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-neutral-950 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Lapor Masalah UAT</h2>
              <button onClick={() => setOpen(false)} aria-label="Tutup">
                <X size={18} className="text-white/60" />
              </button>
            </div>
            <FeedbackForm defaultPath={pathname} userId={userId} onDone={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Mount in dashboard layout** — in `apps/web/src/app/(dashboard)/layout.tsx`, import and render near `<MailGlobalDialog ... />` (line ~46). Add import at top:

```tsx
import { FeedbackFab } from "@/components/feedback/feedback-fab";
```
And inside the returned tree, next to `<MailGlobalDialog userId={profile.id} />`:

```tsx
      <FeedbackFab userId={profile.id} />
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @sneakervault/web type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/feedback/feedback-fab.tsx "apps/web/src/app/(dashboard)/layout.tsx"
git commit -m "feat(feedback): floating report button gated by UAT mode"
```

---

## Task 10: Detail component (auto-context + comments + status)

**Files:**
- Create: `apps/web/src/components/feedback/feedback-detail.tsx`

- [ ] **Step 1: Write the detail client component** — shows auto-context block, attachments (signed URLs), comment thread, owner-only status control.

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  addFeedbackComment,
  updateFeedbackStatus,
  getFeedbackScreenshotUrl,
} from "@/lib/actions/feedback";
import type { FeedbackStatus } from "@sneakervault/shared";

type Report = {
  id: string;
  report_no: string;
  title: string;
  description: string;
  severity: string;
  status: FeedbackStatus;
  page_path: string | null;
  reporter_role: string | null;
  app_version: string | null;
  user_agent: string | null;
  viewport: string | null;
  created_at: string;
};
type Comment = { id: string; body: string; author_id: string; created_at: string };
type Attachment = { id: string; comment_id: string | null; file_path: string; file_name: string };

const STATUSES: FeedbackStatus[] = ["baru", "diproses", "selesai", "ditolak"];

export function FeedbackDetail({
  report,
  comments,
  attachments,
  isOwner,
}: {
  report: Report;
  comments: Comment[];
  attachments: Attachment[];
  isOwner: boolean;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const next: Record<string, string> = {};
      for (const a of attachments) {
        const res = await getFeedbackScreenshotUrl(a.file_path);
        if ("url" in res) next[a.id] = res.url;
      }
      setUrls(next);
    })();
  }, [attachments]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    await addFeedbackComment({ report_id: report.id, body });
    setBody("");
    setBusy(false);
    location.reload();
  }

  async function setStatus(status: FeedbackStatus) {
    setBusy(true);
    await updateFeedbackStatus({ report_id: report.id, status });
    setBusy(false);
    location.reload();
  }

  const reportShots = attachments.filter((a) => !a.comment_id);

  return (
    <div className="flex flex-col gap-4 text-sm text-white/80">
      <div>
        <div className="text-xs text-white/40">{report.report_no}</div>
        <h1 className="text-lg font-semibold text-white">{report.title}</h1>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs">
        <Ctx k="Halaman" v={report.page_path} mono />
        <Ctx k="Role pelapor" v={report.reporter_role} />
        <Ctx k="Severity" v={report.severity} />
        <Ctx k="Versi app" v={report.app_version} mono />
        <Ctx k="Viewport" v={report.viewport} mono />
        <Ctx k="Waktu" v={new Date(report.created_at).toLocaleString("id-ID")} />
      </div>

      <p className="whitespace-pre-wrap">{report.description}</p>

      {reportShots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {reportShots.map((a) =>
            urls[a.id] ? (
              <a key={a.id} href={urls[a.id]} target="_blank" rel="noreferrer">
                <img src={urls[a.id]} alt={a.file_name} className="h-28 rounded-lg border border-white/10" />
              </a>
            ) : null,
          )}
        </div>
      )}

      {isOwner && (
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              disabled={busy || s === report.status}
              onClick={() => setStatus(s)}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                s === report.status
                  ? "border-amber-400 bg-amber-400/20 text-amber-200"
                  : "border-white/10 text-white/60 hover:bg-white/5"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
        <h3 className="text-xs uppercase tracking-wide text-white/40">Diskusi</h3>
        {comments.map((c) => (
          <div key={c.id} className="rounded-lg bg-white/[0.03] p-3">
            <div className="mb-1 text-[11px] text-white/35">
              {new Date(c.created_at).toLocaleString("id-ID")}
            </div>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}
        <textarea
          className="min-h-20 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Tulis balasan…"
        />
        <button
          disabled={busy || !body.trim()}
          onClick={send}
          className="self-start rounded-lg bg-white/90 px-4 py-2 font-medium text-black disabled:opacity-40"
        >
          Kirim
        </button>
      </div>
    </div>
  );
}

function Ctx({ k, v, mono }: { k: string; v: string | null; mono?: boolean }) {
  return (
    <div>
      <div className="text-white/35">{k}</div>
      <div className={mono ? "font-mono text-white/80" : "text-white/80"}>{v ?? "—"}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @sneakervault/web type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/feedback/feedback-detail.tsx
git commit -m "feat(feedback): detail view with auto-context, screenshots, thread, status"
```

---

## Task 11: Feedback page (list/board + detail routing)

**Files:**
- Create: `apps/web/src/app/(dashboard)/feedback/page.tsx`

- [ ] **Step 1: Write the page** — server component. Lists reports (RLS-scoped); clicking `?id=` shows the detail. Computes `isOwner` from session.

```tsx
import { getCurrentUserCached } from "@/lib/auth-session";
import { listFeedback, getFeedback } from "@/lib/queries/feedback";
import { FeedbackDetail } from "@/components/feedback/feedback-detail";
import Link from "next/link";

const SEV_BADGE: Record<string, string> = {
  blocker: "bg-red-500/20 text-red-300",
  mengganggu: "bg-amber-500/20 text-amber-200",
  minor: "bg-emerald-500/20 text-emerald-200",
};
const STATUS_BADGE: Record<string, string> = {
  baru: "bg-sky-500/20 text-sky-200",
  diproses: "bg-amber-500/20 text-amber-200",
  selesai: "bg-emerald-500/20 text-emerald-200",
  ditolak: "bg-white/10 text-white/50",
};

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const profile = await getCurrentUserCached();
  const isOwner = (profile?.roles ?? []).includes("owner");

  if (id) {
    const detail = await getFeedback(id);
    if (!detail) {
      return <div className="p-6 text-white/60">Laporan tidak ditemukan atau tidak punya akses.</div>;
    }
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Link href="/feedback" className="mb-4 inline-block text-sm text-white/50 hover:text-white/80">
          ← Semua laporan
        </Link>
        <FeedbackDetail
          report={detail.report}
          comments={detail.comments}
          attachments={detail.attachments}
          isOwner={isOwner}
        />
      </div>
    );
  }

  const reports = await listFeedback();
  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-xl font-semibold text-white">Feedback UAT</h1>
      <p className="mb-5 text-sm text-white/50">
        {isOwner ? "Semua laporan dari tester." : "Laporan yang kamu kirim."}
      </p>
      <div className="flex flex-col gap-2">
        {reports.length === 0 && <p className="text-white/40">Belum ada laporan.</p>}
        {reports.map((r) => (
          <Link
            key={r.id}
            href={`/feedback?id=${r.id}`}
            className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 hover:border-white/15"
          >
            <span className="font-mono text-xs text-white/35">{r.report_no}</span>
            <span className="flex-1 truncate text-sm text-white/85">{r.title}</span>
            <span className={`rounded px-2 py-0.5 text-[11px] ${SEV_BADGE[r.severity] ?? ""}`}>
              {r.severity}
            </span>
            <span className={`rounded px-2 py-0.5 text-[11px] ${STATUS_BADGE[r.status] ?? ""}`}>
              {r.status}
            </span>
            {isOwner && (
              <span className="hidden font-mono text-[11px] text-white/35 sm:inline">
                {r.reporter_role} · {r.page_path}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @sneakervault/web type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/feedback/page.tsx"
git commit -m "feat(feedback): list/board page + detail routing"
```

---

## Task 12: Sidebar menu item + owner signal

**Files:**
- Modify: `apps/web/src/components/dashboard/sidebar.tsx`
- Modify: `apps/web/src/lib/sidebar-signals.ts`

- [ ] **Step 1: Add sidebar menu item** — locate the nav groups in `sidebar.tsx` (grep for an existing item like `"/panduan"` or `"/activity-log"`). Add an item for all roles in a sensible group (near Panduan/Bantuan). Match the existing item shape exactly; example shape:

```tsx
{ href: "/feedback", label: "Feedback UAT", icon: MessageSquarePlus, roles: ["owner", "finance", "admin_gudang", "admin_online", "shopkeeper"] },
```
Add `MessageSquarePlus` to the existing `lucide-react` import in that file.
> Use the same property names the file already uses for items (e.g. it may be `label`/`title`, `roles`/`allow`). Copy an adjacent item's shape; do not invent fields.

- [ ] **Step 2: Add owner signal** — in `sidebar-signals.ts`, inside `getSidebarSignals`, append a job (owner only) counting new reports:

```typescript
  if (has("owner")) {
    jobs.push(
      headCount(() =>
        supabase.from("feedback_reports").select("id", { count: "exact", head: true }).eq("status", "baru"),
      ).then((c) => mark("/feedback", true, c)),
    );
  }
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @sneakervault/web type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/dashboard/sidebar.tsx apps/web/src/lib/sidebar-signals.ts
git commit -m "feat(feedback): sidebar entry + owner new-report signal"
```

---

## Task 13: End-to-end verification + artifact + env docs

**Files:**
- Create: `artifacts/035-uat-feedback-module/status.md`
- Modify: `docs/PROJECT-GUIDE.md` (env section) — document `NEXT_PUBLIC_UAT_MODE`

- [ ] **Step 1: Full build gate**

Run:
```bash
pnpm --filter @sneakervault/web type-check
pnpm --filter @sneakervault/web lint
NEXT_PUBLIC_UAT_MODE=true pnpm --filter @sneakervault/web build
```
Expected: all PASS.

- [ ] **Step 2: MCP RLS smoke check** — confirm an inserted report is visible to owner and report-number generation works:
```sql
-- as a sanity check only (run via MCP execute_sql):
insert into feedback_reports (report_no, title, description, severity, created_by)
values (public.generate_feedback_number(), 'smoke', 'smoke test', 'minor',
        (select id from auth.users limit 1));
select report_no, status from feedback_reports where title = 'smoke';
delete from feedback_reports where title = 'smoke';
```
Expected: row inserts with `UAT-000x`, status `baru`; cleanup succeeds.

- [ ] **Step 3: Manual walkthrough** (dev server with `NEXT_PUBLIC_UAT_MODE=true`):
  1. Login owner → FAB visible bottom-right.
  2. Navigate to `/penjualan/pos` → click FAB → page field prefilled `/penjualan/pos`.
  3. Submit with a screenshot → appears in `/feedback` list with correct auto-context.
  4. Open detail → screenshot loads (signed URL), auto-context block correct, app_version shown.
  5. Change status `baru → diproses → selesai` → badge updates; sidebar `/feedback` dot clears once no `baru` remains.
  6. Add a comment → appears in thread.
  7. (If a non-owner account exists) login as that role → sees only own reports; cannot change status.

- [ ] **Step 4: Write artifact** `artifacts/035-uat-feedback-module/status.md`:

```markdown
# UAT Feedback Module

**Status:** [x] Done
**Sprint:** Post-MVP / UAT enablement
**Tanggal Mulai:** 2026-06-13
**Tanggal Selesai:** 2026-06-13

## Tasks
- [x] Tabel + RLS + RPC + bucket privat
- [x] Server actions create/comment/triage + signed URL
- [x] FAB auto-context + form upload + papan + detail + thread
- [x] Sidebar entry + owner signal + UAT_MODE gate

## Files Modified
- (list created/modified files from this plan)

## Notes
- `NEXT_PUBLIC_UAT_MODE=true` mengaktifkan FAB + menu. Matikan pasca go-live.
- `reporter_role` = effective role (mengikuti chip "Lihat sebagai").
```

- [ ] **Step 5: Document env** — under `docs/PROJECT-GUIDE.md` env list, add `NEXT_PUBLIC_UAT_MODE` (`true` saat UAT, kosong/`false` setelah live) and note `NEXT_PUBLIC_APP_VERSION` is auto from git SHA.

- [ ] **Step 6: Commit**

```bash
git add artifacts/035-uat-feedback-module/status.md docs/PROJECT-GUIDE.md
git commit -m "docs(feedback): artifact + UAT_MODE env documentation"
```

---

## Self-Review Notes (author)

- **Spec coverage:** §3 tables → Task 1; bucket → Task 2; types/schemas → Task 3; app_version → Task 4; backend actions → Task 5; queries → Task 6; permissions → Task 7; form → Task 8; FAB+layout → Task 9; detail+thread+status → Task 10; page/board → Task 11; sidebar+signal → Task 12; env/verify/acceptance → Task 13. All §2 decisions reflected (effective role server-side, owner-only triage, private bucket, UAT_MODE).
- **Type consistency:** action names (`createFeedback`, `addFeedbackComment`, `updateFeedbackStatus`, `getFeedbackScreenshotUrl`), schema names (`feedbackInputSchema`, `feedbackCommentSchema`, `feedbackStatusSchema`), and types (`FeedbackSeverity`, `FeedbackStatus`) are identical across tasks.
- **Known follow-ups flagged inline:** browser supabase client export name (Task 8) and sidebar item shape (Task 12) must be matched against existing code via grep — explicitly noted, not assumed.
```
