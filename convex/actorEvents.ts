import {v} from "convex/values";
import {httpAction,internalMutation,internalQuery} from "./_generated/server";
import {internal} from "./_generated/api";

export const APPEND_SECRET_ENV="ACTOR_APPEND_SECRET";
const MAX_BATCH=200;
const eventV=v.object({actorId:v.string(),runId:v.optional(v.string()),sequence:v.number(),eventType:v.string(),payload:v.string(),prospectId:v.optional(v.id("prospects")),ownerId:v.string(),createdAt:v.number()});

export function constantTimeEqual(a:string,b:string):boolean{
 const ea=new TextEncoder().encode(a),eb=new TextEncoder().encode(b);
 let diff=ea.length^eb.length;
 const n=Math.max(ea.length,eb.length);
 for(let i=0;i<n;i++)diff|=(ea[i]??0)^(eb[i]??0);
 return diff===0;
}

// Batch append; dedupes on (actorId, sequence) and within the batch. No uniqueness assumed in the table.
export const appendEvents=internalMutation({
 args:{events:v.array(eventV)},
 handler:async(ctx,{events})=>{
  if(events.length>MAX_BATCH)throw new Error("Batch too large");
  const seen=new Set<string>();let inserted=0,skipped=0;
  for(const e of events){
   const key=e.actorId+"\u0000"+e.sequence;
   if(seen.has(key)){skipped++;continue}
   seen.add(key);
   const existing=await ctx.db.query("actorEvents").withIndex("by_actor_sequence",q=>q.eq("actorId",e.actorId).eq("sequence",e.sequence)).first();
   if(existing){skipped++;continue}
   await ctx.db.insert("actorEvents",e);inserted++;
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
 let body:unknown;
 try{body=await request.json()}catch{return new Response("Bad JSON",{status:400})}
 const events=(body as {events?:unknown})?.events;
 if(!Array.isArray(events))return new Response("Missing events",{status:400});
 try{
  const r=await ctx.runMutation(internal.actorEvents.appendEvents,{events:events as never});
  return Response.json(r);
 }catch(e){return new Response("Invalid events",{status:400})}
});
