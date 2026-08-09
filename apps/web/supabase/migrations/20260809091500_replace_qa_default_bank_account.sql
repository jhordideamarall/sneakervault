-- Production should never send POS cash sales to the settlement account that
-- was created for QA. Preserve its history by deactivating (not deleting) it,
-- add an operational cash account linked to CoA Kas, and prefer the real BCA
-- account for non-cash flows.

INSERT INTO public.bank_accounts (
  name,
  type,
  opening_balance,
  current_balance,
  currency,
  is_default,
  is_active,
  notes,
  coa_account_id
)
SELECT
  'Kas Toko',
  'cash'::public.bank_account_type,
  0,
  0,
  'IDR',
  false,
  true,
  'Kas operasional untuk transaksi tunai POS',
  coa.id
FROM public.chart_of_accounts AS coa
WHERE coa.code = '1.1.01'
  AND coa.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.bank_accounts AS account
    WHERE account.type = 'cash'::public.bank_account_type
      AND account.is_active = true
  )
ORDER BY coa.created_at, coa.id
LIMIT 1;

UPDATE public.bank_accounts AS account
SET
  is_default = false,
  is_active = false,
  notes = CASE
    WHEN coalesce(account.notes, '') ILIKE '%dinonaktifkan otomatis setelah UAT%'
      THEN account.notes
    ELSE concat_ws(E'\n', nullif(account.notes, ''), 'Dinonaktifkan otomatis setelah UAT; histori transaksi tetap dipertahankan.')
  END
WHERE account.name = 'Dummy Settlement Bank'
  AND account.bank_name = 'Bank Dummy QA'
  AND account.account_number = '0000000000'
  AND account.account_holder = 'Dewinst QA'
  AND EXISTS (
    SELECT 1
    FROM public.bank_accounts AS cash_account
    WHERE cash_account.type = 'cash'::public.bank_account_type
      AND cash_account.is_active = true
  );

UPDATE public.bank_accounts AS account
SET is_default = true
WHERE account.name = 'BCA Dewinst'
  AND account.type = 'bank'::public.bank_account_type
  AND account.bank_name = 'BCA'
  AND account.account_number = '6130980811'
  AND account.account_holder = 'Dewinst Cahaya Rezeki'
  AND account.is_active = true;
