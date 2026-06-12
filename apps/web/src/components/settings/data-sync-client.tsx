"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Database,
  Download,
  FileText,
  FileUp,
  Upload,
  Volume2,
} from "lucide-react";
import { Alert, Badge, Button, Card } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import {
  importCutoverRows,
  type DataSyncImportKind,
  type DataSyncImportResult,
} from "@/lib/actions/data-sync";
import type { CoaRow } from "@/lib/queries";

type Config = {
  label: string;
  badge: string;
  columns: string[];
  aliases: Record<string, string[]>;
  templateRows: Record<string, string | number | boolean>[];
};

type Preview = {
  kind: DataSyncImportKind;
  fileName: string;
  rows: Record<string, unknown>[];
};

type PdfTemplate = "bca_statement" | "shopee_settlement";

type PdfRow = Record<string, string | number>;

const IMPORTS: Record<DataSyncImportKind, Config> = {
  suppliers: {
    label: "Supplier",
    badge: "Master",
    columns: ["name", "contact_person", "phone", "email", "address", "notes"],
    aliases: {
      name: ["name", "nama", "supplier", "vendor", "nama supplier"],
      contact_person: ["contact_person", "pic", "kontak", "contact"],
      phone: ["phone", "telp", "telepon", "hp"],
      email: ["email"],
      address: ["address", "alamat"],
      notes: ["notes", "catatan", "keterangan"],
    },
    templateRows: [
      {
        name: "Dewi Supplier Sneakers",
        contact_person: "Ibu Dewi",
        phone: "08123456789",
        email: "",
        address: "Bali",
        notes: "Cutover Accurate",
      },
    ],
  },
  customers: {
    label: "Customer",
    badge: "Master",
    columns: ["name", "contact_person", "phone", "email", "address", "channel", "npwp", "notes"],
    aliases: {
      name: ["name", "nama", "customer", "pelanggan", "nama customer"],
      contact_person: ["contact_person", "pic", "kontak", "contact"],
      phone: ["phone", "telp", "telepon", "hp"],
      email: ["email"],
      address: ["address", "alamat"],
      channel: ["channel", "kanal", "platform"],
      npwp: ["npwp"],
      notes: ["notes", "catatan", "keterangan"],
    },
    templateRows: [
      {
        name: "Walk-in Customer",
        contact_person: "",
        phone: "",
        email: "",
        address: "",
        channel: "offline",
        npwp: "",
        notes: "Cutover Accurate",
      },
    ],
  },
  products: {
    label: "Produk + Stok",
    badge: "Inventory",
    columns: [
      "brand",
      "model",
      "sku",
      "size",
      "color",
      "barcode",
      "quantity",
      "hpp",
      "sell_price",
      "price_offline",
      "supplier_name",
      "condition",
      "defect_reason",
    ],
    aliases: {
      brand: ["brand", "merk", "merek"],
      model: ["model", "nama produk", "item", "item name", "description"],
      sku: ["sku", "kode barang", "kode item", "item no", "no barang"],
      size: ["size", "ukuran"],
      color: ["color", "warna"],
      barcode: ["barcode", "kode barcode", "upc"],
      quantity: ["quantity", "qty", "stok", "saldo stok", "stock"],
      hpp: ["hpp", "cost", "harga pokok", "average cost", "hpp akhir"],
      sell_price: ["sell_price", "harga jual", "harga online", "price online"],
      price_offline: ["price_offline", "harga offline", "harga toko"],
      supplier_name: ["supplier_name", "supplier", "vendor"],
      condition: ["condition", "kondisi", "status fisik"],
      defect_reason: ["defect_reason", "alasan defect", "catatan kondisi"],
    },
    templateRows: [
      {
        brand: "Adidas",
        model: "Samba White",
        sku: "SMB-WHT-40",
        size: 40,
        color: "White",
        barcode: "104100",
        quantity: 3,
        hpp: 1200000,
        sell_price: 1800000,
        price_offline: 1650000,
        supplier_name: "Dewi Supplier Sneakers",
        condition: "normal",
        defect_reason: "",
      },
    ],
  },
  bank_accounts: {
    label: "Akun Kas/Bank",
    badge: "Finance",
    columns: [
      "name",
      "type",
      "bank_name",
      "account_number",
      "account_holder",
      "opening_balance",
      "currency",
      "is_default",
      "notes",
    ],
    aliases: {
      name: ["name", "nama", "akun", "nama akun"],
      type: ["type", "tipe", "jenis"],
      bank_name: ["bank_name", "bank", "nama bank"],
      account_number: ["account_number", "rekening", "nomor rekening"],
      account_holder: ["account_holder", "pemilik", "atas nama"],
      opening_balance: ["opening_balance", "saldo awal", "saldo", "balance"],
      currency: ["currency", "mata uang"],
      is_default: ["is_default", "default"],
      notes: ["notes", "catatan", "keterangan"],
    },
    templateRows: [
      {
        name: "BCA Operasional",
        type: "bank",
        bank_name: "BCA",
        account_number: "1234567890",
        account_holder: "Dewinst",
        opening_balance: 25000000,
        currency: "IDR",
        is_default: true,
        notes: "Cutover Accurate",
      },
    ],
  },
  opening_balance: {
    label: "Saldo Awal CoA",
    badge: "Journal",
    columns: ["account_code", "description", "debit", "credit"],
    aliases: {
      account_code: ["account_code", "kode akun", "account", "coa", "no akun"],
      description: ["description", "nama akun", "catatan", "keterangan"],
      debit: ["debit", "debet", "dr"],
      credit: ["credit", "kredit", "cr"],
    },
    templateRows: [
      { account_code: "1.1.02", description: "Bank", debit: 25000000, credit: 0 },
      { account_code: "3.1.01", description: "Modal Owner", debit: 0, credit: 25000000 },
    ],
  },
  sales_outstanding: {
    label: "Piutang Outstanding",
    badge: "AR",
    columns: [
      "invoice_number",
      "customer_name",
      "channel",
      "invoice_date",
      "due_date",
      "subtotal",
      "discount",
      "shipping",
      "marketplace_fee",
      "tax",
      "total",
      "paid_amount",
      "marketplace_order_id",
      "notes",
    ],
    aliases: {
      invoice_number: ["invoice_number", "nomor invoice", "no invoice", "no faktur"],
      customer_name: ["customer_name", "customer", "nama customer", "pelanggan"],
      channel: ["channel", "kanal", "platform"],
      invoice_date: ["invoice_date", "tanggal invoice", "tanggal"],
      due_date: ["due_date", "jatuh tempo", "tempo"],
      subtotal: ["subtotal", "dpp"],
      discount: ["discount", "diskon"],
      shipping: ["shipping", "ongkir"],
      marketplace_fee: ["marketplace_fee", "biaya marketplace", "fee"],
      tax: ["tax", "pajak", "ppn"],
      total: ["total", "nilai", "tagihan"],
      paid_amount: ["paid_amount", "sudah dibayar", "terbayar"],
      marketplace_order_id: ["marketplace_order_id", "order id", "no pesanan"],
      notes: ["notes", "catatan", "keterangan"],
    },
    templateRows: [
      {
        invoice_number: "AR-ACCURATE-001",
        customer_name: "Customer Lama",
        channel: "wa",
        invoice_date: "2026-06-01",
        due_date: "2026-06-15",
        subtotal: 1800000,
        discount: 0,
        shipping: 0,
        marketplace_fee: 0,
        tax: 0,
        total: 1800000,
        paid_amount: 0,
        marketplace_order_id: "",
        notes: "Outstanding dari Accurate",
      },
    ],
  },
  purchase_outstanding: {
    label: "Hutang Outstanding",
    badge: "AP",
    columns: ["invoice_number", "supplier_name", "invoice_date", "due_date", "subtotal", "tax", "total", "paid_amount", "notes"],
    aliases: {
      invoice_number: ["invoice_number", "nomor faktur", "no invoice", "no faktur"],
      supplier_name: ["supplier_name", "supplier", "vendor", "nama supplier"],
      invoice_date: ["invoice_date", "tanggal invoice", "tanggal"],
      due_date: ["due_date", "jatuh tempo", "tempo"],
      subtotal: ["subtotal", "dpp"],
      tax: ["tax", "pajak", "ppn"],
      total: ["total", "nilai", "tagihan"],
      paid_amount: ["paid_amount", "sudah dibayar", "terbayar"],
      notes: ["notes", "catatan", "keterangan"],
    },
    templateRows: [
      {
        invoice_number: "AP-ACCURATE-001",
        supplier_name: "Dewi Supplier Sneakers",
        invoice_date: "2026-06-01",
        due_date: "2026-06-20",
        subtotal: 1200000,
        tax: 0,
        total: 1200000,
        paid_amount: 0,
        notes: "Outstanding dari Accurate",
      },
    ],
  },
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
}

