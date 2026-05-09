import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@sneakervault/ui",
    "@sneakervault/supabase",
    "@sneakervault/shared",
    "@sneakervault/barcode",
  ],
};

export default nextConfig;
