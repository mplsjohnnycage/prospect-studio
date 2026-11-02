import {query,mutation} from "./_generated/server";
import {v} from "convex/values";
import {owner} from "./identity";
import {geo} from "./geospatial";
import {requireTopDecile} from "./autopilot";
import {BUILD_LEASE_MS,decideBuildClaim,requireBuildClaim,validateBuildClaimId} from "../src/lib/build-lease";
import {canTransition,directions,type CommandKind} from "../src/lib/domain";

const commandValidator=v.union(...(["qualify","extract","design","approve_concept","draft_outreach","approve_outreach","request_publish","pause","resume"] as const).map(v.literal));
function checkCoords(latitude?:number,longitude?:number){
 if((latitude===undefined)!==(longitude===undefined))throw new Error("Coordinates must include latitude and longitude");
 if(latitude!==undefined && (!Number.isFinite(latitude)||latitude< -90||latitude>90||!Number.isFinite(longitude)||longitude! < -180||longitude! >180))throw new Error("Invalid coordinates");
}
export const list=query({args:{},handler:async(ctx)=>{
 const user=await owner(ctx);
 return await ctx.db.query("prospects").withIndex("by_owner_updated",q=>q.eq("ownerId",user)).order("desc").take(200);
}});
export const outreachAll=query({args:{},handler:async(ctx)=>{
 const user=await owner(ctx);return await ctx.db.query("outreach").withIndex("by_owner",q=>q.eq("ownerId",user)).order("desc").take(100);
}});
export const detail=query({args:{id:v.id("prospects")},handler:async(ctx,{id})=>{
 const user=await owner(ctx);const prospect=await ctx.db.get(id);
 if(!prospect||prospect.ownerId!==user)return null;
 const concepts=await ctx.db.query("concepts").withIndex("by_prospect",q=>q.eq("prospectId",id)).collect();
 const outreach=await ctx.db.query("outreach").withIndex("by_prospect",q=>q.eq("prospectId",id)).collect();
 const sources=await ctx.db.query("sources").withIndex("by_prospect",q=>q.eq("prospectId",id)).collect();
 const replies=await ctx.db.query("replies").withIndex("by_prospect",q=>q.eq("prospectId",id)).order("desc").take(50);
 const drafts=await ctx.db.query("replyDrafts").withIndex("by_prospect",q=>q.eq("prospectId",id)).take(100);
 const followups=await ctx.db.query("followups").withIndex("by_prospect",q=>q.eq("prospectId",id)).take(10);
 const bookings=await ctx.db.query("bookings").withIndex("by_prospect",q=>q.eq("prospectId",id)).order("desc").take(10);
 return {prospect,concepts,outreach,sources,followups:followups.map(f=>({id:f._id,step:f.step,subject:f.subject,body:f.body,status:f.status,sending:f.deliveryStatus==="sending",sendError:f.sendError,sentAt:f.sentAt})),bookings:bookings.map(b=>({id:b._id,name:b.name,phone:b.phone,email:b.email,preferred:b.preferred,note:b.note,status:b.status,createdAt:b.createdAt})),replies:replies.map(r=>{const d=drafts.find(x=>x.replyId===r._id);return {id:r._id,from:r.from,subject:r.subject,text:r.text,optOut:r.optOut,receivedAt:r.receivedAt,draft:d?{id:d._id,body:d.body,status:d.status,generator:d.generator}:undefined};})};
}});
export const activity=query({args:{},handler:async(ctx)=>{
 const user=await owner(ctx);return await ctx.db.query("activities").withIndex("by_owner_time",q=>q.eq("ownerId",user)).order("desc").take(80);
}});
export const create=mutation({args:{name:v.string(),city:v.string(),trade:v.string(),website:v.optional(v.string()),contact:v.optional(v.string()),notes:v.optional(v.string()),latitude:v.optional(v.number()),longitude:v.optional(v.number())},handler:async(ctx,args)=>{
 const user=await owner(ctx);const name=args.name.trim(),city=args.city.trim();
 if(!name||!city||name.length>160||city.length>160)throw new Error("Business name and city required (max 160 chars)");
 checkCoords(args.latitude,args.longitude);
 const timestamp=Date.now();
 const id=await ctx.db.insert("prospects",{ownerId:user,name,city,trade:args.trade.slice(0,120),website:(args.website??"").slice(0,500),contact:(args.contact??"").slice(0,250),notes:(args.notes??"").slice(0,4000),score:50,stage:"Discover",status:"queued",source:"manual",updatedAt:timestamp,latitude:args.latitude,longitude:args.longitude});
 if(args.latitude!==undefined && args.longitude!==undefined)await geo.insert(ctx,id,{latitude:args.latitude,longitude:args.longitude},{ownerId:user,trade:args.trade},50);
 await ctx.db.insert("activities",{ownerId:user,prospectId:id,kind:"created",summary:name+" added to prospect list",timestamp});
 return id;
}});
export const nearby=query({args:{latitude:v.number(),longitude:v.number(),radiusMeters:v.optional(v.number())},handler:async(ctx,args)=>{
 const user=await owner(ctx);checkCoords(args.latitude,args.longitude);
 const locations=await geo.nearest(ctx,{point:{latitude:args.latitude,longitude:args.longitude},maxDistance:Math.min(args.radiusMeters??25000,200000),limit:50,filter:q=>q.eq("ownerId",user)});
 const docs=await Promise.all(locations.map(async(loc)=>ctx.db.get(loc.key)));
 return docs.filter(p=>p&&p.ownerId===user);
}});
export const execute=mutation({args:{id:v.id("prospects"),kind:commandValidator,commandId:v.string(),conceptId:v.optional(v.id("concepts")),messageId:v.optional(v.id("outreach"))},handler:async(ctx,args)=>{
 const user=await owner(ctx);if(!args.commandId||args.commandId.length>128)throw new Error("Invalid command id");
 const prior=await ctx.db.query("commands").withIndex("by_command",q=>q.eq("commandId",args.commandId)).unique();
 if(prior){if(prior.ownerId!==user||prior.prospectId!==args.id||prior.kind!==args.kind)throw new Error("Command id reused with different input");return JSON.parse(prior.result);}
 const p=await ctx.db.get(args.id);if(!p||p.ownerId!==user)throw new Error("Prospect not found");
 if(!canTransition(p,args.kind))throw new Error("Invalid stage or status transition");
 let stage:typeof p.stage=p.stage;let status:typeof p.status=p.status;
 let summary="";const timestamp=Date.now();
 switch(args.kind as CommandKind){
 case "qualify": stage="Qualify";status="needs_approval";summary="Qualification checklist opened (manual verification required)";break;
 case "extract":stage="Extract";status="needs_approval";summary="Research stage opened; no automatic crawl performed";break;
 case "design":
  await requireTopDecile(ctx,p);
  stage="Design";status="needs_approval";summary="Four design briefs created for review";
  const existing=await ctx.db.query("concepts").withIndex("by_prospect",q=>q.eq("prospectId",args.id)).collect();
  if(existing.length===0)for(const d of directions)await ctx.db.insert("concepts",{ownerId:user,prospectId:args.id,variant:d.variant,direction:d.direction,description:d.description,status:"draft",updatedAt:timestamp});
  break;
 case "approve_concept":
  if(!args.conceptId)throw new Error("Concept id required");
  const selected=await ctx.db.get(args.conceptId);
  if(!selected||selected.ownerId!==user||selected.prospectId!==args.id)throw new Error("Concept not found");
  for(const c of await ctx.db.query("concepts").withIndex("by_prospect",q=>q.eq("prospectId",args.id)).collect())await ctx.db.patch(c._id,{status:c._id===args.conceptId?"approved":"draft"});
  summary="Approved concept "+selected.variant+"; no demo deployed";break;
 case "request_publish":status="blocked";summary="Publish blocked: no verified Dynamic App deployment";break;
 case "draft_outreach":
  const approved=await ctx.db.query("concepts").withIndex("by_prospect",q=>q.eq("prospectId",args.id)).collect();
  if(!approved.some(c=>c.status==="approved"&&!!c.html))throw new Error("Build and verify an approved concept first");
  stage="Outreach";status="needs_approval";
  await ctx.db.insert("outreach",{ownerId:user,prospectId:args.id,subject:"A website concept for "+p.name,body:"Hello,\n\nI prepared a website concept for "+p.name+" and would welcome your feedback.\n\nBest regards",status:"draft",updatedAt:timestamp});
  summary="Outreach draft created; nothing sent";break;
 case "approve_outreach":
  if(!args.messageId)throw new Error("Message id required");
  const m=await ctx.db.get(args.messageId);if(!m||m.ownerId!==user||m.prospectId!==args.id)throw new Error("Draft not found");
  await ctx.db.patch(m._id,{status:"approved"});summary="Outreach approved; send it from the Outreach tab";break;
 case "pause":status="paused";summary="Pipeline paused";break;
 case "resume":status="queued";summary="Pipeline resumed";break;
 }
 await ctx.db.patch(args.id,{stage,status,updatedAt:timestamp});
 await ctx.db.insert("activities",{ownerId:user,prospectId:args.id,kind:args.kind,summary,timestamp});
 const result={id:args.id,stage,status,summary,commandId:args.commandId};
 await ctx.db.insert("commands",{ownerId:user,prospectId:args.id,kind:args.kind,commandId:args.commandId,result:JSON.stringify(result),timestamp});
 return result;
}});

