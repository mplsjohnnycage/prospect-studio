# Consolidated Goldfish Review — PROSPECT_STUDIO_MASTER_SPEC_v3_2026-11-09.md

**Protocol:** EGM Goldfish Review, uninterrupted full flow (Stages 5–9)
**Target:** `/home/sprite/elifant-goldfish/PROSPECT_STUDIO_MASTER_SPEC_v3_2026-11-09.md` — 1,430 lines
**Semantic split:** none detected (`FeatureRange = 1..1430`, `DetailedRange = 1..1430`)
**GoldfishContext:** none (no relative links in the target)
**Reviewers:** 10 fresh-context subagents across 5 stages (zoom-out, inventive-catalyst, comprehension, design, structural, style ×2, implementation-readiness, codebase-details)
**Stage reports:** `zoom_out_report.md`, `comprehension_report.md`, `critic_report.md`, `intermediate_zoom_out_report.md`, `implementation_readiness_report.md`

---

## 1. Verdict

The document is a strong **architecture map and constraint register** and a weak **build contract**. Its epistemics are better than most specs of this size: the V/D/P/R/U legend is applied with real discipline, it refuses the two temptations that would have been fatal (a graph DB, §16.6; a wholesale storage migration, §8.2), and its negative-test catalogue (§22) is the one section that would actually stop a bad implementation.

Three things prevent it from being executable:

1. **It never states the problem, the hypothesis, the non-goals, or a success metric.** 1,430 lines define a 14-phase, 22-capability, 25-screen, ~77-component platform and never give a reader the one sentence that would let them delete 60% of it. Nothing in it can be cut on principle — only by taste.
2. **The ownership oracle (§2.3) contradicts itself** on approvals and on the worker registry. Most downstream "two authorities" findings are symptoms of this one table.
3. **Every contract that a developer needs is a sketch.** The command envelope is `kind: string; input: unknown`; the hash that every approval binds to has no canonicalization rule; the stage machine exists in four incompatible vocabularies; no phase has a file-level write boundary.

**P0 is executable today. P1 onward is not.**

---

## 2. What the stages did to each other

This matters because a naive merge would report findings that a later stage withdrew or re-graded. The table below records the adjudication.

| Stage 5–7 finding | Stage 8 verdict | Consolidated treatment |
|---|---|---|
| ZO B1 "two canonical business identities" | Overstated → Major | Kept as **M1** (one mis-keyed table + entity switch), not a blocker |
| ZO B2 "run/worker state has two owners" | Overstated → Major, partially mitigated | Merged into **B2** (§2.3 root cause) and **M9** |
| ZO B3 "two visual editors" | Overstated in scope → Major | Kept as **M18** (three surfaces, deletable third) |
| ZO B5 "first four phases are scaffolding" | Overstated | Reduced to a P3 ordering nit |
| ZO M2's evidence (§4.3 test) | Wrong as cited | Conclusion survives via **M31** (duplicate paths), evidence replaced |
| ZO M3 "thirty providers" | Overstated | Replaced by **M29** (two lanes with no owning phase) |
| ZO M5 "three concept tables" | Overstated | Kept as **M20** (one deprecation note), not a Major |
| Critic B1 Alternatives Rule | Overstated | Kept as **M26** (missing rejection reasons, not missing alternatives) |
| Critic B4 cross-tenant reuse | Overstated, partially mitigated | Kept as **M16** (teardown + one test, not redesign) |
| Critic M6 undefined contract types | Overstated | Kept as **M30** (only `sourceCommit?` detaches) |
| Critic M16 `tenantId|ownerId` | Overstated | Kept as **M8** (notation + one resolver) |
| Critic B5 capacity/cost | Confirmed | Kept as **M34** |
| Critic B6 Jev | Confirmed | Promoted to **B12** (it is in the DoD) |

**Net effect:** Stage 8 removed four claimed blockers and one wrong citation, and added one genuine new blocker (the interactive demo). Stage 9 added the execution-layer blockers that no altitude review could see.

---

## 3. 🔴 Blockers — fix before any phase work

