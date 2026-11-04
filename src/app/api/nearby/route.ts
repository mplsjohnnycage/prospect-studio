import {getConvex,api} from "@/lib/convex-server";
export const maxDuration=30;
export const runtime="nodejs";
export async function GET(req:Request){try{const u=new URL(req.url);const latitude=Number(u.searchParams.get("lat")),longitude=Number(u.searchParams.get("lng"));if(!Number.isFinite(latitude)||!Number.isFinite(longitude))throw new Error("Coordinates required");return Response.json({prospects:await getConvex().query(api.prospects.nearby,{latitude,longitude,radiusMeters:25000})})}catch(e){return Response.json({error:e instanceof Error?e.message:"Geo search failed"},{status:400})}}
