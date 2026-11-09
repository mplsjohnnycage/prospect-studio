import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyAgentProposal,
  convergeEdits,
  irToJsonRender,
  irToPuck,
  puckToIr,
} from "./adapters.ts";
import { applyPatch, createDesignIr, diffRevisions } from "./ir.ts";

test("Design IR round-trips through Puck adapter", () => {
  const ir = createDesignIr({
    docId: "doc-1",
    prospectId: "p1",
    title: "Home",
    businessName: "Northside Painters",
    headline: "Paint done right",
  });
  const puck = irToPuck(ir);
  puck.content[0].props.headline = "Paint done right locally";
  const back = puckToIr(ir, puck);
  assert.ok(back.revision > ir.revision);
  assert.equal(
    (back.root.children.find((c) => c.id === "hero-1")?.props.headline),
    "Paint done right locally",
  );
  const again = irToPuck(back);
  const stable = puckToIr(back, again);
  assert.equal(
    stable.root.children.find((c) => c.id === "hero-1")?.props.headline,
    "Paint done right locally",
  );
});

test("json-render agent proposal uses expectedRevision and stays proposed", () => {
  const ir = createDesignIr({
    docId: "doc-1",
    prospectId: "p1",
    title: "Home",
    businessName: "Northside Painters",
    headline: "Paint done right",
  });
  const spec = {
    type: "design-proposal" as const,
    version: "json-render-adapter.v1" as const,
    nodes: [{ id: "hero-1", component: "ui.card", props: { headline: "Agent hero proposal" } }],
  };
  assert.throws(() => applyAgentProposal(ir, spec, ir.revision + 1));
  const next = applyAgentProposal(ir, spec, ir.revision);
  assert.equal(next.status, "proposed");
  assert.equal(next.root.children[0].props.headline, "Agent hero proposal");
});

test("manual edit + agent proposal converge to one versioned IR", () => {
  const base = createDesignIr({
    docId: "doc-1",
    prospectId: "p1",
    title: "Home",
    businessName: "Northside Painters",
    headline: "Paint done right",
  });
  const manual = irToPuck(base);
  manual.root.props.title = "Home v2";
  manual.content[2].props.label = "Call now";
  const agent = {
    type: "design-proposal" as const,
    version: "json-render-adapter.v1" as const,
    nodes: [{ id: "hero-1", component: "ui.card", props: { headline: "Neighborhood craft" } }],
  };
  const { ir, path } = convergeEdits({ base, manualPuck: manual, agentSpec: agent });
  assert.ok(ir.revision >= 3);
  assert.equal(ir.title, "Home v2");
  assert.equal(ir.root.children[0].props.headline, "Neighborhood craft");
  assert.equal(ir.root.children[2].props.label, "Call now");
  assert.ok(path.at(-1)?.startsWith("converged:"));
  assert.deepEqual(diffRevisions(base, ir).includes("root"), true);
});

test("patch validator rejects stale expectedRevision", () => {
  const ir = createDesignIr({
    docId: "doc-1",
    prospectId: "p1",
    title: "Home",
    businessName: "Northside Painters",
    headline: "Paint done right",
  });
  assert.throws(() =>
    applyPatch(ir, { op: "setTitle", value: "Nope" }, 99),
  );
});
