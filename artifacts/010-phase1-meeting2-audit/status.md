# Artifact 010 — Phase 1 Meeting 2 Deep Audit & Remediation

**Tanggal:** 2026-05-11
**Scope:** Phase 1 Meeting 2 implementation (DB, shared package, server actions, UI, permissions, realtime notif)
**Status:** ✅ CLOSED — semua temuan kritikal sudah di-remediasi; build passes clean.

---

## 1. Metodologi Audit

Audit dilakukan berlapis:

| Lapisan | Metode |
|---|---|
| Database schema & RLS | Review migrasi `20260511180000_phase1_enums.sql` + `20260511180100_phase1_meeting2.sql` line-by-line |
| Shared package | Inspect `types.ts`, `constants.ts`, `validators.ts` untuk kelengkapan Phase 1 |
| Server actions | Trace role-gating (`requireRole`), error handling, audit logging pada `products.ts` + `notify.ts` |
| Permissions | Verify `routePermissions`, field-level helpers (`canSeeHpp`, `canEditPrice`, `canChangeProductCondition`) |
| UI konsistensi tema | Grep untuk leftover light-theme classes (`bg-white`, `text-[#1a1a2e]`, `border-[#e5e7eb]`) |
| Type safety | `npx tsc --noEmit` pada `apps/web` |
| Build | `npx turbo build --filter=@sneakervault/web` |

---

## 2. Temuan

### 2.1 LULUS (tidak perlu perubahan)

| Komponen | Status | Catatan |
|---|---|---|
| DB migration `phase1_enums` | ✅ | `ALTER TYPE user_role ADD VALUE 'finance'` + `CREATE TYPE product_condition` benar |
| DB migration `phase1_meeting2` | ✅ | Dual-price, condition columns, history table, RPC semuanya sound |
| RLS `product_condition_history` | ✅ | SELECT authenticated, INSERT gudang/owner only |
| Fungsi `recalculate_hpp_by_sku` | ✅ | Weighted-average formula benar, post-increment-aware |
| Fungsi `search_products_fuzzy` | ✅ | pg_trgm + ILIKE fallback untuk barcode |
| Fungsi `update_product_condition` | ✅ | Atomic update + audit ke history table |
| Fungsi `recalculate_hpp_by_model` (legacy) | ✅ | Dibuat no-op + RAISE WARNING; tidak ada caller aktif lagi (grep: 0 matches di code) |
| `packages/shared/types.ts` | ✅ | `ProductCondition`, `PriceChannel`, `Role` extended dengan `finance` |
| `packages/shared/constants.ts` | ✅ | `PRODUCT_CONDITIONS`, `PLATFORM_PRICE_CHANNEL`, `PRICE_CHANNELS` |
| `packages/shared/validators.ts` | ✅ | `productInputSchema` + `productConditionInputSchema` lengkap dengan refinement |
| `actions/products.ts` → `updateProduct` | ✅ | Role-based field gating (owner/finance edit price, admin_gudang edit supplier denied) |
| `actions/products.ts` → `updateProductCondition` | ✅ | Pakai RPC, log activity, fire `product.condition_changed` notif |
| `actions/products.ts` → `searchProductsFuzzy` | ✅ | RPC-first, ILIKE fallback kalau pg_trgm belum ter-install |
| `actions/notify.ts` | ✅ | `product.condition_changed` + `product.aging_detected` di discriminated union, recipient roles, format message |
| `config/permissions.ts` | ✅ | `routePermissions` include finance; helper fn `canSeeHpp`, `canEditPrice`, `canChangeProductCondition`, `canSeeFinancialDashboard` |
| `components/dashboard/sidebar.tsx` | ✅ | Role-based menu filtering + `primaryMenuByRole.finance` |
| `components/inventory/condition-badge.tsx` | ✅ | Dark-theme tone (emerald/amber/red) |
| `components/inventory/condition-updater-modal.tsx` | ✅ | Dark-theme border/bg, benar validasi reason wajib saat non-normal |
| `components/inventory/edit-product-modal.tsx` | ✅ | Dark-theme, image URL field + thumbnail preview, role-gated price field |
| `components/dashboard/right-sidebar.tsx` | ✅ | Bell icon + realtime unread badge via channel `notif-badge:{userId}` |

### 2.2 MASALAH YANG DITEMUKAN

#### 🔴 F-01 — UI Theme Inconsistency di Inventory (KRITIKAL — UX)

**Severity:** HIGH (first impression bad — visual break jelas)

`inventory-client.tsx` pakai tema **light** (`bg-white`, `text-[#1a1a2e]`, `text-[#6b7280]`, `border-[#e5e7eb]`, `bg-gray-50`, `hover:bg-gray-50`) padahal seluruh aplikasi pakai tema **dark** (`bg-[#1F1F1E]`, `text-white/80`, `border-white/[0.06]`).

