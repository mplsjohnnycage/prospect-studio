# Implementation Readiness Test — PROSPECT_STUDIO_MASTER_SPEC_v3_2026-11-09.md

**Stage:** 9 · **Reviewers:** egm-implementation-readiness, egm-codebase-details, egm-style (fresh contexts)
**Target:** DetailedRange = 1..1430 (no semantic split detected; whole document treated as the plan)
**Standards:** implementation-readiness-standard.md (first two reviewers); style.md (third)
**GoldfishContext:** none

## Verdict

The document is an excellent *architecture and constraint* document and not yet an implementation plan. It states invariants well (no fake success, hash-bound approval, Convex-only transitions) and is weak at every point where a developer needs a concrete name, number, file, or schema. Its own closing line concedes this (:1426 "Code-review and release gates must never be inferred from this specification alone"). **P0 is executable today; P1 onward is not.**

Consolidated below, deduplicated across the three reviewers. Attribution in brackets.

---

## 🔴 BLOCKERS

### B1. Three incompatible stage vocabularies, no mapping, no enum, no fate for the existing state machine
**Scope:** :14 (13-step loop), :19, :37–38 (`domain.ts`: Discover/Qualify/Extract/Design/Demo/Outreach/Convert/Produce + `canTransition`/`advance`), :504 (C09 "eight actual domain stages"), :745–769 (18-state machine), :858 (`prospects` lifecycle stage), :27 (hard rule 2).
**Problem:** Four non-isomorphic vocabularies coexist. Nothing states which is stored in `prospects.stage`, whether the eight existing values are renamed/back-filled, whether the 13-step loop is a display projection or a second machine, or whether `advance()`/`canTransition()` are kept, wrapped, or deleted. Three loop steps (Normalize/Dedupe, Score-1, Score-2) have no state in §15.2. C09 requires exactly eight stages; the diagram requires eighteen. A fresh implementer must invent the canonical enum and its migration — the highest-risk change to live data in the document. [implementation-readiness B2; codebase B1; style B1]
**Fix:** One authoritative enum, the eight UI labels demoted to display groupings, and a mapping table: UI stage ↔ workflow state ↔ allowed `kind` ↔ guard predicates ↔ event names. State the fate of `src/lib/domain.ts` and the `concepts` A–D migration.

### B2. No target-scope file boundary; phase deliverables are layer nouns, not files
**Scope:** :1211–1225 (§21), :1315–1384 (§23), :423, :1384.
**Problem:** The standard requires an exact repository-relative file list suitable for a write allowlist. §21 delivers "Auth/permissions, command/outbox, guarded revisions…, status vocabulary" with no file names. §23 is directory-level only, every entry tagged `[P]`, and is contradicted by :423 ("initially use `src/` if safer") and :1384 ("Do not move … existing working files"). No file is marked Create/Modify/Delete, yet `convex/convex.config.ts` and `convex/schema.ts` must be modified by nearly every phase and are marked `[V]` only. No phase can be gated on scope. [implementation-readiness B1; codebase M1]
**Fix:** Per-phase table of exact paths, with Create/Modify/Delete, including the two Convex files; keep the aspirational tree as a clearly non-binding appendix.

### B3. The core command contract is untyped
**Scope:** :774–779 (`Command`: `kind: string; input: unknown`; `actor.type: 'prospect'|'batch'|'design'|'worker'`), :312 (six principal kinds), :313 (`canCommand(kind)`), :777 (`requestedBy: string`).
**Problem:** Every mutation, MCP tool, workflow step and outbox record flows through `Command`. `kind` is a `string` and `input` is `unknown`, so there is no enumerable registry, no per-kind validator, no per-kind guard, and no deterministic P1 test suite. `actor.type` cannot represent a human clicking Approve, an MCP client, or a Port webhook — the three principals the rest of the document depends on — and `'prospect'` names the subject, not the actor. [implementation-readiness B3; codebase M4; style B4]
**Fix:** Closed `CommandKind` union with one input validator per kind; a single `ActorRef` aligned to §6.3's principals; type `requestedBy` as a principal ID.

