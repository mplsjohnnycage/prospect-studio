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
