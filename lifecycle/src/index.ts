export {
  LifecycleMachineSchema,
  LifecycleStageSchema,
  LoopScopeSchema,
  RunStatusSchema,
  StageDefSchema,
  TransitionDecisionSchema,
  TransitionRequestSchema,
  TransitionSchema,
  UiGroupSchema,
  type LifecycleMachine,
  type LifecycleStage,
  type LoopScope,
  type RunStatus,
  type StageDef,
  type Transition,
  type TransitionDecision,
  type TransitionRequest,
  type UiGroup,
} from "./schema.js";

export {
  LIFECYCLE_MACHINE,
  LOOP1_TERMINAL,
  MACHINE_TERMINAL,
  stageIndex,
} from "./machine.js";

export {
  assertTransition,
  canTransition,
  convexUnionSnippet,
  exportMermaid,
  findTransition,
  listTransitions,
  loop1Path,
  machineSummary,
  nextStages,
  path,
  uiProjection,
} from "./engine.js";
