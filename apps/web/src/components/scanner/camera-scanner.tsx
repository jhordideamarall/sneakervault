"use client";

import { useCameraScanner } from "@sneakervault/barcode";

export function CameraScanner({ onScan }: { onScan: (code: string) => void }) {
  const { ref } = useCameraScanner({
    onDecodeResult: (result) => onScan(result.getText()),
  });

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border">
      <video ref={ref} className="w-full max-h-64 object-cover" />
      <p className="p-2 text-center text-xs text-muted">Arahkan kamera ke barcode</p>
    </div>
  );
}
