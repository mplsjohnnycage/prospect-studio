# GitHub push / merge / deploy — agent rules

**As of:** 2026-11-09 (America/Chicago)  
**Binding:** `AGENTS.md` §8. This file is the operational detail.

GitHub branch protection / rulesets are **not applied** on this private repo today (account plan cannot enable them). Agents must obey these rules anyway.

---

## 1. Remotes and targets

| Target | What it is | Agent write? |
|---|---|---|
| `origin` GitHub `mplsjohnnycage/prospect-studio` | Source of truth | Yes, on allowed branches only |
| Branch `main` | Production-matching base + merge destination | **Never push commits directly** |
| Branch `fix/phase0-prospect-reconcile-20261107` | Only active build lane (PR #35) | Yes — normal commits |
| Branch `docs/goldfish-sort-20261109` | Sorted docs / harness mirror | Docs-only commits OK |
| Quarantined branches / worktrees | Freeze | **No** |
| Convex `gregarious-ibis-329` | Dev control plane | Yes |
| Convex `rightful-elk-426` | Prod control plane | **Human OK required** |
| Vercel project `prospect-studio` | Frontend hosting | Preview OK; production only after `main` merge + human |

---

## 2. Push rules

### Allowed

1. Push to `fix/phase0-prospect-reconcile-20261107` for Loop-1 / P0 work (updates PR #35).
2. Push short-lived `cursor/*-d627` branches **cut from phase0** (or from post-merge `main`) that open PRs **into phase0** or into `main` only after #35 merges — never parallel “second implementation” PRs against `main` while #35 is open.
3. Push docs-only updates to `docs/goldfish-sort-20261109`.
4. Prefer `--force-with-lease` over `--force` when rewriting a personal tip; never force-push `main`.

### Forbidden

1. `git push origin main` with new commits (no direct-to-main).
2. Force-push `main` or rewrite published history on shared lanes without explicit human OK.
3. Push from a worktree that contains `QUARANTINE.md`.
4. Open a new implementation PR to `main` while #35 is the active lane.
5. Push secrets, `.env*`, Convex prod deploy keys, or real customer data.

### Required before every push to phase0

```bash
npm run agent:preflight
# then relevant typecheck/tests for the files touched
git status   # confirm branch name
```

---

## 3. Pull request / merge rules

| Rule | Detail |
|---|---|
| Active implementation PR | **#35 only** until merged |
| Base of #35 | `main` |
| Draft | Keep **draft** until CI green + human marks ready |
| Merge method | Squash or merge commit per human preference; no dirty quarantine squash |
| Who merges #35 | **Human** (Johnny). Agents prepare; agents do **not** merge #35 or `main` |
| Required checks (treat as binding even without rulesets) | CI jobs: `lint`, `typecheck`, `unit`, `convex-test` |
| Non-blocking | Jobs marked `(non-blocking)` / `continue-on-error` must not be used to “pass” a merge |
| Review | Prefer 1 approving review / CODEOWNERS when available; self-merge only with human OK |
| After merge | Delete the head branch only if human asks; update BASELINE SHAs |

### Agent merge permissions

| Action | Agent |
|---|---|
| Comment on #35 | Yes |
| Push commits to #35 head | Yes |
| Mark ready for review | Only when CI green **and** human asked |
| Merge #35 → `main` | **No** |
| Merge anything into `main` | **No** |
| Close other PRs as superseded | Yes (already done for Wave 1) |
| Reopen quarantined PRs | **No** |

Proposal for real GitHub rulesets (human applies): `docs/BRANCH_PROTECTION_PROPOSAL.md` — **NOT APPLIED**.

---

## 4. Deploy rules

### Environments

| Env | Frontend | Convex | When agents may touch |
|---|---|---|---|
| Local / Sprite | `npm run dev` | `.env.local` → `gregarious-ibis-329` | Always for lane work |
| Preview | Vercel preview from PR SHA | Dev Convex only unless human says otherwise | OK when Vercel linked |
| Production | Vercel production from `main` | `rightful-elk-426` | **Human gate** |

### MUST

1. Treat production deploy as a **human-gated** action after #35 merges and BASELINE exit criteria.
2. Point previews and Sprite work at **Convex dev**.
3. Keep deploy receipts (SHA, Vercel URL, Convex deployment name) in PR comments when a deploy is intentional.

### MUST NOT

1. Run `npx convex deploy` / prod schema push to `rightful-elk-426` without explicit human OK in the same turn.
2. Flip production env vars, SSO, or domain DNS.
3. Enable automatic outreach send, production email webhooks, or public unauthenticated compile/build routes as part of “just deploying.”
4. Treat a red Vercel account/deploy block as “fix by deleting protection.”
5. Deploy from quarantined branches.

### Current known state (do not “fix” by inventing infra)

- Production branch intent: `main`.
- Automatic Git→Vercel connect may still need owner authorization (`docs/DEPLOYMENT_STATUS.md`).
- Vercel team SSO can block agent-triggered deploys; report, don’t bypass.
- Loop-1 “deploy” of a customer site means Sprite/R2 artifact + lifecycle `Handoff` — **not** promoting Prospect Studio itself to prod.

---

## 5. CI failure triage

1. Read the failing job log; fix on phase0; push.
2. Do not disable checks, delete workflows, or `continue-on-error` to greenwash.
3. Known AgentOS verify hang under npm launcher: documented in BASELINE — do not declare whole baseline broken solely for that; prefer CI job result.
4. If Vercel status is `FAILURE` for account/SSO reasons, note it on the PR; do not merge on that alone being red if CI Actions are green — **human** decides.

---

## 6. Post-#35 merge sequence (human-driven)

1. Human merges #35 when CI green + ready.
2. Agents update `docs/BASELINE.md` SHAs on `main`.
3. Cut next graph node branch from `main` (`npm run graph -- next`).
4. Production Convex/Vercel promotion only with human OK checklist.
