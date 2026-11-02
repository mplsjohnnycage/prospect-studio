// Follow-ups for first emails that got no answer: step 1 on day 3, step 2 four days after
// step 1 is sent. They are only drafted automatically; Johnny approves and sends each one.
// They are sent as a reply in the same thread, and any reply, call request or opt-out cancels them.
import {internalAction,internalMutation,internalQuery,mutation} from "./_generated/server";
import {components,internal} from "./_generated/api";
import {v} from "convex/values";
import {RateLimiter,HOUR} from "@convex-dev/rate-limiter";
import {owner} from "./identity";
import {agentmail,footerOpts,LABEL} from "./sales";
import {loadSuppressions} from "./suppressions";
import {isSuppressed} from "../src/lib/suppression";
import {outreachFooter} from "../src/lib/prospect-signals";
import {followUpText} from "../src/lib/sales";

const DAY=24*3600_000;
// Same name and config as in sales.ts, so follow-ups share the daily send cap.
const limiter=new RateLimiter(components.rateLimiter,{outreachSend:{kind:"fixed window",rate:40,period:24*HOUR}});

export const planDue=internalMutation({
 args:{},
 handler:async ctx=>{
  const now=Date.now();
  const sent=await ctx.db.query("outreach").withIndex("by_status_sent",q=>q.eq("status","sent").gte("sentAt",now-30*DAY)).take(500);
  const opts=footerOpts();
  if(!opts.postalAddress)return {created:0,skipped:"no postal address"};
  let created=0;
  for(const o of sent){
   if(!o.outboundId||!o.sentAt)continue;
   const p=await ctx.db.get(o.prospectId);
   if(!p||p.status==="blocked"||p.status==="paused"||p.status==="succeeded"||p.status==="failed")continue;
   if(await ctx.db.query("replies").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).first())continue;
   if(await ctx.db.query("bookings").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).first())continue;
   const fus=await ctx.db.query("followups").withIndex("by_outreach",q=>q.eq("outreachId",o._id)).take(5);
   let step:1|2|null=null,base=0,wait=0;
   if(!fus.length){step=1;base=o.sentAt;wait=3*DAY;}
   else if(fus.length===1&&fus[0].status==="sent"&&fus[0].sentAt){step=2;base=fus[0].sentAt;wait=4*DAY;}
   if(!step||now-base<wait)continue;
   const body=followUpText(step,{name:p.name,demoUrl:o.demoUrl})+"\n"+outreachFooter(opts);
   await ctx.db.insert("followups",{ownerId:o.ownerId,prospectId:p._id,outreachId:o._id,step,subject:o.subject.startsWith("Re:")?o.subject:"Re: "+o.subject,body,status:"draft",updatedAt:now});
   await ctx.db.insert("activities",{ownerId:o.ownerId,prospectId:p._id,kind:"followup_drafted",summary:"Follow-up "+step+" drafted (no reply yet); waiting for your approval",timestamp:now});
   created++;
  }
  return {created};
 }
});

/** Cancels open follow-up drafts when the prospect replies, books a call or opts out. */
export async function cancelOpenFollowUps(ctx:{db:import("./_generated/server").MutationCtx["db"]},prospectId:import("./_generated/dataModel").Id<"prospects">,reason:string){
 const rows=await ctx.db.query("followups").withIndex("by_prospect",q=>q.eq("prospectId",prospectId)).take(10);
 for(const f of rows)if(f.status==="draft"||f.status==="failed")await ctx.db.patch(f._id,{status:"skipped",sendError:reason,updatedAt:Date.now()});
}

