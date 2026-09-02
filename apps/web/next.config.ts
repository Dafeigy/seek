import type { NextConfig } from "next";

function parseOrigins(value: string | undefined): string[] {
  return value?.split(/[\s,]+/).map((origin) => origin.trim()).filter(Boolean) ?? [];

}

const allowedDevOrigins = [
  "127.0.0.1",
  "::1",
  ...parseOrigins(process.env.SEEK_DETECTED_DEV_ORIGINS),
  ...parseOrigins(process.env.SEEK_ALLOWED_DEV_ORIGINS),
  ...parseOrigins(process.env.NEXT_PUBLIC_SEEK_DEV_HOST),
];

const nextConfig: NextConfig = {
  // Dynamic document routes are generated from user-provided IDs in Phase 0.
  typedRoutes: false,
  allowedDevOrigins:
    process.env.NODE_ENV === "development" ? [...new Set(allowedDevOrigins)] : undefined,
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
