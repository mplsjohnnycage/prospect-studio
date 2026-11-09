# P0 gap matrix — PS-MASTER-3.1 vs phase0

**As of:** 2026-11-09 (America/Chicago)  
**Audit tip:** phase0 (ahead of `a432441`; refresh SHA on next sync)  
**Authority:** PS-MASTER-3.1 · `AGENTS.md` · `docs/BASELINE.md`  
**Status:** read-only inventory for P0 exit — does not invent CommandKind / roles / hash rules (those are P1).

---

## Verdict

Phase0 correctly locked the **build lane** (base SHA, Workflow/R2 mounts, no `/compile`, Better Auth, outreach send withheld from MCP). Against Loop-1 it is still a **pre-spine** app: 8-stage display FSM + soft approvals + unused storage/workflow mounts.

---

## Matrix (summary)

| Area | Present? | Severity |
|---|---|---|
| §15.2 `lifecycleStage` in Convex | Harness `lifecycle/` only; DB still 8 UI stages | Critical |
| Commands / outbox / `expectedRevision` | Thin `commands` audit log | Critical |
| Hash-bound `approvals` | Soft status flags; Conversion auto-approve | Critical |
| Interactive `POST /forms/{slug}` → `formSubmissions` | Missing; public demo CSP blocks forms | Critical |
| No unauthenticated `/compile` on phase0 | **PASS** (still on quarantined rivet-spike) | — |
| Better Auth / owner gate | Mostly PASS; no tenants/memberships yet | P1 |
| R2 mount | Mounted, **unused** | High |
| Convex Workflow | Mounted, **unused** | High |
| Sprite worker registry | SDK glue only | High |
| DuckDB embedded extract | Policy yes; code no | High |
| Playwright product QA + receipts | Ad-hoc script only | High |
| Rivet | Present; actor-local stage = authority blur | Med-high |
| Outreach send gated | PASS-ish (MCP withhold; auth send path) | Loop-1 later |
| §16 tables (places, artifacts, qaRuns, …) | Legacy CRM core only | High |

Full narrative from parallel audit; keep this file as the agent-facing summary.

---

## Top 10 Loop-1 blockers

1. Persist authoritative §15.2 `lifecycleStage` (demote `domain.ts` to projection).  
2. Durable command envelope + outbox + `expectedRevision`.  
3. Immutable hash-bound `approvals`; kill auto-bypass on gen/concept gates.  
4. Interactive demo forms → `formSubmissions`.  
5. P0 CI / AgentOS verify hang — need CI-green alternate proof.  
6. Prove R2 upload/read/provenance (P2).  
7. Drive stages via Workflow human-wait, not scattered `db.patch`.  
8. Embedded DuckDB / Overture extract on Sprite (G-01).  
9. Playwright suite + QA receipts for ArtifactReview→Handoff.  
10. Sprite worker registry; Rivet must not own business stage.

**Minimum before honest P1/P2 execution without a second lane:** blockers 1–5 (1–3 are P1 contracts; 4–5 are P0/P1 adjacent).

---

## Related

- [`P1_CONTRACT_SURFACE.md`](P1_CONTRACT_SURFACE.md) — contract inventory for after P0 `done`  
- [`SORT_OUT.md`](SORT_OUT.md) · [`LIFECYCLE.md`](LIFECYCLE.md) · [`GIT_AND_DEPLOY.md`](GIT_AND_DEPLOY.md)
