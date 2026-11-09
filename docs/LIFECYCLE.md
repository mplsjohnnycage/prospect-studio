# Lifecycle state machine — map

**Authority:** Convex only · **Spec:** PS-MASTER-3.1 §15.2 · **Code:** `lifecycle/` (Zod)

This machine is the **spine**. Discovery, enrichment, ImageGen, Puck, Playwright, Rivet, R2, MCP, and Vercel are **slots**: they produce receipts that justify a legal edge. They do not define their own prospect stage vocabulary.

## Loop 1 (acceptance ends at Handoff)

```
Indexed → Scored → Enriched → Qualified
  → GenPendingApproval ──human──► Generating
  → ConceptReview ──human──► DesignIR
  → Building → QA → ArtifactReview ──human──► Handoff
```

Human gates: generation approval, concept selection, exact-artifact approval.

## Later (commercial / production)

```
Handoff ──auth──► OutreachDraft ──human──► SendPending → Sent
  → Converted ──auth──► ProductionGate ──human──► Produced
```

## Not this machine

| Thing | Role |
|---|---|
| `domain.ts` 8 UI labels | Display projection only |
| `runStatus` | Job/ops status orthogonal to stage |
| Rivet sessions | Execution only — publish receipts to Convex |
| Port | Deferred; may request, never commit stage |
| DuckDB | Embedded extract compute — no stage ownership |
| Surreal / Turso | Not Loop-1 SoT |

## Agent usage

```bash
npm run lifecycle -- loop1-path
npm run lifecycle -- can --from QA --to ArtifactReview
npm run lifecycle -- mermaid --loop loop1
```
