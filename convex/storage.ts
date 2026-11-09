import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const upsertArtifactRow = internalMutation({
  args: {
    ownerId: v.string(),
    artifactId: v.string(),
    version: v.number(),
    objectKey: v.string(),
    bucket: v.string(),
    contentHash: v.string(),
    contentType: v.string(),
    byteLength: v.number(),
    kind: v.string(),
    source: v.string(),
    actorId: v.string(),
    correlationId: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    restoredFrom: v.optional(v.string()),
    previousObjectKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.id("artifacts"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_owner_artifact", (q) =>
        q.eq("ownerId", args.ownerId).eq("artifactId", args.artifactId),
      )
      .collect();
    const sameVersion = existing.find((row) => row.version === args.version);
    if (sameVersion) {
      await ctx.db.patch(sameVersion._id, args);
      return sameVersion._id;
    }
    return await ctx.db.insert("artifacts", args);
  },
});

export const findByContentHash = internalQuery({
  args: { ownerId: v.string(), contentHash: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("artifacts")
      .withIndex("by_content_hash", (q) =>
        q.eq("ownerId", args.ownerId).eq("contentHash", args.contentHash),
      )
      .collect();
    const live = rows
      .filter((r) => !r.deletedAt && (!r.expiresAt || r.expiresAt > Date.now()))
      .sort((a, b) => b.version - a.version);
    return live[0] ?? null;
  },
});

export const getArtifact = internalQuery({
  args: { ownerId: v.string(), artifactId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("artifacts")
      .withIndex("by_owner_artifact", (q) =>
        q.eq("ownerId", args.ownerId).eq("artifactId", args.artifactId),
      )
      .collect();
    if (!rows.length) return null;
    return rows.sort((a, b) => b.version - a.version)[0];
  },
});

export const patchArtifact = internalMutation({
  args: {
    ownerId: v.string(),
    artifactId: v.string(),
    patch: v.object({
      expiresAt: v.optional(v.union(v.number(), v.null())),
      deletedAt: v.optional(v.union(v.number(), v.null())),
      restoredFrom: v.optional(v.union(v.string(), v.null())),
      updatedAt: v.number(),
    }),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("artifacts")
      .withIndex("by_owner_artifact", (q) =>
        q.eq("ownerId", args.ownerId).eq("artifactId", args.artifactId),
      )
      .collect();
    if (!rows.length) return null;
    const latest = rows.sort((a, b) => b.version - a.version)[0];
    const clean: Record<string, unknown> = { updatedAt: args.patch.updatedAt };
    if ("expiresAt" in args.patch) clean.expiresAt = args.patch.expiresAt ?? undefined;
    if ("deletedAt" in args.patch) clean.deletedAt = args.patch.deletedAt ?? undefined;
    if ("restoredFrom" in args.patch)
      clean.restoredFrom = args.patch.restoredFrom ?? undefined;
    await ctx.db.patch(latest._id, clean);
    return await ctx.db.get(latest._id);
  },
});
