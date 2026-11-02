import {randomUUID} from "node:crypto";
import {createClient} from "rivetkit/client";
import type {registry} from "@/lib/rivet";
import {getConvex,api} from "@/lib/convex-server";
import type {Id} from "../../../../../convex/_generated/dataModel";
import type {ConceptInput,ConceptBuildResult} from "@/lib/agentos";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=180;
const trustedLocalActor=(url:string|undefined)=>url!==undefined&&/^https?:\/\/127\.0\.0\.1:6420\/?$/.test(url);

export async function POST(req:Request){
 const sandboxEnabled=process.env.VERCEL==="1" && process.env.SANDBOX_PREVIEWS_ENABLED==="1";
 const rivetEnabled=process.env.AGENTOS_PREVIEWS_ENABLED==="1" && trustedLocalActor(process.env.RIVET_ENDPOINT);
 if(!sandboxEnabled&&!rivetEnabled)return Response.json({error:"Verified concept builds not configured for this environment"},{status:503});
 try {
  const json=await req.json() as {prospectId?:string;conceptId?:string};
  if(typeof json.prospectId!=="string"||typeof json.conceptId!=="string")throw Error("Missing prospect or concept id");
  const convex=getConvex();
  const d=await convex.query(api.prospects.detail,{id:json.prospectId as Id<"prospects">});
  if(!d)return Response.json({error:"Prospect not found"},{status:404});
  if(!["Design","Demo"].includes(d.prospect.stage)||d.prospect.status==="paused"||d.prospect.status==="blocked")throw Error("Prospect is not in an eligible design state");
  const c=d.concepts.find(c=>c._id===json.conceptId);
  if(!c||c.status!=="approved")throw Error("Concept must be approved");
  if(c.html)return Response.json({alreadyBuilt:true,checksum:c.sha256});
  const input:ConceptInput={
   prospectId:d.prospect._id,businessName:d.prospect.name,trade:d.prospect.trade,city:d.prospect.city,
   direction:c.direction as ConceptInput["direction"]
  };
  const claimId=randomUUID();
  const state=await convex.mutation(api.prospects.claimConceptBuild,{prospectId:d.prospect._id,conceptId:c._id,claimId});
  if(state==="built"){const latest=await convex.query(api.prospects.detail,{id:d.prospect._id});const saved=latest?.concepts.find(x=>x._id===c._id);return Response.json({alreadyBuilt:true,checksum:saved?.sha256});}
  if(state==="busy")return Response.json({error:"Concept build already running. Retry after the existing build finishes."},{status:409,headers:{"Retry-After":"30"}});
  try {
    let result:ConceptBuildResult;
    if(sandboxEnabled){
      const {buildConceptInVercelSandbox}=await import("@/lib/vercel-sandbox");
      result=await buildConceptInVercelSandbox(input);
    }else{
      const client=createClient<typeof registry>(process.env.RIVET_ENDPOINT!);
      const actor=client.prospectActor.getOrCreate([d.prospect._id]);
      result=await actor.generateConcept(input);
    }
    await convex.mutation(api.prospects.saveConceptPreview,{prospectId:d.prospect._id,conceptId:c._id,html:result.html,sha256:result.sha256,claimId});
    return Response.json({ok:true,checksum:result.sha256,runtime:result.runtime,vmType:result.vmType,verified:result.verified});
  }finally{
    // If building fails the claim is released; successful saves clear it atomically.
    await convex.mutation(api.prospects.releaseConceptBuild,{prospectId:d.prospect._id,conceptId:c._id,claimId}).catch(()=>{});
  }
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Verified concept build failed"},{status:400})}
}
