/**
 * Client-safe marketplace settlement parsers.
 *
 * Settlement files key on the marketplace order id and carry the actual net
 * payout + total fees. TikTok and Tokopedia share one export shape; Shopee's
 * income report differs — header aliases cover both. Rows are aggregated per
 * order id (an order can have multiple settlement lines).
 */

import { readNumber, type MarketplaceChannel } from "./parsers";

export type SettlementRow = {
  order_id: string;
  net: number;
  fee: number;
};

type Row = Record<string, unknown>;

function pick(row: Row, aliases: string[]): unknown {
  for (const a of aliases) {
    if (a in row && row[a] !== "" && row[a] != null) return row[a];
  }
  const lower = new Map(Object.keys(row).map((k) => [k.toLowerCase().trim(), k]));
  for (const a of aliases) {
    const hit = lower.get(a.toLowerCase().trim());
    if (hit && row[hit] !== "" && row[hit] != null) return row[hit];
  }
  return "";
}

const ORDER_ALIASES = [
  "ID Pesanan/Penyesuaian",
  "No. Pesanan",
  "Order ID",
  "Nomor Pesanan",
  "Order/adjustment ID",
];

const NET_ALIASES = [
  "Jumlah penyelesaian pembayaran",
  "Total Penghasilan",
  "Total Pembayaran",
  "Dana Dilepas ke Saldo",
  "Total settlement amount",
  "Total Released Amount",
];

const FEE_ALIASES = [
  "Total Biaya",
  "Biaya Administrasi",
  "Biaya komisi platform",
  "Total Fees",
  "Biaya Layanan",
];

export function parseSettlementFile(
  _channel: MarketplaceChannel,
  rows: Row[],
): SettlementRow[] {
  const map = new Map<string, SettlementRow>();
  for (const row of rows) {
    const orderId = String(pick(row, ORDER_ALIASES) || "").trim();
    if (!orderId) continue;
    const net = readNumber(pick(row, NET_ALIASES));
    const fee = Math.abs(readNumber(pick(row, FEE_ALIASES)));
    if (!map.has(orderId)) {
      map.set(orderId, { order_id: orderId, net: 0, fee: 0 });
    }
    const acc = map.get(orderId)!;
    acc.net += net;
    acc.fee += fee;
  }
  return Array.from(map.values()).filter((r) => r.net !== 0 || r.fee !== 0);
}
