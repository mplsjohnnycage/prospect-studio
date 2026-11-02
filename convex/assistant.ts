// In-app agent. A Gemini function-calling loop over the shared tools in agentTools.ts,
// acting only for the signed-in owner. It can look things up, research, build demos and
// write drafts. Approving and sending stay buttons Johnny presses himself.
import {action,internalMutation,internalQuery,mutation,query} from "./_generated/server";
import {v} from "convex/values";
import {toJsonSchema} from "@convex-dev/mcp";
import {internal} from "./_generated/api";
import {owner} from "./identity";
import {AGENT_TOOLS} from "./agentTools";
import {answerOperations} from "../src/lib/ops-assistant";
import {agentSystemPrompt,runAgentLoop,type FunctionDeclaration} from "../src/lib/agent-loop";
import {modelList} from "../src/lib/gemini";

const stepV=v.object({tool:v.string(),ok:v.boolean(),error:v.optional(v.string())});
const actionV=v.optional(v.union(v.literal("autopilot"),v.literal("inbox"),v.literal("calendar"),v.literal("studio"),v.literal("prospect")));

export const history=query({args:{},handler:async ctx=>{
 const user=await owner(ctx);
 const messages=await ctx.db.query("assistantMessages").withIndex("by_owner_time",q=>q.eq("ownerId",user)).order("desc").take(80);
 return messages.reverse();
}});

export const recent=internalQuery({
 args:{ownerId:v.string()},
 handler:async(ctx,a)=>{
  const rows=await ctx.db.query("assistantMessages").withIndex("by_owner_time",q=>q.eq("ownerId",a.ownerId)).order("desc").take(12);
  const since=Date.now()-6*3600_000; // only keep the current working session as context
  return rows.reverse().filter(r=>r.createdAt>since).map(r=>({role:r.role==="user"?"user" as const:"model" as const,text:r.text.slice(0,2000)}));
 }
});

export const save=internalMutation({
 args:{ownerId:v.string(),role:v.union(v.literal("user"),v.literal("assistant")),text:v.string(),steps:v.optional(v.array(stepV)),action:actionV,prospectId:v.optional(v.string())},
 handler:async(ctx,a)=>{await ctx.db.insert("assistantMessages",{...a,text:a.text.slice(0,8000),createdAt:Date.now()});}
});

export const clear=mutation({args:{},handler:async ctx=>{
 const user=await owner(ctx);
 const rows=await ctx.db.query("assistantMessages").withIndex("by_owner_time",q=>q.eq("ownerId",user)).take(500);
 for(const r of rows)await ctx.db.delete(r._id);
 return rows.length;
}});

function declarations():FunctionDeclaration[]{
 return Object.entries(AGENT_TOOLS).map(([name,t])=>{
  const schema=toJsonSchema(v.object(t.args)) as Record<string,unknown>;
  delete schema.$schema;
  return {name,description:t.description,parametersJsonSchema:schema};
 });
}

export const chat=action({
 args:{text:v.string()},
 handler:async(ctx,a):Promise<{text:string;steps:{tool:string;ok:boolean;error?:string}[];prospectId?:string}>=>{
  const user=await owner(ctx);
  const prompt=a.text.trim();
  if(prompt.length<2||prompt.length>2000)throw Error("Ask something between 2 and 2,000 characters");
  const key=process.env.GEMINI_API_KEY;
  if(!key)throw Error("The agent needs GEMINI_API_KEY on this deployment");
  const past=await ctx.runQuery(internal.assistant.recent,{ownerId:user});
  await ctx.runMutation(internal.assistant.save,{ownerId:user,role:"user",text:prompt});
  let result:{text:string;steps:{tool:string;ok:boolean;error?:string}[];touched:string[]};
  try{
   result=await runAgentLoop({
    apiKey:key,
    models:modelList(process.env.AGENT_MODELS,["gemini-3.5-flash","gemini-flash-latest","gemini-3.8-flash"]),
    system:agentSystemPrompt(new Date().toISOString().slice(0,10)),
    history:past,
    prompt,
    tools:declarations(),
    callTool:async(name,args)=>{
     const t=AGENT_TOOLS[name];
     if(!t)throw Error("Unknown tool "+name);
     return await t.run(ctx,user,args);
    },
   });
  }catch(e){
   result={text:"The agent couldn't reach the model right now ("+(e instanceof Error?e.message:"error").slice(0,160)+"). Nothing was changed. Try again in a minute.",steps:[],touched:[]};
  }
  const prospectId=result.touched.length===1?result.touched[0]:undefined;
  await ctx.runMutation(internal.assistant.save,{ownerId:user,role:"assistant",text:result.text,steps:result.steps,prospectId,action:prospectId?"prospect":undefined});
  return {text:result.text,steps:result.steps,prospectId};
 }
});

// Legacy rule-based answers, kept for the /api/assistant route.
export const ask=mutation({
 args:{text:v.string()},
 returns:v.object({text:v.string(),action:v.optional(v.union(v.literal("autopilot"),v.literal("inbox"),v.literal("calendar"),v.literal("studio"),v.literal("prospect"))),prospectId:v.optional(v.string())}),
 handler:async(ctx,a)=>{
  const user=await owner(ctx);
  const prompt=a.text.trim();
  if(prompt.length<2||prompt.length>500)throw Error("Ask a question between 2 and 500 characters");
  const prospects=await ctx.db.query("prospects").withIndex("by_owner_updated",q=>q.eq("ownerId",user)).order("desc").take(200);
  const messages=await ctx.db.query("outreach").withIndex("by_owner",q=>q.eq("ownerId",user)).take(100);
  const appointments=await ctx.db.query("appointments").withIndex("by_owner_start",q=>q.eq("ownerId",user).gte("startAt",Date.now()-3600000)).take(100);
  const campaigns=await ctx.db.query("campaigns").withIndex("by_owner_key",q=>q.eq("ownerId",user)).take(60);
  const answer=answerOperations(prompt,{prospects:prospects.map(p=>({id:p._id,name:p.name,score:p.score,stage:p.stage,status:p.status,trade:p.trade,city:p.city,qualified:p.qualified})),messages:messages.map(m=>({id:m._id,status:m.status,subject:m.subject})),appointments:appointments.map(x=>({id:x._id,startAt:x.startAt,title:x.title,status:x.status})),campaigns:campaigns.map(c=>({key:c.key,enabled:c.enabled,lastRunAt:c.lastRunAt}))});
  const stamp=Date.now();
  await ctx.db.insert("assistantMessages",{ownerId:user,role:"user",text:prompt,createdAt:stamp});
  await ctx.db.insert("assistantMessages",{ownerId:user,role:"assistant",text:answer.text,action:answer.action,prospectId:answer.prospectId,createdAt:stamp+1});
  return answer;
 }
});
