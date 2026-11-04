import {getConvex,api} from "@/lib/convex-server";import {activity,message} from "@/lib/legacy-adapter";
export const maxDuration=30;
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){try{const c=getConvex();const [logs,stats,outreach]=await Promise.all([c.query(api.prospects.activity,{}),c.query(api.email.status,{}),c.query(api.prospects.outreachAll,{})]);return Response.json({activity:logs.map(activity),messages:outreach.map(message),email:stats})}catch(e){return Response.json({error:e instanceof Error?e.message:"Backend unavailable"},{status:503})}}
