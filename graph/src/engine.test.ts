import assert from "node:assert/strict";
import {
  buildPrompt,
  deriveReady,
  loadGraph,
  loadState,
  setStatus,
  topoSortIds,
  validateAgainstState,
} from "./engine.js";
import { ExecGraphSchema } from "./schema.js";

const graph = loadGraph();
const state = loadState();

assert.equal(ExecGraphSchema.parse(graph).id, "prospect-studio-loop1");
assert.deepEqual(validateAgainstState(graph, state), []);
assert.ok(topoSortIds(graph.nodes)[0] === "P0");

const activeOrReady = [
  ...graph.nodes.filter((n) => state.nodes[n.id]?.status === "in_progress").map((n) => n.id),
  ...deriveReady(graph, state),
];
assert.ok(activeOrReady.includes("P0"));

const prompt = buildPrompt(graph, state, "P0");
assert.equal(prompt.executable, true);
assert.ok(prompt.verify.some((v) => v.includes("wt-prospect-phase0")));

assert.throws(() => setStatus(graph, state, "P2", "done", { evidence: "nope" }), /dependencies/);

console.log(JSON.stringify({ ok: true, tested: ["parse", "topo", "prompt", "dep-gate"] }));
