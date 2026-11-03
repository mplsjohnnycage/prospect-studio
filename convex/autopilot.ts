import {BUILD_LEASE_MS,decideBuildClaim,requireBuildClaim,validateBuildClaimId} from "../src/lib/build-lease";
import {placesDiscovery} from "./places";
import {action,internalAction,internalMutation,internalQuery,mutation,query} from "./_generated/server";
import {components,internal} from "./_generated/api";
import {v} from "convex/values";
import {RateLimiter,HOUR} from "@convex-dev/rate-limiter";
import {owner} from "./identity";
import {directions} from "../src/lib/domain";
import {candidateFromSearch,qualifyBusiness} from "../src/lib/prospect-intelligence";
import {demoQa,recheck,siteHealth,selectDemoBudget,composeWhyNow,paidSourceAllowed,POSTAL_ADDRESS,type TriggerType,type GateResult} from "../src/lib/revenue-engine";
import {logStageCost} from "./outcomes";
import {loadSuppressions} from "./suppressions";
import {isSuppressed} from "../src/lib/suppression";
import {assessOpportunity,buildSearchQueries,extractContacts,rankScore,siteKey,websiteVariants} from "../src/lib/prospect-signals";
import type {MutationCtx,QueryCtx} from "./_generated/server";
import type {ActionCtx} from "./_generated/server";
import type {Doc} from "./_generated/dataModel";

