# Audit & Plan: Mail/Pesan sebagai Sistem Notifikasi Terintegrasi

**Tanggal Audit:** 2026-05-11
**Auditor:** Claude (sekarang dengan akses DB live via Supabase MCP `supabase-sneaker`)
**Status:** Phase 1 ✅ | Phase 2 ✅ | Phase 3 ✅ | Phase 4 ✅ — **ALL DONE**

---

## 0. Owner Decisions (Confirmed)

| # | Pertanyaan | Jawaban Final |
|---|---|---|
| Q1 | Manual chat permission | All-to-all DAN role-based — siapa pun bisa chat siapa pun, staff punya thread masing-masing |
| Q2 | Threshold stok rendah | Global, default `qty < 3`. Notif **broadcast ke SEMUA karyawan** (bukan owner saja) |
| Q3 | Notif sistem immutable | YES — tidak bisa dihapus user, hanya is_read yang boleh berubah |
| Q4 | Setiap event ada notif | YES — itu yang memicu chat antar karyawan-owner |
| Q5 | Max attachment | **10 MB** per file, MIME whitelist (image + PDF), retention 180 hari |
| Q6 | Email/push notif | NANTI di masa depan — in-app only di MVP |

---

## 0.1 Phase 1 Execution Log (2026-05-11)

✅ **DB drift di-fix** — 3 remote chat migrations di-pull ke local:
- `apps/web/supabase/migrations/20260510170032_internal_mail_presence.sql`
- `apps/web/supabase/migrations/20260510175718_refine_chat_schema.sql`
- `apps/web/supabase/migrations/20260510180616_setup_chat_storage.sql`

✅ **Migration hardening baru applied** (live + local):
`apps/web/supabase/migrations/20260511020000_mail_notification_hardening.sql`

Yang ditambahkan:
- Kolom `is_system BOOLEAN NOT NULL DEFAULT false` di `internal_messages`
- INSERT policy diperketat: `is_system=true` di-block dari client
- Guard trigger `trg_guard_internal_messages_update`: hanya `is_read` yang boleh berubah lewat UPDATE
- 4 indeks baru: `idx_internal_messages_related`, `idx_internal_messages_conversation`, `idx_internal_messages_metadata` (GIN), `idx_internal_messages_is_system_receiver`
- Tabel `app_settings` (key/value JSONB) dengan 5 default keys: `low_stock_threshold=3`, `chat_attachment_max_size_mb=10`, `chat_attachment_retention_days=180`, `notification_debounce_seconds=60`, `chat_rate_limit_per_minute=30`
- Tabel `notification_preferences` (per-user mute/digest)
- Storage bucket `chat-attachments`: file_size_limit = 10 MB, allowed_mime_types = 8 jenis (PNG, JPG/JPEG, GIF, WEBP, HEIC, HEIF, PDF)
- Storage SELECT policy diperketat: `TO authenticated` (fix advisor warning broad listing)
- Storage INSERT policy diperketat: harus upload ke folder `auth.uid()/...` (path enforcement)
- Function `set_updated_at()` diberi `SET search_path = public` (fix advisor `function_search_path_mutable`)
- Helper SECURITY DEFINER `create_system_notification(...)` — hanya bisa dipanggil oleh `service_role` (server actions)

✅ **Types regenerated** dari live DB → `packages/supabase/src/types.ts`. Sekarang ada:
- `internal_messages.is_system`, `attachment_urls`, `parent_id`, `metadata` ✅
- `app_settings`, `notification_preferences` table types ✅
- `create_system_notification` function signature ✅

✅ **Type-check fix**: `use-inbox.ts` optimistic message ditambah `is_system: false`.

⚠️ **Pre-existing type errors** di `mail-global-dialog.tsx` (8 errors di file uploads + Avatar size) — bukan dari Phase 1, akan diselesaikan di Phase 3 UI refinement.

---

## 0.2 Phase 2 Execution Log (2026-05-11)

✅ **Service-role client** ditambah di `packages/supabase/src/service.ts`, di-export sebagai `createServiceClient`. Butuh env `SUPABASE_SERVICE_ROLE_KEY`.