Dampak: user masuk dari sidebar gelap → halaman inventory putih terang → jarring visual break, reduce perceived quality.

**Repro:** buka `/inventory` — background putih, text hitam, border abu-abu muda; berbeda total dari `/overview`, `/workspace`, `/orders`.

#### 🟡 F-02 — BulkImportButton Mixed Theme

**Severity:** MEDIUM

Modal pop-over BulkImportButton pakai `Card` (sudah dark via UI package) tapi label button-nya hardcoded `bg-[#1a1a2e]` (dark-ish) dengan `border-[#e5e7eb]` (light border on error panel) — mismatch dengan parent.

#### 🟡 F-03 — Supabase Types Out of Date

**Severity:** MEDIUM (latent — build passes, tapi type drift)

`packages/supabase/src/types.ts` tidak include Phase 1 additions:

- Missing columns di `products` Row/Insert/Update: `price_offline`, `condition`, `defect_reason`, `condition_updated_at`, `condition_updated_by`
- Missing table: `product_condition_history`
- Missing enum: `product_condition` (di Enums + Constants mirror)
- Missing RPC: `recalculate_hpp_by_sku`, `search_products_fuzzy`, `update_product_condition`

Build masih passes karena komponen pakai type inline (`type Product = { ... }`) bukan `Database["public"]["Tables"]["products"]["Row"]`. Tapi kalau nanti ada developer lain yang pakai generated types untuk query baru, akan dapat type error / missing field autocomplete.

#### 🟢 F-04 — Legacy `recalculate_hpp_by_model` masih tercantum di types

**Severity:** LOW (no-op, tidak ada caller)

Fungsi di-downgrade jadi no-op + warning pada migrasi Phase 1 (anti-silent-regression). Grep konfirmasi 0 caller aktif di codebase. Aman tapi bisa bikin confusing jika ada developer baru.

#### 🟢 F-05 — ESLint Circular Structure Warning

**Severity:** LOW (pre-existing, bukan dari Phase 1)

Build menampilkan warning `Converting circular structure to JSON` pada `.eslintrc.json`. Tidak block build. Tidak terkait perubahan Phase 1.

---

## 3. Fixes Diterapkan

### 3.1 `apps/web/src/components/inventory/inventory-client.tsx` — rewrite full

- **Theme migration:** `bg-white` → `bg-[#262626]`, `text-[#1a1a2e]` → `text-white`, `text-[#6b7280]` → `text-white/50`, `border-[#e5e7eb]` → `border-white/[0.06]`, `bg-gray-50` → `bg-[#1f1f1f]`, `hover:bg-gray-50` → `hover:bg-white/[0.03]`
- **Tambahan UX:**
  - 4 summary tile di atas: Total stok / Siap jual / Defect / Lama tidak laku (warna semantic: default/emerald/red/amber) — at-a-glance status yang diminta meeting 2
  - Search bar dengan ikon `Search` Lucide (inline)
  - Model row: badge defect dengan count (`3 defect`), badge dormant dengan count, price range (`Rp 1.650.000 – Rp 1.800.000`)
  - Size detail: stok color-coded (≤2 = amber warning, 0 = muted), tabular-nums untuk alignment harga
  - Action buttons diperbesar target tap (h-7 px-2)
  - Fuzzy search hint saat aktif (`"samba white" ≈ "samba cloud white"`)
- **Konsistensi:** semua tombol pakai `Button` dari `@sneakervault/ui` (bukan raw `<button>` dengan custom classes)

### 3.2 `apps/web/src/components/inventory/bulk-import-button.tsx` — rewrite full

- Modal pop-over: `bg-black/60 backdrop-blur-sm` (proper overlay), click-outside untuk close
- Trigger button pakai `Upload` icon (Lucide) — meeting 2 bilang "barang masuk" jadi ikon upload lebih kontekstual daripada emoji 📂
- Error list box: `bg-black/20` + `text-amber-400` untuk row number → readable
- Template button + Pilih File dengan icon `Download` + `FileUp`

### 3.3 `packages/supabase/src/types.ts` — patch

Ditambahkan:

- `products` Row/Insert/Update: 5 kolom Phase 1
- `product_condition_history` table (Row/Insert/Update/Relationships)
- `Enums.product_condition: "normal" | "defect" | "dormant"`
- `Constants.public.Enums.product_condition: ["normal", "defect", "dormant"]`
- `Functions.recalculate_hpp_by_sku` signature
- `Functions.search_products_fuzzy` signature (dengan Returns shape lengkap)
- `Functions.update_product_condition` signature

**Catatan:** Regenerate via `supabase gen types typescript` direkomendasikan saat kredensial MCP sudah aktif — patch manual ini pengganti sementara supaya types.ts tidak drift dari DB.

### 3.4 Hal yang TIDAK disentuh (deliberate)

