import {getConvex,api} from "@/lib/convex-server";
import type {Id} from "../../../../convex/_generated/dataModel";
export const maxDuration=30;
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){try{return Response.json({appointments:await getConvex().query(api.calendar.list,{})})}catch(e){return Response.json({error:e instanceof Error?e.message:"Unavailable"},{status:503})}}
export async function POST(request:Request){try{
 const b=await request.json();
 const id=await getConvex().mutation(api.calendar.create,{prospectId:b.prospectId as Id<"prospects">,startAt:Number(b.startAt),durationMinutes:Number(b.durationMinutes),title:String(b.title||""),notes:String(b.notes||""),bookingUrl:String(b.bookingUrl||"")});
 return Response.json({id},{status:201});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Invalid appointment"},{status:400})}}
export async function PATCH(request:Request){try{
 const b=await request.json();await getConvex().mutation(api.calendar.update,{id:b.id as Id<"appointments">,status:b.status,notes:b.notes});
 return Response.json({ok:true});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Unable to update"},{status:400})}}
export async function DELETE(request:Request){try{
 const b=await request.json();await getConvex().mutation(api.calendar.remove,{id:b.id as Id<"appointments">});
 return Response.json({ok:true});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Unable to delete"},{status:400})}}
