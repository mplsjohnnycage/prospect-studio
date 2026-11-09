# Prospect Studio — sorted (2026-11-09)

Live inspection of Fly Sprite `elifant-goldfish` + `prospect-studio`, then goldfish Wave 1 blocker fixes applied to the master spec.

**Agent-ready baseline:** read [`BASELINE.md`](./BASELINE.md) first. One worktree, one PR (#35), one Convex dev, one Zod graph. Everything else is quarantine.

## What was wrong

1. Master spec had four competing stage vocabularies, dual Port/Convex approval authority, undefined Jev QA, and conversation-over-document precedence.
2. Sprite worktrees disagreed: dirty `rivet-spike-attach`, rejected hardening `/compile` route, and a real phase0 branch that already adopted Workflow + R2.
3. Implementers could not start P1 without inventing the enum, hash rules, and base branch.

## Locked decisions (do not reopen without a new Appendix A entry)

| Decision | Choice |
|---|---|
| Spec authority | `docs/spec/PROSPECT_STUDIO_MASTER_SPEC_v3_2026-11-09.md` (PS-MASTER-3.1) |
| Code base of truth | GitHub `main` @ `db3056d` (matches READY Vercel prod) |
| Integration branch | `fix/phase0-prospect-reconcile-20261107` @ `21c4e8b` on Sprite `prospect-studio` worktree `/home/sprite/wt-prospect-phase0` |
| Convex targets | prod `rightful-elk-426` (do not write without explicit OK); dev `gregarious-ibis-329` |
| Workflow / R2 | Adopt `@convex-dev/workflow@0.4.10` and `@convex-dev/r2@0.10.4` from phase0 |
| Unauthenticated `POST /compile` | **Reject** — present in dirty `rivet-spike-attach` and hardening trees; violates human gate |
| Lifecycle | Persist §15.2 18-state union; `domain.ts` is display-only |
| Approvals | Convex sole decision record; Port deferred for Loop 1 |
| Visual QA | Playwright screenshots; no Jev product required |
| Interactive demos | `POST /forms/{slug}` → `formSubmissions` |
| DuckDB | **Embedded only** on Sprite discovery workers — never a hosted DB (no MotherDuck/managed DuckDB as SoT). Reads Overture GeoParquet → writes extract artifacts to R2; Convex stores refs/metadata only |
| Lifecycle FSM | Zod machine in `lifecycle/` = PS-MASTER-3.1 §15.2 (18 stages). **Spine** of the system — Convex sole authority; Loop-1 ends at `Handoff`; UI `domain.ts` is display-only. All other subsystems are slots that feed evidence into legal transitions |

## Sprite inventory (rechecked 2026-11-09)

| Path | Branch / SHA | Action |
|---|---|---|
| `/home/sprite/wt-prospect-phase0` | `fix/phase0-prospect-reconcile-20261107` / `21c4e8b` | **Use this** |
| `/home/sprite/prospect-studio` | `rivet-spike-attach` / `159aa6e` + dirty compile queue | Preserve; do not merge over main |
| `/home/sprite/prospect-studio-build-hardening` | `fix/build-dependency-hygiene-20261102` / `edf0780` + dirty | Cherry-pick only after audit; never deploy wholesale |

## Spec fixes landed in PS-MASTER-3.1

| ID | Fix |
|---|---|
| B13 | Spec is authoritative; Appendix A decision log |
| B2 | Host Convex owns approvals + worker registry |
| B3 | Canonical `lifecycleStage` union + mapping table |
| B4 | Interactive form write path for G-08 |
| B11 | Port write-path deferred; P3/P10/P12 exit gates updated |
| B12 | Jev removed; Playwright visual QA |

## Still open (not inventable here)

- AgentOS sidecar hangs under `npm run verify` on the Sprite (phase0 documented; needs CI green before merge).
- CommandKind closed union + per-kind validators (P1).
- Canonical JSON/hash profile with golden vector (P1).
- Role/scope matrix and approval identity proof (P1).
- Scoring rule v1 weights/thresholds (P5/P6).

## Next executable step

On Sprite `prospect-studio`, continue from `wt-prospect-phase0`: finish AgentOS verify gate, open/merge the phase0 PR when CI is green, then start P1 contracts against `gregarious-ibis-329` only.