### B1. No problem statement, goals, non-goals, or success metrics
**Sources:** S7 B2 (design, structural) · S5 verdict · S8 confirmed
**Where:** §0 :10–28; absent throughout; §20.2 has measures with no targets; F-001/DoD define done as "one business traverses the pipeline."
**Why it blocks:** The standard fails a spec that does not state the problem, the cost of the status quo, and a measurable target. "One business traverses" is a smoke test, not a product outcome. Nothing states whether the design point is 10 or 10,000 prospects/week. Without this, every scope decision below is unresolvable.
**Fix:** Add a one-page §0.1: problem, affected user, current cost, Loop-0 hypothesis, success metric with a number, and explicit non-goals (desktop, Port, second emitter, interactive demo, outreach).

### B2. §2.3 is the ownership oracle and it contradicts itself
**Sources:** S8 B2 · S5 B2 · S7 M2, M7, M15
**Where:** :141 vs :146 (approvals) · :142 vs §16.3 :868–871 (worker registry) · :222 · :307 · :728 · :743
**Why it blocks:** Every implementer consults §2.3 before writing a mutation. Two adjacent rows give opposite answers on who owns approvals; the same table puts the worker registry in a component while §16.3 puts its tables in the host schema. This is the root cause of the approval-model, run-model and Port findings.
**Fix:** Repair §2.3 first — one owner per row. `approvals` wholly in Convex with Port as originator only; worker registry wholly in CX13 with §16.3 rows relabelled as read-model projections. Then derive §6.2, §14.3, §16.3, §15.1 mechanically from it.

### B3. No canonical stage vocabulary
**Sources:** S6 #1 · S7 B3 · S8 confirmed · S9 IR B1/B2 · S9 codebase B1 · S9 style B1
**Where:** :14 (13-step loop) · :19 · :37–38 (`domain.ts`, 8 stages) · :504 (C09 requires 8) · :745–769 (18 states) · :858 · :27 (hard rule 2)
**Why it blocks:** Four non-isomorphic vocabularies. Nothing says which is stored in `prospects.stage`, whether the 8 existing values are back-filled, whether the 13-step loop is a display projection, or whether `advance`/`canTransition` survive. Three loop steps have no state at all. This is the highest-risk change to live data and every subsystem depends on it.
**Fix:** One authoritative enum; the 8 UI labels demoted to display groupings; a mapping table (UI stage ↔ workflow state ↔ allowed `kind` ↔ guards ↔ events); an explicit fate for `domain.ts` and the `concepts` A–D migration.

### B4. The interactive demo has no data path
**Sources:** S8 B1 (new at Stage 8)
**Where:** :656 (backend candidates "not mandatory current providers") · :687 · :1163 · :1403 · AT-042 :1296 · AT-051 :1305 · :1002
**Why it blocks:** The requirement survives in four places; the components that satisfied it were deleted and nothing replaced them. §16 has no `formSubmissions`, `leadSubmissions`, or consent record. Either the forms are decorative (forbidden by hard rule 9) or a second backend appears in P9 with no contract, tenancy, or retention rule (forbidden by hard rule 2).
**Fix:** Decide static-only (delete AT-042/AT-051 and say so) or interactive (a Convex HTTP action + one `formSubmissions` table with `siteProjectId`, consent, rate-limit, reusing CX03).

### B5. The plan is not executable: no file boundary, no migration plan, no single homes, no toolchain
**Sources:** S9 IR B1 · S9 codebase B4, B5, B6 · S9 IR M1 · S8 M10
**Where:** §21 :1211–1225 · §23 :1315–1384 · :423 · :823 · :1355 · :654
**Why it blocks:** §21's deliverables are layer nouns, not files; §23 is directory-level and contradicted by :423 and :1384; no file is marked Create/Modify/Delete even though `convex/convex.config.ts` and `convex/schema.ts` must change in nearly every phase. There is no migration path, backfill, rollback, or dual-read window. Three artifacts have two or three proposed homes (tokens, design IR, provider contracts). The package manager and Convex packaging approach are never named.
**Fix:** A per-phase file table with Create/Modify/Delete; a table-level schema delta (existing → action → backfill → compatibility test → rollback); one home per shared artifact; a toolchain ADR in P0/P1.

