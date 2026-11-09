# Prospect Studio — agent instructions

**Read first:** `docs/BASELINE.md` (also on branch `docs/goldfish-sort-20261109`).

## Only build lane
- Worktree: `/home/sprite/wt-prospect-phase0`
- Branch: `fix/phase0-prospect-reconcile-20261107`
- PR: https://github.com/mplsjohnnycage/prospect-studio/pull/35
- Convex: dev `gregarious-ibis-329` only
- Graph: `cd graph && npm ci && npm run graph -- next --loop loop1`

## Hard rejects
- No Convex prod writes without explicit human OK
- No work from quarantined worktrees (see `QUARANTINE.md` there)
- No unauthenticated `/compile`
- No second implementation PR while #35 is open

## Spec
PS-MASTER-3.1 + `docs/SORT_OUT.md`. Port deferred for Loop 1. Playwright QA only (no Jev).
