/** Adapters: Design IR ↔ Puck data ↔ json-render-like agent specs. */

import {
  applyPatch,
  findNode,
  type DesignIr,
  type DesignNode,
  type DesignPatch,
} from "./ir.ts";

/** Minimal Puck-compatible data shape (adapter projection). */
export type PuckData = {
  root: { props: Record<string, unknown> };
  content: Array<{
    type: string;
    props: Record<string, unknown> & { id: string };
  }>;
};

/** Minimal json-render-like agent UI spec. */
export type JsonRenderSpec = {
  type: "design-proposal";
  version: "json-render-adapter.v1";
  nodes: Array<{
    id: string;
    component: string;
    props: Record<string, unknown>;
  }>;
};

function flatten(node: DesignNode, out: DesignNode[] = []): DesignNode[] {
  if (node.type !== "page") out.push(node);
  for (const child of node.children) flatten(child, out);
  return out;
}

export function irToPuck(ir: DesignIr): PuckData {
  return {
    root: { props: { title: ir.title, ...ir.root.props } },
    content: flatten(ir.root).map((n) => ({
      type: n.type,
      props: { id: n.id, componentId: n.componentId, ...n.props },
    })),
  };
}

export function puckToIr(base: DesignIr, data: PuckData): DesignIr {
  let next = structuredClone(base);
  const title =
    typeof data.root.props.title === "string" ? data.root.props.title : next.title;
  if (title !== next.title) {
    next = applyPatch(next, { op: "setTitle", value: title }, next.revision);
  }
  for (const block of data.content) {
    const nodeId = String(block.props.id ?? "");
    if (!nodeId) continue;
    const node = findNode(next.root, nodeId);
    if (!node) throw new Error(`unknown node ${nodeId}`);
    const { id: _id, componentId: _c, ...props } = block.props;
    for (const [key, value] of Object.entries(props)) {
      if (Object.is(node.props[key], value)) continue;
      next = applyPatch(next, { op: "setProp", nodeId, key, value }, next.revision);
    }
  }
  return next;
}

export function irToJsonRender(ir: DesignIr): JsonRenderSpec {
  return {
    type: "design-proposal",
    version: "json-render-adapter.v1",
    nodes: flatten(ir.root).map((n) => ({
      id: n.id,
      component: n.componentId ?? n.type,
      props: { ...n.props, type: n.type },
    })),
  };
}

export function jsonRenderToPatches(spec: JsonRenderSpec): DesignPatch[] {
  if (spec.type !== "design-proposal") throw new Error("invalid json-render spec");
  const patches: DesignPatch[] = [];
  for (const node of spec.nodes) {
    for (const [key, value] of Object.entries(node.props)) {
      if (key === "type") continue;
      patches.push({ op: "setProp", nodeId: node.id, key, value });
    }
  }
  return patches;
}

export function applyAgentProposal(
  ir: DesignIr,
  spec: JsonRenderSpec,
  expectedRevision: number,
): DesignIr {
  if (ir.revision !== expectedRevision) {
    throw new Error(
      `revision conflict: expected ${expectedRevision}, have ${ir.revision}`,
    );
  }
  let next = ir;
  for (const patch of jsonRenderToPatches(spec)) {
    if (patch.op === "setProp") {
      const node = findNode(next.root, patch.nodeId);
      if (!node) throw new Error(`unknown node ${patch.nodeId}`);
      if (Object.is(node.props[patch.key], patch.value)) continue;
    }
    next = applyPatch(next, patch, next.revision);
  }
  return next;
}

/** Manual Puck edit + agent proposal converge onto one versioned IR tip. */
export function convergeEdits(args: {
  base: DesignIr;
  manualPuck: PuckData;
  agentSpec: JsonRenderSpec;
}): { ir: DesignIr; path: string[] } {
  const afterManual = puckToIr(args.base, args.manualPuck);
  const afterAgent = applyAgentProposal(
    afterManual,
    args.agentSpec,
    afterManual.revision,
  );
  return {
    ir: afterAgent,
    path: [
      `manual@${afterManual.revision}`,
      `agent@${afterAgent.revision}`,
      `converged:${afterAgent.docId}@${afterAgent.revision}`,
    ],
  };
}
