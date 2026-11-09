#!/usr/bin/env node
import { z } from "zod";
import {
  canTransition,
  convexUnionSnippet,
  exportMermaid,
  listTransitions,
  loop1Path,
  machineSummary,
  nextStages,
  path,
  uiProjection,
} from "./engine.js";
import { LIFECYCLE_MACHINE } from "./machine.js";
import { LifecycleStageSchema, LoopScopeSchema } from "./schema.js";

function usage(): never {
  console.error(`Usage: npm run lifecycle -- <command> [args]

Commands:
  validate
  summary
  stages [--loop loop1|later]
  next <STAGE> [--loop loop1|later]
  can --from <STAGE> --to <STAGE> [--command kind] [--human] [--evidence a,b]
  path <FROM> <TO>
  loop1-path
  mermaid [--loop loop1|later]
  ui <STAGE>
  convex-union
  dump`);
  process.exit(2);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

function main(): void {
  const [, , cmd, ...args] = process.argv;
  if (!cmd) usage();
  const loopRaw = flag(args, "--loop");
  const loop = loopRaw ? LoopScopeSchema.parse(loopRaw) : undefined;

  switch (cmd) {
    case "validate":
      console.log(
        JSON.stringify(
          {
            ok: true,
            stages: LIFECYCLE_MACHINE.stages.length,
            transitions: LIFECYCLE_MACHINE.transitions.length,
            loop1Path: loop1Path(),
          },
          null,
          2
        )
      );
      break;
    case "summary":
      console.log(JSON.stringify(machineSummary(), null, 2));
      break;
    case "stages": {
      const stages = LIFECYCLE_MACHINE.stages.filter((s) => !loop || s.loop === loop);
      console.log(JSON.stringify({ stages }, null, 2));
      break;
    }
    case "next": {
      const stage = LifecycleStageSchema.parse(args[0]);
      console.log(JSON.stringify({ from: stage, next: nextStages(stage, loop), edges: listTransitions(stage, loop) }, null, 2));
      break;
    }
    case "can": {
      const from = LifecycleStageSchema.parse(flag(args, "--from"));
      const to = LifecycleStageSchema.parse(flag(args, "--to"));
      const command = flag(args, "--command");
      const humanApproved = args.includes("--human");
      const evidenceRaw = flag(args, "--evidence");
      const evidence = evidenceRaw ? evidenceRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
      console.log(
        JSON.stringify(
          canTransition({
            from,
            to,
            ...(command ? { command } : {}),
            ...(humanApproved ? { humanApproved: true } : {}),
            ...(evidence ? { evidence } : {}),
          }),
          null,
          2
        )
      );
      break;
    }
    case "path": {
      const from = LifecycleStageSchema.parse(args[0]);
      const to = LifecycleStageSchema.parse(args[1]);
      console.log(JSON.stringify({ path: path(from, to) }, null, 2));
      break;
    }
    case "loop1-path":
      console.log(JSON.stringify({ path: loop1Path() }, null, 2));
      break;
    case "mermaid":
      console.log(exportMermaid(loop));
      break;
    case "ui": {
      const stage = LifecycleStageSchema.parse(args[0]);
      console.log(JSON.stringify(uiProjection(stage), null, 2));
      break;
    }
    case "convex-union":
      console.log(convexUnionSnippet());
      break;
    case "dump":
      console.log(JSON.stringify(LIFECYCLE_MACHINE, null, 2));
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
  console.error(
    JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2)
  );
  process.exit(1);
}
