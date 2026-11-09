#!/usr/bin/env node
/**
 * Prospect Studio agent auto-loop controller.
 *
 * Drives the Zod exec graph one node at a time under AGENTS.md:
 *   preflight → next/active → (optional claim) → emit work packet
 *
 * Modes:
 *   status                 Show active/ready/idle JSON
 *   packet                 Emit next work packet without claiming
 *   tick [--claim]         One iteration; with --claim, claim ready node
 *   arm-file               Write docs/AGENT_LOOP_STATE.json for outer orchestrators
 *
 * Outer agent (Cursor / Sprite) MUST still do the implementation.
 * This script never merges, never writes Convex prod, never skips human gates.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const mode = args[0] ?? "status";
const doClaim = args.includes("--claim");
const agentName =
  args.includes("--agent") ? args[args.indexOf("--agent") + 1] : "auto-loop";
const loop =
  args.includes("--loop") ? args[args.indexOf("--loop") + 1] : "loop1";

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    encoding: "utf8",
    cwd: root,
    ...opts,
  });
  return r;
}

function extractJson(text) {
  const lines = text.split(/\r?\n/);
  // Prefer a clean JSON document (object or array) spanning from first {/[ to matching end
  const startIdx = [...text].findIndex((ch, i) => {
    if (ch !== "{" && ch !== "[") return false;
    // must be start of line-ish (ignore npm banners)
    const prev = text.slice(Math.max(0, i - 1), i);
    return prev === "" || prev === "\n";
  });
  if (startIdx === -1) {
    // fallback: first { on any line that looks like JSON
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith("{") || t.startsWith("[")) {
        const from = text.indexOf(t);
        return JSON.parse(text.slice(from));
      }
    }
    throw new Error("no JSON found");
  }
  const slice = text.slice(startIdx);
  // Try progressively shorter suffixes from the end brace
  const endCandidates = [];
  for (let i = slice.length - 1; i >= 0; i--) {
    if (slice[i] === "}" || slice[i] === "]") endCandidates.push(i);
  }
  let lastErr;
  for (const end of endCandidates) {
    try {
      return JSON.parse(slice.slice(0, end + 1));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("JSON parse failed");
}

function npmGraph(...graphArgs) {
  // Call nested package CLI directly to avoid npm lifecycle noise when possible
  const cli = join(root, "graph", "src", "cli.ts");
  let r;
  if (existsSync(cli)) {
    r = run("npx", ["--yes", "tsx", cli, ...graphArgs], {
      env: { ...process.env, npm_config_loglevel: "error" },
    });
  } else {
    r = run("npm", ["--silent", "run", "graph", "--", ...graphArgs], {
      env: { ...process.env, npm_config_loglevel: "error" },
    });
  }
  const text = `${r.stdout || ""}\n${r.stderr || ""}`.trim();
  if (r.status !== 0) {
    return { ok: false, error: text || "graph failed", raw: r };
  }
  try {
    return { ok: true, data: extractJson(text) };
  } catch (e) {
    return { ok: false, error: String(e), text };
  }
}

function preflight() {
  const r = run("npm", ["run", "agent:preflight"]);
  const text = (r.stdout || "").trim();
  const start = text.lastIndexOf("{");
  let data = null;
  if (start !== -1) {
    try {
      data = JSON.parse(text.slice(start));
    } catch {
      data = null;
    }
  }
  return { ok: r.status === 0, data, text };
}

function buildPacket(node, claimed) {
  const prompt = npmGraph("prompt", node.id);
  return {
    ok: true,
    mode: "work",
    loop,
    nodeId: node.id,
    title: node.title,
    status: claimed ? "in_progress" : node.status,
    claimed,
    parallelOk: node.parallelOk ?? false,
    goal: node.goal,
    exitGate: node.exitGate,
    prompt: prompt.ok ? prompt.data : { error: prompt.error },
    harness: {
      mustRead: ["AGENTS.md", "docs/BASELINE.md", "docs/GIT_AND_DEPLOY.md"],
      convexWrites: "gregarious-ibis-329 only",
      mergeToMain: false,
      pushTarget: "fix/phase0-prospect-reconcile-20261107",
      whenFinished: [
        `npm run graph -- done ${node.id} --evidence "<proof>"`,
        "git push origin fix/phase0-prospect-reconcile-20261107",
        "npm run agent:loop -- tick   # next iteration",
      ],
    },
    stopConditions: [
      "Human gate required (merge #35, Convex prod, Vercel prod)",
      "QUARANTINE.md present in cwd",
      "preflight failed",
      "node.parallelOk false while another node is in_progress",
    ],
  };
}

function pickWork(next) {
  const active = next.active ?? [];
  const ready = next.ready ?? [];
  if (active.length) return { kind: "active", node: active[0] };
  if (ready.length) return { kind: "ready", node: ready[0] };
  return { kind: "idle" };
}

function tick() {
  const pf = preflight();
  if (!pf.ok) {
    return {
      ok: false,
      mode: "halt",
      reason: "preflight_failed",
      preflight: pf.data ?? pf.text,
    };
  }

  const nextRes = npmGraph("next", "--loop", loop);
  if (!nextRes.ok) {
    return { ok: false, mode: "halt", reason: "graph_next_failed", error: nextRes.error };
  }

  const pick = pickWork(nextRes.data);
  if (pick.kind === "idle") {
    return {
      ok: true,
      mode: "idle",
      loop,
      message: "No ready or active nodes. Loop complete for this lane or waiting on human.",
      next: nextRes.data,
    };
  }

  if (pick.kind === "active") {
    return buildPacket(pick.node, true);
  }

  // ready
  if (pick.node.parallelOk === false) {
    const activeOthers = (nextRes.data.active ?? []).filter((n) => n.id !== pick.node.id);
    if (activeOthers.length) {
      return {
        ok: false,
        mode: "halt",
        reason: "serial_node_blocked_by_active",
        active: activeOthers,
        ready: pick.node,
      };
    }
  }

  let claimed = false;
  if (doClaim) {
    const claim = npmGraph("claim", pick.node.id, "--agent", agentName);
    if (!claim.ok) {
      return { ok: false, mode: "halt", reason: "claim_failed", error: claim.error };
    }
    claimed = true;
  }

  return buildPacket(pick.node, claimed);
}

function status() {
  const nextRes = npmGraph("next", "--loop", loop);
  const planRes = npmGraph("plan", "--loop", loop);
  return {
    ok: nextRes.ok,
    loop,
    next: nextRes.ok ? nextRes.data : { error: nextRes.error },
    plan: planRes.ok ? planRes.data : { error: planRes.error },
    tip: "npm run agent:loop -- tick --claim",
  };
}

function armFile(packet) {
  const path = join(root, "docs", "AGENT_LOOP_STATE.json");
  const body = {
    armedAt: new Date().toISOString(),
    controller: "scripts/agent-auto-loop.mjs",
    rules: "AGENTS.md",
    packet,
  };
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
  return { ok: true, path: "docs/AGENT_LOOP_STATE.json", packet };
}

let out;
switch (mode) {
  case "status":
    out = status();
    break;
  case "packet":
    out = tick(); // without --claim unless passed
    break;
  case "tick":
    out = tick();
    break;
  case "arm-file": {
    const packet = tick();
    out = armFile(packet);
    break;
  }
  default:
    out = {
      ok: false,
      error: `unknown mode ${mode}`,
      usage: "npm run agent:loop -- status|packet|tick [--claim] [--agent name] [--loop loop1]",
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(2);
}

console.log(JSON.stringify(out, null, 2));
process.exit(out.ok === false ? 1 : 0);
