# Prospect Studio — production hardening release (2026-11-02)

## Source and deployment boundaries

- Existing app: Vercel project `prospect-studio`, team `johnnyc`.
- Source: private `mplsjohnnycage/prospect-studio`; this release is developed on `feat/production-build-leases-20261102`, not a replacement application.
- Convex development: `gregarious-ibis-329`; Convex production: `rightful-elk-426`. The two databases are separate.
- Prefer Vercel SSO (or password) as defense in depth — **currently off** as of 2026-11-09; keep owner-restricted Better Auth, outreach sending disabled, and publication approval requirements.
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
2. Dependency remediation: Better Auth and Convex adapter have incompatible patched-major constraints; the auth configuration must be migrated and tested together. Re-enable Vercel SSO (or password) meanwhile if edge protection is desired (currently off).
3. Complete an AI-generated bespoke demo flow; existing sandbox generates and verifies approved static concept templates only.
4. AgentMail sender/webhook delivery and approval evidence; no real sending yet.
5. External calendar booking, observability, quotas, backup recovery and verified deploy rollback.
6. Determine which automations the owner explicitly wants active; no implicit outreach or public publishing.

The production release is not certified until each safety and business gate is proven by a real test.

## CI authorization checkpoint

The GitHub token currently lacks the separate `workflow` scope. GitHub rejected creation of `.github/workflows/prospect-studio-ci.yml`; the reviewed workflow is retained in `docs/prospect-studio-ci.pending.yml` for activation once the owner authorizes workflow writes. **Automated GitHub checks are not yet active.** The `scripts/release-smoke.mjs` checks have passed locally and may be run manually.

## Nov 2 follow-up — Git identity and backend readiness

- Vercel `johnnyc` team membership shows a single OWNER, connected to GitHub `mplsjohnnycage`. Earlier PR commits used the different GitHub identity `johnnyc-9164` and Vercel blocked automatic builds. Repository-local Git author identity is now aligned to `mplsjohnnycage` for new commits; historical commits were not rewritten. Confirm a fresh Git-triggered Vercel build before declaring the integration repaired.
- `/api/health` remains a cheap liveness endpoint; `/api/ready` now performs a real Convex cloud query and returns 503 if the remote data backend is missing or unreachable. No tenant data is returned by the probe.
- The new Convex `health.ping` query is data-free and is deployed to Convex **development**; it has not been deployed to production.
- Run `PROSPECT_EXPECT_READY=1 PROSPECT_SMOKE_URL=<APP_URL> node scripts/release-smoke.mjs` to require backend readiness (use the protected Vercel CLI transport for SSO URLs). CI uses `PROSPECT_EXPECT_READY=0` and an intentionally nonfunctional backend to verify fail-closed behavior.

## Vercel-native build quality gate

GitHub `workflow` scope remains unavailable, so the pending GitHub Actions workflow cannot yet be installed. As an enforceable alternative, `npm run build` now performs the unit suite, lint and TypeScript typechecking before the Next.js production compilation. Since the Git-linked Vercel project uses the repository's build script, any regression blocks an automatic deployment even without GitHub Actions. Keep the pending workflow for additional HTTP smoke tests and PR checks once the token scope is authorized.

## Vercel CI beta migration (2026-11-02)

The owner selected **Vercel CI** instead of GitHub Actions. This release installs Turborepo 2.11.10 and the root `turbo.json`. Tasks tagged `ci` are `test:unit`, `lint`, and `typecheck`, each independently run and cached by Vercel CI. The repo-local NPM `packageManager` declaration ensures Turborepo resolves the single-package workspace. The Next.js build retains `npm run verify` as an additional fail-closed deployment build gate.

Vercel CI must be explicitly enabled for the private `mplsjohnnycage/prospect-studio` repository using `vercel ci enable --scope johnnyc --remote origin` after pushing the configuration. Confirm its first pushed-commit run on the Vercel dashboard and the PR before calling it active. The previous pending GitHub Actions YAML has been retired; no `workflow` permission is needed for Vercel CI. Do not merge until all Vercel CI tasks and the Vercel preview check pass.

### Vercel CI activation evidence

- Enabled for the linked private `mplsjohnnycage/prospect-studio` repository on Vercel team `johnnyc` using `vercel ci enable --scope johnnyc --remote origin --non-interactive --json`.
- The Vercel CLI returned `status: ok`, `ciEnabled: true`, `outcome: enabled`.
- Trigger a new Git push, then verify the task execution and GitHub PR check using `vercel ci list`, `vercel ci inspect`, and `gh pr checks`.

### Clean Vercel build TypeScript type generation

An early Vercel preview exposed a clean-build typecheck error: global Next.js `LayoutProps` is produced by `next typegen`, but `npm run verify` ran TypeScript before Next.js compiled. The `typecheck` task now executes `next typegen && tsc --noEmit --incremental false`. This is required for fresh Vercel CI machines and Vercel deployment builders. Verified locally with the existing `.next` directory temporarily moved aside to reproduce a clean checkout.
