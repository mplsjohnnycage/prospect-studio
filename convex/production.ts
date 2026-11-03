// v3 item 24: pay-to-production run, each step timestamped; site_live writes the "live" outcome for hours-to-live.
import {internalMutation,mutation} from "./_generated/server";
import type {MutationCtx} from "./_generated/server";
import {v} from "convex/values";
import type {Id} from "./_generated/dataModel";
import {owner} from "./identity";
import {logOutcome} from "./outcomes";
import {advance,PROD_STEPS,type ProdStep} from "../src/lib/revenue-build";
import {payToLivePlan} from "../src/lib/agent-core";

export const prodStep=v.union(...PROD_STEPS.map(s=>v.literal(s)));
async function step(ctx:MutationCtx,ownerId:string,prospectId:Id<"prospects">,s:ProdStep,amount?:number){
 const now=Date.now();
 const run=await ctx.db.query("productionRuns").withIndex("by_prospect",q=>q.eq("prospectId",prospectId)).first();
 const stamps=advance(run?.stamps??{},s,now);
 if(run)await ctx.db.patch(run._id,{stamps,updatedAt:now});
 else await ctx.db.insert("productionRuns",{ownerId,prospectId,stamps,updatedAt:now});
 if(s==="paid"&&!run?.stamps.paid)await logOutcome(ctx,{ownerId,prospectId,kind:"paid",at:now,...(amount!==undefined?{amount}:{})});
 if(s==="site_live"&&!run?.stamps.site_live)await logOutcome(ctx,{ownerId,prospectId,kind:"live",at:now});
 // Pay-to-live: after each stamp, post the next step (auto steps are still started by Johnny; nothing is bought or published here).
 const p=await ctx.db.get(prospectId);
 const plan=payToLivePlan({name:p?.name??"",domain:p?.website?.replace(/^https?:\/\//,"").replace(/\/.*$/,"")||undefined});
 const next=plan.find(x=>!(stamps as Record<string,number|undefined>)[x.step]);
 await ctx.db.insert("activities",{ownerId,prospectId,kind:"pay_to_live",summary:(s.replace(/_/g," ")+" done."+(next?" Next: "+next.step.replace(/_/g," ")+" ("+(next.auto?"automatable":"Johnny")+"): "+next.note:" Live.")).slice(0,400),timestamp:now});
 return stamps;
}
export const advanceStep=mutation({args:{prospectId:v.id("prospects"),step:prodStep,amount:v.optional(v.number())},returns:v.any(),
 handler:async(ctx,a)=>{const user=await owner(ctx);const p=await ctx.db.get(a.prospectId);if(!p||p.ownerId!==user)throw Error("Prospect not found");return step(ctx,user,a.prospectId,a.step,a.amount);}});
export const advanceInternal=internalMutation({args:{ownerId:v.string(),prospectId:v.id("prospects"),step:prodStep,amount:v.optional(v.number())},returns:v.any(),
 handler:async(ctx,a)=>step(ctx,a.ownerId,a.prospectId,a.step,a.amount)});
