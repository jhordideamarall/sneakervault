-- Manual journal edits previously used separate client-side update/delete/
-- insert calls. journal_lines intentionally has no DELETE policy, so the old
-- flow could report success while retaining old lines and duplicating totals.
-- Keep validation and mutation in one authorized database transaction.

CREATE OR REPLACE FUNCTION public.update_manual_journal_atomic(
  p_entry_id uuid,
  p_entry_date date,
  p_description text,
  p_notes text,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entry public.journal_entries%ROWTYPE;
  v_line jsonb;
  v_account public.chart_of_accounts%ROWTYPE;
  v_debit numeric;
  v_credit numeric;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_line_order integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan';
  END IF;
  IF NOT public.has_any_role(ARRAY['owner','finance']::public.user_role[]) THEN
    RAISE EXCEPTION 'Tidak berhak mengubah jurnal';
  END IF;
  IF p_entry_id IS NULL OR p_entry_date IS NULL OR nullif(btrim(p_description), '') IS NULL THEN
    RAISE EXCEPTION 'Tanggal dan deskripsi jurnal wajib diisi';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'Jurnal minimal 2 baris';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.fiscal_periods fp
    WHERE fp.year = extract(year FROM p_entry_date)::integer
      AND fp.month = extract(month FROM p_entry_date)::integer
      AND fp.status = 'closed'::public.fiscal_period_status
  ) THEN
    RAISE EXCEPTION 'Periode akuntansi sudah ditutup';
  END IF;

  SELECT * INTO v_entry
  FROM public.journal_entries
  WHERE id = p_entry_id
  FOR UPDATE;
  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'Jurnal tidak ditemukan';
  END IF;
  IF v_entry.status = 'reversed'::public.journal_status THEN
    RAISE EXCEPTION 'Jurnal yang sudah di-reverse tidak bisa diedit';
  END IF;

  -- Validate every line before changing any persistent row.
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_debit := coalesce((v_line->>'debit')::numeric, 0);
    v_credit := coalesce((v_line->>'credit')::numeric, 0);
    IF nullif(btrim(v_line->>'account_code'), '') IS NULL
       OR v_debit < 0
       OR v_credit < 0
       OR (v_debit > 0) = (v_credit > 0) THEN
      RAISE EXCEPTION 'Setiap baris harus mengisi tepat salah satu nilai Debit atau Kredit';
    END IF;

    SELECT * INTO v_account
    FROM public.chart_of_accounts
    WHERE code = btrim(v_line->>'account_code');
    IF v_account.id IS NULL THEN
      RAISE EXCEPTION 'Akun % tidak ditemukan', btrim(v_line->>'account_code');
    END IF;
    IF NOT v_account.is_active THEN
      RAISE EXCEPTION 'Akun % sudah tidak aktif', v_account.code;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.chart_of_accounts child
      WHERE child.parent_id = v_account.id
    ) THEN
      RAISE EXCEPTION 'Akun % adalah kelompok. Pilih akun detail agar laporan tidak salah.', v_account.code;
    END IF;

    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  END LOOP;

  IF v_total_debit <= 0 OR abs(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION 'Jurnal tidak balance: debit % dan kredit %', v_total_debit, v_total_credit;
  END IF;

  DELETE FROM public.journal_lines WHERE entry_id = p_entry_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    SELECT * INTO v_account
    FROM public.chart_of_accounts
    WHERE code = btrim(v_line->>'account_code');

    INSERT INTO public.journal_lines (
      entry_id,
      account_id,
      debit,
      credit,
      description,
      line_order
    )
    VALUES (
      p_entry_id,
      v_account.id,
      coalesce((v_line->>'debit')::numeric, 0),
      coalesce((v_line->>'credit')::numeric, 0),
      nullif(btrim(v_line->>'description'), ''),
      v_line_order
    );
    v_line_order := v_line_order + 1;
  END LOOP;

  UPDATE public.journal_entries
  SET entry_date = p_entry_date,
      description = btrim(p_description),
      notes = nullif(btrim(p_notes), ''),
      total_debit = v_total_debit,
      total_credit = v_total_credit
  WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'id', p_entry_id,
    'source_type', v_entry.source_type::text,
    'total_debit', v_total_debit,
    'total_credit', v_total_credit,
    'line_count', jsonb_array_length(p_lines)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_manual_journal_atomic(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entry public.journal_entries%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan';
  END IF;
  IF NOT public.has_any_role(ARRAY['owner','finance']::public.user_role[]) THEN
    RAISE EXCEPTION 'Tidak berhak menghapus jurnal';
  END IF;

  SELECT * INTO v_entry
  FROM public.journal_entries
  WHERE id = p_entry_id
  FOR UPDATE;
  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'Jurnal tidak ditemukan';
  END IF;
  IF v_entry.source_type <> 'manual'::public.journal_source THEN
    RAISE EXCEPTION 'Hanya jurnal manual yang bisa dihapus';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.fiscal_periods fp
    WHERE fp.year = extract(year FROM v_entry.entry_date)::integer
      AND fp.month = extract(month FROM v_entry.entry_date)::integer
      AND fp.status = 'closed'::public.fiscal_period_status
  ) THEN
    RAISE EXCEPTION 'Periode akuntansi sudah ditutup';
  END IF;

  DELETE FROM public.journal_lines WHERE entry_id = p_entry_id;
  DELETE FROM public.journal_entries WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'id', p_entry_id,
    'entry_number', v_entry.entry_number,
    'description', v_entry.description
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_manual_journal_atomic(uuid, date, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_manual_journal_atomic(uuid, date, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_manual_journal_atomic(uuid, date, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_manual_journal_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_manual_journal_atomic(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_manual_journal_atomic(uuid) TO authenticated;

COMMENT ON FUNCTION public.update_manual_journal_atomic(uuid, date, text, text, jsonb) IS
  'Atomically validates and replaces a posted journal entry and its detail lines.';
COMMENT ON FUNCTION public.delete_manual_journal_atomic(uuid) IS
  'Atomically deletes an authorized manual journal after period and source validation.';