const limiter=new RateLimiter(components.rateLimiter,{discovery:{kind:"fixed window",rate:4,period:HOUR}});
export const cohort=(trade:string,city:string)=>(trade.trim().toLowerCase()+"::"+city.trim().toLowerCase()).slice(0,320);
const candidateArg=v.object({name:v.string(),website:v.string(),trade:v.string(),city:v.string(),description:v.string(),markdown:v.string(),url:v.string(),score:v.number(),qualified:v.boolean(),reasons:v.array(v.string()),evidence:v.array(v.string()),opportunity:v.optional(v.number()),contact:v.optional(v.string())});
export async function ranked(ctx:QueryCtx|MutationCtx,ownerId:string,key:string) {
 const pool=await ctx.db.query("prospects").withIndex("by_owner_campaign",q=>q.eq("ownerId",ownerId).eq("campaignKey",key)).take(1001);
 if(pool.length>1000)throw Error("Cohort exceeds 1,000 prospects; automatic demo generation paused for safe pagination");
 const qualified=pool.filter(p=>p.qualified===true&&p.status!=="paused"&&p.status!=="blocked");
 // v3 item 2: daily hand-approval capacity replaces the old floor(pool/10) rule.
 const capacity=Number(process.env.DAILY_DEMO_CAPACITY)||10;
 const dayStart=Date.now()-86_400_000;
 const built=(p:Doc<"prospects">)=>["Demo","Outreach","Convert","Produce"].includes(p.stage);
 const usedToday=qualified.filter(p=>built(p)&&p.updatedAt>=dayStart).length;
 const demoIds=selectDemoBudget(qualified.map(p=>({id:p._id,score:rankScore(p.score,p.opportunity),qualified:true,paused:false,tier:p.tier as GateResult["tier"]|undefined,alreadyBuilt:built(p),trigger:p.triggerType?{type:p.triggerType as TriggerType,date:p.triggerDate,source:p.triggerSource}:undefined})),{dailyCapacity:capacity,usedToday,scoreFloor:Number(process.env.DEMO_SCORE_FLOOR)||50}).map(p=>p.id);
 return {pool,qualified,demoIds};
}
export async function requireTopDecile(ctx:MutationCtx,p:Doc<"prospects">) {
 if(!p.campaignKey||!p.qualified)throw Error("Demo generation requires an automatically qualified research cohort");
 const rank=await ranked(ctx,p.ownerId,p.campaignKey);
 if(!rank.demoIds.includes(p._id))throw Error("Outside today's demo budget (DAILY_DEMO_CAPACITY) or below the score floor");
}
export const rankedCampaign=query({
 args:{trade:v.string(),city:v.string()},
 returns:v.any(),
 handler:async(ctx,a)=>{
  const user=await owner(ctx);
  const rank=await ranked(ctx,user,cohort(a.trade,a.city));
  return {total:rank.pool.length,qualified:rank.qualified.length,demoBudget:rank.demoIds.length,eligibleIds:rank.demoIds,eligible:rank.demoIds.map(id=>{const p=rank.pool.find(x=>x._id===id)!;return {id:p._id,name:p.name,score:p.score,stage:p.stage,website:p.website};}),dailyCapacity:Number(process.env.DAILY_DEMO_CAPACITY)||10};
 }
});
export const upsert=internalMutation({
 args:{ownerId:v.string(),campaignKey:v.string(),candidate:candidateArg},
 returns:v.string(),
 handler:async(ctx,a)=>{
  const c=a.candidate;
  let existing=null;
  for(const site of websiteVariants(c.website)){
   existing=await ctx.db.query("prospects").withIndex("by_owner_campaign_website",q=>q.eq("ownerId",a.ownerId).eq("campaignKey",a.campaignKey).eq("website",site)).first();
   if(existing)break;
  }
  const stamp=Date.now();
  const changes={name:c.name.slice(0,160),website:c.website,trade:c.trade.slice(0,120),city:c.city.slice(0,160),score:c.score,qualified:c.qualified,...(c.opportunity!==undefined?{opportunity:Math.max(0,Math.min(100,c.opportunity))}:{}),scoreReasons:c.reasons.slice(0,14),evidence:c.evidence.slice(0,5),updatedAt:stamp};
  if(existing){
   if(existing.status!=="paused"&&existing.status!=="blocked"&&!["Demo","Outreach","Convert","Produce"].includes(existing.stage)){
    await ctx.db.patch(existing._id,{...changes,...(!existing.contact&&c.contact?{contact:c.contact.slice(0,250)}:{})});
   }
   return existing._id;
  }
  const suppressedHit=isSuppressed({contact:c.contact,website:c.website},await loadSuppressions(ctx,a.ownerId));
  const id=await ctx.db.insert("prospects",{...changes,ownerId:a.ownerId,campaignKey:a.campaignKey,contact:(c.contact??"").slice(0,250),notes:"Source: "+c.url+"\n"+c.reasons.join("; ")+(suppressedHit?"\nOn the do-not-contact list ("+suppressedHit.value+")":""),stage:"Qualify",status:suppressedHit?"blocked":(c.qualified?"queued":"needs_approval"),source:"firecrawl-search"});
  await ctx.db.insert("sources",{ownerId:a.ownerId,prospectId:id,url:c.url,summary:(c.description+"\n"+c.markdown).slice(0,12000),checksum:"",verifiedAt:stamp});
  await ctx.db.insert("activities",{ownerId:a.ownerId,prospectId:id,kind:"discovered",summary:"Public web search indexed and qualified: score "+c.score+"; "+(c.qualified?"passed":"review"),timestamp:stamp});
  return id;
 }
});
export const discover=action({
 args:{trade:v.string(),city:v.string()},
 returns:v.any(),
 handler:async(ctx,a)=>{
  const user=await owner(ctx);
  const trade=a.trade.trim(),city=a.city.trim();
  if(trade.length<3||trade.length>70||city.length<3||city.length>120)throw Error("Trade and city must be 3–120 characters");
  const key=process.env.FIRECRAWL_API_KEY;
  if(!(process.env.GOOGLE_MAPS_API_KEY&&paidSourceAllowed(process.env))&&(!key||!key.startsWith("fc-")))throw Error("Business search needs GOOGLE_MAPS_API_KEY or a Firecrawl key");
  return await discoveryCore(ctx,user,trade,city);
 }
});
export async function discoveryCore(ctx:ActionCtx,user:string,trade:string,city:string){
 // Real businesses from Google Places when a key is set; web search otherwise.
 if(process.env.GOOGLE_MAPS_API_KEY&&paidSourceAllowed(process.env)){await limiter.limit(ctx,"discovery",{key:user,throws:true});return await placesDiscovery(ctx,user,trade,city);}
 const key=process.env.FIRECRAWL_API_KEY;
 if(!key||!key.startsWith("fc-"))throw Error("Firecrawl API key not configured");
 await limiter.limit(ctx,"discovery",{key:user,throws:true});
 const searchQueries=buildSearchQueries(trade,city,Number(process.env.DISCOVERY_QUERIES)||3);
  const hits: {url:string;title?:string;description?:string;markdown?:string}[]=[];
  let credits=0;
  for(const query of searchQueries){
   const response=await fetch("https://api.firecrawl.dev/v2/search",{
    method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({query,limit:12,sources:[{type:"web"}],location:city,country:"US",safe:true,scrapeOptions:{formats:[{type:"markdown"}],onlyMainContent:true}}),
    signal:AbortSignal.timeout(70_000)
   });
   const data=await response.json() as {success?:boolean;error?:string;creditsUsed?:number;data?:{web?:{url:string;title?:string;description?:string;markdown?:string}[]}};
   if(!response.ok||!data.success)throw Error("Firecrawl search failed: "+(data.error||response.status));
   credits+=Math.max(0,data.creditsUsed||0);
   hits.push(...(data.data?.web||[]));
  }
  const seen=new Set<string>();let qualified=0,skipped=0,imported=0,withContact=0;
  for(const hit of hits){
   const candidate=candidateFromSearch(hit,trade,city);
   if(!candidate||seen.has(siteKey(candidate.website))){skipped++;continue;}
   seen.add(siteKey(candidate.website));
   const assessed=qualifyBusiness(candidate);
   const opp=assessOpportunity(candidate.markdown);
   const contact=extractContacts(candidate.description+"\n"+candidate.markdown,candidate.website).best;
   if(contact)withContact++;
   await ctx.runMutation(internal.autopilot.upsert,{ownerId:user,campaignKey:cohort(trade,city),candidate:{...candidate,score:assessed.score,qualified:assessed.qualified,reasons:[...assessed.reasons,...(opp.assessed&&opp.opportunity>0?opp.reasons:[])],evidence:assessed.evidence,...(opp.assessed?{opportunity:opp.opportunity}:{}),...(contact?{contact}:{})}});
   imported++;
   if(assessed.qualified)qualified++;
  }
  return {provider:"Firecrawl",queries:searchQueries.length,searchHits:hits.length,imported,qualified,withContact,skipped,creditsReported:credits,trade,city,emailsSent:0};
}
export const discoverInternal=internalAction({
 args:{ownerId:v.string(),trade:v.string(),city:v.string()},returns:v.any(),
 handler:async(ctx,a)=>{if(!process.env.AUTOPILOT_SERVICE_SECRET)throw Error("Autopilot not configured");return await discoveryCore(ctx,a.ownerId,a.trade,a.city)}
});
export const prepareDemo=mutation({
 args:{prospectId:v.id("prospects"),claimId:v.optional(v.string())},
 returns:v.object({prospectId:v.id("prospects"),conceptId:v.id("concepts"),alreadyBuilt:v.boolean(),buildStatus:v.union(v.literal("built"),v.literal("busy"),v.literal("acquired"))}),
 handler:async(ctx,a)=>{
  const user=await owner(ctx);const p=await ctx.db.get(a.prospectId);
  if(!p||p.ownerId!==user)throw Error("Prospect not found");
  await requireTopDecile(ctx,p);
  const existing=await ctx.db.query("concepts").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).take(20);
  let approved=existing.find(c=>c.status==="approved");
  if(!approved&&existing.length){
   approved=existing.find(c=>c.direction==="Conversion")||existing[0];
   await ctx.db.patch(approved._id,{status:"approved",updatedAt:Date.now()});
  }
  if(!approved){
   for(const d of directions){
    const id=await ctx.db.insert("concepts",{ownerId:user,prospectId:p._id,variant:d.variant,direction:d.direction,description:d.description,status:d.direction==="Conversion"?"approved":"draft",updatedAt:Date.now()});
    if(d.direction==="Conversion")approved=(await ctx.db.get(id))!;
   }
  }
  if(!approved)throw Error("No concept available");
  if(!approved.html)await ctx.db.patch(p._id,{stage:"Design",status:"needs_approval",updatedAt:Date.now()});
  if(a.claimId)validateBuildClaimId(a.claimId);
  if(["blocked","paused"].includes(p.status))throw Error("Prospect is paused or blocked");
  const now=Date.now(),buildStatus=a.claimId?decideBuildClaim(approved,now):(approved.html?"built":"acquired");
  if(a.claimId&&buildStatus==="acquired")await ctx.db.patch(approved._id,{buildClaimId:a.claimId,buildLeaseUntil:now+BUILD_LEASE_MS});
  return {prospectId:p._id,conceptId:approved._id,alreadyBuilt:Boolean(approved.html),buildStatus};
 }
});
export const draftAfterDemo=mutation({
 args:{prospectId:v.id("prospects")},returns:v.object({created:v.boolean(),id:v.optional(v.id("outreach"))}),
 handler:async(ctx,a)=>{
  const user=await owner(ctx);const p=await ctx.db.get(a.prospectId);
  if(!p||p.ownerId!==user)throw Error("Prospect not found");
  await requireTopDecile(ctx,p);
  const concepts=await ctx.db.query("concepts").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).take(20);
  const built=concepts.find(c=>c.status==="approved"&&!!c.html);
  if(!built)throw Error("Verified demo required before drafting");
  // v3 item 9: hard gates. A demo without a DEMO label, noindex, or with unsourced claims can't go out.
  const qa=demoQa(built.html!);const hard=qa.failures.filter(f=>f!=="No working CTA"&&f!=="No sourced fact rendered");
  if(hard.length){await ctx.db.insert("activities",{ownerId:p.ownerId,prospectId:p._id,kind:"alert",summary:"Demo QA failed: "+hard.join("; ")+". Draft held.",timestamp:Date.now()});return {created:false};}
  // v3 item 15: stale trigger -> re-rank instead of drafting a "why now" that is no longer now.
  if(p.triggerType&&p.triggerType!=="none"){
   const t={type:p.triggerType as TriggerType,date:p.triggerDate,source:p.triggerSource};
   const unk=siteHealth({unknown:true});
   if(recheck({site:unk,trigger:t},{site:unk,trigger:t})==="rerank")await ctx.db.insert("activities",{ownerId:p.ownerId,prospectId:p._id,kind:"alert",summary:"Trigger "+p.triggerType+" is older than 14 days; draft opens without it being fresh. Consider re-ranking.",timestamp:Date.now()});
  }
  const dncHit=isSuppressed({contact:p.contact,website:p.website},await loadSuppressions(ctx,p.ownerId));
  if(dncHit){await ctx.db.insert("activities",{ownerId:p.ownerId,prospectId:p._id,kind:"do_not_contact",summary:"Draft skipped: matches do-not-contact entry "+dncHit.value,timestamp:Date.now()});return {created:false};}
  const prior=await ctx.db.query("outreach").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).first();
  if(prior)return {created:false,id:prior._id};
  const draft=await whyNowDraft(ctx,p);
  const id=await ctx.db.insert("outreach",{ownerId:user,prospectId:p._id,subject:draft.subject,body:draft.body,status:"draft",updatedAt:Date.now()});
  await ctx.db.insert("sendSnapshots",{ownerId:user,prospectId:p._id,outreachId:id,...(p.gates?{gates:p.gates}:{}),...(p.lookalike!==undefined?{lookalike:p.lookalike}:{}),triggerType:p.triggerType??"none",...(p.triggerDate?{triggerDate:p.triggerDate}:{}),...(draft.triggerAgeDays!==undefined?{triggerAgeDays:draft.triggerAgeDays}:{}),demoVersion:"concept-v1",variant:draft.variant,subject:draft.subject,createdAt:Date.now()});
  await logStageCost(ctx,{ownerId:user,stage:"Outreach",usd:0,computeSeconds:0,tool:"composeWhyNow",prospectId:p._id});
  if(draft.alerts.length)await ctx.db.insert("activities",{ownerId:user,prospectId:p._id,kind:"alert",summary:draft.alerts.join("; "),timestamp:Date.now()});
  await ctx.db.insert("activities",{ownerId:user,prospectId:p._id,kind:"autodraft",summary:"Private demo completed; outreach draft created; zero emails sent"+(draft.issues.length?" — before sending: "+draft.issues.join("; "):""),timestamp:Date.now()});
  return {created:true,id};
 }
});

