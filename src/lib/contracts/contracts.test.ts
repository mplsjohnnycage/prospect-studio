import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMMAND_KINDS,
  CommandLog,
  LIFECYCLE_STAGES,
  UnauthorizedError,
  assertCanApprove,
  assertCanCommand,
  assertExpectedRevision,
  bumpRevision,
  canCommand,
  canRead,
  isCommandKind,
  isLifecycleStage,
  isStaleRevisionError,
  isUnauthorizedError,
  makeApproval,
  makeEnvelope,
  parseCommandKind,
  resolveLegacyCommand,
  toUiStageGroup,
} from "./";

test("closed CommandKind union rejects inventing kinds", () => {
  assert.equal(COMMAND_KINDS.length, 27);
  assert.equal(isCommandKind("approval.decide"), true);
  assert.equal(isCommandKind("invent.something"), false);
  assert.throws(() => parseCommandKind("invent.something"), /unknown CommandKind/);
});

test("legacy UI verbs alias into closed CommandKind only", () => {
  assert.equal(resolveLegacyCommand("qualify"), "qualify.decide");
  assert.equal(resolveLegacyCommand("approve_concept"), "concept.select");
  assert.equal(resolveLegacyCommand("pause"), null);
  assert.equal(resolveLegacyCommand("not_a_verb"), null);
});

test("duplicate commandId replay returns prior receipt", () => {
  const log = new CommandLog();
  const first = log.accept({
    commandId: "cmd-1",
    kind: "score.compute1",
    ok: true,
    result: "accepted",
    at: 1,
  });
  assert.equal(first.duplicate, false);
  const replay = log.accept({
    commandId: "cmd-1",
    kind: "score.compute1",
    ok: true,
    result: "should-not-overwrite",
    at: 2,
  });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.receipt.result, "accepted");
  assert.equal(log.replay("cmd-1")?.result, "accepted");
});

test("idempotencyKey replay is duplicate-safe", () => {
  const log = new CommandLog();
  const a = log.accept(
    {
      commandId: "cmd-a",
      kind: "enrichment.start",
      ok: true,
      result: "ok",
      at: 1,
    },
    "idem-1"
  );
  assert.equal(a.duplicate, false);
  const b = log.accept(
    {
      commandId: "cmd-b",
      kind: "enrichment.start",
      ok: true,
      result: "other",
      at: 2,
    },
    "idem-1"
  );
  assert.equal(b.duplicate, true);
  assert.equal(b.receipt.commandId, "cmd-a");
});

test("stale expectedRevision throws 409-class error", () => {
  const subject = { revision: 3 };
  assert.throws(() => assertExpectedRevision(subject, 2), (err: unknown) => {
    assert.equal(isStaleRevisionError(err), true);
    if (isStaleRevisionError(err)) {
      assert.equal(err.status, 409);
      assert.equal(err.expected, 2);
      assert.equal(err.actual, 3);
    }
    return true;
  });
  assertExpectedRevision(subject, 3);
  const next = bumpRevision(subject);
  assert.equal(next.revision, 4);
});

test("unauthorized roles cannot approve or send", () => {
  const agent = { role: "agent" as const, actorId: "agent-1" };
  const anon = { role: "anonymous" as const, actorId: "anon" };
  const owner = { role: "owner" as const, actorId: "owner-1" };

  assert.equal(canRead(agent), true);
  assert.equal(canRead(anon), false);
  assert.equal(canCommand(agent, "score.compute1"), true);
  assert.equal(canCommand(agent, "approval.decide"), false);
  assert.equal(canCommand(agent, "outreach.send"), false);
  assert.equal(canCommand(anon, "discovery.start"), false);
  assert.equal(canCommand(owner, "approval.decide"), true);

  assert.throws(() => assertCanCommand(agent, "artifact.approve"), (err: unknown) => {
    assert.equal(isUnauthorizedError(err), true);
    if (err instanceof UnauthorizedError) assert.equal(err.status, 401);
    return true;
  });
  assert.throws(() => assertCanApprove(agent), /cannot approve/);
  assertCanApprove(owner);
});

test("envelope carries contractVersion and expectedRevision", () => {
  const env = makeEnvelope({
    kind: "approval.decide",
    commandId: "c1",
    idempotencyKey: "i1",
    correlationId: "corr",
    expectedRevision: 7,
    subjectType: "prospect",
    subjectId: "p1",
    actorId: "owner-1",
  });
  assert.equal(env.contractVersion, "ps-contracts-1.0.0");
  assert.equal(env.expectedRevision, 7);
  assert.equal(env.kind, "approval.decide");
});

test("approvals require contentSha and actor proof", () => {
  assert.throws(
    () =>
      makeApproval({
        id: "a1",
        subjectType: "artifact",
        subjectId: "art-1",
        subjectRevision: 1,
        action: "artifact.approve",
        contentSha: "",
        decision: "approve",
        approverId: "owner",
        approverProof: "sig",
      }),
    /contentSha/
  );
  const ok = makeApproval({
    id: "a1",
    subjectType: "artifact",
    subjectId: "art-1",
    subjectRevision: 1,
    action: "artifact.approve",
    contentSha: "deadbeefcafebabe",
    decision: "approve",
    approverId: "owner",
    approverProof: "session:owner",
  });
  assert.equal(ok.contentSha, "deadbeefcafebabe");
});

test("lifecycleStage §15.2 has 18 stages; UI groups are projections", () => {
  assert.equal(LIFECYCLE_STAGES.length, 18);
  assert.equal(isLifecycleStage("Handoff"), true);
  assert.equal(isLifecycleStage("Discover"), false);
  assert.equal(toUiStageGroup("Indexed"), "Discover");
  assert.equal(toUiStageGroup("Handoff"), "Demo");
  assert.equal(toUiStageGroup("GenPendingApproval"), "Design");
});
