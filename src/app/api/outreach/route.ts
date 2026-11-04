import {getConvex,api} from "@/lib/convex-server";
import type {Id} from "../../../../convex/_generated/dataModel";
export const maxDuration=30;
export const runtime="nodejs";
export async function PATCH(request:Request){try{const b=await request.json();await getConvex().mutation(api.outreach.edit,{id:b.id as Id<"outreach">,subject:String(b.subject||""),body:String(b.body||"")});return Response.json({ok:true})}catch(e){return Response.json({error:e instanceof Error?e.message:"Save failed"},{status:400})}}
