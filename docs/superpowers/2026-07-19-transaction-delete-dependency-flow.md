# Transaction Delete Dependency Flow

## Domain Terms

- **Pembelian Barang** is the supplier procurement transaction stored in
  `purchase_orders` and numbered `PO-YYMM-####`.
- **Pre Order** is a customer demand and fulfillment workflow stored in
  `pre_orders`.
- Deleting Pembelian Barang may remove procurement links, but must never delete
  the customer Pre Order or its lines.

## Required Order

```text
Pembelian:
Pembelian Barang -> Penerimaan Barang -> Faktur Pembelian -> Pembayaran Vendor
Delete from right to left.

Penjualan:
Invoice Penjualan -> Penerimaan Customer
Delete from right to left.
```

`Hapus` permanently removes an input mistake and its original effects.
`Batalkan Pembelian (Supplier)` is only for a supplier cancellation before any
receipt and requires a reason.

## Database Contract

- `purchase_receipts` and `purchase_receipt_lines` preserve one header per
  physical receipt and point to the exact inbound stock movements.
- Historical receipts are backfilled and validated against
  `purchase_order_lines.received_qty`.
- Receiving uses `receive_purchase_order_atomic(jsonb)` so receipt, stock, HPP,
  supplier invoice/payment, bank mutation, and journals commit or roll back
  together.
- Six delete RPCs use row locks, an empty `search_path`, internal Owner/Finance
  authorization, fiscal-period checks, reconciliation checks, and structured
  blocker results.
- POS, marketplace, packing, return, and settlement sales are excluded from the
  accounting delete flow.
- Deleted transaction numbers are never reused.
- A minimal audit record keeps only stage, reference number, actor, and time.

## UI Contract

- Owner and Finance see delete controls on each accounting stage.
- Confirmation dialogs explain permanent stock, HPP, bank, and journal effects.
- A blocker dialog names the downstream transaction and links directly to the
  page where it must be deleted first.
- Receipt history is available from the Penerimaan Barang page.
- The welcome card and Panduan use `Pembelian Barang` for supplier procurement
  and `Pre Order` only for the customer workflow.

## Production Verification

- Supabase project: `jogqvffdjtjqdnflvubi`.
- Migrations: `purchase_receipts_and_atomic_receive` and
  `transaction_hard_delete_rpcs`.
- Purchase and sales chains were executed inside database transactions and
  rolled back after assertions.
- Verified blockers: downstream payment/invoice/receipt, closed fiscal period,
  reconciled bank transaction, used stock, unsupported marketplace flow, and
  unauthorized role.
- Verified repeat deletion cannot apply financial effects twice.
