# Goldfish Annotated Review Report

**Target:** `/home/sprite/elifant-goldfish/PROSPECT_STUDIO_MASTER_SPEC_v3_2026-11-09.md` (full file, 1483 lines)
**Scope of this pass:** Wave 1 — B1, B13, B2, B3, B4, B11, B12 (re-run after external B1 landing)
**Documentation basis:** Context7 (Convex, Puck, json-render, Playwright, convex-helpers)
**Status:** open — awaiting human decision

---

## Context7 verification

Every technical claim below was checked against current library documentation rather than memory.

| Library (version seen) | Verified fact | Effect on this review |
|---|---|---|
| Convex (`/websites/convex_dev`) | Components are isolated: a component "can't read data that is not explicitly provided to it," its data "cannot be directly mutated by the main app," and each has its own schema and `_generated` API. | **Confirms B2.** A component cannot own `spriteWorkers` if those tables are in the host `convex/schema.ts`. The host-owned read model is the only coherent reading. |
| Convex | `defineTable({...}).index("by_x", ["x"])`; compound index fields must be queried in the order declared; indexes are built over scalar fields, not arrays. | **Sharpens B3/M3/M4.** The canonical stage must be a `v.union(v.literal(...))` in `convex/schema.ts`, and `capabilities[]` cannot be indexed as written. |
| Convex | `httpAction` has **no direct `ctx.db` access**; it must call `ctx.runMutation`/`ctx.runQuery`. Registered in `convex/http.ts` via `httpRouter`. | **Sharpens B4.** The proposed form backend must be an HTTP action that delegates the write to a mutation, not an action writing the table directly. |
| Convex | `crons.interval("name", { minutes: 1 }, internal.fn)` schedules a mutation/action; `crons.daily`/`weekly` also exist. | **Confirms M8.** One scheduled Convex reconciler is a one-line cron. |
| convex-helpers / `@convex-dev/migrations` | `makeMigration(internalMutation, { migrationTable })` paginates and persists state; `@convex-dev/migrations` is the component alternative that adds no tables. | **Fills B5's migration gap**; carried into Wave 3. |
| Puck (v0.24.0) | `Data = { content, root, zones }`; Puck follows semver and ships `migrate(data, config?, options?)` for legacy payloads. | **Sharpens M17.** The IR↔Puck boundary needs a versioned adapter plus `migrate()`. |
| json-render (v0.21.1) | `defineCatalog(schema, { components, actions })` with **zod** props; patches are RFC 6902 SpecStream. | **Corrects M17.** json-render is a renderer + patch applier, not an editor. |
| Playwright (v1.5x–1.6x) | `toHaveScreenshot({ maxDiffPixels, maxDiffPixelRatio, threshold })`; defaults settable in `playwright.config.ts`. | **Replaces B12's undefined "Jev"** with a deterministic, numeric QA gate. |

**Not verified:** `@fly/sprites` (`^0.2.4`) — no Context7 entry resolved.

---

## Prioritized Findings & AI Suggestions

### B1. No problem statement, goals, non-goals, or success metrics [`design_critic`, `structural`] — Severity: Blocker
* **Affected Scope:** §0 lines 10–28
* **Discrepancy Description:** §0 defined the product and its business flow, then jumped to 12 hard rules. It never stated the problem, the cost of the status quo, a hypothesis, a measurable success criterion, or non-goals. §20.2 listed measures with no targets; F-001/DoD defined completion as "one business traverses the pipeline."
* **Rationale:** A spec that cannot state what it is trying to prove cannot be scoped: nothing can be cut on principle, only by taste.
* ***AI Suggestion:*** **PROPOSE FIX**
* ***Justification:*** Real comprehension gap. **Resolved externally 17:20 UTC** as §0.1 (1483 lines, +53). Landed version adds Problem (P), affected users, Loop-1 hypothesis (P), 5 goals, non-goals, gates G-01…G-14, OPEN commercial points, measurement protocol, plus §20.2 cross-reference. No further B1 edit is required.
* ***Proposed Edit:***
  * Location: §0.1 (lines ~17–69) + §20.2 cross-reference
  * Change: **No-op — already applied.** Note: landed version pre-commits B4 to interactive (Goal 2 + G-08). See B4 below.

