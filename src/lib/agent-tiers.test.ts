import {test} from "node:test";
import assert from "node:assert/strict";
import {routeTier,escalate,runTiered,DEFAULT_TIER,TIER_LABEL} from "./agent-tiers";

test("defaults by kind: build is Tier 2, embed/recheck Tier 0", () => {
  assert.equal(DEFAULT_TIER.build, 2); assert.equal(routeTier("embed"), 0); assert.equal(routeTier("recheck"), 0);
});
test("needs only raise the tier, never lower it", () => {
  assert.equal(routeTier("recheck", {code: true}), 1);
  assert.equal(routeTier("recheck", {fullEnv: true}), 2);
  assert.equal(routeTier("build", {code: true}), 2);
});
test("send and price are never autonomous", () => {
  assert.throws(() => routeTier("send" as never)); assert.throws(() => routeTier("price" as never));
});
test("escalation is upward only", () => {
  assert.equal(escalate(1, 2), 2); assert.equal(escalate(2, 1), null); assert.equal(escalate(1, 0), null); assert.equal(escalate(1, 1), null);
});
test("Tier 1 failure escalates to Tier 2 and is logged", async () => {
  const logged: unknown[] = [];
  const r = await runTiered("recheck", 1, {0: async () => "host", 1: async () => { throw Error("wasm oom"); }, 2: async () => "sandbox"}, (e) => logged.push(e));
  assert.equal(r.value, "sandbox"); assert.equal(r.tier, 2); assert.equal(r.label, TIER_LABEL[2]); assert.equal(logged.length, 1);
});
test("Tier 1 failure never falls back to the host", async () => {
  await assert.rejects(runTiered("recheck", 1, {0: async () => "host", 1: async () => { throw Error("x"); }}));
});
test("Tier 0 and Tier 2 failures propagate", async () => {
  await assert.rejects(runTiered("embed", 0, {0: async () => { throw Error("a"); }, 2: async () => "no"}));
  await assert.rejects(runTiered("build", 2, {2: async () => { throw Error("b"); }}));
});
