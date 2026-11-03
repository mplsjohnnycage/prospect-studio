// Outreach send, reply ingestion, suggested replies and deal outcome.
// Every email to a prospect is sent only by an explicit owner action. Sending goes through the
// AgentMail REST API from johnnyc@agentmail.to (AGENTMAIL_INBOX_ID); replies are polled every
// few minutes, opt-outs are suppressed automatically, and a suggested reply waits for approval.
import {action,internalAction,internalMutation,internalQuery,mutation} from "./_generated/server";
import type {ActionCtx} from "./_generated/server";
import {components,internal} from "./_generated/api";
import type {Id} from "./_generated/dataModel";
import {v} from "convex/values";
import {RateLimiter,HOUR} from "@convex-dev/rate-limiter";
import {owner} from "./identity";
import {ensureShareUrl} from "./demos";
import {loadSuppressions} from "./suppressions";
import {isSuppressed,normalizeSuppression} from "../src/lib/suppression";
import {composeOutreach} from "../src/lib/prospect-intelligence";
import {outreachFooter,outreachIssues} from "../src/lib/prospect-signals";
import {addDemoLink,buildReplyPrompt,fallbackReply,firstEmail,isOptOut,REPLY_SYSTEM_PROMPT,senderEmail,stripQuoted} from "../src/lib/sales";
import {generateText,modelList,withModelFallback} from "../src/lib/gemini";
import {cancelOpenFollowUps} from "./followups";
import {markSent as markSentOutcome,logOutcome} from "./outcomes";
import {classifyReply} from "../src/lib/revenue-engine";

const limiter=new RateLimiter(components.rateLimiter,{outreachSend:{kind:"fixed window",rate:40,period:24*HOUR}});
const inbox=()=>process.env.AGENTMAIL_INBOX_ID||"johnnyc@agentmail.to";
export const footerOpts=()=>({postalAddress:process.env.OUTREACH_POSTAL_ADDRESS,senderName:process.env.OUTREACH_SENDER_NAME});
const API="https://api.agentmail.to/v0/inboxes/";
export const LABEL="prospect-studio";

export async function agentmail(path:string,init?:RequestInit){
 const key=process.env.AGENTMAIL_API_KEY;
 if(!key)throw Error("AGENTMAIL_API_KEY is not configured");
 const res=await fetch(API+encodeURIComponent(inbox())+path,{...init,headers:{Authorization:"Bearer "+key,"content-type":"application/json",...(init?.headers??{})},signal:AbortSignal.timeout(30_000)});
 const body=await res.json().catch(()=>({})) as Record<string,unknown>;
 if(!res.ok)throw Error("AgentMail "+res.status+": "+String((body as {message?:string}).message??"request failed").slice(0,200));
 return body;
}

