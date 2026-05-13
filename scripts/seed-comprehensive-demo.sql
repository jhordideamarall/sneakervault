-- Skenario: Simulasi Siklus Hidup Produk (Life of a Product)
-- Demonstrasi: HPP Average, Jurnal Otomatis, dan Laporan Keuangan.

DO $$
DECLARE
    v_owner_id uuid;
    v_supplier_id uuid;
    v_customer_id uuid;
    v_bank_id uuid;
    v_product_id uuid;
    v_po_id uuid;
    v_pi_id uuid;
    v_inv_id uuid;
    v_coa_inventory uuid;
    v_coa_ap uuid;
    v_coa_ar uuid;
    v_coa_revenue uuid;
    v_coa_cogs uuid;
    v_coa_bank uuid;
    v_coa_admin_fee uuid;
BEGIN
    -- 1. Get references
    SELECT id INTO v_owner_id FROM profiles WHERE roles @> ARRAY['owner'::user_role] LIMIT 1;
    SELECT id INTO v_supplier_id FROM suppliers LIMIT 1;
    SELECT id INTO v_bank_id FROM bank_accounts WHERE type = 'bank' LIMIT 1;

    -- 2. Create/Get Demo Product
    -- We use a fresh product to show HPP from 0
    INSERT INTO products (brand, model, sku, size, color, barcode, quantity, hpp, sell_price, price_offline)
    VALUES ('Adidas', 'Samba OG', 'ADS-SAMBA-DEMO', 42, 'White/Black', 'DEMO123', 0, 0, 1850000, 1750000)
    RETURNING id INTO v_product_id;

    -- 3. BATCH 1: Beli 10 unit @ 1.300.000
    INSERT INTO purchase_orders (po_number, supplier_id, status, subtotal, total, created_by)
    VALUES ('PO-DEMO-001', v_supplier_id, 'completed', 13000000, 13000000, v_owner_id)
    RETURNING id INTO v_po_id;

    INSERT INTO purchase_order_lines (po_id, product_id, ordered_qty, received_qty, unit_cost, subtotal)
    VALUES (v_po_id, v_product_id, 10, 10, 13000000, 13000000);

    -- Simulasikan fungsi recalculate_hpp_by_sku manual (karena di SQL tidak trigger server action)
    UPDATE products SET quantity = 10, hpp = 1300000 WHERE id = v_product_id;
    INSERT INTO stock_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, performed_by)
    VALUES (v_product_id, 'inbound', 10, 1300000, 'purchase_order_line', v_po_id, v_owner_id);

    -- 4. BATCH 2: Beli 5 unit @ 1.600.000 (Harga naik)
    -- Rumus: ((10 * 1.3M) + (5 * 1.6M)) / 15 = (13M + 8M) / 15 = 1.4M
    UPDATE products SET quantity = 15, hpp = 1400000 WHERE id = v_product_id;
    INSERT INTO stock_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, performed_by)
    VALUES (v_product_id, 'inbound', 5, 1600000, 'purchase_order_line', v_po_id, v_owner_id);

    -- 5. CATAT HUTANG (Faktur Pembelian)
    INSERT INTO purchase_invoices (invoice_number, supplier_id, po_id, subtotal, total, status, created_by)
    VALUES ('FB-DEMO-001', v_supplier_id, v_po_id, 21000000, 21000000, 'unpaid', v_owner_id)
    RETURNING id INTO v_pi_id;

    -- JURNAL BATCH PEMBELIAN
    -- Dr Persediaan 21M / Cr Hutang 21M
    INSERT INTO journal_entries (entry_number, entry_date, description, source_type, source_id, total_debit, total_credit, created_by)
    VALUES ('JV-DEMO-PURCHASE', CURRENT_DATE, 'Penerimaan barang Adidas Samba', 'purchase_invoice', v_pi_id, 21000000, 21000000, v_owner_id)
    RETURNING id INTO v_po_id; -- reuse variable for entry_id

    INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
    VALUES 
        (v_po_id, (SELECT id FROM chart_of_accounts WHERE code = '1.1.05'), 21000000, 0, 'Persediaan Barang'),
        (v_po_id, (SELECT id FROM chart_of_accounts WHERE code = '2.1.01'), 0, 21000000, 'Hutang Usaha');

    -- 6. PENJUALAN SHOPEE (Simulasi 2 unit terjual)
    -- Harga: 1.850.000 x 2 = 3.700.000
    -- Fee Shopee (5%): 185.000
    -- Net Payout: 3.515.000
    -- HPP (Average 1.4M x 2): 2.800.000
    INSERT INTO sales_invoices (invoice_number, customer_name, channel, subtotal, marketplace_fee, total, status, marketplace_order_id, created_by)
    VALUES ('FJ-DEMO-001', 'Budi Shopee', 'shopee', 3700000, 185000, 3515000, 'issued', 'ORDER-SP-123', v_owner_id)
    RETURNING id INTO v_inv_id;

    INSERT INTO sales_invoice_lines (invoice_id, product_id, product_label, qty, unit_price, unit_cost, subtotal)
    VALUES (v_inv_id, v_product_id, 'Adidas Samba OG White 42', 2, 1850000, 1400000, 3700000);

    UPDATE products SET quantity = 13 WHERE id = v_product_id;
    INSERT INTO stock_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, performed_by)
    VALUES (v_product_id, 'outbound', 2, 1400000, 'sales_invoice_line', v_inv_id, v_owner_id);

    -- JURNAL PENJUALAN
    INSERT INTO journal_entries (entry_number, entry_date, description, source_type, source_id, total_debit, total_credit, created_by)
    VALUES ('JV-DEMO-SALE', CURRENT_DATE, 'Penjualan Shopee FJ-DEMO-001', 'sales_invoice', v_inv_id, 6500000, 6500000, v_owner_id)
    RETURNING id INTO v_po_id; -- entry_id

    INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
    VALUES 
        -- Finansial
        (v_po_id, (SELECT id FROM chart_of_accounts WHERE code = '1.1.04'), 3515000, 0, 'Piutang Shopee (Net)'),
        (v_po_id, (SELECT id FROM chart_of_accounts WHERE code = '6.1'), 185000, 0, 'Beban Admin Shopee'),
        (v_po_id, (SELECT id FROM chart_of_accounts WHERE code = '4.1.02'), 0, 3700000, 'Pendapatan Shopee'),
        -- COGS
        (v_po_id, (SELECT id FROM chart_of_accounts WHERE code = '5.1'), 2800000, 0, 'HPP Terjual (2 unit x 1.4M)'),
        (v_po_id, (SELECT id FROM chart_of_accounts WHERE code = '1.1.05'), 0, 2800000, 'Persediaan Keluar');

    -- 7. TERIMA PEMBAYARAN DARI SHOPEE (Cair ke Bank)
    UPDATE bank_accounts SET current_balance = current_balance + 3515000 WHERE id = v_bank_id;
    INSERT INTO bank_transactions (bank_account_id, type, amount, balance_after, description, related_entity_type, related_entity_id, created_by)
    VALUES (v_bank_id, 'credit', 3515000, (SELECT current_balance FROM bank_accounts WHERE id = v_bank_id), 'Pencairan Shopee FJ-DEMO-001', 'customer_payment', v_inv_id, v_owner_id);

    -- JURNAL PENERIMAAN KAS
    INSERT INTO journal_entries (entry_number, entry_date, description, source_type, source_id, total_debit, total_credit, created_by)
    VALUES ('JV-DEMO-CASHIN', CURRENT_DATE, 'Terima Kas Shopee FJ-DEMO-001', 'customer_payment', v_inv_id, 3515000, 3515000, v_owner_id)
    RETURNING id INTO v_po_id;

    INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
    VALUES 
        (v_po_id, (SELECT id FROM chart_of_accounts WHERE code = '1.1.02'), 3515000, 0, 'Bank BCA'),
        (v_po_id, (SELECT id FROM chart_of_accounts WHERE code = '1.1.04'), 0, 3515000, 'Pelunasan Piutang');

END $$;
