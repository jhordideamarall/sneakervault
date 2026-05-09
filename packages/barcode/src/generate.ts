"use client";

import JsBarcode from "jsbarcode";

export interface BarcodeLabel {
  barcode: string;
  brand?: string;
  model?: string;
  size?: number | string;
  date?: string;
}

/**
 * Generate a barcode SVG string with label text (brand, model, size, date).
 * Mimics the Accurate barcode label format.
 */
export function generateBarcodeSvg(value: string, options?: {
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  label?: Omit<BarcodeLabel, "barcode">;
}): string {
  if (typeof window === "undefined") return "";

  const label = options?.label;
  const hasLabel = label && (label.brand || label.model || label.size || label.date);

  // Generate barcode SVG
  const barcodeSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(barcodeSvg, value, {
    format: options?.format ?? "CODE128",
    width: options?.width ?? 2,
    height: options?.height ?? 80,
    displayValue: options?.displayValue ?? true,
    margin: 10,
  });

  if (!hasLabel) {
    return new XMLSerializer().serializeToString(barcodeSvg);
  }

  // Build label lines
  const line1 = [label.brand, label.model, label.size ? `Size ${label.size}` : ""].filter(Boolean).join(" — ");
  const line2 = label.date || "";
  const labelHeight = (line1 ? 20 : 0) + (line2 ? 18 : 0) + 8;

  // Get barcode dimensions
  const barcodeWidth = Number(barcodeSvg.getAttribute("width") || 200);
  const barcodeHeight = Number(barcodeSvg.getAttribute("height") || 120);
  const totalHeight = barcodeHeight + labelHeight;

  // Build wrapper SVG with label on top
  let svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${barcodeWidth}" height="${totalHeight}" viewBox="0 0 ${barcodeWidth} ${totalHeight}">`;
  svgStr += `<rect width="100%" height="100%" fill="white"/>`;

  // Label text
  let y = 18;
  if (line1) {
    svgStr += `<text x="${barcodeWidth / 2}" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="bold">${escapeXml(line1)}</text>`;
    y += 18;
  }
  if (line2) {
    svgStr += `<text x="${barcodeWidth / 2}" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11">${escapeXml(line2)}</text>`;
  }

  // Embed barcode below label
  const barcodeInner = new XMLSerializer().serializeToString(barcodeSvg)
    .replace(/<svg[^>]*>/, `<svg x="0" y="${labelHeight}" width="${barcodeWidth}" height="${barcodeHeight}">`)
  svgStr += barcodeInner;
  svgStr += `</svg>`;

  return svgStr;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
