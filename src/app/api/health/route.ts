export const runtime = "nodejs";
export async function GET() {
  return Response.json({
    ok: true,
    service: "prospect-studio",
    database: process.env.NEXT_PUBLIC_CONVEX_URL?.startsWith("https://") ? "convex-cloud" : "convex-local",
    authentication: "owner-restricted-better-auth",
    research: "firecrawl-requires-authenticated-prospect",
    durableActors: "separate-sprite-runtime",
    emailSending: "disabled-pending-approval",
    publicPublishing: "disabled-pending-approval",
    time: new Date().toISOString(),
  });
}
