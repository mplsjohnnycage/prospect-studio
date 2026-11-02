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

## Sales loop (added 2026-11-02)

End to end, from the prospect inspector's Outreach tab:

1. **AI demo**: `demos.generate` builds a custom one-page site with Gemini from the prospect's saved source pages only (requires at least one source). Runs in the background (`demos.generateWorker`), checked by `validateDemoHtml` (no invented phone/email/rating, no external scripts or images, banned default fonts, at least 5 sections, inline interactivity), then labeled DEMO with noindex. Model order: `DEMO_MODELS` env, else gemini-3.5-flash, gemini-3.8-flash, gemini-flash-latest (Pro models return 429 on the current free-tier key).
2. **Private link**: `demos.share` issues an unguessable token; `GET /demo/<token>` on the Convex site URL serves the page with a sandbox CSP, noindex and no-store, counts views, and stops serving if the prospect is blocked.
3. **First email**: `sales.prepareEmail` drafts the email with the demo link, sender `OUTREACH_SENDER_NAME`, mailing address `OUTREACH_POSTAL_ADDRESS` and an opt-out line. The owner approves (`approve_outreach`), then sends with one more click (`sales.send`). Sending goes through the AgentMail REST API from `AGENTMAIL_INBOX_ID` (johnnyc@agentmail.to, display name "Johnny · Found It. Fix It."), 40 sends per day, blocked for suppressed or blocked prospects and for drafts missing the address footer.
4. **Replies**: cron `poll prospect replies` (every 5 min) reads AgentMail threads labeled `prospect-studio`, stores new inbound messages (`replies`), auto-suppresses opt-outs, moves interested prospects to Convert, and drafts a suggested reply with Gemini (`replyDrafts`, never states prices). The owner edits and sends (`sales.sendReply`).
5. **Close**: `sales.markOutcome` records won (with amount) or lost.

Secrets set on both deployments: `GEMINI_API_KEY`, `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`, `OUTREACH_POSTAL_ADDRESS`, `OUTREACH_SENDER_NAME`. Optional: `OUTREACH_BOOKING_URL` (offered in suggested replies), `DEMO_MODELS`, `REPLY_MODELS`.

Verified on Convex dev with a test owner identity and the owner's own inbox as recipient: demo generated (gemini-3.5-flash, 57 KB, checks passed), link served with correct headers and 404 for bad tokens, send blocked before approval, email delivered and thread recorded, reply ingested once (duplicate ignored), Gemini suggested reply without prices, reply sent, deal marked won, opt-out reply suppressed and blocked the prospect, live reply poll ran against AgentMail.

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

## Agent, MCP and imports (added 2026-11-02)

- **In-app agent** (`convex/assistant.ts` `chat`, `src/components/agent-panel.tsx`): Gemini function-calling loop (`src/lib/agent-loop.ts`) over the shared tools in `convex/agentTools.ts`. Opens from the **Agent** button in the top bar. Conversation is stored in `assistantMessages` with the tool steps. Models: `AGENT_MODELS` env (comma list) then gemini-3.5-flash, gemini-flash-latest, gemini-3.8-flash.
- **MCP server** (`convex/mcp.ts`, `@convex-dev/mcp` 0.1.0-alpha.7): `https://<deployment>.convex.site/mcp`. OAuth 2.1 with the consent page at `SITE_URL/connect` (framing blocked), device flow for pasted-URL agents, and personal API keys from **Settings → Outside agents**. Scopes: `pipeline:read`, `pipeline:write`.
- **Tools (same for both):** pipeline_summary, find_prospects, get_prospect, list_replies, add_prospect, find_new_businesses (background), research_prospect, build_demo (background), get_demo_link, draft_first_email, draft_reply, import_prospects, add_to_do_not_contact. **No tool approves or sends email, sends replies, or marks deals won/lost.** Every tool acts as the verified owner; model-supplied ids are checked against that owner.
- **Imports** (`convex/imports.ts`, `src/lib/prospect-import.ts`, `src/components/import-panel.tsx`): CSV/TSV/JSON/JSONL from Apify Google Maps, Outscraper, extensions or spreadsheets. Dedupe by website and name+city, do-not-contact check, simple fit score (no website, reviews, rating, contact). A listing URL becomes a source so demos can use the imported facts.
- Verified on Convex dev with a test owner: MCP initialize, tools/list (13 tools), pipeline_summary, find_prospects, get_prospect, cross-owner/invalid id rejected, import with dedupe; in-app agent multi-step (find → get → build_demo).