---

### B13. The document is not self-authoritative [`design_critic`, `style`] — Severity: Blocker
* **Affected Scope:** lines 8, 63, 1411, 1426 (now 8, ~115, ~1464, 1479 after B1 insert)
* **Discrepancy Description:** Precedence is *conversation > document*, but the conversation is unnamed and undated. Line 1426 then disclaims the document's authority without naming the replacement.
* **Rationale:** A build contract must be the artifact a fresh implementer can rely on.
* ***AI Suggestion:*** **PROPOSE FIX**
* ***Justification:*** Requires asserting the document as the record — a precedence change the operator should confirm at the gate.
* ***Proposed Edit:***
  * line 8 → `> **Document priority:** This specification is the authoritative record for architecture, scope and acceptance. Where it conflicts with an earlier design, the decision recorded here wins. The decisions that produced it (dated 2026-11-09) are listed in Appendix A — Decision log; a decision not in that log is not binding.`
  * line 1479 (Work order rule) → "Code-review and release gates require the §21 exit gate plus a named human approver; this specification defines the gate, not the approval."
  * before `### FINAL definition of done` (line 1481) → insert Appendix A listing the eight 2026-11-09 decisions already at §1.3.

---

### B2. §2.3 is the ownership oracle and it contradicts itself [`zoom_out`, `design_critic`] — Severity: Blocker
* **Affected Scope:** §2.3 lines 191–196; §6.2 line ~360; §16.3 lines ~921–924
* **Discrepancy Description:** Line 191 makes Convex authoritative for approvals; line 196 makes Port authoritative for "external approvals." The same table gives the worker registry to Convex *components*, while §16.3 puts the worker tables in the host schema.
* **Rationale:** §2.3 is what every implementer consults before writing a mutation.
* ***AI Suggestion:*** **PROPOSE FIX**
* ***Justification:*** Context7 confirms Convex components are schema-isolated and their data cannot be mutated by the host. So a component cannot own host tables — the document's intent (host owns the business job) is the only implementable reading.
* ***Proposed Edit:***
  * line 191 → `| Convex host app | Canonical business identity, prospect stages, the sole approvals decision record, operator/commands, design revisions, publish/send decisions, worker registry (host tables; CX13 exposes operations over them) | Provider health, Port IDs, live worker status |`
  * line 192 (Convex components row) → `| Convex components | Their private implementation queues and provider state, in their own schema | Application-level run and prospect state; the worker registry is not component-owned |`
  * line 196 → `| Port | Governed catalog entities/policies; may originate approval **requests** | Canonical stage transitions; the approvals decision record |`
  * §6.2 sentence → "The `approvals` record in Convex is the sole decision record; it must reference the verified human decision and any Port authorization token. Port may originate a request; it cannot record the decision."
  * §16.3 caption → relabel the four worker tables as "host-owned; CX13 operations read/write them through its public API."

---

### B3. No canonical stage vocabulary [`comprehension`, `design_critic`, `implementation_readiness`] — Severity: Blocker
* **Affected Scope:** lines 14, 19, 37–38, 504, 795–819, 858 (now 14, 19, ~90, ~557, 795+, ~911)
* **Discrepancy Description:** Four non-isomorphic vocabularies; no statement of which is persisted, no back-fill for the eight existing values, no fate for `advance`/`canTransition`.
* **Rationale:** Highest-risk change to live data; every subsystem depends on it.
* ***AI Suggestion:*** **PROPOSE FIX**
* ***Justification:*** §15.2 is the only machine that names stored fields and guards, so it wins by evidence. Context7 confirms the persisted enum should be a Convex `v.union(v.literal(...))`, and that compound indexes must list fields in query order.
* ***Proposed Edit:*** Location: §15.2, after the orthogonal-status paragraph. Insert:

