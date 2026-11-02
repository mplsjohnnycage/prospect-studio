// "Book a free 15-minute call" requests made from a prospect's private demo page.
import {internalMutation,internalQuery,mutation} from "./_generated/server";
import {components,internal} from "./_generated/api";
import {v} from "convex/values";
import {RateLimiter,HOUR} from "@convex-dev/rate-limiter";
import {owner} from "./identity";
import {cancelOpenFollowUps} from "./followups";

const limiter=new RateLimiter(components.rateLimiter,{bookingRequest:{kind:"fixed window",rate:5,period:HOUR}});

export const pageContext=internalQuery({
 args:{token:v.string()},
 handler:async(ctx,a)=>{
  const c=await ctx.db.query("concepts").withIndex("by_share_token",q=>q.eq("shareToken",a.token)).unique();
  if(!c||!c.html)return null;
  const p=await ctx.db.get(c.prospectId);
  if(!p||p.status==="blocked")return null;
  return {businessName:p.name,conceptId:c._id,prospectId:p._id,ownerId:p.ownerId};
 }
});

export const create=internalMutation({
 args:{token:v.string(),name:v.string(),phone:v.string(),email:v.string(),preferred:v.string(),note:v.string()},
 handler:async(ctx,a):Promise<{ok:boolean;error?:string}>=>{
  const c=await ctx.db.query("concepts").withIndex("by_share_token",q=>q.eq("shareToken",a.token)).unique();
  if(!c)return {ok:false,error:"This link is no longer available."};
  const p=await ctx.db.get(c.prospectId);
  if(!p||p.status==="blocked")return {ok:false,error:"This link is no longer available."};
  const limited=await limiter.limit(ctx,"bookingRequest",{key:a.token});
  if(!limited.ok)return {ok:false,error:"We already got your request. We'll be in touch soon."};
  const now=Date.now();
  const id=await ctx.db.insert("bookings",{ownerId:p.ownerId,prospectId:p._id,conceptId:c._id,name:a.name,phone:a.phone,email:a.email,preferred:a.preferred,note:a.note,status:"new",createdAt:now});
  if(!["Convert","Produce"].includes(p.stage))await ctx.db.patch(p._id,{stage:"Convert",status:"needs_approval",updatedAt:now});
  await ctx.db.insert("activities",{ownerId:p.ownerId,prospectId:p._id,kind:"call_requested",summary:a.name+" asked for a call from the demo page ("+(a.preferred||"any time")+")",timestamp:now});
  await cancelOpenFollowUps(ctx,p._id,"They asked for a call");
  await ctx.scheduler.runAfter(0,internal.alerts.callRequested,{bookingId:id});
  return {ok:true};
 }
});

export const setStatus=mutation({
 args:{id:v.id("bookings"),status:v.union(v.literal("new"),v.literal("done"))},
 handler:async(ctx,a)=>{
  const user=await owner(ctx);
  const b=await ctx.db.get(a.id);
  if(!b||b.ownerId!==user)throw Error("Not found");
  await ctx.db.patch(b._id,{status:a.status});
  return true;
 }
});

export const openForOwner=internalQuery({
 args:{ownerId:v.string()},
 handler:async(ctx,a)=>{
  const rows=await ctx.db.query("bookings").withIndex("by_owner_time",q=>q.eq("ownerId",a.ownerId)).order("desc").take(50);
  const out=[];
  for(const b of rows){
   if(b.status!=="new")continue;
   const p=await ctx.db.get(b.prospectId);
   out.push({bookingId:b._id as string,prospectId:b.prospectId as string,business:p?.name??"Unknown",name:b.name,phone:b.phone||null,email:b.email||null,preferred:b.preferred,noteFromProspect:b.note||null,requestedAt:new Date(b.createdAt).toISOString()});
  }
  return out;
 }
});
