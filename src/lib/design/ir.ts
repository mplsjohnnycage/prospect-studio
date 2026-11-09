/** Canonical Design IR — Puck/json-render are adapters, not authorities. */

export const DESIGN_IR_VERSION = "design-ir.v1" as const;

export type DesignNodeType =
  | "page"
  | "section"
  | "hero"
  | "services"
  | "cta"
  | "text"
  | "image";

export type DesignNode = {
  id: string;
  type: DesignNodeType;
  componentId?: string;
  props: Record<string, unknown>;
  children: DesignNode[];
};

export type DesignIr = {
  version: typeof DESIGN_IR_VERSION;
  docId: string;
  prospectId: string;
  revision: number;
  status: "draft" | "proposed" | "approved";
  title: string;
  root: DesignNode;
  catalogVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type DesignPatch =
  | { op: "setProp"; nodeId: string; key: string; value: unknown }
  | { op: "setTitle"; value: string }
  | { op: "replaceNode"; nodeId: string; node: DesignNode };

export function createDesignIr(args: {
  docId: string;
  prospectId: string;
  title: string;
  businessName: string;
  headline: string;
  catalogVersion?: string;
}): DesignIr {
  const now = new Date().toISOString();
  return {
    version: DESIGN_IR_VERSION,
    docId: args.docId,
    prospectId: args.prospectId,
    revision: 1,
    status: "draft",
    title: args.title,
    catalogVersion: args.catalogVersion ?? "components.v1",
    createdAt: now,
    updatedAt: now,
    root: {
      id: "page-root",
      type: "page",
      props: { businessName: args.businessName },
      children: [
        {
          id: "hero-1",
          type: "hero",
          componentId: "ui.card",
          props: {
            headline: args.headline,
            ctaLabel: "Request an estimate",
          },
          children: [],
        },
        {
          id: "services-1",
          type: "services",
          componentId: "ui.card",
          props: { items: ["Service A", "Service B", "Service C"] },
          children: [],
        },
        {
          id: "cta-1",
          type: "cta",
          componentId: "ui.button",
          props: { label: "Contact" },
          children: [],
        },
      ],
    },
  };
}

export function findNode(root: DesignNode, nodeId: string): DesignNode | undefined {
  if (root.id === nodeId) return root;
  for (const child of root.children) {
    const hit = findNode(child, nodeId);
    if (hit) return hit;
  }
  return undefined;
}

export function cloneIr(ir: DesignIr): DesignIr {
  return structuredClone(ir);
}

export function applyPatch(
  ir: DesignIr,
  patch: DesignPatch,
  expectedRevision: number,
): DesignIr {
  if (ir.revision !== expectedRevision) {
    throw new Error(
      `revision conflict: expected ${expectedRevision}, have ${ir.revision}`,
    );
  }
  const next = cloneIr(ir);
  switch (patch.op) {
    case "setTitle": {
      if (!patch.value.trim()) throw new Error("title required");
      next.title = patch.value.trim();
      break;
    }
    case "setProp": {
      const node = findNode(next.root, patch.nodeId);
      if (!node) throw new Error(`unknown node ${patch.nodeId}`);
      node.props = { ...node.props, [patch.key]: patch.value };
      break;
    }
    case "replaceNode": {
      const replace = (n: DesignNode): DesignNode => {
        if (n.id === patch.nodeId) return structuredClone(patch.node);
        return { ...n, children: n.children.map(replace) };
      };
      next.root = replace(next.root);
      break;
    }
    default: {
      const _exhaustive: never = patch;
      throw new Error(`unsupported patch ${JSON.stringify(_exhaustive)}`);
    }
  }
  next.revision = ir.revision + 1;
  next.updatedAt = new Date().toISOString();
  next.status = "proposed";
  return next;
}

export function diffRevisions(a: DesignIr, b: DesignIr): string[] {
  const changes: string[] = [];
  if (a.docId !== b.docId) changes.push("docId");
  if (a.title !== b.title) changes.push("title");
  if (a.revision !== b.revision) changes.push(`revision:${a.revision}->${b.revision}`);
  if (JSON.stringify(a.root) !== JSON.stringify(b.root)) changes.push("root");
  return changes;
}
