-- Allow each fixed asset acquisition to post to a specific asset COA account
-- such as Kendaraan, Peralatan, or Inventaris. Existing rows default to the
-- generic fixed asset account.

ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS asset_account_id uuid
  REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_asset_account_id
  ON public.fixed_assets(asset_account_id);

UPDATE public.fixed_assets fa
SET asset_account_id = coa.id
FROM public.chart_of_accounts coa
WHERE fa.asset_account_id IS NULL
  AND coa.code = '1.2.01';