// ---------- Prepare the first email ----------
export const upsertDraft=internalMutation({
 args:{prospectId:v.id("prospects"),ownerId:v.string(),demoUrl:v.string()},
 handler:async(ctx,a):Promise<{outreachId:Id<"outreach">;created:boolean;reapprovalNeeded:boolean}>=>{
  const p=await ctx.db.get(a.prospectId);
  if(!p||p.ownerId!==a.ownerId)throw Error("Prospect not found");
  if(p.status==="blocked")throw Error("This business is blocked or on the do-not-contact list");
  const hit=isSuppressed({contact:p.contact,website:p.website},await loadSuppressions(ctx,p.ownerId));
  if(hit)throw Error("On the do-not-contact list ("+hit.value+")");
  const opts=footerOpts(),now=Date.now();
  const rows=await ctx.db.query("outreach").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).take(20);
  const open=rows.find(r=>r.status==="draft"||r.status==="approved"||r.status==="failed");
  let outreachId:Id<"outreach">,created=false,reapprovalNeeded=false;
  if(!open){
   if(rows.some(r=>r.status==="sent"))throw Error("The first email was already sent. Follow up from the reply thread.");
   const d=composeOutreach({name:p.name,trade:p.trade,city:p.city,findings:p.scoreReasons??[],demoUrl:a.demoUrl},opts);
   outreachId=await ctx.db.insert("outreach",{ownerId:p.ownerId,prospectId:p._id,subject:d.subject,body:d.body,status:"draft",demoUrl:a.demoUrl,updatedAt:now});
   created=true;
  }else{
   outreachId=open._id;
   const stale=!!opts.postalAddress&&!open.body.includes(opts.postalAddress);
   const body=stale?composeOutreach({name:p.name,trade:p.trade,city:p.city,findings:[],demoUrl:a.demoUrl},opts).body:addDemoLink(open.body,a.demoUrl);
   if(body!==open.body){
    reapprovalNeeded=open.status!=="draft";
    await ctx.db.patch(open._id,{body,demoUrl:a.demoUrl,status:"draft",sendError:undefined,updatedAt:now});
   }else if(!open.demoUrl)await ctx.db.patch(open._id,{demoUrl:a.demoUrl,updatedAt:now});
  }
  if(!["Outreach","Convert","Produce"].includes(p.stage))await ctx.db.patch(p._id,{stage:"Outreach",status:"needs_approval",updatedAt:now});
  await ctx.db.insert("activities",{ownerId:p.ownerId,prospectId:p._id,kind:"email_prepared",summary:created?"Email drafted with the private demo link; waiting for your approval":"Demo link added to the draft; waiting for your approval",timestamp:now});
  return {outreachId,created,reapprovalNeeded};
 }
});
export const prepareEmail=action({
 args:{prospectId:v.id("prospects")},
 handler:async(ctx,a):Promise<{outreachId:string;demoUrl:string;created:boolean;reapprovalNeeded:boolean}>=>prepareEmailFor(ctx,await owner(ctx),a.prospectId)
});
/** Drafts (never sends) the first email. Used by the UI action and by the agent tools. */
export async function prepareEmailFor(ctx:Pick<ActionCtx,"runQuery"|"runMutation">,user:string,prospectId:Id<"prospects">){
 const demoUrl=await ensureShareUrl(ctx,prospectId,user);
 const r=await ctx.runMutation(internal.sales.upsertDraft,{prospectId,ownerId:user,demoUrl});
 return {...r,outreachId:r.outreachId as string,demoUrl};
}

