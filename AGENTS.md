# AGENTS.md — SneakerVault (Dewinst.id)

Aturan untuk semua agent (termasuk Codex) yang bekerja di repo ini. Sumber kebenaran lengkap: **`CLAUDE.md`** — baca itu juga.

## Safety (WAJIB)
- **Baca file** sebelum mengubah; jangan asumsi isi.
- **Jangan** operasi destructive (drop table, hapus data, reset) tanpa konfirmasi eksplisit.
- Perubahan schema = **migration file baru** (additive, idempotent); jangan edit migration lama.
- Jangan hardcode UUID/ID yang digenerate DB.

## Reset Data (WAJIB — reset yang aman)
Saat reset/clear database, **HANYA buang data transaksi/demo**. Tabel config/seed & akun **HARUS SELALU UTUH** — jangan pernah di-truncate/drop:
- `profiles` (akun login), `chart_of_accounts` (**COA**), `expense_categories`, `app_settings`, `fiscal_periods`, `bank_accounts`, `notification_preferences`.
- Struktur tabel/RLS/RPC/index/sequence (truncate data saja, jangan drop objek).

Boleh dibuang (transaksi/demo): products, stock_movements, product_condition_history, sales_invoices(+lines), purchase_orders/invoices/batches(+lines), packing_sessions(+items), returns, stock_opname_*, bank_transactions, customers/customer_payments(+alloc), vendor_payments(+alloc), expenses, journal_entries(+lines), delete_requests, activity_logs, marketplace_imports, marketplace_sku_map, internal_messages, feedback_*.
- Pakai `TRUNCATE ... RESTART IDENTITY CASCADE` + reset sequence penomoran. Verifikasi via MCP setelah reset (config utuh, transaksi 0).

## Git
- Jangan push langsung ke `main`/`master`. Kerja di feature branch.
- Jangan `git reset --hard` / `git push --force` / `git clean -f` tanpa konfirmasi.
- Commit hanya jika diminta eksplisit.
- File data besar (mis. xlsx berisi foto, >100MB) jangan di-commit — gitignore.

## Model domain inti (jangan dilanggar)
- **SKU = jangkar colorway; size = variant. Identitas produk = (sku, size).** Unique DB numerik `(sku, round(size,2))`. SKU sama + size beda = variant, bukan dobel.
- **HPP hanya dari internal** (template internal / Barang Masuk). Marketplace tidak bawa HPP.
- **Stok**: sumber kebenaran = internal/sistem. Round-trip ("Update Stok Marketplace") = push sistem → marketplace, bukan tarik.
- Size free-text: `40`, `42.5` (titik), Adidas `42 2/3` (spasi); koma auto→titik.

## Konvensi
- Migration: `apps/web/supabase/migrations/`. RPC baru: SECURITY INVOKER bila bisa, search_path terkunci, GRANT minimal, revoke dari anon/public.
- Artifact tracking di `artifacts/{NNN}-{nama}/status.md` (lihat CLAUDE.md §2).
- Spec/plan di `docs/superpowers/`.
