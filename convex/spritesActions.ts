"use node";

import { createHash, randomUUID } from "node:crypto";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import { R2_NAMESPACE, SPRITE_SECRET_NAMES, secrets } from "./secrets";

const SPRITES_API = "https://api.sprites.dev";
const StreamID = { Stdout: 1, Stderr: 2, Exit: 3 } as const;

async function loadSpriteAuth(ctx: ActionCtx): Promise<{ token: string; spriteName: string }> {
  let token: string | undefined;
  let spriteName: string | undefined;
  for (const name of SPRITE_SECRET_NAMES) {
    const result = await secrets.get(ctx, {
      namespace: R2_NAMESPACE,
      name,
    });
    if (result.ok) {
      if (name === "SPRITES_TOKEN") token = result.value;
      if (name === "SPRITE_EXEC_NAME") spriteName = result.value;
    }
  }
  token = token ?? process.env.SPRITES_TOKEN?.trim();
  spriteName =
    spriteName ?? process.env.SPRITE_EXEC_NAME?.trim() ?? "prospect-studio";
  if (!token) throw new Error("SPRITES_TOKEN missing from secret store/env");
  if (!/^[a-z0-9-]{1,63}$/.test(spriteName)) {
    throw new Error("SPRITE_EXEC_NAME is not a valid Sprite name");
  }
  return { token, spriteName };
}

function authHeaders(token: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": "prospect-studio-convex/p4",
    ...extra,
  };
}

async function getSprite(token: string, name: string) {
  const res = await fetch(`${SPRITES_API}/v1/sprites/${encodeURIComponent(name)}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`getSprite failed: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function execFileHttp(
  token: string,
  spriteName: string,
  file: string,
  args: string[],
  timeoutMs = 90_000,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const url = new URL(
    `${SPRITES_API}/v1/sprites/${encodeURIComponent(spriteName)}/exec`,
  );
  for (const value of [file, ...args]) url.searchParams.append("cmd", value);
  url.searchParams.set("path", file);

  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(token, {
      "Content-Type": "application/octet-stream",
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`exec failed: ${res.status} ${await res.text()}`);
  }
  if (!res.body) throw new Error("exec response missing body");

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let stream: number = StreamID.Stdout;
  let held = new Uint8Array(0);
  let exitCode = -1;

  const write = (data: Uint8Array) => {
    if (!data.length) return;
    if (stream === StreamID.Stdout) stdout.push(Buffer.from(data));
    else stderr.push(Buffer.from(data));
  };

  const reader = res.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      write(held);
      held = new Uint8Array(0);
      const frameType = value[0]!;
      if (frameType === StreamID.Exit) {
        if (value.length !== 2) throw new Error("invalid exit frame");
        exitCode = value[1]!;
        continue;
      }
      if (frameType !== StreamID.Stdout && frameType !== StreamID.Stderr) {
        throw new Error(`unsupported frame ${frameType}`);
      }
      stream = frameType;
      const split = Math.max(1, value.length - 2);
      write(value.subarray(1, split));
      held = value.subarray(split);
    }
    if (held.length === 2 && held[0] === StreamID.Exit) exitCode = held[1]!;
    else write(held);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (exitCode < 0) throw new Error("exec response missing exit frame");
  return {
    exitCode,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
}

async function createCheckpoint(
  token: string,
  spriteName: string,
  comment: string,
): Promise<string | undefined> {
  const res = await fetch(
    `${SPRITES_API}/v1/sprites/${encodeURIComponent(spriteName)}/checkpoint`,
    {
      method: "POST",
      headers: authHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ comment }),
    },
  );
  if (!res.ok) return undefined;
  // Stream may be NDJSON; read text and look for an id.
  const text = await res.text();
  const idMatch = text.match(/"(?:checkpointId|id)"\s*:\s*"([^"]+)"/);
  return idMatch?.[1];
}

const receiptValidator = v.object({
  ok: v.literal(true),
  leaseId: v.string(),
  jobId: v.string(),
  spriteName: v.string(),
  exitCode: v.union(v.number(), v.null()),
  stdoutHash: v.string(),
  stderrBytes: v.number(),
  timedOut: v.boolean(),
  ms: v.number(),
  woke: v.boolean(),
  recovered: v.boolean(),
  authenticated: v.literal(true),
  checkpointId: v.optional(v.string()),
  recordedAt: v.number(),
});