✅ **Central notify helper** dibuat di `apps/web/src/lib/actions/notify.ts`:
- Discriminated union `NotifyEvent` dengan 11 event types
- `notifyEvent()` — entry utama, non-blocking (try/catch internal, tidak crash parent action)
- `checkLowStockAndNotify()` — auto-fire `low_stock.warning` setelah outbound scan
- Recipient resolver via permission matrix existing
- Special cases: `low_stock` broadcast ke semua karyawan, `delete_request.reviewed` ke requester saja
- Honor `notification_preferences.muted_event_types` per user
- Parallel insert via `Promise.all` ke service-role RPC `create_system_notification`
- Pesan dalam Bahasa Indonesia, format ringkas

✅ **Hook ke 5 server action**:
| File | Event(s) | Recipients |
|---|---|---|
| `outbound.ts` createPackingSession | `packing.created` | Owner |
| `outbound.ts` scanPackingItem | `low_stock.warning` (conditional) | All karyawan |
| `status.ts` updateSessionStatus | `packing.shipped` / `.completed` / `.has_return` | Owner + Admin Online (+ Admin Gudang utk has_return) |
| `returns.ts` initiateReturn | `return.initiated` | Owner + Admin Gudang |
| `returns.ts` verifyReturn | `return.verified` | Owner + Admin Online |
| `returns.ts` processReturn | `return.processed` | Owner |
| `inbound.ts` confirmInbound | `inbound.batch_received` | Owner |
| `admin.ts` requestDelete | `delete_request.submitted` | Owner |
| `admin.ts` approveDelete / rejectDelete | `delete_request.reviewed` | Requester |

✅ **Smoke test live**: panggil `create_system_notification` RPC → row terbuat dengan `is_system=true`, `metadata.event_type` benar, `related_entity_type` linked. Test row di-cleanup.

✅ **Type-check**: semua Phase 2 file (notify.ts + 5 server actions) lulus tanpa error baru. Sisa errors hanya pre-existing di `mail-global-dialog.tsx` (Phase 3 scope).

⚠️ **Catatan**: Notif fire **after** mutation berhasil. Kalau service_role key belum di-set di env, `notifyEvent()` akan log error tapi tidak crash parent action — server action utama tetap success. **Pastikan `SUPABASE_SERVICE_ROLE_KEY` ter-set** di `.env.local` & deployment env (Vercel) untuk notif berjalan.

---

---

## 1. Tujuan Fitur (Visi Owner)

Mail/pesan bukan sekadar chat antar user — ia menjadi **inbox terpusat untuk notifikasi semua aktivitas operasional**:

- Setiap event (packing baru, return, stok rendah, dll) menghasilkan **notification message** otomatis ke pihak yang relevan
- Owner / role terkait bisa membuka mail dialog → melihat notif → langsung **balas/chat tentang item itu**
- Pesan terhubung ke entitas asalnya (`related_entity_id` + `related_entity_type`) sehingga klik notifikasi → drill-down ke item

**Use case nyata:**
> Shopkeeper Agus mulai sesi packing untuk order Shopee #7829. Sistem auto-kirim pesan ke Owner: *"Sesi packing baru #pks-abc123 dimulai untuk Shopee #7829, 3 item."* Owner buka mail, klik notif → bisa langsung balas ke Agus *"Pastikan Nike Dunk-nya kemasan double bubble ya"*.

---

## 2. Audit State Saat Ini

### 2.1 Apa yang SUDAH ada di codebase

| Komponen | Lokasi | Catatan |
|---|---|---|
| Tabel `internal_messages` | DB (live) — sesuai `packages/supabase/src/types.ts` | Sudah punya kolom `related_entity_id` + `related_entity_type`. Idealnya untuk notification linking. |
| `useInbox` hook | `apps/web/src/lib/use-inbox.ts` | Realtime subscription, optimistic send, parent threading, attachments |
| `usePresence` hook | `apps/web/src/lib/use-presence.ts` | Track online users via Supabase Presence channel |
| Mail UI (dialog) | `apps/web/src/components/dashboard/mail/mail-global-dialog.tsx` | Apple-style entrance, emoji picker, threading, file upload |
| Mail popover | `apps/web/src/components/dashboard/mail/mail-inbox.tsx` | Top-right preview |
| Storage bucket `chat-attachments` | Supabase live | Belum ada cleanup policy |
| Seed data | `scripts/seed-chat-history.sql` | Demo conversation antar role |
| `logActivity()` helper | `apps/web/src/lib/actions/activity-log.ts` | Sudah dipanggil dari inbound, outbound, returns, admin |
| Sprint history | `artifacts/007-chat-refinement/status.md` | Done 2026-05-11 |

