CREATE OR REPLACE FUNCTION public.products_sync_size()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.size_label IS NOT NULL AND btrim(NEW.size_label) <> '' THEN
    NEW.size_label := btrim(replace(NEW.size_label, ',', '.'));
    NEW.size := public.parse_size_to_numeric(NEW.size_label);
  ELSIF NEW.size IS NOT NULL THEN
    NEW.size_label := btrim(to_char(NEW.size, 'FM999999990.######'));
  END IF;
  RETURN NEW;
END;
$$;
