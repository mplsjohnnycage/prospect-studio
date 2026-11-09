import {
  TransitionDecisionSchema,
  TransitionRequestSchema,
  type LifecycleStage,
  type Transition,
  type TransitionDecision,
  type TransitionRequest,
  type LoopScope,
} from "./schema.js";
import {
  LIFECYCLE_MACHINE,
  LOOP1_TERMINAL,
  stageIndex,
} from "./machine.js";

export function listTransitions(from?: LifecycleStage, loop?: LoopScope): Transition[] {
  return LIFECYCLE_MACHINE.transitions.filter((t) => {
    if (from && t.from !== from) return false;
    if (loop && t.loop !== loop) return false;
    return true;
  });
}

export function nextStages(from: LifecycleStage, loop?: LoopScope): LifecycleStage[] {
  return [...new Set(listTransitions(from, loop).map((t) => t.to))];
}

export function findTransition(from: LifecycleStage, to: LifecycleStage): Transition | undefined {
  return LIFECYCLE_MACHINE.transitions.find((t) => t.from === from && t.to === to);
}

export function canTransition(req: TransitionRequest): TransitionDecision {
  const parsed = TransitionRequestSchema.parse(req);
  const transition = findTransition(parsed.from, parsed.to);
  const reasons: string[] = [];

  if (!transition) {
    return TransitionDecisionSchema.parse({
      ok: false,
      from: parsed.from,
      to: parsed.to,
      reasons: [
        `No legal edge ${parsed.from} → ${parsed.to}. Stage does not regress on failure; use runStatus + explicit reopen event.`,
      ],
    });
  }

  if (transition.humanGate && parsed.humanApproved !== true) {
    reasons.push(`Human gate required for ${transition.id}`);
  }

  if (parsed.command && !transition.triggerCommands.includes(parsed.command)) {
    reasons.push(
      `Command ${parsed.command} not in trigger set: ${transition.triggerCommands.join(", ")}`
    );
  }

  const evidence = parsed.evidence ?? [];
  const missing = transition.requiredEvidence.filter((e) => {
    if (e.endsWith("?")) {
      // optional evidence marker
      return false;
    }
    return !evidence.includes(e);
  });
  if (parsed.evidence !== undefined && missing.length) {
    reasons.push(`Missing required evidence: ${missing.join(", ")}`);
  }

  const ok = reasons.length === 0;
  return TransitionDecisionSchema.parse({
    ok,
    from: parsed.from,
    to: parsed.to,
    transitionId: transition.id,
    reasons: ok ? [`Allowed: ${transition.description}`] : reasons,
    requiredEvidence: transition.requiredEvidence,
    triggerCommands: transition.triggerCommands,
  });
}

export function assertTransition(req: TransitionRequest): Transition {
  const decision = canTransition(req);
  if (!decision.ok) {
    throw new Error(decision.reasons.join("; "));
  }
  const t = findTransition(req.from, req.to);
  if (!t) throw new Error("transition vanished");
  return t;
}

/** Shortest forward path from `from` to `to` along defined edges. */
export function path(from: LifecycleStage, to: LifecycleStage): LifecycleStage[] {
  if (from === to) return [from];
  const queue: LifecycleStage[][] = [[from]];
  const seen = new Set<LifecycleStage>([from]);
  while (queue.length) {
    const cur = queue.shift()!;
    const tip = cur[cur.length - 1]!;
    for (const n of nextStages(tip)) {
      if (seen.has(n)) continue;
      const nextPath = [...cur, n];
      if (n === to) return nextPath;
      seen.add(n);
      queue.push(nextPath);
    }
  }
  throw new Error(`No path from ${from} to ${to}`);
}

export function loop1Path(): LifecycleStage[] {
  return path("Indexed", LOOP1_TERMINAL);
}

export function exportMermaid(loop?: LoopScope): string {
  const lines = ["stateDiagram-v2", "  [*] --> Indexed"];
  for (const t of LIFECYCLE_MACHINE.transitions) {
    if (loop && t.loop !== loop) continue;
    const label = t.humanGate ? "human gate" : t.kind;
    lines.push(`  ${t.from} --> ${t.to}: ${label}`);
  }
  if (!loop || loop === "loop1") {
    lines.push(`  Handoff --> [*]: Loop-1 done`);
  }
  if (!loop || loop === "later") {
    lines.push(`  Produced --> [*]: Machine terminal`);
  }
  return lines.join("\n");
}

export function uiProjection(stage: LifecycleStage) {
  const def = stageIndex().get(stage);
  if (!def) throw new Error(`Unknown stage ${stage}`);
  return {
    stage: def.stage,
    uiGroup: def.uiGroup,
    loop: def.loop,
    acceptanceStep: def.acceptanceStep,
    meaning: def.meaning,
    entryCommands: def.entryCommands,
  };
}

export function convexUnionSnippet(): string {
  const lits = LIFECYCLE_MACHINE.stages
    .map((s) => `  v.literal(${JSON.stringify(s.stage)})`)
    .join(",\n");
  return `const lifecycleStage = v.union(\n${lits},\n);`;
}

export function machineSummary() {
  return {
    id: LIFECYCLE_MACHINE.id,
    spec: LIFECYCLE_MACHINE.spec,
    authority: LIFECYCLE_MACHINE.authority,
    contractVersion: LIFECYCLE_MACHINE.contractVersion,
    stageCount: LIFECYCLE_MACHINE.stages.length,
    transitionCount: LIFECYCLE_MACHINE.transitions.length,
    loop1Path: loop1Path(),
    rules: LIFECYCLE_MACHINE.rules,
  };
}
