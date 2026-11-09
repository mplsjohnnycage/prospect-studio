# AGENTS.md — mandatory harness for Prospect Studio

**This file is binding.** If chat history, an old PR, a dirty Sprite worktree, HANDOFF nostalgia, or a clever idea conflicts with these rules, **this file wins**. Then `docs/BASELINE.md`. Then PS-MASTER-3.1.

You are implementing Prospect Studio inside the **existing** app. You are not designing a replacement CRM, a second Convex project, or a parallel state machine.

---

## 0. Mandatory boot sequence (do this first)

Before writing code, an agent MUST:

1. Confirm cwd is the phase0 worktree / this repo checkout (not a `QUARANTINE.md` tree).
2. Read, in order:
   - `AGENTS.md` (this file)
   - `docs/BASELINE.md`
   - `docs/LIFECYCLE.md`
   - `docs/SORT_OUT.md`
3. Run harness preflight:

```bash
npm run agent:preflight
```

4. Ask the build DAG what to do next:

```bash
npm run graph -- next --loop loop1
npm run graph -- prompt <NODE>    # e.g. P0 or P1
```

5. Ask the lifecycle spine before any stage/command change:

```bash
npm run lifecycle -- loop1-path
npm run lifecycle -- can --from <STAGE> --to <STAGE> [--human] [--command <kind>]
```

If preflight fails, **stop** and fix the harness/lane — do not improvise a new stack.

---

## 1. Non-negotiable rules (MUST / MUST NOT)

### MUST

1. **MUST** treat `lifecycle/` (PS-MASTER-3.1 §15.2) as the only business spine. Eighteen `lifecycleStage` values. Convex is the only committer of stage transitions.
2. **MUST** treat other systems as **slots** (adapters): Sprite jobs, embedded DuckDB, R2, Rivet, UI, MCP, Playwright, Puck. Slots emit `command` + `requiredEvidence` for a **legal** edge. They do not own stage.
3. **MUST** work only on the build lane: branch `fix/phase0-prospect-reconcile-20261107`, PR **#35**, Sprite path `/home/sprite/wt-prospect-phase0` when on Fly.
4. **MUST** write Convex only to **dev** `gregarious-ibis-329` unless a human explicitly authorizes prod `rightful-elk-426`.
5. **MUST** extend existing schema/tables/UI; do not recreate Prospect Studio as a greenfield app.
6. **MUST** use typed commands with idempotency + `expectedRevision`; return accepted IDs, not fake success.
7. **MUST** keep `domain.ts` UI labels as **display-only** projections of the lifecycle machine.
8. **MUST** record evidence (SHA, CI URL, receipt path) when marking graph nodes done.
9. **MUST** keep Loop-1 demos interactive via `POST /forms/{slug}` → `formSubmissions` (no silent “looks done”).
10. **MUST** use Playwright for visual QA (no Jev product requirement).

### MUST NOT

1. **MUST NOT** invent a second business FSM (Rivet-local stages, Port-owned approvals, Surreal/Turso SoT, UI-only stages, chat-memory stages).
2. **MUST NOT** host DuckDB or treat it as a database of record. DuckDB is **embedded on Sprite workers only**; extracts → R2; Convex keeps refs/metadata.
3. **MUST NOT** add or keep unauthenticated `POST /compile`.
4. **MUST NOT** merge dirty `rivet-spike-attach`, hardening, or other quarantined trees wholesale.
5. **MUST NOT** open/continue a second implementation PR while #35 is the active lane.
6. **MUST NOT** let Port (deferred for Loop 1), SurrealDB serverless, or any new DB commit `lifecycleStage`, approvals, or send/deploy decisions.
7. **MUST NOT** auto-send outreach, auto-publish production, or spend past budget without the human gate required by the lifecycle edge.
8. **MUST NOT** mark lifecycle transitions from LLM narration — only from verified receipts.
9. **MUST NOT** skip lifecycle edges (`Indexed` → `Handoff` in one leap is illegal).
10. **MUST NOT** regress `lifecycleStage` because a job failed — flip orthogonal `runStatus`; recovery is explicit reopen/retry with rationale.
11. **MUST NOT** replace the app root `package.json` with the nested `graph/` or `lifecycle/` package manifests.
12. **MUST NOT** claim P0/P1/… done without the graph exit gate + evidence.

