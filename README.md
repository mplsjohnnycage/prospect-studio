# Prospect Studio — Sprite development pilot

A running Next.js 16 application backed by local SQLite, with shadcn/ui, a local RivetKit actor registry, and Convex CLI/schema/component configuration. The local record store is temporary pilot architecture, **not** the intended managed Convex system of record.

## Runtime
- Sprite: `prospect-studio`
- App: `/home/sprite/prospect-studio`
- Next.js service: `prospect-web` on :3000
- Rivet service: `prospect-rivet` on :6420; local runtime, NOT cloud deployment
- `npx convex dev --once` requires an account login in this Sprite. Use authenticated Convex cloud, or explicitly initialize anonymous-local if choosing a temporary local backend.
- Firecrawl `FIRECRAWL_API_KEY`: unset. Research API reports 503 without it.
- AgentMail `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`: unset; organization has reached three inbox quota. Existing inboxes must not be repurposed without an explicit decision.
- Geospatial: `@convex-dev/geospatial` component registered in `convex/convex.config.ts`. Local radius-search functions implemented; coordinates are not guessed or fabricated.
- No automatic email sends, no auto publishing, and no automatic billing.
- **Security**: Owner-only Sprite access. Live `prospect-web` is loopback-only (`127.0.0.1:3000`). Product auth exists on Convex/Vercel paths; do NOT expose the Sprite web listener publicly.
- **Dependencies**: `npm audit` reports vulnerable transitive dependencies. Triage before any production exposure.

## Run
```bash
cd /home/sprite/prospect-studio
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
node --import tsx src/actors/start.ts
node --import tsx --test src/lib/*.test.ts
```

## API
`GET /api/health`; `GET/POST /api/prospects`; `GET/POST /api/prospects/:id`; `GET /api/activity`; `GET /api/actor-status`; `GET /api/providers`; `GET /api/mail`; `POST /api/research`; `GET /api/geo?lat=45&lon=-93&km=20`.

## Agent harness (mandatory)

Implementation agents **must** read [`AGENTS.md`](AGENTS.md) first, then run:

```bash
npm run agent:preflight
npm run graph -- next --loop loop1
npm run lifecycle -- loop1-path
npm run agent:loop -- tick --claim
```

Push/merge/deploy policy: [`docs/GIT_AND_DEPLOY.md`](docs/GIT_AND_DEPLOY.md). Agents never merge to `main` or prod-deploy without human OK.

Build lane: PR #35 / `fix/phase0-prospect-reconcile-20261107` / Convex dev only.
