# Prospect Studio — agent-ready baseline

**As of:** 2026-11-09 (America/Chicago)  
**Authority:** this file + `docs/SORT_OUT.md` + `docs/spec/PROSPECT_STUDIO_MASTER_SPEC_v3_2026-11-09.md` (PS-MASTER-3.1)  
**Executable order:** `graph/` (Zod DAG)

If an instruction from chat, an old PR, or a dirty worktree conflicts with this file, **this file wins**.

---

## 1. The only build lane

| Role | Value |
|---|---|
| Prod-matching base | GitHub `main` @ `db3056d` |
| Integration branch | `fix/phase0-prospect-reconcile-20261107` @ `21c4e8b` |
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
| `prospect-studio` | `rivet-spike-attach` + dirty `/compile` | freeze; never merge wholesale |
| `prospect-studio-build-hardening` | hygiene + dirty | freeze; cherry-pick only after audit |
| all other `prospect-studio-*` / `wt-*` | various | freeze; do not continue |

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
npm run graph -- prompt P0
```

---

## 5. Baseline exit criteria (before calling the repo “buildable”)

- [ ] PR **#35** is the only open implementation PR  
- [ ] Phase0 worktree clean and tracking origin  
- [ ] `npm ci` + codegen + unit + convex tests pass on phase0 against **dev**  
- [ ] No `/compile` route on phase0  
- [ ] Agents read `BASELINE.md` → `SORT_OUT.md` → `graph prompt` before coding  
- [ ] Stale Sprite worktrees labeled freeze (no new commits)  

P0 on the exec graph stays `in_progress` until the AgentOS verify/CI gate is honest-green; that does **not** unblock inventing a second lane.

---

## 6. After baseline

1. Finish #35 CI / AgentOS gate → merge phase0 to `main`  
2. Start **P1** from the graph (`npm run graph -- prompt P1`) on a branch cut from post-merge `main` (or from phase0 if still pre-merge)  
3. Cherry-pick auth from parked #30 **only if** still required after merge audit  
4. Delete or archive freeze worktrees after evidence is copied into docs  

---

## 7. One-sentence rule

**One Sprite worktree, one PR, one Convex dev deployment, one Zod graph — everything else is quarantine.**
