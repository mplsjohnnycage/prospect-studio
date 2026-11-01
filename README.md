> **Current source of truth:** [docs/DEPLOYMENT_STATUS.md](docs/DEPLOYMENT_STATUS.md) describes the deployed Vercel app, managed Convex environments, owner auth, production gates and verified checks. Historical pilot notes below predate those changes and must not be interpreted as current deployment status.

# Prospect Studio — Sprite Private Pilot

This repository is the working, **private pilot** implementation of Prospect Studio v3 in Fly Sprites, not a finished production campaign system.

## Runtime
- Sprite: `prospect-studio` in organization `johnny-cage-831`
- Private Sprite URL: https://prospect-studio-b33vt.sprites.app (Sprite account admins only)
- Next.js 16 App Router + Tailwind v4 + shadcn/ui: `prospect-web` service on port 3000.
- Local anonymous Convex backend: `convex-local` service on port 3210 (internal-only), accessed through Next.js server APIs so remote browser clients do not attempt to connect to loopback.
- RivetKit 2.3 actor registry: `prospect-rivet` service, 3 actors; engine health endpoint at 127.0.0.1:6420.
- All business records are in Convex. There is no SQLite fallback.

## Registered Convex components
| Component | Purpose | Readiness |
| --- | --- | --- |
| `@convex-dev/agent` | Agent messages/threads | Installed, LLM model not configured |
| `@firecrawl/firecrawl-convex` | Search, scraping, mapping, crawls | Installed; external API key missing |
| `@agentmail/convex` | Reactive inbox, durable outbound, webhooks | Installed; no authorized inbox/API key/webhook secret |
| `@convex-dev/geospatial` | Coordinate-indexed vicinity query | **Verified operational** with a temporary test |
| `@convex-dev/rate-limiter` | Paid research throttling | Used in research action |
| `@convex-dev/aggregate` | Efficient counts | Registered; not yet applied to dashboard counters |
| `@convex-dev/action-cache` | Cached external actions | Registered; not yet used |
| `@convex-dev/workpool` | Bounded background tasks | Registered; no production jobs yet |

## Working product behavior
- Add prospects manually with optional verified latitude/longitude; persist in local Convex.
- Browse and filter prospect records, activity history and design workspaces.
- Supervised stage transitions: Discover → Qualify → Extract → Design.
- Create 4 distinct direction briefs, approve exactly one, maintain command ID idempotency.
- Geospatial nearest search (25 km) over indexed coordinates.
- Research action only when a real Firecrawl key exists. Sources are written with provenance.
- AgentMail inbound webhook route mounted at `/agentmail/webhook`. No account configured.
- Explicit **hard block** on demo publication; no unsolicited email sending.
- Actor registry starts and Rivet engine health responds. **Commands are not yet dispatched to durable Rivet Workflows.**
- Next.js server-side bridge uses ConvexHttpClient. UI refreshes every 15 seconds rather than a direct browser Convex subscription because anonymous Convex is bound to Sprite loopback.

## Not implemented
- Authenticated, managed multi-tenant Convex cloud and Next.js ConvexProvider
- Automated discovery via Google Places, completed verified research workflows
- Model-driven Brand DNA or generated working websites and screenshots
- Rivet durable workflow outbox, actor command dispatch and reconciliation
- AgentMail API credentials, authorized inbox provision, inbound webhook registration, outbound sending
- Production access controls, external load test, safe cost ceiling enforcement and rollback

## Credentials and launch
**Never put real secrets into the Next.js public env or git.** Set keys only in Convex deployment environment:

```sh
npx convex env set FIRECRAWL_API_KEY <real-key>
npx convex env set AGENTMAIL_API_KEY <real-key>
npx convex env set AGENTMAIL_WEBHOOK_SECRET <real-webhook-secret>
```

