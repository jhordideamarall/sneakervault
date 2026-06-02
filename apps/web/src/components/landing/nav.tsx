"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { cn } from "@sneakervault/ui";
import { Wordmark } from "./wordmark";
import { CONTAINER } from "./styles";

const LINKS = [
  { href: "#fitur", label: "Fitur" },
  { href: "#keamanan", label: "Keamanan" },
  { href: "#alur", label: "Cara Kerja" },
  { href: "#kolaborasi", label: "Kolaborasi" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-colors duration-300",
        scrolled
          ? "border-b border-neutral-200/80 bg-white/80 backdrop-blur-xl"
          : "border-b border-transparent bg-white/0",
      )}
    >
      <div className={cn(CONTAINER, "flex h-16 items-center justify-between")}>
        <Wordmark />

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-neutral-600 transition-colors hover:text-neutral-950"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/login"
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-950"
          >
            Masuk
          </Link>
          <Link
            href="/login"
            className="group inline-flex items-center gap-1.5 rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Mulai
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="grid size-9 place-items-center rounded-lg text-neutral-700 hover:bg-neutral-100 md:hidden"
          aria-label="Menu"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-neutral-200 bg-white md:hidden">
          <div className={cn(CONTAINER, "flex flex-col gap-1 py-4")}>
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/login"
              className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white"
            >
              Masuk ke sistem
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
