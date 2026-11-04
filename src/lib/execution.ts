// Rare code execution, behind one interface. Every provider is a Sandbox Agent server:
//   vercel  a fresh Vercel Sandbox per job (default; nothing to keep running)
//   pc      the PC node's always-on Sandbox Agent (tailnet, Docker on the desktop)
//   sprite  a Sandbox Agent server on the Fly Sprite (persistent filesystem)
// Docker Cloud Sandboxes join the same list once their OAuth device login is approved.
// The provider used is returned with every result so runs can be logged and compared.
// sandbox-agent is ESM-only, so it is loaded on first use rather than at import time.
import type {SandboxAgent} from "sandbox-agent";

export type ExecProvider = "vercel" | "pc" | "sprite";
export const EXEC_PROVIDERS: readonly ExecProvider[] = ["vercel", "pc", "sprite"];

export type ExecJob = {
  command: string;
  args?: string[];
  /** Files written before the command runs, relative to the sandbox working directory. */
  files?: {path: string; content: string}[];
};

export type ExecResult = {provider: ExecProvider; exitCode: number | null; stdout: string; stderr: string; ms: number};

type Env = Record<string, string | undefined>;

/** EXECUTION_PROVIDER picks the default; anything unknown falls back to vercel. */
export function pickProvider(env: Env = process.env): ExecProvider {
  const v = env.EXECUTION_PROVIDER?.trim().toLowerCase();
  return (EXEC_PROVIDERS as readonly string[]).includes(v ?? "") ? (v as ExecProvider) : "vercel";
}

/** Endpoint of an always-on Sandbox Agent server (pc or sprite), or null when not configured. */
export function endpointFor(provider: Exclude<ExecProvider, "vercel">, env: Env = process.env): {baseUrl: string; token: string} | null {
  const key = provider.toUpperCase();
  const baseUrl = env[`SANDBOX_AGENT_${key}_URL`]?.trim();
  const token = env[`SANDBOX_AGENT_${key}_TOKEN`]?.trim();
  if (!baseUrl || !token) return null;
  const u = new URL(baseUrl);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`SANDBOX_AGENT_${key}_URL must be http or https`);
  return {baseUrl: u.origin, token};
}

/** Providers that can run a job in this runtime, in fallback order. */
export function availableProviders(env: Env = process.env): ExecProvider[] {
  const out: ExecProvider[] = [];
  if (env.VERCEL === "1" || env.VERCEL_OIDC_TOKEN || env.VERCEL_TOKEN) out.push("vercel");
  if (endpointFor("pc", env)) out.push("pc");
  if (endpointFor("sprite", env)) out.push("sprite");
  return out;
}

async function open(provider: ExecProvider, env: Env): Promise<{sdk: SandboxAgent; ephemeral: boolean}> {
  const {SandboxAgent} = await import("sandbox-agent");
  if (provider === "vercel") {
    const {vercel} = await import("sandbox-agent/vercel");
    return {sdk: await SandboxAgent.start({sandbox: vercel({create: {runtime: "node24"}})}), ephemeral: true};
  }
  const ep = endpointFor(provider, env);
  if (!ep) throw new Error(`Sandbox Agent for "${provider}" is not configured (SANDBOX_AGENT_${provider.toUpperCase()}_URL/_TOKEN)`);
  return {sdk: await SandboxAgent.connect({baseUrl: ep.baseUrl, token: ep.token}), ephemeral: false};
}

/** Runs one job on one provider. Ephemeral sandboxes are always destroyed afterwards. */
export async function runJob(job: ExecJob, provider: ExecProvider = pickProvider(), env: Env = process.env): Promise<ExecResult> {
  if (!job.command || /[\0\n]/.test(job.command)) throw new Error("Invalid command");
  const started = Date.now();
  const {sdk, ephemeral} = await open(provider, env);
  try {
    for (const f of job.files ?? []) {
      if (f.path.startsWith("/") || f.path.split("/").includes("..")) throw new Error(`Unsafe file path: ${f.path}`);
      await sdk.writeFsFile({path: f.path}, f.content);
    }
    const r = await sdk.runProcess({command: job.command, args: job.args ?? []});
    return {provider, exitCode: r.exitCode ?? null, stdout: r.stdout ?? "", stderr: r.stderr ?? "", ms: Date.now() - started};
  } finally {
    if (ephemeral) await sdk.destroySandbox().catch(() => {});
    else await sdk.dispose().catch(() => {});
  }
}

/** Tries providers in order until one runs the job; the result names the one that did. */
export async function runWithFallback(job: ExecJob, order: ExecProvider[] = availableProviders(), env: Env = process.env): Promise<ExecResult> {
  if (order.length === 0) throw new Error("No execution provider is configured in this runtime");
  const errors: string[] = [];
  for (const p of order) {
    try { return await runJob(job, p, env); }
    catch (e) { errors.push(`${p}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)); }
  }
  throw new Error("Every execution provider failed. " + errors.join(" | "));
}
