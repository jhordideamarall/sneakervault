import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cn } from "@sneakervault/ui";
import { LandingNav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { AntiFraud } from "@/components/landing/anti-fraud";
import { Ecosystem } from "@/components/landing/ecosystem";
import { Messaging } from "@/components/landing/messaging";
import { CTA } from "@/components/landing/cta";
import { LandingFooter } from "@/components/landing/footer";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Vault — Stok, Kasir & Akuntansi dalam Satu Sistem",
  description:
    "Vault menyatukan inventory, POS, pembelian, kas & bank, dan akuntansi dengan audit trail anti-fraud dan akuntansi otomatis. Pengganti Accurate yang nyatu dengan stok.",
};

export default function LandingPage() {
  return (
    <div
      className={cn(
        geistSans.variable,
        geistMono.variable,
        "min-h-dvh bg-white font-[family-name:var(--font-geist-sans)] text-neutral-950 antialiased",
      )}
    >
      <LandingNav />
      <main>
        <Hero />
        <Features />
        <AntiFraud />
        <Ecosystem />
        <Messaging />
        <CTA />
      </main>
      <LandingFooter />
    </div>
  );
}
