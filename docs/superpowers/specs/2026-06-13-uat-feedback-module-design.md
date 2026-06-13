# Spec: Modul Feedback UAT (in-app)

> **Status:** Draft untuk review
> **Tanggal:** 2026-06-13
> **Konteks:** Persiapan UAT client (Dewinst). Tujuan: feedback tester masuk
> terstruktur ke sistem (bukan screenshot ambigu via chat), lengkap dengan
> auto-context teknis + screenshot, supaya perbaikan bug tidak menebak-nebak.

---

## 1. Tujuan & Masalah yang Diselesaikan

Saat UAT, tester melaporkan masalah lewat screenshot/chat yang sering ambigu:
tidak jelas di halaman mana, login sebagai role apa, build mana. Akibatnya
eksekutor (developer/agent) harus tanya-jawab dulu sebelum bisa reproduce.

Modul ini menangkap laporan **langsung di dalam app** dengan dua lapis data:
- 🤖 **Auto-context** (diisi sistem): halaman, role efektif, waktu, browser, versi app.
- ✍️ **Manual** (diisi tester): judul, deskripsi/langkah, severity, screenshot.

Hasil: satu laporan cukup untuk reproduce tanpa klarifikasi tambahan.

**Bukan tujuan (out of scope):** issue tracker penuh (kanban drag, assignment ke
dev, notifikasi email, rich-text), integrasi Notion, analitik.

---

## 2. Keputusan Desain (sudah disepakati)

1. **Akses:** route `/feedback` terbuka untuk **semua 5 role**. Owner melihat
   SEMUA laporan; role lain hanya miliknya sendiri.
2. **Cara lapor:** tombol melayang ("FAB") "Lapor Masalah" di semua halaman
   dashboard → buka drawer form.
3. **Pengelolaan:** status (`baru → diproses → selesai → ditolak`) + thread komentar.
4. **Triage (ubah status):** **owner-only**. Komentar boleh dari pelapor + owner.
5. **`reporter_role` = EFFECTIVE role** (hasil chip "Lihat sebagai"), ditangkap
   **server-side** dari sesi → tidak bisa dipalsukan client. Walau UAT pakai 1
   akun owner + view-as, konteks role tetap berguna
   (mis. "owner melihat-sebagai shopkeeper di `/penjualan/pos`").
6. **Bucket screenshot privat** (`feedback-screenshots`) + signed URL — screenshot
   bisa memuat data finansial.
7. **Toggle pasca-UAT:** FAB & menu dikontrol env `NEXT_PUBLIC_UAT_MODE` agar bisa
   dimatikan setelah go-live tanpa hapus kode.

---

## 3. Data Model

### Enum baru
- `feedback_severity` = `blocker | mengganggu | minor`
- `feedback_status` = `baru | diproses | selesai | ditolak`

### `feedback_reports`
| kolom | tipe | sumber | catatan |
|---|---|---|---|
| id | uuid PK | - | |
| report_no | text unique | RPC `generate_feedback_number` | mis. `UAT-0001` |
| title | text NOT NULL | manual | |
| description | text NOT NULL | manual | langkah + hasil |
| severity | feedback_severity | manual | default `mengganggu` |
| status | feedback_status | sistem | default `baru` |
| page_path | text | auto (client) | mis. `/penjualan/pos` — **editable** sebelum submit |
| reporter_role | text | auto (server, effective role) | snapshot saat lapor |
| app_version | text | auto (server, `VERCEL_GIT_COMMIT_SHA`) | |
| user_agent | text | auto (client) | |
| viewport | text | auto (client) | mis. `1920x1080` |
| created_by | uuid | auth.uid() | |
| created_at / updated_at | timestamptz | sistem | |
| resolved_by | uuid NULL | owner | diisi saat status `selesai/ditolak` |
| resolved_at | timestamptz NULL | sistem | |

### `feedback_comments`
`id, report_id FK, body text NOT NULL, author_id uuid, created_at`

### `feedback_attachments`
`id, report_id FK NOT NULL, comment_id FK NULL, file_path text, file_name text,
created_by uuid, created_at`
→ screenshot bisa menempel di laporan awal (comment_id NULL) atau di komentar.

### Bucket storage
`feedback-screenshots` (privat). Path konvensi: `{user_id}/{report_id}/{uuid}-{nama}`.

---

## 4. RLS (pola `(select auth.uid())` / `(select has_any_role(...))`)

**`feedback_reports`**
- INSERT: `authenticated`, `WITH CHECK (created_by = (select auth.uid()))`.
- SELECT: `created_by = (select auth.uid()) OR (select has_any_role(ARRAY['owner']::user_role[]))`.
- UPDATE: hanya `(select has_any_role(ARRAY['owner']::user_role[]))` (triage).

**`feedback_comments`** & **`feedback_attachments`**
- SELECT/INSERT mengikuti visibilitas parent report (pelapor atau owner).
- Author/created_by = `(select auth.uid())`.

