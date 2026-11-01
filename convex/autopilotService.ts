import {action} from "./_generated/server";
import {internal} from "./_generated/api";
import {v} from "convex/values";
import type {Id} from "./_generated/dataModel";
type DailyRun={idle:true;reason:string;emailsSent:number}|{idle:false;campaign:{trade:string;city:string};research:unknown;eligibleIds:Id<"prospects">[];demoBudget:number;emailsSent:number};
type Prepared={prospectId:Id<"prospects">;conceptId:Id<"concepts">;alreadyBuilt:boolean;name:string;trade:string;city:string;direction:string};
type Drafted={created:boolean;emailsSent:number};
const authorize=(token:string)=>{const secret=process.env.AUTOPILOT_SERVICE_SECRET;if(!secret||secret.length<32||token!==secret)throw Error("Unauthorized service invocation");};
export const runDaily=action({args:{token:v.string()},returns:v.any(),handler:async(ctx,a):Promise<DailyRun>=>{
 authorize(a.token);
 const due:{id:import("./_generated/dataModel").Id<"campaigns">;ownerId:string;trade:string;city:string}|null=await ctx.runMutation(internal.autopilot.reserveDue,{});
 if(!due)return {idle:true,reason:"No enabled campaign due",emailsSent:0};
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
export const prepare=action({args:{token:v.string(),prospectId:v.id("prospects")},returns:v.any(),handler:async(ctx,a):Promise<Prepared>=>{
 authorize(a.token);return await ctx.runMutation(internal.autopilot.prepareForService,{prospectId:a.prospectId});
}});
export const saveAndDraft=action({args:{token:v.string(),prospectId:v.id("prospects"),conceptId:v.id("concepts"),html:v.string(),sha256:v.string()},returns:v.any(),handler:async(ctx,a):Promise<Drafted>=>{
 authorize(a.token);
 await ctx.runMutation(internal.autopilot.saveForService,{prospectId:a.prospectId,conceptId:a.conceptId,html:a.html,sha256:a.sha256});
 return await ctx.runMutation(internal.autopilot.draftForService,{prospectId:a.prospectId});
}});
