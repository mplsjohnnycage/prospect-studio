// v3 items 6/7/14/15/22: promote gate survivors from the local store into Convex through one typed door,
// dedupe on identityKey, score lookalike vs past winners, and expose calibrated weights.
import {bestContact} from "../src/lib/revenue-build";
import {internalMutation,mutation,query} from "./_generated/server";
import type {MutationCtx,QueryCtx} from "./_generated/server";
import {v} from "convex/values";
import {owner} from "./identity";
import {loadSuppressions} from "./suppressions";
import {isSuppressed} from "../src/lib/suppression";
import {lookalike,calibrateWeights,type Gates} from "../src/lib/revenue-engine";
import {logStageCost} from "./outcomes";

const gatesV=v.object({fit:v.number(),gap:v.number(),spend:v.number(),care:v.number(),timing:v.number()});
export const promoteRecord=v.object({
 recordId:v.string(),identityKey:v.string(),source:v.string(),sourceUrl:v.string(),fetchedAt:v.number(),
 name:v.string(),city:v.string(),trade:v.optional(v.string()),phone:v.optional(v.string()),website:v.optional(v.string()),emails:v.optional(v.array(v.string())),formUrl:v.optional(v.string()),
 gates:gatesV,tier:v.string(),total:v.number(),reasons:v.array(v.string()),
 triggerType:v.string(),triggerDate:v.optional(v.string()),triggerSource:v.optional(v.string()),
});
async function winners(ctx:QueryCtx|MutationCtx,ownerId:string):Promise<{won:Gates[];labeled:{gates:Gates;won:boolean}[]}>{
 const ev=await ctx.db.query("outcomes").withIndex("by_owner_time",q=>q.eq("ownerId",ownerId)).order("desc").take(2000);
 const paid=new Set(ev.filter(e=>e.kind==="paid").map(e=>e.prospectId as string));
 const done=new Set(ev.filter(e=>e.kind==="lost"||e.kind==="paid").map(e=>e.prospectId as string));
 const snaps=await ctx.db.query("sendSnapshots").withIndex("by_owner",q=>q.eq("ownerId",ownerId)).take(2000);
 const labeled=snaps.filter(s=>s.gates&&done.has(s.prospectId)).map(s=>({gates:s.gates!,won:paid.has(s.prospectId)}));
 return {won:labeled.filter(l=>l.won).map(l=>l.gates),labeled};
}
export async function promoteFor(ctx:MutationCtx,ownerId:string,records:{recordId:string;identityKey:string;source:string;sourceUrl:string;fetchedAt:number;name:string;city:string;trade?:string;phone?:string;website?:string;emails?:string[];formUrl?:string;gates:Gates;tier:string;total:number;reasons:string[];triggerType:string;triggerDate?:string;triggerSource?:string}[]){
 if(records.length>200)throw Error("Promote at most 200 records per batch");
 const sup=await loadSuppressions(ctx,ownerId);
 const {won}=await winners(ctx,ownerId);
 let added=0,duplicates=0,blocked=0;const now=Date.now();
 for(const r of records){
  // Item 21: the typed door rejects unsourced records (no https source link) and records without a name or city.
  if(!/^https:\/\/\S+$/.test(r.sourceUrl)||!r.name.trim()||!r.city.trim()){blocked++;continue;}
  const dup=await ctx.db.query("prospects").withIndex("by_owner_identity",q=>q.eq("ownerId",ownerId).eq("identityKey",r.identityKey)).first();
  if(dup){duplicates++;continue;}
  // Item 17: pick the best public business contact (business email > contact form > phone).
  const pick=bestContact({emails:r.emails,phones:r.phone?[r.phone]:[],formUrl:r.formUrl});
  const hit=isSuppressed({contact:pick.value,website:r.website??""},sup)||(!!r.phone&&isSuppressed({contact:r.phone,website:""},sup));
  const look=lookalike(r.gates,won);
  const id=await ctx.db.insert("prospects",{ownerId,name:r.name.slice(0,160),trade:(r.trade??"").slice(0,120),city:r.city.slice(0,160),website:r.website??"",contact:pick.value.slice(0,250),
   score:r.total,qualified:true,stage:"Qualify",status:hit?"blocked":"queued",notes:"Source: "+r.sourceUrl,source:r.source,campaignKey:((r.trade??"").toLowerCase()+"::"+r.city.toLowerCase()).slice(0,320),
   scoreReasons:[...r.reasons.slice(0,13),"Contact: "+pick.channel],evidence:[r.sourceUrl],identityKey:r.identityKey,triggerType:r.triggerType,...(r.triggerDate?{triggerDate:r.triggerDate}:{}),...(r.triggerSource?{triggerSource:r.triggerSource}:{}),
   gates:r.gates,tier:r.tier,lookalike:look,promotedFrom:{recordId:r.recordId,source:r.source,sourceUrl:r.sourceUrl,fetchedAt:r.fetchedAt,promotedAt:now},updatedAt:now});
  await ctx.db.insert("sources",{ownerId,prospectId:id,url:r.sourceUrl,summary:r.reasons.join("\n").slice(0,2000),checksum:"",verifiedAt:r.fetchedAt});
  if(hit)blocked++;else added++;
 }
 await logStageCost(ctx,{ownerId,stage:"Qualify",usd:0,computeSeconds:0,tool:"promote"});
 return {added,duplicates,blocked};
}
export const promote=mutation({args:{records:v.array(promoteRecord)},returns:v.object({added:v.number(),duplicates:v.number(),blocked:v.number()}),handler:async(ctx,a)=>promoteFor(ctx,await owner(ctx),a.records)});
export const promoteInternal=internalMutation({args:{ownerId:v.string(),records:v.array(promoteRecord)},returns:v.object({added:v.number(),duplicates:v.number(),blocked:v.number()}),handler:async(ctx,a)=>promoteFor(ctx,a.ownerId,a.records)});
export const weights=query({args:{},returns:v.any(),handler:async ctx=>{const user=await owner(ctx);const {labeled}=await winners(ctx,user);return {labels:labeled.length,weights:calibrateWeights(labeled),order:["fit","gap","spend","care","timing"]};}});