### 2.2 SYNC GAPS — KRITIS

**Ini yang harus dibereskan supaya semuanya selaras:**

| # | Gap | Impact | Severity |
|---|---|---|---|
| G1 | **Tidak ada migration file** untuk `internal_messages` di `apps/web/supabase/migrations/` | Reset DB / fresh install akan gagal — table tidak ada. Drift antara local & deployment. | 🔴 CRITICAL |
| G2 | **`packages/supabase/src/types.ts` stale** — tidak punya kolom `attachment_urls`, `parent_id`, `metadata` | Code di `use-inbox.ts` pakai field yang tidak ada di types → cast `as any` berbahaya, type-check tidak detect bug | 🔴 CRITICAL |
| G3 | **`docs/architecture.md` ERD tidak punya `internal_messages`** | Onboarding developer baru bingung. Audit kontraktor tidak lihat full picture. | 🟡 HIGH |
| G4 | **`docs/prd.md` tidak menyebut F-Mail / F-Notification** | Scope tidak terdokumentasi → potensi dispute saat client review | 🟡 HIGH |
| G5 | **Tidak ada RLS policy untuk `internal_messages`** (asumsi — perlu verifikasi di DB live) | Tanpa RLS user bisa baca pesan orang lain → **data leak antar staf** | 🔴 CRITICAL (security) |
| G6 | **Tidak ada server action `sendMessage`** terpisah — semua via client SDK | Tidak bisa hook ke `logActivity()`, tidak bisa enforce business rules server-side | 🟡 MEDIUM |
| G7 | **Tidak ada notification trigger** — `logActivity()` dipanggil tapi tidak ada yang generate `internal_messages` dari activity | Visi "setiap aktivitas → notif" belum diimplementasi sama sekali | 🔴 CRITICAL (visi user) |
| G8 | **Tidak ada cleanup policy** untuk `chat-attachments` bucket | Storage cost naik tanpa batas | 🟡 MEDIUM |
| G9 | **Mail dialog hardcoded `w-[1000px] h-[700px]`** — tidak responsive | Rusak di HP shopkeeper di gudang (PRD NF04 violation) | 🟡 MEDIUM |
| G10 | **Tidak ada permission rule** "siapa boleh chat siapa" | Saat ini all-to-all? Owner-only? Tidak terdefinisi | 🟢 LOW (perlu keputusan owner) |

---

## 3. Mapping ke PRD & Architecture

### 3.1 Konsistensi dengan prinsip client (PRD §7.3)

| Hard Rule Client | Apakah mail-as-notif comply? |
|---|---|
| "Simpel, enggak ribet" | ✅ Notif otomatis = lebih simpel daripada owner harus buka activity log manual |
| "Max 2 klik untuk aksi utama" | ✅ Buka mail (`m`) → klik notif → action |
| "Halaman load < 2 detik" | ⚠️ Realtime subscription perlu monitoring; jangan auto-load semua history |
| "Mobile-friendly" (NF04) | ❌ Saat ini dialog tidak responsive — perlu fix |
| "Bahasa Indonesia di UI" | ✅ Sudah |
| "Zero training needed" | ⚠️ Shortcut `m` perlu hint visual (badge/tooltip) |
| "Feedback instan" | ✅ Optimistic send sudah ada |

### 3.2 Konsistensi dengan Anti-Fraud (PRD §3.5)

> "Semua aktivitas tercatat di Activity Log: siapa login kapan, siapa scan apa, siapa ubah status apa..."

**Aturan baru yang perlu diputuskan:**
- ✅ `activity_logs` tetap source of truth — tidak boleh hilang
- ✅ `internal_messages` notification adalah **derivative** dari activity_log (bisa di-regenerate)
- ❌ Pesan **personal** (chat balasan owner ke staff) **TIDAK** masuk activity_logs (privacy + noise)
- ✅ Notification messages yang auto-generated bisa juga di-log ke activity_logs sebagai action `notification_sent` (opsional, untuk audit lengkap)

---

## 4. Desain Integrasi Mail-as-Notification

### 4.1 Arsitektur

