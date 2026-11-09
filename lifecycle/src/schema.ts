import { z } from "zod";

/** Canonical persisted business stage — PS-MASTER-3.1 §15.2. Sole Convex union. */
export const LifecycleStageSchema = z.enum([
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
]);
export type LifecycleStage = z.infer<typeof LifecycleStageSchema>;

/** Orthogonal run/job status — never a second business FSM. */
export const RunStatusSchema = z.enum([
  "requested",
  "queued",
  "running",
  "waiting",
  "needs_approval",
  "paused",
  "succeeded",
  "failed",
  "blocked",
  "cancelled",
  "unknown",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

/** UI display grouping only — not persisted as stage. */
export const UiGroupSchema = z.enum([
  "Discover",
  "Qualify",
  "Extract",
  "Design",
  "Demo",
  "Outreach",
  "Convert",
  "Produce",
]);
export type UiGroup = z.infer<typeof UiGroupSchema>;

export const LoopScopeSchema = z.enum(["loop1", "later"]);
export type LoopScope = z.infer<typeof LoopScopeSchema>;

export const TransitionKindSchema = z.enum([
  "forward",
  "human_gate",
  "commercial",
  "recovery_note",
]);
export type TransitionKind = z.infer<typeof TransitionKindSchema>;

export const TransitionSchema = z
  .object({
    id: z.string().min(1),
    from: LifecycleStageSchema,
    to: LifecycleStageSchema,
    kind: TransitionKindSchema,
    loop: LoopScopeSchema,
    humanGate: z.boolean(),
    triggerCommands: z.array(z.string().min(1)).min(1),
    requiredEvidence: z.array(z.string().min(1)).min(1),
    description: z.string().min(1),
  })
  .strict();
export type Transition = z.infer<typeof TransitionSchema>;

export const StageDefSchema = z
  .object({
    stage: LifecycleStageSchema,
    uiGroup: UiGroupSchema,
    loop: LoopScopeSchema,
    acceptanceStep: z.string().min(1),
    entryCommands: z.array(z.string().min(1)),
    meaning: z.string().min(1),
  })
  .strict();
export type StageDef = z.infer<typeof StageDefSchema>;

export const LifecycleMachineSchema = z
  .object({
    id: z.literal("prospect-lifecycle-v1"),
    spec: z.literal("PS-MASTER-3.1"),
    section: z.literal("15.2"),
    authority: z.literal("convex"),
    contractVersion: z.string().min(1),
    stages: z.array(StageDefSchema).length(18),
    transitions: z.array(TransitionSchema).min(1),
    rules: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((machine, ctx) => {
    const stageIds = new Set(machine.stages.map((s) => s.stage));
    if (stageIds.size !== 18) {
      ctx.addIssue({ code: "custom", message: "must define exactly 18 unique stages" });
    }
    for (const t of machine.transitions) {
      if (!stageIds.has(t.from) || !stageIds.has(t.to)) {
        ctx.addIssue({
          code: "custom",
          message: `transition ${t.id} references unknown stage`,
        });
      }
      if (t.from === t.to) {
        ctx.addIssue({
          code: "custom",
          message: `transition ${t.id} is a self-loop; use runStatus, not stage`,
        });
      }
    }
  });
export type LifecycleMachine = z.infer<typeof LifecycleMachineSchema>;

export const TransitionRequestSchema = z
  .object({
    from: LifecycleStageSchema,
    to: LifecycleStageSchema,
    command: z.string().min(1).optional(),
    humanApproved: z.boolean().optional(),
    evidence: z.array(z.string()).optional(),
  })
  .strict();
export type TransitionRequest = z.infer<typeof TransitionRequestSchema>;

export const TransitionDecisionSchema = z
  .object({
    ok: z.boolean(),
    from: LifecycleStageSchema,
    to: LifecycleStageSchema,
    transitionId: z.string().optional(),
    reasons: z.array(z.string()),
    requiredEvidence: z.array(z.string()).optional(),
    triggerCommands: z.array(z.string()).optional(),
  })
  .strict();
export type TransitionDecision = z.infer<typeof TransitionDecisionSchema>;
