import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const upsertJob = internalMutation({
  args: {
    ownerId: v.string(),
    leaseId: v.string(),
    jobId: v.string(),
    spriteName: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("running"),
      v.literal("acked"),
      v.literal("expired"),
      v.literal("failed"),
    ),
    command: v.string(),
    args: v.array(v.string()),
    leasedAt: v.number(),
    leaseUntil: v.number(),
    checkpointId: v.optional(v.string()),
    receipt: v.optional(
      v.object({
        ok: v.literal(true),
        exitCode: v.union(v.number(), v.null()),
        stdoutHash: v.string(),
        stderrBytes: v.number(),
        timedOut: v.boolean(),
        ms: v.number(),
        woke: v.boolean(),
        recovered: v.boolean(),
        authenticated: v.literal(true),
        recordedAt: v.number(),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.id("spriteJobs"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("spriteJobs")
      .withIndex("by_lease", (q) => q.eq("leaseId", args.leaseId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("spriteJobs", args);
  },
});

export const getByLease = internalQuery({
  args: { leaseId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("spriteJobs")
      .withIndex("by_lease", (q) => q.eq("leaseId", args.leaseId))
      .unique();
  },
});
