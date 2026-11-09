import assert from "node:assert/strict";
import {
  canTransition,
  loop1Path,
  nextStages,
  path,
} from "./engine.js";
import { LIFECYCLE_MACHINE } from "./machine.js";

assert.equal(LIFECYCLE_MACHINE.stages.length, 18);
assert.equal(LIFECYCLE_MACHINE.authority, "convex");

const loop1 = loop1Path();
assert.deepEqual(loop1, [
  "Indexed",
  "Scored",
  "Enriched",
  "Qualified",
  "GenPendingApproval",
  "Generating",
  "ConceptReview",
  "DesignIR",
  "Building",
  "QA",
  "ArtifactReview",
  "Handoff",
]);

assert.deepEqual(nextStages("Indexed"), ["Scored"]);
assert.equal(canTransition({ from: "Indexed", to: "Handoff" }).ok, false);
assert.equal(canTransition({ from: "GenPendingApproval", to: "Generating" }).ok, false);
assert.equal(
  canTransition({
    from: "GenPendingApproval",
    to: "Generating",
    humanApproved: true,
    command: "approval.decide",
  }).ok,
  true
);

assert.throws(() => path("Produced", "Indexed"));

console.log(
  JSON.stringify({
    ok: true,
    tested: ["18-stages", "loop1-path", "human-gate", "no-skip", "no-regress-path"],
  })
);
