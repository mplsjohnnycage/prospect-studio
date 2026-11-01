# Prospect Studio — verified deployment state

Updated 2026-11-01. This document overrides historical notes in README.md.

## Services and ownership

- Frontend: private Vercel project `prospect-studio`, project ID `prj_XH2QAg2HS0zmkiq6va7gwaLnkfx2`, https://prospect-studio-johnnyc.vercel.app. Vercel team SSO enabled for all deployments.
- Source: private https://github.com/mplsjohnnycage/prospect-studio, production branch `main`. Deployments from exact Git SHAs are supported. **Automatic push-to-deploy is not yet connected**; the unlinked existing Vercel project needs a `vercel git connect` authorization from the owner.
- Convex production: `rightful-elk-426`, https://rightful-elk-426.convex.cloud. Dev: `gregarious-ibis-329`. Both contain Better Auth, Firecrawl, rate limiting, geospatial, AgentMail, Agent, workpool, action-cache components and prospect schemas. Dev and production **do not share data**.
- Authentication: private owner-only Better Auth sign-up accepts only `johnnyc@agentmail.to` plus the separately issued `OWNER_ACTIVATION_CODE` (already sent to this AgentMail inbox), followed by a user-chosen password of at least 16 characters. Server routes require authenticated Convex session; anonymous API access returns HTTP 401. After successful activation, set `OWNER_SIGNUP_ENABLED=0` on both Convex deployments. Vercel SSO is an independent access gate.
- Firecrawl: real API key configured in Convex development and production. `research.scrapeProspect` requires authenticated prospect ownership and public URL validation; no complete authenticated scrape through production UI has been run.
- AgentMail: ChatGPT AgentMail connector has sent the owner activation invitation. The product's AgentMail component is installed, but **production email send/receive/webhook are not configured and external sending is disabled**. No automatic emails.
- Concept building: existing Sprite actors use Rivet agentOS Core to execute and checksum static concept templates. Vercel production supports `@vercel/sandbox` for approved templates via `POST /api/agentos/build` with `SANDBOX_PREVIEWS_ENABLED=1`, OIDC and network `deny-all`. A Vercel Sandbox was provisioned, executed a real Node file-IO test, and stopped. **A live, owner-authenticated production concept build has not been tested.** The route does not generate a fully custom AI website.
- Rivet Pi Durable worker exists on the Sprite and passes readiness only. There is no configured model provider, AI-completed site-generation workflow, or cloud-hosted remote authenticated actor session. Stitch SDK installed, but no Stitch credentials / design generation completed.
- Calendar uses Convex persisted *manual planned appointments*, not an external calendar provider booking service. Publishing and outreach send effects remain approval-gated / disabled.

## Verification evidence (current release sequence)

- `npm run test:unit`: 12 passing tests, including owner activation policy and agentOS Core guest execution.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run build`: passed, including Next.js authentication proxy and sandbox build route.
- Browser: real local Playwright Chromium loaded sign-in form, password input and zero page JavaScript exceptions.
- Local HTTP: GET `/` 200; GET `/api/health` 200; anonymous GET `/api/prospects` 401; GET `/api/auth/ok` 200.
- Vercel release must be verified `READY` and matching Git commit before declaring deployed. Vercel SSO redirects unauthorized public requests as intended.
- Vercel sandbox smoke test: created isolated sandbox, ran Node script, verified written artifact, stopped session.
- `npm audit --omit=dev` still reports production dependency findings, including a critical Better Auth advisory. The current Better Auth Convex adapter requires Better Auth <1.7 while recent patched Better Auth is >=1.7.7; avoid removing Vercel SSO protection until dependency remediation.

## Commands to operate (never commit credentials)

```sh
npm ci
npm run test:unit
npm run lint
npx tsc --noEmit
npm run build

# Deploy current schema/code to cloud dev from an authorized Convex CLI:
npx convex dev --configure existing --team johnny-cage --project prospect-studio --dev-deployment cloud --once

# Deploy to cloud production only after validation:
npx convex deploy --yes --typecheck enable

# Once owner completes first activation:
npx convex env set --deployment rightful-elk-426 OWNER_SIGNUP_ENABLED 0
npx convex env set --deployment gregarious-ibis-329 OWNER_SIGNUP_ENABLED 0

# Once Vercel CLI device authorization is completed:
vercel link --yes --project prospect-studio --scope johnnyc
vercel git connect --yes
```

## Release gates not yet cleared

1. Owner must complete one-time activation using AgentMail invitation and confirm sign-in on protected Vercel deployment. No operator has access to the user's chosen password.
2. Verify authenticated prospect CRUD, calendar CRUD, Firecrawl scrape, concept review, Vercel sandbox artifact generation, and persisted evidence in a real browser on *production*, then remove test records.
3. Authorize Vercel CLI to attach the existing private GitHub repo to the existing Vercel project and confirm push triggers a build. Manual GitSource deployments already work.
4. Remediate critical/high production dependency advisories, get valid model/design/provider credentials for full AI site generation, and connect AgentMail sending and verification flows with explicit business approvals.
5. Decide on public sharing only after security, budget/quotas and tenant data checks. Keep SSO enabled until then.

Do not conflate Prospect Studio with the separate Factory project.
