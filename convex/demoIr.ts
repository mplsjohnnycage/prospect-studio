// Deterministic DemoIR demo (v3 item 8): every text node traces to a sourced fact. Shared by the agent loop and demos.generate.
import type {MutationCtx} from "./_generated/server";
import type {Doc,Id} from "./_generated/dataModel";
import {buildIR,irIssues,renderIR} from "../src/lib/revenue-build";
import {demoQa} from "../src/lib/revenue-engine";

export type IRResult={built:true;conceptId:Id<"concepts">}|{fallback:"model";issues:string[]};
export async function tryDemoIR(ctx:MutationCtx,p:Doc<"prospects">):Promise<IRResult>{
 const srcs=await ctx.db.query("sources").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).take(7);
 const facts=srcs.filter(s=>s.url).map(s=>({text:s.summary.split("\n")[0].slice(0,160),sourceUrl:s.url}));
 const ir=buildIR({name:p.name,city:p.city,trade:p.trade,facts});
 const issues=irIssues(ir,facts,true);
 const html=renderIR(ir,facts,"#book");const qa=demoQa(html,facts);
 if(issues.length||!qa.pass)return {fallback:"model",issues:[...issues,...qa.failures]};
 const now=Date.now();
 const conceptId=await ctx.db.insert("concepts",{ownerId:p.ownerId,prospectId:p._id,variant:"A",direction:"Conversion",description:"Deterministic DemoIR render",status:"approved",html,builtAt:now,generator:"demo-ir",qualityScore:100,updatedAt:now});
 await ctx.db.patch(p._id,{stage:"Demo",status:"needs_approval",updatedAt:now});
 await ctx.db.insert("activities",{ownerId:p.ownerId,prospectId:p._id,kind:"ai_demo",summary:"DEMO built from sourced facts (DemoIR, no model); checked, unpublished",timestamp:now});
 return {built:true,conceptId};
}