### B6. Core contracts are untyped or underspecified
**Sources:** S9 IR B3, B4 · S9 codebase M4 · S9 style B4 · S9 IR M3, M13 · S9 codebase M13
**Where:** `Command` :774–779 · `actor.type` :776 vs :312 · hashes :383/:481/:621/:646–651/:665 · gateway §5.4 :260–277 · provider adapters :203–211
**Why it blocks:** `kind: string; input: unknown` means no command registry, no per-kind validator, no deterministic test suite, and no way to type `canCommand(kind)`. `actor.type` cannot represent a human, an MCP client, or a Port webhook. The hash trust model has no canonical JSON profile, so AT-046 is unpassable. The gateway has routes but no bodies, claims, or error model.
**Fix:** Closed `CommandKind` union + per-kind validator; single `ActorRef`; RFC 8785 JCS + field-exclusion list + golden vectors; an OpenAPI/JSON-Schema gateway contract; typed provider adapters for the four P0-relevant ones.

### B7. Authorization and approval are names, not contracts
**Sources:** S9 IR B7, M14 · S9 codebase M5 · S7 M2 · S8 M7
**Where:** :307 · :312–313 · :823 · :830 · :842 · :905 · :733 · :973 · :1201
**Why it blocks:** `canRead/canCommand/canApprove/canControlDesktop` have no role enum, no scope matrix, no claim→tenant resolver, and no definition of "direct verified human identity." `memberships.role` has no allowed values. `approvals` lacks recipient set, sender account, suppression revision, expiry, and single-use marker that §14.4 requires. The zero-unapproved-send SLO has no detector. `identityReview` has no screen.
**Fix:** Role table + scope matrix + claim→tenant function + approval identity proof; an approval action enum; the missing `approvals` fields; a reconciliation query comparing deployments/sends to `approvals.contentSha`.

### B8. P0 is unfalsifiable and the branch reconciliation is unowned
**Sources:** S9 IR B9 · S9 codebase B7
**Where:** :34 · :44–48 · :1207 · :1211 · :55
**Why it blocks:** "Clean codegen/typecheck/tests" has no baseline, no definition of "clean," and no diff manifest. §1.2 declares a critical divergence and says "compare HEADs, reconcile PR #35 and dirty changes" without naming who decides, what the policy is, or which branch P1 builds on. P0 is "go find out what the repo is," and everything downstream depends on its outputs.
**Fix:** P0 outputs a signed artifact: exact baseline test counts, `git diff --stat` + patch, a named base-branch decision, and a merge policy with a named owner.

### B9. P0-critical technical decisions are deferred to the implementer
**Sources:** S9 IR B5, B6 · S9 style M13 · S9 codebase M8, M10
**Where:** :200–204 · :207 · :568–572 · :692 · :1400 · :1402 · :656 · :666 · :707–712 · :1002
**Why it blocks:** Workflow, R2, ImageGen, and the visual evaluator have no package, version, license, or fallback — "verify/install" is not a deliverable. Build/deploy has no decision on emitters, repo model, slug/domain, preview auth, or lockfile. `BuildIntent.emitter` is a required union that forces a decision the prose refuses to make.
**Fix:** Name + pin each dependency with an owner and deadline; decide Loop-1 emitter (recommend `static-demo` only), generated-site layout, Vercel project model, and slug/domain contract.

### B10. Scoring and qualification rules are unspecified
**Sources:** S9 IR B8 · S9 style B3 · S6 #6
**Where:** §7.5 :355–359 · :757 · :1216–1217 · AT-025/026 :1268–1270 · :1194 ("A-tier") · :1311
**Why it blocks:** No weights, no 0–100 derivation, no normalization, no rule-version format, no promotion threshold. "A-tier" gates a phase exit and a cost policy and is defined nowhere. AT-026 cannot pass.
**Fix:** A versioned rule spec (v1) table, explicit thresholds, a fixture set with expected scores, and A-tier as a predicate over named dimensions.

