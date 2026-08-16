import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@github/copilot-sdk", "better-sqlite3"],
};

export default nextConfig;
