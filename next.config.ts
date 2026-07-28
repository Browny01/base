import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This repository lives below another package-lock on the development Mac.
  // Pinning the real project root keeps Turbopack's file graph small and avoids
  // watching the entire home directory.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