### B11. Port is a second governance authority with no consumer — and creates a circular phase dependency
**Sources:** S5 B4 · S8 confirmed · S9 IR B10 · S9 codebase M6
**Where:** :18 · :146 · :298–308 · :717–729 · :1214 · :1221 · :1223
**Why it blocks:** Port gets a component, six blueprints, signed bidirectional webhooks, a reconciliation requirement and a whole phase — with no named consumer and no evidence of use. Its guarantees already exist in Convex. Separately, P3's exit gate needs Port links and P10 needs a Port catalog entry, but the Port component is built in P12 — three phases cannot exit.
**Fix:** Mark Port `U`/deferred behind a demonstrated second consumer; split any retained read-only lookup into P2b and keep governed write in P12.

### B12. Jev/Jevex is an undefined, uninstalled component inside the definition of done
**Sources:** S7 B6 · S9 style B6 · S6 #4 · S8 confirmed
**Where:** :585 · :650 · :690–692 · :1220 · :1311 · :1430
**Why it blocks:** Two spellings, used as a section title, a lifecycle stage, and an acceptance input, while the only definitional sentence says it is "not verified as installed." F-001 and the DoD require a component no one has selected.
**Fix:** Name the concrete evaluator (product + version) or rewrite F-001/DoD as "deterministic Playwright assertions plus an optional advisory judge," and remove "Jev" from normative text.

### B13. The document is not self-authoritative
**Sources:** S7 M17 · S9 style B2 · S8 confirmed
**Where:** :8 · :63 · :1411 · :1426
**Why it blocks:** The stated precedence order is *conversation > document*, but the conversation is unnamed, undated, and unrecorded, so every conflict it flags is unresolvable by a fresh reader. :1426 then disclaims the document's authority without naming the replacement.
**Fix:** Cite a durable decision record (file + date + section) or declare this document the sole authority and inline the decisions.

---

## 4. 🟡 Majors

