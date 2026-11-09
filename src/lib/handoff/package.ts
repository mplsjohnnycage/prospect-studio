/** Source→demo handoff with exact SHA binding and owner-only approval. */

import { createHash } from "node:crypto";
import {
  assertCanApprove,
  assertCanCommand,
  type AuthActor,
} from "../contracts/auth-matrix.ts";
import { makeApproval, type ApprovalDecision } from "../contracts/approvals.ts";

export type HandoffEvidence = {
  sourceExtractObjectKey?: string;
  enrichmentObjectKey?: string;
  visualTraceObjectKey?: string;
  designIrObjectKey?: string;
  qaReportObjectKey?: string;
  previewSha256: string;
};

export type HandoffPackage = {
  version: "handoff.v1";
  prospectId: string;
  businessName: string;
  contentSha: string;
  evidence: HandoffEvidence;
  approval?: ApprovalDecision;
  status: "draft" | "approved" | "rejected" | "blocked_unauthorized";
  createdAt: string;
  updatedAt: string;
};

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createHandoffPackage(args: {
  prospectId: string;
  businessName: string;
  evidence: HandoffEvidence;
}): HandoffPackage {
  const now = new Date().toISOString();
  const contentSha = sha256Json({
    prospectId: args.prospectId,
    businessName: args.businessName,
    evidence: args.evidence,
  });
  return {
    version: "handoff.v1",
    prospectId: args.prospectId,
    businessName: args.businessName,
    contentSha,
    evidence: args.evidence,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

export function approveHandoff(args: {
  pkg: HandoffPackage;
  actor: AuthActor;
  expectedContentSha: string;
  approverProof: string;
  rationale?: string;
}): HandoffPackage {
  assertCanApprove(args.actor);
  assertCanCommand(args.actor, "artifact.approve");
  if (args.expectedContentSha !== args.pkg.contentSha) {
    throw new Error(
      `contentSha mismatch: expected ${args.expectedContentSha}, have ${args.pkg.contentSha}`,
    );
  }
  const approval = makeApproval({
    id: `appr_${args.pkg.prospectId}_${args.pkg.contentSha.slice(0, 12)}`,
    subjectType: "artifact",
    subjectId: args.pkg.prospectId,
    subjectRevision: 1,
    action: "artifact.approve",
    contentSha: args.pkg.contentSha,
    decision: "approve",
    approverId: args.actor.actorId,
    approverProof: args.approverProof,
    rationale: args.rationale,
  });
  return {
    ...args.pkg,
    approval,
    status: "approved",
    updatedAt: new Date().toISOString(),
  };
}

export function attemptUnauthorizedApproval(
  pkg: HandoffPackage,
  actor: AuthActor,
): { ok: false; status: "blocked_unauthorized"; error: string } {
  try {
    approveHandoff({
      pkg,
      actor,
      expectedContentSha: pkg.contentSha,
      approverProof: "agent-forged-proof",
    });
    return { ok: false, status: "blocked_unauthorized", error: "expected throw" };
  } catch (err) {
    return {
      ok: false,
      status: "blocked_unauthorized",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
