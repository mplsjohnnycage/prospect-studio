import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentPromptSchema,
  ExecGraphSchema,
  GraphStateSchema,
  topoSortIds,
  type AgentPrompt,
  type ExecGraph,
  type GraphNode,
  type GraphState,
  type Loop,
  type NodeStatus,
  type StoredStatus,
} from "./schema.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
export const GRAPH_PATH = join(ROOT, "..", "ps-loop1.exec.json");
export const STATE_PATH = join(ROOT, "..", "state.json");

const TERMINAL = new Set<NodeStatus>(["done", "skipped"]);

export function loadGraph(path = GRAPH_PATH): ExecGraph {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return ExecGraphSchema.parse(raw);
}

export function loadState(path = STATE_PATH): GraphState {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return GraphStateSchema.parse(raw);
}

export function saveState(state: GraphState, path = STATE_PATH): void {
  const next = GraphStateSchema.parse({
    ...state,
    updatedAt: new Date().toISOString(),
  });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
}

export function indexNodes(graph: ExecGraph): Map<string, GraphNode> {
  return new Map(graph.nodes.map((n) => [n.id, n]));
}

export function getStatus(state: GraphState, id: string): StoredStatus {
  return state.nodes[id]?.status ?? "blocked";
}

export function depsSatisfied(node: GraphNode, state: GraphState): boolean {
  return node.dependsOn.every((dep) => TERMINAL.has(getStatus(state, dep)));
}

export function deriveReady(graph: ExecGraph, state: GraphState): string[] {
  const ready: string[] = [];
  for (const node of graph.nodes) {
    const status = getStatus(state, node.id);
    if (status === "done" || status === "skipped" || status === "in_progress" || status === "failed") {
      continue;
    }
    if (depsSatisfied(node, state)) ready.push(node.id);
  }
  return ready;
}

export function effectiveStatus(graph: ExecGraph, state: GraphState, id: string): NodeStatus {
  const status = getStatus(state, id);
  if (status === "blocked" && deriveReady(graph, state).includes(id)) return "ready";
  return status;
}

export function validateAgainstState(graph: ExecGraph, state: GraphState): string[] {
  const errors: string[] = [];
  const ids = new Set(graph.nodes.map((n) => n.id));
  if (state.graphId !== graph.id) {
    errors.push(`state graphId ${state.graphId} != graph ${graph.id}`);
  }
  for (const node of graph.nodes) {
    if (!state.nodes[node.id]) errors.push(`state missing node ${node.id}`);
  }
  for (const id of Object.keys(state.nodes)) {
    if (!ids.has(id)) errors.push(`state has unknown node ${id}`);
  }
  return errors;
}

export function filterLoop(nodes: readonly GraphNode[], loop?: Loop): GraphNode[] {
  if (!loop) return [...nodes];
  return nodes.filter((n) => n.loop === loop);
}

export function buildPrompt(graph: ExecGraph, state: GraphState, id: string): AgentPrompt {
  const node = indexNodes(graph).get(id);
  if (!node) throw new Error(`Unknown node ${id}`);
  const status = effectiveStatus(graph, state, id);
  const executable = status === "ready" || status === "in_progress";

  return AgentPromptSchema.parse({
    nodeId: node.id,
    title: node.title,
    status,
    executable,
    role: node.agent.role,
    goal: node.goal,
    dependsOn: node.dependsOn,
    defaults: graph.defaults,
    forbidden: graph.forbidden,
    deliverables: node.deliverables,
    exitGate: node.exitGate,
    verify: node.verify.map((cmd) =>
      cmd
        .replaceAll("$WORKTREE", graph.defaults.worktree)
        .replaceAll("$BASE_SHA", graph.defaults.baseSha)
    ),
    inputs: node.inputs ?? [],
    outputs: node.outputs ?? [],
    instructions: node.agent.instructions,
    stopConditions: node.agent.stopConditions ?? [],
    howToFinish: [
      `npm run graph -- claim ${node.id} --agent <your-name>`,
      "Do the work. Capture evidence (SHA, CI URL, receipt path).",
      `npm run graph -- done ${node.id} --evidence "<proof>"`,
    ],
  });
}

export function setStatus(
  graph: ExecGraph,
  state: GraphState,
  id: string,
  status: Exclude<StoredStatus, "blocked">,
  extra: {
    agent?: string;
    evidence?: string;
    reason?: string;
    note?: string;
  } = {}
): GraphState {
  const node = indexNodes(graph).get(id);
  if (!node) throw new Error(`Unknown node ${id}`);

  if (status === "in_progress" || status === "done") {
    const current = getStatus(state, id);
    if (!depsSatisfied(node, state) && current !== "in_progress") {
      throw new Error(
        `${id} dependencies not satisfied: ${node.dependsOn.join(", ") || "(none)"}`
      );
    }
  }

  const prev = state.nodes[id];
  const nodeState: GraphState["nodes"][string] = {
    status,
    updatedAt: new Date().toISOString(),
  };
  const note = extra.note ?? prev?.note;
  const agent = extra.agent ?? prev?.agent;
  if (note !== undefined) nodeState.note = note;
  if (agent !== undefined) nodeState.agent = agent;
  if (extra.evidence !== undefined) nodeState.evidence = extra.evidence;
  if (extra.reason !== undefined) nodeState.reason = extra.reason;

  const next: GraphState = {
    ...state,
    nodes: {
      ...state.nodes,
      [id]: nodeState,
    },
  };
  return GraphStateSchema.parse(next);
}

export function exportMermaid(graph: ExecGraph, state: GraphState): string {
  const lines = ["flowchart TD"];
  for (const node of graph.nodes) {
    const status = effectiveStatus(graph, state, node.id);
    lines.push(`  ${node.id}["${node.id} ${node.title}\\n(${status})"]`);
  }
  for (const node of graph.nodes) {
    for (const dep of node.dependsOn) {
      lines.push(`  ${dep} --> ${node.id}`);
    }
  }
  return lines.join("\n");
}

export function plan(graph: ExecGraph, state: GraphState, loop?: Loop) {
  return topoSortIds(graph.nodes)
    .map((id) => indexNodes(graph).get(id)!)
    .filter((n) => !loop || n.loop === loop)
    .map((n) => ({
      id: n.id,
      title: n.title,
      loop: n.loop,
      status: effectiveStatus(graph, state, n.id),
      dependsOn: n.dependsOn,
    }));
}

export { topoSortIds, ExecGraphSchema, GraphStateSchema };
