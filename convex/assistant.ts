import {mutation,query} from "./_generated/server";
import {v} from "convex/values";
import {owner} from "./identity";
import {answerOperations} from "../src/lib/ops-assistant";
export const history=query({args:{},handler:async ctx=>{
 const user=await owner(ctx);
 const messages=await ctx.db.query("assistantMessages").withIndex("by_owner_time",q=>q.eq("ownerId",user)).order("desc").take(80);
 return messages.reverse();
}});
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
  const answer=answerOperations(prompt,{prospects:prospects.map(p=>({id:p._id,name:p.name,score:p.score,stage:p.stage,status:p.status,trade:p.trade,city:p.city,qualified:p.qualified})),messages:messages.map(m=>({id:m._id,status:m.status,subject:m.subject})),appointments:appointments.map(a=>({id:a._id,startAt:a.startAt,title:a.title,status:a.status})),campaigns:campaigns.map(c=>({key:c.key,enabled:c.enabled,lastRunAt:c.lastRunAt}))});
  const stamp=Date.now();
  await ctx.db.insert("assistantMessages",{ownerId:user,role:"user",text:prompt,createdAt:stamp});
  await ctx.db.insert("assistantMessages",{ownerId:user,role:"assistant",text:answer.text,action:answer.action,prospectId:answer.prospectId,createdAt:stamp+1});
  return answer;
 }
});
