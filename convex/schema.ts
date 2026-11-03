import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const stage = v.union(...(["Discover","Qualify","Extract","Design","Demo","Outreach","Convert","Produce"] as const).map(v.literal));
export const status = v.union(...(["queued","running","needs_approval","paused","blocked","succeeded","failed"] as const).map(v.literal));
export default defineSchema({
 headlessJobs: defineTable({
  ownerId:v.string(),idempotencyKey:v.string(),kind:v.union(
   v.literal("research_business"),v.literal("qualify_lead"),v.literal("build_demo"),
   v.literal("review_demo"),v.literal("draft_outreach")),
  instruction:v.string(),inputJson:v.string(),status:v.union(
   v.literal("queued"),v.literal("leased"),v.literal("submitted"),
   v.literal("verified"),v.literal("rejected"),v.literal("failed"),v.literal("cancelled")),
  attempts:v.number(),leaseRenewals:v.number(),workerId:v.optional(v.string()),
  leaseId:v.optional(v.string()),leaseUntil:v.optional(v.number()),
  summary:v.optional(v.string()),evidence:v.optional(v.array(v.string())),
  verifiedAt:v.optional(v.number()),verificationNotes:v.optional(v.string()),
  createdAt:v.number(),updatedAt:v.number(),
 }).index("by_owner_key",["ownerId","idempotencyKey"])
   .index("by_owner_status",["ownerId","status"])
   .index("by_owner_lease",["ownerId","status","leaseUntil"])
   .index("by_owner_updated",["ownerId","updatedAt"]),
 headlessJobEvents: defineTable({
  ownerId:v.string(),jobId:v.id("headlessJobs"),eventType:v.string(),
  actor:v.string(),note:v.string(),createdAt:v.number(),
 }).index("by_job_time",["jobId","createdAt"]),
 assistantMessages: defineTable({ownerId:v.string(),role:v.union(v.literal("user"),v.literal("assistant")),text:v.string(),action:v.optional(v.union(v.literal("autopilot"),v.literal("inbox"),v.literal("calendar"),v.literal("studio"),v.literal("prospect"))),prospectId:v.optional(v.string()),steps:v.optional(v.array(v.object({tool:v.string(),ok:v.boolean(),error:v.optional(v.string())}))),createdAt:v.number()}).index("by_owner_time",["ownerId","createdAt"]),
 demoSubmissions: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),conceptId:v.id("concepts"),kind:v.literal("preview_test"),name:v.string(),email:v.string(),message:v.string(),createdAt:v.number()}).index("by_owner_time",["ownerId","createdAt"]).index("by_prospect",["prospectId"]),
 priceBook: defineTable({ownerId:v.string(),packages:v.array(v.object({id:v.string(),name:v.string(),setup:v.number(),monthly:v.number(),includes:v.array(v.string()),paymentUrl:v.optional(v.string())})),updatedAt:v.number()}).index("by_owner",["ownerId"]),
 proposals: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),token:v.string(),packages:v.array(v.object({id:v.string(),name:v.string(),setup:v.number(),monthly:v.number(),includes:v.array(v.string()),paymentUrl:v.optional(v.string())})),note:v.optional(v.string()),status:v.union(v.literal("open"),v.literal("accepted"),v.literal("declined")),views:v.number(),viewedAt:v.optional(v.number()),acceptedPackage:v.optional(v.string()),acceptedBy:v.optional(v.object({name:v.string(),email:v.string()})),acceptedAt:v.optional(v.number()),createdAt:v.number()}).index("by_token",["token"]).index("by_prospect",["prospectId"]).index("by_owner_status",["ownerId","status"]),
 followups: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),outreachId:v.id("outreach"),step:v.union(v.literal(1),v.literal(2)),subject:v.string(),body:v.string(),status:v.union(v.literal("draft"),v.literal("sent"),v.literal("failed"),v.literal("skipped")),deliveryStatus:v.optional(v.string()),outboundId:v.optional(v.string()),sendError:v.optional(v.string()),sentAt:v.optional(v.number()),updatedAt:v.number()}).index("by_outreach",["outreachId"]).index("by_prospect",["prospectId"]).index("by_owner_status",["ownerId","status"]),
 bookings: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),conceptId:v.id("concepts"),name:v.string(),phone:v.string(),email:v.string(),preferred:v.string(),note:v.string(),status:v.union(v.literal("new"),v.literal("done")),createdAt:v.number()}).index("by_owner_time",["ownerId","createdAt"]).index("by_prospect",["prospectId"]),
 suppressions: defineTable({ownerId:v.string(),kind:v.union(v.literal("email"),v.literal("domain")),value:v.string(),reason:v.optional(v.string()),createdAt:v.number()}).index("by_owner",["ownerId"]).index("by_owner_value",["ownerId","value"]),
 campaigns: defineTable({ownerId:v.string(),key:v.string(),trade:v.string(),city:v.string(),enabled:v.boolean(),lastRunAt:v.number(),lastError:v.optional(v.string()),updatedAt:v.number()}).index("by_owner_key",["ownerId","key"]).index("by_enabled_run",["enabled","lastRunAt"]),
 prospects: defineTable({
  ownerId:v.string(),name:v.string(),trade:v.string(),city:v.string(),website:v.string(),contact:v.string(),score:v.number(),stage,status,notes:v.string(),source:v.string(),latitude:v.optional(v.number()),longitude:v.optional(v.number()),campaignKey:v.optional(v.string()),qualified:v.optional(v.boolean()),opportunity:v.optional(v.number()),scoreReasons:v.optional(v.array(v.string())),evidence:v.optional(v.array(v.string())),updatedAt:v.number()
 }).index("by_owner_updated",["ownerId","updatedAt"]).index("by_owner_stage",["ownerId","stage"]).index("by_owner_campaign",["ownerId","campaignKey"]).index("by_owner_campaign_website",["ownerId","campaignKey","website"]).searchIndex("search_name",{searchField:"name",filterFields:["ownerId"]}),
 concepts: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),variant:v.string(),direction:v.string(),description:v.string(),status:v.union(v.literal("draft"),v.literal("approved")),html:v.optional(v.string()),sha256:v.optional(v.string()),builtAt:v.optional(v.number()),buildClaimId:v.optional(v.string()),buildLeaseUntil:v.optional(v.number()),generator:v.optional(v.string()),model:v.optional(v.string()),generationError:v.optional(v.string()),shareToken:v.optional(v.string()),views:v.optional(v.number()),lastViewedAt:v.optional(v.number()),qualityScore:v.optional(v.number()),reviewNotes:v.optional(v.array(v.string())),preset:v.optional(v.string()),updatedAt:v.number()}).index("by_prospect",["prospectId"]).index("by_share_token",["shareToken"]),
 outreach: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),subject:v.string(),body:v.string(),status:v.union(v.literal("draft"),v.literal("approved"),v.literal("sent"),v.literal("failed")),recipient:v.optional(v.string()),demoUrl:v.optional(v.string()),outboundId:v.optional(v.string()),threadId:v.optional(v.string()),deliveryStatus:v.optional(v.string()),sendError:v.optional(v.string()),sentAt:v.optional(v.number()),updatedAt:v.number()}).index("by_prospect",["prospectId"]).index("by_owner",["ownerId"]).index("by_status_sent",["status","sentAt"]),
 replies: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),outreachId:v.id("outreach"),messageId:v.string(),threadId:v.string(),from:v.string(),subject:v.string(),text:v.string(),optOut:v.boolean(),receivedAt:v.number()}).index("by_message",["messageId"]).index("by_prospect",["prospectId"]).index("by_owner_time",["ownerId","receivedAt"]),
 replyDrafts: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),replyId:v.id("replies"),body:v.string(),status:v.union(v.literal("draft"),v.literal("sent"),v.literal("failed")),generator:v.string(),outboundId:v.optional(v.string()),sentAt:v.optional(v.number()),updatedAt:v.number()}).index("by_reply",["replyId"]).index("by_prospect",["prospectId"]),
 syncState: defineTable({key:v.string(),value:v.number()}).index("by_key",["key"]),
 activities: defineTable({ownerId:v.string(),prospectId:v.optional(v.id("prospects")),kind:v.string(),summary:v.string(),timestamp:v.number()}).index("by_owner_time",["ownerId","timestamp"]).index("by_prospect",["prospectId"]),
 commands: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),commandId:v.string(),kind:v.string(),result:v.string(),timestamp:v.number()}).index("by_command",["commandId"]),
 appointments: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),startAt:v.number(),durationMinutes:v.number(),title:v.string(),notes:v.string(),bookingUrl:v.string(),status:v.union(v.literal("planned"),v.literal("completed"),v.literal("cancelled")),source:v.literal("manual"),updatedAt:v.number()}).index("by_owner_start",["ownerId","startAt"]).index("by_prospect",["prospectId"]),
 mailboxes: defineTable({ownerId:v.string(),inboxId:v.string(),label:v.string()}).index("by_owner",["ownerId"]),
 actorEvents: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),actorId:v.string(),sequence:v.number(),eventType:v.string(),payload:v.string(),createdAt:v.number()}).index("by_actor_sequence",["actorId","sequence"]),
 sources: defineTable({ownerId:v.string(),prospectId:v.id("prospects"),url:v.string(),summary:v.string(),checksum:v.string(),verifiedAt:v.number()}).index("by_prospect",["prospectId"]),
});
