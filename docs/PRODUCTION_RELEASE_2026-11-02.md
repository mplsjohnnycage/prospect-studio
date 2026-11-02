# Prospect Studio — production hardening release (2026-11-02)

## Source and deployment boundaries

- Existing app: Vercel project `prospect-studio`, team `johnnyc`.
- Source: private `mplsjohnnycage/prospect-studio`; this release is developed on `feat/production-build-leases-20261102`, not a replacement application.
- Convex development: `gregarious-ibis-329`; Convex production: `rightful-elk-426`. The two databases are separate.
- Keep Vercel SSO protection, owner-restricted Better Auth, outreach sending disabled, and publication approval requirements.
- Do not enable automatic email delivery or public demo publication as a side effect of this release.

## Implemented: exclusive, expiring demo build claims

Problem: two concurrent requests could both provision a Vercel Sandbox for one concept before either persisted the generated artifact.

Change: the Convex concepts table now holds optional `buildClaimId` and `buildLeaseUntil`. A serializable Convex mutation grants a four-minute lease to at most one unbuilt approved concept. Manual concept builds, owner-initiated Autopilot, and cron/service Autopilot must acquire a claim before executing a sandbox. A second request reports already-building without provisioning another sandbox. Saving a fresh artifact requires the unexpired matching claim; successful saves clear it. Failed requests attempt release, and abandoned claims expire. An old requester cannot release or overwrite a newer claim.

This is an additive schema change. Prior concept records require no migration. For safe backend-first rollout, existing Vercel callers may temporarily omit the claim ID when no active claim exists; once the new Vercel code is live, all three build paths supply it. An old caller cannot overwrite an active new claim. The contract does not modify the actual generated HTML or relax existing top-decile, owner, or concept-approval gates.

## Verification and release gates

- Unit tests, including lease timing and fencing: **34 passed**.
- TypeScript: passed.
- ESLint: passed.
- Next.js production build: passed.
- Convex cloud **development** functions: synchronized successfully; no Convex production push as part of testing.
- A live owner-authenticated overlap test and actual Vercel Sandbox build are still needed before promoting to production.

## Outstanding production blockers

1. Owner activation and authenticated production CRUD/Firecrawl/concept-build browser tests.
2. Dependency remediation: Better Auth and Convex adapter have incompatible patched-major constraints; the auth configuration must be migrated and tested together. Keep Vercel SSO enabled meanwhile.
3. Complete an AI-generated bespoke demo flow; existing sandbox generates and verifies approved static concept templates only.
4. AgentMail sender/webhook delivery and approval evidence; no real sending yet.
5. External calendar booking, observability, quotas, backup recovery and verified deploy rollback.
6. Determine which automations the owner explicitly wants active; no implicit outreach or public publishing.

The production release is not certified until each safety and business gate is proven by a real test.

## CI authorization checkpoint

The GitHub token currently lacks the separate `workflow` scope. GitHub rejected creation of `.github/workflows/prospect-studio-ci.yml`; the reviewed workflow is retained in `docs/prospect-studio-ci.pending.yml` for activation once the owner authorizes workflow writes. **Automated GitHub checks are not yet active.** The `scripts/release-smoke.mjs` checks have passed locally and may be run manually.
