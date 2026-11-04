import {v} from "convex/values";
import {httpAction,internalMutation,internalQuery} from "./_generated/server";
import {internal} from "./_generated/api";

export const APPEND_SECRET_ENV="ACTOR_APPEND_SECRET";
/** Server-side owner for actor events that carry no prospectId. Name only; value lives in Convex env. */
export const APPEND_OWNER_ENV="ACTOR_APPEND_OWNER_ID";
export const MAX_BATCH=200;
export const MAX_PAYLOAD_CHARS=64*1024;
export const MAX_ID_CHARS=128;
export const MAX_EVENT_TYPE_CHARS=64;
export const MAX_BODY_BYTES=4*1024*1024;
// ownerId and createdAt are still accepted for backward compatibility with existing writers, but both are ignored:
// the owner is derived on the server and createdAt is stamped on the server.
const eventV=v.object({actorId:v.string(),runId:v.optional(v.string()),sequence:v.number(),eventType:v.string(),payload:v.string(),prospectId:v.optional(v.id("prospects")),ownerId:v.optional(v.string()),createdAt:v.optional(v.number())});

export function constantTimeEqual(a:string,b:string):boolean{
 const ea=new TextEncoder().encode(a),eb=new TextEncoder().encode(b);
 let diff=ea.length^eb.length;
 const n=Math.max(ea.length,eb.length);
 for(let i=0;i<n;i++)diff|=(ea[i]??0)^(eb[i]??0);
 return diff===0;
}

/** Returns an error string for a bad event, or null when it is within bounds. */
export function eventProblem(e:{actorId:string;runId?:string;sequence:number;eventType:string;payload:string}):string|null{
 if(!e.actorId||e.actorId.length>MAX_ID_CHARS)return "actorId length";
 if(e.runId!==undefined&&(!e.runId||e.runId.length>MAX_ID_CHARS))return "runId length";
 if(!e.eventType||e.eventType.length>MAX_EVENT_TYPE_CHARS)return "eventType length";
 if(e.payload.length>MAX_PAYLOAD_CHARS)return "payload too large";
 if(!Number.isSafeInteger(e.sequence)||e.sequence<0)return "sequence must be a non-negative integer";
 return null;
}

// Batch append; dedupes on (actorId, sequence) and within the batch. No uniqueness assumed in the table.
export const appendEvents=internalMutation({
 args:{events:v.array(eventV)},
 handler:async(ctx,{events})=>{
  if(events.length>MAX_BATCH)throw new Error("Batch too large");
  for(const e of events){const bad=eventProblem(e);if(bad)throw new Error("Invalid event: "+bad);}
  const configuredOwner=process.env[APPEND_OWNER_ENV]?.trim()||null;
  const now=Date.now();
  const seen=new Set<string>();let inserted=0,skipped=0;
  for(const e of events){
   let ownerId=configuredOwner;
   if(e.prospectId){
    const p=await ctx.db.get(e.prospectId);
    if(!p)throw new Error("Invalid event: unknown prospect");
    if(configuredOwner&&p.ownerId!==configuredOwner)throw new Error("Invalid event: prospect owner mismatch");
    ownerId=p.ownerId;
   }
   if(!ownerId)throw new Error("Owner not configured");
   const key=e.actorId+"\u0000"+e.sequence;
   if(seen.has(key)){skipped++;continue}
   seen.add(key);
   const existing=await ctx.db.query("actorEvents").withIndex("by_actor_sequence",q=>q.eq("actorId",e.actorId).eq("sequence",e.sequence)).first();
   if(existing){skipped++;continue}
   await ctx.db.insert("actorEvents",{ownerId,actorId:e.actorId,sequence:e.sequence,eventType:e.eventType,payload:e.payload,createdAt:now,...(e.runId!==undefined?{runId:e.runId}:{}),...(e.prospectId?{prospectId:e.prospectId}:{})});inserted++;
  }
  return {inserted,skipped};
 }
});

export const readEvents=internalQuery({
 args:{actorId:v.string(),fromSequence:v.optional(v.number()),limit:v.optional(v.number())},
 handler:async(ctx,{actorId,fromSequence,limit})=>{
  const n=Math.min(Math.max(1,Math.floor(limit??100)),500);
  return await ctx.db.query("actorEvents").withIndex("by_actor_sequence",q=>q.eq("actorId",actorId).gte("sequence",fromSequence??0)).order("asc").take(n);
 }
});

// POST /actor-events/append, header Authorization: Bearer <ACTOR_APPEND_SECRET>, body {events:[...]}
export const appendHttp=httpAction(async(ctx,request)=>{
 const secret=process.env[APPEND_SECRET_ENV];
 if(!secret||secret.length<32)return new Response("Not configured",{status:503});
 const auth=request.headers.get("authorization")??"";
 const token=auth.startsWith("Bearer ")?auth.slice(7):"";
 if(!token||!constantTimeEqual(token,secret))return new Response("Unauthorized",{status:401});
 const declared=Number(request.headers.get("content-length")??"0");
 if(declared>MAX_BODY_BYTES)return new Response("Body too large",{status:413});
 let text:string;
 try{text=await request.text()}catch{return new Response("Bad body",{status:400})}
 if(text.length>MAX_BODY_BYTES)return new Response("Body too large",{status:413});
 let body:unknown;
 try{body=JSON.parse(text)}catch{return new Response("Bad JSON",{status:400})}
 const events=(body as {events?:unknown})?.events;
 if(!Array.isArray(events))return new Response("Missing events",{status:400});
 if(events.length>MAX_BATCH)return new Response("Batch too large",{status:400});
 try{
  const r=await ctx.runMutation(internal.actorEvents.appendEvents,{events:events as never});
  return Response.json(r);
 }catch(e){
  const msg=e instanceof Error?e.message:"";
  if(msg.includes("Owner not configured"))return new Response("Owner not configured",{status:503});
  return new Response("Invalid events",{status:400});
 }
});
