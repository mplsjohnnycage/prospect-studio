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