export const setSchedule=mutation({
 args:{trade:v.string(),city:v.string(),enabled:v.boolean()},returns:v.boolean(),
 handler:async(ctx,a)=>{
  const user=await owner(ctx);const trade=a.trade.trim(),city=a.city.trim();
  if(trade.length<3||trade.length>70||city.length<3||city.length>120)throw Error("Invalid cohort");
  const key=cohort(trade,city);
  const prior=await ctx.db.query("campaigns").withIndex("by_owner_key",q=>q.eq("ownerId",user).eq("key",key)).first();
  if(prior)await ctx.db.patch(prior._id,{enabled:a.enabled,trade,city,updatedAt:Date.now()});
  else await ctx.db.insert("campaigns",{ownerId:user,key,trade,city,enabled:a.enabled,lastRunAt:0,updatedAt:Date.now()});
  return a.enabled;
 }
});
export const schedules=query({args:{},returns:v.any(),handler:async ctx=>{
 const user=await owner(ctx);return await ctx.db.query("campaigns").withIndex("by_owner_key",q=>q.eq("ownerId",user)).take(60);
}});
export const reserveDue=internalMutation({
 args:{},returns:v.union(v.null(),v.object({id:v.id("campaigns"),ownerId:v.string(),trade:v.string(),city:v.string()})),
 handler:async ctx=>{
  const dueBefore=Date.now()-23*3600_000;
  const c=await ctx.db.query("campaigns").withIndex("by_enabled_run",q=>q.eq("enabled",true).lt("lastRunAt",dueBefore)).first();
  if(!c)return null;
  await ctx.db.patch(c._id,{lastRunAt:Date.now(),lastError:undefined,updatedAt:Date.now()});
  return {id:c._id,ownerId:c.ownerId,trade:c.trade,city:c.city};
 }
});
export const completeDue=internalMutation({args:{id:v.id("campaigns"),error:v.optional(v.string())},returns:v.null(),handler:async(ctx,a)=>{await ctx.db.patch(a.id,{lastError:a.error?.slice(0,300)});return null;}});

