// Tiered execution for agent tasks (Johnny's spec, 2026-11-03).
// Tier 0: no code needed -> runs in the worker process (HTTP calls, scoring, embeddings calls, Convex mutations, templating).
// Tier 1: a small bit of code -> QuickJS compiled to WebAssembly (quickjs-wasi): no network, no fs, memory + time caps.
// Tier 2: full environment (git, npm, builds, Playwright) -> Docker sandbox (network-less prospect-sandbox:local).
// Rules: default tier by kind; escalation only upward and logged; never down; a Tier 1 failure may escalate to Tier 2,
// never to the host. send and price are never autonomous and never routed here.
import type {TaskKind} from "./agent-core";

export type ExecTier = 0 | 1 | 2;
export const TIER_LABEL: Record<ExecTier, "t0-process" | "t1-wasm" | "t2-sandbox"> = {0: "t0-process", 1: "t1-wasm", 2: "t2-sandbox"};
export const DEFAULT_TIER: Record<TaskKind, ExecTier> = {
  sense: 0, qualify: 0, build: 2, reach: 0, learn: 0, digest: 0, recheck: 0, reviews: 0, embed: 0,
};
export type TierNeeds = { code?: boolean; fullEnv?: boolean };
export const NEVER_AUTONOMOUS = ["send", "price"] as const;

/** Pick the tier: the kind's default, raised (never lowered) by what the task needs. */
export function routeTier(kind: TaskKind, needs: TierNeeds = {}): ExecTier {
  if ((NEVER_AUTONOMOUS as readonly string[]).includes(kind)) throw Error(kind + " is never autonomous");
  const want: ExecTier = needs.fullEnv ? 2 : needs.code ? 1 : 0;
  return Math.max(DEFAULT_TIER[kind], want) as ExecTier;
}

/** Upward-only escalation. Returns null when the move is not allowed (downward, same, or Tier 0 -> anything on failure). */
export function escalate(from: ExecTier, to: ExecTier): ExecTier | null { return to > from ? to : null; }

export type TierEvent = { kind: TaskKind; from: ExecTier; to: ExecTier; reason: string };
export type TierRunners<T> = Partial<Record<ExecTier, () => Promise<T>>>;
export type TieredResult<T> = { tier: ExecTier; label: string; escalations: TierEvent[]; value: T };

/** Run at the routed tier. Only Tier 1 -> Tier 2 escalation exists on failure; Tier 0 and Tier 2 failures propagate.
 *  There is no path from Tier 1/2 back to the worker process (the host). */
export async function runTiered<T>(kind: TaskKind, start: ExecTier, runners: TierRunners<T>, log: (e: TierEvent) => void = () => {}): Promise<TieredResult<T>> {
  const escalations: TierEvent[] = [];
  const run = runners[start];
  if (!run) throw Error("no runner for tier " + start + " (" + kind + ")");
  try { return {tier: start, label: TIER_LABEL[start], escalations, value: await run()}; }
  catch (e) {
    const next = start === 1 ? escalate(1, 2) : null;
    const r2 = next !== null ? runners[next] : undefined;
    if (next === null || !r2) throw e;
    const ev = {kind, from: start, to: next, reason: String(e).slice(0, 200)};
    escalations.push(ev); log(ev);
    return {tier: next, label: TIER_LABEL[next], escalations, value: await r2()};
  }
}