**Storage `feedback-screenshots`**
- INSERT: authenticated (path diawali `{auth.uid()}/`).
- SELECT: uploader atau owner (akses via signed URL dari server action).
- DELETE: uploader atau owner.

**RPC `generate_feedback_number`**: `revoke execute from anon, public` (ikut pola RPC lain).

---

## 5. Backend — `lib/actions/feedback.ts`

- `createFeedback(input, clientContext)` — input manual + `clientContext`
  (`page_path`, `user_agent`, `viewport`); server menambah `reporter_role`
  (effective dari `getCurrentUserCached`), `app_version`, `created_by`,
  `report_no` (RPC). Insert report + attachments. Panggil `logActivity`.
- `addFeedbackComment(reportId, body, attachments?)` — guard visibilitas.
- `updateFeedbackStatus(reportId, status)` — **owner-only**; set `resolved_by/at`
  bila `selesai/ditolak`. `logActivity`.
- `getFeedbackScreenshotUrl(path)` — signed URL (TTL pendek).

Query (`lib/queries`): `listFeedback(filters)` (owner: semua + filter
status/severity/role/page; lainnya: own), `getFeedback(id)` (report + komentar +
attachment).

---

## 6. Frontend

- `components/feedback/feedback-fab.tsx` — tombol melayang (client). Baca
  `usePathname()` + `window.navigator`/viewport untuk auto-context. Render hanya
  bila `NEXT_PUBLIC_UAT_MODE` aktif. Mount global di
  `app/(dashboard)/layout.tsx` (dekat `MailGlobalDialog`).
- `components/feedback/feedback-form.tsx` — judul, deskripsi, severity, upload
  screenshot (multi), field "Halaman" prefilled & editable.
- `app/(dashboard)/feedback/page.tsx` — daftar/papan. Owner: semua + filter +
  badge status/severity/role. Role lain: laporan sendiri.
- `components/feedback/feedback-detail.tsx` — detail + auto-context block +
  thread komentar + kontrol status (owner).
- `components/dashboard/sidebar.tsx` — item menu "Feedback UAT" (semua role, di
  bawah grup Bantuan/Panduan), titik signal untuk owner saat ada laporan `baru`
  (reuse `lib/sidebar-signals.ts`).
- `config/permissions.ts` — `'/feedback'`: kelima role.

---

## 7. Auto-context: pembagian client vs server

| Field | Ditangkap di | Alasan |
|---|---|---|
| page_path, user_agent, viewport | client | memang milik browser |
| reporter_role (effective) | server (sesi) | anti-spoof; ambil dari `getCurrentUserCached().roles` |
| app_version | server | dari env build |
| created_by, created_at, report_no | server | otoritatif |

---

## 8. Migrasi (file baru, additive + idempotent)

1. `{ts}_feedback_tables.sql` — 2 enum, 3 tabel, RLS, RPC `generate_feedback_number`,
   index FK (`report_id`, `comment_id`, `created_by`, `status`).
2. `{ts}_feedback_storage.sql` — bucket privat + policy (pola `product_photos_bucket.sql`).

> Verifikasi via MCP Supabase sebelum apply (riwayat migrasi divergen — cek objek
> dulu). Semua DDL additive & idempotent (`IF NOT EXISTS` / `ON CONFLICT`).

---

## 9. Env & Konfigurasi

- `NEXT_PUBLIC_UAT_MODE` (`true` saat UAT) — gate FAB & menu.
- `NEXT_PUBLIC_APP_VERSION` — diisi dari `VERCEL_GIT_COMMIT_SHA` via `next.config`
  (fallback `"dev"` lokal).

---

## 10. Verifikasi (acceptance)

1. **Build hijau** (`pnpm --filter @sneakervault/web type-check` + `build`).
2. Submit laporan (FAB) → tersimpan dengan auto-context benar (page, effective
   role via view-as, app_version, screenshot ter-upload).
3. **RLS:** non-owner hanya lihat laporan sendiri; owner lihat semua (uji via MCP
   atau sesi view-as).
4. Owner ubah status `baru→diproses→selesai`; `resolved_by/at` terisi.
5. Thread komentar dua arah + screenshot di komentar tampil (signed URL).
6. Signal titik owner muncul saat ada laporan `baru`, hilang setelah ditangani.
7. `NEXT_PUBLIC_UAT_MODE=false` → FAB & menu hilang, route tetap aman.

---

## 11. Risiko & Mitigasi

- **Bucket privat bocor lewat listing** → tidak ada broad SELECT policy; akses
  hanya via signed URL server (ikut catatan advisor Supabase).
- **FAB menutupi UI penting** → posisi pojok, z-index terkontrol, bisa dikecilkan.
- **Noise pasca go-live** → `NEXT_PUBLIC_UAT_MODE`.
- **1 akun owner saat UAT** → effective-role capture menjaga konteks tetap berguna;
  akun per-role opsional (dibuat di Pengaturan bila tim client ikut).