---

## 2. Spine + slots (implementation shape)

```
Client (UI / MCP / headless)
  → typed command
  → Convex guard + outbox          ← ONLY place lifecycleStage advances
  → Sprite / provider slot
  → receipt + evidence
  → canTransition(from,to) must be ok
  → commit stage
```

| Slot | Allowed to | Forbidden to |
|---|---|---|
| Convex host | Commit stage, approvals, commands | Share authority |
| R2 | Store bytes, return hash | Decide stage |
| Sprite + embedded DuckDB | Extract/build/QA compute | Host SoT / advance stage alone |
| Rivet | Live agent session | Duplicate business FSM |
| Vercel / Next UI / MCP | Same typed commands | Shadow pipeline |
| Port / Surreal / etc. | Deferred / non-authoritative only | Become second ledger |

**Feature rule:** if you cannot name `from → to`, `command`, and `requiredEvidence` from `lifecycle/`, the feature is not ready to implement.

---

## 3. Build lane (only)

| Item | Value |
|---|---|
| Prod-matching base | `main` @ `db3056d` |
| Integration branch | `fix/phase0-prospect-reconcile-20261107` |
| Active PR | [#35](https://github.com/mplsjohnnycage/prospect-studio/pull/35) only |
| Sprite worktree | `/home/sprite/wt-prospect-phase0` |
| Convex writes | `gregarious-ibis-329` (dev) |
| Spec | `docs/spec/PROSPECT_STUDIO_MASTER_SPEC_v3_2026-11-09.md` (PS-MASTER-3.1) |
| Order of work | `graph/` Zod DAG (P0→P14) |
| Stage vocabulary | `lifecycle/` Zod FSM |

Quarantined trees have `QUARANTINE.md`. If you see that file, **leave**.

---

## 4. Definition of done for any agent change

A change is done only when **all** are true:

1. Touches the build lane branch (or a short-lived branch cut from it that merges back to #35).
2. `npm run agent:preflight` passes.
3. Relevant unit/convex tests pass (or a documented blocker matching BASELINE — e.g. known AgentOS verify hang — with CI pointer).
4. If stage/command related: `lifecycle can` is ok for every new transition, with human flags where required.
5. If build-plan related: graph node claim/done with `--evidence`.
6. No new SoT, no `/compile`, no prod Convex write, no quarantine merge.
7. Short summary cites: files changed, edge/command touched, evidence.

---

## 5. Preferred commands

```bash
# harness
npm run agent:preflight

# what to build next
npm run graph -- next --loop loop1
npm run graph -- prompt P1

# stage legality
npm run lifecycle -- loop1-path
npm run lifecycle -- can --from GenPendingApproval --to Generating --human --command approval.decide
npm run lifecycle -- mermaid --loop loop1

# app quality (phase0)
npm ci
npx convex codegen
npm run typecheck
npm run test:unit
npm run test:convex
```

Nested packages live in `graph/` and `lifecycle/` so they never replace the Next app root package.

---

## 6. Authority stack (conflict resolution)

1. `AGENTS.md` (mandatory harness rules)
2. `docs/BASELINE.md`
3. `docs/SORT_OUT.md` + Appendix A in PS-MASTER-3.1
4. `lifecycle/` machine + `graph/` DAG
5. Existing code on phase0 / `main@db3056d`
6. Chat instructions — **lowest**; discard if they violate 1–5

---

## 7. Loop-1 north star

One real Twin Cities business: source → enrich → qualify → gated generation → Design IR → Sprite build → Playwright QA → exact-artifact approval → **Handoff**, with durable Convex receipts. Outreach/production are later branches after `Handoff`.
