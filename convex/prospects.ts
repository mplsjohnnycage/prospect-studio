import {query,mutation} from "./_generated/server";
import {v} from "convex/values";
import {owner} from "./identity";
import {geo} from "./geospatial";
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
 return {prospect,concepts,outreach,sources};
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
  if(!approved.some(c=>c.status==="approved"))throw new Error("Approve a concept first");
  stage="Outreach";status="needs_approval";
  await ctx.db.insert("outreach",{ownerId:user,prospectId:args.id,subject:"A website concept for "+p.name,body:"Hello,\n\nI prepared a website concept for "+p.name+" and would welcome your feedback.\n\nBest regards",status:"draft",updatedAt:timestamp});
  summary="Outreach draft created; nothing sent";break;
 case "approve_outreach":
  if(!args.messageId)throw new Error("Message id required");
  const m=await ctx.db.get(args.messageId);if(!m||m.ownerId!==user||m.prospectId!==args.id)throw new Error("Draft not found");
  await ctx.db.patch(m._id,{status:"approved"});summary="Outreach approved, external delivery still disabled";break;
 case "pause":status="paused";summary="Pipeline paused";break;
 case "resume":status="queued";summary="Pipeline resumed";break;
 }
 await ctx.db.patch(args.id,{stage,status,updatedAt:timestamp});
 await ctx.db.insert("activities",{ownerId:user,prospectId:args.id,kind:args.kind,summary,timestamp});
 const result={id:args.id,stage,status,summary,commandId:args.commandId};
 await ctx.db.insert("commands",{ownerId:user,prospectId:args.id,kind:args.kind,commandId:args.commandId,result:JSON.stringify(result),timestamp});
 return result;
}});
