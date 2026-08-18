import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    cpus: 2,
  },
  serverExternalPackages: ["@github/copilot-sdk", "better-sqlite3"],
};

export default nextConfig;
