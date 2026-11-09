# Prospect lifecycle state machine (Zod + TypeScript)

Canonical **Convex-owned** business FSM from PS-MASTER-3.1 §15.2.

- **18** persisted `lifecycleStage` values  
- **Orthogonal** `runStatus` (not a second FSM)  
- **UI groups** are projections only (`domain.ts` must not invent stages)  
- **Loop-1 terminal** = `Handoff`  
- Human gates require `humanApproved` before `canTransition` returns ok  

## Setup

```bash
cd lifecycle
npm install
npm run typecheck
npm test
```

## Agent commands

```bash
npm run lifecycle -- summary
npm run lifecycle -- loop1-path
npm run lifecycle -- next Qualified
npm run lifecycle -- can --from GenPendingApproval --to Generating --human --command approval.decide
npm run lifecycle -- mermaid --loop loop1
npm run lifecycle -- convex-union
npm run lifecycle -- dump
```

## Authority rules

1. Only Convex commits stage transitions.  
2. Rivet / Port / Surreal / Turso / DuckDB never own this machine.  
3. Job failure flips `runStatus`, not `lifecycleStage`.  
4. No silent reverse edges — recovery is explicit reopen/retry with rationale.  
5. Commercial stages after `Handoff` are `later` and separately authorized.
