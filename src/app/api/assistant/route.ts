import {getConvex,api} from "@/lib/convex-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 try{return Response.json({messages:await getConvex().query(api.assistant.history,{})})}
 catch(e){return Response.json({error:e instanceof Error?e.message:"Unable to load operations history"},{status:503})}
}
export async function POST(req:Request){
 try{
  const body=await req.json() as {text?:unknown};
  if(typeof body.text!=="string")throw Error("Question is required");
  const result=await getConvex().mutation(api.assistant.ask,{text:body.text});
  return Response.json(result);
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Operations console unavailable"},{status:400})}
}