// ---------- Send (one explicit click per email) ----------
export const send=mutation({
 args:{outreachId:v.id("outreach")},
 handler:async(ctx,a)=>{
  const user=await owner(ctx);
  const m=await ctx.db.get(a.outreachId);
  if(!m||m.ownerId!==user)throw Error("Draft not found");
  if(m.status==="sent")return {queued:false,to:m.recipient??""};
  if(m.status!=="approved"&&m.status!=="failed")throw Error("Approve the draft before sending");
  if(m.deliveryStatus==="sending")throw Error("This email is already being sent");
  const p=await ctx.db.get(m.prospectId);
  if(!p||p.ownerId!==user)throw Error("Prospect not found");
  if(p.status==="blocked"||p.status==="paused")throw Error("Prospect is paused or blocked");
  const to=firstEmail(p.contact);
  if(!to)throw Error("No email address on file for this business. Add one to the contact field first.");
  const hit=isSuppressed({contact:to,website:p.website},await loadSuppressions(ctx,user));
  if(hit)throw Error("On the do-not-contact list ("+hit.value+")");
  const opts=footerOpts();
  if(!opts.postalAddress)throw Error("OUTREACH_POSTAL_ADDRESS is not configured");
  if(!m.body.includes(opts.postalAddress))throw Error("This draft is missing the mailing-address footer. Use Prepare email to rebuild it.");
  const issues=outreachIssues(m.body,opts);
  if(issues.length)throw Error(issues[0]);
  if(!process.env.AGENTMAIL_API_KEY)throw Error("AGENTMAIL_API_KEY is not configured");
  await limiter.limit(ctx,"outreachSend",{key:user,throws:true});
  await ctx.db.patch(m._id,{deliveryStatus:"sending",recipient:to,sendError:undefined,updatedAt:Date.now()});
  await ctx.scheduler.runAfter(0,internal.sales.deliver,{outreachId:m._id});
  return {queued:true,to};
 }
});
export const forDelivery=internalQuery({
 args:{outreachId:v.id("outreach")},
 handler:async(ctx,a)=>{const m=await ctx.db.get(a.outreachId);return m&&m.deliveryStatus==="sending"?{to:m.recipient??"",subject:m.subject,body:m.body}:null;}
});
export const deliver=internalAction({
 args:{outreachId:v.id("outreach")},
 handler:async(ctx,a)=>{
  const m=await ctx.runQuery(internal.sales.forDelivery,{outreachId:a.outreachId});
  if(!m||!m.to)return;
  try{
   const r=await agentmail("/messages/send",{method:"POST",body:JSON.stringify({to:[m.to],subject:m.subject,text:m.body,labels:[LABEL]})});
   await ctx.runMutation(internal.sales.markSent,{outreachId:a.outreachId,messageId:String(r.message_id??""),threadId:String(r.thread_id??"")});
  }catch(e){
   await ctx.runMutation(internal.sales.markFailed,{outreachId:a.outreachId,error:e instanceof Error?e.message:"Send failed"});
  }
 }
});
export const markSent=internalMutation({
 args:{outreachId:v.id("outreach"),messageId:v.string(),threadId:v.string()},
 handler:async(ctx,a)=>{
  const m=await ctx.db.get(a.outreachId);if(!m)return;
  const now=Date.now();
  await ctx.db.patch(m._id,{status:"sent",deliveryStatus:"sent",outboundId:a.messageId,threadId:a.threadId,sentAt:now,updatedAt:now});
  const p=await ctx.db.get(m.prospectId);
  if(p&&!["Convert","Produce"].includes(p.stage))await ctx.db.patch(p._id,{stage:"Outreach",status:"running",updatedAt:now});
  await markSentOutcome(ctx,m.ownerId,m._id,m.prospectId);
  await ctx.db.insert("activities",{ownerId:m.ownerId,prospectId:m.prospectId,kind:"email_sent",summary:"Email sent to "+(m.recipient??"")+" from "+inbox(),timestamp:now});
 }
});
export const markFailed=internalMutation({
 args:{outreachId:v.id("outreach"),error:v.string()},
 handler:async(ctx,a)=>{
  const m=await ctx.db.get(a.outreachId);if(!m)return;
  await ctx.db.patch(m._id,{status:"failed",deliveryStatus:"failed",sendError:a.error.slice(0,300),updatedAt:Date.now()});
  await ctx.db.insert("activities",{ownerId:m.ownerId,prospectId:m.prospectId,kind:"email_failed",summary:"Email not sent: "+a.error.slice(0,160),timestamp:Date.now()});
 }
});

