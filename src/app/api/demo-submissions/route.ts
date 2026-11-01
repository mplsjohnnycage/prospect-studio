import {getConvex,api} from "@/lib/convex-server";
import {validateDemoSubmission} from "@/lib/demo-submission";
import type {Id} from "../../../../convex/_generated/dataModel";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:Request){
 try{
  const b=await req.json() as {prospectId?:string;conceptId?:string;form?:unknown};
  if(!b.prospectId||!b.conceptId)throw Error("Prospect and concept required");
  const form=validateDemoSubmission(b.form);
  const id=await getConvex().mutation(api.demoSubmissions.submit,{prospectId:b.prospectId as Id<"prospects">,conceptId:b.conceptId as Id<"concepts">,form});
  return Response.json({ok:true,id,emailsSent:0},{status:201});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Preview test failed"},{status:400})}
}
export async function GET(req:Request){
 try{
  const id=new URL(req.url).searchParams.get("prospectId");
  if(!id)throw Error("Prospect required");
  const submissions=await getConvex().query(api.demoSubmissions.list,{prospectId:id as Id<"prospects">});
  return Response.json({submissions});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Preview test lookup failed"},{status:400})}
}
