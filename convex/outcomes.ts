// Item 1 + 23: outcome labels, per-stage cost log, send snapshots, one-click opt-out, metrics.
import {internalMutation,mutation,query} from "./_generated/server";
import type {MutationCtx} from "./_generated/server";
import {v} from "convex/values";
import {owner} from "./identity";
import {addSuppressionFor} from "./suppressions";
import type {Id} from "./_generated/dataModel";
import {metrics,type OutcomeKind,type TriggerType} from "../src/lib/revenue-engine";

export const outcomeKind=v.union(...(["sent","opened","viewed","replied","call_booked","paid","live","lost"] as const).map(v.literal));
export async function logOutcome(ctx:MutationCtx,o:{ownerId:string;prospectId:Id<"prospects">;kind:OutcomeKind;amount?:number;intent?:string;reason?:string;at?:number}){
 return await ctx.db.insert("outcomes",{ownerId:o.ownerId,prospectId:o.prospectId,kind:o.kind,at:o.at??Date.now(),...(o.amount!==undefined?{amount:o.amount}:{}),...(o.intent?{intent:o.intent}:{}),...(o.reason?{reason:o.reason}:{})});
}
export async function logStageCost(ctx:MutationCtx,c:{ownerId:string;stage:string;usd:number;computeSeconds:number;tool?:string;prospectId?:Id<"prospects">}){
 return await ctx.db.insert("stageCosts",{...c,at:Date.now()});
}
export const record=mutation({
 args:{prospectId:v.id("prospects"),kind:outcomeKind,amount:v.optional(v.number()),intent:v.optional(v.string()),reason:v.optional(v.string())},returns:v.id("outcomes"),
 handler:async(ctx,a)=>{const user=await owner(ctx);const p=await ctx.db.get(a.prospectId);if(!p||p.ownerId!==user)throw Error("Prospect not found");return await logOutcome(ctx,{ownerId:user,...a});}
});
export const recordInternal=internalMutation({
 args:{ownerId:v.string(),prospectId:v.id("prospects"),kind:outcomeKind,amount:v.optional(v.number()),intent:v.optional(v.string()),reason:v.optional(v.string())},returns:v.id("outcomes"),
 handler:async(ctx,a)=>logOutcome(ctx,a)
});
export const costInternal=internalMutation({
 args:{ownerId:v.string(),stage:v.string(),usd:v.number(),computeSeconds:v.number(),tool:v.optional(v.string()),prospectId:v.optional(v.id("prospects"))},returns:v.id("stageCosts"),
 handler:async(ctx,a)=>logStageCost(ctx,a)
});
/** Marks the snapshot sent and logs the "sent" label. Called by the existing approved-send path. */
export async function markSent(ctx:MutationCtx,ownerId:string,outreachId:Id<"outreach">,prospectId:Id<"prospects">){
 const snap=await ctx.db.query("sendSnapshots").withIndex("by_outreach",q=>q.eq("outreachId",outreachId)).first();
 const now=Date.now();
 if(snap&&!snap.sentAt)await ctx.db.patch(snap._id,{sentAt:now});
 await logOutcome(ctx,{ownerId,prospectId,kind:"sent",at:now});
}
/** One-click opt-out: token -> suppression + lost label. Idempotent. */
export const optOut=internalMutation({
 args:{token:v.string()},returns:v.boolean(),
 handler:async(ctx,a)=>{
  const t=await ctx.db.query("optOutTokens").withIndex("by_token",q=>q.eq("token",a.token)).first();
  if(!t)return false;
  if(!t.usedAt){
   await addSuppressionFor(ctx,t.ownerId,t.value,"one-click opt-out");
   await ctx.db.patch(t._id,{usedAt:Date.now()});
   await logOutcome(ctx,{ownerId:t.ownerId,prospectId:t.prospectId,kind:"lost",reason:"opt_out"});
  }
  return true;
 }
});
export const dashboard=query({
 args:{},returns:v.any(),
 handler:async ctx=>{
  const user=await owner(ctx);
  const ev=await ctx.db.query("outcomes").withIndex("by_owner_time",q=>q.eq("ownerId",user)).order("desc").take(5000);
  const costs=await ctx.db.query("stageCosts").withIndex("by_owner_time",q=>q.eq("ownerId",user)).order("desc").take(5000);
  const snaps=await ctx.db.query("sendSnapshots").withIndex("by_owner",q=>q.eq("ownerId",user)).take(5000);
  const qualified=(await ctx.db.query("prospects").withIndex("by_owner_updated",q=>q.eq("ownerId",user)).take(5000)).filter(p=>p.qualified).length;
  return metrics(ev.map(e=>({prospectId:e.prospectId,kind:e.kind,at:e.at,amount:e.amount})),costs.map(c=>({stage:c.stage,usd:c.usd,computeSeconds:c.computeSeconds})),snaps.filter(s=>s.sentAt).map(s=>({prospectId:s.prospectId,trigger:{type:s.triggerType as TriggerType,date:s.triggerDate},variant:s.variant,subject:s.subject,sentAt:s.sentAt!})),qualified);
 }
});
