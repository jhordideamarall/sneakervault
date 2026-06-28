# 041 - Pre Order Workflow

Last updated: 2026-06-28

## User Goal

Client wants a dedicated Pre Order menu that removes ambiguity between:

- Normal marketplace order -> invoice / packing / stock decrement.
- Pre Order Marketplace -> demand/reservation first, visible in Pre Order menu, not manual re-entry.
- Manual customer Pre Order -> customer asks for shoes not in stock; product can be picked from inventory or typed manually.
- Purchases -> Pre Order demand can later create/link to Pembelian Barang.

Shoe size UI must support picker and custom values. Marketplace order numbers must be explicit for warehouse/packing.

## Current Plan

1. Step 1 - Add Pre Order foundation and non-ambiguous UI terms. Done.
2. Step 2 - Add Pre Order menu with manual product input and size picker/custom. Done.
3. Step 3 - Route marketplace Pre Order import into Pre Order automatically. Done.
4. Step 4 - Link Pre Order demand to Pembelian Barang and stock reservation lifecycle. Done.
5. Step 5 - Fix remaining ambiguous UX/logic: returns, packing, order id labels, bank mutation. Done.
6. Step 6 - P0 atomicity hardening and database verification. Done.
7. Step 7 - Settlement fee/report fix and packing reservation consumption. Done.

## Completed This Turn

- Added migration `apps/web/supabase/migrations/20260627221812_pre_order_foundation.sql`.
- Applied migration to Supabase via MCP as `pre_order_foundation`.
- Remote tables now exist with RLS enabled and 0 rows:
  - `pre_orders`
  - `pre_order_lines`
  - `pre_order_procurement_links`
  - `stock_reservations`
- Added shared types/constants/validators:
  - `PreOrderSource`, `PreOrderStatus`, `StockReservationStatus`
  - `PRE_ORDER_STATUS_LABELS`, `PRE_ORDER_STATUS_TONES`
  - `SHOE_SIZE_OPTIONS`
  - `preOrderInputSchema`
- Added query `getPreOrders()` and extended product picker with `size_label`.
- Added server actions:
  - `createPreOrder()`
  - `cancelPreOrder()`
- Added route and UI:
  - `/pre-order`
  - sidebar menu item `Pre Order`
  - route permissions for owner, finance, admin_online, admin_gudang, shopkeeper
  - `ShoeSizePicker` component with picker/custom mode
  - Pre Order list, filters, stats, and create modal
- Verified `pnpm --filter @sneakervault/web type-check` passes.

## Important Semantics

- Pre Order is demand/reservation, not physical inventory.
- `products.quantity` remains physical stock source of truth.
- `stock_reservations` marks allocated ready stock but does not decrement stock.
- Manual product line can have `product_id = null`; it remains review/needs purchase until linked to inventory/purchase flow later.
- If an existing product has enough available stock, Pre Order line is `ready_from_stock`.
- If existing product stock is short, line is `needs_purchase`.
- If no product is selected, line is `review`.

## Next Step When User Says Continue

Current priority work is complete through settlement fee/report and packing reservation lifecycle.

- If continuing QA, start with a browser smoke test:
  - Import/preview marketplace order direct vs Pre Order.
  - Cancel a marketplace Pre Order and confirm reservation release.
  - Scan packing for a Pre Order order id and confirm reservation consumed.
  - Remove/cancel packing and confirm reservation restored.
  - Open `/reports` and confirm marketplace fee is no longer `Rp 0`.
- Remaining engineering hardening candidate: convert Pre Order -> PO creation into one SQL RPC transaction.

## Verification Done

- Supabase MCP `list_tables` before migration: Pre Order tables absent.
- Supabase MCP `apply_migration`: success.
- Supabase MCP `list_tables` after migration: Pre Order tables present, RLS enabled.
- `pnpm --filter @sneakervault/web type-check`: pass.

## Known Gaps Still Pending

- Packing flow does not yet consume Pre Order reservations.
- Settlement fee/accounting audit from marketplace sheets is still pending.

## Step 5 Completed

- Packing/outbound now requires explicit marketplace order number for non-offline platform.
- Packing form marks `Nomor Order Marketplace` required unless platform is offline.
- Bank mutation UI no longer exposes confusing `Debit/Kredit` labels for app operators.
  - Table columns now say `Uang Keluar` and `Uang Masuk`.
  - Manual mutation buttons now say `Uang Masuk` and `Uang Keluar`.
- Journal edit audit:
  - Existing module already supports create/edit manual journal.
  - Existing module also supports manual correction/override of system journal with warning that source invoice/stock/bank is not changed.
  - Delete remains restricted to manual journals only.
- Verification:
  - `pnpm --filter @sneakervault/web type-check` passed.
  - `pnpm --filter @sneakervault/web build` passed.

## Step 6 Completed