Firecrawl component is currently configured with `FIRECRAWL_API_KEY=disabled-not-configured` in local Convex; this deliberately fails any live action. Configure an AgentMail webhook only after using an accessible Convex site URL, not local loopback.

Convex pilot has `CONVEX_PILOT_MODE=1`, a **single-owner unauthenticated local mode**, allowed only behind the Sprite admins-only access layer. Remove that override, implement provider auth and tenant policy, and use a linked Convex cloud project before making the app public.

## Verification
```sh
cd /home/sprite/prospect-studio
npm run build
npm run lint
node --import tsx --test src/lib/domain.test.ts
CONVEX_AGENT_MODE=anonymous npx convex run prospects:list '{}'
curl -f http://localhost:3000/api/health
curl -f http://localhost:3000/api/prospects
curl -f http://localhost:3000/api/actor-status
```

The local CLI tests previously verified create → vicinity search → qualify → extract → design (4 briefs) → approval → blocked publication. QA records were deleted afterward.

## Product and Factory boundary
This repo is **Prospect Studio**, the outbound product. It is not the software Factory itself. Factory may later provision runtimes through explicit adapters.

## Rivet agentOS execution (verified on Sprite)
- Installed `@rivet-dev/agentos-core@0.4.6` for in-process isolated VMs and `@rivet-dev/agentos@0.4.3` as the hosted Rivet client for later cloud provisioning.
- `prospectActor.generateConcept(input)` uses agentOS Core to render a **static template** inside an isolated VM, read and verify the generated HTML, compute a SHA-256 checksum, broadcast `concept_ready`, and persist the build metadata in Rivet actor state. No arbitrary guest command or JavaScript is accepted from clients.
- VM networking defaults to deny, guest process count limited to 8, filesystem limit 16 MiB, and each VM is disposed at the end of the job. This is **ephemeral** execution. It does not provide durable VM identity, deployed apps, screenshots, model-generated UI, live leads, or hosted preview URLs.
- The Rivet process runs only on the Sprite. It is **not** running as a Vercel function. Do not expose the local Rivet actor engine without per-tenant auth; the client integration currently exists for trusted server-side calls only.
- For a durable production agentOS VM with expiring preview URLs, provision a Rivet Cloud agentOS project and configure `RIVET_NAMESPACE` and `RIVET_TOKEN` (or self-host the supported prebuilt agentOS actor). No cloud credentials are currently configured. See https://rivet.dev/agentos/docs/quickstart-hosted/ .
- `npm run agentos:smoke` verifies a standalone VM; `npm run agentos:actor-check` verifies the Rivet actor invokes the VM.

### Release security gate
Following agentOS installation, a production-only npm audit reported **10 high, 10 moderate, 10 low** dependency findings. High findings include transitive PI agent and proxy/zip dependencies. They have **not** been remediated. An automated audit fix dry run failed due to Sprite npm's remote package fetch restriction. Do not promote this release into a public production system until dependency, auth, sandbox policies, rate limits and exposure reviews have been completed.

### Vercel and Convex deployment status
- Vercel CLI 65.9.0 installed globally and linked into `~/.local/bin/vercel` on Sprite.
- Vercel project `prospect-studio` was created in `johnnyc` team and Vercel SSO protection enabled; frontend was not published in the absence of a reachable authenticated backend.
- Convex is still on a local anonymous backend. A real Convex Cloud account sign-in/authorization and cloud deploy is necessary for Vercel to reach business data.

### Verified Preview UI and Convex persistence
- Studio cards show **Build static preview** for an approved concept; the protected Sprite backend calls the matching Rivet prospect actor, which executes the output template through agentOS Core. The generated HTML, checksum and build timestamp are stored on the Convex concept record; the preview is opened only through a sandboxed iframe.
- The route `POST /api/agentos/build` is deliberately disabled unless `AGENTOS_PREVIEWS_ENABLED=1` and `RIVET_ENDPOINT=http://127.0.0.1:6420` (private Sprite only). Do not enable this route on Vercel. It only reads approved concepts from Convex, not arbitrary code/commands from clients.
- E2E verification performed against the Sprite HTTP service: create QA record, reject early/unapproved build, advance stages, approve concept, build via agentOS actor, persist verified escaped HTML, enforce idempotency, reject publication. QA record and test cleanup mutation removed after success.

