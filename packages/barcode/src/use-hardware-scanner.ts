"use client";

import { useEffect, useRef, useState } from "react";

const SCANNER_THRESHOLD_MS = 50;
const MIN_BARCODE_LENGTH = 4;

interface UseHardwareScannerOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
}

/**
 * Detects USB barcode scanner input by identifying rapid sequential keystrokes.
 * Hardware scanners send characters much faster than human typing (< 50ms apart).
 */
export function useHardwareScanner({
  onScan,
  enabled = true,
}: UseHardwareScannerOptions) {
  const buffer = useRef<string>("");
  const lastKeyTime = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      const now = Date.now();
      const timeDiff = now - lastKeyTime.current;
      lastKeyTime.current = now;

      // Reset buffer if gap is too large (human typing)
      if (timeDiff > 300 && buffer.current.length > 0) {
        buffer.current = "";
      }

      if (e.key === "Enter") {
        const barcode = buffer.current.trim();
        if (barcode.length >= MIN_BARCODE_LENGTH) {
          onScan(barcode);
        }
        buffer.current = "";
        return;
      }

      // Only accumulate if input is fast (scanner-like)
      if (timeDiff < SCANNER_THRESHOLD_MS || buffer.current.length === 0) {
        if (e.key.length === 1) {
          buffer.current += e.key;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onScan, enabled]);
}
