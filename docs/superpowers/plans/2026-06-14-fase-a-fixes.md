# Plan: Fix temuan review Codex (Fase A hardening)

> Executor: Codex (`codex exec`). Apply migration ke DB remote: dilakukan Claude via MCP setelah file ditulis.
> Branch: `feat/fase-a-uat-ux`. Jangan commit/push. Setelah selesai jalankan `pnpm --filter web build` dan pastikan hijau.

Konteks: 4 temuan dari review Codex atas Fase A. Semua MEDIUM/LOW. Kerjakan SEMUA. Ikuti instruksi persis (old→new). Jangan ubah hal lain.

---

## Fix 1 (MEDIUM) — RLS `marketplace_sku_map`: buang `admin_online` dari write

Buat file baru `apps/web/supabase/migrations/20260614130000_sku_map_role_finance.sql` dengan isi PERSIS:

```sql
-- Konsistensi #9: write marketplace_sku_map hanya owner + finance (bukan admin_online),
-- samakan dengan permissions.ts / RPC import_marketplace_order_atomic.
ALTER POLICY msm_insert_sales_roles ON public.marketplace_sku_map
  WITH CHECK ((select public.has_any_role(ARRAY['owner','finance']::user_role[])));

ALTER POLICY msm_update_sales_roles ON public.marketplace_sku_map
  USING ((select public.has_any_role(ARRAY['owner','finance']::user_role[])))
  WITH CHECK ((select public.has_any_role(ARRAY['owner','finance']::user_role[])));
```

---

## Fix 3 (MEDIUM) — `finance` tak boleh ubah `size_label` via `updateProduct`

File `apps/web/src/lib/actions/products.ts`, fungsi `updateProduct`. Saat ini ada blok gating peran. Cari baris:

```ts
  const isOwner = profile.roles?.includes("owner");
  const isFinance = profile.roles?.includes("finance");
  const canEditPrice = isOwner || isFinance;
```

Ganti menjadi (tambah `isAdminGudang`):

```ts
  const isOwner = profile.roles?.includes("owner");
  const isFinance = profile.roles?.includes("finance");
  const isAdminGudang = profile.roles?.includes("admin_gudang");
  const canEditPrice = isOwner || isFinance;
```

Lalu cari blok gating supplier:

```ts
  // Admin gudang cannot edit supplier (locked to owner/finance)
  if (!isOwner && !isFinance) {
    delete (patch as { default_supplier_id?: string | null }).default_supplier_id;
  }
```

Tepat SETELAH blok itu, tambahkan:

```ts
  // Size (size_label) hanya boleh diubah owner / admin_gudang (data operasional),
  // bukan finance — selaras dengan komentar "finance can edit prices only".
  if (!isOwner && !isAdminGudang) {
    delete (patch as { size_label?: string }).size_label;
  }
```

---

## Fix 4 (LOW) — generated type RPC `get_inventory_page` tambah `size_label`

File `packages/supabase/src/types.ts`. Cari blok return type fungsi `get_inventory_page` (Functions). Di dalam `Returns:` array, ada baris `size: number`. Tepat setelahnya tambahkan `size_label: string`. Contoh hasil:

```ts
          size: number
          size_label: string
```

(Hanya di entri Functions `get_inventory_page`. Jangan sentuh entri tabel `products` — sudah benar.)

---

## Fix 5 (LOW) — pencarian cakup `size_label`

### 5a. RPC `get_inventory_page` — tambah size_label ke filter search
Buat file baru `apps/web/supabase/migrations/20260614130100_inventory_search_size_label.sql` dengan isi PERSIS:

```sql
-- Search inventory juga cocokkan size_label (mis. cari "42 2/3").
CREATE OR REPLACE FUNCTION public.get_inventory_page(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, brand text, model text, sku text,
  size numeric, size_label text, color text, barcode text,
  quantity integer, hpp numeric, sell_price numeric, price_offline numeric,
  image_url text, condition product_condition, defect_reason text, is_active boolean,
  created_at timestamptz, first_inbound_at timestamptz, supplier_name text,
  total_sku bigint, total_models bigint, total_qty bigint,
  normal_qty bigint, defect_qty bigint, dormant_qty bigint
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
  WITH normalized AS (
    SELECT nullif(trim(coalesce(p_search, '')), '') AS q
  ),
  filtered AS (
    SELECT p.*
    FROM products p
    CROSS JOIN normalized n
    WHERE p.is_active = true
      AND (
        n.q IS NULL
        OR p.barcode ILIKE '%' || n.q || '%'
        OR (
          coalesce(p.brand, '') || ' ' ||
          coalesce(p.model, '') || ' ' ||
          coalesce(p.color, '') || ' ' ||
          coalesce(p.sku, '') || ' ' ||
          coalesce(p.size_label, '')
        ) ILIKE '%' || n.q || '%'
      )
  ),
  model_page AS (
    SELECT f.brand, f.model
    FROM filtered f
    GROUP BY f.brand, f.model
    ORDER BY f.brand, f.model
    LIMIT greatest(coalesce(p_limit, 50), 1)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  ),
  summary AS (
    SELECT
      count(*)::bigint AS total_sku,
      count(DISTINCT (f.brand, f.model))::bigint AS total_models,
      coalesce(sum(f.quantity), 0)::bigint AS total_qty,
      coalesce(sum(f.quantity) FILTER (WHERE f.condition = 'normal'), 0)::bigint AS normal_qty,
      coalesce(sum(f.quantity) FILTER (WHERE f.condition = 'defect'), 0)::bigint AS defect_qty,
      coalesce(sum(f.quantity) FILTER (WHERE f.condition = 'dormant'), 0)::bigint AS dormant_qty
    FROM filtered f
  )
  SELECT
    p.id, p.brand, p.model, p.sku,
    p.size, p.size_label, p.color, p.barcode,
    p.quantity, p.hpp, p.sell_price, p.price_offline,
    p.image_url, p.condition, p.defect_reason, p.is_active,
    p.created_at, p.first_inbound_at, s.name AS supplier_name,
    summary.total_sku, summary.total_models, summary.total_qty,
    summary.normal_qty, summary.defect_qty, summary.dormant_qty
  FROM filtered p
  JOIN model_page mp ON mp.brand = p.brand AND mp.model = p.model
  LEFT JOIN suppliers s ON s.id = p.default_supplier_id
  CROSS JOIN summary
  ORDER BY p.brand, p.model, p.size;
$$;

GRANT EXECUTE ON FUNCTION public.get_inventory_page(text, integer, integer) TO authenticated;
```

### 5b. Legacy query fallback — tambah size_label ke `.or(...)`
File `apps/web/src/lib/queries/index.ts`, fungsi `getInventoryProductsLegacy`. Cari:

```ts
      query = query.or(
        `brand.ilike.%${search}%,model.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%,color.ilike.%${search}%`,
      );
```

Ganti string-nya menjadi (tambah `size_label.ilike` di akhir):

```ts
      query = query.or(
        `brand.ilike.%${search}%,model.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%,color.ilike.%${search}%,size_label.ilike.%${search}%`,
      );
```

---

## Verifikasi (wajib sebelum selesai)
1. `pnpm --filter web build` → harus hijau.
2. Laporkan file yang diubah/dibuat. JANGAN apply migration ke DB (Claude yang apply via MCP).
3. JANGAN commit / push.

## Catatan
- #2 (size pecahan jalur marketplace) TIDAK dikerjakan di sini — sengaja ditunda ke Fase B (jalur fallback marketplace akan dihapus). Lihat `artifacts/036-fase-a-uat-ux/status.md`.
