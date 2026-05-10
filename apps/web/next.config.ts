import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@sneakervault/ui",
    "@sneakervault/supabase",
    "@sneakervault/shared",
    "@sneakervault/barcode",
  ],
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "framer-motion",
      "date-fns",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "i.pravatar.cc",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
