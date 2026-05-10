"use client";

import { useState, useEffect } from "react";

export function Greeting({ name }: { name: string }) {
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? "Selamat pagi" : hour < 17 ? "Selamat siang" : "Selamat malam");
  }, []);

  return (
    <h1 className="text-2xl font-bold text-white/90">
      {greeting ? `${greeting}, ${name} 👋` : `Halo, ${name} 👋`}
    </h1>
  );
}
