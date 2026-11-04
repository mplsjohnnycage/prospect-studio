import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: false,
  // One canonical origin. OAuth state cookies are host-only, and Google and
  // AgentID callbacks target prospect-studio-johnnyc.vercel.app. Starting
  // login on an alternate public host splits those cookies and the callback
  // dies with state_mismatch. Bounce every alternate host to the canonical
  // domain before any auth request, preserving path and query.
  // The kappa rule stays permanent (308), matching main's 2f1b449. The git-main
  // host is the same class of public alias, so it uses the same permanence.
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
