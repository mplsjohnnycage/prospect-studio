import {timingSafeEqual} from "node:crypto";
import {ConvexHttpClient} from "convex/browser";
import {api} from "../../../../../convex/_generated/api";
import {buildConceptInVercelSandbox} from "@/lib/vercel-sandbox";
import type {ConceptInput} from "@/lib/concept-template";
import type {Id} from "../../../../../convex/_generated/dataModel";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=180;
const sameSecret=(candidate:string,expected:string)=>{
 const a=Buffer.from(candidate),b=Buffer.from(expected);
 return a.length===b.length && a.length>=32 && timingSafeEqual(a,b);
};
export async function GET(req:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||!sameSecret(req.headers.get("authorization")?.replace(/^Bearer /i,"")||"",secret))return Response.json({error:"Unauthorized"},{status:401});
 if(!process.env.NEXT_PUBLIC_CONVEX_URL||process.env.SANDBOX_PREVIEWS_ENABLED!=="1")return Response.json({error:"Autopilot worker not configured"},{status:503});
 const client=new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
 try{
  const run=await client.action(api.autopilotService.runDaily,{token:secret});
  if(run.idle)return Response.json(run);
  const built:{id:string;name:string;status:string}[]=[];
  const failures:{id:string;error:string}[]=[];
  // Keep daily spend bounded to one isolated VM build per invocation.
  for(const id of (run.eligibleIds||[]).slice(0,1) as Id<"prospects">[]){
   try{
    const prep=await client.action(api.autopilotService.prepare,{token:secret,prospectId:id});
    if(prep.alreadyBuilt){built.push({id,name:prep.name,status:"already-built"});continue;}
    const artifact=await buildConceptInVercelSandbox({prospectId:id,businessName:prep.name,trade:prep.trade,city:prep.city,direction:prep.direction as ConceptInput["direction"]});
    const draft=await client.action(api.autopilotService.saveAndDraft,{token:secret,prospectId:id,conceptId:prep.conceptId,html:artifact.html,sha256:artifact.sha256});
    built.push({id,name:prep.name,status:draft.created?"demo-and-draft":"demo-existing-draft"});
   }catch(e){failures.push({id,error:e instanceof Error?e.message:"Build failed"});}
  }
  return Response.json({provider:"Firecrawl",research:run.research,qualifiedPoolDemos:run.demoBudget,built,failures,emailsSent:0});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Scheduled autopilot failed"},{status:500});}
}
