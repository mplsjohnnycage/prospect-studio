import {getConvex,api} from "@/lib/convex-server";
import type {Id} from "../../../../convex/_generated/dataModel";
export const runtime="nodejs";
export async function GET(){try{return Response.json({entries:await getConvex().query(api.suppressions.list,{})})}catch(e){return Response.json({error:e instanceof Error?e.message:"Load failed"},{status:400})}}
export async function POST(request:Request){try{const b=await request.json();const r=await getConvex().mutation(api.suppressions.add,{value:String(b.value??""),reason:typeof b.reason==="string"?b.reason:undefined});return Response.json(r,{status:r.added?201:200})}catch(e){return Response.json({error:e instanceof Error?e.message:"Save failed"},{status:400})}}
export async function DELETE(request:Request){try{const b=await request.json();await getConvex().mutation(api.suppressions.remove,{id:String(b.id??"") as Id<"suppressions">});return Response.json({ok:true})}catch(e){return Response.json({error:e instanceof Error?e.message:"Delete failed"},{status:400})}}
