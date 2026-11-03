<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cloud Agent environment

- Use npm 11.6.2 through `corepack npm`. The lockfile is installed with `corepack npm ci`.
- Local Convex is http://127.0.0.1:3210. The Next.js app is http://localhost:3000. Sign-in uses that origin; 127.0.0.1 is a different origin.
- `.env.local` selects the local deployment `anonymous:anonymous-workspace`, linked to Convex project `prospect-studio` on team `johnny-cage`. `npx convex dev` pushes there. Do not run `npx convex deploy` or `npx vercel deploy --prod` unless Johnny asks.
- `GET /api/health` is the liveness check. `GET /api/ready` returns 503 on this local deployment because it only accepts a `*.convex.cloud` URL. Anonymous `GET /api/prospects` returns 401.
- Convex CLI is logged in as team `johnny-cage`. Vercel CLI is logged in as `johnnyc-9164`. A logged-in `npx convex dev` with no `.env.local` targets cloud dev; keep `.env.local`, or pass `--dev-deployment local`.
- The local deployment's `FIRECRAWL_API_KEY` is the placeholder `disabled-local`. Research, email, and Maps stay off until real keys are set on that deployment.
- Rivet is a separate process on port 6420. The workspace shows "Engine offline" until it is started. Prospect create and sign-in do not need it.
- Local UI credentials are only on this machine: `~/.prospect-studio-dev-password` and `~/.prospect-studio-activation-code`. Do not copy them to a cloud deployment or into chat.
