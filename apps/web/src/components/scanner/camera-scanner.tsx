"use client";

import { useCameraScanner } from "@sneakervault/barcode";

export function CameraScanner({ onScan }: { onScan: (code: string) => void }) {
  const { ref } = useCameraScanner({
    onDecodeResult: (result) => {
      // Play a short beep or haptic if supported? (optional, for later)
      onScan(result.getText());
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
        className="w-full h-64 object-contain" // Use contain to see whole frame
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

