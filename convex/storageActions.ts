"use node";

import { createHash } from "node:crypto";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { type ActionCtx, internalAction } from "./_generated/server";
import { r2WithSecretConfig } from "./r2";

type ReceiptOp =
  | "upload"
  | "read"
  | "rights"
  | "expiry"
  | "dedupe"
  | "restore";

type Receipt = {
  ok: true;
  op: ReceiptOp;
  artifactId: string;
  objectKey: string;
  contentHash: string;
  version: number;
  bucket: string;
  signedUrlExpiresIn?: number;
  reused?: boolean;
  expiresAt?: number | null;
  deletedAt?: number | null;
  restoredFrom?: string | null;
  recordedAt: number;
};

type ArtifactRow = {
  artifactId: string;
  objectKey: string;
  contentHash: string;
  version: number;
  bucket: string;
  expiresAt?: number;
  deletedAt?: number;
  restoredFrom?: string;
};

const receiptValidator = v.object({
  ok: v.literal(true),
  op: v.union(
    v.literal("upload"),
    v.literal("read"),
    v.literal("rights"),
    v.literal("expiry"),
    v.literal("dedupe"),
    v.literal("restore"),
  ),
  artifactId: v.string(),
  objectKey: v.string(),
  contentHash: v.string(),
  version: v.number(),
  bucket: v.string(),
  signedUrlExpiresIn: v.optional(v.number()),
  reused: v.optional(v.boolean()),
  expiresAt: v.optional(v.union(v.number(), v.null())),
  deletedAt: v.optional(v.union(v.number(), v.null())),
  restoredFrom: v.optional(v.union(v.string(), v.null())),
  recordedAt: v.number(),
});

async function doUpload(
  ctx: ActionCtx,
  args: {
    ownerId: string;
    artifactId: string;
    body: string;
    contentType?: string;
    actorId?: string;
  },
): Promise<Receipt> {
  const bytes = Buffer.from(args.body, "utf8");
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const contentType = args.contentType ?? "text/plain";
  const actorId = args.actorId ?? "auto-loop";
  const existing = (await ctx.runQuery(internal.storage.findByContentHash, {
    ownerId: args.ownerId,
    contentHash,
  })) as ArtifactRow | null;
  if (existing) {
    return {
      ok: true,
      op: "dedupe",
      artifactId: existing.artifactId,
      objectKey: existing.objectKey,
      contentHash,
      version: existing.version,
      bucket: existing.bucket,
      reused: true,
      recordedAt: Date.now(),
    };
  }
  const prev = (await ctx.runQuery(internal.storage.getArtifact, {
    ownerId: args.ownerId,
    artifactId: args.artifactId,
  })) as ArtifactRow | null;
  const version = (prev?.version ?? 0) + 1;
  const objectKey = `artifacts/${encodeURIComponent(args.ownerId)}/${encodeURIComponent(args.artifactId)}/v${version}/${contentHash.slice(0, 16)}`;
  const client = await r2WithSecretConfig(ctx);
  await client.store(ctx, bytes, { key: objectKey, type: contentType });
  const now = Date.now();
  await ctx.runMutation(internal.storage.upsertArtifactRow, {
    ownerId: args.ownerId,
    artifactId: args.artifactId,
    version,
    objectKey,
    bucket: client.config.bucket,
    contentHash,
    contentType,
    byteLength: bytes.byteLength,
    kind: "receipt",
    source: "p2-storage-proof",
    actorId,
    previousObjectKey: prev?.objectKey,
    createdAt: now,
    updatedAt: now,
  });
  return {
    ok: true,
    op: "upload",
    artifactId: args.artifactId,
    objectKey,
    contentHash,
    version,
    bucket: client.config.bucket,
    reused: false,
    recordedAt: now,
  };
}

async function doRead(
  ctx: ActionCtx,
  args: { ownerId: string; artifactId: string; expiresIn?: number },
): Promise<Receipt> {
  const row = (await ctx.runQuery(internal.storage.getArtifact, {
    ownerId: args.ownerId,
    artifactId: args.artifactId,
  })) as ArtifactRow | null;
  if (!row) throw new Error("artifact not found");
  if (row.deletedAt) throw new Error("artifact deleted");
  if (row.expiresAt && row.expiresAt <= Date.now()) {
    throw new Error("artifact expired");
  }
  const client = await r2WithSecretConfig(ctx);
  const expiresIn = args.expiresIn ?? 900;
  const url = await client.getUrl(row.objectKey, { expiresIn });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`signed read failed: ${res.status}`);
  const body = await res.text();
  const hash = createHash("sha256")
    .update(Buffer.from(body, "utf8"))
    .digest("hex");
  if (hash !== row.contentHash) {
    throw new Error("content hash mismatch on read");
  }
  return {
    ok: true,
    op: "read",
    artifactId: row.artifactId,
    objectKey: row.objectKey,
    contentHash: row.contentHash,
    version: row.version,
    bucket: row.bucket,
    signedUrlExpiresIn: expiresIn,
    recordedAt: Date.now(),
  };
}

async function doExpiry(
  ctx: ActionCtx,
  args: { ownerId: string; artifactId: string; expiresAt: number },
): Promise<Receipt> {
  const row = (await ctx.runMutation(internal.storage.patchArtifact, {
    ownerId: args.ownerId,
    artifactId: args.artifactId,
    patch: { expiresAt: args.expiresAt, updatedAt: Date.now() },
  })) as ArtifactRow | null;
  if (!row) throw new Error("artifact not found");
  return {
    ok: true,
    op: "expiry",
    artifactId: row.artifactId,
    objectKey: row.objectKey,
    contentHash: row.contentHash,
    version: row.version,
    bucket: row.bucket,
    expiresAt: row.expiresAt ?? null,
    recordedAt: Date.now(),
  };
}

