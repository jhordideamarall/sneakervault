-- Support free-text size labels that include a leading system prefix,
-- for example "US 8" / "EU 42 2/3", while preserving the original label.
CREATE OR REPLACE FUNCTION public.parse_size_to_numeric(p_label text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  s    text := btrim(coalesce(p_label, ''));
  frac text;
  v    numeric;
BEGIN
  IF s = '' THEN
    RETURN 0;
  END IF;

  s := replace(s, ',', '.');
  s := btrim(regexp_replace(s, '^[^0-9]+', ''));

  IF s = '' THEN
    RETURN 0;
  END IF;

  IF s ~ '^[0-9]+ +[0-9]+/[0-9]+$' THEN
    frac := split_part(s, ' ', 2);
    RETURN split_part(s, ' ', 1)::numeric
         + (split_part(frac, '/', 1)::numeric / nullif(split_part(frac, '/', 2)::numeric, 0));
  END IF;

  IF s ~ '^[0-9]+/[0-9]+$' THEN
    RETURN split_part(s, '/', 1)::numeric / nullif(split_part(s, '/', 2)::numeric, 0);
  END IF;

  v := nullif(substring(s from '^[0-9]+\.?[0-9]*'), '')::numeric;
  RETURN coalesce(v, 0);
END;
$$;
