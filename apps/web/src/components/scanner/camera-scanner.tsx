"use client";

import { useRef } from "react";
import { useCameraScanner } from "@sneakervault/barcode";

export function CameraScanner({
  onScan,
  cooldownMs = 1800,
}: {
  onScan: (code: string) => void;
  cooldownMs?: number;
}) {
  const lastScanRef = useRef({ code: "", at: 0 });
  const { ref } = useCameraScanner({
    onDecodeResult: (result) => {
      const code = result.getText().trim();
      const now = Date.now();
      if (!code) return;
      if (
        lastScanRef.current.code === code &&
        now - lastScanRef.current.at < cooldownMs
      ) {
        return;
      }
      lastScanRef.current = { code, at: now };
      onScan(code);
    },
    constraints: {
      video: {
        facingMode: "environment", // Prefer back camera
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
  });

  return (
    <div className="relative mt-4 overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl">
      <video 
        ref={ref} 
        className="h-56 w-full object-contain sm:h-64" // Use contain to see whole frame
      />
      
      {/* Visual Overlay for Alignment */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-4/5 h-1/2 border-2 border-dashed border-white/20 rounded-lg flex items-center justify-center">
          {/* Animated Scan Line */}
          <div className="w-full h-[1px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse" />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm py-2">
        <p className="text-center text-[10px] font-bold uppercase tracking-widest text-white/60">
          Arahkan Barcode ke Garis Merah
        </p>
      </div>
    </div>
  );
}
