/** Typed command dispatch shared by UI, MCP, and headless channels. */

import { sha256Hex } from "./hash";
import {
  assertCanCommand,
  type AuthActor,
} from "../contracts/auth-matrix";
import {
  makeEnvelope,
  type CommandEnvelope,
  type CommandReceipt,
  CommandLog,
} from "../contracts/envelope";
import type { CommandKind } from "../contracts/command-kind";

export const OPERATOR_CHANNELS = ["ui", "mcp", "headless"] as const;
export type OperatorChannel = (typeof OPERATOR_CHANNELS)[number];

export type TypedCommandInput = {
  kind: CommandKind;
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  expectedRevision: number;
  subjectType: CommandEnvelope["subjectType"];
  subjectId: string;
  payload?: Record<string, unknown>;
};

export type TypedCommandResult = {
  channel: OperatorChannel;
  envelope: CommandEnvelope;
  receipt: CommandReceipt;
  duplicate: boolean;
  /** Canonical fingerprint of the accepted command (channel-independent). */
  fingerprint: string;
};

const sharedLog = new CommandLog();

export function commandFingerprint(
  envelope: CommandEnvelope,
  receipt: CommandReceipt,
): string {
  return sha256Hex(
    JSON.stringify({
      kind: envelope.kind,
      commandId: envelope.commandId,
      idempotencyKey: envelope.idempotencyKey,
      correlationId: envelope.correlationId,
      expectedRevision: envelope.expectedRevision,
      subjectType: envelope.subjectType,
      subjectId: envelope.subjectId,
      payload: envelope.payload ?? null,
      result: receipt.result,
      ok: receipt.ok,
      subjectRevisionAfter: receipt.subjectRevisionAfter ?? null,
    }),
  );
}

function applyCommand(envelope: CommandEnvelope): CommandReceipt {
  const evidence = [
    `kind:${envelope.kind}`,
    `subject:${envelope.subjectType}/${envelope.subjectId}`,
    `rev:${envelope.expectedRevision}`,
  ];
  return {
    commandId: envelope.commandId,
    kind: envelope.kind,
    ok: true,
    result: `accepted:${envelope.kind}`,
    subjectRevisionAfter: envelope.expectedRevision + 1,
    evidence,
    at: envelope.issuedAt,
  };
}

/**
 * Dispatch one typed command. UI and MCP must produce the same fingerprint
 * for the same TypedCommandInput + actorId (channel is metadata only).
 */
export function dispatchTypedCommand(args: {
  channel: OperatorChannel;
  actor: AuthActor;
  input: TypedCommandInput;
  log?: CommandLog;
  issuedAt?: number;
}): TypedCommandResult {
  assertCanCommand(args.actor, args.input.kind);
  const envelope = makeEnvelope({
    kind: args.input.kind,
    commandId: args.input.commandId,
    idempotencyKey: args.input.idempotencyKey,
    correlationId: args.input.correlationId,
    expectedRevision: args.input.expectedRevision,
    subjectType: args.input.subjectType,
    subjectId: args.input.subjectId,
    actorId: args.actor.actorId,
    payload: args.input.payload,
    issuedAt: args.issuedAt,
  });
  const log = args.log ?? sharedLog;
  const built = applyCommand(envelope);
  const { receipt, duplicate } = log.accept(built, envelope.idempotencyKey);
  return {
    channel: args.channel,
    envelope,
    receipt,
    duplicate,
    fingerprint: commandFingerprint(envelope, receipt),
  };
}

export function resetOperatorCommandLogForTests(): void {
  (sharedLog as unknown as { byCommandId: Map<string, CommandReceipt> }).byCommandId =
    new Map();
  (sharedLog as unknown as { byIdempotency: Map<string, CommandReceipt> }).byIdempotency =
    new Map();
}