```markdown
**Canonical vocabulary (D).** Only the §15.2 states are persisted, as a closed Convex union:

```ts
const lifecycleStage = v.union(
  v.literal("Indexed"), v.literal("Scored"), v.literal("Enriched"),
  v.literal("Qualified"), v.literal("GenPendingApproval"), v.literal("Generating"),
  v.literal("ConceptReview"), v.literal("DesignIR"), v.literal("Building"),
  v.literal("QA"), v.literal("ArtifactReview"), v.literal("Handoff"),
  v.literal("OutreachDraft"), v.literal("SendPending"), v.literal("Sent"),
  v.literal("Converted"), v.literal("ProductionGate"), v.literal("Produced"),
);
```

The eight UI labels in `src/lib/domain.ts` are display groupings, and the 13-step loop in §0 is the acceptance vocabulary — neither is a second state machine. `canTransition`/`advance` are replaced by one guard table derived from this mapping; `domain.ts` becomes a read-only projection until migration completes. Indexes follow query order: `.index("by_tenant_stage", ["tenantId", "lifecycleStage"])`.

| §0 loop step | §15.2 state | UI grouping | Command kinds |
|---|---|---|---|
| Source | Indexed | Discover | `discovery.start`, `place.upsert` |
| Normalize/Dedupe | Indexed | Discover | `place.normalize`, `place.merge` |
| Score-1 | Scored | Qualify | `score.compute1` |
| Select/Enrich | Enriched | Extract | `enrichment.start` |
| Score-2 | Qualified | Qualify | `score.compute2`, `qualify.decide` |
| Authorize Generation | GenPendingApproval → Generating | Design | `image.request`, `approval.decide` |
| Visual Concept | ConceptReview | Design | `concept.generate` |
| Concept Approval | DesignIR | Design | `concept.select` |
| Design IR | Building | Design | `design.proposePatch`, `design.commit` |
| Build/QA | QA | Demo | `build.run`, `qa.evaluate` |
| Exact-Artifact Approval | ArtifactReview → Handoff | Demo | `artifact.approve` |
| Handoff | Handoff | Demo | `handoff.publish` |
| later branches | OutreachDraft…Produced | Outreach/Convert/Produce | outreach/production commands |
```

  * line ~90 (`domain.ts` bullet) → append: "Retained only as a display projection; the canonical enum and migration are defined in §15.2."

---

### B4. The interactive demo has no data path [`zoom_out`] — Severity: Blocker
* **Affected Scope:** line 706 (§13.1), line 740 (§13.3), line ~1216 (§19.3), AT-042 (1349), AT-051 (1358), line ~1456 (§24), plus new §0.1 Goal 2 + G-08
* **Discrepancy Description:** Line 706 removes the only components that satisfied interactive forms and names nothing in their place; the requirement survives in four places; §16 has no form or consent table.
* **Rationale:** Either the forms are decorative (forbidden by hard rule 9) or a second backend appears with no contract (forbidden by hard rule 2).
* ***AI Suggestion:*** **PROPOSE FIX**
* ***Justification:*** **Changed from ESCALATE** because the landed §0.1 already decides it: Goal 2 requires "one real … working interactive demo … with independently tested lead-form persistence" and G-08 requires "100% of released interactive demo forms create a validated, tenant/site-scoped test submission that survives restart/reload." A fresh reader now has a citable in-document decision. The remaining gap is implementation: §13.1 does not specify the write path that G-08 requires. The interactive branch is therefore the only coherent fix unless §0.1 is itself re-edited.
* ***Proposed Edit (interactive — required to satisfy G-08):*** add `formSubmissions` (`siteProjectId`, `payload`, `consent`, `rateLimitKey`, `receivedAt`) to §16; add `convex/http.ts` route `POST /forms/{slug}` as an `httpAction` that calls `ctx.runMutation` (HTTP actions have no `ctx.db`); replace §13.1 sentence with "Dynamic forms/booking use a single Convex HTTP action → `formSubmissions` mutation, rate-limited by CX03, with consent and retention policy."; keep AT-042/AT-051.
* ***Proposed Edit (static-only — alternative):*** if the operator does not want interactive, §0.1 Goal 2 and G-08 must be re-edited to static, §13.1 appended with "**Loop-1 scope:** demos are static…", §13.3 → "static demos have no write path," and AT-042/AT-051 deleted. **This is now a two-sided change** — cannot be fixed at §13.1 alone.