function valueFor(row: Record<string, unknown>, names: string[]) {
  const entries = Object.entries(row);
  const wanted = new Set(names.map(normalizeHeader));
  const found = entries.find(([key]) => wanted.has(normalizeHeader(key)));
  return found?.[1] ?? "";
}

function normalizeRows(kind: DataSyncImportKind, rows: Record<string, unknown>[]) {
  const config = IMPORTS[kind];
  return rows.map((row) => {
    const mapped: Record<string, unknown> = {};
    for (const column of config.columns) {
      mapped[column] = valueFor(row, [column, ...(config.aliases[column] ?? [])]);
    }
    return mapped;
  });
}

function fmt(n: number) {
  return Math.round(n).toLocaleString("id-ID");
}

function normalizeNumber(value: string) {
  const cleaned = value
    .replace(/rp|idr/gi, "")
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");
  const decimalComma = cleaned.includes(",") && cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".");
  const normalized = decimalComma
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBcaStatement(text: string): PdfRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const date = line.match(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/)?.[0] ?? "";
      const amountMatches = line.match(/(?:Rp\s*)?-?\d[\d.,]*(?:\s*(?:DB|CR))?/gi) ?? [];
      const lastAmount = amountMatches.at(-1) ?? "";
      const marker = lastAmount.toUpperCase().includes("DB")
        ? "debit"
        : lastAmount.toUpperCase().includes("CR")
          ? "credit"
          : /kredit|credit|cr\b/i.test(line)
            ? "credit"
            : "debit";
      const amount = Math.abs(normalizeNumber(lastAmount));
      const description = line
        .replace(date, "")
        .replace(lastAmount, "")
        .replace(/\s+/g, " ")
        .trim();
      return date && amount > 0
        ? { date, description, type: marker, amount }
        : null;
    })
    .filter((row) => row !== null) as PdfRow[];
}