```
┌─────────────────────────────────────────────────────────┐
│                    USER ACTION                           │
│  (Shopkeeper scan keluar, Admin verify return, dll)      │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│               SERVER ACTION (existing)                    │
│  - mutate state (stock, packing_session, return, dll)    │
│  - logActivity(...)  ← SUDAH ADA                          │
│  - notifyEvent(...)  ← BARU — kirim notif msg              │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
┌──────────────────┐          ┌──────────────────────┐
│  activity_logs   │          │  internal_messages   │
│  (immutable)     │          │  (notification +     │
│  - source truth  │          │   conversational)    │
└──────────────────┘          └──────────────────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │  Realtime sub    │
                              │  → Mail dialog   │
                              └──────────────────┘
```

### 4.2 Pemanfaatan kolom `related_entity_id` + `related_entity_type`

Skema sudah punya kolom ini — **manfaatkan**:

| Event | `related_entity_type` | `related_entity_id` | Receiver |
|---|---|---|---|
| Sesi packing baru dimulai | `packing_session` | `packing_session.id` | Owner |
| Status `dikirim` → `selesai` | `packing_session` | `packing_session.id` | Owner |
| Return diinisiasi | `return` | `return.id` | Owner + Admin Gudang |
| Return diverifikasi fisik | `return` | `return.id` | Owner + Admin Online |
| Stok rendah (qty < threshold) | `product` | `product.id` | Owner + Admin Gudang |
| Delete request submitted | `delete_request` | `delete_request.id` | Owner |
| Delete request approved/rejected | `delete_request` | `delete_request.id` | Requester |
| Batch baru masuk + HPP recalc | `purchase_batch` | `purchase_batch.id` | Owner |

UI mail bubble bisa render **rich card** untuk message yang punya `related_entity_*` — ada tombol "Buka detail" yang deep-link ke halaman terkait (e.g., `/orders/{packing_session_id}`).

### 4.3 Aturan Penerima Notifikasi (Permission Matrix Notif)

Mengikuti permission matrix existing (PRD §2.2):

| Event | Owner | Admin Gudang | Admin Online | Shopkeeper |
|---|:---:|:---:|:---:|:---:|
| Packing session created | ✅ | — | — | — |
| Status: packing → shipped | ✅ | — | ✅ | — |
| Status: shipped → completed | ✅ | — | — | — |
| Return initiated | ✅ | ✅ | — | — |
| Return verified | ✅ | — | ✅ | — |
| Stok rendah | ✅ | ✅ | — | — |
| Delete request | ✅ (semua), Requester (status) | — | — | — |
| Batch masuk + HPP | ✅ | — | — | — |
| Manual chat | ✅ all-to-all | ✅ | ✅ | ✅ |

### 4.4 Skema `internal_messages` Final (yang harus jadi truth)

```sql
CREATE TABLE internal_messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id             UUID NOT NULL REFERENCES profiles(id),
  receiver_id           UUID NOT NULL REFERENCES profiles(id),
  subject               TEXT,
  content               TEXT NOT NULL,
  parent_id             UUID REFERENCES internal_messages(id) ON DELETE SET NULL,
  attachment_urls       TEXT[] DEFAULT ARRAY[]::TEXT[],
  related_entity_type   TEXT,  -- 'packing_session' | 'return' | 'product' | 'delete_request' | 'purchase_batch' | NULL
  related_entity_id     UUID,
  is_read               BOOLEAN DEFAULT false,
  metadata              JSONB DEFAULT '{}'::JSONB,  -- e.g. { event_type: 'packing.created', auto_generated: true }
  is_system             BOOLEAN DEFAULT false,  -- TRUE jika notif otomatis dari sistem
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_receiver_unread ON internal_messages(receiver_id, is_read, created_at DESC);
CREATE INDEX idx_messages_thread ON internal_messages(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_messages_related ON internal_messages(related_entity_type, related_entity_id) WHERE related_entity_id IS NOT NULL;
CREATE INDEX idx_messages_conversation ON internal_messages(sender_id, receiver_id, created_at DESC);
```

**Field tambahan dibanding state saat ini:**
- `is_system` — flag untuk render bubble berbeda di UI (notif vs chat manual)
- `metadata.event_type` — untuk filter/grouping (mis. "tampilkan hanya notifikasi packing")

### 4.5 RLS Policies (CRITICAL)

```sql
-- Read: hanya pesan yang melibatkan user
CREATE POLICY messages_select ON internal_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Insert: user hanya bisa kirim sebagai dirinya
CREATE POLICY messages_insert ON internal_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND is_system = false);

-- Update: hanya is_read yang boleh diupdate, dan hanya oleh receiver
CREATE POLICY messages_update_read ON internal_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- Delete: tidak diperbolehkan dari client
-- (System notif insert via service_role di server action)
```

