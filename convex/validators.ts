// Shared validators: schema, functions, MCP tools and the UI all use these (one task-type list).
import {v,type Infer} from "convex/values";
import {TASK_KINDS,TASK_STATUSES,STAGES} from "../src/lib/agent-core";
export const taskKind=v.union(...TASK_KINDS.map(k=>v.literal(k)));
export const taskStatus=v.union(...TASK_STATUSES.map(k=>v.literal(k)));
export const agentStage=v.union(...STAGES.map(k=>v.literal(k)));
export const taskRow=v.object({_id:v.id("agentTasks"),kind:taskKind,status:taskStatus,attempts:v.number(),claimedBy:v.optional(v.string()),leaseUntil:v.optional(v.number()),error:v.optional(v.string())});
export const workerRow=v.object({worker:v.string(),lastSeen:v.number(),stale:v.boolean()});
export const claimedTask=v.union(v.null(),v.object({_id:v.id("agentTasks"),kind:taskKind,leaseId:v.string(),leaseUntil:v.number(),attempts:v.number(),prospectId:v.optional(v.id("prospects")),input:v.optional(v.any())}));
export type TaskRow=Infer<typeof taskRow>;export type WorkerRow=Infer<typeof workerRow>;export type ClaimedTask=Infer<typeof claimedTask>;