### B4. No canonicalization rule for the hashes every approval binds to
**Scope:** :383, :481, :621, :646–651, :665, :1221, AT-046 :1297–1300.
**Problem:** The trust model is "approve the exact bytes," but the document never specifies how `DesignDocument.sha256` / `contentSha256` / `inputBundleSha256` is computed: key ordering, number formatting, whitespace, excluded volatile fields (`createdAt`, `revision`), float handling, unicode normalization. Two competent engineers produce two different hashes for the same IR, making AT-046 unpassable and P10's gate meaningless. [implementation-readiness B4]
**Fix:** A canonical JSON profile (e.g. RFC 8785 JCS), an explicit field-exclusion list, and a golden test vector (`fixture → expected sha256`) for IR, `BuildReceipt.inputHash` and `ImageGenerationReceipt.inputBundleSha256`.

### B5. Four P0-critical dependencies are explicitly deferred to the implementer
**Scope:** :200–204 (CX11/CX12 "verify/install"), :207 (CX17 "possibly component after feasibility check"), :568–572 (ImageGen provider open), :692 (Jev "not verified as installed"), :1400 (model runtime U), :1402 (repo strategy via Factory gate).
**Problem:** The standard names "selecting a dependency" as a failure. No package name, version, license check, or fallback exists for Workflow, R2, the ImageGen provider, or the visual evaluator. "Verify/install" is not a deliverable. [implementation-readiness B5; codebase M13]
**Fix:** Name each package + pinned version + license + owner, or add a pre-P1 spike with a decision deadline and named decision-maker.

### B6. Build/deploy artifact strategy is undecided, blocking P9 and P10
**Scope:** :656 (two emitters), :666 (`emitter` union), :707–712 (undefined `ApprovedBuildIntent`/`ProductionIntent`/`RollbackIntent`), :1002 (`GET /apps/{slug}`), :1402.
**Problem:** P9 requires a build pipeline and P10 a deployment adapter, but the plan does not decide: one repo per prospect vs monorepo dir vs artifact-only deploy; whether both emitters ship in P9; slug/domain scheme; preview auth; lockfile/`npm ci` strategy for generated sites. `BuildIntent.emitter` is a required union, so the schema forces a decision the prose refuses to make (:656 calls the two emitters a "historic design requirement"). [implementation-readiness B6; style M13; codebase M8]
**Fix:** Decide Loop-1 emitter scope (recommend `static-demo` only), generated-site layout, Vercel project model, and the slug/domain contract before P9.

### B7. Authorization model is a name, not a contract
**Scope:** :307, :312–313, :823, :830, :842, :951.
**Problem:** `canRead`, `canCommand`, `canApprove`, `canControlDesktop` are signatures with no role enumeration, no scope matrix (principal × resource × action), no claim→tenant resolution, and no definition of "direct verified human identity" for approvals. `memberships.role` (:831) has no allowed values. P1's first deliverable is therefore an unowned design decision, and AT-003/005/006 cannot be written. [implementation-readiness B7]
**Fix:** Publish a role table and scope matrix, the claim→tenant function, and the approval identity proof (session + re-auth? MFA?).

### B8. Scoring and qualification rules are unspecified
**Scope:** :355–359 (§7.5), :757 ("Qualified: rules + evidence"), :1216–1217, AT-025/026 :1268–1270, :1194 ("A-tier"), :1311.
**Problem:** Dimensions are named but there are no weights, no 0–100 derivation, no normalization, no rule-version format, and no threshold that promotes `Scored → Enriched → Qualified`. "A-tier" is used as a cost policy and a phase exit gate and is defined nowhere. AT-026 cannot pass without a pinned rule definition. [implementation-readiness B8; style B3]
**Fix:** A versioned rule spec (v1) as a table: input field → transform → weight → contribution; explicit thresholds; a fixture set with expected scores; define A-tier as a predicate over named dimensions.