---

### B11. Port is a second governance authority with no consumer, and creates a circular phase dependency [`zoom_out`] — Severity: Blocker
* **Affected Scope:** lines 18, 196, 352–354, 717–729→770+, P3 (1267), P10 (1274), P12 (1276), §24 (1451)
* **Discrepancy Description:** Port gets a component, six blueprints, signed webhooks, reconciliation and a whole phase, with no named consumer. P3's exit gate needs Port links and P10 needs a Port catalog entry, but Port is built in P12.
* **Rationale:** YAGNI plus a circular dependency; Convex already owns the catalog record.
* ***AI Suggestion:*** **PROPOSE FIX**
* ***Justification:*** Context7 confirms a Convex component is isolated and cannot serve as the host's governance record. Deferring Port removes the cycle without deleting the design; a second consumer can overrule at the gate. Note: landed §0.1 non-goals say desktop/Port/second emitter "remain required target capabilities" — deferring Port for Loop 1 is compatible with that wording (milestone, not deletion).
* ***Proposed Edit:***
  * line 196 append: "**Status: U — deferred.** Convex is the catalog and governance record until a second, named consumer is demonstrated."
  * P3 (1267): remove "basic Port links."
  * P10 (1274): "handoff package (Convex catalog record; Port projection optional)."
  * P12 (1276): "Conditional on a demonstrated second consumer; not required for Loop 1."
  * §24 Port row → "Port may originate approval requests; Convex records decisions. Port is U until a second consumer is demonstrated."

---

### B12. Jev/Jevex is undefined, uninstalled, and inside the definition of done [`design_critic`, `style`] — Severity: Blocker
* **Affected Scope:** line 635, line 700, lines 740–742, P9 (1273), F-001 (1364), FINAL DoD (1481+)
* **Discrepancy Description:** Two spellings used as a section title, a lifecycle stage and an acceptance input, while the only definitional sentence says it is "not verified as installed."
* **Rationale:** An unmade decision written as a requirement.
* ***AI Suggestion:*** **PROPOSE FIX**
* ***Justification:*** Context7 supplies the deterministic replacement: Playwright `toHaveScreenshot` with `maxDiffPixels`/`maxDiffPixelRatio`/`threshold`, configurable in `playwright.config.ts`. No vendor selection is required for Loop 1.
* ***Proposed Edit:***
  * line 635 → "deterministic visual QA plus an optional advisory evaluator"
  * line 700 → "## 13. Build, live preview, Storybook rendering and QA"
  * lines 740–742 → "Visual QA is deterministic first: Playwright `toHaveScreenshot` over pinned viewports with `maxDiffPixelRatio` and `threshold` set in `playwright.config.ts`, plus component/version checks. An optional advisory model judge may be added behind the `VisualEvaluator` adapter; no evaluator is required for Loop 1."
  * P9 (1273) → "deterministic visual QA suite (optional advisory evaluator adapter)"
  * F-001 (1364) → "Playwright and the deterministic QA suite produce signed/evidenced QA"
  * remove remaining "Jev/Jevex" from normative text.

---

## Summary

| Item | Severity | Suggestion | Status / Needs decision |
|---|---|---|---|
| B1 Problem/goals/non-goals | Blocker | PROPOSE FIX | **Already applied as §0.1** — no-op |
| B13 Document authority | Blocker | PROPOSE FIX | Needs decision — confirm precedence |
| B2 §2.3 ownership | Blocker | PROPOSE FIX | Ready to apply |
| B3 Stage vocabulary | Blocker | PROPOSE FIX | Ready to apply |
| B4 Interactive demo | Blocker | PROPOSE FIX | **Decision landed in §0.1 G-08** — interactive branch required unless §0.1 re-edited |
| B11 Port deferral | Blocker | PROPOSE FIX | Needs decision — confirm no second consumer |
| B12 Jev removal | Blocker | PROPOSE FIX | Ready to apply |

**Proposed fixes:** 6 (B13, B2, B3, B4-interactive, B11, B12) · **Already applied:** 1 (B1) · **Escalated:** 0 · **Contested:** 0 · **Declined:** 0
