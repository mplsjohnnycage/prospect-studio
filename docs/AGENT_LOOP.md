# Agent auto-loop

**Purpose:** Keep Prospect Studio building through the Zod graph without opening a second lane.

**Controller:** `npm run agent:loop` → `scripts/agent-auto-loop.mjs`  
**Binding rules:** `AGENTS.md` · `docs/GIT_AND_DEPLOY.md` · `docs/BASELINE.md`

---

## How it works

Each **tick** does one serial step:

1. `agent:preflight` (halt on failure)
2. `graph next --loop loop1`
3. Prefer an already `in_progress` node; else the first `ready` node
4. Optional `--claim` to mark `in_progress`
5. Emit a **work packet** (full `graph prompt` + harness constraints)

The outer agent (this Cloud Agent / Sprite worker) implements the packet, pushes to phase0, then:

```bash
npm run graph -- done <NODE> --evidence "<proof>"
npm run agent:loop -- tick --claim
```

Nodes with `parallelOk: false` (default for Loop 1) never run two implementation nodes at once.

---

## Commands

```bash
npm run agent:preflight
npm run agent:loop -- status
npm run agent:loop -- packet              # next work, no claim
npm run agent:loop -- tick --claim        # claim + emit packet
npm run agent:loop -- arm-file --claim    # write docs/AGENT_LOOP_STATE.json
```

---

## Hard stops (loop must halt)

- Merge PR #35 / push `main` / Convex prod / Vercel prod — **human only**
- `QUARANTINE.md` in cwd
- Preflight failure
- Exit gate evidence missing — do not `done`
- Inventing CommandKind / second FSM outside the current node’s scope

---

## Cursor timer (optional)

Cloud Agent may arm `subscribe_timer` named `prospect-studio-auto-loop` to re-enter this protocol when idle. Timer prompts must re-read `AGENTS.md` and run `tick --claim` on the phase0 lane only.
