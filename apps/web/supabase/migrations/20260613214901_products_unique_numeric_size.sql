DROP INDEX IF EXISTS public.idx_products_sku_size;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_sizenum
  ON public.products (sku, round(size, 2));