export const rankForService=internalQuery({
 args:{ownerId:v.string(),trade:v.string(),city:v.string()},returns:v.any(),
 handler:async(ctx,a)=>{
  const rank=await ranked(ctx,a.ownerId,cohort(a.trade,a.city));
  return {qualified:rank.qualified.length,demoBudget:rank.demoIds.length,eligibleIds:rank.demoIds.filter(id=>{const p=rank.pool.find(x=>x._id===id);return p&&!["Demo","Outreach","Convert","Produce"].includes(p.stage);})};
 }
});
export const prepareForService=internalMutation({
 args:{prospectId:v.id("prospects"),claimId:v.optional(v.string())},returns:v.any(),
 handler:async(ctx,a)=>{
  const p=await ctx.db.get(a.prospectId);
  if(!p)throw Error("Prospect not found");
  await requireTopDecile(ctx,p);
  if(p.status==="blocked"||p.status==="paused")throw Error("Prospect blocked");
  const previous=await ctx.db.query("concepts").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).take(20);
  let selected=previous.find(x=>x.status==="approved");
  if(!selected){
   const preferred=previous.find(x=>x.direction==="Conversion")||previous[0];
   if(preferred){await ctx.db.patch(preferred._id,{status:"approved",updatedAt:Date.now()});selected={...preferred,status:"approved"};}
  }
  if(!selected){
   for(const d of directions){
    const id=await ctx.db.insert("concepts",{ownerId:p.ownerId,prospectId:p._id,variant:d.variant,direction:d.direction,description:d.description,status:d.direction==="Conversion"?"approved":"draft",updatedAt:Date.now()});
    if(d.direction==="Conversion")selected=(await ctx.db.get(id))!;
   }
  }
  if(!selected)throw Error("No concept generated");
  if(!selected.html)await ctx.db.patch(p._id,{stage:"Design",status:"needs_approval",updatedAt:Date.now()});
  if(a.claimId)validateBuildClaimId(a.claimId);
  const now=Date.now(),buildStatus=a.claimId?decideBuildClaim(selected,now):(selected.html?"built":"acquired");
  if(a.claimId&&buildStatus==="acquired")await ctx.db.patch(selected._id,{buildClaimId:a.claimId,buildLeaseUntil:now+BUILD_LEASE_MS});
  return {prospectId:p._id,conceptId:selected._id,alreadyBuilt:Boolean(selected.html),buildStatus,name:p.name,trade:p.trade,city:p.city,direction:selected.direction};
 }
});
export const saveForService=internalMutation({
 args:{prospectId:v.id("prospects"),conceptId:v.id("concepts"),html:v.string(),sha256:v.string(),claimId:v.optional(v.string())},returns:v.boolean(),
 handler:async(ctx,a)=>{
  const p=await ctx.db.get(a.prospectId),c=await ctx.db.get(a.conceptId);
  if(!p||!c||c.ownerId!==p.ownerId||c.prospectId!==p._id)throw Error("Invalid concept");
  await requireTopDecile(ctx,p);
  if(c.status!=="approved"||!["Design","Demo"].includes(p.stage)||["blocked","paused"].includes(p.status))throw Error("Concept not buildable");
  if(a.html.length<200||a.html.length>80000||!a.html.toLowerCase().startsWith("<!doctype html>")||!/^[a-f0-9]{64}$/.test(a.sha256))throw Error("Invalid verified artifact");
  if(c.html)return c.sha256===a.sha256;
  if(c.buildClaimId||a.claimId)requireBuildClaim(c,a.claimId??"",Date.now());
  await ctx.db.patch(c._id,{html:a.html,sha256:a.sha256,builtAt:Date.now(),buildClaimId:undefined,buildLeaseUntil:undefined,updatedAt:Date.now()});
  await ctx.db.patch(p._id,{stage:"Demo",status:"needs_approval",updatedAt:Date.now()});
  await ctx.db.insert("activities",{ownerId:p.ownerId,prospectId:p._id,kind:"sandbox_demo",summary:"Top-decile private demo verified in an isolated Vercel Sandbox",timestamp:Date.now()});
  return true;
 }
});
export const releaseForService=internalMutation({
 args:{prospectId:v.id("prospects"),conceptId:v.id("concepts"),claimId:v.string()},
 returns:v.boolean(),
 handler:async(ctx,a)=>{
  validateBuildClaimId(a.claimId);
  const c=await ctx.db.get(a.conceptId);
  if(!c||c.prospectId!==a.prospectId||c.buildClaimId!==a.claimId)return false;
  await ctx.db.patch(c._id,{buildClaimId:undefined,buildLeaseUntil:undefined});
  return true;
 }
});
export const draftForService=internalMutation({
 args:{prospectId:v.id("prospects")},returns:v.any(),
 handler:async(ctx,a)=>{
  const p=await ctx.db.get(a.prospectId);
  if(!p)throw Error("Prospect not found");
  await requireTopDecile(ctx,p);
  const concepts=await ctx.db.query("concepts").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).take(20);
  if(!concepts.some(c=>c.status==="approved"&&!!c.html))throw Error("No completed demo");
  const dncHit=isSuppressed({contact:p.contact,website:p.website},await loadSuppressions(ctx,p.ownerId));
  if(dncHit){await ctx.db.insert("activities",{ownerId:p.ownerId,prospectId:p._id,kind:"do_not_contact",summary:"Draft skipped: matches do-not-contact entry "+dncHit.value,timestamp:Date.now()});return {created:false,suppressed:true,emailsSent:0};}
  const existing=await ctx.db.query("outreach").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).first();
  if(existing)return {created:false,emailsSent:0};
  const content=await whyNowDraft(ctx,p);
  await ctx.db.insert("outreach",{ownerId:p.ownerId,prospectId:p._id,subject:content.subject,body:content.body,status:"draft",updatedAt:Date.now()});
  await ctx.db.insert("activities",{ownerId:p.ownerId,prospectId:p._id,kind:"autodraft",summary:"Outreach draft prepared; not sent"+(content.issues.length?" — before sending: "+content.issues.join("; "):""),timestamp:Date.now()});
  return {created:true,emailsSent:0};
 }
});

