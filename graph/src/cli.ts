#!/usr/bin/env node
import { z } from "zod";
import {
  buildPrompt,
  deriveReady,
  effectiveStatus,
  exportMermaid,
  filterLoop,
  getStatus,
  indexNodes,
  loadGraph,
  loadState,
  plan,
  saveState,
  setStatus,
  topoSortIds,
  validateAgainstState,
} from "./engine.js";
import { LoopSchema, type Loop } from "./schema.js";

function usage(): never {
  console.error(`Usage: npm run graph -- <command> [args]

Commands:
  validate
  status [--loop loop1|later|conditional]
  next [--loop loop1|later|conditional]
  plan [--loop loop1|later|conditional]
  prompt <NODE_ID>
  claim <NODE_ID> [--agent name]
  done <NODE_ID> --evidence "..."
  fail <NODE_ID> --reason "..."
  skip <NODE_ID> --reason "..."
  export-mermaid`);
  process.exit(2);
}

function optionalFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function requireFlag(args: string[], name: string): string {
  const value = optionalFlag(args, name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function parseLoop(args: string[]): Loop | undefined {
  const raw = optionalFlag(args, "--loop");
  if (!raw) return undefined;
  return LoopSchema.parse(raw);
}

function main(): void {
  const [, , cmd, ...args] = process.argv;
  if (!cmd) usage();

  const graph = loadGraph();
  let state = loadState();
  const loop = parseLoop(args);

  switch (cmd) {
    case "validate": {
      const stateErrors = validateAgainstState(graph, state);
      if (stateErrors.length) {
        console.log(JSON.stringify({ ok: false, errors: stateErrors }, null, 2));
        process.exit(1);
      }
      console.log(
        JSON.stringify(
          { ok: true, nodes: graph.nodes.length, order: topoSortIds(graph.nodes) },
          null,
          2
        )
      );
      break;
    }
    case "status": {
      const ready = deriveReady(graph, state);
      const nodes = filterLoop(graph.nodes, loop).map((node) => ({
        id: node.id,
        title: node.title,
        loop: node.loop,
        status: effectiveStatus(graph, state, node.id),
        dependsOn: node.dependsOn.join(",") || "-",
      }));
      console.log(JSON.stringify({ graphId: graph.id, ready, nodes }, null, 2));
      break;
    }
    case "next": {
      const byId = indexNodes(graph);
      const readyIds = deriveReady(graph, state);
      const activeIds = graph.nodes
        .filter((n) => getStatus(state, n.id) === "in_progress")
        .map((n) => n.id);
      const pick = (ids: string[], status: "ready" | "in_progress") =>
        ids
          .map((id) => byId.get(id)!)
          .filter((n) => !loop || n.loop === loop)
          .map((n) => ({
            id: n.id,
            title: n.title,
            status,
            loop: n.loop,
            parallelOk: n.parallelOk ?? false,
            goal: n.goal,
            exitGate: n.exitGate,
          }));
      console.log(
        JSON.stringify(
          { active: pick(activeIds, "in_progress"), ready: pick(readyIds, "ready") },
          null,
          2
        )
      );
      break;
    }
    case "plan":
      console.log(JSON.stringify({ order: plan(graph, state, loop) }, null, 2));
      break;
    case "prompt": {
      const id = args[0];
      if (!id) usage();
      console.log(JSON.stringify(buildPrompt(graph, state, id), null, 2));
      break;
    }
    case "claim": {
      const id = args[0];
      if (!id) usage();
      state = setStatus(graph, state, id, "in_progress", {
        agent: optionalFlag(args, "--agent") ?? "agent",
      });
      saveState(state);
      console.log(JSON.stringify({ ok: true, id, status: "in_progress", state: state.nodes[id] }, null, 2));
      break;
    }
    case "done": {
      const id = args[0];
      if (!id) usage();
      state = setStatus(graph, state, id, "done", {
        evidence: requireFlag(args, "--evidence"),
      });
      saveState(state);
      console.log(JSON.stringify({ ok: true, id, status: "done", state: state.nodes[id] }, null, 2));
      break;
    }
    case "fail": {
      const id = args[0];
      if (!id) usage();
      state = setStatus(graph, state, id, "failed", {
        reason: requireFlag(args, "--reason"),
      });
      saveState(state);
      console.log(JSON.stringify({ ok: true, id, status: "failed", state: state.nodes[id] }, null, 2));
      break;
    }
    case "skip": {
      const id = args[0];
      if (!id) usage();
      state = setStatus(graph, state, id, "skipped", {
        reason: requireFlag(args, "--reason"),
      });
      saveState(state);
      console.log(JSON.stringify({ ok: true, id, status: "skipped", state: state.nodes[id] }, null, 2));
      break;
    }
    case "export-mermaid":
      console.log(exportMermaid(graph, state));
      break;
    default:
      usage();
  }
}

try {
  main();
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error(JSON.stringify({ ok: false, zod: error.flatten() }, null, 2));
    process.exit(1);
  }
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}
