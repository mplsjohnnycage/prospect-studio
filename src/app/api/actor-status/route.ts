export const maxDuration=30;
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){try{const response=await fetch("http://127.0.0.1:6420/health",{signal:AbortSignal.timeout(1000)});return Response.json({reachable:response.ok,httpStatus:response.status})}catch{return Response.json({reachable:false,reason:"Local Rivet control plane is not responding"})}}
