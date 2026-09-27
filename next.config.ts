import type { NextConfig } from "next";

const basePath = process.env.SITE_BASE_PATH ?? "";
const apiInternalUrl = process.env.API_INTERNAL_URL;

const nextConfig: NextConfig = {
  basePath,
  ...(apiInternalUrl
    ? {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${apiInternalUrl}/api/:path*` }];
        },
      }
    : {}),
};

export default nextConfig;