## Stitch and Pi Durable architecture (November 2026)
- Google Stitch client SDK `@google/stitch-sdk@0.3.5` and CLI `@google/stitch@0.12.1` are installed. The Stitch CLI reports `authenticated:false`: `STITCH_API_KEY` is required to invoke remote screen generation. This is design generation only, not a production deployment or verified dynamic site.
- Pi Durable `@rivet-dev/pi@0.5.4`, `@earendil-works/pi-durable@1.4.0` and the Rivet sandbox adapter `@rivet-dev/sandbox-adapter@0.5.4` are installed. Pi has been isolated in the `prospect-pi-durable` Sprite service (ESM entry `src/actors/pi-start.mts`) because the existing actor's CJS tsx entry cannot import the ESM-only Chord package.
- Both actor registries are reachable through the Sprite's local Rivet engine at `http://127.0.0.1:6420`; the Pi service has a separate OS process but shares the local engine endpoint. The `durableDesignAgent` readiness action has been called through the Rivet SDK and returned a valid response.
- The intended relationship is: Convex = authoritative business/audit records; Rivet Pi Durable = agent conversation and tool-step persistence in actor SQLite; agentOS = isolated filesystem and shell through `agentOSProvider()`; Stitch = optional design generation; Vercel = application/site deployment. These are complementary systems, not substitute databases.
- A full Pi Durable model prompt, crash mid-tool replay, sandbox reconnect, site generation, and production delivery have **not been verified**, because no model API key is present and public authorization is not implemented. The actor is intentionally **not accessible from the Next.js UI or an unauthenticated API**; use `npm run pi:readiness` privately on the Sprite.
- Production blockers: user authentication and scoped actor access; real model credential; durable backend/hosting rather than local anonymous Convex; human approval; idempotent side-effect tasks; audit and dependency remediation. The npm audit count grew after the added agent packages; no claim of production safety is made.

## Managed Convex Cloud deployments (2026-11-01)
- Project: `johnny-cage/prospect-studio`, dashboard: https://dashboard.convex.dev/t/johnny-cage/prospect-studio
- Development: `gregarious-ibis-329`, https://gregarious-ibis-329.convex.cloud
- Production: `rightful-elk-426`, https://rightful-elk-426.convex.cloud
- Both dev and production successfully received the schema, functions, indexes and all registered components. `FIRECRAWL_API_KEY` is deliberately set to a disabled sentinel in both deployments until a real key is configured; `convex/research.ts` rejects disabled credentials.
- The backend enforces `owner()` on its sensitive queries/mutations. With `CONVEX_PILOT_MODE` unset in Cloud and auth not yet configured, requests are rejected (`Authentication required`), **not operational for public client users**. Do not set `CONVEX_PILOT_MODE=1` on Cloud to bypass this. Implement Convex Auth or another verified provider, and propagate identity from the Next.js routes, before enabling production write operations.
- Local Sprite's `.env.local` intentionally retains the anonymous local Convex endpoint at `127.0.0.1:3210` for the access-controlled pilot. The cloud dev configuration is retained in ignored `.env.convex-cloud` and can be targeted with `npx convex dev --env-file .env.convex-cloud --once`; production deploy can be targeted with `npx convex deploy --env-file .env.convex-cloud` with proper authorization.
- The existing `prospect-studio` Vercel project `prj_XH2QAg2HS0zmkiq6va7gwaLnkfx2` has `NEXT_PUBLIC_CONVEX_URL` configured for production and previews respectively; **no client deployment was completed in this step**. It also requires authenticated Next.js API forwarding, approval policies, dependency remediation and an approved source deployment.

