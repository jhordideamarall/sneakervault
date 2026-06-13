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

export type SettlementWorkbookSheet = {
  name: string;
  rows: unknown[][];
};

export type SettlementParseResult = {
  rows: SettlementRow[];
  templateLabel: string;
  sourceSheet: string;
  headerRow: number;
  ignoredSheets: string[];
};

type Row = Record<string, unknown>;

type TemplateDef = {
  id: string;
  label: string;
  channels: MarketplaceChannel[];
  preferredSheets: string[];
  required: string[][];
  orderAliases: string[];
  netAliases: string[];
  feeAliases: string[];
  feeMode: "pick" | "sum";
};

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

const SHOPEE_INCOME_FEE_ALIASES = [
  "Biaya Komisi AMS",
  "Biaya Administrasi",
  "Biaya Layanan",
  "Biaya Proses Pesanan",
  "Premi",
  "Biaya Program Hemat Biaya Kirim",
  "Biaya Transaksi",
  "Biaya Kampanye",
  "Bea Masuk, PPN & PPh",
  "Biaya Isi Saldo Otomatis (dari Penghasilan)",
];

const TEMPLATES: TemplateDef[] = [
  {
    id: "shopee-income",
    label: "Shopee Income",
    channels: ["shopee"],
    preferredSheets: ["income"],
    required: [["No. Pesanan"], ["Total Penghasilan"]],
    orderAliases: ["No. Pesanan"],
    netAliases: ["Total Penghasilan"],
    feeAliases: SHOPEE_INCOME_FEE_ALIASES,
    feeMode: "sum",
  },
  {
    id: "tiktok-tokopedia-detail",
    label: "TikTok/Tokopedia Detail Pesanan",
    channels: ["tiktok", "tokopedia"],
    preferredSheets: ["detail pesanan"],
    required: [
      ["ID Pesanan/Penyesuaian", "Order/adjustment ID"],
      ["Jumlah penyelesaian pembayaran", "Total settlement amount"],
      ["Total Biaya", "Total Fees"],
    ],
    orderAliases: ["ID Pesanan/Penyesuaian", "Order/adjustment ID"],
    netAliases: ["Jumlah penyelesaian pembayaran", "Total settlement amount"],
    feeAliases: ["Total Biaya", "Total Fees"],
    feeMode: "pick",
  },
];

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/:+$/, "")
    .trim()
    .toLowerCase();
}

function normalizeSheetName(value: string): string {
  return normalizeHeader(value);
}

function hasAlias(headers: Set<string>, aliases: string[]): boolean {
  return aliases.some((a) => headers.has(normalizeHeader(a)));
}

function findHeaderRow(rows: unknown[][], template: TemplateDef): number {
  const maxRows = Math.min(rows.length, 40);
  for (let i = 0; i < maxRows; i++) {
    const headers = new Set((rows[i] ?? []).map(normalizeHeader).filter(Boolean));
    if (template.required.every((aliases) => hasAlias(headers, aliases))) {
      return i;
    }
  }
  return -1;
}

function rowsFromHeader(aoa: unknown[][], headerIndex: number): Row[] {
  const headers = (aoa[headerIndex] ?? []).map((h, i) => {
    const value = String(h ?? "").replace(/\s+/g, " ").trim();
    return value || `__column_${i}`;
  });
  return aoa.slice(headerIndex + 1).map((line) => {
    const row: Row = {};
    headers.forEach((header, i) => {
      row[header] = line[i] ?? "";
    });
    return row;
  });
}

function sumColumns(row: Row, aliases: string[]): number {
  const byHeader = new Map(Object.keys(row).map((k) => [normalizeHeader(k), k]));
  return aliases.reduce((sum, alias) => {
    const key = byHeader.get(normalizeHeader(alias));
    if (!key) return sum;
    return sum + readNumber(row[key]);
  }, 0);
}

function aggregateRows(rows: SettlementRow[]): SettlementRow[] {
  const map = new Map<string, SettlementRow>();
  for (const row of rows) {
    if (!map.has(row.order_id)) {
      map.set(row.order_id, { order_id: row.order_id, net: 0, fee: 0 });
    }
    const acc = map.get(row.order_id)!;
    acc.net += row.net;
    acc.fee += row.fee;
  }
  return Array.from(map.values()).filter((r) => r.net !== 0 || r.fee !== 0);
}

function parseRowsWithTemplate(rows: Row[], template: TemplateDef): SettlementRow[] {
  const parsed: SettlementRow[] = [];
  for (const row of rows) {
    const orderId = String(pick(row, template.orderAliases) || "").trim();
    if (!orderId || orderId === "-") continue;
    const net = readNumber(pick(row, template.netAliases));
    const fee =
      template.feeMode === "sum"
        ? Math.abs(sumColumns(row, template.feeAliases))
        : Math.abs(readNumber(pick(row, template.feeAliases)));
    parsed.push({ order_id: orderId, net, fee });
  }
  return aggregateRows(parsed);
}

export function parseSettlementWorkbook(
  channel: MarketplaceChannel,
  sheets: SettlementWorkbookSheet[],
): SettlementParseResult {
  const candidates = [];
  for (const template of TEMPLATES.filter((t) => t.channels.includes(channel))) {
    for (const sheet of sheets) {
      const headerIndex = findHeaderRow(sheet.rows, template);
      if (headerIndex < 0) continue;
      const rows = parseRowsWithTemplate(rowsFromHeader(sheet.rows, headerIndex), template);
      if (rows.length === 0) continue;
      const normalizedSheet = normalizeSheetName(sheet.name);
      const preferred = template.preferredSheets.includes(normalizedSheet);
      candidates.push({
        rows,
        template,
        sheetName: sheet.name,
        headerIndex,
        score: (preferred ? 10000 : 0) + rows.length,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) {
    return { rows: [], templateLabel: "", sourceSheet: "", headerRow: 0, ignoredSheets: sheets.map((s) => s.name) };
  }

  return {
    rows: best.rows,
    templateLabel: best.template.label,
    sourceSheet: best.sheetName,
    headerRow: best.headerIndex + 1,
    ignoredSheets: sheets.map((s) => s.name).filter((name) => name !== best.sheetName),
  };
}

export function parseSettlementFile(
  _channel: MarketplaceChannel,
  rows: Row[],
): SettlementRow[] {
  return aggregateRows(
    rows.map((row) => ({
      order_id: String(pick(row, ORDER_ALIASES) || "").trim(),
      net: readNumber(pick(row, NET_ALIASES)),
      fee: Math.abs(readNumber(pick(row, FEE_ALIASES))),
    })).filter((row) => Boolean(row.order_id)),
  );
}
