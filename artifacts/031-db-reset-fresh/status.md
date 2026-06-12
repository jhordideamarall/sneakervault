# Reset Database — Fresh Start untuk Demo

**Status:** [x] Done
**Sprint:** Marketplace File-Based Sync
**Tanggal:** 2026-06-12

## Scope (dikonfirmasi owner: "Semua kecuali 1 owner")
- HAPUS: semua data transaksional + master + 4 user non-owner
- KEEP: 1 owner (`owner@sneakervault.com` / Radit), schema, 37 akun CoA, 14 expense_categories, app_settings

## Eksekusi
1. `TRUNCATE ... RESTART IDENTITY CASCADE` 32 tabel transaksional+master (products, sales_*, journal_*, stock_*, packing_*, purchase_*, vendor_*, bank_*, customer_*, returns, expenses, opname, marketplace_*, activity_logs, fiscal_periods, dll)
2. `DELETE FROM profiles WHERE id <> owner`
3. `DELETE FROM auth.users WHERE id <> owner`

## Verifikasi
- profiles = 1, auth.users = 1 (owner)
- invoices/products/journals = 0
- chart_of_accounts = 37, expense_categories = 14 (seed utuh)

## Login demo
- Email: owner@sneakervault.com (role owner)
