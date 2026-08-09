-- Anti-dobel berbasis NUMERIK, samakan dengan aturan match app (round(size,2)).
-- Sebelumnya unik (sku, size_label) berbasis TEKS → "42 2/3" & "42.67" (label beda,
-- ukuran sama) bisa dobel untuk SKU sama. Pindah ke (sku, round(size,2)) supaya
-- keunikan DB = identitas produk sebenarnya (colorway + ukuran). size_label tetap
-- untuk display. (Temuan review Codex HIGH #1.)
DROP INDEX IF EXISTS public.idx_products_sku_size;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_sizenum
  ON public.products (sku, round(size, 2));