// ---------- Reply polling ----------
export const pollState=internalQuery({
 args:{},
 handler:async ctx=>{
  const since=Date.now()-60*24*3600_000;
  const sent=await ctx.db.query("outreach").withIndex("by_status_sent",q=>q.eq("status","sent").gt("sentAt",since)).take(500);
  const last=await ctx.db.query("syncState").withIndex("by_key",q=>q.eq("key","mailPollAt")).unique();
  return {threads:sent.filter(s=>s.threadId).map(s=>({outreachId:s._id,threadId:s.threadId!})),lastPollAt:last?.value??0};
 }
});
export const setPollState=internalMutation({
 args:{value:v.number()},
 handler:async(ctx,a)=>{
  const row=await ctx.db.query("syncState").withIndex("by_key",q=>q.eq("key","mailPollAt")).unique();
  if(row)await ctx.db.patch(row._id,{value:a.value});else await ctx.db.insert("syncState",{key:"mailPollAt",value:a.value});
 }
});
type ApiMessage={message_id:string;thread_id:string;from:string;subject?:string;text?:string;extracted_text?:string;labels?:string[];timestamp?:string};
export const pollReplies=internalAction({
 args:{},
 handler:async ctx=>{
  if(!process.env.AGENTMAIL_API_KEY)return {skipped:"no key"};
  const state=await ctx.runQuery(internal.sales.pollState,{});
  if(!state.threads.length)return {threads:0};
  const startedAt=Date.now();
  const after=new Date(Math.max(0,(state.lastPollAt||startedAt-24*3600_000)-15*60_000)).toISOString();
  const list=await agentmail("/threads?labels="+LABEL+"&limit=100&after="+encodeURIComponent(after)) as {threads?:{thread_id:string}[]};
  const ours=new Map(state.threads.map(t=>[t.threadId,t.outreachId]));
  let ingested=0;
  for(const t of (list.threads??[]).filter(t=>ours.has(t.thread_id)).slice(0,40)){
   const thread=await agentmail("/threads/"+encodeURIComponent(t.thread_id)) as {messages?:ApiMessage[]};
   for(const m of thread.messages??[]){
    const labels=m.labels??[];
    if(!labels.includes("received")||labels.includes("sent")||senderEmail(m.from)===inbox().toLowerCase())continue;
    const added=await ctx.runMutation(internal.sales.ingestReply,{outreachId:ours.get(t.thread_id)!,messageId:m.message_id,threadId:m.thread_id,from:m.from,subject:m.subject??"",text:stripQuoted(m.extracted_text||m.text||"").slice(0,8000),receivedAt:m.timestamp?Date.parse(m.timestamp)||startedAt:startedAt});
    if(added)ingested++;
   }
  }
  await ctx.runMutation(internal.sales.setPollState,{value:startedAt});
  return {ingested};
 }
});
export const ingestReply=internalMutation({
 args:{outreachId:v.id("outreach"),messageId:v.string(),threadId:v.string(),from:v.string(),subject:v.string(),text:v.string(),receivedAt:v.number()},
 handler:async(ctx,a)=>{
  if(await ctx.db.query("replies").withIndex("by_message",q=>q.eq("messageId",a.messageId)).unique())return false;
  const o=await ctx.db.get(a.outreachId);if(!o)return false;
  const p=await ctx.db.get(o.prospectId);if(!p)return false;
  const optOut=isOptOut(a.text),now=Date.now();
  await cancelOpenFollowUps(ctx,p._id,"They replied");
  const replyId=await ctx.db.insert("replies",{ownerId:o.ownerId,prospectId:p._id,outreachId:o._id,messageId:a.messageId,threadId:a.threadId,from:a.from.slice(0,300),subject:a.subject.slice(0,300),text:a.text,optOut,receivedAt:a.receivedAt});
  const intent=classifyReply(a.text);
  await logOutcome(ctx,{ownerId:o.ownerId,prospectId:p._id,kind:optOut?"lost":"replied",intent:intent.intent,...(optOut?{reason:"opt_out_reply"}:{})});
  await ctx.db.insert("activities",{ownerId:o.ownerId,prospectId:p._id,kind:"reply_routed",summary:"Reply intent "+intent.intent+" -> "+intent.route,timestamp:now});
  if(optOut){
   const email=normalizeSuppression(senderEmail(a.from));
   if(email&&!(await ctx.db.query("suppressions").withIndex("by_owner_value",q=>q.eq("ownerId",o.ownerId).eq("value",email.value)).first()))
    await ctx.db.insert("suppressions",{ownerId:o.ownerId,kind:email.kind,value:email.value,reason:"Replied asking not to be contacted",createdAt:now});
   await ctx.db.patch(p._id,{status:"blocked",updatedAt:now});
   await ctx.db.insert("activities",{ownerId:o.ownerId,prospectId:p._id,kind:"opt_out",summary:"Reply asked not to be contacted; added to do-not-contact list and blocked",timestamp:now});
  }else{
   await ctx.db.patch(p._id,{stage:"Convert",status:"needs_approval",updatedAt:now});
   await ctx.db.insert("activities",{ownerId:o.ownerId,prospectId:p._id,kind:"reply_received",summary:"Reply from "+senderEmail(a.from)+"; suggested response being drafted",timestamp:now});
   await ctx.scheduler.runAfter(0,internal.sales.suggestReply,{replyId});
  }
  return true;
 }
});

