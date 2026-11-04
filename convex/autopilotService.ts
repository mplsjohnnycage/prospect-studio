import {action,internalQuery,type ActionCtx} from "./_generated/server";
import {internal} from "./_generated/api";
import {v} from "convex/values";
import type {Id} from "./_generated/dataModel";
import {constantTimeEqual} from "./actorEvents";
type DailyRun={idle:true;reason:string;emailsSent:number}|{idle:false;campaign:{trade:string;city:string};research:unknown;eligibleIds:Id<"prospects">[];demoBudget:number;emailsSent:number};
type Prepared={prospectId:Id<"prospects">;conceptId:Id<"concepts">;alreadyBuilt:boolean;buildStatus:"built"|"busy"|"acquired";name:string;trade:string;city:string;direction:string};
type Drafted={created:boolean;emailsSent:number};
// Service door for the Vercel cron (src/app/api/cron/autopilot/route.ts). Secret: AUTOPILOT_SERVICE_SECRET, compared in constant time.
export const authorize=(token:string)=>{const secret=process.env.AUTOPILOT_SERVICE_SECRET;if(!secret||secret.length<32||typeof token!=="string"||!constantTimeEqual(token,secret))throw Error("Unauthorized service invocation");};

/**
 * Owner scope for service calls. The owner is derived from the prospect doc, never from the caller.
 * That owner must run an enabled autopilot campaign (campaigns are only created through owner()-gated mutations),
 * and, when AUTOPILOT_OWNER_ID is set, must equal it. A concept, when given, must belong to the same prospect and owner.
 */
export const serviceScope=internalQuery({
 args:{prospectId:v.id("prospects"),conceptId:v.optional(v.id("concepts"))},
 returns:v.boolean(),
 handler:async(ctx,a)=>{
  const p=await ctx.db.get(a.prospectId);
  if(!p)return false;
  const pinned=process.env.AUTOPILOT_OWNER_ID?.trim();
  if(pinned&&p.ownerId!==pinned)return false;
  const campaigns=await ctx.db.query("campaigns").withIndex("by_owner_key",q=>q.eq("ownerId",p.ownerId)).take(50);
  if(!campaigns.some(c=>c.enabled))return false;
  if(a.conceptId){const c=await ctx.db.get(a.conceptId);if(!c||c.prospectId!==p._id||c.ownerId!==p.ownerId)return false;}
  return true;
 }
});
const requireScope=async(ctx:ActionCtx,prospectId:Id<"prospects">,conceptId?:Id<"concepts">)=>{
 const ok:boolean=await ctx.runQuery(internal.autopilotService.serviceScope,{prospectId,conceptId});if(!ok)throw Error("Prospect is outside the autopilot owner scope");
};

export const runDaily=action({args:{token:v.string()},returns:v.any(),handler:async(ctx,a):Promise<DailyRun>=>{
 authorize(a.token);
 const due:{id:import("./_generated/dataModel").Id<"campaigns">;ownerId:string;trade:string;city:string}|null=await ctx.runMutation(internal.autopilot.reserveDue,{});
 if(!due)return {idle:true,reason:"No enabled campaign due",emailsSent:0};
 const pinned=process.env.AUTOPILOT_OWNER_ID?.trim();
 if(pinned&&due.ownerId!==pinned){await ctx.runMutation(internal.autopilot.completeDue,{id:due.id,error:"Campaign owner outside autopilot owner scope"});return {idle:true,reason:"Campaign owner outside autopilot owner scope",emailsSent:0};}
 try {
  const research:unknown=await ctx.runAction(internal.autopilot.discoverInternal,{ownerId:due.ownerId,trade:due.trade,city:due.city});
  const ranked:{eligibleIds:Id<"prospects">[];demoBudget:number}=await ctx.runQuery(internal.autopilot.rankForService,{ownerId:due.ownerId,trade:due.trade,city:due.city});
  await ctx.runMutation(internal.autopilot.completeDue,{id:due.id});
  return {idle:false,campaign:{trade:due.trade,city:due.city},research,eligibleIds:ranked.eligibleIds.slice(0,3),demoBudget:ranked.demoBudget,emailsSent:0};
 }catch(e){
  await ctx.runMutation(internal.autopilot.completeDue,{id:due.id,error:e instanceof Error?e.message:"Unknown discovery error"});
  throw e;
 }
}});
export const prepare=action({args:{token:v.string(),prospectId:v.id("prospects"),claimId:v.optional(v.string())},returns:v.any(),handler:async(ctx,a):Promise<Prepared>=>{
 authorize(a.token);await requireScope(ctx,a.prospectId);
 return await ctx.runMutation(internal.autopilot.prepareForService,{prospectId:a.prospectId,claimId:a.claimId});
}});
export const saveAndDraft=action({args:{token:v.string(),prospectId:v.id("prospects"),conceptId:v.id("concepts"),html:v.string(),sha256:v.string(),claimId:v.optional(v.string())},returns:v.any(),handler:async(ctx,a):Promise<Drafted>=>{
 authorize(a.token);await requireScope(ctx,a.prospectId,a.conceptId);
 await ctx.runMutation(internal.autopilot.saveForService,{prospectId:a.prospectId,conceptId:a.conceptId,html:a.html,sha256:a.sha256,claimId:a.claimId});
 return await ctx.runMutation(internal.autopilot.draftForService,{prospectId:a.prospectId});
}});
export const release=action({args:{token:v.string(),prospectId:v.id("prospects"),conceptId:v.id("concepts"),claimId:v.string()},returns:v.boolean(),handler:async(ctx,a):Promise<boolean>=>{
 authorize(a.token);await requireScope(ctx,a.prospectId,a.conceptId);
 return await ctx.runMutation(internal.autopilot.releaseForService,{prospectId:a.prospectId,conceptId:a.conceptId,claimId:a.claimId});
}});
