# Runtime topology

Where each part of Prospect Studio runs. Updated 2026-11-03.

| Role | Where | Notes |
|---|---|---|
| App, API routes, cron | Vercel (`prospect-studio`) | Hobby plan: 300 s per request, daily cron only |
| Data, run state, checkpoints | Convex (`rightful-elk-426` prod) | The whole sales loop runs here today |
| Actor engine | Rivet Cloud, namespace `johnny-cage-4xuq-production-i6cu` | Engine only; it hosts no code |
| Actors (code) | Vercel, `src/app/api/rivet/[...all]/route.ts` | Serverless pool; off until `RIVET_ENDPOINT` is set |
| Heavy / free compute | PC node (desktop Docker), `deploy/pc-node/compose.yaml` | Runner pool `pc-node`, connects out to Rivet Cloud |
| Model routing | OmniRoute on the PC, `desktop-3apdbkg.taildf3a4b.ts.net:20128` | Tailnet only, API key required |
| Rare code execution | `src/lib/execution.ts` | `vercel` (default, @vercel/sandbox, no network), `pc` (Sandbox Agent on :2468), `sprite` (Sprites API); Docker Cloud pending |

The Fly Sprite `prospect-studio` is an execution environment and the operator box (SSH to the PC, `gh`, `vercel`, `claude`, `codex`, `grok`, `tailscale`). It does not host the app or a production runner.

## Versions

`rivetkit` 3.0.1, `@rivet-dev/agentos` 0.4.6, `@rivet-dev/agentos-core` 0.4.7, `sandbox-agent` 0.5.5. The Rivet spike (desktop `prospect-rivet-spike/RESULTS.md`) proved agentOS library mode, network deny/allowlist, no secrets inside the VM and gapless streaming on rivetkit 3.0.0.

## Environment variables

| Name | Where | Purpose |
|---|---|---|
| `RIVET_ENDPOINT` | Vercel prod, PC node | `https://<namespace>:<sk_token>@api.rivet.dev`. Turns the actor route on and lets RivetKit verify `/start` calls |
| `RIVET_RUNNER` | PC node | `pc-node` |
| `OMNIROUTE_BASE_URL`, `OMNIROUTE_API_KEY`, `OMNIROUTE_MODEL` | Anywhere on the tailnet | Puts `omni:<model>` first in the model chain (`src/lib/llm.ts`). Unset in Convex cloud, which cannot reach the tailnet |
| `EXECUTION_PROVIDER` | Any runtime | `vercel`, `pc` or `sprite` |
| `SANDBOX_AGENT_PC_URL`, `SANDBOX_AGENT_PC_TOKEN` | PC node, Sprite | PC Sandbox Agent (`@sandbox-agent/cli` on :2468, tailnet) |
| `SPRITES_TOKEN`, `SPRITE_EXEC_NAME` | Any runtime | Sprite execution through the Sprites API (default Sprite `prospect-studio`) |

## Steps that need the owner

1. **Rivet dashboard, production namespace.** Point the `default` pool at Vercel: kind serverless, URL `https://prospect-studio-johnnyc.vercel.app/api/rivet`, request lifespan 270 s. Create a second pool `pc-node` of kind normal. Then set `RIVET_ENDPOINT` (secret token) on Vercel prod as a Sensitive variable. The namespace token on the Sprite gets 403 on `/runner-configs`, so this cannot be done from code.
2. **Fly.** Create a Sprites token and set `SPRITES_TOKEN` where Sprite execution is wanted.
3. **OmniRoute dashboard.** Create an API key, then set `OMNIROUTE_API_KEY` where models are called (PC node `pc-node.env`, the Sprite CLIs).
4. **Docker Cloud.** Approve the device code shown by the Sprite service `prospect-docker-cloud-oauth`, then add the Docker Cloud provider to `src/lib/execution.ts`.
5. **Rotate** the Rivet test-namespace token (`RIVET_SPIKE_ENDPOINT`, preview only) and recreate `CRON_SECRET` as a Sensitive Vercel variable.

## Checks

Execution smoke test (prints the result, never a token): `EXECUTION_PROVIDER=pc node --import tsx scripts/exec-smoke.mts`. Verified 2026-11-03 on `vercel` (2.2 s) and `pc` (0.3 s).

```sh
# Actor route is off until RIVET_ENDPOINT is set (expect 503)
curl -s -o /dev/null -w '%{http_code}\n' https://prospect-studio-johnnyc.vercel.app/api/rivet/metadata
# OmniRoute from any tailnet node (expect 401 without a key)
curl -s -o /dev/null -w '%{http_code}\n' http://desktop-3apdbkg.taildf3a4b.ts.net:20128/v1/models
# Rivet Cloud can reach the Vercel runner (after step 1)
curl -X POST "https://api.rivet.dev/runner-configs/serverless-health-check?namespace=<ns>" \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"url":"https://prospect-studio-johnnyc.vercel.app/api/rivet"}'
```
