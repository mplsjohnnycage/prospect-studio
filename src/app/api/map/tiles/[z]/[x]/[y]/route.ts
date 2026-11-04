import {NextRequest} from "next/server";
export const maxDuration=15;
export const runtime="nodejs";
export const revalidate=86400;
const maxZoom=19;
function valid(z:number,x:number,y:number){
 if(!Number.isInteger(z)||z<0||z>maxZoom)return false;
 const lim=2**z;return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<lim&&y<lim;
}
export async function GET(_request:NextRequest,{params}:{params:Promise<{z:string;x:string;y:string}>}){
 const {z:rawZ,x:rawX,y:rawY}=await params;
 if(!/^\d{1,2}$/.test(rawZ)||!/^\d{1,7}$/.test(rawX)||!/^\d{1,7}$/.test(rawY))return new Response("Bad tile coordinates",{status:400});
 const [z,x,y]=[+rawZ,+rawX,+rawY];if(!valid(z,x,y))return new Response("Invalid tile",{status:400});
 try{
  const upstream=await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`,{headers:{"User-Agent":"ProspectStudio/1.0 (map tile proxy; attribution OpenStreetMap)","Accept":"image/png"},signal:AbortSignal.timeout(9000),next:{revalidate:86400}});
  if(!upstream.ok)return new Response("Map tiles unavailable",{status:502});
  const mime=upstream.headers.get("content-type")||"";
  if(!mime.startsWith("image/png"))return new Response("Unexpected map tile content",{status:502});
  const bytes=await upstream.arrayBuffer();
  if(bytes.byteLength>400000)return new Response("Oversized tile",{status:502});
  return new Response(bytes,{headers:{"Content-Type":"image/png","Cache-Control":"public, max-age=86400, stale-while-revalidate=604800","X-Content-Type-Options":"nosniff"}});
 }catch{return new Response("Map tiles temporarily unavailable",{status:503})}
}