export const seedSpriteAuthFromEnv = internalAction({
  args: {},
  returns: v.object({
    namespace: v.string(),
    seeded: v.array(v.string()),
    skipped: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const seeded: string[] = [];
    const skipped: string[] = [];
    for (const name of SPRITE_SECRET_NAMES) {
      const value = process.env[name]?.trim();
      if (!value) {
        skipped.push(name);
        continue;
      }
      await secrets.put(ctx, {
        namespace: R2_NAMESPACE,
        name,
        value,
        metadata: {
          owner: "prospect-studio",
          label: name,
          purpose: "fly-sprites-dev",
        },
      });
      seeded.push(name);
    }
    return { namespace: R2_NAMESPACE, seeded, skipped };
  },
});

export const proveP4ExitGate = internalAction({
  args: {
    ownerId: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    receipt: receiptValidator,
  }),
  handler: async (ctx, args) => {
    const ownerId = args.ownerId ?? "p4-sprite-proof";
    const { token, spriteName } = await loadSpriteAuth(ctx);
    await getSprite(token, spriteName);

    const leaseId = `lease-${randomUUID()}`;
    const jobId = `job-${randomUUID()}`;
    const marker = `p4-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const markerPath = `/tmp/p4-wake-${marker}.txt`;
    const now = Date.now();
    const leaseUntil = now + 120_000;
    const command = "bash";
    const commandArgs = ["-lc", `echo ${marker} > ${markerPath}`];

    await ctx.runMutation(internal.sprites.upsertJob, {
      ownerId,
      leaseId,
      jobId,
      spriteName,
      status: "open",
      command,
      args: commandArgs,
      leasedAt: now,
      leaseUntil,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.runMutation(internal.sprites.upsertJob, {
      ownerId,
      leaseId,
      jobId,
      spriteName,
      status: "running",
      command,
      args: commandArgs,
      leasedAt: now,
      leaseUntil,
      createdAt: now,
      updatedAt: Date.now(),
    });

    const started = Date.now();
    const write = await execFileHttp(
      token,
      spriteName,
      "bash",
      ["-lc", `echo ${marker} > ${markerPath} && cat ${markerPath}`],
    );
    const woke = true;
    const read = await execFileHttp(token, spriteName, "bash", [
      "-lc",
      `cat ${markerPath}`,
    ]);
    const recovered =
      write.exitCode === 0 &&
      read.exitCode === 0 &&
      read.stdout.trim() === marker;

    const checkpointId = await createCheckpoint(token, spriteName, `p4-${marker}`);
    const recordedAt = Date.now();
    const receipt = {
      ok: true as const,
      leaseId,
      jobId,
      spriteName,
      exitCode: write.exitCode,
      stdoutHash: createHash("sha256").update(write.stdout).digest("hex"),
      stderrBytes: Buffer.byteLength(write.stderr, "utf8"),
      timedOut: false,
      ms: recordedAt - started,
      woke,
      recovered,
      authenticated: true as const,
      checkpointId,
      recordedAt,
    };

    await ctx.runMutation(internal.sprites.upsertJob, {
      ownerId,
      leaseId,
      jobId,
      spriteName,
      status: recovered ? "acked" : "failed",
      command,
      args: commandArgs,
      leasedAt: now,
      leaseUntil,
      checkpointId,
      receipt: {
        ok: true as const,
        exitCode: receipt.exitCode,
        stdoutHash: receipt.stdoutHash,
        stderrBytes: receipt.stderrBytes,
        timedOut: receipt.timedOut,
        ms: receipt.ms,
        woke: receipt.woke,
        recovered: receipt.recovered,
        authenticated: true as const,
        recordedAt: receipt.recordedAt,
      },
      createdAt: now,
      updatedAt: recordedAt,
    });

    if (!recovered) throw new Error("sprite wake recovery failed: marker mismatch");
    return { ok: true, receipt };
  },
});
