/**
 * Single source of truth for which /api paths skip the owner gate in
 * src/proxy.ts. Every entry is anchored: a path that merely starts with an
 * exempt word (/api/authors, /api/healthcheck, /api/crontab) is NOT exempt.
 */
export type PublicApiRule = { pattern: RegExp; reason: string };

export const PUBLIC_API_RULES: readonly PublicApiRule[] = [
  { pattern: /^\/api\/auth(?:\/.*)?$/, reason: "Better Auth sign-in/callback endpoints (must work signed out)" },
  { pattern: /^\/api\/health$/, reason: "liveness probe, no data" },
  { pattern: /^\/api\/ready$/, reason: "readiness probe, no data" },
  { pattern: /^\/api\/cron\/autopilot$/, reason: "Vercel cron; route enforces CRON_SECRET bearer itself" },
  { pattern: /^\/api\/map\/tiles\/\d{1,2}\/\d{1,7}\/\d{1,7}$/, reason: "public OSM tile proxy, digits only" },
];

export function normalizeApiPath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function isPublicApiPath(pathname: string): boolean {
  const p = normalizeApiPath(pathname);
  return PUBLIC_API_RULES.some((rule) => rule.pattern.test(p));
}

export type Viewer = { isOwner: boolean } | null;
export type GateDecision = { status: 200 | 401 | 403; error?: string };

/** null viewer = anonymous (401); signed in but not owner, e.g. AgentID agent account (403). */
export function decideApiAccess(pathname: string, viewer: Viewer): GateDecision {
  if (isPublicApiPath(pathname)) return { status: 200 };
  if (!viewer) return { status: 401, error: "Sign in required" };
  if (viewer.isOwner !== true) return { status: 403, error: "Owner access required" };
  return { status: 200 };
}

/** Expensive routes (LLM, sandbox, scraping) get a tighter budget. */
const EXPENSIVE = [/^\/api\/agentos\//, /^\/api\/autopilot$/, /^\/api\/sales$/, /^\/api\/research$/, /^\/api\/assistant$/, /^\/api\/rivet\//];
export function rateLimitFor(pathname: string): { limit: number; windowMs: number } {
  const p = normalizeApiPath(pathname);
  if (/^\/api\/auth(?:\/|$)/.test(p)) return { limit: 30, windowMs: 60_000 };
  if (EXPENSIVE.some((r) => r.test(p))) return { limit: 10, windowMs: 60_000 };
  if (/^\/api\/map\/tiles\//.test(p)) return { limit: 600, windowMs: 60_000 };
  return { limit: 120, windowMs: 60_000 };
}

/**
 * Best-effort fixed-window limiter. State lives per server instance, so on
 * Vercel it limits per warm instance, not globally; it stops tight loops and
 * casual abuse, not a distributed attacker.
 */
export class FixedWindowLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private maxKeys = 5000) {}
  check(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= now) {
      if (this.hits.size >= this.maxKeys) this.sweep(now);
      this.hits.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, retryAfterSec: 0 };
    }
    cur.count += 1;
    return cur.count <= limit ? { ok: true, retryAfterSec: 0 } : { ok: false, retryAfterSec: Math.ceil((cur.resetAt - now) / 1000) };
  }
  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    if (this.hits.size >= this.maxKeys) this.hits.clear();
  }
}