### B9. P0's exit gate is unfalsifiable and branch reconciliation has no owner
**Scope:** :34, :44–48, :1207, :1211.
**Problem:** "Clean dev codegen/typecheck/tests, documented gaps and no lost modifications" has no recorded baseline, no definition of "clean," and no captured diff manifest. §1.2 declares a critical divergence between GitHub `main` and the Sprite worktree and says the implementation "must compare HEADs, reconcile PR #35 and dirty changes" — but never says who decides, what the policy is (merge vs cherry-pick vs rebase), or which branch P1 builds on. P0 is "go find out what the repo is," and P1–P14 depend on facts P0 is supposed to establish. [implementation-readiness B9; codebase B7]
**Fix:** P0 outputs a signed artifact: exact baseline test counts, `git diff --stat` + patch of dirty work, a named base-branch decision, and a written merge policy with a named decision-maker.

### B10. Circular phase dependency between P3/P10 and P12 (Port)
**Scope:** :1214 (P3 exit: "basic Port links"), :1221 (P10: "handoff package/Port catalog entry"), :1223 (P12: "Port Convex component, blueprints, REST/webhook sync").
**Problem:** P3's exit gate needs Port links and P10 needs a Port catalog entry, but the Port component is built in P12, which depends on P10. Three phases cannot exit. [implementation-readiness B10; codebase M6]
**Fix:** Split Port into P2b (read-only lookup + manual catalog record) and P12 (governed write/webhook sync); restate the three exit gates.

### B11. Four parallel operation-name registries that disagree with each other
**Scope:** :203–211 (§4.2), :292 (§6.1), :959–981 (§17.2), :1012–1036 (§17.4), :25 (hard rule 5).
**Problem:** Hard rule 5 says the same typed commands power UI, MCP and headless integrations. The document ships four lists that do not reconcile — e.g. `execute` vs `exec` vs `sprites.exec`; `getSignedUrl` vs `getSignedRead`; `image.generate` vs `image.request`; `qa.inspect` vs `visualEvaluate` vs `qa.result`; `metrics.runCost` vs `reports.cost`. §6.1-only tools (`source.cite`, `approval.request`, `business.search`) have no counterpart; §17.4-only tools (`workflow.run/status`, `catalog.component`, `design.diff`) likewise. The implementer must pick one list and rewrite the other three, including the MCP registry the document claims already exists. [codebase B2; also ZO M4 / Critic M18 at feature altitude]
**Fix:** One operation registry (namespace.op → input schema → auth scope) and derive §4.2, §6.1, §17.2, §17.4 mechanically from it.

### B12. No schema migration plan exists for the largest change in the document
**Scope:** :823, :216, :858, :903, :337.
**Problem:** :823 says add fields/tables "only after schema diff and controlled backfill" — i.e. the plan is an instruction to write a migration plan later. No migration path, ordering, backfill source, rollback, or dual-read window. Existing `prospects` rows have no `place` reference yet :858 describes them as place-identity rows and :337 promotes `places`→`prospects`. `concepts` is constrained to A/B/C/D while §11.2 says the count must be configuration-dependent. `commands` is reused for the new outbox protocol with unknown current shape. [codebase B4; implementation-readiness M1]
**Fix:** A table-level delta: existing table → action → backfill expression → compatibility test → rollback; plus the required Convex indexes named explicitly.

### B13. The same artifact has two or three proposed homes
**Scope:** §9.2 :407–423, §3 :152–175, §23 :1315–1383.
**Problem:** Design tokens: `packages/design-tokens/` (:412) vs `packages/tokens/` (:1357). Design IR: `packages/design-ir/` (:414, :1359) vs `src/lib/design-ir/` (:1336) vs `convex/design/` (:1350). Provider contracts: `packages/provider-contracts/` (:417, :1362) vs `src/lib/provider-interfaces/` (:1335) vs `contracts/` (:1374). Workflow module, model routing and the R2 component are in §3 but absent from §23. The design-IR duplication is load-bearing: two validator homes guarantee drift between the Convex mutation path and the editor path. [codebase B5; also ZO M10]
**Fix:** One home per shared artifact, stated in §3; delete the losing paths.

