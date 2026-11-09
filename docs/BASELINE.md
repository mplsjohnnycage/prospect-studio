# Prospect Studio — agent-ready baseline

**As of:** 2026-11-09 (America/Chicago)  
**Authority stack:** `AGENTS.md` (mandatory harness) → this file → `docs/SORT_OUT.md` → PS-MASTER-3.1  
**Executable order:** `npm run agent:preflight` → `graph/` DAG → `lifecycle/` FSM  
**Push / merge / deploy:** `docs/GIT_AND_DEPLOY.md` (agents never merge to `main` or prod-deploy without human OK)

If an instruction from chat, an old PR, or a dirty worktree conflicts with `AGENTS.md` / this file, **those files win**.

---

## 1. The only build lane

| Role | Value |
|---|---|
| Prod-matching base | GitHub `main` @ `db3056d` |
| Integration branch | `fix/phase0-prospect-reconcile-20261107` @ `d854744` |
| Active PR | **#35 only** (draft until CI green) |
| Sprite worktree | `/home/sprite/wt-prospect-phase0` on Sprite `prospect-studio` |
| Convex write target | **dev only** `gregarious-ibis-329` |
| Convex prod | `rightful-elk-426` — **read/compare only** without explicit human OK |

No other branch is a starting point for new implementation work.

---

## 2. Quarantine (do not build from these)

### GitHub

- All open PRs **except #35** are superseded or parked. Do not continue them.
- Parked auth candidate (post-baseline cherry-pick only): `fix/pr14-rebase-current-main-20261104` / former PR #30.
- Dirty / spike history: `rivet-spike-attach`, agentic-split/*, hygiene rebases, ai-runtime rebases.

### Sprite worktrees

Use **only** `wt-prospect-phase0`. Everything else is archive/spike:

| Path | Branch | Rule |
|---|---|---|
| `wt-prospect-phase0` | phase0 | **ONLY active lane** |
| `prospect-studio` | `rivet-spike-attach` + dirty `/compile` | freeze; never merge wholesale; `QUARANTINE.md` |
| `prospect-studio-build-hardening` | hygiene + dirty | freeze; cherry-pick only after audit |
| all other `prospect-studio-*` / `wt-*` | various | freeze; **all** have `QUARANTINE.md` as of 2026-11-09 |

---

## 3. Hard rejects (universal)

Agents MUST NOT:

1. Write Convex prod (`rightful-elk-426`) without explicit human OK  
2. Merge dirty `rivet-spike-attach` or hardening trees onto `main` / phase0  
3. Add or keep unauthenticated `POST /compile`  
4. Treat Port as Loop 1 approval authority  
5. Start work from any PR other than #35  
6. Invent CommandKind / hash / role matrix outside P1 on the graph  
7. Mark graph nodes `done` without exit-gate evidence  
8. Host DuckDB (or treat it as infra SoT) — DuckDB is **embedded on Sprite workers only**; extracts land in R2, business state stays in Convex  
9. Invent a second business FSM (UI labels, Rivet, Port, Surreal, etc.) — only `lifecycle/` §15.2 machine may advance `lifecycleStage`  

---

## 4. Reliable build recipe (agent)

```bash
# on Sprite prospect-studio
cd /home/sprite/wt-prospect-phase0
git fetch origin
git checkout fix/phase0-prospect-reconcile-20261107
git reset --hard origin/fix/phase0-prospect-reconcile-20261107
npm ci
npx convex codegen   # against gregarious-ibis-329 via .env.local
npm run typecheck
npm run test:unit
npm run test:convex
# npm run verify  # known AgentOS sidecar hang under npm launcher — do not declare baseline broken solely for this; prefer CI
```

Graph (self-contained; does not replace app `package.json`):

```bash
cd graph && npm ci
npm run graph -- next --loop loop1
npm run graph -- next --loop loop1
npm run graph -- prompt P1
```

---

## 5. Baseline exit criteria (before calling the repo “buildable”)

- [ ] PR **#35** is the only open implementation PR  
- [ ] Phase0 worktree clean and tracking origin  
- [ ] `npm ci` + codegen + unit + convex tests pass on phase0 against **dev**  
- [ ] No `/compile` route on phase0  
- [ ] Agents read `BASELINE.md` → `SORT_OUT.md` → `graph prompt` before coding  
- [ ] Stale Sprite worktrees labeled freeze (no new commits)  

Graph **P0 is `done`** (evidence in `graph/state.json`). **P1 is ready** — `npm run graph -- prompt P1`. PR #35 stays draft until CI green; Vercel account block is a human deploy issue. Still **one lane only**.

---

## 6. After baseline

1. Finish #35 CI / AgentOS gate → merge phase0 to `main`  
2. Start **P1** from the graph (`npm run graph -- prompt P1`) on a branch cut from post-merge `main` (or from phase0 if still pre-merge)  
3. Cherry-pick auth from parked #30 **only if** still required after merge audit  
4. Delete or archive freeze worktrees after evidence is copied into docs  

---

## 7. Spine + slots (why the FSM matters)

The **lifecycle state machine** (`lifecycle/`, PS-MASTER-3.1 §15.2) is the only business spine. Everything else **slots in** as an adapter that produces evidence/receipts for a legal transition — it does not own stage:

| Slot | Adapter role | Must never |
|---|---|---|
| Convex | Commit stage + commands + outbox | Share stage authority |
| R2 | Store bytes; return hash/refs | Decide stage |
| Sprite + embedded DuckDB | Run extract/build/QA jobs | Host SoT or advance stage alone |
| Rivet | Live agent session | Duplicate business FSM |
| Vercel / UI / MCP | Submit same typed commands | Shadow pipeline |
| Port / Surreal / etc. | Deferred / non-authoritative | Become second ledger |

Agents implement a slot by: emit allowed `command` → collect `requiredEvidence` → call Convex reducer that runs `canTransition` → commit. If it doesn't map to a legal edge, it doesn't ship.

## 8. One-sentence rule

**One lifecycle spine, one Sprite worktree, one PR, one Convex dev — adapters slot in; nothing else owns stage.**
