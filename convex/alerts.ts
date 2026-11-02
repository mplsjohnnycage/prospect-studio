// Real-time alerts to Johnny: a prospect opened their demo, or asked for a call.
// Sent by email from the AgentMail inbox to ALERT_EMAIL (or OWNER_EMAIL), labelled "alert" so
// the reply poller never mistakes them for prospect replies. Set ALERTS_DISABLED=1 to stop them.
import {internalAction,internalQuery} from "./_generated/server";
import {internal} from "./_generated/api";
import {v} from "convex/values";

const API="https://api.agentmail.to/v0/inboxes/";

export async function sendAlertEmail(subject:string,text:string):Promise<boolean>{
 const key=process.env.AGENTMAIL_API_KEY,inbox=process.env.AGENTMAIL_INBOX_ID,to=process.env.ALERT_EMAIL||process.env.OWNER_EMAIL;
 if(!key||!inbox||!to||process.env.ALERTS_DISABLED==="1")return false;
 const res=await fetch(API+encodeURIComponent(inbox)+"/messages/send",{method:"POST",headers:{Authorization:"Bearer "+key,"content-type":"application/json"},body:JSON.stringify({to:[to],subject:subject.slice(0,200),text,labels:["alert"]}),signal:AbortSignal.timeout(20_000)});
 return res.ok;
}
const appUrl=()=>(process.env.SITE_URL||"").replace(/\/$/,"");

export const demoContext=internalQuery({
 args:{conceptId:v.id("concepts")},
 handler:async(ctx,a)=>{
  const c=await ctx.db.get(a.conceptId);if(!c)return null;
  const p=await ctx.db.get(c.prospectId);if(!p)return null;
  return {name:p.name,trade:p.trade,city:p.city,contact:p.contact,views:c.views??0};
 }
});

export const demoOpened=internalAction({
 args:{conceptId:v.id("concepts"),firstTime:v.boolean()},
 handler:async(ctx,a)=>{
  const c=await ctx.runQuery(internal.alerts.demoContext,{conceptId:a.conceptId});
  if(!c)return;
  const phone=/\d{3}.*\d{4}/.test(c.contact)&&!c.contact.includes("@")?c.contact:"";
  const subject=(a.firstTime?"🔥 ":"👀 ")+c.name+(a.firstTime?" just opened their demo":" came back to their demo");
  const text=[
   `${c.name} (${c.trade}, ${c.city}) ${a.firstTime?"just opened the demo you sent":"is looking at their demo again"} (${c.views} ${c.views===1?"view":"views"} so far).`,
   "",
   phone?`This is the best moment to reach out. Call: ${phone}`:"This is the best moment to follow up.",
   appUrl()?`Open Prospect Studio: ${appUrl()}`:"",
  ].filter(x=>x!==undefined).join("\n");
  await sendAlertEmail(subject,text);
 }
});

export const bookingContext=internalQuery({
 args:{bookingId:v.id("bookings")},
 handler:async(ctx,a)=>{
  const b=await ctx.db.get(a.bookingId);if(!b)return null;
  const p=await ctx.db.get(b.prospectId);
  return {business:p?.name??"A prospect",trade:p?.trade??"",city:p?.city??"",name:b.name,phone:b.phone,email:b.email,preferred:b.preferred,note:b.note};
 }
});

export const callRequested=internalAction({
 args:{bookingId:v.id("bookings")},
 handler:async(ctx,a)=>{
  const b=await ctx.runQuery(internal.alerts.bookingContext,{bookingId:a.bookingId});
  if(!b)return;
  const text=[
   `${b.name} from ${b.business} (${b.trade}, ${b.city}) asked for a call from their demo page.`,
   "",
   b.phone?`Phone: ${b.phone}`:"",
   b.email?`Email: ${b.email}`:"",
   `Best time: ${b.preferred||"not given"}`,
   b.note?`Their note (written by them): ${b.note}`:"",
   "",
   appUrl()?`Open Prospect Studio: ${appUrl()}`:"",
  ].filter(Boolean).join("\n");
  await sendAlertEmail("📅 Call request: "+b.business,text);
 }
});

export const proposalContext=internalQuery({
 args:{proposalId:v.id("proposals")},
 handler:async(ctx,a)=>{
  const r=await ctx.db.get(a.proposalId);if(!r)return null;
  const p=await ctx.db.get(r.prospectId);
  const pkg=r.packages.find(x=>x.name===r.acceptedPackage);
  return {business:p?.name??"A prospect",contact:p?.contact??"",acceptedPackage:r.acceptedPackage,acceptedBy:r.acceptedBy,setup:pkg?.setup,monthly:pkg?.monthly,hasPaymentLink:!!pkg?.paymentUrl};
 }
});

export const proposalEvent=internalAction({
 args:{proposalId:v.id("proposals"),event:v.union(v.literal("viewed"),v.literal("accepted"))},
 handler:async(ctx,a)=>{
  const c=await ctx.runQuery(internal.alerts.proposalContext,{proposalId:a.proposalId});
  if(!c)return;
  if(a.event==="viewed"){
   await sendAlertEmail("👀 "+c.business+" opened your proposal",[`${c.business} just opened the proposal you sent.`,c.contact?`Contact: ${c.contact}`:"",appUrl()?`Open Prospect Studio: ${appUrl()}`:""].filter(Boolean).join("\n"));
  }else{
   await sendAlertEmail("✅ "+c.business+" chose "+(c.acceptedPackage??"a package"),[`${c.acceptedBy?.name??"They"} (${c.acceptedBy?.email??"no email"}) chose ${c.acceptedPackage} for ${c.business}: $${(c.setup??0).toLocaleString("en-US")}${c.monthly?` + $${c.monthly}/month`:""}.`,c.hasPaymentLink?"They were shown your deposit payment link.":"Reach out to confirm details and take the deposit.","When it's paid, mark the deal won in the Outreach tab.",appUrl()?`Open Prospect Studio: ${appUrl()}`:""].filter(Boolean).join("\n"));
  }
 }
});
