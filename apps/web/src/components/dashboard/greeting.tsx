"use client";

import { useState } from "react";

export function Greeting({ name }: { name: string }) {
  const [greeting] = useState(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Selamat pagi" : hour < 17 ? "Selamat siang" : "Selamat malam";
  });

  return (
    <h1 className="text-2xl font-bold text-white/90">
      {`${greeting}, ${name} 👋`}
    </h1>
  );
}
