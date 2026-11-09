import assert from "node:assert/strict";
import { test } from "node:test";
import {
  approveHandoff,
  attemptUnauthorizedApproval,
  createHandoffPackage,
} from "./package.ts";

test("owner can approve SHA-bound handoff", () => {
  const draft = createHandoffPackage({
    prospectId: "p-authff",
    businessName: "Authentic Form & Function",
    evidence: {
      previewSha256: "a".repeat(64),
      qaReportObjectKey: "artifacts/p9-build-qa/qa-report",
    },
  });
  assert.equal(draft.status, "draft");
  assert.ok(draft.contentSha.length === 64);
  const approved = approveHandoff({
    pkg: draft,
    actor: { role: "owner", actorId: "johnny" },
    expectedContentSha: draft.contentSha,
    approverProof: "owner-session-proof",
    rationale: "Source→demo path verified for Loop1",
  });
  assert.equal(approved.status, "approved");
  assert.equal(approved.approval?.contentSha, draft.contentSha);
});

test("agent approval path is blocked", () => {
  const draft = createHandoffPackage({
    prospectId: "p-authff",
    businessName: "Authentic Form & Function",
    evidence: { previewSha256: "b".repeat(64) },
  });
  const blocked = attemptUnauthorizedApproval(draft, {
    role: "agent",
    actorId: "auto-loop",
  });
  assert.equal(blocked.status, "blocked_unauthorized");
  assert.match(blocked.error, /cannot approve|cannot command/i);
});

test("stale contentSha is rejected", () => {
  const draft = createHandoffPackage({
    prospectId: "p-authff",
    businessName: "Authentic Form & Function",
    evidence: { previewSha256: "c".repeat(64) },
  });
  assert.throws(() =>
    approveHandoff({
      pkg: draft,
      actor: { role: "owner", actorId: "johnny" },
      expectedContentSha: "deadbeefdeadbeef",
      approverProof: "owner-session-proof",
    }),
  );
});
