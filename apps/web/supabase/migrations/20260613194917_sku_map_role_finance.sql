ALTER POLICY msm_insert_sales_roles ON public.marketplace_sku_map
  WITH CHECK ((select public.has_any_role(ARRAY['owner','finance']::user_role[])));

ALTER POLICY msm_update_sales_roles ON public.marketplace_sku_map
  USING ((select public.has_any_role(ARRAY['owner','finance']::user_role[])))
  WITH CHECK ((select public.has_any_role(ARRAY['owner','finance']::user_role[])));