### B14. Workspace/monorepo mechanics are deferred, but ~12 directories depend on them
**Scope:** :423, :1355, :1369, :654.
**Problem:** The package manager is never named, nor the workspace manifest, `tsconfig` aliases, `transpilePackages`, or how `convex/` bundles a workspace package under Convex's runtime constraints. The build worker runs `npm ci` with no lockfile identified. Every P3/P8/P9 task blocks on this. [codebase B6]
**Fix:** An ADR in P0/P1 naming the toolchain and the Convex packaging approach.

### B15. The superseding authority is an unnamed conversation, and the document disclaims its own normativity
**Scope:** :8, :63, :1411, :1426.
**Problem:** A build contract whose precedence order is *conversation > document* names no transcript, decision log, or dated record, so every conflict it flags is unresolvable by a fresh reader. :1426 then removes the document's authority without naming the replacement. [style B2; also Critic M17]
**Fix:** Cite a durable decision record (file + date + section) or declare this document the sole authority.

### B16. An undefined, admittedly uninstalled evaluator sits inside the definition of done
**Scope:** :585, :650, :690–692, :1220, :1311, :1430.
**Problem:** "Jev/Jevex" has two spellings, is a section title, a lifecycle stage and an acceptance input, while the only definitional sentence says it is "not verified as installed." F-001 and the DoD therefore require a component no one has selected. [style B6; also ZO/Critic]
**Fix:** Name the concrete evaluator (product + version) or rewrite F-001/DoD as "deterministic Playwright assertions plus an optional advisory judge," and remove "Jev" from normative text.

---

## 🟡 MAJORS

