import {getConvex,api} from "@/lib/convex-server";
import {buildConceptInVercelSandbox} from "@/lib/vercel-sandbox";
import type {Id} from "../../../../convex/_generated/dataModel";
import type {ConceptInput} from "@/lib/concept-template";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=180;
function requestParams(url:string){const u=new URL(url);return {trade:(u.searchParams.get("trade")||"").trim(),city:(u.searchParams.get("city")||"").trim()};}
function valid(trade:string,city:string){return trade.length>=3&&trade.length<=70&&city.length>=3&&city.length<=120;}
export async function GET(req:Request){
 try{const {trade,city}=requestParams(req.url);if(!valid(trade,city))return Response.json({error:"Trade and city required"},{status:400});
 const result=await getConvex().query(api.autopilot.rankedCampaign,{trade,city});
 return Response.json(result);
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Unable to read ranking"},{status:400})}
}
export async function POST(req:Request){
 try{
  const body=await req.json() as {trade?:string;city?:string;mode?:"discover"|"build"|"schedule";enabled?:boolean};
  const trade=String(body.trade||"").trim(),city=String(body.city||"").trim();
  if(!valid(trade,city))return Response.json({error:"Trade and city required (3-120 characters)"},{status:400});
  const convex=getConvex();
  if(body.mode==="schedule"){
   const enabled=await convex.mutation(api.autopilot.setSchedule,{trade,city,enabled:body.enabled===true});
   return Response.json({enabled,emailsSent:0});
  }
  if(body.mode==="discover"){
   const search=await convex.action(api.autopilot.discover,{trade,city});
   const rank=await convex.query(api.autopilot.rankedCampaign,{trade,city});
   return Response.json({search,ranking:rank});
  }
  if(body.mode!=="build")return Response.json({error:"Unknown mode"},{status:400});
  if(process.env.SANDBOX_PREVIEWS_ENABLED!=="1"||process.env.VERCEL!=="1")return Response.json({error:"Vercel Sandbox preview builds unavailable"},{status:503});
  const ranking=await convex.query(api.autopilot.rankedCampaign,{trade,city});
  const pending=ranking.eligible.filter((p:{stage:string})=>!["Demo","Outreach","Convert","Produce"].includes(p.stage)).slice(0,2) as {id:string;name:string;stage:string}[];
  const built:{prospectId:string;name:string;checksum:string;draftCreated:boolean}[]=[];
  const errors:{prospectId:string;message:string}[]=[];
  for(const p of pending) {
   try{
    const {prospectId,conceptId,alreadyBuilt}=await convex.mutation(api.autopilot.prepareDemo,{prospectId:p.id as Id<"prospects">});
    if(!alreadyBuilt){
     const detail=await convex.query(api.prospects.detail,{id:prospectId});
     if(!detail)throw Error("Prospect record unavailable");
     const concept=detail.concepts.find(c=>c._id===conceptId);
     if(!concept)throw Error("Approved concept missing");
     const input:ConceptInput={prospectId,businessName:detail.prospect.name,trade:detail.prospect.trade,city:detail.prospect.city,direction:concept.direction as ConceptInput["direction"]};
     const artifact=await buildConceptInVercelSandbox(input);
     await convex.mutation(api.prospects.saveConceptPreview,{prospectId,conceptId,html:artifact.html,sha256:artifact.sha256});
    }
    const draft=await convex.mutation(api.autopilot.draftAfterDemo,{prospectId});
    built.push({prospectId,name:p.name,checksum:"verified",draftCreated:draft.created});
   }catch(e){errors.push({prospectId:p.id,message:e instanceof Error?e.message:"Unable to build"})}
  }
  return Response.json({rankedQualified:ranking.qualified,allowedDemos:ranking.demoBudget,built,errors,remaining:Math.max(0,ranking.demoBudget-ranking.eligible.filter((p:{stage:string})=>["Demo","Outreach","Convert","Produce"].includes(p.stage)).length-built.length),emailsSent:0});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Autopilot failed"},{status:400})}
}
