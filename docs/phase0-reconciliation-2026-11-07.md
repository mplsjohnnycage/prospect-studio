# Prospect Studio Phase 0 — Sprite reconciliation

Date: 2026-11-07 (US Central). Source baseline: private `mplsjohnnycage/prospect-studio` `main` at `db3056db1194aa990aa72cb1b155dd436c9dec82`, independently matching the latest READY Vercel production deployment. Work performed only on isolated branch `fix/phase0-prospect-reconcile-20261107` in Sprite worktree `/home/sprite/wt-prospect-phase0`. No production deployment or main-branch merge was authorized or attempted.

## Workspace inventory

| Copy | Branch / starting commit | Local modifications | Disposition |
| --- | --- | --- | --- |
| `/home/sprite/prospect-studio` | `rivet-spike-attach` / `159aa6e` | `AGENTS.md`, `convex/demos.ts`, `convex/http.ts`, `convex/schema.ts` | Preserve original; do not merge stale branch over current main. |
| `/home/sprite/prospect-studio-build-hardening` | `fix/build-dependency-hygiene-20261102` / `edf0780` | `convex/_generated/api.d.ts`, `convex/convex.config.ts`, `convex/demos.ts`, `convex/http.ts`, `convex/schema.ts`, `package-lock.json`, `package.json` | Review and cherry-pick safe components only; do not deploy this worktree or its former throwaway Convex project. |
| `/home/sprite/wt-prospect-phase0` | `fix/phase0-prospect-reconcile-20261107` / `db3056d` | Only audited Phase 0 changes | Sole integration/verification worktree. |

## Component decisions

| Component | Phase 0 decision |
| --- | --- |
| `@convex-dev/workflow@0.4.10` | Adopt |
| `@convex-dev/r2@0.10.4` | Adopt |
| `@convex-dev/resend` | Defer (Loop 1 has no outbound email) |
| Unauthenticated `POST /compile` | **Reject** — violates pre-generation human gate |

## Verification (as of phase0)

- `npm ci`, Convex codegen, and `convex dev --once` against `gregarious-ibis-329`: PASS
- Combined `npm run verify` still blocked by AgentOS sidecar hang under npm launcher — keep PR draft until CI green

## 2026-11-09 recheck

- `origin/main` still `db3056d`
- phase0 tip `21c4e8b` (docs honesty + unit worker cap commits on top of `708c5ac` Workflow/R2 adoption)
- Dirty rivet tree still contains the rejected compile queue — do not port
