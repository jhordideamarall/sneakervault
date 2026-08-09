-- Phase 6 — Performance: Add covering indexes for FK columns + hot-path patterns.
-- Targets the 40 unindexed FK columns flagged by Supabase performance advisor.
-- All indexes use IF NOT EXISTS — idempotent.

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_app_settings_updated_by ON app_settings(updated_by);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_created_by ON bank_transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_reconciled_by ON bank_transactions(reconciled_by);
CREATE INDEX IF NOT EXISTS idx_customer_payments_bank_account_id ON customer_payments(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_created_by ON customer_payments(created_by);
CREATE INDEX IF NOT EXISTS idx_delete_requests_requested_by ON delete_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_delete_requests_reviewed_by ON delete_requests(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_closed_by ON fiscal_periods(closed_by);
CREATE INDEX IF NOT EXISTS idx_internal_messages_receiver_id ON internal_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_created_by ON journal_entries(created_by);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reversed_by ON journal_entries(reversed_by);
CREATE INDEX IF NOT EXISTS idx_marketplace_imports_confirmed_by ON marketplace_imports(confirmed_by);
CREATE INDEX IF NOT EXISTS idx_marketplace_imports_uploaded_by ON marketplace_imports(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_packing_items_product_id ON packing_items(product_id);
CREATE INDEX IF NOT EXISTS idx_packing_sessions_created_by ON packing_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_packing_sessions_packed_by ON packing_sessions(packed_by);
CREATE INDEX IF NOT EXISTS idx_packing_sessions_status_updated_by ON packing_sessions(status_updated_by);
CREATE INDEX IF NOT EXISTS idx_product_condition_history_changed_by ON product_condition_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_product_condition_history_product_id ON product_condition_history(product_id);
CREATE INDEX IF NOT EXISTS idx_products_condition_updated_by ON products(condition_updated_by);
CREATE INDEX IF NOT EXISTS idx_products_default_supplier_id ON products(default_supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_batches_created_by ON purchase_batches(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_batches_product_id ON purchase_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_batches_supplier_id ON purchase_batches(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_created_by ON purchase_invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_po_id ON purchase_invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_approved_by ON purchase_orders(approved_by);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_by ON purchase_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_dp_bank_account_id ON purchase_orders(dp_bank_account_id);
CREATE INDEX IF NOT EXISTS idx_returns_new_product_id ON returns(new_product_id);
CREATE INDEX IF NOT EXISTS idx_returns_original_product_id ON returns(original_product_id);
CREATE INDEX IF NOT EXISTS idx_returns_packing_item_id ON returns(packing_item_id);
CREATE INDEX IF NOT EXISTS idx_returns_processed_by ON returns(processed_by);
CREATE INDEX IF NOT EXISTS idx_returns_verified_by ON returns(verified_by);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_created_by ON sales_invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_stock_movements_performed_by ON stock_movements(performed_by);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_bank_account_id ON vendor_payments(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_created_by ON vendor_payments(created_by);

-- Hot-path composite indexes
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_id ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status_date ON journal_entries(status, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_status ON purchase_invoices(status);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_status ON sales_invoices(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_date ON bank_transactions(bank_account_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_date ON stock_movements(product_id, created_at DESC);