// ---------- Suggested reply (waits for approval) ----------
export const replyContext=internalQuery({
 args:{replyId:v.id("replies")},
 handler:async(ctx,a)=>{
  const r=await ctx.db.get(a.replyId);if(!r)return null;
  const p=await ctx.db.get(r.prospectId),o=await ctx.db.get(r.outreachId);
  if(!p||!o)return null;
  return {ownerId:r.ownerId,prospectId:p._id,business:p.name,trade:p.trade,city:p.city,theirReply:r.text,ourEmail:o.body,demoUrl:o.demoUrl};
 }
});
export const saveReplyDraft=internalMutation({
 args:{replyId:v.id("replies"),body:v.string(),generator:v.string()},
 handler:async(ctx,a)=>{
  const r=await ctx.db.get(a.replyId);if(!r)return;
  if(await ctx.db.query("replyDrafts").withIndex("by_reply",q=>q.eq("replyId",a.replyId)).first())return;
  await ctx.db.insert("replyDrafts",{ownerId:r.ownerId,prospectId:r.prospectId,replyId:r._id,body:a.body.slice(0,6000),status:"draft",generator:a.generator,updatedAt:Date.now()});
 }
});
export const suggestReply=internalAction({
 args:{replyId:v.id("replies")},
 handler:async(ctx,a)=>{
  const c=await ctx.runQuery(internal.sales.replyContext,{replyId:a.replyId});
  if(!c)return;
  const bookingUrl=process.env.OUTREACH_BOOKING_URL||undefined;
  let body=fallbackReply({bookingUrl}),generator="template";
  const key=process.env.GEMINI_API_KEY;
  if(key){
   try{
    const r=await withModelFallback(modelList(process.env.REPLY_MODELS,["gemini-3.5-flash","gemini-flash-latest","gemini-flash-lite-latest"]),m=>generateText({apiKey:key,model:m,system:REPLY_SYSTEM_PROMPT,prompt:buildReplyPrompt({...c,bookingUrl}),temperature:0.6,maxOutputTokens:2048,timeoutMs:60_000}));
    const text=r.text.trim();
    if(text.length>20&&!/\$\s?\d/.test(text)){body=text;generator=r.model;}
   }catch{/* keep the template reply */}
  }
  await ctx.runMutation(internal.sales.saveReplyDraft,{replyId:a.replyId,body,generator});
 }
});