### 4.6 Server-Side Helper

```typescript
// apps/web/src/lib/actions/notify.ts (BARU)
type NotifyEvent =
  | { type: 'packing.created'; sessionId: string; sessionInfo: {...} }
  | { type: 'packing.shipped'; sessionId: string }
  | { type: 'return.initiated'; returnId: string; reason: string }
  | { type: 'stock.low'; productId: string; qty: number }
  | ...;

export async function notifyEvent(event: NotifyEvent, opts?: { actorId: string }): Promise<void> {
  // 1. Tentukan recipients berdasarkan event type + permission matrix
  // 2. Compose message content (Bahasa Indonesia, ringkas)
  // 3. Insert ke internal_messages dengan is_system=true, related_entity_*, metadata.event_type
  // 4. Pakai service_role client agar bisa bypass RLS untuk system inserts
}
```

Kemudian di server actions existing (e.g., `outbound.ts`):

```typescript
// Setelah createPackingSession success:
await logActivity({ ... });
await notifyEvent({ type: 'packing.created', sessionId: data.id, sessionInfo: ... });
```

---

## 5. Plan Eksekusi (Bertahap)

### Phase 1 — Fix SYNC GAPS (Wajib sebelum apa-apa)
**Goal:** Codebase, types, dan dokumen selaras dengan DB live. Tidak ada drift.

| # | Task | File | Estimasi |
|---|---|---|---|
| 1.1 | Buat migration `20260511000000_internal_messages.sql` yang reflect schema live (CREATE TABLE + indexes + RLS) | `apps/web/supabase/migrations/` | 30m |
| 1.2 | Tambah migration `20260511000001_internal_messages_notif_extensions.sql` (kolom `is_system`) | `apps/web/supabase/migrations/` | 10m |
| 1.3 | Regenerate types: `npx supabase gen types typescript --project-id <id> > packages/supabase/src/types.ts` | `packages/supabase/src/types.ts` | 5m |
| 1.4 | Update `docs/architecture.md` — tambah `internal_messages` ke ERD section §3.1, RLS ke §3.3, server action ke §5.1 | `docs/architecture.md` | 30m |
| 1.5 | Update `docs/prd.md` — tambah F-Mail (must-have) dan F-Notification (must-have) di §4.1, plus permission matrix entry di §2.2 | `docs/prd.md` | 30m |
| 1.6 | Tambah artifact folder `008-mail-notification-integration/status.md` | `artifacts/` | 5m |

### Phase 2 — Server-Side Notification Pipeline
**Goal:** Setiap event operasional menghasilkan notif otomatis.

| # | Task | File | Estimasi |
|---|---|---|---|
| 2.1 | Create `notify.ts` helper dengan event types & recipient resolver | `apps/web/src/lib/actions/notify.ts` | 1h |
| 2.2 | Hook ke `outbound.ts` — emit `packing.created`, `packing.shipped` | `apps/web/src/lib/actions/outbound.ts` | 30m |
| 2.3 | Hook ke `status.ts` — emit `packing.completed`, `packing.has_return` | `apps/web/src/lib/actions/status.ts` | 30m |
| 2.4 | Hook ke `returns.ts` — emit `return.initiated`, `return.verified`, `return.processed` | `apps/web/src/lib/actions/returns.ts` | 30m |
| 2.5 | Hook ke `inbound.ts` — emit `inbound.batch_received` (notif HPP recalc) | `apps/web/src/lib/actions/inbound.ts` | 20m |
| 2.6 | Hook ke `admin.ts` — emit `delete_request.submitted`, `delete_request.reviewed` | `apps/web/src/lib/actions/admin.ts` | 20m |
| 2.7 | Cron/trigger untuk stok rendah — daily check `stock.low` event | `apps/web/supabase/migrations/` (pg_cron) | 1h |

### Phase 3 — UI Enhancement (Notif vs Chat Visual)
**Goal:** Mail dialog membedakan notif sistem vs chat manual.