function parseShopeeSettlement(text: string): PdfRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const orderId = line.match(/\b(?:\d{10,}|[A-Z0-9]{8,})\b/)?.[0] ?? "";
      const numbers = (line.match(/(?:Rp\s*)?-?\d[\d.,]*/gi) ?? []).map(normalizeNumber);
      if (!orderId || numbers.length === 0) return null;
      const net = numbers.at(-1) ?? 0;
      const gross = numbers[0] ?? net;
      const fee = numbers.length >= 3 ? Math.abs(numbers[numbers.length - 2] ?? 0) : Math.max(gross - net, 0);
      return { order_id: orderId, gross, fee, net, raw: line };
    })
    .filter((row) => row !== null) as PdfRow[];
}

function rowsToCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0] ?? {});
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [columns.join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n");
}

export function DataSyncClient({ accounts }: { accounts: CoaRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<DataSyncImportKind>("products");
  const [cutoffDate, setCutoffDate] = useState(todayIso());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<DataSyncImportResult | null>(null);
  const [pdfTemplate, setPdfTemplate] = useState<PdfTemplate>("bca_statement");
  const [pdfText, setPdfText] = useState("");
  const [pdfRows, setPdfRows] = useState<PdfRow[]>([]);

  const config = IMPORTS[active];
  const accountRows = useMemo(
    () => accounts.filter((account) => account.is_active),
    [accounts],
  );

  async function downloadTemplate(kind: DataSyncImportKind) {
    const XLSX = await import("xlsx");
    const cfg = IMPORTS[kind];
    const ws = XLSX.utils.json_to_sheet(cfg.templateRows, { header: cfg.columns });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, cfg.label.slice(0, 31));
    XLSX.writeFile(wb, `dewins-${kind}-template.xlsx`);
  }

  async function handleFile(file: File) {
    const XLSX = await import("xlsx");
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const data = isCsv ? await file.text() : await file.arrayBuffer();
    const wb = XLSX.read(data, { type: isCsv ? "string" : "array", cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("File kosong");
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error("Sheet tidak ditemukan");
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      raw: false,
      defval: "",
      dateNF: "yyyy-mm-dd",
    });
    const rows = normalizeRows(active, raw);
    setPreview({ kind: active, fileName: file.name, rows });
    setResult(null);
  }

  function confirmImport() {
    if (!preview) return;
    startTransition(async () => {
      const response = await importCutoverRows(preview.kind, preview.rows, {
        cutoff_date: cutoffDate,
      });
      setResult(response);
      toast.push(
        `${response.inserted} masuk, ${response.updated} update, ${response.skipped} dilewati`,
        response.errors.length > 0 ? "info" : "success",
      );
      router.refresh();
    });
  }

  function runPdfParser() {
    const rows =
      pdfTemplate === "bca_statement"
        ? parseBcaStatement(pdfText)
        : parseShopeeSettlement(pdfText);
    setPdfRows(rows);
    toast.push(`${rows.length} baris terdeteksi`, rows.length > 0 ? "success" : "info");
  }

  function downloadPdfRows() {
    const csv = rowsToCsv(pdfRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pdfTemplate}-parsed.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function testNotificationSound() {
    const audio = new Audio("/sounds/simple-happy-beep.ogg");
    audio.volume = 0.55;
    void audio.play().catch(() => toast.push("Browser memblokir audio sampai ada interaksi user", "info"));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-white/40">
            <Database size={18} />
            <span className="text-xs font-semibold uppercase tracking-[0.12em]">
              Cutover Accurate
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white/90">Sinkronisasi Data</h1>
          <p className="mt-1 text-sm text-white/45">
            Import master, saldo awal, piutang, hutang, dan hasil parser PDF deterministik.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-[0.1em] text-white/35">
            Cutoff
          </label>
          <input
            type="date"
            value={cutoffDate}
            onChange={(event) => setCutoffDate(event.target.value)}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/80 outline-none focus:border-white/20"
          />
          <Button type="button" variant="secondary" size="sm" onClick={testNotificationSound}>
            <Volume2 size={14} className="mr-1.5" />
            Test Sound
          </Button>
        </div>
      </div>

      <Alert tone="warning">
        Jalankan cutover sebelum transaksi harian. Saldo awal harus balance dan tidak boleh dibuat dua kali
        pada tanggal yang sama.
      </Alert>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(IMPORTS) as DataSyncImportKind[]).map((kind) => {
          const item = IMPORTS[kind];
          const selected = active === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => {
                setActive(kind);
                setPreview(null);
                setResult(null);
              }}
              className={`rounded-lg border p-4 text-left transition-colors ${
                selected
                  ? "border-blue-400/30 bg-blue-500/10"
                  : "border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-center justify-between">
                <Badge tone={selected ? "info" : "neutral"}>{item.badge}</Badge>
                {selected && <CheckCircle2 size={16} className="text-blue-300" />}
              </div>
              <div className="mt-3 text-sm font-semibold text-white/80">{item.label}</div>
              <div className="mt-1 text-xs text-white/35">{item.columns.length} kolom template</div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone="info">{config.badge}</Badge>
                <h2 className="text-lg font-semibold text-white/90">{config.label}</h2>
              </div>
              <p className="mt-1 text-xs text-white/40">
                Format kolom: <span className="font-mono text-white/60">{config.columns.join(", ")}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => downloadTemplate(active)}>
                <Download size={14} className="mr-1.5" />
                Template
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15">
                <FileUp size={14} />
                Pilih File
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    handleFile(file).catch((error) =>
                      toast.push(error instanceof Error ? error.message : "Gagal membaca file", "error"),
                    );
                  }}
                />
              </label>
            </div>
          </div>

          {preview ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-4 py-3">
                <div className="flex items-center gap-3">
                  <Upload size={16} className="text-white/40" />
                  <div>
                    <div className="text-sm font-medium text-white/80">{preview.fileName}</div>
                    <div className="text-xs text-white/35">{preview.rows.length} baris siap diproses</div>
                  </div>
                </div>
                <Button type="button" size="sm" disabled={pending} onClick={confirmImport}>
                  {pending ? "Memproses..." : "Proses Import"}
                  <ChevronRight size={14} className="ml-1.5" />
                </Button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="border-b border-white/[0.06] bg-white/[0.03] text-white/35">
                    <tr>
                      {config.columns.slice(0, 8).map((column) => (
                        <th key={column} className="px-3 py-2 font-medium">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 8).map((row, idx) => (
                      <tr key={idx} className="border-b border-white/[0.035] text-white/65 last:border-0">
                        {config.columns.slice(0, 8).map((column) => (
                          <td key={column} className="max-w-[180px] truncate px-3 py-2">
                            {String(row[column] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.08] bg-black/10 text-center">
              <FileText size={28} className="mb-3 text-white/25" />
              <div className="text-sm font-medium text-white/60">Belum ada file dipilih</div>
              <div className="mt-1 text-xs text-white/30">Download template lalu upload Excel/CSV hasil export.</div>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <Alert tone={result.errors.length > 0 ? "warning" : "success"}>
                Masuk: {result.inserted} · Update: {result.updated} · Dilewati: {result.skipped} · Error:
                {" "}{result.errors.length}
                {result.journal_id ? ` · Jurnal: ${result.journal_id}` : ""}
              </Alert>
              {result.errors.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-3 text-xs text-amber-200/80">
                  {result.errors.map((error, idx) => (
                    <div key={idx} className="font-mono">
                      baris {error.row}: {error.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-300" />
              <h3 className="text-sm font-semibold text-white/80">Urutan Cutover</h3>
            </div>
            <ol className="space-y-2 text-xs text-white/45">
              <li>1. Supplier dan customer</li>
              <li>2. Produk + stok + HPP</li>
              <li>3. Akun kas/bank</li>
              <li>4. Saldo awal CoA</li>
              <li>5. Piutang dan hutang outstanding</li>
            </ol>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-4">
            <h3 className="mb-3 text-sm font-semibold text-white/80">CoA Aktif</h3>
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {accountRows.map((account) => (
                <div key={account.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-mono text-white/45">{account.code}</span>
                  <span className="truncate text-white/60">{account.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Card className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone="neutral">PDF</Badge>
              <h2 className="text-lg font-semibold text-white/90">Parser PDF Deterministik</h2>
            </div>
            <p className="mt-1 text-xs text-white/40">
              Paste teks hasil PDF/MarkItDown, lalu export CSV hasil parse.
            </p>
          </div>
          <select
            value={pdfTemplate}
            onChange={(event) => setPdfTemplate(event.target.value as PdfTemplate)}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/80 outline-none"
          >
            <option className="bg-[#262626]" value="bca_statement">BCA / Bank Statement</option>
            <option className="bg-[#262626]" value="shopee_settlement">Shopee Settlement</option>
          </select>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <textarea
            value={pdfText}
            onChange={(event) => setPdfText(event.target.value)}
            placeholder="Paste teks PDF di sini"
            className="min-h-[260px] rounded-lg border border-white/[0.08] bg-black/20 p-4 font-mono text-xs text-white/70 outline-none placeholder:text-white/20 focus:border-white/20"
          />
          <div className="rounded-lg border border-white/[0.06] bg-black/10">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <span className="text-sm font-medium text-white/75">{pdfRows.length} baris</span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={runPdfParser}>
                  Parse
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={pdfRows.length === 0} onClick={downloadPdfRows}>
                  <Download size={14} className="mr-1.5" />
                  CSV
                </Button>
              </div>
            </div>
            <div className="max-h-[260px] overflow-auto p-3">
              {pdfRows.length === 0 ? (
                <div className="py-16 text-center text-sm text-white/25">Belum ada hasil parse</div>
              ) : (
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="text-white/35">
                    <tr>
                      {Object.keys(pdfRows[0] ?? {}).map((column) => (
                        <th key={column} className="px-2 py-2 font-medium">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pdfRows.slice(0, 40).map((row, idx) => (
                      <tr key={idx} className="border-t border-white/[0.04] text-white/60">
                        {Object.keys(pdfRows[0] ?? {}).map((column) => (
                          <td key={column} className="max-w-[180px] truncate px-2 py-2">
                            {typeof row[column] === "number" ? fmt(row[column] as number) : String(row[column] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
