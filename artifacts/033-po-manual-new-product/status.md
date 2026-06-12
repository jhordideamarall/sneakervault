# PO Tulis Manual (Barang Baru) → Auto-Sync Inventory saat Diterima

**Status:** [x] Done (build hijau, pending QA klik)
**Tanggal:** 2026-06-12

## Konteks
PO sebelumnya wajib pilih produk yang sudah ada → buntu saat data kosong. Alur
benar: PO boleh tulis barang baru manual; produk dibuat & masuk inventory saat
**Penerimaan Barang** (sesuai permintaan owner).

## Implementasi
- **Migration** `20260612000400`: `purchase_order_lines.product_id` jadi NULLABLE + kolom `new_brand/new_model/new_size/new_color/new_sku`.
- **Validator** `poLineInputSchema`: line = produk lama (product_id) ATAU baru (spek). Refine wajib brand/model/size/SKU bila baru.
- **createPurchaseOrder / updatePurchaseOrder**: simpan spek new_* utk line tanpa product_id.
- **receivePurchaseOrder**: untuk line tanpa product_id → cari produk by SKU; kalau tak ada, **buat produk** (barcode=SKU, sell_price=harga beli sbg placeholder, qty 0), set product_id ke line, lalu increment stok + recalc HPP + movement seperti biasa.
- **Query** `getPurchaseOrderById`: select + label fallback item baru ("… (baru)") + bawa spek utk edit.
- **UI** `po-client`: picker bertab **Produk Ada / Tulis Manual (barang baru)** — form brand/model/size/warna/SKU/harga/qty.
- **Bonus fix UX:** menu **Generate Barcode** (`/barcode-generate`) tadinya ada page tapi TIDAK ada di sidebar → ditambahkan ke grup Gudang.
- Regenerate Database types.

## Catatan / Edge
- RLS insert `products` = owner/admin_gudang. Penerimaan normal (gudang/owner) OK. Finance menerima item baru → insert produk ditolak RLS (error jelas). Edge, belum diubah.
- Produk baru dibuat dgn `sell_price = harga beli` (placeholder) — owner set harga jual nanti.

## Files
- migration 20260612000400_po_manual_new_product_lines.sql
- packages/shared/src/validators.ts
- apps/web/src/lib/actions/{purchase-orders,purchase-receive}.ts
- apps/web/src/lib/queries/index.ts (PoLineRow + getPurchaseOrderById)
- apps/web/src/components/pembelian/po-client.tsx
- apps/web/src/components/dashboard/sidebar.tsx (menu Barcode)
- packages/supabase/src/types.ts (regen)
