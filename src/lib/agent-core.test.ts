import test from "node:test";
import assert from "node:assert/strict";
import * as A from "./agent-core";
const used = { demos: 0, drafts: 0, promotes: 0 };
test("defaults: paused, all L1, caps 10/40, empty allowlist", () => {
  const c = A.DEFAULT_CONFIG;
  assert.equal(c.paused, true); assert.ok(Object.values(c.levels).every(l => l === 1));
  assert.equal(c.caps.demosPerDay, 10); assert.equal(c.caps.draftsPerDay, 40); assert.deepEqual(c.allowlist, []);
  assert.equal(A.mayRun(c, "qualify", used).allow, false);
});
test("levels, caps and evals gate autonomy", () => {
  const c = { ...A.DEFAULT_CONFIG, paused: false };
  assert.equal(A.mayRun(c, "qualify", used).allow, true);
  assert.equal(A.mayRun(c, "build", used).allow, false);
  assert.throws(() => A.setLevel(c, "build", 2));
  const c2 = A.setLevel({ ...c, evalsPassed: { build: 1 } }, "build", 2);
  assert.equal(A.mayRun(c2, "build", used).allow, true);
  assert.equal(A.mayRun(c2, "build", { ...used, demos: 10 }).allow, false);
  assert.equal(A.mayRun(c2, "reach", { ...used, drafts: 40 }).allow, false);
  assert.ok(A.NEVER_AUTONOMOUS.includes("send_email"));
});
test("claims, leases, retries, idempotent keys", () => {
  assert.equal(A.mayClaim(A.DEFAULT_CONFIG, "chatgpt"), false);
  assert.equal(A.mayClaim({ ...A.DEFAULT_CONFIG, allowlist: ["chatgpt"] }, "chatgpt"), true);
  assert.equal(A.mayClaim(A.DEFAULT_CONFIG, "desktop:jn"), false); // names are not trusted
  assert.equal(A.mayClaim({ ...A.DEFAULT_CONFIG, allowlist: ["desktop:jn"] }, "desktop:jn"), true);
  assert.equal(A.leaseFor("desktop:jn"), 90_000);
  assert.equal(A.taskKey("build", "p1", { a: 1 }), A.taskKey("build", "p1", { a: 1 }));
  assert.notEqual(A.taskKey("build", "p1", { a: 1 }), A.taskKey("build", "p1", { a: 2 }));
  const t: A.AgentTask = { key: "k", kind: "build", status: "claimed", attempts: 1, leaseUntil: 10 };
  assert.equal(A.claimableTask(t, 5), false); assert.equal(A.claimableTask(t, 11), true);
  assert.equal(A.onFailure(t, 0).notBefore, 60_000);
  assert.equal(A.onFailure({ ...t, attempts: 3 }, 0).status, "parked");
  assert.equal(A.tierFor("build", { heavy: true }), "sprite");
});
test("desktop is primary; sprite only when desktop heartbeat is stale", () => {
  assert.equal(A.fallbackAllowed("sprite:p", 1000, 2000), false);
  assert.equal(A.fallbackAllowed("sprite:p", 0, 2 * 60_000), true);
  assert.equal(A.fallbackAllowed("sprite:p", undefined, 1), true);
  assert.equal(A.fallbackAllowed("desktop:3apdbkg", undefined, 1), true);
});
test("alerts, evals, features, digest", () => {
  assert.equal(A.alertsFor([{ status: "error", usd: 0, kind: "build" }, { status: "error", usd: 0, kind: "build" }, { status: "error", usd: 0, kind: "build", error: "x" }]).length, 1);
  assert.ok(A.alertsFor([{ status: "ok", usd: 0.01, kind: "sense" }])[0].includes("spend"));
  const q = A.evalQualify(Array.from({ length: 50 }, (_, i) => ({ identityKey: "k" + i, sourceUrl: "s", trigger: { type: "permit" as const, source: "s" }, gatesPassed: true })));
  assert.equal(q.pass, true);
  assert.equal(A.evalBuild([{ qaPass: true, unsourced: 0 }]).pass, false);
  const s = A.callScript({ name: "Acme", trade: "hvac", city: "Edina", trigger: { type: "permit", date: "2026-10-30" }, gap: ["Gap: No website listed"], views: 2 });
  assert.equal(s.length, 5); assert.match(s[4], /Johnny quotes/);
  const td = A.teardown({ name: "You" }, { name: "Rival", url: "x", https: true, quoteForm: true });
  assert.equal(td.score.rival, 3); assert.equal(td.score.you, 0);
  assert.equal(A.testLead("Acme").test, true);
  assert.ok(A.payToLivePlan({ name: "A" }).find(s => s.step === "paid")!.auto === false);
  assert.match(A.weeklyReport([], [0.2, 0.25, 0.2, 0.15, 0.2], [0.2, 0.25, 0.2, 0.15, 0.2], 3), /need 200/);
  assert.match(A.digest({ promoted: 1, built: 0, drafted: 2, failures: 0, alerts: [], paused: true }).body, /paused/);
});
