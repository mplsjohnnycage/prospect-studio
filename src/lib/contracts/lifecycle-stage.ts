/** Canonical §15.2 lifecycle stages — sole business vocabulary. */

export const LIFECYCLE_STAGES = [
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
  "OutreachDraft",
  "SendPending",
  "Sent",
  "Converted",
  "ProductionGate",
  "Produced",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

const STAGE_SET = new Set<string>(LIFECYCLE_STAGES);

export function isLifecycleStage(value: string): value is LifecycleStage {
  return STAGE_SET.has(value);
}

/** Display-only UI groups (domain.ts labels). Never persist as authority. */
export const UI_STAGE_GROUPS = [
  "Discover",
  "Qualify",
  "Extract",
  "Design",
  "Demo",
  "Outreach",
  "Convert",
  "Produce",
] as const;

export type UiStageGroup = (typeof UI_STAGE_GROUPS)[number];

export const LIFECYCLE_TO_UI_GROUP: Record<LifecycleStage, UiStageGroup> = {
  Indexed: "Discover",
  Scored: "Qualify",
  Enriched: "Extract",
  Qualified: "Qualify",
  GenPendingApproval: "Design",
  Generating: "Design",
  ConceptReview: "Design",
  DesignIR: "Design",
  Building: "Design",
  QA: "Demo",
  ArtifactReview: "Demo",
  Handoff: "Demo",
  OutreachDraft: "Outreach",
  SendPending: "Outreach",
  Sent: "Outreach",
  Converted: "Convert",
  ProductionGate: "Produce",
  Produced: "Produce",
};

export function toUiStageGroup(stage: LifecycleStage): UiStageGroup {
  return LIFECYCLE_TO_UI_GROUP[stage];
}

/** Best-effort map from legacy UI stage → canonical (first stage in group). */
export const UI_GROUP_TO_DEFAULT_LIFECYCLE: Record<UiStageGroup, LifecycleStage> = {
  Discover: "Indexed",
  Qualify: "Scored",
  Extract: "Enriched",
  Design: "DesignIR",
  Demo: "Handoff",
  Outreach: "OutreachDraft",
  Convert: "Converted",
  Produce: "ProductionGate",
};
