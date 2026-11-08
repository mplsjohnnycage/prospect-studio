# Prospect Studio Phase 0 — Sprite reconciliation

Date: 2026-11-07 (US Central). Source baseline: private `mplsjohnnycage/prospect-studio` `main` at `db3056db1194aa990aa72cb1b155dd436c9dec82`, independently matching the latest READY Vercel production deployment. Work performed only on isolated branch `fix/phase0-prospect-reconcile-20261107` in Sprite worktree `/home/sprite/wt-prospect-phase0`. No production deployment or main-branch merge was authorized or attempted.

## Workspace inventory

| Copy | Branch / starting commit | Local modifications | Disposition |
| --- | --- | --- | --- |
| `/home/sprite/prospect-studio` | `rivet-spike-attach` / `159aa6e` | `AGENTS.md`, `convex/demos.ts`, `convex/http.ts`, `convex/schema.ts` | Preserve original; do not merge stale branch over current main. |
| `/home/sprite/prospect-studio-build-hardening` | `fix/build-dependency-hygiene-20261102` / `edf0780` | `convex/_generated/api.d.ts`, `convex/convex.config.ts`, `convex/demos.ts`, `convex/http.ts`, `convex/schema.ts`, `package-lock.json`, `package.json` | Review and cherry-pick safe components only; do not deploy this worktree or its former throwaway Convex project. |
| `/home/sprite/wt-prospect-phase0` | `fix/phase0-prospect-reconcile-20261107` / `db3056d` | Only audited Phase 0 changes | Sole integration/verification worktree. |

### Files changed relative to remote main

The original `rivet-spike-attach` branch diverged from `main` with `.env.example`, `convex/auth.ts`, `next.config.ts`, `src/app/api/rivet/stream/route.ts`, `src/app/rivet/page.tsx`, `src/lib/agentid-auth.test.ts`, `src/lib/agentid-auth.ts`, `src/lib/auth-domain-redirect.test.ts`, and `src/lib/rivet-events.ts`. These are not new hardening components and are excluded from this integration; several overlap later auth and frontend fixes in current main. Its four dirty files remain untouched.

The committed `fix/build-dependency-hygiene-20261102` branch differs from current `main` in `package-lock.json`, `package.json`, and the added `src/lib/build-dependency-hygiene.test.ts`. Its seven dirty files include the proposed Convex component registration, package additions, compile queue and HTTP endpoint. Do not copy the older branch wholesale: that would regress current production auth, frontend styles and test/build adjustments.

### Component-by-component review

| Component | Phase 0 decision | Reason |
| --- | --- | --- |
| `@convex-dev/workflow` | Adopt | Versioned, resumable stage orchestration for Loop 1. |
| `@convex-dev/r2` | Adopt | R2 objects hold versioned raw source extracts; Convex stores lean index. |
| `@convex-dev/resend` | Defer | Loop 1 ends at approved handoff. No outbound email; existing AgentMail retained. |
| `@browserbasehq/convex-stagehand` | Defer | Firecrawl adapter already exists; deep browser enrichment can be introduced after pilot proof. |
| `@vllnt/convex-suppression` | Defer | Outreach is not part of Loop 1, and safeguards must be designed with the outbound module. |
| `@convex-dev/static-hosting` | Defer | Demo artifact hosting route is not final; no need for an extra component before a working interactive demo exists. |
| `@convex-dev/rate-limiter`, `@convex-dev/aggregate`, `@convex-dev/action-cache` | Already installed | Retain current main definitions; no reinstallation. |
| Cron / migrations | Not installed as components | Convex native scheduling or a later schema migration may be used when a concrete stage requires it. |
| Polar, `convex-api-demo-with-ui` | Exclude | Unrelated to Loop 1 and known dependency/rendering risks in the source copy. |

### Security finding (reject)

The hardening copy introduced an unauthenticated `POST /compile` route in `convex/http.ts` that calls `internal.demos.queueCompile` without checking an owner identity, prospect approval or approved artifact hash. The corresponding `compileQueue` table and mutation therefore violate the explicit pre-generation human gate. **Do not port this route, queue, schema or mutation**. Introduce a new gate-aware compiler API separately with tests when Phase 6 is implemented.

### Dependency investigation

The clean `main` installation resolves `better-auth` **1.6.33**, `@convex-dev/better-auth` **0.12.6**, and `convex` **1.49.0**. The old hardening copy resolves `better-auth` **1.6.34** with the same Convex packages. The claimed `testProfiles/adapterAdditionalFields.js` error was not observed during a hardening-copy `convex codegen --dry-run` nor during a clean `main` codegen and development deployment; do not arbitrarily pin/change Better Auth without a failing reproduction.

### Verification receipts

- `npm ci` on isolated current `main`: PASS, 1045 packages using npm 11.6.2.
- `convex codegen --typecheck disable` on isolated current `main`: PASS.
- `convex dev --once --typecheck disable --tail-logs disable`, with `.env.local` explicitly scoped to `dev:gregarious-ibis-329`: PASS, "Convex functions ready". **This was development, not production.**
- Hardening-copy codegen dry-run: PASS; original stale Rivet worktree codegen dry-run exceeded 70 seconds (not proof of a dependency error).
- Selective integration: added exactly `@convex-dev/workflow@0.4.10` and `@convex-dev/r2@0.10.4`; `convex codegen --typecheck disable` PASS with both registered.
- Repeat `convex dev --once --typecheck disable --tail-logs disable` against `gregarious-ibis-329`: PASS, installs `r2`, `r2/actionRetrier`, `workflow`, `workflow/workpool`, `workflow/workpool/batchWorker`, then reports "Convex functions ready".
- Full `npm run verify`: **FAIL (unrelated existing AgentOS runtime test)**. Unit test report: 117 total, 116 pass, 1 fail (`src/lib/agentos.test.ts` guest VM process): `SidecarSilenceTimeout`, no protocol frames or heartbeats for 32.4s. This is not evidence that the Convex components are broken, but it blocks a full-green claim. Preserve the test. A focused rerun passed 3/3 tests, including the AgentOS VM guest execution (8.8s). A full 117-test rerun with Node test concurrency limited to four passed 117/117 (2.9s); unrestricted worker concurrency causes the sidecar cold-start timeout. The `test:unit` script now limits parallel workers to four. The full CI-style `npm run verify` is still required after this change.
- Separate `vitest run` PASS (3 files, 8 tests), `npm run lint` PASS (0 errors, 1 preexisting unused-variable warning in `convex/actorEvents.ts`), and `npm run typecheck` PASS (exit 0). Repeat full `npm run verify` with the explicit concurrency cap before moving this PR out of draft.

## Constraints for the next execution phase

Production `rightful-elk-426`, the throwaway `charmed-star-112`, customer outreach and automatic generation for unapproved prospects remain out of scope. The next build phase is Overture baseline extraction with versioned R2 objects and a lean Convex `places` index. All qualifications, scores, and demo actions must retain source evidence and explicit human approval semantics.
