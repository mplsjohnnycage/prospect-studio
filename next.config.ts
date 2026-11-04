import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: false,
  // Keep Rivet native runtimes external and include optional NAPI artifacts.
  serverExternalPackages: ["rivetkit", "@rivetkit/rivetkit-napi", "@rivet-dev/agentos-core", "sandbox-agent", "@fly/sprites"],
  outputFileTracingIncludes: {
    "/api/rivet/[...all]": [
      "./node_modules/@rivetkit/rivetkit-napi/**/*",
      "./node_modules/@rivetkit/rivetkit-napi-linux-x64-gnu/**/*",
    ],
  },
  // Redirect alternate public hosts to the canonical OAuth callback origin.

  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "prospect-studio-kappa.vercel.app" }],
        destination: "https://prospect-studio-johnnyc.vercel.app/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "prospect-studio-git-main-johnnyc.vercel.app" }],
        destination: "https://prospect-studio-johnnyc.vercel.app/:path*",
        permanent: true,
      },
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
