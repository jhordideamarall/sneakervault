-- Preserve free-text shoe sizes on manual/new-product PO lines.
--
-- `new_size` remains numeric for legacy flows. `new_size_label` keeps values
-- like "42 2/3" so Pre Order demand can become Pembelian Barang without
-- losing the customer-facing size format.

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS new_size_label text;

UPDATE public.purchase_order_lines
SET new_size_label = btrim(to_char(new_size, 'FM999999990.######'))
WHERE new_size_label IS NULL
  AND new_size IS NOT NULL;

COMMENT ON COLUMN public.purchase_order_lines.new_size_label IS
  'Free-text size label for manual/new-product PO lines, e.g. 42, 42.5, or 42 2/3.';