| # | Task | File | Estimasi |
|---|---|---|---|
| 3.1 | Render bubble berbeda jika `is_system=true` (icon event, format berbeda) | `mail-global-dialog.tsx` | 1h |
| 3.2 | Render rich card untuk message dengan `related_entity_*` — tombol "Buka detail" | `mail-global-dialog.tsx` | 1h |
| 3.3 | Tab/filter "Semua / Notifikasi / Chat" di sidebar mail | `mail-global-dialog.tsx` | 45m |
| 3.4 | Mobile responsive — `max-w-screen-md max-h-screen` + adaptive layout | `mail-global-dialog.tsx` | 1h |
| 3.5 | Hint visual "Tekan M" — badge atau onboarding tooltip pertama kali | `topbar.tsx` atau dedicated hint | 30m |
| 3.6 | Deep link handler — `?openMail=session_id` query param | `mail-global-dialog.tsx` | 30m |

### Phase 4 — Hardening
**Goal:** Production-ready, no security/cost surprise.

| # | Task | File | Estimasi |
|---|---|---|---|
| 4.1 | Verifikasi RLS policy aktual di DB live = sesuai §4.5 | DB query (manual) | 15m |
| 4.2 | Storage policy: max upload 5MB, allowed types (image/*, application/pdf) | Supabase Storage policy | 20m |
| 4.3 | Cleanup job: hapus attachment >90 hari tanpa referensi | pg_cron + storage API | 1h |
| 4.4 | Rate limit `sendMessage` — max 30 msg/menit per user (anti-spam) | Server action guard | 30m |
| 4.5 | Test: kirim 100 notif → page load tetap <2s (PRD NF01) | Manual + Lighthouse | 30m |

---

## 6. Keputusan yang Perlu Konfirmasi Owner

> **Sebelum eksekusi Phase 2 ke atas**, owner harus konfirmasi:

| # | Pertanyaan | Default jika tidak dijawab |
|---|---|---|
| Q1 | Apakah notif manual chat (bukan auto-system) boleh antar SEMUA role atau hanya role tertentu? | All-to-all (asumsi koordinasi internal) |
| Q2 | Threshold stok rendah berapa pcs? Per produk atau global? | Default: qty < 3 per product |
| Q3 | Notif sistem boleh dihapus user? | TIDAK (immutable seperti activity_log) |
| Q4 | Owner mau dapat notif untuk SETIAP packing atau hanya summary harian? | Setiap event (bisa di-mute per kategori nanti) |
| Q5 | Mail attachment boleh berapa MB max? | 5 MB |
| Q6 | Apakah notif perlu juga via email/push? | TIDAK (in-app only di MVP) |

---

## 7. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Spam notif overwhelm owner | Phase 5: filter & mute per category, digest mode |
| Realtime overhead saat banyak user | Index sudah ada; monitor via Supabase dashboard |
| Storage cost meledak | Phase 4.2 + 4.3 cleanup |
| Type drift terulang | Add CI step: `supabase gen types` + diff check |
| Migration drift terulang | Forbid direct DB edits, semua via migration file (rule di CLAUDE.md sudah ada) |

---

## 8. Definition of Done

Phase 1 done = ✅ ketika:
- [ ] `pnpm db:reset` berhasil rebuild DB lokal **identik** dengan production
- [ ] `tsc --noEmit` lulus tanpa cast `as any` di mail-related files
- [ ] `docs/prd.md` dan `docs/architecture.md` mencakup mail+notification

Phase 2 done = ✅ ketika:
- [ ] Buat sesi packing baru → owner langsung dapat notif di mail dialog (realtime <2s)
- [ ] Klik notif → buka detail order
- [ ] Owner balas notif → shopkeeper terima sebagai pesan threaded

Phase 3 done = ✅ ketika:
- [ ] Mobile usable (HP shopkeeper di gudang)
- [ ] Notif vs chat visual berbeda
- [ ] Tab filter berfungsi

Phase 4 done = ✅ ketika:
- [ ] RLS test: user A tidak bisa SELECT pesan user B
- [ ] Upload >5MB ditolak
- [ ] Cleanup job terjadwal

---

## 9. Referensi

- `docs/prd.md` §3.5 (Anti-Fraud), §7.3 (UX Hard Rules), §2.2 (Permission Matrix)
- `docs/architecture.md` §3 (DB Schema), §5 (API Flow)
- `artifacts/007-chat-refinement/status.md` (history sebelumnya)
- `apps/web/src/lib/use-inbox.ts` (current client logic)
- `packages/supabase/src/types.ts` (stale types — needs regen)

---

**Next action**: Owner review dokumen ini → konfirmasi Q1–Q6 → eksekusi Phase 1 untuk fix sync gap dulu sebelum lanjut ke notification pipeline.