/** v3 item 3: trigger-led "Found it. Fix it." draft with one-click opt-out token. Never sends. */
export async function whyNowDraft(ctx:MutationCtx,p:Doc<"prospects">){
 const token=crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"").slice(0,8);
 const base=(process.env.CONVEX_SITE_URL??"").replace(/\/$/,"");
 const value=p.contact&&p.contact.includes("@")?p.contact:p.website;
 if(value)await ctx.db.insert("optOutTokens",{ownerId:p.ownerId,prospectId:p._id,token,value,createdAt:Date.now()});
 const srcs=await ctx.db.query("sources").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).take(5);
 return composeWhyNow({name:p.name,trade:p.trade,city:p.city,
  trigger:p.triggerType?{type:p.triggerType as TriggerType,date:p.triggerDate,source:p.triggerSource}:{type:"none"},
  gap:(p.scoreReasons??[]).filter(r=>/^Gap:|^Opportunity:/.test(r)).map(r=>r.replace(/^Opportunity:\s*/,"")),
  facts:srcs.filter(s=>s.url).slice(0,1).map(s=>({text:s.summary.split("\n")[0].slice(0,140),sourceUrl:s.url})),
  optOutUrl:value&&base?base+"/optout/"+token:undefined,
  postalAddress:process.env.OUTREACH_POSTAL_ADDRESS??POSTAL_ADDRESS});
}