async function doRightsDeny(
  ctx: ActionCtx,
  args: { ownerId: string; artifactId: string },
): Promise<Receipt> {
  const existing = (await ctx.runQuery(internal.storage.getArtifact, {
    ownerId: args.ownerId,
    artifactId: args.artifactId,
  })) as ArtifactRow | null;
  if (!existing) throw new Error("artifact not found");
  const deleted = (await ctx.runMutation(internal.storage.patchArtifact, {
    ownerId: args.ownerId,
    artifactId: args.artifactId,
    patch: { deletedAt: Date.now(), updatedAt: Date.now() },
  })) as ArtifactRow | null;
  if (!deleted?.deletedAt) throw new Error("rights deny failed");
  let denied = false;
  try {
    await doRead(ctx, args);
  } catch {
    denied = true;
  }
  if (!denied) throw new Error("expected read to fail after soft-delete");
  return {
    ok: true,
    op: "rights",
    artifactId: deleted.artifactId,
    objectKey: deleted.objectKey,
    contentHash: deleted.contentHash,
    version: deleted.version,
    bucket: deleted.bucket,
    deletedAt: deleted.deletedAt ?? null,
    recordedAt: Date.now(),
  };
}

async function doRestore(
  ctx: ActionCtx,
  args: { ownerId: string; artifactId: string },
): Promise<Receipt> {
  const before = (await ctx.runQuery(internal.storage.getArtifact, {
    ownerId: args.ownerId,
    artifactId: args.artifactId,
  })) as ArtifactRow | null;
  if (!before) throw new Error("artifact not found");
  const restored = (await ctx.runMutation(internal.storage.patchArtifact, {
    ownerId: args.ownerId,
    artifactId: args.artifactId,
    patch: {
      deletedAt: null,
      expiresAt: null,
      restoredFrom: before.objectKey,
      updatedAt: Date.now(),
    },
  })) as ArtifactRow | null;
  if (!restored) throw new Error("restore failed");
  await doRead(ctx, args);
  return {
    ok: true,
    op: "restore",
    artifactId: restored.artifactId,
    objectKey: restored.objectKey,
    contentHash: restored.contentHash,
    version: restored.version,
    bucket: restored.bucket,
    restoredFrom: restored.restoredFrom ?? before.objectKey,
    deletedAt: restored.deletedAt ?? null,
    expiresAt: restored.expiresAt ?? null,
    recordedAt: Date.now(),
  };
}

/** Prove upload + provenance (+ dedupe when content matches). */
export const proveUpload = internalAction({
  args: {
    ownerId: v.string(),
    artifactId: v.string(),
    body: v.string(),
    contentType: v.optional(v.string()),
    actorId: v.optional(v.string()),
  },
  returns: receiptValidator,
  handler: async (ctx, args): Promise<Receipt> => doUpload(ctx, args),
});

export const proveRead = internalAction({
  args: {
    ownerId: v.string(),
    artifactId: v.string(),
    expiresIn: v.optional(v.number()),
  },
  returns: receiptValidator,
  handler: async (ctx, args): Promise<Receipt> => doRead(ctx, args),
});

export const proveExpiry = internalAction({
  args: {
    ownerId: v.string(),
    artifactId: v.string(),
    expiresAt: v.number(),
  },
  returns: receiptValidator,
  handler: async (ctx, args): Promise<Receipt> => doExpiry(ctx, args),
});

export const proveRightsDeny = internalAction({
  args: { ownerId: v.string(), artifactId: v.string() },
  returns: receiptValidator,
  handler: async (ctx, args): Promise<Receipt> => doRightsDeny(ctx, args),
});

export const proveRestore = internalAction({
  args: { ownerId: v.string(), artifactId: v.string() },
  returns: receiptValidator,
  handler: async (ctx, args): Promise<Receipt> => doRestore(ctx, args),
});

/** Full P2 exit-gate suite; returns receipt array (no secret values). */
export const proveP2ExitGate = internalAction({
  args: {
    ownerId: v.optional(v.string()),
    artifactId: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    receipts: v.array(receiptValidator),
  }),
  handler: async (ctx, args): Promise<{ ok: boolean; receipts: Receipt[] }> => {
    const ownerId = args.ownerId ?? "p2-storage-proof";
    const artifactId = args.artifactId ?? `p2-${Date.now()}`;
    const body = `p2-storage-proof ${artifactId} ${new Date().toISOString()}`;
    const upload = await doUpload(ctx, { ownerId, artifactId, body });
    const read = await doRead(ctx, { ownerId, artifactId });
    const dedupe = await doUpload(ctx, { ownerId, artifactId, body });
    const expiry = await doExpiry(ctx, {
      ownerId,
      artifactId,
      expiresAt: Date.now() + 60_000,
    });
    await doExpiry(ctx, {
      ownerId,
      artifactId,
      expiresAt: Date.now() + 86_400_000,
    });
    const rights = await doRightsDeny(ctx, { ownerId, artifactId });
    const restore = await doRestore(ctx, { ownerId, artifactId });
    const receipts: Receipt[] = [upload, read, dedupe, expiry, rights, restore];
    return { ok: receipts.every((r) => r.ok), receipts };
  },
});
