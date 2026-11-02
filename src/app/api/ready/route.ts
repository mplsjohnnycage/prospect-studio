import {ConvexHttpClient} from "convex/browser";
import {api} from "../../../../convex/_generated/api";

export const runtime="nodejs";
export const dynamic="force-dynamic";

// Do not claim the app is ready just because the Next.js process is alive.
export async function GET(){
 const url=process.env.NEXT_PUBLIC_CONVEX_URL;
 if(!url||!/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(url))
  return Response.json({ok:false,service:"prospect-studio",backend:"misconfigured"},{status:503,headers:{"Cache-Control":"no-store"}});
 try{
  const client=new ConvexHttpClient(url);
  const available=await Promise.race([
   client.query(api.health.ping,{}).then(r=>r.ok===true),
   new Promise<false>(resolve=>setTimeout(()=>resolve(false),8000))
  ]);
  if(!available)throw new Error("backend unavailable");
  return Response.json({ok:true,service:"prospect-studio",backend:"ready"},{headers:{"Cache-Control":"no-store"}});
 }catch{
  return Response.json({ok:false,service:"prospect-studio",backend:"unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
