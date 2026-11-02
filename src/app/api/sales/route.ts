import {getConvex,api} from "@/lib/convex-server";
import type {Id} from "../../../../convex/_generated/dataModel";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

export async function POST(request:Request){
 try{
  const b=await request.json() as Record<string,unknown>;
  const c=getConvex();
  const pid=String(b.prospectId??"") as Id<"prospects">;
  switch(b.action){
   case "generateDemo":return Response.json(await c.action(api.demos.generate,{prospectId:pid}));
   case "shareDemo":return Response.json(await c.action(api.demos.share,{prospectId:pid}));
   case "prepareEmail":return Response.json(await c.action(api.sales.prepareEmail,{prospectId:pid}));
   case "send":return Response.json(await c.mutation(api.sales.send,{outreachId:String(b.outreachId??"") as Id<"outreach">}));
   case "sendReply":return Response.json(await c.mutation(api.sales.sendReply,{draftId:String(b.draftId??"") as Id<"replyDrafts">,body:String(b.body??"")}));
   case "outcome":{
    const outcome=b.outcome==="won"?"won":b.outcome==="lost"?"lost":null;
    if(!outcome)return Response.json({error:"Unknown outcome"},{status:400});
    return Response.json(await c.mutation(api.sales.markOutcome,{prospectId:pid,outcome,amount:typeof b.amount==="number"?b.amount:undefined,note:typeof b.note==="string"?b.note:undefined}));
   }
   default:return Response.json({error:"Unknown action"},{status:400});
  }
 }catch(e){
  const msg=e instanceof Error?e.message:"Request failed";
  return Response.json({error:msg.replace(/^\[CONVEX[^\]]*\]\s*/,"").replace(/^Uncaught Error:\s*/,"").split("\n")[0].slice(0,300)},{status:400});
 }
}