- **M1. Contract enums and identity fields disagree across sections.** `ArtifactRef.verification` (observed|derived|generated|approved|rejected, :389) vs Brand DNA tags (verified|inferred|proposed|disputed, :405); `rightsStatus` (:390) vs `licenseClass` (:827); four representations of "who" (`createdBy` :606, `requestedBy` :777, `producer` :388, `actor.id` :776); `version: string` (:385) vs `revision: number` (:605). Publish one `ActorRef`, one `RightsClass`, one `Verification` enum, one revision type. [codebase M2]
- **M2. Worker gateway is routes-only — no bodies, token claims, or error model.** Missing request/response shapes, auth token format and claims, SSE vs WebSocket, cursor and cancel semantics, error codes, versioning. `WorkerTask` leaves both `payloadRef?` and `input?` optional with no rule. P4's exit gate is unimplementable. [implementation-readiness M3; codebase M7]
- **M3. Sprite bootstrap is not actionable.** Which of six profiles are in P4; service manager, ports, run-as user, log paths, permissions; `profileHash` computation; checkpoint compatibility rule; mapping of CX13 operations to `@fly/sprites` SDK methods. :254 "verify on actual host" is an unresolved fact blocking a health-check contract. [implementation-readiness M4]
- **M4. Discovery prerequisites missing.** No taxonomy source for `taxonomyFilters`; no pinned Overture release, theme/type, or partition strategy; no county geometry source/license; no normalizer, distance threshold, or confidence formula; P5's exit gate has no measured target. [implementation-readiness M5]
- **M5. Design IR is a sketch, not a schema.** No allowed `schemaVersion` values; `propsSchemaRef` language and resolution undefined; `actions: string[]` and `dataSourceId` registries absent; loss-report format undefined; no fixture corpus; `PageNode.type` hard-coded to `'component'`. [implementation-readiness M7]
- **M6. Storybook baseline workflow and component inventory unphased.** ~40 catalog components with no built-vs-mapped statement, no per-component acceptance, no phasing; :492 delegates the mapping; no diff tool or threshold; baseline-update workflow has no reviewer or record. [implementation-readiness M8]
- **M7. Visual evaluator has no schema, severity enum, or pass threshold.** "Bounded attempts and budget" has no numbers; P9's exit gate is unmeasurable. [implementation-readiness M9]
- **M8. Outbox/retry/reconciliation constants absent.** No lease duration, attempt cap, backoff curve, dead-letter threshold, or reconciler interval; P1's duplicate/replay tests depend on these being deterministic. [implementation-readiness M10; ZO M6]
- **M9. Cost/budget policy has no numbers or ledger semantics.** No reservation algorithm (reserve→settle→release), no cap values, no partial-spend rule, no named authority for raising a cap. [implementation-readiness M11; Critic B5]
- **M10. Brand DNA has no typed shape or review-event schema.** No assertion schema, no version immutability rule, no accept/reject event for D01. [implementation-readiness M12]
- **M11. Provider adapter interfaces are named but never defined.** Only Discovery has request/result types; Enrichment, ImageGen, Visual, Deployment have operation names only, yet P1 promises a "provider/worker contract package." [implementation-readiness M13; codebase M13]
- **M12. Approval surface lacks identity proof, action enum, and a screen.** No approval `action` enum beyond `approve_send`; "direct verified human identity" has no mechanism; `identityReview` — a mandatory blocking state (:800) — has no screen in S00–S24 or D01–D20. `approvals` (:905) also lacks recipient set, sender account, suppression revision, expiry, and single-use marker that §14.4 requires (:733). [implementation-readiness M14; codebase M5]
- **M13. MCP surface lacks scope mapping, receipt schema, pagination.** Tags like `[read]`/`[privileged]` do not map to `convex/mcp.ts` scopes; no per-tool quota, response schema, or cursor format; AT-008/009 have nothing to assert against. [implementation-readiness M15]
- **M14. No owners, estimates, or rollback per phase.** :1384 requires one accountable owner per module and names none; no phase has a rollback or feature flag. [implementation-readiness M16; style N "no owner named anywhere"]
- **M15. P4 profile scope vs P11 desktop dependency mismatch.** P11 requires a real desktop/noVNC viewer but no phase delivers the `agent-desktop-v1` bootstrap, Rivet service, or websockify. [implementation-readiness M17]
- **M16. UI work is unscoped and unmapped to existing source.** ~70 components with no file mapping, no phase allocation, no Loop-1 minimal set. :488 says "Existing UI is the starting point" while §23 marks every subdirectory `[P]`. [implementation-readiness M18; codebase M3]
- **M17. Build provenance is unimplementable: baked catalog vs pinned `catalogVersion`.** :240 bakes "React/ui/catalog" into the image; :668 makes `catalogVersion` a per-build input. No statement of how the worker obtains `packages/ui` at `CatalogComponent.sourceSha`. [codebase M8]
- **M18. The BFF host decision is handed to the implementer.** :1004 defers whether `convex/http.ts` or Next.js owns the 16 routes; `GET /apps/{slug}` conflicts with Vercel deployment URLs as the hosted output. [codebase M10]
- **M19. Index design deferred for ~70 tables; one index not expressible.** `spriteWorkers` indexes "capability" where `capabilities` is an array. [codebase M11]
- **M20. Persisted enums referenced but never enumerated.** `resourceClass`, `ttlPolicy`, `networkPolicy` (:222); `ArtifactRef.kind: string` vs 13 storage classes (:380); emitter eligibility (:656); `BuildReceipt.checks[].name` vocabulary. [codebase M12]
- **M21. Several `V` claims are unbacked by the stated evidence set.** :1409 says five files were checked, yet §23 asserts six more `V` items (`convex/http.ts`, `convex/prospects.ts`, `convex/agentTools.ts`, `src/app/page.tsx`, `tests/`, `scripts/`) with no provenance. Even backed claims are too coarse: `AGENT_TOOLS` has no export names or scope strings, and is attributed to both `mcp.ts` and `agentTools.ts`. [codebase M2]
- **M22. Supermemory is authoritative in §2.3 but has no home anywhere.** No §3 row, no §23 path, no package, no contract; `operatorThreads.memory pointer(s)` has no format or failure mode. [codebase M9; ZO M11]
- **M23. "Bounded" is used as a numeric limit roughly a dozen times and is never bounded.** No attempt count, timeout, byte cap, or config key. [style M2]
- **M24. No normative keyword convention; requirements joined by "or" allow opposite implementations.** :621 "must fail validation **or** surface a reviewable warning"; :644 "should be excluded **or** represented." [style M1]
- **M25. "Exact baked-in capabilities" table contains no versions and five unresolved conditionals** ("if validated", "if supported"). P4's gate cannot be evaluated. [style M3]
- **M26. Provider registry is normative but every candidate is an unlinked proper noun, and "Selection proof" lists criteria instead of proof.** [style M4]
- **M27. "Factory" is used as a system of record and a gate without ever being identified** — seven normative uses, zero definition. [style M5; C #2]
- **M28. Undefined or undecided systems appear in the data-authority table.** Supermemory, "Turso (if retained)", "OmniRoute", "Stitch-like". [style M6]
- **M29. The `V` label merges current and stale evidence; the proof register cites no revision.** :6 defines V as current **or** prior inspection; :42 says recheck; :1409 says "during this response" with no SHA. [style M7]
- **M30. Status labels carry three different meanings.** `U` used for evidence state and for work directives (:1400); `D/P` hybrid (:1402). [style M8]
- **M31. The "locked" UX is described only in subjective adjectives.** Hard rule 11 makes it inviolable, but there are no tokens, screenshots, or measurable test. [style M9]
- **M32. The same design entity has three names.** `ImageConcept` (:648), `visualConcepts` (:894), `VisualConcept` (:935), alongside existing `concepts` (:903). [style M10; ZO M5]
- **M33. A security control carries an undefined exception with no approver.** :1159 "when not essential" vs AT-007 treating any secret in a log as hard failure. [style M11]
- **M34. The SLO section defines no SLO.** Every number deferred; P14 requires measured SLOs with no scheduled resolution point. [style M12; ZO/Critic M11]
- **M35. Concept count is simultaneously fixed at four and configuration-dependent.** [style M15]
- **M36. Two typed contracts offer a choice instead of a type.** `polygon/bbox?` inside `DiscoveryRequest` (:341) is not valid TypeScript; "embeddings or fields on places" as a table name (:852). [style M16]

---

## 🟢 NITS

- AT-002 ("dirty work remains safe") and AT-009 (live ChatGPT client) are not automatable CI tests — mark manual/UAT. [:1236, :1243]
- No v1 defaults for `maxCandidates`, `concurrency`, `timeoutMs`, `maxOutputBytes`. [:341, :1046]
- QA matrix requires "specified routes" that are never enumerated. [:681]
- `BuildReceipt.status: 'blocked'` has no error-code mapping. [:671]
- Turso / `@vercel/sandbox` / `@google/stitch*` retained with "retain until retired" but no retirement task. [:1391, :1399]
- `GET /apps/{slug}` has no slug format, collision rule, domain strategy, or cache spec. [:1002]
- `R` (researched candidate) never resolves to a dated decision. [:6]
- Slash/"or" notation used as if it were a decision (`tenantId|ownerId`, `polygon/bbox?`, `costLedger`/`stageCosts`, `events`/`actorEvents`, `embeddings` or fields, `convex/models` or adapter, `apps/storybook` or `.storybook`). [codebase N1]
- Caret ranges where the plan demands pins (`^0.2.4`, `^0.5.5`, `^1.49.0` vs :654 "pinned"). [codebase N2]
- `@fly/sprites` (:35) vs `github.com/superfly/sprites-js` (:1417) never stated to be the same SDK. [codebase N3; style N]
- `src/app/(optional) storybook/` puts "(optional)" into a route path. [codebase N4; style N]
- "optional monorepo" (:1355) contradicts §9.2 treating the layout as target. [codebase N5]
- AT-001/AT-002 test the repo's state, not the implementation. [codebase N6]
- Hedged `V`: `page.tsx [V historically map-first homepage]`. [codebase N7]
- No test file locations for AT-001…AT-053; no runner named beyond Playwright. [codebase N8]
- Three concept tables related only in the ASCII graph, not by keys. [codebase N9]
- Legend drift: `[EXISTING REPO]`, `[V/potential …]`, `[V historically …]`, `[P existing …]`. [codebase N10]
- "no permanent private public links" is self-contradictory. [:1150]
- "statelessly stateful" is a coined oxymoron used as a P11 deliverable name. [:12, :288, :1222]
- "roof-point" vs enum value `rooftop`. [:320]
- "honest" used as an acceptance criterion four times. [:463, :512, :1216, :1311]
- "15 unverified integrations" names no set. [:1207]
- "recover failing tests" presupposes failing tests exist. [:1211]
- "(typically fronted via 8080, verify on actual host)" is a hedge inside a normative manifest. [:251]
- "workflow.run/status [policy-controlled/read]" names no policy or controller. [:1024]
- "materially" undefined while the rest uses numeric caps. [:1426]
- 404 "unavailable/cross-tenant" and 503 "worker/provider unavailable" overload "unavailable". [:949]
- "roomy canvas" is the only description of S20. [:482]
- "target visitor conversion goal" appears once and is undefined. [:405]

---

## Can an engineer start?

**P0: yes, today.** P0 is discovery work — diff three HEADs, inventory routes/tables/packages, run codegen/typecheck/tests, map env-var names — and its steps are concrete enough to execute, though its exit gate needs tightening (B9).

**P1 onward: no.** An engineer cannot write the command/outbox layer without B3, B1 and B7. They cannot write approval storage without B4. They cannot install Workflow/R2 without B5. They cannot build a Sprite worker without M2/M3. They cannot build or deploy without B6. The plan currently guarantees a different implementation from each engineer who reads it — the exact failure the Zero-Decision Rule exists to prevent.

## Minimum decisions required before P0

1. **Base-of-truth branch policy** — which of `main`, `rivet-spike-attach`, or the hardening worktree P1 builds on, and the merge/cherry-pick rule for dirty Sprite work. Named decision-maker. [:34, :44–48, :1207]
2. **Baseline definition** — record the current failing-test inventory, codegen status, and exact SHA before any change. [:1211]
3. **Scope freeze on the state machine** — confirm whether `domain.ts`'s 8-stage machine is replaced or projected. [:38 vs :748]
4. **Environment authority** — written confirmation that `rightful-elk-426` (prod) and `gregarious-ibis-329` (dev) are the validation targets. [:46–47]
5. **Secrets access procedure** — who retrieves which names from which manager. [:1211]

## Minimum decisions required before P1 (dependency order)

1. `CommandKind` union + per-kind validators + single `ActorRef` (B3, M1).
2. Canonical JSON/hash profile with a golden vector (B4).
3. Role table + scope matrix + claim→tenant resolution + approval identity proof (B7).
4. UI-stage ↔ workflow-state ↔ command mapping table (B1).
5. Named + pinned dependencies for Workflow, R2, and the shared schema package (B5, B13).
6. Table-level schema delta with indexes, backfill and compatibility tests (B12).
7. Outbox/retry/reconciliation v1 constants and budget ledger semantics (M8, M9).
8. Worker gateway contract file with bodies, token claims, event framing (M2).
9. Port split into P2b read-only + P12 governed, with revised exit gates (B10).
10. P0→P1 file allowlist per phase (B2).
