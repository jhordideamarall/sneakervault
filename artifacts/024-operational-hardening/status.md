# Operational Hardening — Accounting, Stock, Rekonsiliasi

**Status:** ✅ Local implementation complete, pending DB migration review/apply
**Tanggal:** 2026-06-02
**Owner:** Jhordi + Codex

---

## Scope

Hardening ini dibuat setelah audit repo penuh dan feedback meeting bahwa data akuntansi adalah area paling sensitif untuk client. Fokusnya bukan UI polish final, tapi memastikan workflow transaksi tidak terlihat sukses saat bagian stok, kas-bank, jurnal, atau rekonsiliasi gagal.

Mail/pesan tetap diperlakukan sebagai unique proposition anti-fraud. Storage policy hardening disiapkan dengan pola folder user-scoped tanpa menghapus kemampuan upload lampiran chat/avatar yang sudah dipakai UI.

---

## Selesai Lokal

- Auth: user `profiles.is_active = false` sekarang ditahan dari area dashboard dan diarahkan ke login dengan pesan nonaktif.
- Search: API search packing/session memakai kolom `platform_order_id`, bukan kolom yang tidak ada.
- Stock movement: insert langsung dari app diganti helper `createStockMovement()` yang siap memakai RPC role-gated.
- Migration lokal: `20260602091212_operational_hardening_no_reset.sql` menyiapkan hardening role untuk RPC stok/HPP, RPC `create_stock_movement`, dan storage policy `chat-attachments`.
- Rekonsiliasi: parser CSV/XLSX lebih toleran terhadap format BCA/Mandiri, nominal ID, DB/CR, serial date Excel, auto-match scoring, validasi duplicate, validasi amount/type/date server-side, dan audit log match detail.
- POS: input uang/diskon menjadi text formatted `id-ID`, browser number spinner dimatikan global.
- Accounting actions: payment create/reverse, POS, purchase receive, purchase/sales invoice, marketplace import, customer/vendor payment, dan stock opname makin banyak mengecek error jurnal, stok, saldo bank, mutasi bank, dan allocation.
- Return processing: refund sekarang selalu mengubah status menjadi `processed`; exchange mengecek stok produk pengganti sebelum menaikkan stok original.
- Demo seed: script seed user demo sekarang menolak remote Supabase kecuali `ALLOW_REMOTE_DEMO_SEED=true`.

---

## Belum Diterapkan

- Database remote belum di-reset.
- Migration hardening belum di-apply ke Supabase remote. Ini sengaja ditahan untuk review karena mengubah policy/RPC security.
- Belum ada test automated khusus transaksi akuntansi karena repo belum punya test runner formal.

---

## Verifikasi Lokal

- `pnpm --filter @sneakervault/web type-check` ✅
- `pnpm --filter @sneakervault/web lint` ✅ 0 errors, warnings lama masih ada
- `pnpm --filter @sneakervault/web build` ✅ setelah network Google Fonts diizinkan

---

## Catatan Risiko

- Workflow transaksi masih idealnya dipindah ke RPC transaksi database untuk atomicity penuh. Saat ini error tidak lagi banyak silent, tetapi sebagian flow panjang tetap bisa meninggalkan data parsial jika gagal di tengah setelah beberapa write berhasil.
- Rekonsiliasi sudah jauh lebih ketat, tetapi tetap perlu diuji dengan export rekening koran asli BCA/Mandiri client.
- UI numeric formatted baru diterapkan penuh di POS. Modul lain sudah bebas spinner lewat CSS global; formatter per modul sebaiknya dilakukan bertahap saat UI refinement agar parsing form existing tidak berubah mendadak.
