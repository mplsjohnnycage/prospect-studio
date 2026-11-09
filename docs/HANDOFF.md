# Prospect Studio — handoff (2026-11-02)

Paste this file into a new chat to continue. Owner: Johnny ("Found It. Fix It.", solo operator). Goal: the app finds local trades businesses, builds a custom demo site for each, sends outreach that Johnny approves, handles replies, books calls and closes deals.

## Where things live
- **Code:** github.com/mplsjohnnycage/prospect-studio. `main` = what's in production (commit `046e11e`). Newer work is on branch `feat/production-build-leases-20261102` (see "Not yet in production").
- **Dev box:** Fly Sprite `prospect-studio`, repo at `~/prospect-studio`. The CLIs (Convex, Vercel as `johnnyc-9164`, gh) are logged in there. The Sprites exec API sometimes returns a 502 or transport error; retry it.
- **Frontend:** Vercel project `prospect-studio` (team `johnnyc`, **Pro** plan), https://prospect-studio-johnnyc.vercel.app. **Vercel SSO is currently off** (older handoff text said it protected the app); Better Auth / Convex session still gate the product. Deploy with `npx vercel deploy --prod --yes` from the sprite.
- **Backend:** Convex. Dev = `gregarious-ibis-329` (`npx convex dev --once --typecheck enable`). Prod = `rightful-elk-426` (`npx convex deploy --yes --typecheck enable`).
- **Login:** the email is fixed as `johnnyc@agentmail.to`. The first time, use "Activate" with the one-time code from the 11/1 email titled "Prospect Studio — private account activation" (in the johnnyc@agentmail.to inbox), then choose a password. Password reset isn't built yet.

## Hard rules (Johnny's decisions)
- **Never auto-send.** Agents and crons only draft. Johnny approves and sends every email, follow-up and reply with two-step buttons in the Outreach tab. No agent or MCP tool can send, approve, or mark a deal won or lost.
- Outreach comes from the brand "Found It. Fix It." via johnnyc@agentmail.to. CAN-SPAM footer: 13 5th Ave, Oakdale, MN 55128, plus an opt-out line. Opt-out replies are added to the do-not-contact list automatically.
- **Closing:** book a 15-minute call, then Johnny quotes. Prices never go in emails or replies, only on proposal links that Johnny sends.
- **Demos use sourced facts only.** A validator rejects any phone number, email or rating that wasn't verified.
- **Production deploys need Johnny's explicit OK.** The auto-mode classifier blocks prod reads and copying secrets from dev to prod; ask Johnny instead.
- Secrets stay in Convex env vars and are never echoed. Keys pasted in chat should be rotated: Gemini, AgentMail, Stitch.

## Production (live at `046e11e`)
- Sales loop: Gemini demo generation, private `/demo/<token>` link (sandbox CSP, noindex), prepare → approve → send, reply polling every 5 minutes with suggested replies, mark won/lost, do-not-contact list.
- **In-app agent:** the Agent button in the top bar. Gemini function-calling loop (`src/lib/agent-loop.ts`, `convex/assistant.ts`) over the shared tools in `convex/agentTools.ts`.
- **MCP for outside agents:** `@convex-dev/mcp` 0.1.0-alpha.7, `convex/mcp.ts`, endpoint `https://<deployment>.convex.site/mcp`. OAuth consent at `/connect`. API keys under Settings → Outside agents. Scopes are `pipeline:read` and `pipeline:write`.
- **Scrape imports:** CSV/JSON from Apify, Outscraper or spreadsheets (`convex/imports.ts`, `src/lib/prospect-import.ts`, ⌘K → Import). Also available as the `import_prospects` tool.
- **Prod env vars Johnny still has to add** in the Convex dashboard (rightful-elk-426): `GEMINI_API_KEY`, `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`, `OUTREACH_POSTAL_ADDRESS`, `OUTREACH_SENDER_NAME`. Settings shows which are missing once the next deploy is out.

## Not yet in production (branch, verified on dev)
1. **Better demos** (`src/lib/design-presets.ts`, `convex/demos.ts` generateWorker):
   - 8 hand-tuned design systems picked by trade, using the brand color when one was found.
   - An art-director review returns a 1–10 score and a list of fixes; if the score is under 8.5, one fix pass runs. Stored as `qualityScore`, `reviewNotes` and `preset`, shown in the Outreach tab.
   - When the models are overloaded, the worker backs off, and if all models still fail it retries automatically in 5 minutes (up to 2 times).
   - The share link stays the same and always serves the newest approved version.
   - Optional OpenCode Zen fallback models (`zen:deepseek-v4-flash-free`, `zen:mimo-v2.5-free`) via `src/lib/llm.ts` when `OPENCODE_API_KEY` is set.
   - **To check:** the review step was verified standalone (score 7.5, 6 fixes, 12s), but in the background worker the score wasn't saved on one run. Logs are added; run `npx convex logs --history 100 | grep "demo review"`.
