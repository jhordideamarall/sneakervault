ALTER TABLE public.purchase_order_lines ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS new_brand text,
  ADD COLUMN IF NOT EXISTS new_model text,
  ADD COLUMN IF NOT EXISTS new_size  numeric,
  ADD COLUMN IF NOT EXISTS new_color text,
  ADD COLUMN IF NOT EXISTS new_sku   text;

COMMENT ON COLUMN public.purchase_order_lines.new_sku IS
  'For manual/new-product PO lines (product_id NULL): the product is created (or matched by SKU) on receive, then product_id is set.';