- `recalculate_hpp_by_model` no-op: biarkan sampai Phase 2 saat cleanup. Menghapus RPC bisa break migrasi chain kalau ada seed yang refer.
- ESLint circular structure: pre-existing, out of Phase 1 scope.

---

## 4. Verifikasi

### 4.1 Build

```bash
npx turbo build --filter=@sneakervault/web
```

**Hasil:** ✅ Exit 0, 18/18 static pages generated, inventory route 10.3 kB (up 0.88 kB karena UI lebih kaya — acceptable).

### 4.2 Typecheck

```bash
cd apps/web && npx tsc --noEmit
```

**Hasil:** ✅ Exit 0, 0 type errors.

### 4.3 Grep konfirmasi

```bash
grep -R "bg-white\b\|text-\[#1a1a2e\]\|text-\[#6b7280\]\|border-\[#e5e7eb\]" apps/web/src/components/inventory/
```

**Hasil:** ✅ 0 match. Semua `bg-white` tersisa adalah opacity overlay (`bg-white/[0.03]`, `bg-white/10`) yang merupakan pola dark-theme yang benar.

---

## 5. Alignment ke Meeting 2 — Re-checked

| Permintaan klien meeting 2 | Status | Buktinya |
|---|---|---|
| Dual-price online/offline, stok tunggal | ✅ | `products.sell_price` + `price_offline`, tampil jelas di size detail row |
| Stok aktif vs non-aktif (defect/dormant) | ✅ | `product_condition` enum + summary tile + badge dengan count |
| Defect bisa di-update kapan saja (bukan hanya saat inbound) | ✅ | `ConditionUpdaterModal` dipanggil dari size detail row, button "Status" |
| Foto produk di inventory | ✅ | `image_url` di group row + `EditProductModal` dengan URL input + live thumbnail preview |
| Pop-up/drop-down saat klik produk (tidak panjang ke bawah) | ✅ | `ModelGroupRow` collapse/expand per model — table size hanya muncul saat expanded |
| Search fleksibel ("samba white" ≈ "cloud white") | ✅ | `search_products_fuzzy` via pg_trgm, debounce 250 ms, hint UI saat aktif |
| HPP per SKU (bukan per brand/model) | ✅ | `recalculate_hpp_by_sku` RPC; `confirmInbound` sudah dikonversi |
| Role-based: finance lihat keuangan, admin_gudang lihat stok, tidak saling lihat | ✅ | `canSeeHpp` gating HPP column + `canEditPrice` gating price edit |
| Notifikasi tiap aktivitas ke owner | ✅ | `activity_logs` + `internal_messages` (is_system) + bell badge di right sidebar |
| Aging detection (barang tidak pernah keluar) | ✅ | `product.aging_detected` event registered (handler masih manual trigger — cron jadwal Phase 2) |

---

## 6. Data Migration Status

> ⚠️ **BELUM DIMIGRASIKAN.** Migrasi schema DDL sudah diterapkan ke Supabase (enum + kolom + function + RLS policy), tapi data produk aktual toko klien **belum diimport**.
>
> Data migration task (perlu dikerjakan terpisah, direkomendasikan via `BulkImportButton` di UI atau seed script):
>
> - Import produk existing dari spreadsheet/Accurate (stok, HPP, harga_online, harga_offline, barcode)
> - Setup akun karyawan (owner, admin_gudang, admin_online, shopkeeper, finance) + assign roles
> - Import barcode lama (client confirm di meeting 2: tidak perlu cetak ulang, tinggal scan barcode existing)
> - Supplier master data
>
> Ini masuk scope **Phase 5 (Parallel Run)** per `docs/meeting2-execution-plan.md`.

---

## 7. Kesimpulan

Phase 1 Meeting 2 **production-ready** dari sisi schema + logic + UI konsistensi. Semua temuan kritikal (UI light theme break, supabase type drift) sudah di-remediasi dan diverifikasi via build + typecheck.

Yang perlu dilakukan selanjutnya:

1. **Phase 2** — Purchase cycle (customers, PO, faktur pembelian, vendor payment) per `docs/meeting2-execution-plan.md` §4
2. **Cron/scheduler untuk aging detection** — agar `product.aging_detected` auto-fire (currently handler registered, trigger manual only)
3. **Data migration** (Phase 5 prep)
4. **Regenerate types.ts** dari Supabase begitu MCP credentials aktif — ganti patch manual di §3.3

---

## 8. File Modifikasi

```
apps/web/src/components/inventory/inventory-client.tsx       (rewrite, 817 lines)
apps/web/src/components/inventory/bulk-import-button.tsx     (rewrite, 194 lines)
packages/supabase/src/types.ts                               (patch: +5 cols, +1 table, +1 enum, +3 RPC sigs)
```

## 9. File Audit

```
artifacts/010-phase1-meeting2-audit/status.md                (dokumen ini)
```
