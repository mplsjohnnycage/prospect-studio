// Agentic step 8: desktop/Sprite worker. Stateless: claim one task -> run -> write result -> exit (or loop with --loop).
// Env: CONVEX_URL, AUTOPILOT_SERVICE_SECRET, OWNER_ID, WORKER (e.g. desktop:jn or sprite:prospect). Never sends anything.
// Tasks it handles: recheck (live site fetch from a residential IP) and sense (free discovery -> promote).
import {ConvexHttpClient} from "convex/browser";
import {api} from "../convex/_generated/api";
import {siteHealth} from "../src/lib/revenue-engine";
import {execFileSync} from "node:child_process";
import {readFileSync,existsSync} from "node:fs";

const env=(k:string)=>{const x=process.env[k];if(!x)throw Error(k+" not set");return x;};
const client=new ConvexHttpClient(env("CONVEX_URL"));
const secret=env("AUTOPILOT_SERVICE_SECRET"),ownerId=env("OWNER_ID"),worker=env("WORKER");
async function once():Promise<boolean>{
 const t=await client.mutation(api.agent.workerClaim,{secret,ownerId,worker,kinds:["recheck","sense"]}) as {_id:string;kind:string;input?:{url?:string}}|null;
 if(!t)return false;
 const startedAt=Date.now();
 try{
  let result:unknown={};
  if(t.kind==="recheck"&&t.input?.url){const s=Date.now();try{const r=await fetch(t.input.url,{signal:AbortSignal.timeout(8000)});result=siteHealth({url:r.url,status:r.status,https:r.url.startsWith("https:"),html:(await r.text()).slice(0,200_000),loadMs:Date.now()-s});}catch{result=siteHealth({url:t.input.url,dnsFailed:true});}}
  if(t.kind==="sense"){execFileSync("node",["--import","tsx","scripts/discover-local.mts","--source","mpls,stp","--days","7","--limit","200"],{stdio:"inherit"});
   if(existsSync(".data/promote.json")){const recs=JSON.parse(readFileSync(".data/promote.json","utf8")) as unknown[];result={promotable:recs.length,note:"promote via MCP promote_records in batches of 200"};}}
  await client.mutation(api.agent.workerComplete,{secret,taskId:t._id as never,worker,ok:true,result,startedAt,tier:worker.split(":")[0]});
 }catch(e){await client.mutation(api.agent.workerComplete,{secret,taskId:t._id as never,worker,ok:false,error:String(e).slice(0,300),startedAt});}
 return true;
}
const loop=process.argv.includes("--loop");
do{const had=await once();if(!loop)break;await new Promise(r=>setTimeout(r,had?1000:60_000));}while(true);
