import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: false,
  // All OAuth flows use SITE_URL as their callback origin. Starting them on a
  // different .vercel.app hostname splits host-only state/session cookies and
  // prevents the callback from completing. Redirect alternate public hosts
  // before any auth request, retaining URL path and query parameters.
  async redirects() {
    return [
      ...[
        "prospect-studio-kappa.vercel.app",
        "prospect-studio-git-main-johnnyc.vercel.app",
      ].map((host) => ({
        source: "/:path*",
        has: [{ type: "host" as const, value: host }],
        destination: "https://prospect-studio-johnnyc.vercel.app/:path*",
        permanent: false,
      })),
    ];
  },
  // The MCP consent page must never be framed by another site (clickjacking).
  async headers() {
    return [{ source: "/connect", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }, { key: "X-Frame-Options", value: "DENY" }] }];
  },
  
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
