import type { CommandKind } from "./command-kind";

/**
 * Immutable approval decision record (PS-MASTER §16.4).
 * Soft status flags on concepts/outreach are NOT substitutes.
 */
export type ApprovalDecision = {
  id: string;
  subjectType: "generation" | "concept" | "artifact" | "outreach_send" | "production";
  subjectId: string;
  subjectRevision: number;
  action: Extract<
    CommandKind,
    | "approval.decide"
    | "concept.select"
    | "artifact.approve"
    | "outreach.approveSend"
    | "production.deploy"
  >;
  /** Canonical content / artifact SHA bound at decision time */
  contentSha: string;
  decision: "approve" | "reject";
  approverId: string;
  approverProof: string;
  rationale?: string;
  createdAt: number;
};

export function makeApproval(
  partial: Omit<ApprovalDecision, "createdAt"> & { createdAt?: number }
): ApprovalDecision {
  if (!partial.contentSha || partial.contentSha.length < 8) {
    throw new Error("approval requires contentSha");
  }
  if (!partial.approverProof) {
    throw new Error("approval requires approverProof");
  }
  return {
    ...partial,
    createdAt: partial.createdAt ?? Date.now(),
  };
}