### Data model & identity
- **M1. Score-1 cannot be persisted; the state machine changes entity mid-diagram.** `scores` is keyed `prospectId` (:850) while Score-1 runs before promotion (:345); `[*] --> Indexed` (:749) has no `prospects` row. Key scores on the canonical place ID; draw `Indexed` on `places` or create the prospect row at ingest. [S5 B1 re-graded; S6 #9; S8 M1]
- **M2. Contract enums and identity fields disagree.** Verification enums, rights enums, four "who" representations, `version` vs `revision`. One `ActorRef`, one `RightsClass`, one `Verification`, one revision type. [S9 codebase M2]
- **M3. Index design deferred for ~70 tables; one index not expressible** (`capabilities[]`). [S9 codebase M11]
- **M4. Persisted enums referenced but never enumerated** (`resourceClass`, `ttlPolicy`, `networkPolicy`, `ArtifactRef.kind`). [S9 codebase M12]
- **M5. Immutable artifacts vs deletion/retention unresolved.** No tombstone, crypto-shred, retention period, or delete-propagation test. [S7 M16]
- **M6. Tenant isolation across Convex components unspecified.** `tenantId|ownerId` reads as a union type; tables inconsistently use `tenantId`/`businessId`/`prospectId`. [S7 M15; S8 overstated]

### Execution & durability
- **M7. Two run hierarchies and four representations of one unit of work.** `pipelineRuns`/`stageRuns` plus six bespoke run tables; `commands`/`outbox`/`workerJobs`/`stageRuns` each with a status field. [S8 M3]
- **M8. Four durability primitives with no decision rule; two reconcilers with two owners.** Workflow, Workpool, outbox, candidate `action-retrier`; :789 (Convex) vs :819 (CI). [S7 M3; S8 M6, M9]
- **M9. Worker event ordering key is wrong.** `seq` is per-worker; validity is per-lease. Use `(leaseId, seq)`; add `leaseId` to the envelope and the acceptance predicate. [S7 M1; S8 M5]
- **M10. Outbox/retry/reconciliation constants absent.** No lease duration, attempt cap, backoff curve, dead-letter threshold, or interval. [S9 IR M10]
- **M11. Sprite bootstrap not actionable.** Profile scope, service manager, ports, permissions, `profileHash`, SDK method mapping, checkpoint compatibility. [S9 IR M4]
- **M12. Worker supply chain unpinned.** DuckDB extensions, collectors, agent CLIs, 30+ OSS tools; no SBOM/checksum/provenance; `profileHash` covers the manifest only. [S7 M14]
- **M13. Cross-tenant reuse has no teardown contract.** Workspaces are namespaced by tenant hash (:232) but never destroyed; browser profile, cookies, downloads, secrets persist. Add a release-time cleanup contract and one acceptance test. [S7 B4 re-graded]
- **M14. P4 profile scope vs P11 desktop dependency mismatch.** No phase delivers `agent-desktop-v1`, Rivet service, or websockify. [S9 IR M17]
- **M15. Control-lease enforcement unprovable while the agent runs on the same host.** The agent can reach loopback VNC/CDP and bypass the gateway lease. [S7 M9]
- **M16. Budget reservation described, not modelled.** No reservation record, expiry, release-on-failure, or same-transaction check. [S7 M8; S9 IR M11]

### Design & UI
- **M17. Three editor write surfaces for one IR.** `design.proposePatch` already serves the agent; `editor.submitJsonRenderProposal` is a third surface required by P8. Delete the json-render adapter; keep the IR. [S5 B3 re-graded; S8 M2]
- **M18. Design IR is a sketch, not a schema.** No `schemaVersion` values, `propsSchemaRef` language, action/dataSource registries, loss-report format, or fixture corpus; `PageNode.type` hard-coded. [S9 IR M7; S6 #13]
- **M19. Concept/model lineage spans five tables with no canonical pointer.** `ImageConcept`/`visualConcepts`/`VisualConcept`/`concepts`; state the chain and deprecate the loser. [S7 M5; S8 overstated; S9 style M32]
- **M20. Storybook baseline and component inventory unphased.** ~40 components, no built-vs-mapped statement, no diff tool/threshold, no baseline reviewer. [S9 IR M8]
- **M21. Visual evaluator has no schema, severity enum, or pass threshold.** [S9 IR M9]
- **M22. UI work unscoped and unmapped to existing source.** ~70 components, no Loop-1 minimal set, no file mapping; :488 vs §23 `[P]` contradiction. [S9 IR M18; S6 #14]
- **M23. The "locked" UX is subjective only.** No tokens, screenshots, or measurable test behind hard rule 11. [S9 style M9]
- **M24. Concept count is both fixed at four and configuration-dependent.** [S9 style M15; S5 nit]

### Product & scope
- **M25. Alternatives Rule fails on rejection reasons.** §24 records alternatives but not why each was rejected (cold start, cost, isolation, fidelity, CI trade-off). One clause per row. [S7 B1 re-graded]
- **M26. The desktop is in the DoD without a funnel requirement.** F-001 (:1311/:1430) requires inspecting the shared Sprite desktop; nothing in the funnel needs it. Move it post-handoff. [S5 M7; S8 confirmed]
- **M27. Provider sprawl with two lanes that have no owning phase.** §7.2's candidate register is fine; the "Contact verification" and "Gap/freshness" lanes are owned by nobody, and `contactability` is persisted with no producer. [S5 M3 re-graded; S8 M4, M8]
- **M28. Two site emitters committed before the decision that chooses one.** `BuildIntent.emitter` union; §24 defers the repo strategy. [S5 M8; S8 M11]
- **M29. The 70-line repo tree is stale and wrong on arrival** — contradicts §3/§9.2 in three places. [S5 M10; S8 M10]
- **M30. Supermemory is authoritative in §2.3 and appears nowhere else.** No component, table, phase, contract, or path. [S5 M11; S9 codebase M9]
- **M31. The abstraction budget is inverted.** Interfaces for one Vercel project and one unevaluated evaluator; no selection among thirty discovery providers. [S8 M8]
- **M32. Capacity and cost model is absent.** Every budget field is optional; no volume, pool size, concurrency, storage/egress, image cost, token budget, or quota. [S7 B5; S9 IR M11]
- **M33. Acceptance gates underpowered relative to their claims.** 20 hand-reviewed sites cannot establish a false-negative rate; one business is not a negative-path test; P14 has no numeric threshold. [S7 M12]
- **M34. No security-review gate and no outreach-compliance requirements.** P13 sends real email and P10 publishes real artifacts with no threat-model sign-off or compliance checklist. [S7 M13]
- **M35. No availability SLO, RPO/RTO, or backup cadence.** "Always reachable" (:290) contradicts §20.4. [S7 M11; S9 style M12]
- **M36. Brand DNA has no typed shape or review-event schema.** [S9 IR M12]
- **M37. MCP surface lacks scope mapping, receipt schema, and pagination.** [S9 IR M15; S6 #7]
- **M38. Discovery prerequisites missing.** No taxonomy source, Overture release pin, geometry source, normalizer, distance threshold, or confidence formula. [S9 IR M5]
- **M39. "Factory" is used as a system of record and a gate without ever being identified.** [S6 #2; S9 style M5]
- **M40. No owners, estimates, or rollback per phase.** [S9 IR M16]

### Document & process
- **M41. `V` claims are unbacked or too coarse, and the proof register cites no revision.** Six `V` items have no provenance; `AGENT_TOOLS` has no export names and two attributed owners; "during this response" has no SHA. [S9 codebase M2; S9 style M7, M8]
- **M42. The BFF host decision is handed to the implementer.** :1004 defers whether Convex or Next.js owns 16 routes. [S9 codebase M10]
- **M43. No normative keyword convention; disjunctive requirements allow opposite implementations.** [S9 style M1, M2]
- **M44. The provider registry is normative but every candidate is an unlinked proper noun, and "Selection proof" lists criteria instead of proof.** [S9 style M4]
- **M45. A security control carries an undefined exception with no approver** (:1159 "when not essential"). [S9 style M11]
- **M46. Title and §0 overclaim** ("COMPLETE…", "inviolable") while the body ends "partially deployed"; "statelessly stateful" is a coined oxymoron used as a deliverable. [S7 M25, M26]

---

## 5. 🟢 Nits (condensed)

**Structure/document:** no table of contents or internal links in 1,430 lines; "FINAL definition of done" buried as an H3 under the bibliography; no document-control block (owner/approver/status/change log); no glossary; `R` defined but unused; bare URLs with no pinned versions; unlinked attributions; bold run-in pseudo-headings; pseudo-lists via trailing double-space breaks; heading casing drift; long undivided normative paragraphs harm line-anchored review. [S7 structural; S9]

**Naming/paths:** `packages/design-tokens` vs `packages/tokens`; three gateway route prefixes (`/jobs`, `/v1/jobs`, `/jobs/{id}`); `@fly/sprites` vs `superfly/sprites-js`; `src/app/(optional) storybook/`; "optional monorepo"; `costLedger` vs `stageCosts` both marked existing; `roof-point` vs `rooftop`; "statelessly stateful"; "no permanent private public links". [S6 nits; S9 codebase N1–N5; S9 style nits]

**Schema/contracts:** `embeddings` "or fields on `places`" unresolved; `websiteAudits.websiteId` dangles; `polygon/bbox?` is not valid TypeScript; `WorkerTask` has both `payloadRef?` and `input?`; `BuildReceipt.status: 'blocked'` has no error-code mapping; `workflow.run/status [policy-controlled/read]` names no policy. [S8 nits; S9 style M16]

**Acceptance/tests:** AT-001/AT-002 test repo state, not implementation; AT-002/AT-009 not automatable in CI; no test file locations for AT-001…AT-053; no runner named beyond Playwright; "recover failing tests" presupposes failures; "15 unverified integrations" names no set. [S9 codebase N6, N8; S9 IR N1, N2; S9 style nits]

**Copy:** "honest" used as an acceptance criterion four times; "roomy canvas" is the only S20 description; "target visitor conversion goal" appears once; "materially" undefined; 404/503 both called "unavailable"; "when not essential" exception. [S9 style nits]

---

## 6. Traceability matrix

Raw finding IDs per stage: **S5** = zoom_out_report.md, **S6** = comprehension_report.md, **S7** = critic_report.md, **S8** = intermediate_zoom_out_report.md, **S9** = implementation_readiness_report.md.

| Consolidated item | Priority | Raw sources |
|---|---|---|
| B1 No problem/goals/non-goals/metrics | 🔴 | S7 B2; S5 verdict; S8 confirmed |
| B2 §2.3 ownership oracle self-contradiction | 🔴 | S8 B2; S5 B2; S7 M2, M7, M15 |
| B3 No canonical stage vocabulary | 🔴 | S6 #1; S7 B3; S8; S9 IR B1, B2; S9 CB B1; S9 ST B1 |
| B4 Interactive demo has no data path | 🔴 | S8 B1 |
| B5 Plan not executable (files/migration/homes/toolchain) | 🔴 | S9 IR B1, M1; S9 CB B4, B5, B6; S8 M10 |
| B6 Core contracts untyped | 🔴 | S9 IR B3, B4, M3, M13; S9 CB M4, M13; S9 ST B4 |
| B7 Authorization/approval not contracts | 🔴 | S9 IR B7, M14; S9 CB M5; S7 M2; S8 M7 |
| B8 P0 unfalsifiable; branch unowned | 🔴 | S9 IR B9; S9 CB B7 |
| B9 P0-critical decisions deferred | 🔴 | S9 IR B5, B6; S9 ST M13; S9 CB M8, M10 |
| B10 Scoring/qualification unspecified | 🔴 | S9 IR B8; S9 ST B3; S6 #6 |
| B11 Port: second authority + circular phases | 🔴 | S5 B4; S8; S9 IR B10; S9 CB M6 |
| B12 Jev undefined in DoD | 🔴 | S7 B6; S9 ST B6; S6 #4; S8 |
| B13 Document not self-authoritative | 🔴 | S7 M17; S9 ST B2; S8 |
| M1 Score-1 keying / entity switch | 🟡 | S5 B1 (re-graded); S6 #9; S8 M1 |
| M2 Contract enum/identity drift | 🟡 | S9 CB M2 |
| M3 Index design deferred | 🟡 | S9 CB M11 |
| M4 Persisted enums undefined | 🟡 | S9 CB M12 |
| M5 Immutable artifacts vs deletion | 🟡 | S7 M16 |
| M6 Tenant isolation across components | 🟡 | S7 M15; S8 overstated |
| M7 Run hierarchy / four work representations | 🟡 | S8 M3 |
| M8 Durability primitives / two reconcilers | 🟡 | S7 M3; S8 M6, M9 |
| M9 Worker event lease fencing | 🟡 | S7 M1; S8 M5 |
| M10 Outbox/retry constants | 🟡 | S9 IR M10 |
| M11 Sprite bootstrap not actionable | 🟡 | S9 IR M4 |
| M12 Worker supply chain | 🟡 | S7 M14 |
| M13 Cross-tenant reuse teardown | 🟡 | S7 B4 (re-graded) |
| M14 P4/P11 desktop mismatch | 🟡 | S9 IR M17 |
| M15 Control-lease bypass | 🟡 | S7 M9 |
| M16 Budget reservation not modelled | 🟡 | S7 M8; S9 IR M11 |
| M17 Three editor surfaces | 🟡 | S5 B3 (re-graded); S8 M2 |
| M18 Design IR sketch | 🟡 | S9 IR M7; S6 #13 |
| M19 Concept/model lineage | 🟡 | S7 M5; S8 overstated; S9 ST M32 |
| M20 Storybook/component inventory | 🟡 | S9 IR M8 |
| M21 Visual evaluator schema | 🟡 | S9 IR M9 |
| M22 UI unscoped/unmapped | 🟡 | S9 IR M18; S6 #14 |
| M23 Locked UX subjective | 🟡 | S9 ST M9 |
| M24 Concept count ambiguity | 🟡 | S9 ST M15; S5 nit |
| M25 Alternatives Rule rejection reasons | 🟡 | S7 B1 (re-graded) |
| M26 Desktop in DoD | 🟡 | S5 M7; S8 |
| M27 Provider sprawl / unowned lanes | 🟡 | S5 M3 (re-graded); S8 M4, M8 |
| M28 Two emitters / BuildIntent | 🟡 | S5 M8; S8 M11 |
| M29 Repo tree stale/contradictory | 🟡 | S5 M10; S8 M10 |
| M30 Supermemory | 🟡 | S5 M11; S9 CB M9 |
| M31 Abstraction budget inverted | 🟡 | S8 M8 |
| M32 Capacity/cost model absent | 🟡 | S7 B5; S9 IR M11 |
| M33 Acceptance gates underpowered | 🟡 | S7 M12 |
| M34 No security/outreach compliance gate | 🟡 | S7 M13 |
| M35 No SLO/RPO/RTO | 🟡 | S7 M11; S9 ST M12 |
| M36 Brand DNA untyped | 🟡 | S9 IR M12 |
| M37 MCP surface underspecified | 🟡 | S9 IR M15; S6 #7 |
| M38 Discovery prerequisites | 🟡 | S9 IR M5 |
| M39 Factory undefined | 🟡 | S6 #2; S9 ST M5 |
| M40 No owners/estimates/rollback | 🟡 | S9 IR M16 |
| M41 V-claim provenance | 🟡 | S9 CB M2; S9 ST M7, M8 |
| M42 BFF host decision | 🟡 | S9 CB M10 |
| M43 No normative keyword convention | 🟡 | S9 ST M1, M2 |
| M44 Provider registry unlinked | 🟡 | S9 ST M4 |
| M45 Redaction exception | 🟡 | S9 ST M11 |
| M46 Title/§0 overclaim | 🟡 | S7 M25, M26 |

---

## 7. Recommended remediation sequence

**Wave 1 — make the document authoritative and scoped (no code).**
1. B1 problem/goals/non-goals/success metric.
2. B13 inline the superseding decisions; declare the document authoritative.
3. B2 repair §2.3, then derive §6.2/§14.3/§16.3/§15.1 from it.
4. B3 canonical stage enum + mapping table.
5. B4 decide static-only vs interactive demo.
6. B11 defer Port and fix the P3/P10/P12 gates.
7. B12 name or remove Jev.

**Wave 2 — make P0 executable.**
8. B8 baseline artifact + branch policy.
9. B5 file-level scope boundary for P0/P1 only (not the whole tree).
10. B9 pin Workflow/R2/ImageGen/evaluator; decide emitter and repo model.

**Wave 3 — make P1–P2 executable.**
11. B6 `CommandKind` + `ActorRef` + hash profile + gateway contract.
12. B7 role table + scope matrix + approval fields.
13. B10 scoring rule v1 + A-tier predicate.
14. B5 schema delta + migration + one home per artifact + toolchain ADR.

**Wave 4 — make the design and execution layers buildable.**
15. M1–M9 (data/execution contracts).
16. M17–M24 (IR, editor, UI, Storybook).
17. M25–M40 (scope cuts and phase gates).

**Wave 5 — polish.** M41–M46 and the nits.

---

## 8. What to preserve through revision

These are load-bearing and should not be lost in the rewrite:

- The **status legend** and the discipline behind it — "installed in package.json is not operational in production" (:6).
- The refusal to componentize Puck/Storybook/json-render (:216), to force a wholesale storage migration (§8.2), and to add a graph DB (§16.6).
- The **negative-test catalogue** (§22) — precise, at the right altitude, and the only part of the document that would stop a bad implementation.
- The **unknown-vs-none semantics** (:352, :357, :501, :801, :1268–1269).
- The **failure-mode table** (§15.4), trust boundaries (§19.1), and "no invisible fallback billing" (§20.3).
- The **idempotency honesty** (:791) — no distributed transaction across providers, stated plainly.
- The **IR-as-single-authority boundary** (§12.1) and the **host-owned interface altitude** (§14.2).
- The **migration rule** (§16) and "don't recreate blindly" (§1.1 :39).
- The **architecture spine**: `places → prospects → brandDna → designPlan → designIR@revision → build@sha → approval → deployment`, with Convex as the single control plane, Sprites as replaceable compute, and R2 as bytes.

---

*Generated on the Fly Sprite `elifant-goldfish`. Stage reports and this consolidated report live in `/home/sprite/elifant-goldfish/`.*
