# Ship checklist: agentic-loop -> production
Nothing here has been done. Every step needs Johnny's explicit go. Env values are never written here (names only).

## 1. Before merging
- [ ] `npm run verify` green on the branch (unit + Convex tests, lint, typecheck)
- [ ] Commits carry `Co-authored-by: Mpls Johnny Cage <mplsjohnnycage@users.noreply.github.com>` (Vercel Hobby blocks bot-only commits)
- [ ] Sprite checkpoint taken

## 2. Convex prod env (rightful-elk-426), names only
- [ ] AUTOPILOT_SERVICE_SECRET (required by the worker door; long random value)
- [ ] PROPOSAL_LINKS_ENABLED (optional; leave unset = off)
- [ ] ALLOW_PAID_SOURCES (leave unset = off). NOTE: with it off, Google Places "find businesses" now refuses; use free discovery. Set to `true` only if Johnny accepts Places spend.
- [ ] OUTREACH_POSTAL_ADDRESS (optional; default footer 13 5th Ave, Oakdale, MN 55128)
- [ ] Existing: GEMINI_API_KEY (model fallback for demos), AGENTMAIL_API_KEY, AGENTMAIL_INBOX_ID (sends stay manual)

## 3. Vercel env
- [ ] See docs/VERCEL_ENV_CHECKLIST.md (unset names, preview gaps, OMNIROUTE_API_KEY unreferenced)

## 4. Deploy order (needs Johnny's go)
- [ ] Push branch / merge to main
- [ ] `npx convex deploy --yes --typecheck enable` (schema change is additive: new indexes on agent tables, new `leaseId` field)
- [ ] `vercel deploy --prod --yes` (or git auto-deploy once the trailer fix applies)
- [ ] Smoke: app 200, health:ping, /optout GET 200, /agent/claim without header -> 401

## 5. Allowlist (Settings > Agent loop)
Worker names are no longer trusted by prefix. Add:
- [ ] `desktop:3apdbkg` (Tier 1, DESKTOP-3APDBKG)
- [ ] `sprite:prospect` (fallback; claims only when the desktop heartbeat is over 75 s old)
- Outside agents: none by default.

## 6. Worker update (desktop and Sprite)
- [ ] Pull the new branch and `npm ci`: the protocol changed (lease token, 90 s lease renewed every 20 s, 3 attempts, HTTP door).
- [ ] `.env.worker` (never committed): CONVEX_URL, AUTOPILOT_SERVICE_SECRET, OWNER_ID; optional CONVEX_SITE_URL (defaults to the .convex.site twin of CONVEX_URL); AGENT_LEGACY_ARGS=1 only if the HTTP door is unreachable (old mutation path).
- [ ] Start: `powershell -ExecutionPolicy Bypass -File .\scripts\desktop\start-agent-worker.ps1`
- [ ] Old workers from before ceafa79 will be rejected (no leaseId). Stop them first.

## 7. Turn-on
- [ ] Kill switch stays ON (paused) after deploy. Johnny unpauses in Settings.
- [ ] All stages at L1. Build goes to L2 only after the eval passes and Johnny's 4/5 rating.
- [ ] Caps: 10 demos, 40 drafts per day (reset at midnight America/Chicago).
- [ ] Sends and prices remain manual.