export const send=mutation({
 args:{id:v.id("followups"),body:v.string()},
 handler:async(ctx,a)=>{
  const user=await owner(ctx);
  const f=await ctx.db.get(a.id);
  if(!f||f.ownerId!==user)throw Error("Follow-up not found");
  if(f.status==="sent")return {queued:false};
  if(f.status!=="draft"&&f.status!=="failed")throw Error("This follow-up was skipped");
  if(f.deliveryStatus==="sending")throw Error("This follow-up is already being sent");
  const o=await ctx.db.get(f.outreachId),p=await ctx.db.get(f.prospectId);
  if(!o||!p||!o.outboundId)throw Error("Original email not found");
  if(p.status==="blocked"||p.status==="paused")throw Error("Prospect is paused or blocked");
  if(await ctx.db.query("replies").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).first())throw Error("They already replied. Answer from the Replies card instead.");
  const hit=isSuppressed({contact:o.recipient??p.contact,website:p.website},await loadSuppressions(ctx,user));
  if(hit)throw Error("On the do-not-contact list ("+hit.value+")");
  const opts=footerOpts();
  if(!opts.postalAddress)throw Error("OUTREACH_POSTAL_ADDRESS is not configured");
  const text=a.body.trim();
  if(text.length<10||text.length>4000)throw Error("Follow-up must be 10 to 4,000 characters");
  const body=text.includes(opts.postalAddress)?text:text+"\n"+outreachFooter(opts);
  if(!process.env.AGENTMAIL_API_KEY)throw Error("AGENTMAIL_API_KEY is not configured");
  await limiter.limit(ctx,"outreachSend",{key:user,throws:true});
  await ctx.db.patch(f._id,{body,deliveryStatus:"sending",sendError:undefined,updatedAt:Date.now()});
  await ctx.scheduler.runAfter(0,internal.followups.deliver,{id:f._id});
  return {queued:true};
 }
});

export const skip=mutation({
 args:{id:v.id("followups")},
 handler:async(ctx,a)=>{
  const user=await owner(ctx);
  const f=await ctx.db.get(a.id);
  if(!f||f.ownerId!==user)throw Error("Follow-up not found");
  if(f.status==="sent")throw Error("Already sent");
  await ctx.db.patch(f._id,{status:"skipped",updatedAt:Date.now()});
  return true;
 }
});

export const forDelivery=internalQuery({
 args:{id:v.id("followups")},
 handler:async(ctx,a)=>{
  const f=await ctx.db.get(a.id);if(!f||f.deliveryStatus!=="sending")return null;
  const o=await ctx.db.get(f.outreachId);
  return o?.outboundId?{messageId:o.outboundId,body:f.body}:null;
 }
});
export const deliver=internalAction({
 args:{id:v.id("followups")},
 handler:async(ctx,a)=>{
  const f=await ctx.runQuery(internal.followups.forDelivery,{id:a.id});
  if(!f)return;
  try{
   const r=await agentmail("/messages/"+encodeURIComponent(f.messageId)+"/reply",{method:"POST",body:JSON.stringify({text:f.body,labels:[LABEL]})}) as {message_id?:string};
   await ctx.runMutation(internal.followups.markSent,{id:a.id,ok:true,messageId:String(r.message_id??""),error:""});
  }catch(e){
   await ctx.runMutation(internal.followups.markSent,{id:a.id,ok:false,messageId:"",error:e instanceof Error?e.message:"Send failed"});
  }
 }
});
export const markSent=internalMutation({
 args:{id:v.id("followups"),ok:v.boolean(),messageId:v.string(),error:v.string()},
 handler:async(ctx,a)=>{
  const f=await ctx.db.get(a.id);if(!f)return;
  const now=Date.now();
  await ctx.db.patch(f._id,a.ok?{status:"sent",deliveryStatus:"sent",outboundId:a.messageId,sentAt:now,updatedAt:now}:{status:"failed",deliveryStatus:"failed",sendError:a.error.slice(0,300),updatedAt:now});
  await ctx.db.insert("activities",{ownerId:f.ownerId,prospectId:f.prospectId,kind:a.ok?"followup_sent":"followup_failed",summary:a.ok?"Follow-up "+f.step+" sent":"Follow-up not sent: "+a.error.slice(0,160),timestamp:now});
 }
});
