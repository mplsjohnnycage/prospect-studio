# P1 contract surface inventory (read-only)

**As of:** 2026-11-09 (America/Chicago)  
**Source audit:** phase0 @ `a432441` (`fix/phase0-prospect-reconcile-20261107`)  
**Graph:** P0 `in_progress` · P1 still **blocked** — this file invents nothing; it inventories gaps for after P0 `done`.

P1 goal (from `graph/`): close inventable contracts — CommandKind, hash profile, roles, approvals, lifecycle vocabulary — with duplicate/replay/stale-revision/unauthorized tests on Convex **dev** `gregarious-ibis-329`.

---

## Present vs missing

### CommandKind / outbox

| Present | Missing |
|---|---|
| Legacy `CommandKind` in `src/lib/domain.ts` + `convex/prospects.ts` `execute` | Shared contracts package |
| `commandId` dedupe / replay on `commands` table | Outbox lease/reconcile (§15.3) |
| Spec dotted kinds in `lifecycle/src/machine.ts` (`approval.decide`, …) | Single closed union wired into Convex |
| | Envelope: `contractVersion`, `expectedRevision`, `idempotencyKey`, `correlationId` |

**Risk:** UI verbs vs lifecycle dotted kinds = two vocabularies. Do not invent a third outside P1.

### Auth / roles

| Present | Missing |
|---|---|
| `owner(ctx)`, invite-only / owner-email / AgentID admission | `memberships` + role matrix |
| MCP `pipeline:read` / `pipeline:write` | `canRead` / `canCommand` / `canApprove` / `canControlDesktop` |
| Agent tools withhold approve/send | Per-kind unauthorized tests |

### Approvals / human gates

| Present | Missing |
|---|---|
| Lifecycle `humanGate` edges + `requiredEvidence` | `approvals` table (subject, subjectRevision, content SHA, approver, timestamp) |
| Soft UI/MCP gates (`needs_approval`, no send tools) | Immutable decision records bound to revision/SHA |

### Lifecycle spine

| Present | Missing |
|---|---|
| `lifecycle/` Zod 18-stage machine + CLI | Convex `stage` still **8** UI labels |
| Harness rule: `domain.ts` display-only | Mutations still treat `domain.ts` as authoritative |

### Revision / idempotency

| Present | Missing |
|---|---|
| `commandId` replay; build leases; concept sha256; promote `identityKey` | Document `revision` + OCC `expectedRevision` |
| | Canonical JSON / hash profile + golden vector |

### Exit-gate tests

Fragments only (`domain.test.ts`, auth enrollment, build-lease, lifecycle engine, v3 promote/opt-out). **No** `test:contracts` / grep suite for `duplicate|replay|stale|unauthorized` against command/outbox/revision/auth matrix.

---

## Suggested order after P0 `done`

1. Lock CommandKind from `lifecycle/` into a typed contracts module; UI verbs = aliases/projection only.  
2. Command envelope + `outbox` (+ lease/ack); keep `commandId` replay.  
3. `revision` / `expectedRevision` helpers + stale→409 tests.  
4. Auth matrix + unauthorized tests (owner vs agent vs anonymous).  
5. `approvals` schema + human-gate evidence for lifecycle gates.  
6. Adopt Convex `lifecycleStage` §15.2; map 8 UI stages → display groups only.  
7. Hash/canonical-JSON golden vector + negative contract suite on **dev**.

## Harness reminders

- Forbidden: invent CommandKind / hash / role matrix **outside** P1.  
- Forbidden: prod Convex writes; Port as Loop-1 authority; second FSM.  
- Scoring weights = P5/P6; do not smuggle under “contracts.”


## Implementation status (auto-loop)

Landed on phase0:
- `src/lib/contracts/*` — closed CommandKind, envelope/outbox types, revision OCC, auth matrix, approvals, §15.2 stages + UI projection
- `convex/schema.ts` — `outbox` + `approvals` tables
- `npm run test:contracts` — duplicate/replay/stale/unauthorized suites green
- `domain.ts` marked display-only projection

Still follow-on: migrate `prospects.stage` mutations from 8 UI labels to persisted `lifecycleStage` using contracts; wire `prospects.execute` to envelope/outbox.
