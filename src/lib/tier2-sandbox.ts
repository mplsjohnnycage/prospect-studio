// Tier 2: full environment (git, npm, builds, Playwright) in a Docker sandbox.
// Image: prospect-sandbox:local (network-less, per the desktop Docker worker plan). Control: the sandbox-agent container
// on 127.0.0.1:2468 is probed first; the matrix marks sandbox-agent dev-only, so its session API is not relied on yet and
// the run itself goes through `docker run --network none` with memory/CPU/pids/time caps. Never runs on the host.
import {execFile} from "node:child_process";
import {promisify} from "node:util";

export type SandboxCaps = { memory?: string; cpus?: string; pids?: number; timeoutMs?: number };
export const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE ?? "prospect-sandbox:local";
export const SANDBOX_AGENT_URL = process.env.SANDBOX_AGENT_URL ?? "http://127.0.0.1:2468";

/** Docker args for one isolated run. Pure, so it is unit tested. */
export function sandboxArgs(cmd: string[], caps: SandboxCaps = {}, image = SANDBOX_IMAGE): string[] {
  if (!cmd.length) throw Error("empty sandbox command");
  return ["run", "--rm", "--network", "none", "--read-only", "--tmpfs", "/tmp:size=256m", "--tmpfs", "/work:size=512m", "-w", "/work",
    "--memory", caps.memory ?? "768m", "--cpus", caps.cpus ?? "1", "--pids-limit", String(caps.pids ?? 256),
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges", image, ...cmd];
}

export async function sandboxAgentUp(url = SANDBOX_AGENT_URL): Promise<boolean> {
  try { const r = await fetch(url, {signal: AbortSignal.timeout(1500)}); return r.status < 500; } catch { return false; }
}

export async function runInSandbox(cmd: string[], caps: SandboxCaps = {}): Promise<{stdout: string; agentUp: boolean}> {
  const agentUp = await sandboxAgentUp();
  const {stdout} = await promisify(execFile)("docker", sandboxArgs(cmd, caps), {timeout: caps.timeoutMs ?? 10 * 60_000, maxBuffer: 4 * 1024 * 1024});
  return {stdout: stdout.slice(-20_000), agentUp};
}
