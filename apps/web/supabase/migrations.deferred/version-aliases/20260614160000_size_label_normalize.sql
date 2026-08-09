-- Solidkan size_label: keunikan/grouping variant pakai teks size_label, jadi
-- "42,5" vs "42.5" harus tidak dianggap dua variant beda. Normalisasi koma->titik
-- + trim saat simpan. Pecahan Adidas ("42 2/3") tidak terpengaruh (tak ada koma).
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
