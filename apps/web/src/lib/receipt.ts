// Shared receipt settings shape — used by the POS receipt UI, the settings
// dialog, and the server action that persists them in app_settings.

export type ReceiptSettings = {
  store_name: string;
  address: string;
  phone: string;
  header: string;
  footer: string;
  paper_size: "58mm" | "80mm";
};

export const RECEIPT_SETTINGS_KEY = "receipt_settings";

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  store_name: "Vault Store",
  address: "",
  phone: "",
  header: "",
  footer: "Terima kasih sudah berbelanja!",
  paper_size: "58mm",
};

export function mergeReceiptSettings(value: unknown): ReceiptSettings {
  if (!value || typeof value !== "object") return DEFAULT_RECEIPT_SETTINGS;
  const v = value as Partial<ReceiptSettings>;
  return {
    store_name: v.store_name ?? DEFAULT_RECEIPT_SETTINGS.store_name,
    address: v.address ?? DEFAULT_RECEIPT_SETTINGS.address,
    phone: v.phone ?? DEFAULT_RECEIPT_SETTINGS.phone,
    header: v.header ?? DEFAULT_RECEIPT_SETTINGS.header,
    footer: v.footer ?? DEFAULT_RECEIPT_SETTINGS.footer,
    paper_size: v.paper_size === "80mm" ? "80mm" : "58mm",
  };
}