// Atomic owner-scoped lease; concurrent sandbox requests cannot build the same concept.
export const claimConceptBuild=mutation({
 args:{prospectId:v.id("prospects"),conceptId:v.id("concepts"),claimId:v.string()},
 returns:v.union(v.literal("built"),v.literal("busy"),v.literal("acquired")),
 handler:async(ctx,a)=>{
  validateBuildClaimId(a.claimId);
  const user=await owner(ctx),p=await ctx.db.get(a.prospectId),c=await ctx.db.get(a.conceptId);
  if(!p||p.ownerId!==user||!c||c.ownerId!==user||c.prospectId!==p._id)throw Error("Concept not found");
  await requireTopDecile(ctx,p);
  if(c.status!=="approved"||!["Design","Demo"].includes(p.stage)||["blocked","paused"].includes(p.status))throw Error("Concept is not eligible for build");
  const now=Date.now(),state=decideBuildClaim(c,now);
  if(state==="acquired")await ctx.db.patch(c._id,{buildClaimId:a.claimId,buildLeaseUntil:now+BUILD_LEASE_MS});
  return state;
 }
});
export const releaseConceptBuild=mutation({
 args:{prospectId:v.id("prospects"),conceptId:v.id("concepts"),claimId:v.string()},
 returns:v.boolean(),
 handler:async(ctx,a)=>{
  validateBuildClaimId(a.claimId);
  const user=await owner(ctx),c=await ctx.db.get(a.conceptId);
  if(!c||c.ownerId!==user||c.prospectId!==a.prospectId||c.buildClaimId!==a.claimId)return false;
  await ctx.db.patch(c._id,{buildClaimId:undefined,buildLeaseUntil:undefined});
  return true;
 }
});

