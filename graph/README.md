# Agent-executable dependency graph (Zod + TypeScript)

Typed DAG for Prospect Studio Loop 1 (`PS-MASTER-3.1`). Zod parses graph + state on every load; the CLI refuses illegal transitions.

This folder is **self-contained**. It does not replace the app root `package.json`.

## Setup

```bash
cd graph
npm install
npm run typecheck
npm test
```

From repo root (sorted package only):

```bash
npm install
npm run graph -- next --loop loop1
```

## Agent loop

```bash
npm run graph -- validate
npm run graph -- next --loop loop1
npm run graph -- prompt P0
npm run graph -- claim P0 --agent cursor
npm run graph -- done P0 --evidence "sha=… ci=…"
```

## Layout

| Path | Role |
|---|---|
| `src/schema.ts` | Zod schemas + inferred types |
| `src/engine.ts` | load / topo / ready / claim / done |
| `src/cli.ts` | agent-facing CLI |
| `ps-loop1.exec.json` | graph data |
| `state.json` | mutable execution state |

## Rules

- Zod rejects unknown fields, bad node ids, missing deps, cycles
- `claim` / `done` require every `dependsOn` to be `done` or `skipped`
- `ready` is derived, never stored
- P12 starts `skipped` (Loop 1 Port deferral)
