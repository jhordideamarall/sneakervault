-- Harga jual multi-channel. Pertahankan sell_price (online default) & price_offline.
-- Tambah harga per-channel (NULL = fallback ke sell_price). Additive, low-risk.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_website   numeric,
  ADD COLUMN IF NOT EXISTS price_shopee    numeric,
  ADD COLUMN IF NOT EXISTS price_tiktok    numeric,
  ADD COLUMN IF NOT EXISTS price_tokopedia numeric;

COMMENT ON COLUMN public.products.price_website   IS 'Harga jual channel Website (NULL = pakai sell_price).';
COMMENT ON COLUMN public.products.price_shopee    IS 'Harga jual channel Shopee (NULL = pakai sell_price).';
COMMENT ON COLUMN public.products.price_tiktok    IS 'Harga jual channel TikTok (NULL = pakai sell_price).';
COMMENT ON COLUMN public.products.price_tokopedia IS 'Harga jual channel Tokopedia (NULL = pakai sell_price).';