export const saveConceptPreview=mutation({args:{prospectId:v.id("prospects"),conceptId:v.id("concepts"),html:v.string(),sha256:v.string(),claimId:v.optional(v.string())},handler:async(ctx,args)=>{
 const user=await owner(ctx);
 const p=await ctx.db.get(args.prospectId);const c=await ctx.db.get(args.conceptId);
 if(!p||p.ownerId!==user||!c||c.ownerId!==user||c.prospectId!==p._id)throw Error("Prospect or concept not found");
 await requireTopDecile(ctx,p);
 if(c.status!=="approved"||!(["Design","Demo"] as string[]).includes(p.stage)||p.status==="paused"||p.status==="blocked")throw Error("Concept is not approved for preview");
 if(args.html.length<200||args.html.length>80000||!/^<!doctype html>/i.test(args.html)||!/[a-f0-9]{64}/.test(args.sha256)||args.sha256.length!==64)throw Error("Invalid preview artifact");
 if(c.html){if(c.sha256!==args.sha256)throw Error("Preview already built; create a new version to replace it");return c._id;}
 if(c.buildClaimId||args.claimId)requireBuildClaim(c,args.claimId??"",Date.now());
 const now=Date.now();await ctx.db.patch(c._id,{html:args.html,sha256:args.sha256,builtAt:now,buildClaimId:undefined,buildLeaseUntil:undefined,updatedAt:now});
 await ctx.db.patch(p._id,{stage:"Demo",status:"needs_approval",updatedAt:now});
 await ctx.db.insert("activities",{ownerId:user,prospectId:p._id,kind:"agentos_preview",summary:"Static concept preview verified inside Rivet agentOS (unpublished)",timestamp:now});
 return c._id;
}});

export const update=mutation({args:{id:v.id("prospects"),name:v.optional(v.string()),trade:v.optional(v.string()),city:v.optional(v.string()),website:v.optional(v.string()),contact:v.optional(v.string()),notes:v.optional(v.string()),score:v.optional(v.number())},handler:async(ctx,a)=>{
 const user=await owner(ctx);const p=await ctx.db.get(a.id);if(!p||p.ownerId!==user)throw Error("Prospect not found");
 if(a.score!==undefined&&p.campaignKey)throw Error("Automatic research scores cannot be overwritten manually");
 if(a.score!==undefined&&(!Number.isFinite(a.score)||a.score<0||a.score>100))throw Error("Score must be between 0 and 100");
 for(const field of ["name","trade","city","website","contact","notes"] as const){if(a[field]!==undefined){const max=field==="notes"?4000:field==="website"?500:250;if(a[field]!.length>max)throw Error("Field too long: "+field);if(["name","city"].includes(field)&&!a[field]!.trim())throw Error("Name and city must not be blank")}}
 const changes={...(a.name!==undefined?{name:a.name.trim()}:{}),...(a.trade!==undefined?{trade:a.trade.trim()}:{}),...(a.city!==undefined?{city:a.city.trim()}:{}),...(a.website!==undefined?{website:a.website.trim()}:{}),...(a.contact!==undefined?{contact:a.contact.trim()}:{}),...(a.notes!==undefined?{notes:a.notes}:{}),...(a.score!==undefined?{score:a.score}:{}),updatedAt:Date.now()};
 await ctx.db.patch(a.id,changes);await ctx.db.insert("activities",{ownerId:user,prospectId:a.id,kind:"prospect_updated",summary:"Updated business record: "+p.name,timestamp:Date.now()});
 return a.id;
}});
