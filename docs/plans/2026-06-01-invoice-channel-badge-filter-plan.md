# Plan: Badge & Filter Channel di Invoice Penjualan

> **Status:** 📋 Planned (belum dieksekusi)
> **Tanggal:** 2026-06-01
> **Pemicu:** POS kasir & penjualan online sama-sama tersimpan sebagai `sales_invoices` (channel berbeda) dan tampil bercampur di Invoice Penjualan. Perlu pembeda visual per-channel + filter yang jelas.
> **Eksekutor:** Codex (tulis self-contained).

---

## Context

POS (`channel="offline"`), Shopee, TikTok, WA, Website semuanya jadi `sales_invoices` dan **benar** tampil di satu buku penjualan `/penjualan/invoice` (satu sumber untuk laba/HPP/laporan/pajak — inti pengganti Accurate). Yang kurang: pembeda **per-channel** yang jelas supaya POS gampang dibedakan dari order online.

**Penting — sebagian sudah ada (jangan bangun ulang):**
`apps/web/src/components/penjualan/invoice-client.tsx` **sudah** punya:
- `channelLabel(c)` (line ~110) + `channelTone` (Record warna per channel, line ~113, tema gelap).
- State `channelFilter` + dropdown `<select>` "Semua channel" (line ~551).
- Logika filter sudah mempertimbangkan channel (line ~175).
- Badge channel **sudah** dirender per baris (line ~613 list, ~1253 detail).

**Outcome:** Naikkan dari "ada tapi seadanya" → **format per-channel konsisten (ikon+warna+label)** + **filter chip dengan hitungan**, dan dipakai ulang (DRY) di Invoice, POS, dan Laporan.

---

## Prinsip
1. **Reuse-first** — jangan duplikat. Konsolidasikan `channelLabel`/`channelTone` yang sudah ada jadi satu sumber.
2. **Tema gelap** — halaman invoice ada di dashboard gelap; pertahankan tone gelap yang sudah ada (`text-*-300`, `bg-*-500/15`).
3. **Tidak menyentuh akuntansi** — murni tampilan/filter. `posCheckout`, jurnal, status invoice tidak diubah.
4. **Cek MCP Supabase** sebelum mulai: konfirmasi nilai enum `customer_channel` live = `wa, shopee, tiktok, offline, website, mixed` (acuan: sudah diverifikasi 2026-06-01).

---

## Desain

### 1. Sumber tunggal channel meta (baru)
Buat `apps/web/src/lib/channels.ts`:
```ts
import { MessageCircle, Store, ShoppingBag, Music2, Globe, Layers } from "lucide-react";
export type Channel = "wa" | "shopee" | "tiktok" | "offline" | "website" | "mixed";
export const CHANNEL_META: Record<Channel, { label: string; short: string; icon: ...; tone: string }> = {
  offline: { label: "POS / Offline", short: "POS",     icon: Store,        tone: "bg-sky-500/15 text-sky-300 border-sky-500/20" },
  shopee:  { label: "Shopee",        short: "Shopee",  icon: ShoppingBag,  tone: "bg-orange-500/15 text-orange-300 border-orange-500/20" },
  tiktok:  { label: "TikTok",        short: "TikTok",  icon: Music2,       tone: "bg-pink-500/15 text-pink-300 border-pink-500/20" },
  wa:      { label: "WhatsApp",      short: "WA",      icon: MessageCircle,tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20" },
  website: { label: "Website",       short: "Web",     icon: Globe,        tone: "bg-violet-500/15 text-violet-300 border-violet-500/20" },
  mixed:   { label: "Campuran",      short: "Mix",     icon: Layers,       tone: "bg-white/10 text-white/70 border-white/15" },
};
```
Catatan: `offline` diberi label **"POS / Offline"** (short "POS") supaya transaksi kasir kebaca jelas.

### 2. Komponen badge channel (baru, kecil)
`apps/web/src/components/penjualan/channel-badge.tsx` — `<ChannelBadge channel size?>` render ikon + label dari `CHANNEL_META`. Dipakai di baris list & detail invoice (ganti dua tempat badge inline yang sekarang).

### 3. Filter chip + hitungan (ganti dropdown)
Di `invoice-client.tsx`, ganti `<select>` channel jadi **segmented chips**:
`[ Semua (N) ] [ POS (n) ] [ Shopee (n) ] [ TikTok (n) ] [ WA (n) ] [ Website (n) ]`
- Hitungan dihitung dari `invoices` (useMemo, count per channel).
- Sembunyikan chip channel yang count = 0 (opsional) biar ringkas.
- Tetap pakai state `channelFilter` yang sudah ada → minim perubahan logika.
- Pertahankan dropdown `status` apa adanya.

---

## Critical Files
- `apps/web/src/lib/channels.ts` — **baru**, `CHANNEL_META` (sumber tunggal).
- `apps/web/src/components/penjualan/channel-badge.tsx` — **baru**, `<ChannelBadge>`.
- `apps/web/src/components/penjualan/invoice-client.tsx` — **edit**: hapus `channelTone`/`channelLabel` lokal → impor dari `channels.ts`; ganti dua badge inline (line ~613, ~1253) jadi `<ChannelBadge>`; ganti `<select>` channel jadi chip+count.
- (Opsional, fase lanjut) reuse `CHANNEL_META` di `pos-client.tsx` (brand chips tetap, tapi channel selalu offline) & laporan profit-per-channel (B4) biar warnanya seragam.

## Reuse yang sudah ada
- `CUSTOMER_CHANNELS` (`@sneakervault/shared`) untuk label fallback.
- `channelTone`/`channelLabel` lama → dipindah ke `channels.ts` (bukan ditambah).
- Pola chip segmented sudah dipakai di `pos-client.tsx` (brand chips) → tiru gayanya untuk filter channel (tapi versi tema gelap untuk invoice).

## Verifikasi (end-to-end)
1. Build hijau: `pnpm --filter @sneakervault/web type-check` + `build`.
2. Buka `/penjualan/invoice`:
   - Tiap baris menampilkan badge channel berikon (POS/Offline biru, Shopee oranye, TikTok pink, WA hijau, Website ungu).
   - Klik chip "POS" → hanya invoice channel `offline` tampil; hitungan tiap chip cocok dengan jumlah baris.
   - Filter status tetap berfungsi bersama filter channel.
3. Buat 1 transaksi POS → muncul di Invoice Penjualan dengan badge **POS**, dan **tidak** muncul di Order Masuk.
4. (MCP) opsional: `select channel, count(*) from sales_invoices group by channel;` → cocokkan dengan hitungan chip.

---

## Catatan
- Order Masuk (`/orders` = packing sessions) **tidak diubah** — POS memang tidak masuk situ (walk-in, tanpa packing). Itu sudah benar.
- Tone badge sengaja tetap gaya gelap karena halaman invoice di dashboard gelap (beda dari POS yang putih).
