import type { CommandKind } from "./command-kind";
import { isCommandKind } from "./command-kind";

export const ROLES = ["owner", "operator", "agent", "anonymous"] as const;
export type Role = (typeof ROLES)[number];

export type AuthActor = {
  role: Role;
  actorId: string;
  /** Owner allowlist / Better Auth subject when role is owner */
  subject?: string;
};

const HUMAN_GATE_KINDS = new Set<CommandKind>([
  "approval.decide",
  "concept.select",
  "artifact.approve",
  "outreach.approveSend",
  "outreach.send",
  "production.deploy",
]);

const AGENT_ALLOWED = new Set<CommandKind>([
  "discovery.start",
  "place.upsert",
  "place.normalize",
  "place.merge",
  "score.compute1",
  "enrichment.start",
  "score.compute2",
  "qualify.decide",
  "image.request",
  "image.run",
  "concept.generate",
  "image.complete",
  "design.proposePatch",
  "design.commit",
  "build.run",
  "build.complete",
  "qa.evaluate",
  "handoff.publish",
  "outreach.draft",
  "convert.record",
  "production.request",
]);

export class UnauthorizedError extends Error {
  readonly code = "unauthorized" as const;
  readonly status = 401 as const;
  constructor(message = "unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export function canRead(actor: AuthActor): boolean {
  return actor.role === "owner" || actor.role === "operator" || actor.role === "agent";
}

export function canApprove(actor: AuthActor): boolean {
  return actor.role === "owner";
}

export function canCommand(actor: AuthActor, kind: string): boolean {
  if (!isCommandKind(kind)) return false;
  if (actor.role === "anonymous") return false;
  if (actor.role === "owner") return true;
  if (actor.role === "operator") {
    // operators may run non-gate commands; approve/send gates stay owner-only
    if (HUMAN_GATE_KINDS.has(kind)) return false;
    return true;
  }
  if (actor.role === "agent") {
    if (HUMAN_GATE_KINDS.has(kind)) return false;
    return AGENT_ALLOWED.has(kind);
  }
  return false;
}

export function assertCanCommand(actor: AuthActor, kind: string): void {
  if (!canCommand(actor, kind)) {
    throw new UnauthorizedError(`role ${actor.role} cannot command ${kind}`);
  }
}

export function assertCanApprove(actor: AuthActor): void {
  if (!canApprove(actor)) {
    throw new UnauthorizedError(`role ${actor.role} cannot approve`);
  }
}

export function isUnauthorizedError(error: unknown): error is UnauthorizedError {
  return error instanceof UnauthorizedError;
}
