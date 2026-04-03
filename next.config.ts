import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "whatsapp-web.js", "puppeteer"],
};

export default nextConfig;
