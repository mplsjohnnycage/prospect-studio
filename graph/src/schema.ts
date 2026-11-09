import { z } from "zod";

export const NodeIdSchema = z
  .string()
  .regex(/^P\d+$/, "node id must look like P0, P1, …");

export const LoopSchema = z.enum(["loop1", "later", "conditional"]);
export type Loop = z.infer<typeof LoopSchema>;

export const StoredStatusSchema = z.enum([
  "blocked",
  "in_progress",
  "done",
  "failed",
  "skipped",
]);
export type StoredStatus = z.infer<typeof StoredStatusSchema>;

export const NodeStatusSchema = z.enum([
  "blocked",
  "ready",
  "in_progress",
  "done",
  "failed",
  "skipped",
]);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

export const AgentSpecSchema = z
  .object({
    role: z.string().min(1),
    instructions: z.array(z.string().min(1)).min(1),
    stopConditions: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const GraphNodeSchema = z
  .object({
    id: NodeIdSchema,
    title: z.string().min(1),
    dependsOn: z.array(NodeIdSchema),
    loop: LoopSchema,
    parallelOk: z.boolean().optional(),
    goal: z.string().min(1),
    deliverables: z.array(z.string().min(1)).min(1),
    exitGate: z.string().min(1),
    verify: z.array(z.string().min(1)).min(1),
    inputs: z.array(z.string()).optional(),
    outputs: z.array(z.string()).optional(),
    agent: AgentSpecSchema,
  })
  .strict();
export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphDefaultsSchema = z
  .object({
    convexDev: z.string().min(1),
    convexProd: z.string().min(1),
    worktree: z.string().min(1),
    baseSha: z.string().min(1),
    integrationBranch: z.string().min(1),
  })
  .strict();

export const ExecGraphSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    spec: z.string().min(1),
    asOf: z.string().optional(),
    defaults: GraphDefaultsSchema,
    forbidden: z.array(z.string().min(1)).default([]),
    nodes: z.array(GraphNodeSchema).min(1),
  })
  .strict()
  .superRefine((graph, ctx) => {
    const ids = new Set<string>();
    for (const node of graph.nodes) {
      if (ids.has(node.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate node id ${node.id}`,
          path: ["nodes"],
        });
      }
      ids.add(node.id);
    }
    for (const node of graph.nodes) {
      for (const dep of node.dependsOn) {
        if (!ids.has(dep)) {
          ctx.addIssue({
            code: "custom",
            message: `${node.id} depends on missing ${dep}`,
            path: ["nodes"],
          });
        }
      }
    }
    try {
      topoSortIds(graph.nodes);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "cycle detected",
        path: ["nodes"],
      });
    }
  });
export type ExecGraph = z.infer<typeof ExecGraphSchema>;

export const NodeStateSchema = z
  .object({
    status: StoredStatusSchema,
    note: z.string().optional(),
    agent: z.string().optional(),
    evidence: z.string().optional(),
    reason: z.string().optional(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();
export type NodeState = z.infer<typeof NodeStateSchema>;

export const GraphStateSchema = z
  .object({
    graphId: z.string().min(1),
    graphVersion: z.string().min(1),
    updatedAt: z.string().datetime(),
    nodes: z.record(z.string(), NodeStateSchema),
  })
  .strict()
  .superRefine((state, ctx) => {
    for (const id of Object.keys(state.nodes)) {
      if (!/^P\d+$/.test(id)) {
        ctx.addIssue({
          code: "custom",
          message: `invalid node id in state: ${id}`,
          path: ["nodes", id],
        });
      }
    }
  });
export type GraphState = z.infer<typeof GraphStateSchema>;

export const AgentPromptSchema = z
  .object({
    nodeId: NodeIdSchema,
    title: z.string(),
    status: NodeStatusSchema,
    executable: z.boolean(),
    role: z.string(),
    goal: z.string(),
    dependsOn: z.array(NodeIdSchema),
    defaults: GraphDefaultsSchema,
    forbidden: z.array(z.string()),
    deliverables: z.array(z.string()),
    exitGate: z.string(),
    verify: z.array(z.string()),
    inputs: z.array(z.string()),
    outputs: z.array(z.string()),
    instructions: z.array(z.string()),
    stopConditions: z.array(z.string()),
    howToFinish: z.array(z.string()),
  })
  .strict();
export type AgentPrompt = z.infer<typeof AgentPromptSchema>;

/** Pure topo helper used by schema refine + engine. */
export function topoSortIds(nodes: readonly GraphNode[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const indeg = new Map<string, number>();
  for (const id of byId.keys()) indeg.set(id, 0);
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (!byId.has(dep)) {
        throw new Error(`${node.id} depends on missing ${dep}`);
      }
      indeg.set(node.id, (indeg.get(node.id) ?? 0) + 1);
    }
  }
  const queue = [...indeg.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id)
    .sort();
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const node of nodes) {
      if (!node.dependsOn.includes(id)) continue;
      const next = (indeg.get(node.id) ?? 0) - 1;
      indeg.set(node.id, next);
      if (next === 0) queue.push(node.id);
    }
    queue.sort();
  }
  if (order.length !== nodes.length) {
    throw new Error("Cycle detected in dependency graph");
  }
  return order;
}
