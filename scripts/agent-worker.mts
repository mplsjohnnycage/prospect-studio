// Agentic step 8: desktop/Sprite worker. Stateless: claim one task -> run -> write result -> exit (or loop with --loop).
// Tier 1 = desktop (WORKER=desktop:3apdbkg). Fallback = Sprite (WORKER=sprite:prospect), which the server lets claim only when
// the desktop heartbeat is older than 75 s. Johnny must register each worker name in Settings > Agent loop > allowlist.
// Leases (Tailscale plan): 90 s TTL, renewed every 20 s while working, 3 attempts then parked for review.
// Idle polls every 30 s double as the heartbeat. A wall-clock jump (PC slept) drops the lease; the server re-queues it.
// Env: CONVEX_URL, AUTOPILOT_SERVICE_SECRET, OWNER_ID, WORKER. Never sends anything.
// Tasks it handles: recheck (live site fetch from a residential IP) and sense (free discovery -> promote).
import {ConvexHttpClient} from "convex/browser";
import {api} from "../convex/_generated/api";
import type {Id} from "../convex/_generated/dataModel";
import {siteHealth} from "../src/lib/revenue-engine";
import {LEASE_RENEW_MS,LEASE_TTL_MS,WORKER_HEARTBEAT_MS} from "../src/lib/agent-core";
import {execFile} from "node:child_process";
import {routeTier,runTiered,type ExecTier,type TierRunners} from "../src/lib/agent-tiers";
import {runInWasm} from "../src/lib/tier1-wasm";
import {runInSandbox} from "../src/lib/tier2-sandbox";
import type {TaskKind} from "../src/lib/agent-core";
import {promisify} from "node:util";
import {readFileSync,existsSync} from "node:fs";

const env=(k:string)=>{const x=process.env[k];if(!x)throw Error(k+" not set");return x;};
const client=new ConvexHttpClient(env("CONVEX_URL"));
// Prefer the HTTP door (secret in the Authorization header). AGENT_LEGACY_ARGS=1 keeps the old mutation path during transition.
const site=(process.env.CONVEX_SITE_URL??env("CONVEX_URL").replace(/\.convex\.cloud\/?$/,".convex.site")).replace(/\/$/,"");
const legacy=process.env.AGENT_LEGACY_ARGS==="1";
async function door<T>(op:"claim"|"renew"|"complete"|"reviews"|"lookalike",body:Record<string,unknown>):Promise<T>{
 const r=await fetch(site+"/agent/"+op,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+process.env.AUTOPILOT_SERVICE_SECRET},body:JSON.stringify(body)});
 const j=await r.json() as T&{error?:string};if(!r.ok)throw Error(j.error??"HTTP "+r.status);return j;
}
const secret=env("AUTOPILOT_SERVICE_SECRET"),ownerId=env("OWNER_ID"),worker=env("WORKER");
type Claimed={_id:Id<"agentTasks">;kind:string;leaseId:string;prospectId?:string;input?:{url?:string}};
async function once():Promise<boolean>{
 const t=(legacy?await client.mutation(api.agent.workerClaim,{secret,ownerId,worker,kinds:["recheck","sense","reviews","embed"]}):await door("claim",{ownerId,worker,kinds:["recheck","sense","reviews","embed"]})) as Claimed|null;
 if(!t)return false;
 const startedAt=Date.now();let lost=false,last=Date.now();
 const renew=setInterval(async()=>{
  const now=Date.now();if(now-last>LEASE_TTL_MS){lost=true;clearInterval(renew);return;} // slept: lease is gone
  last=now;try{const ok=legacy?await client.mutation(api.agent.workerRenew,{secret,taskId:t._id,worker,leaseId:t.leaseId}):await door<boolean>("renew",{taskId:t._id,worker,leaseId:t.leaseId});if(!ok)lost=true;}catch{/* retry next tick */}
 },LEASE_RENEW_MS);
 try{
  // Tiered execution: Tier 0 in this process; Tier 1 snippet in QuickJS-wasm; Tier 2 in the network-less Docker sandbox.
  const inp=(t.input??{}) as {code?:string;cmd?:string[];data?:unknown};
  const start:ExecTier=routeTier(t.kind as TaskKind,{code:typeof inp.code==="string",fullEnv:Array.isArray(inp.cmd)});
  const runners:TierRunners<unknown>={
   0:async()=>{let result:unknown={};
  if(t.kind==="recheck"&&t.input?.url){const s=Date.now();try{const r=await fetch(t.input.url,{signal:AbortSignal.timeout(8000)});result=siteHealth({url:r.url,status:r.status,https:r.url.startsWith("https:"),html:(await r.text()).slice(0,200_000),loadMs:Date.now()-s});}catch{result=siteHealth({url:t.input.url,dnsFailed:true});}}
  if(t.kind==="reviews"&&t.prospectId){const {scrapeReviews}=await import("./scrape-reviews.mjs");const data=await scrapeReviews(t.prospectId,t.input as {name?:string;city?:string;placeUrl?:string}|undefined);
   result=data?await door("reviews",{ownerId,worker,data}):{applied:false,reason:"no review data found"};}
  if(t.kind==="embed"&&t.prospectId){const {runEmbed}=await import("./embed-local.mjs");const r=await runEmbed(t.prospectId,t.input as {text:string;won:boolean;winners:string[]});
   result=await door("lookalike",{ownerId,worker,prospectId:t.prospectId,...(r.score!==undefined?{score:r.score}:{}),winners:r.winners,model:r.model,endpointOk:r.endpointOk,...(r.error?{error:r.error}:{})});}
  if(t.kind==="sense"){await promisify(execFile)("node",["--import","tsx","scripts/discover-local.mts","--source","mpls,stp","--days","7","--limit","200"]);
   if(existsSync(".data/promote.json")){const recs=JSON.parse(readFileSync(".data/promote.json","utf8")) as unknown[];result={promotable:recs.length,note:"promote via MCP promote_records in batches of 200"};}}
   return result;},
   1:async()=>{if(!inp.code)throw Error("tier1: no code");return await runInWasm(inp.code,inp.data);},
   2:async()=>{const cmd=inp.cmd??(inp.code?["node","-e",inp.code]:null);if(!cmd)throw Error("tier2: no command");return await runInSandbox(cmd);},
  };
  const ran=await runTiered(t.kind as TaskKind,start,runners,e=>console.log("tier escalation",JSON.stringify(e)));
  const result={...(ran.value&&typeof ran.value==="object"&&!Array.isArray(ran.value)?ran.value as object:{value:ran.value}),tier:ran.label,escalations:ran.escalations};
  clearInterval(renew);
  if(!lost){const b={taskId:t._id,worker,leaseId:t.leaseId,ok:true,result,startedAt,tier:ran.label};if(legacy)await client.mutation(api.agent.workerComplete,{secret,...b});else await door("complete",b);}
 }catch(e){clearInterval(renew);if(!lost){const b={taskId:t._id,worker,leaseId:t.leaseId,ok:false,error:String(e).slice(0,300),startedAt};await (legacy?client.mutation(api.agent.workerComplete,{secret,...b}):door("complete",b)).catch(()=>undefined);}}
 return true;
}
const loop=process.argv.includes("--loop");
do{const had=await once().catch(e=>{console.error(String(e).slice(0,200));return false;});if(!loop)break;await new Promise(r=>setTimeout(r,had?1000:WORKER_HEARTBEAT_MS));}while(true);
