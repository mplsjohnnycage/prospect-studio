// Rare code execution, behind one interface:
//   vercel  a fresh, network-denied Vercel Sandbox per job via @vercel/sandbox (default)
//   pc      the PC node's always-on Sandbox Agent server (tailnet, Docker on the desktop)
//   sprite  a Fly Sprite through the Sprites API (persistent filesystem; wakes on demand)
// Sandbox Agent's own Vercel provider is not used: it installs coding agents into every
// sandbox (about 850 MB and minutes) before a single command can run.
// Docker Cloud Sandboxes join the same list once their OAuth device login is approved.
// The provider used is returned with every result so runs can be logged and compared.
// sandbox-agent is ESM-only, so it is loaded on first use rather than at import time.
import type {SandboxAgent} from "sandbox-agent";

export type ExecProvider = "vercel" | "pc" | "sprite";
export const EXEC_PROVIDERS: readonly ExecProvider[] = ["vercel", "pc", "sprite"];

export type ExecJob = {
  command: string;
  args?: string[];
  /** Files written before the command runs, relative to the job's own working directory. */
  files?: {path: string; content: string}[];
  timeoutMs?: number;
};

export type ExecResult = {provider: ExecProvider; exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; ms: number};

type Env = Record<string, string | undefined>;

/** EXECUTION_PROVIDER picks the default; anything unknown falls back to vercel. */
export function pickProvider(env: Env = process.env): ExecProvider {
  const v = env.EXECUTION_PROVIDER?.trim().toLowerCase();
  return (EXEC_PROVIDERS as readonly string[]).includes(v ?? "") ? (v as ExecProvider) : "vercel";
}

/** Sprite settings: SPRITES_TOKEN plus the Sprite to run on (SPRITE_EXEC_NAME, default prospect-studio). */
export function spriteFor(env: Env = process.env): {token: string; name: string} | null {
  const token = env.SPRITES_TOKEN?.trim();
  if (!token) return null;
  const name = env.SPRITE_EXEC_NAME?.trim() || "prospect-studio";
  if (!/^[a-z0-9-]{1,63}$/.test(name)) throw new Error("SPRITE_EXEC_NAME is not a valid Sprite name");
  return {token, name};
}

/** Endpoint of an always-on Sandbox Agent server, or null when not configured. */
export function endpointFor(provider: "pc", env: Env = process.env): {baseUrl: string; token: string} | null {
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
  if (spriteFor(env)) out.push("sprite");
  return out;
}

function checkJob(job: ExecJob) {
  if (!job.command || /[\0\n]/.test(job.command)) throw new Error("Invalid command");
  for (const f of job.files ?? []) if (f.path.startsWith("/") || f.path.split("/").includes("..")) throw new Error(`Unsafe file path: ${f.path}`);
}

/** Vercel: a fresh sandbox per job, no network, stopped afterwards. */
async function runOnVercel(job: ExecJob, started: number): Promise<ExecResult> {
  const {Sandbox} = await import("@vercel/sandbox");
  const timeout = Math.min(job.timeoutMs ?? 120_000, 280_000);
  const sandbox = await Sandbox.create({persistent: false, timeout: timeout + 20_000, resources: {vcpus: 1}, networkPolicy: "deny-all"});
  try {
    const cwd = "/vercel/sandbox/job";
    if (job.files?.length) await sandbox.writeFiles(job.files.map(f => ({path: `${cwd}/${f.path}`, content: Buffer.from(f.content, "utf8")})));
    else await sandbox.runCommand({cmd: "mkdir", args: ["-p", cwd]});
    const r = await sandbox.runCommand({cmd: job.command, args: job.args ?? [], cwd, signal: AbortSignal.timeout(timeout)});
    return {provider: "vercel", exitCode: r.exitCode ?? null, stdout: (await r.stdout()).slice(0, 1_000_000), stderr: (await r.stderr()).slice(0, 1_000_000), timedOut: false, ms: Date.now() - started};
  } finally {
    await sandbox.stop().catch(() => {});
  }
}

/** Sprite: files and the command run in a fresh job directory on an existing Sprite. */
async function runOnSprite(job: ExecJob, started: number, env: Env): Promise<ExecResult> {
  const cfg = spriteFor(env);
  if (!cfg) throw new Error("Sprite execution is not configured (SPRITES_TOKEN)");
  const {SpritesClient, ExecError} = await import("@fly/sprites");
  const sprite = new SpritesClient(cfg.token).sprite(cfg.name);
  const cwd = `/home/sprite/prospect-jobs/${started}-${Math.random().toString(36).slice(2, 10)}`;
  const fs = sprite.filesystem(cwd);
  for (const f of job.files ?? []) await fs.writeFile(f.path, f.content);
  if (!job.files?.length) await sprite.execFile("mkdir", ["-p", cwd]);
  const text = (b: string | Buffer) => (typeof b === "string" ? b : b.toString("utf8")).slice(0, 1_000_000);
  try {
    const r = await sprite.execFile(job.command, job.args ?? [], {cwd, timeout: job.timeoutMs ?? 120_000, maxBuffer: 1_000_000});
    return {provider: "sprite", exitCode: r.exitCode, stdout: text(r.stdout), stderr: text(r.stderr), timedOut: false, ms: Date.now() - started};
  } catch (e) {
    if (e instanceof ExecError) return {provider: "sprite", exitCode: e.exitCode, stdout: text(e.stdout), stderr: text(e.stderr), timedOut: false, ms: Date.now() - started};
    if (e instanceof Error && /timed out/i.test(e.message)) return {provider: "sprite", exitCode: null, stdout: "", stderr: e.message, timedOut: true, ms: Date.now() - started};
    throw e;
  }
}

async function open(provider: "pc", env: Env): Promise<SandboxAgent> {
  const {SandboxAgent} = await import("sandbox-agent");
  const ep = endpointFor(provider, env);
  if (!ep) throw new Error(`Sandbox Agent for "${provider}" is not configured (SANDBOX_AGENT_${provider.toUpperCase()}_URL/_TOKEN)`);
  return SandboxAgent.connect({baseUrl: ep.baseUrl, token: ep.token});
}

/** Runs one job on one provider. Vercel sandboxes are always stopped afterwards. */
export async function runJob(job: ExecJob, provider: ExecProvider = pickProvider(), env: Env = process.env): Promise<ExecResult> {
  checkJob(job);
  const started = Date.now();
  if (provider === "vercel") return runOnVercel(job, started);
  if (provider === "sprite") return runOnSprite(job, started, env);
  const sdk = await open(provider, env);
  try {
    // Each job gets its own directory, so jobs on the shared PC server never collide.
    const jobDir = `prospect-jobs/${started}-${Math.random().toString(36).slice(2, 10)}`;
    let cwd: string | undefined;
    for (const f of job.files ?? []) {
      const w = await sdk.writeFsFile({path: `${jobDir}/${f.path}`}, f.content);
      cwd ??= w.path.slice(0, w.path.length - f.path.length).replace(/\/+$/, "");
    }
    const r = await sdk.runProcess({command: job.command, args: job.args ?? [], cwd, timeoutMs: job.timeoutMs ?? 120_000, maxOutputBytes: 1_000_000});
    return {provider, exitCode: r.exitCode ?? null, stdout: r.stdout ?? "", stderr: r.stderr ?? "", timedOut: r.timedOut, ms: Date.now() - started};
  } finally {
    await sdk.dispose().catch(() => {});
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
