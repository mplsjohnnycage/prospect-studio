import assert from "node:assert/strict";
import test from "node:test";
import { CommandLog } from "../contracts/envelope";
import {
  dispatchTypedCommand,
  type TypedCommandInput,
} from "./command";
import {
  runTypedCommandFromMcp,
  runTypedCommandFromUi,
} from "./mcp-tools";

const actor = { role: "owner" as const, actorId: "johnny-cage", subject: "owner" };

function sample(commandId: string): TypedCommandInput {
  return {
    kind: "qa.evaluate",
    commandId,
    idempotencyKey: `idem-${commandId}`,
    correlationId: "corr-p11",
    expectedRevision: 3,
    subjectType: "artifact",
    subjectId: "p7-demo-authentic-ff",
    payload: { checklist: "qa.v1" },
  };
}

test("UI and MCP produce identical fingerprints for the same typed command", () => {
  const input = sample("cmd-ui-mcp-parity");
  const issuedAt = 1_700_000_000_000;
  const ui = runTypedCommandFromUi(actor, input, issuedAt);
  const mcp = runTypedCommandFromMcp(actor, input, issuedAt);
  assert.equal(ui.fingerprint, mcp.fingerprint);
  assert.equal(ui.receipt.result, mcp.receipt.result);
  assert.equal(ui.envelope.kind, mcp.envelope.kind);
  assert.notEqual(ui.channel, mcp.channel);
});

test("headless channel accepts the same typed command", () => {
  const log = new CommandLog();
  const input = sample("cmd-headless-1");
  const r = dispatchTypedCommand({
    channel: "headless",
    actor,
    input,
    log,
    issuedAt: 1_700_000_000_001,
  });
  assert.equal(r.receipt.ok, true);
  assert.equal(r.channel, "headless");
  assert.match(r.fingerprint, /^[a-f0-9]{64}$/);
});

test("agent cannot dispatch human-gate kinds", () => {
  assert.throws(
    () =>
      dispatchTypedCommand({
        channel: "mcp",
        actor: { role: "agent", actorId: "bot" },
        input: {
          ...sample("cmd-deny"),
          kind: "outreach.send",
        },
      }),
    /cannot command/,
  );
});