export const sendReply=mutation({
 args:{draftId:v.id("replyDrafts"),body:v.string()},
 handler:async(ctx,a)=>{
  const user=await owner(ctx);
  const d=await ctx.db.get(a.draftId);
  if(!d||d.ownerId!==user)throw Error("Reply draft not found");
  if(d.status==="sent")return {queued:false};
  if(d.outboundId==="pending")throw Error("This reply is already being sent");
  const text=a.body.trim();
  if(text.length<2||text.length>6000)throw Error("Reply must be 2 to 6,000 characters");
  const r=await ctx.db.get(d.replyId);if(!r)throw Error("Original reply not found");
  const hit=isSuppressed({contact:senderEmail(r.from)},await loadSuppressions(ctx,user));
  if(hit||r.optOut)throw Error("This person asked not to be contacted");
  if(!process.env.AGENTMAIL_API_KEY)throw Error("AGENTMAIL_API_KEY is not configured");
  await limiter.limit(ctx,"outreachSend",{key:user,throws:true});
  const footer=outreachFooter(footerOpts());
  await ctx.db.patch(d._id,{body:text.includes("not hear from me")?text:text+"\n"+footer,outboundId:"pending",updatedAt:Date.now()});
  await ctx.scheduler.runAfter(0,internal.sales.deliverReply,{draftId:d._id});
  return {queued:true};
 }
});
export const forReplyDelivery=internalQuery({
 args:{draftId:v.id("replyDrafts")},
 handler:async(ctx,a)=>{
  const d=await ctx.db.get(a.draftId);if(!d||d.outboundId!=="pending")return null;
  const r=await ctx.db.get(d.replyId);
  return r?{messageId:r.messageId,body:d.body}:null;
 }
});
export const deliverReply=internalAction({
 args:{draftId:v.id("replyDrafts")},
 handler:async(ctx,a)=>{
  const d=await ctx.runQuery(internal.sales.forReplyDelivery,{draftId:a.draftId});
  if(!d)return;
  try{
   const r=await agentmail("/messages/"+encodeURIComponent(d.messageId)+"/reply",{method:"POST",body:JSON.stringify({text:d.body,labels:[LABEL]})});
   await ctx.runMutation(internal.sales.markReplySent,{draftId:a.draftId,messageId:String(r.message_id??""),ok:true,error:""});
  }catch(e){
   await ctx.runMutation(internal.sales.markReplySent,{draftId:a.draftId,messageId:"",ok:false,error:e instanceof Error?e.message:"Send failed"});
  }
 }
});
export const markReplySent=internalMutation({
 args:{draftId:v.id("replyDrafts"),messageId:v.string(),ok:v.boolean(),error:v.string()},
 handler:async(ctx,a)=>{
  const d=await ctx.db.get(a.draftId);if(!d)return;
  const now=Date.now();
  await ctx.db.patch(d._id,a.ok?{status:"sent",outboundId:a.messageId,sentAt:now,updatedAt:now}:{status:"failed",outboundId:undefined,updatedAt:now});
  await ctx.db.insert("activities",{ownerId:d.ownerId,prospectId:d.prospectId,kind:a.ok?"reply_sent":"reply_failed",summary:a.ok?"Your reply was sent":"Reply not sent: "+a.error.slice(0,160),timestamp:now});
 }
});

// ---------- Deal outcome ----------
export const markOutcome=mutation({
 args:{prospectId:v.id("prospects"),outcome:v.union(v.literal("won"),v.literal("lost")),amount:v.optional(v.number()),note:v.optional(v.string())},
 handler:async(ctx,a)=>{
  const user=await owner(ctx);
  const p=await ctx.db.get(a.prospectId);
  if(!p||p.ownerId!==user)throw Error("Prospect not found");
  if(a.amount!==undefined&&(!Number.isFinite(a.amount)||a.amount<0||a.amount>1_000_000))throw Error("Invalid amount");
  const now=Date.now(),note=(a.note??"").slice(0,300);
  if(a.outcome==="won"){
   await ctx.db.patch(p._id,{stage:"Produce",status:"succeeded",notes:(p.notes?p.notes+"\n":"")+"Won"+(a.amount!==undefined?" · $"+a.amount.toLocaleString("en-US"):"")+(note?" · "+note:""),updatedAt:now});
   await ctx.db.insert("activities",{ownerId:user,prospectId:p._id,kind:"deal_won",summary:"Deal won"+(a.amount!==undefined?" for $"+a.amount.toLocaleString("en-US"):"")+(note?": "+note:""),timestamp:now});
  }else{
   await ctx.db.patch(p._id,{status:"failed",updatedAt:now});
   await ctx.db.insert("activities",{ownerId:user,prospectId:p._id,kind:"deal_lost",summary:"Marked lost"+(note?": "+note:""),timestamp:now});
  }
  return {ok:true};
 }
});
