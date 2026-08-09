-- Idempotent seed for the standard Chart of Accounts (SAK EMKM) + expense categories.
-- Reference data the journal engine resolves by `code`; previously only in remote
-- (not reproducible). Safe to re-run (ON CONFLICT / NOT EXISTS guards).

INSERT INTO public.chart_of_accounts (code, name, type, normal_balance, is_system) VALUES
  ('1','ASET','asset'::coa_type,'debit'::coa_normal_balance,'t'),
  ('1.1','Aset Lancar','asset'::coa_type,'debit'::coa_normal_balance,'t'),
  ('1.1.01','Kas','asset'::coa_type,'debit'::coa_normal_balance,'t'),
  ('1.1.02','Bank','asset'::coa_type,'debit'::coa_normal_balance,'t'),
  ('1.1.03','Saldo Marketplace','asset'::coa_type,'debit'::coa_normal_balance,'t'),
  ('1.1.04','Piutang Usaha','asset'::coa_type,'debit'::coa_normal_balance,'t'),
  ('1.1.05','Persediaan Barang','asset'::coa_type,'debit'::coa_normal_balance,'t'),
  ('1.2','Aset Tetap','asset'::coa_type,'debit'::coa_normal_balance,'t'),
  ('2','LIABILITAS','liability'::coa_type,'credit'::coa_normal_balance,'t'),
  ('2.1','Liabilitas Lancar','liability'::coa_type,'credit'::coa_normal_balance,'t'),
  ('2.1.01','Hutang Usaha','liability'::coa_type,'credit'::coa_normal_balance,'t'),
  ('2.1.02','Hutang Pajak','liability'::coa_type,'credit'::coa_normal_balance,'t'),
  ('3','EKUITAS','equity'::coa_type,'credit'::coa_normal_balance,'t'),
  ('3.1','Modal Pemilik','equity'::coa_type,'credit'::coa_normal_balance,'t'),
  ('3.2','Laba Ditahan','equity'::coa_type,'credit'::coa_normal_balance,'t'),
  ('3.3','Laba Tahun Berjalan','equity'::coa_type,'credit'::coa_normal_balance,'t'),
  ('4','PENDAPATAN','revenue'::coa_type,'credit'::coa_normal_balance,'t'),
  ('4.1','Penjualan','revenue'::coa_type,'credit'::coa_normal_balance,'t'),
  ('4.1.01','Penjualan WA/Offline','revenue'::coa_type,'credit'::coa_normal_balance,'t'),
  ('4.1.02','Penjualan Shopee','revenue'::coa_type,'credit'::coa_normal_balance,'t'),
  ('4.1.03','Penjualan TikTok','revenue'::coa_type,'credit'::coa_normal_balance,'t'),
  ('4.2','Pendapatan Lain','revenue'::coa_type,'credit'::coa_normal_balance,'t'),
  ('5','HARGA POKOK PENJUALAN','cogs'::coa_type,'debit'::coa_normal_balance,'t'),
  ('5.1','HPP Barang Terjual','cogs'::coa_type,'debit'::coa_normal_balance,'t'),
  ('6','BEBAN','expense'::coa_type,'debit'::coa_normal_balance,'t'),
  ('6.1','Beban Administrasi Marketplace','expense'::coa_type,'debit'::coa_normal_balance,'t'),
  ('6.10','Beban Utilitas Listrik/Internet','expense'::coa_type,'debit'::coa_normal_balance,'t'),
  ('6.11','Beban Lain-lain','expense'::coa_type,'debit'::coa_normal_balance,'t'),
  ('6.2','Beban Diskon & Promosi','expense'::coa_type,'debit'::coa_normal_balance,'t'),
  ('6.3','Beban Pengiriman','expense'::coa_type,'debit'::coa_normal_balance,'t'),
  ('6.4','Beban Operasional','expense'::coa_type,'debit'::coa_normal_balance,'t'),
  ('6.5','Beban Gaji','expense'::coa_type,'debit'::coa_normal_balance,'t'),
  ('6.6','Beban Penyusutan','expense'::coa_type,'debit'::coa_normal_balance,'t'),
  ('6.7','Beban Penyesuaian Stok','expense'::coa_type,'debit'::coa_normal_balance,'t'),
  ('6.8','Beban Sewa','expense'::coa_type,'debit'::coa_normal_balance,'t'),
  ('6.9','Beban Iklan/Pemasaran','expense'::coa_type,'debit'::coa_normal_balance,'t')
ON CONFLICT (code) DO NOTHING;

UPDATE public.chart_of_accounts c
SET parent_id = p.id
FROM (VALUES
  ('1.1','1'),('1.1.01','1.1'),('1.1.02','1.1'),('1.1.03','1.1'),('1.1.04','1.1'),
  ('1.1.05','1.1'),('1.2','1'),('2.1','2'),('2.1.01','2.1'),('2.1.02','2.1'),
  ('3.1','3'),('3.2','3'),('3.3','3'),('4.1','4'),('4.1.01','4.1'),('4.1.02','4.1'),
  ('4.1.03','4.1'),('4.2','4'),('5.1','5'),('6.1','6'),('6.2','6'),('6.3','6'),
  ('6.4','6'),('6.5','6'),('6.6','6'),('6.7','6')
) AS m(child_code, parent_code)
JOIN public.chart_of_accounts p ON p.code = m.parent_code
WHERE c.code = m.child_code AND c.parent_id IS DISTINCT FROM p.id;

INSERT INTO public.expense_categories (name, account_code, is_system, sort_order)
SELECT v.name, v.account_code, v.is_system::boolean, v.sort_order::int
FROM (VALUES
  ('Gaji karyawan','6.5','t','10'),('Sewa toko/gudang','6.8','t','20'),
  ('Listrik & internet','6.10','t','30'),('Biaya packing','6.4','t','40'),
  ('Kardus, plastik, bubble wrap','6.4','t','50'),('Biaya admin marketplace','6.1','t','60'),
  ('Biaya iklan Shopee/TikTok/Instagram','6.9','t','70'),('Biaya ongkir/subsidi ongkir','6.3','t','80'),
  ('Biaya transport','6.4','t','90'),('Biaya software/tools','6.11','t','100'),
  ('Biaya refund/komplain','6.11','t','110'),('Biaya service/perbaikan','6.11','t','120'),
  ('Biaya makan/operasional','6.4','t','130'),('Biaya lain-lain','6.11','t','140')
) AS v(name, account_code, is_system, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories e WHERE e.name = v.name);