- Ran `git diff --check`; no whitespace errors.
- Ran Supabase REST checks with service role for:
  - `pre_orders`
  - `pre_order_lines`
  - `stock_reservations`
  - `purchase_order_lines.new_size_label`
- All REST checks returned HTTP 200.
- Final verification still passes:
  - `pnpm --filter @sneakervault/web type-check`
  - `pnpm --filter @sneakervault/web build`

## Remaining Product/Accounting Gaps

- Pre Order -> PO creation is multi-step with cleanup fallback, not a single SQL RPC transaction yet. It is safer than before, but a future RPC would be stronger for atomicity.
- Supabase MCP OAuth expired during earlier verification. Current DB checks were done through the Supabase Management API script.
- Current report fee source is invoice-level actual settlement fee (`sales_invoices.settlement_fee_actual`). The settlement journal still only posts COA 6.1 correction when actual fee differs from the order estimate, to avoid double-counting expense.

## Step 7 Completed

- Added migration `apps/web/supabase/migrations/20260628140254_packing_preorder_reservation_link.sql`.
- Applied the migration through `scripts/run-supabase-sql.mjs`.
- Added `packing_items.stock_reservation_id` to link each scanned item to the consumed Pre Order reservation.
- Added atomic packing RPCs:
  - `scan_packing_item_atomic`
  - `remove_packing_item_atomic`
  - `cancel_packing_session_atomic`
- Updated outbound server actions to use the atomic RPCs, so scan/remove/cancel now moves physical stock, stock movements, packing items, and Pre Order reservations together.
- Packing now consumes active reservation quantity one unit at a time.
- Removing a packing item or cancelling a packing session restores linked reservation quantity/status.
- Pre Order cancel now blocks if any linked reservation already has a packing item.
- Marketplace cancel/return import now cancels matching Pre Orders and releases reservations when the order was imported as Pre Order instead of invoice.
- Marketplace import result wording now says `Cancel/Release`, not only `Cancel/Restock`.
- Report and export fee logic now use:
  - actual settlement fee from `sales_invoices.settlement_fee_actual` for released invoices;
  - order import estimate from `sales_invoices.marketplace_fee` for unreleased invoices.
- Remote DB verification:
  - `packing_items.stock_reservation_id` exists.
  - `scan_packing_item_atomic`, `remove_packing_item_atomic`, and `cancel_packing_session_atomic` exist.
  - Existing DB fee summary now returns non-zero report fees for Shopee, TikTok, and Tokopedia.
- Verification:
  - `pnpm --filter @sneakervault/web type-check` passed.
  - `pnpm --filter @sneakervault/web build` passed.
  - `git diff --check` passed.

## Step 4 Completed

- Added migration `apps/web/supabase/migrations/20260628133945_purchase_order_size_label_preorder_link.sql`.
- Applied the migration through `scripts/run-supabase-sql.mjs` because Supabase MCP required OAuth and CLI needed DB password.
- Added `purchase_order_lines.new_size_label` so manual/new-product PO lines can preserve free-text sizes like `42 2/3`.
- Updated PO validators/actions/query/detail UI to carry `new_size_label`.
- Updated PO receiving so new products are created with `size_label`, not only numeric `size`.
- Added `createPurchaseOrderFromPreOrder()` action:
  - Creates draft PO from Pre Order shortage qty.
  - Skips lines already linked to a PO.
  - Inserts `pre_order_procurement_links`.
  - Updates Pre Order/lines to `purchase_created`.
- Added Pre Order UI button/modal `Buat PO`.
- Verification:
  - `pnpm --filter @sneakervault/web type-check` passed.
  - `pnpm --filter @sneakervault/web build` passed.
  - Supabase REST check for `purchase_order_lines?select=new_size_label` returned 200.

## Step 3 Completed

- Marketplace import review now distinguishes:
  - `Order Langsung` -> invoice path.
  - `Pre Order Marketplace` -> Pre Order path.
  - `Cancel/Return Marketplace` -> cancel/restock path.
- Added reconcile statuses:
  - `preorder_ready`
  - `preorder_review`
  - `preorder_duplicate`
- Commit behavior:
  - Pre Order Marketplace creates `pre_orders` + `pre_order_lines`.
  - It does not call invoice import RPC.
  - It does not decrement `products.quantity`.
  - Matching products reserve available stock through `stock_reservations`.
  - Low stock becomes Pre Order with purchase shortage, not a fatal import error.
  - Unmatched SKU/size still enters Pre Order as review, with line notes.
- Result screen now shows invoice count, pre-order count, cancel/restock count, skipped, and errors.
- UI labels no longer use `PO Marketplace`; they use `Pre Order Marketplace`.
- Parser now skips the TikTok/Tokopedia documentation row (`Platform unique order ID.`).
- Verification:
  - `pnpm --filter @sneakervault/web type-check` passed.
  - `pnpm --filter @sneakervault/web build` passed.
  - Supabase REST HEAD returned 200 for `pre_orders`, `pre_order_lines`, `stock_reservations`.
