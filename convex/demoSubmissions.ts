import {mutation,query} from "./_generated/server";
import {v} from "convex/values";
import {owner} from "./identity";
import {requireTopDecile} from "./autopilot";
import {validateDemoSubmission} from "../src/lib/demo-submission";

export const submit=mutation({
 args:{prospectId:v.id("prospects"),conceptId:v.id("concepts"),form:v.object({name:v.string(),email:v.string(),message:v.string()})},
 returns:v.id("demoSubmissions"),
 handler:async(ctx,a)=>{
  const user=await owner(ctx);
  const p=await ctx.db.get(a.prospectId),c=await ctx.db.get(a.conceptId);
  if(!p||p.ownerId!==user||!c||c.ownerId!==user||c.prospectId!==p._id||c.status!=="approved"||!c.html)throw Error("Approved built concept required");
  await requireTopDecile(ctx,p);
  const record=validateDemoSubmission(a.form);
  const now=Date.now();
  const recent=await ctx.db.query("demoSubmissions").withIndex("by_owner_time",q=>q.eq("ownerId",user).gt("createdAt",now-3600000)).take(21);
  if(recent.length>=20)throw Error("Preview test limit reached; try again later");
  const id=await ctx.db.insert("demoSubmissions",{ownerId:user,prospectId:p._id,conceptId:c._id,kind:"preview_test",name:record.name,email:record.email,message:record.message,createdAt:now});
  await ctx.db.insert("activities",{ownerId:user,prospectId:p._id,kind:"preview_test",summary:"Private demo form test recorded; no outbound email sent",timestamp:now});
  return id;
 }
});
export const list=query({
 args:{prospectId:v.id("prospects")},
 handler:async(ctx,a)=>{
  const user=await owner(ctx);
  const p=await ctx.db.get(a.prospectId);
  if(!p||p.ownerId!==user)throw Error("Prospect not found");
  return await ctx.db.query("demoSubmissions").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).order("desc").take(30);
 }
});
