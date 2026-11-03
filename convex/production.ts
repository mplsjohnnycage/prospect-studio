// v3 item 24: pay-to-production run, each step timestamped; site_live writes the "live" outcome for hours-to-live.
import {internalMutation,mutation} from "./_generated/server";
import type {MutationCtx} from "./_generated/server";
import {v} from "convex/values";
import type {Id} from "./_generated/dataModel";
import {owner} from "./identity";
import {logOutcome} from "./outcomes";
import {advance,PROD_STEPS,type ProdStep} from "../src/lib/revenue-build";

export const prodStep=v.union(...PROD_STEPS.map(s=>v.literal(s)));
async function step(ctx:MutationCtx,ownerId:string,prospectId:Id<"prospects">,s:ProdStep,amount?:number){
 const now=Date.now();
 const run=await ctx.db.query("productionRuns").withIndex("by_prospect",q=>q.eq("prospectId",prospectId)).first();
 const stamps=advance(run?.stamps??{},s,now);
 if(run)await ctx.db.patch(run._id,{stamps,updatedAt:now});
 else await ctx.db.insert("productionRuns",{ownerId,prospectId,stamps,updatedAt:now});
 if(s==="paid"&&!run?.stamps.paid)await logOutcome(ctx,{ownerId,prospectId,kind:"paid",at:now,...(amount!==undefined?{amount}:{})});
 if(s==="site_live"&&!run?.stamps.site_live)await logOutcome(ctx,{ownerId,prospectId,kind:"live",at:now});
 return stamps;
}
export const advanceStep=mutation({args:{prospectId:v.id("prospects"),step:prodStep,amount:v.optional(v.number())},returns:v.any(),
 handler:async(ctx,a)=>{const user=await owner(ctx);const p=await ctx.db.get(a.prospectId);if(!p||p.ownerId!==user)throw Error("Prospect not found");return step(ctx,user,a.prospectId,a.step,a.amount);}});
export const advanceInternal=internalMutation({args:{ownerId:v.string(),prospectId:v.id("prospects"),step:prodStep,amount:v.optional(v.number())},returns:v.any(),
 handler:async(ctx,a)=>step(ctx,a.ownerId,a.prospectId,a.step,a.amount)});
