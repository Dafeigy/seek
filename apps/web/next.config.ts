import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dynamic document routes are generated from user-provided IDs in Phase 0.
  typedRoutes: false,
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