2. **Hot-lead alerts** (`convex/alerts.ts`): an email to `ALERT_EMAIL` (or `OWNER_EMAIL`) when a prospect first opens their demo, or comes back after 24 hours. Link scanners and bots aren't counted (`isHumanView`). Johnny's own previews use `?preview=1`.
3. **Book-a-call** (`/book/<token>`, `convex/bookings.ts`, `src/lib/booking.ts`): a floating button on every demo. The form has a honeypot and a rate limit. A request moves the prospect to Convert, sends an alert and cancels follow-ups. If `OUTREACH_BOOKING_URL` is set, the button links there instead.
4. **Follow-ups** (`convex/followups.ts`): a daily cron drafts follow-up 1 on day 3 and follow-up 2 four days after #1 is sent. Each needs Johnny's approval and goes out as a reply in the same thread. A reply or call request cancels them.
5. **Price list and proposals** (`convex/pricing.ts`, `src/lib/pricing.ts`, `src/components/pricing-ui.tsx`):
   - Settings has a price list editor. The default packages, Starter $1,200 + $49/mo, Growth $2,500 + $99/mo and Pro $4,500 + $149/mo, are based on 2026 market research and are editable.
   - Each package can have an optional deposit payment link.
   - The proposal page at `/proposal/<token>` has a Choose button per package and alerts Johnny when it's viewed and when a package is chosen.
   - New agent tools: `create_proposal` and `price_list`.
6. **Google Places discovery** (`convex/places.ts`, `src/lib/places.ts`): when `GOOGLE_MAPS_API_KEY` is set, `discoveryCore` uses Places Text Search (real, operating businesses with phone, website, rating, reviews and coordinates) instead of Firecrawl search.
7. **Settings shows live integration status** (`health.config`).
8. **Agent summary** now includes hot leads, call requests and follow-ups waiting. The system prompt sets priorities: calls first, then hot leads, then replies.

Tests: 86 unit tests (`npm run verify` runs tests + lint + typecheck), all passing. **To ship:** commit, get Johnny's OK, merge to main, `npx convex deploy --yes --typecheck enable`, then `npx vercel deploy --prod --yes`.

## Testing on dev
- Identity: `--identity '{"subject":"e2e-test-owner","issuer":"e2e"}'`.
- Test prospects: Test Import Painters LLC `k17be24rfrd61q0gaws8pbfkj98hekvg` (share token `FgrINvDf-DtAs-S4FScj2_i51wMH9A3M`, one test booking), North Star Painting `k1758x4023221rz43g9134v88s8hfmft` (won), Lakeside Roofing `k17f9ycmt7p9hnhn7htcw1vtb58hf1za` (opted out).
- MCP key: `npx convex run mcp:createApiKeyForUser '{"userId":"e2e-test-owner"}'`. Revoke it afterwards with `mcp:revokeConnection` plus the identity.
- The free Gemini tier often returns 503 (high demand). That's expected; it's why the fallback and auto-retry exist.

## Next steps (Johnny asked for all of this)
1. Get the OK and deploy the branch to prod; Johnny adds the prod env vars.
2. Keys to request: `GOOGLE_MAPS_API_KEY` (Places), `OPENCODE_API_KEY` (Zen), optionally `ALERT_EMAIL` (his main email) and `OUTREACH_BOOKING_URL`.
3. Browser enrichment with agent-browser in a Vercel Sandbox (the repo already has `@vercel/sandbox`): website screenshots on phone and desktop, Facebook page, BBB, Meta Ad Library and Google Ads Transparency (running ads = has a budget). Google Maps, Yelp and Facebook block bots and forbid scraping; use the Places API for listings.
4. Visual QA: screenshot the demo with the same sandbox and send it to Gemini vision for grading, like vercel-labs/fx0 (design.md style guides + a screenshot self-check; Apache-2.0).
5. Rivet + OpenCode via the Sandbox Agent API for the paid "build the real site" step after a win. Runs on the Sprite or a Vercel Sandbox; Convex stores transcripts. Free Zen models: DeepSeek V4 Flash (limited time); GLM 5.3 needs OpenCode Go ($10/mo).
6. Smaller items:
   - password reset
   - connect GitHub to Vercel for auto-deploys
   - the Better Auth advisory (see `docs/DEPLOYMENT_STATUS.md`)
   - the Stitch SDK test failed at `get_screen` with "invalid argument"; low priority
