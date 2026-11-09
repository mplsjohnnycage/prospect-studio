import type { CommandKind } from "./command-kind";

export const CONTRACT_VERSION = "ps-contracts-1.0.0" as const;

export type CommandEnvelope = {
  contractVersion: typeof CONTRACT_VERSION;
  kind: CommandKind;
  /** Client-supplied unique id; replay returns prior result */
  commandId: string;
  /** Separate idempotency key when commandId is request-scoped */
  idempotencyKey: string;
  correlationId: string;
  /** Optimistic concurrency against subject revision */
  expectedRevision: number;
  subjectType: "prospect" | "concept" | "outreach" | "artifact" | "place";
  subjectId: string;
  actorId: string;
  issuedAt: number;
  payload?: Record<string, unknown>;
};

export type OutboxStatus = "pending" | "leased" | "acked" | "dead";

export type OutboxRecord = {
  id: string;
  envelope: CommandEnvelope;
  status: OutboxStatus;
  leaseOwner?: string;
  leaseUntil?: number;
  attempts: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
};

export type CommandReceipt = {
  commandId: string;
  kind: CommandKind;
  ok: boolean;
  result: string;
  subjectRevisionAfter?: number;
  evidence?: string[];
  at: number;
};

export function makeEnvelope(
  partial: Omit<CommandEnvelope, "contractVersion" | "issuedAt"> & {
    issuedAt?: number;
  }
): CommandEnvelope {
  return {
    contractVersion: CONTRACT_VERSION,
    issuedAt: partial.issuedAt ?? Date.now(),
    kind: partial.kind,
    commandId: partial.commandId,
    idempotencyKey: partial.idempotencyKey,
    correlationId: partial.correlationId,
    expectedRevision: partial.expectedRevision,
    subjectType: partial.subjectType,
    subjectId: partial.subjectId,
    actorId: partial.actorId,
    payload: partial.payload,
  };
}

/** In-memory command log for unit tests / local replay semantics. */
export class CommandLog {
  private byCommandId = new Map<string, CommandReceipt>();
  private byIdempotency = new Map<string, CommandReceipt>();

  replay(commandId: string): CommandReceipt | undefined {
    return this.byCommandId.get(commandId);
  }

  replayIdempotent(key: string): CommandReceipt | undefined {
    return this.byIdempotency.get(key);
  }

  /**
   * Accept or return prior receipt (duplicate/replay).
   * Returns { duplicate: true } when commandId already recorded.
   */
  accept(receipt: CommandReceipt, idempotencyKey?: string): {
    receipt: CommandReceipt;
    duplicate: boolean;
  } {
    const prior = this.byCommandId.get(receipt.commandId);
    if (prior) return { receipt: prior, duplicate: true };
    if (idempotencyKey) {
      const priorKey = this.byIdempotency.get(idempotencyKey);
      if (priorKey) return { receipt: priorKey, duplicate: true };
      this.byIdempotency.set(idempotencyKey, receipt);
    }
    this.byCommandId.set(receipt.commandId, receipt);
    return { receipt, duplicate: false };
  }
}
