import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const stage = v.union(...(["Discover","Qualify","Extract","Design","Demo","Outreach","Convert","Produce"] as const).map(v.literal));
export const status = v.union(...(["queued","running","needs_approval","paused","blocked","succeeded","failed"] as const).map(v.literal));
export default defineSchema({
 assistantMessages: defineTable({ownerId:v.string(),role:v.union(v.literal("user"),v.literal("assistant")),text:v.string(),action:v.optional(v.union(v.literal("autopilot"),v.literal("inbox"),v.literal("calendar"),v.literal("studio"),v.literal("prospect"))),prospectId:v.optional(v.string()),createdAt:v.number()}).index("by_owner_time",["ownerId","createdAt"]),
 demoSubmissions: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),conceptId:v.id("concepts"),kind:v.literal("preview_test"),name:v.string(),email:v.string(),message:v.string(),createdAt:v.number()}).index("by_owner_time",["ownerId","createdAt"]).index("by_prospect",["prospectId"]),
 campaigns: defineTable({ownerId:v.string(),key:v.string(),trade:v.string(),city:v.string(),enabled:v.boolean(),lastRunAt:v.number(),lastError:v.optional(v.string()),updatedAt:v.number()}).index("by_owner_key",["ownerId","key"]).index("by_enabled_run",["enabled","lastRunAt"]),
 prospects: defineTable({
  ownerId:v.string(),name:v.string(),trade:v.string(),city:v.string(),website:v.string(),contact:v.string(),score:v.number(),stage,status,notes:v.string(),source:v.string(),latitude:v.optional(v.number()),longitude:v.optional(v.number()),campaignKey:v.optional(v.string()),qualified:v.optional(v.boolean()),scoreReasons:v.optional(v.array(v.string())),evidence:v.optional(v.array(v.string())),updatedAt:v.number()
 }).index("by_owner_updated",["ownerId","updatedAt"]).index("by_owner_stage",["ownerId","stage"]).index("by_owner_campaign",["ownerId","campaignKey"]).index("by_owner_campaign_website",["ownerId","campaignKey","website"]).searchIndex("search_name",{searchField:"name",filterFields:["ownerId"]}),
 concepts: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),variant:v.string(),direction:v.string(),description:v.string(),status:v.union(v.literal("draft"),v.literal("approved")),html:v.optional(v.string()),sha256:v.optional(v.string()),builtAt:v.optional(v.number()),buildClaimId:v.optional(v.string()),buildLeaseUntil:v.optional(v.number()),updatedAt:v.number()}).index("by_prospect",["prospectId"]),
 outreach: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),subject:v.string(),body:v.string(),status:v.union(v.literal("draft"),v.literal("approved")),updatedAt:v.number()}).index("by_prospect",["prospectId"]).index("by_owner",["ownerId"]),
 activities: defineTable({ownerId:v.string(),prospectId:v.optional(v.id("prospects")),kind:v.string(),summary:v.string(),timestamp:v.number()}).index("by_owner_time",["ownerId","timestamp"]).index("by_prospect",["prospectId"]),
 commands: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),commandId:v.string(),kind:v.string(),result:v.string(),timestamp:v.number()}).index("by_command",["commandId"]),
 appointments: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),startAt:v.number(),durationMinutes:v.number(),title:v.string(),notes:v.string(),bookingUrl:v.string(),status:v.union(v.literal("planned"),v.literal("completed"),v.literal("cancelled")),source:v.literal("manual"),updatedAt:v.number()}).index("by_owner_start",["ownerId","startAt"]).index("by_prospect",["prospectId"]),
 mailboxes: defineTable({ownerId:v.string(),inboxId:v.string(),label:v.string()}).index("by_owner",["ownerId"]),
 actorEvents: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),actorId:v.string(),sequence:v.number(),eventType:v.string(),payload:v.string(),createdAt:v.number()}).index("by_actor_sequence",["actorId","sequence"]),
 sources: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),url:v.string(),summary:v.string(),checksum:v.string(),verifiedAt:v.number()}).index("by_prospect",["prospectId"]),
});
