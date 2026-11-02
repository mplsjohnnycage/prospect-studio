import {BUILD_LEASE_MS,decideBuildClaim,requireBuildClaim,validateBuildClaimId} from "../src/lib/build-lease";
import {action,internalAction,internalMutation,internalQuery,mutation,query} from "./_generated/server";
import {components,internal} from "./_generated/api";
import {v} from "convex/values";
import {RateLimiter,HOUR} from "@convex-dev/rate-limiter";
import {owner} from "./identity";
import {directions} from "../src/lib/domain";
import {candidateFromSearch,qualifyBusiness,selectDemoEligible,composeOutreach} from "../src/lib/prospect-intelligence";
import type {MutationCtx,QueryCtx} from "./_generated/server";
import type {ActionCtx} from "./_generated/server";
import type {Doc} from "./_generated/dataModel";

const limiter=new RateLimiter(components.rateLimiter,{discovery:{kind:"fixed window",rate:4,period:HOUR}});
export const cohort=(trade:string,city:string)=>(trade.trim().toLowerCase()+"::"+city.trim().toLowerCase()).slice(0,320);
const candidateArg=v.object({name:v.string(),website:v.string(),trade:v.string(),city:v.string(),description:v.string(),markdown:v.string(),url:v.string(),score:v.number(),qualified:v.boolean(),reasons:v.array(v.string()),evidence:v.array(v.string())});
export async function ranked(ctx:QueryCtx|MutationCtx,ownerId:string,key:string) {
 const pool=await ctx.db.query("prospects").withIndex("by_owner_campaign",q=>q.eq("ownerId",ownerId).eq("campaignKey",key)).take(1001);
 if(pool.length>1000)throw Error("Cohort exceeds 1,000 prospects; automatic demo generation paused for safe pagination");
 const qualified=pool.filter(p=>p.qualified===true&&p.status!=="paused"&&p.status!=="blocked");
 const demoIds=selectDemoEligible(qualified.map(p=>({id:p._id,score:p.score,qualified:true,paused:false}))).map(p=>p.id);
 return {pool,qualified,demoIds};
}
export async function requireTopDecile(ctx:MutationCtx,p:Doc<"prospects">) {
 if(!p.campaignKey||!p.qualified)throw Error("Demo generation requires an automatically qualified research cohort");
 const rank=await ranked(ctx,p.ownerId,p.campaignKey);
 if(!rank.demoIds.includes(p._id))throw Error("Only the top 10% of qualified prospects in this cohort may receive demos");
}
export const rankedCampaign=query({
 args:{trade:v.string(),city:v.string()},
 returns:v.any(),
 handler:async(ctx,a)=>{
  const user=await owner(ctx);
  const rank=await ranked(ctx,user,cohort(a.trade,a.city));
  return {total:rank.pool.length,qualified:rank.qualified.length,demoBudget:rank.demoIds.length,eligibleIds:rank.demoIds,eligible:rank.demoIds.map(id=>{const p=rank.pool.find(x=>x._id===id)!;return {id:p._id,name:p.name,score:p.score,stage:p.stage,website:p.website};}),topFraction:0.1};
 }
});
export const upsert=internalMutation({
 args:{ownerId:v.string(),campaignKey:v.string(),candidate:candidateArg},
 returns:v.string(),
 handler:async(ctx,a)=>{
  const c=a.candidate;
  const existing=await ctx.db.query("prospects").withIndex("by_owner_campaign_website",q=>q.eq("ownerId",a.ownerId).eq("campaignKey",a.campaignKey).eq("website",c.website)).first();
  const stamp=Date.now();
  const changes={name:c.name.slice(0,160),website:c.website,trade:c.trade.slice(0,120),city:c.city.slice(0,160),score:c.score,qualified:c.qualified,scoreReasons:c.reasons.slice(0,12),evidence:c.evidence.slice(0,5),updatedAt:stamp};
  if(existing){
   if(existing.status!=="paused"&&existing.status!=="blocked"&&!["Demo","Outreach","Convert","Produce"].includes(existing.stage)){
    await ctx.db.patch(existing._id,changes);
   }
   return existing._id;
  }
  const id=await ctx.db.insert("prospects",{...changes,ownerId:a.ownerId,campaignKey:a.campaignKey,contact:"",notes:"Source: "+c.url+"\n"+c.reasons.join("; "),stage:"Qualify",status:c.qualified?"queued":"needs_approval",source:"firecrawl-search"});
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
  if(!key||!key.startsWith("fc-"))throw Error("Firecrawl search requires an active API key");
  return await discoveryCore(ctx,user,trade,city);
 }
});
export async function discoveryCore(ctx:ActionCtx,user:string,trade:string,city:string){
 const key=process.env.FIRECRAWL_API_KEY;
 if(!key||!key.startsWith("fc-"))throw Error("Firecrawl API key not configured");
 await limiter.limit(ctx,"discovery",{key:user,throws:true});
 const searchQueries=[trade+" business "+city+" official website",trade+" contractor services "+city+" locally owned"];
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
  const seen=new Set<string>();let qualified=0,skipped=0,imported=0;
  for(const hit of hits){
   const candidate=candidateFromSearch(hit,trade,city);
   if(!candidate||seen.has(candidate.website)){skipped++;continue;}
   seen.add(candidate.website);
   const assessed=qualifyBusiness(candidate);
   await ctx.runMutation(internal.autopilot.upsert,{ownerId:user,campaignKey:cohort(trade,city),candidate:{...candidate,score:assessed.score,qualified:assessed.qualified,reasons:assessed.reasons,evidence:assessed.evidence}});
   imported++;
   if(assessed.qualified)qualified++;
  }
  return {provider:"Firecrawl",queries:searchQueries.length,searchHits:hits.length,imported,qualified,skipped,creditsReported:credits,trade,city,emailsSent:0};
}
export const discoverInternal=internalAction({
 args:{ownerId:v.string(),trade:v.string(),city:v.string()},returns:v.any(),
 handler:async(ctx,a)=>{if(!process.env.AUTOPILOT_SERVICE_SECRET)throw Error("Autopilot not configured");return await discoveryCore(ctx,a.ownerId,a.trade,a.city)}
});
export const prepareDemo=mutation({
 args:{prospectId:v.id("prospects"),claimId:v.string()},
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
  validateBuildClaimId(a.claimId);
  if(["blocked","paused"].includes(p.status))throw Error("Prospect is paused or blocked");
  const now=Date.now(),buildStatus=decideBuildClaim(approved,now);
  if(buildStatus==="acquired")await ctx.db.patch(approved._id,{buildClaimId:a.claimId,buildLeaseUntil:now+BUILD_LEASE_MS});
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
  if(!concepts.some(c=>c.status==="approved"&&!!c.html))throw Error("Verified demo required before drafting");
  const prior=await ctx.db.query("outreach").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).first();
  if(prior)return {created:false,id:prior._id};
  const draft=composeOutreach({name:p.name,trade:p.trade,city:p.city,findings:p.scoreReasons||[]});
  const id=await ctx.db.insert("outreach",{ownerId:user,prospectId:p._id,subject:draft.subject,body:draft.body,status:"draft",updatedAt:Date.now()});
  await ctx.db.insert("activities",{ownerId:user,prospectId:p._id,kind:"autodraft",summary:"Private demo completed; outreach draft created; zero emails sent",timestamp:Date.now()});
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
 args:{prospectId:v.id("prospects"),claimId:v.string()},returns:v.any(),
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
  validateBuildClaimId(a.claimId);
  const now=Date.now(),buildStatus=decideBuildClaim(selected,now);
  if(buildStatus==="acquired")await ctx.db.patch(selected._id,{buildClaimId:a.claimId,buildLeaseUntil:now+BUILD_LEASE_MS});
  return {prospectId:p._id,conceptId:selected._id,alreadyBuilt:Boolean(selected.html),buildStatus,name:p.name,trade:p.trade,city:p.city,direction:selected.direction};
 }
});
export const saveForService=internalMutation({
 args:{prospectId:v.id("prospects"),conceptId:v.id("concepts"),html:v.string(),sha256:v.string(),claimId:v.string()},returns:v.boolean(),
 handler:async(ctx,a)=>{
  const p=await ctx.db.get(a.prospectId),c=await ctx.db.get(a.conceptId);
  if(!p||!c||c.ownerId!==p.ownerId||c.prospectId!==p._id)throw Error("Invalid concept");
  await requireTopDecile(ctx,p);
  if(c.status!=="approved"||!["Design","Demo"].includes(p.stage)||["blocked","paused"].includes(p.status))throw Error("Concept not buildable");
  if(a.html.length<200||a.html.length>80000||!a.html.toLowerCase().startsWith("<!doctype html>")||!/^[a-f0-9]{64}$/.test(a.sha256))throw Error("Invalid verified artifact");
  if(c.html)return c.sha256===a.sha256;
  requireBuildClaim(c,a.claimId,Date.now());
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
  const existing=await ctx.db.query("outreach").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).first();
  if(existing)return {created:false,emailsSent:0};
  const content=composeOutreach({name:p.name,trade:p.trade,city:p.city,findings:p.scoreReasons||[]});
  await ctx.db.insert("outreach",{ownerId:p.ownerId,prospectId:p._id,subject:content.subject,body:content.body,status:"draft",updatedAt:Date.now()});
  await ctx.db.insert("activities",{ownerId:p.ownerId,prospectId:p._id,kind:"autodraft",summary:"Outreach draft prepared; not sent",timestamp:Date.now()});
  return {created:true,emailsSent:0};
 }
});
