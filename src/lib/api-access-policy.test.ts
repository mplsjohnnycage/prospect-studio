import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { FixedWindowLimiter, decideApiAccess, isPublicApiPath } from "./api-access-policy";

const API_DIR = join(process.cwd(), "src", "app", "api");
// Routes allowed to be reachable without an owner session. Adding a route here is a security review.
const EXPECTED_PUBLIC = new Set(["/api/auth/[...all]", "/api/health", "/api/ready", "/api/cron/autopilot", "/api/map/tiles/[z]/[x]/[y]"]);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? routeFiles(p) : name === "route.ts" ? [p] : [];
  });
}
function routePattern(file: string): string {
  return "/api/" + relative(API_DIR, file).split(sep).slice(0, -1).join("/");
}
function samplePath(pattern: string): string {
  return pattern.replace("[...all]", "sign-in/social").replace(/\[(z|x|y)\]/g, "3").replace(/\[[^\]]+\]/g, "abc123");
}

test("every /api route is owner-gated unless explicitly listed as public", () => {
  const files = routeFiles(API_DIR);
  assert.ok(files.length >= 15, "route discovery found too few routes");
  for (const f of files) {
    const pattern = routePattern(f);
    const path = samplePath(pattern);
    if (EXPECTED_PUBLIC.has(pattern)) {
      assert.equal(isPublicApiPath(path), true, `${pattern} expected public`);
      continue;
    }
    assert.equal(decideApiAccess(path, null).status, 401, `${pattern} must be 401 for anonymous`);
    assert.equal(decideApiAccess(path, { isOwner: false }).status, 403, `${pattern} must be 403 for non-owner (AgentID agent)`);
    assert.equal(decideApiAccess(path, { isOwner: true }).status, 200, `${pattern} must allow owner`);
  }
});

test("exemptions are anchored, never prefix matches", () => {
  for (const p of ["/api/authors", "/api/authorize", "/api/healthcheck", "/api/health/x", "/api/readyz", "/api/readings",
    "/api/crontab", "/api/cron-anything", "/api/cron/other", "/api/cron/autopilot/x", "/api/map/tilesx", "/api/map/tiles/a/b/c",
    "/api/map/tiles/1/2", "/api/map/tiles/1/2/3/4", "/api/prospects", "/api/rivet/stream"]) {
    assert.equal(isPublicApiPath(p), false, `${p} must not be exempt`);
    assert.equal(decideApiAccess(p, null).status, 401, p);
  }
  for (const p of ["/api/auth", "/api/auth/callback/google", "/api/health", "/api/health/", "/api/ready", "/api/cron/autopilot", "/api/map/tiles/12/1000/2000"]) {
    assert.equal(isPublicApiPath(p), true, `${p} should be exempt`);
  }
});

test("every /api route declares maxDuration", () => {
  for (const f of routeFiles(API_DIR)) {
    assert.match(readFileSync(f, "utf8"), /export const maxDuration\s*=\s*\d+/, `${routePattern(f)} missing maxDuration`);
  }
});

test("proxy matcher covers all of /api", () => {
  const src = readFileSync(join(process.cwd(), "src", "proxy.ts"), "utf8");
  assert.match(src, /matcher:\s*\["\/api\/:path\*"\]/);
  assert.doesNotMatch(src, /\(\?!/, "no negative-lookahead prefix exemptions in the matcher");
});

test("rate limiter blocks after the limit and resets after the window", () => {
  const l = new FixedWindowLimiter();
  for (let i = 0; i < 3; i++) assert.equal(l.check("k", 3, 1000, 0).ok, true);
  assert.equal(l.check("k", 3, 1000, 10).ok, false);
  assert.equal(l.check("k", 3, 1000, 1001).ok, true);
});
