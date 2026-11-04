# Vercel env checklist (names only, no values)
Source: /workspace/team/vercel-next-review.md (Nov 3 2026). Confirm each before adding; several may be leftovers from removed AgentOS/Pi code (edf0780).

## Referenced in src/ but not set in any Vercel environment
- [ ] AGENTMAIL_API_KEY
- [ ] AGENTMAIL_INBOX_ID
- [ ] AGENTOS_PREVIEWS_ENABLED (likely leftover)
- [ ] ANTHROPIC_API_KEY
- [ ] OPENAI_API_KEY
- [ ] OPENROUTER_API_KEY
- [ ] GEMINI_API_KEY
- [ ] FIRECRAWL_API_KEY
- [ ] PI_DURABLE_MODEL (likely leftover)
- [ ] RIVET_ENDPOINT

## Set in production but missing in preview
- [ ] CRON_SECRET
- [ ] SANDBOX_PREVIEWS_ENABLED

## Set but unreferenced in src/
- [ ] OMNIROUTE_API_KEY (remove or wire up)

## Convex deployment env (not Vercel), needed for the agent loop
- [ ] AUTOPILOT_SERVICE_SECRET (worker door)
- [ ] PROPOSAL_LINKS_ENABLED (optional, default off)

## Desktop worker (.env.worker on DESKTOP-3APDBKG, never committed)
- [ ] CONVEX_URL
- [ ] AUTOPILOT_SERVICE_SECRET
- [ ] OWNER_ID
- [ ] Register `desktop:3apdbkg` (and `sprite:prospect` for fallback) in Settings > Agent loop > allowlist; names are no longer trusted by prefix.
