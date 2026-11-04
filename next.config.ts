import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: false,
  // One canonical origin. The project's default Vercel domain
  // (prospect-studio-kappa.vercel.app) serves the same app, but OAuth state
  // cookies are scoped to the origin the flow starts on, so a sign-in started
  // on kappa dies at the canonical callback with state_mismatch. Bounce every
  // kappa hit to the canonical domain so auth only ever runs on one origin.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "prospect-studio-kappa.vercel.app" }],
        destination: "https://prospect-studio-johnnyc.vercel.app/:path*",
        permanent: true,
      },
    ];
  },
  // The MCP consent page must never be framed by another site (clickjacking).
  async headers() {
    const security = [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
    ];
    // Site-wide first; /connect (MCP consent) is stricter and listed last so it wins.
    return [{ source: "/:path*", headers: security }, { source: "/connect", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }, { key: "X-Frame-Options", value: "DENY" }] }];
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
