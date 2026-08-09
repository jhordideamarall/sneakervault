-- Bring historical manual invoices into Master Pelanggan so the screen matches
-- what finance already sees in Invoice Penjualan. Marketplace-masked buyers and
-- generic walk-in labels intentionally remain snapshots only.

WITH manual_invoice_names AS (
  SELECT DISTINCT ON (lower(btrim(si.customer_name)))
    btrim(si.customer_name) AS name,
    si.channel
  FROM public.sales_invoices AS si
  WHERE si.customer_id IS NULL
    AND si.marketplace_order_id IS NULL
    AND NULLIF(btrim(si.customer_name), '') IS NOT NULL
    AND btrim(si.customer_name) !~ '\*'
    AND lower(btrim(si.customer_name)) NOT IN (
      'walk-in customer',
      'customer',
      'pelanggan',
      'marketplace customer',
      'shopee customer',
      'tiktok customer',
      'tokopedia customer',
      '-'
    )
  ORDER BY lower(btrim(si.customer_name)), si.created_at, si.id
)
INSERT INTO public.customers (
  name,
  channel,
  notes,
  is_active
)
SELECT
  candidate.name,
  candidate.channel,
  'Dibuat otomatis dari invoice manual sebelum fitur Master Pelanggan aktif',
  true
FROM manual_invoice_names AS candidate
WHERE NOT EXISTS (
  SELECT 1
  FROM public.customers AS customer
  WHERE lower(btrim(customer.name)) = lower(candidate.name)
);

UPDATE public.sales_invoices AS invoice
SET customer_id = (
  SELECT customer.id
  FROM public.customers AS customer
  WHERE lower(btrim(customer.name)) = lower(btrim(invoice.customer_name))
  ORDER BY customer.is_active DESC, customer.created_at, customer.id
  LIMIT 1
)
WHERE invoice.customer_id IS NULL
  AND invoice.marketplace_order_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.customers AS customer
    WHERE lower(btrim(customer.name)) = lower(btrim(invoice.customer_name))
  );

UPDATE public.customer_payments AS payment
SET customer_id = (
  SELECT customer.id
  FROM public.customers AS customer
  WHERE lower(btrim(customer.name)) = lower(btrim(payment.customer_name))
  ORDER BY customer.is_active DESC, customer.created_at, customer.id
  LIMIT 1
)
WHERE payment.customer_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.customers AS customer
    WHERE lower(btrim(customer.name)) = lower(btrim(payment.customer_name))
  );

COMMENT ON FUNCTION public.resolve_customer_for_invoice(text, public.customer_channel) IS
  'Resolve or create one active Master Pelanggan row for a manually entered invoice name; historical manual invoices are backfilled by migration 20260809084700.';
