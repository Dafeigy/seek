import type { NextConfig } from "next";

const developmentHost = process.env.NEXT_PUBLIC_SEEK_DEV_HOST?.trim();
const allowedDevOrigins = ["127.0.0.1", "::1", developmentHost].filter(
  (origin): origin is string => Boolean(origin),
);

const nextConfig: NextConfig = {
  // Dynamic document routes are generated from user-provided IDs in Phase 0.
  typedRoutes: false,
  allowedDevOrigins: process.env.NODE_ENV === "development" ? allowedDevOrigins : undefined,
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
