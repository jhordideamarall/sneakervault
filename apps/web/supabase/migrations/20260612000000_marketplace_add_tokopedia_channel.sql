-- Add 'tokopedia' to the sales/customer channel enum.
--
-- Why: marketplace order/settlement import now supports Tokopedia (templates in
-- docs/marketplace-templates/). The channel enum (customer_channel) is shared by
-- sales_invoices.channel and customers.channel.
--
-- Standalone migration: ALTER TYPE ... ADD VALUE must not share a transaction
-- with statements that USE the new value. Idempotent via IF NOT EXISTS.

ALTER TYPE public.customer_channel ADD VALUE IF NOT EXISTS 'tokopedia';
