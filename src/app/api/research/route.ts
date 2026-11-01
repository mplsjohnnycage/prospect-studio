import {getConvex,api} from "@/lib/convex-server";
import type {Id} from "../../../../convex/_generated/dataModel";
export const runtime="nodejs";
export async function POST(req:Request){try{const body=await req.json();const result=await getConvex().action(api.research.scrapeProspect,{prospectId:body.prospectId as Id<"prospects">,url:String(body.url??"")});return Response.json(result)}catch(e){return Response.json({error:e instanceof Error?e.message:"Research failed"},{status:400})}}
