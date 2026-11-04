import { NextResponse, type NextRequest } from "next/server";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";
import { api } from "../convex/_generated/api";
import { FixedWindowLimiter, decideApiAccess, isPublicApiPath, normalizeApiPath, rateLimitFor, type Viewer } from "@/lib/api-access-policy";

const limiter = new FixedWindowLimiter();

function clientKey(request: NextRequest): string {
  return request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

async function loadViewer(): Promise<Viewer> {
  if (!(await isAuthenticated())) return null;
  try {
    const user = await fetchAuthQuery(api.auth.currentUser, {});
    return user ? { isOwner: user.isOwner === true } : null;
  } catch {
    // Fail closed: a session we cannot resolve to the owner is not the owner.
    return { isOwner: false };
  }
}

export async function proxy(request: NextRequest) {
  const path = normalizeApiPath(request.nextUrl.pathname);
  const { limit, windowMs } = rateLimitFor(path);
  const rl = limiter.check(`${clientKey(request)}:${path.split("/").slice(0, 3).join("/")}`, limit, windowMs);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  if (isPublicApiPath(path)) return NextResponse.next();
  const decision = decideApiAccess(path, await loadViewer());
  if (decision.status !== 200) return NextResponse.json({ error: decision.error }, { status: decision.status, headers: { "Cache-Control": "no-store" } });
  return NextResponse.next();
}

// Gate every /api path; exemptions are decided by anchored rules in api-access-policy.ts.
export const config = { matcher: ["/api/:path*"] };