## Prospect Autopilot (November 2026)

The owner-authenticated **Autopilot** workspace runs a bounded Firecrawl discovery/search and extraction of public business pages for a selected trade and city, deduplicates company sites, stores source citations, qualifies and scores evidence, and sorts the cohort. Automatic website demos are allowed only for the best `floor(qualified, active cohort / 10)` businesses (minimum ten qualified for one demo). Convex rechecks eligibility when a demo is prepared and when its verified HTML artifact is persisted. A successful private Vercel Sandbox build creates an outreach **draft**, never a sent email. No claims about companies are fabricated from missing research.

The UI offers an explicit daily automation checkbox. Enabled owner campaigns are scheduled by `vercel.json` at `0 13 * * *` (UTC). Daily execution processes at most one due campaign and attempts at most one new sandbox demo, with Firecrawl rate limits; repeated cron deliveries cannot reserve the same campaign twice within 23 hours. The cron endpoint uses an encrypted `CRON_SECRET` matched by a Convex service secret. No scheduled search happens before an authenticated owner enables a campaign. An unsuccessful cron/sandbox invocation is recorded for operator review; outbound sending and external site publishing remain disabled.

AgentMail's live marketplace currently lists 48 services and 44 associated accounts. Account access is **not** equivalent to a provisioned application API key. Firecrawl is the only currently wired discovery data provider. Optional relevant providers to evaluate: Keenable and Context.dev (independent search/crawl corroboration); TinyFish and Notte (browser workflows for dynamic pages); Sixtyfour and Orange Slice (company enrichment and qualification); SuperSend (outreach sequencing after explicit approval); Retrace (agent observability); Supermemory (research continuity). The client lists these accurately as not configured unless credentials and API integration are separately verified. Avoid connecting unrelated marketplace services or incurring unapproved paid subscriptions.

For deployment: provision Vercel `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `SANDBOX_PREVIEWS_ENABLED=1`, `CRON_SECRET`. Provision matching `AUTOPILOT_SERVICE_SECRET` in Convex production. Maintain Vercel SSO and Better Auth protection. Activation is required for the owner before any user-initiated campaign can run. For operations, inspect the Vercel function logs and Convex campaign/activity tables, and review Firecrawl credits before raising daily batch limits.

### Convex component audit and integration boundaries

The existing `convex/convex.config.ts` already registers **Better Auth, Agent, Rate Limiter, Aggregate, Action Cache, Geospatial, Firecrawl, AgentMail, and Workpool**. Registration is not proof of feature adoption. Firecrawl is actually used through its component in `convex/research.ts`; the batch discovery workflow in `convex/autopilot.ts` currently uses Firecrawl's direct v2 Search API. AgentMail's component is used for authorized inbound message reads in `convex/email.ts`; outbound sending is intentionally disabled. The Aggregate, Workpool, Agent, Action Cache, and Geospatial registrations should not be described as powering the entire autopilot unless the corresponding call sites are verified.

Candidate additions from the Convex directory: **Context.dev** for company branding and independent research, **Exa** for search corroboration, **Convex MCP** for scoped agent operations, and **Langfuse/Evalbench** for quality measurement. These require separate API credential, security, maintenance, and billing checks. **Durable Agents** overlaps with the already running Rivet/Pi Durable agent service; avoid two independent orchestrators until there is a demonstrated gap. **Static Hosting** overlaps with Vercel demo deployment and Convex file storage; evaluate costs before adopting. Browser Use/Stagehand are fallbacks for dynamic sites, not replacements for Firecrawl on every prospect. Do not enable calling, mass emailing, or external demo publishing without an explicit owner approval workflow.

The daily campaign opt-in checkbox defaults **off**. A user must deliberately enable daily paid research, and the backend records the choice. The current UI cannot infer a previously enabled schedule on page load; verify persisted schedules in Convex before relying on that control as a status indicator.
