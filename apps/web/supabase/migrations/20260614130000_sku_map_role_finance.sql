-- Konsistensi #9: write marketplace_sku_map hanya owner + finance (bukan admin_online),
-- samakan dengan permissions.ts / RPC import_marketplace_order_atomic.
ALTER POLICY msm_insert_sales_roles ON public.marketplace_sku_map
  WITH CHECK ((select public.has_any_role(ARRAY['owner','finance']::user_role[])));

ALTER POLICY msm_update_sales_roles ON public.marketplace_sku_map
  USING ((select public.has_any_role(ARRAY['owner','finance']::user_role[])))
  WITH CHECK ((select public.has_any_role(ARRAY['owner','finance']::user_role[])));
