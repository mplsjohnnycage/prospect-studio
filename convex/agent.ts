// Full-agentic loop: task queue with leases, kill switch, autonomy levels, caps, run log, trace, digest.
// Stateless: every task loads state from Convex, does one step, writes result + run row, exits.
// The agent can never send email, set prices or spend. Those paths do not exist here.
import {action,internalAction,internalMutation,internalQuery,mutation,query} from "./_generated/server";
import type {MutationCtx,QueryCtx} from "./_generated/server";
import {internal} from "./_generated/api";
import {v} from "convex/values";
import type {Doc,Id} from "./_generated/dataModel";
import {owner} from "./identity";
import {DESKTOP_HEARTBEAT_MS,fallbackAllowed,DEFAULT_CONFIG,mayRun,mayClaim,setLevel,taskKey,onFailure,leaseFor,alertsFor,digest,callScript,weeklyReport,KIND_STAGE,type AgentConfig,type TaskKind,type Level,type AgentStage} from "../src/lib/agent-core";
import {tryDemoIR} from "./demoIr";
import {siteHealth,recheck,calibrateWeights,type TriggerType} from "../src/lib/revenue-engine";
import {whyNowDraft} from "./autopilot";
import {logStageCost} from "./outcomes";
import {loadSuppressions} from "./suppressions";
import {isSuppressed} from "../src/lib/suppression";

export const taskKind=v.union(...(["sense","qualify","build","reach","learn","digest","recheck"] as const).map(v.literal));
const DAY=86_400_000;

export async function loadConfig(ctx:QueryCtx|MutationCtx,ownerId:string):Promise<AgentConfig>{
 const row=await ctx.db.query("agentConfig").withIndex("by_owner",q=>q.eq("ownerId",ownerId)).first();
 return row?{...DEFAULT_CONFIG,...(row.config as AgentConfig)}:DEFAULT_CONFIG;
}
async function saveConfig(ctx:MutationCtx,ownerId:string,cfg:AgentConfig){
 const row=await ctx.db.query("agentConfig").withIndex("by_owner",q=>q.eq("ownerId",ownerId)).first();
 if(row)await ctx.db.patch(row._id,{config:cfg,updatedAt:Date.now()});else await ctx.db.insert("agentConfig",{ownerId,config:cfg,updatedAt:Date.now()});
}
async function usedToday(ctx:QueryCtx|MutationCtx,ownerId:string){
 const since=Date.now()-DAY;
 const runs=await ctx.db.query("agentRuns").withIndex("by_owner_time",q=>q.eq("ownerId",ownerId).gte("startedAt",since)).take(2000);
 const ok=(k:string)=>runs.filter(r=>r.kind===k&&r.status==="ok").length;
 return {demos:ok("build"),drafts:ok("reach"),promotes:ok("sense")};
}

// ---------- Config (Johnny's controls) ----------
export const status=query({args:{},returns:v.any(),handler:async ctx=>{
 const user=await owner(ctx);const cfg=await loadConfig(ctx,user);
 const queued=await ctx.db.query("agentTasks").withIndex("by_owner_status",q=>q.eq("ownerId",user).eq("status","queued")).take(500);
 const parked=await ctx.db.query("agentTasks").withIndex("by_owner_status",q=>q.eq("ownerId",user).eq("status","parked")).take(100);
 return {config:cfg,used:await usedToday(ctx,user),queued:queued.length,parked:parked.length};
}});
export const setPaused=mutation({args:{paused:v.boolean()},returns:v.boolean(),handler:async(ctx,a)=>{const user=await owner(ctx);await saveConfig(ctx,user,{...await loadConfig(ctx,user),paused:a.paused});return a.paused;}});
export const setStageLevel=mutation({args:{stage:v.union(...(["sense","qualify","build","reach","learn"] as const).map(v.literal)),level:v.union(v.literal(0),v.literal(1),v.literal(2),v.literal(3))},returns:v.any(),
 handler:async(ctx,a)=>{const user=await owner(ctx);const cfg=setLevel(await loadConfig(ctx,user),a.stage as AgentStage,a.level as Level);await saveConfig(ctx,user,cfg);return cfg.levels;}});
export const setAllowlist=mutation({args:{workers:v.array(v.string())},returns:v.array(v.string()),handler:async(ctx,a)=>{const user=await owner(ctx);const w=a.workers.map(x=>x.trim()).filter(Boolean).slice(0,20);await saveConfig(ctx,user,{...await loadConfig(ctx,user),allowlist:w});return w;}});
export const recordEval=internalMutation({args:{ownerId:v.string(),stage:v.string(),passed:v.boolean()},returns:v.null(),handler:async(ctx,a)=>{const cfg=await loadConfig(ctx,a.ownerId);await saveConfig(ctx,a.ownerId,{...cfg,evalsPassed:{...cfg.evalsPassed,[a.stage]:a.passed?Date.now():0}});return null;}});

// ---------- Queue ----------
/** Keys are owner-scoped. A finished (done) task counts as a duplicate unless rerun is set (Johnny's explicit request). */
export async function enqueue(ctx:MutationCtx,ownerId:string,kind:TaskKind,prospectId?:Id<"prospects">,input:unknown={},rerun=false){
 const key=taskKey(kind,prospectId??"-",input);
 const dups=await ctx.db.query("agentTasks").withIndex("by_owner_key",q=>q.eq("ownerId",ownerId).eq("key",key)).order("desc").take(5);
 const open=dups.find(d=>d.status==="queued"||d.status==="claimed"||d.status==="parked");if(open)return open._id;
 const done=dups.find(d=>d.status==="done");if(done&&!rerun)return done._id;
 const now=Date.now();
 return await ctx.db.insert("agentTasks",{ownerId,key,kind,...(prospectId?{prospectId}:{}),input,status:"queued",attempts:0,notBefore:0,createdAt:now,updatedAt:now});
}
export const enqueueInternal=internalMutation({args:{ownerId:v.string(),kind:taskKind,prospectId:v.optional(v.id("prospects")),input:v.optional(v.any())},returns:v.id("agentTasks"),handler:async(ctx,a)=>enqueue(ctx,a.ownerId,a.kind,a.prospectId,a.input)});
type ClaimArgs={ownerId:string;worker:string;kinds?:TaskKind[]};
export const claimNext=internalMutation({args:{ownerId:v.string(),worker:v.string(),kinds:v.optional(v.array(taskKind))},returns:v.any(),handler:async(ctx,a)=>claimFor(ctx,a)});
async function beat(ctx:MutationCtx,ownerId:string,worker:string,now:number){
 const hb=await ctx.db.query("agentWorkers").withIndex("by_owner_worker",q=>q.eq("ownerId",ownerId).eq("worker",worker)).first();
 if(!hb)await ctx.db.insert("agentWorkers",{ownerId,worker,lastSeen:now});
 else if(now-hb.lastSeen>15_000)await ctx.db.patch(hb._id,{lastSeen:now}); // fewer writes, fewer OCC conflicts
}
async function claimFor(ctx:MutationCtx,a:ClaimArgs){ {
  const cfg=await loadConfig(ctx,a.ownerId);
  if(!mayClaim(cfg,a.worker))throw Error("Worker not on the allowlist");
  const now=Date.now();
  // Heartbeat: every claim attempt marks the worker alive. Desktop is Tier 1; Sprite claims only when the desktop is stale.
  if(a.worker!=="builtin")await beat(ctx,a.ownerId,a.worker,now);
  const desk=(await ctx.db.query("agentWorkers").withIndex("by_owner_worker",q=>q.eq("ownerId",a.ownerId)).take(20)).filter(w=>w.worker.startsWith("desktop:")).reduce((m,w)=>Math.max(m,w.lastSeen),0);
  if(!fallbackAllowed(a.worker,desk||undefined,now))return null;
  if(cfg.paused)return null;
  const used=await usedToday(ctx,a.ownerId);
  // Expired leases go back through onFailure (backoff, park after MAX_ATTEMPTS) instead of being reclaimed at once.
  for(const t of await ctx.db.query("agentTasks").withIndex("by_owner_status_lease",q=>q.eq("ownerId",a.ownerId).eq("status","claimed").lt("leaseUntil",now)).take(10)){
   const n=onFailure({key:t.key,kind:t.kind,status:t.status,attempts:t.attempts},now);
   await ctx.db.patch(t._id,{status:n.status,notBefore:n.notBefore??0,leaseUntil:undefined,error:"Lease expired ("+(t.claimedBy??"?")+")",updatedAt:now});
  }
  const cands=(await ctx.db.query("agentTasks").withIndex("by_owner_status_notBefore",q=>q.eq("ownerId",a.ownerId).eq("status","queued").lte("notBefore",now)).take(25))
   .filter(t=>!a.kinds||a.kinds.includes(t.kind));
  for(const t of cands){
   const d=mayRun(cfg,t.kind,used);
   if(!d.allow)continue;
   const leaseId=crypto.randomUUID();
   const patch={status:"claimed" as const,claimedBy:a.worker,leaseId,leaseUntil:now+leaseFor(a.worker),attempts:t.attempts+1,updatedAt:now};
   await ctx.db.patch(t._id,patch);
   return {...t,...patch};
  }
  return null;
 }}
type CompleteArgs={taskId:Id<"agentTasks">;worker:string;leaseId:string;ok:boolean;result?:unknown;error?:string;usd?:number;tier?:string;startedAt:number;skipped?:boolean};
export const complete=internalMutation({args:{taskId:v.id("agentTasks"),worker:v.string(),leaseId:v.string(),ok:v.boolean(),result:v.optional(v.any()),error:v.optional(v.string()),usd:v.optional(v.number()),tier:v.optional(v.string()),startedAt:v.number(),skipped:v.optional(v.boolean())},returns:v.null(),handler:async(ctx,a)=>completeFor(ctx,a)});
async function completeFor(ctx:MutationCtx,a:CompleteArgs){ {
  const t=await ctx.db.get(a.taskId);if(!t)return null;
  if(t.status==="done"&&t.leaseId===a.leaseId)return null; // duplicate complete: no-op
  const now=Date.now();
  if(t.status!=="claimed"||t.leaseId!==a.leaseId||t.claimedBy!==a.worker||(t.leaseUntil??0)<now)throw Error("Lease lost");
  if(a.ok)await ctx.db.patch(t._id,{status:"done",result:capResult(a.result),leaseUntil:undefined,updatedAt:now});
  else{const n=onFailure({key:t.key,kind:t.kind,status:t.status,attempts:t.attempts},now);await ctx.db.patch(t._id,{status:n.status,notBefore:n.notBefore,leaseUntil:undefined,error:(a.error??"").slice(0,300),updatedAt:now});}
  const usd=a.usd??0;
  await ctx.db.insert("agentRuns",{ownerId:t.ownerId,taskId:t._id,kind:t.kind,tier:a.tier??"convex",worker:a.worker,startedAt:a.startedAt,endedAt:now,status:a.skipped?"skipped":a.ok?"ok":"error",usd,...(a.error?{error:a.error.slice(0,300)}:{}),...(t.prospectId?{prospectId:t.prospectId}:{})});
  await logStageCost(ctx,{ownerId:t.ownerId,stage:KIND_STAGE[t.kind],usd,computeSeconds:Math.round((now-a.startedAt)/1000),tool:"agent:"+t.kind,...(t.prospectId?{prospectId:t.prospectId}:{})});
  if(usd>0){const cfg=await loadConfig(ctx,t.ownerId);await saveConfig(ctx,t.ownerId,{...cfg,paused:true});await ctx.db.insert("activities",{ownerId:t.ownerId,kind:"alert",summary:"Agent loop paused: a task recorded spend ($"+usd+")",timestamp:now});}
  const recent=await ctx.db.query("agentRuns").withIndex("by_owner_time",q=>q.eq("ownerId",t.ownerId)).order("desc").take(3);
  for(const al of alertsFor(recent.reverse().map(r=>({status:r.status,usd:r.usd,kind:r.kind,error:r.error}))))await ctx.db.insert("activities",{ownerId:t.ownerId,kind:"alert",summary:al,timestamp:now});
  return null;
 }}

function capResult(r:unknown){const s=JSON.stringify(r??null);return s.length>20_000?{truncated:true,preview:s.slice(0,2000)}:(r??null);}
/** Extend a live lease (external workers renew every 20 s). */
async function renewFor(ctx:MutationCtx,a:{taskId:Id<"agentTasks">;worker:string;leaseId:string}){
 const t=await ctx.db.get(a.taskId);const now=Date.now();
 if(!t||t.status!=="claimed"||t.leaseId!==a.leaseId||t.claimedBy!==a.worker||(t.leaseUntil??0)<now)return false;
 await ctx.db.patch(t._id,{leaseUntil:now+leaseFor(a.worker),updatedAt:now});await beat(ctx,t.ownerId,a.worker,now);return true;
}

// ---------- Handlers (one step each, all free, none send) ----------
export const runStep=internalMutation({args:{taskId:v.id("agentTasks"),site:v.optional(v.any())},returns:v.any(),
 handler:async(ctx,a)=>{
  const t=await ctx.db.get(a.taskId);if(!t||t.status!=="claimed")throw Error("Task is not claimed");
  const p=t.prospectId?await ctx.db.get(t.prospectId):null;
  switch(t.kind){
   case "qualify":case "recheck":{
    if(!p)return {skipped:true};
    if(a.site){const prev={site:{state:"weak" as const,score:50,issues:[]},trigger:{type:(p.triggerType??"none") as TriggerType,date:p.triggerDate}};
     const decision=recheck(prev,{site:a.site,trigger:prev.trigger});
     if(decision==="drop")await ctx.db.patch(p._id,{status:"paused",notes:(p.notes??"")+"\nAgent: site looks fixed; dropped",updatedAt:Date.now()});
     if(decision==="upgrade")await ctx.db.patch(p._id,{tier:"top",updatedAt:Date.now()});
     return {decision};}
    // Write the tier so plan never re-enqueues this prospect (fixes the qualify loop).
    const tier=p.tier??(p.score>=80?"top":p.score>=65?"strong":"standard");
    if(!p.tier)await ctx.db.patch(p._id,{tier,updatedAt:Date.now()});
    return {tier};
   }
   case "build":{
    if(!p)return {skipped:true};
    const r=await tryDemoIR(ctx,p);
    return "built" in r?{built:true}:r; // model generator builds it on request (demos.generate falls back to it)
   }
   case "reach":{
    if(!p)return {skipped:true};
    if(await ctx.db.query("outreach").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).first())return {skipped:true,reason:"draft exists"};
    if(isSuppressed({contact:p.contact,website:p.website},await loadSuppressions(ctx,p.ownerId)))return {skipped:true,reason:"suppressed"};
    // Pre-draft site recheck: a fixed site drops the prospect, a dead one upgrades it, then we draft.
    if(a.site){const prev={site:{state:"weak" as const,score:50,issues:[]},trigger:{type:(p.triggerType??"none") as TriggerType,date:p.triggerDate}};
     const decision=recheck(prev,{site:a.site,trigger:prev.trigger});
     if(decision==="drop"){await ctx.db.patch(p._id,{status:"paused",notes:(p.notes??"")+"\nAgent: site looks fixed; dropped before drafting",updatedAt:Date.now()});return {skipped:true,decision};}
     if(decision==="upgrade")await ctx.db.patch(p._id,{tier:"top",updatedAt:Date.now()});}
    const draft=await whyNowDraft(ctx,p);
    const id=await ctx.db.insert("outreach",{ownerId:p.ownerId,prospectId:p._id,subject:draft.subject,body:draft.body,status:"draft",updatedAt:Date.now()});
    await ctx.db.insert("sendSnapshots",{ownerId:p.ownerId,prospectId:p._id,outreachId:id,...(p.gates?{gates:p.gates}:{}),triggerType:p.triggerType??"none",...(p.triggerDate?{triggerDate:p.triggerDate}:{}),variant:draft.variant,subject:draft.subject,createdAt:Date.now()});
    const card=callScript({name:p.name,trade:p.trade,city:p.city,trigger:{type:(p.triggerType??"none") as TriggerType,date:p.triggerDate},gap:(p.scoreReasons??[]).filter(r=>r.startsWith("Gap:"))});
    await ctx.db.insert("activities",{ownerId:p.ownerId,prospectId:p._id,kind:"call_card",summary:card.join("\n").slice(0,500),timestamp:Date.now()});
    return {drafted:true,issues:draft.issues};
   }
   case "learn":{
    const ev=await ctx.db.query("outcomes").withIndex("by_owner_time",q=>q.eq("ownerId",t.ownerId)).order("desc").take(3000);
    const snaps=await ctx.db.query("sendSnapshots").withIndex("by_owner",q=>q.eq("ownerId",t.ownerId)).take(3000);
    const paid=new Set(ev.filter(e=>e.kind==="paid").map(e=>e.prospectId as string));
    const labeled=snaps.filter(s=>s.gates).map(s=>({gates:s.gates!,won:paid.has(s.prospectId)}));
    const prior=[0.2,0.25,0.2,0.15,0.2];
    const body=weeklyReport(ev.filter(e=>e.at>Date.now()-7*DAY).map(e=>({prospectId:e.prospectId,kind:e.kind,at:e.at})),calibrateWeights(labeled,prior),prior,labeled.length);
    await ctx.db.insert("agentDigests",{ownerId:t.ownerId,kind:"weekly",subject:"Prospect loop: weekly outcome report",body,createdAt:Date.now()});
    return {labels:labeled.length};
   }
   case "digest":{
    const runs=await ctx.db.query("agentRuns").withIndex("by_owner_time",q=>q.eq("ownerId",t.ownerId).gte("startedAt",Date.now()-DAY)).take(2000);
    const cfg=await loadConfig(ctx,t.ownerId);
    const d=digest({promoted:runs.filter(r=>r.kind==="sense"&&r.status==="ok").length,built:runs.filter(r=>r.kind==="build"&&r.status==="ok").length,drafted:runs.filter(r=>r.kind==="reach"&&r.status==="ok").length,failures:runs.filter(r=>r.status==="error").length,alerts:alertsFor(runs.map(r=>({status:r.status,usd:r.usd,kind:r.kind,error:r.error}))),paused:cfg.paused});
    await ctx.db.insert("agentDigests",{ownerId:t.ownerId,kind:"daily",subject:d.subject,body:d.body,createdAt:Date.now()});
    return {digest:true};
   }
   default: return {skipped:true};
  }
 }});

// ---------- Built-in worker (always drains; external workers are optional) ----------
async function fetchSite(url:string){
 const t=Date.now();
 try{const r=await fetch(url,{redirect:"follow",headers:{"user-agent":"prospect-studio-agent/0.1 (+mailto:johnnyc@agentmail.to)"},signal:AbortSignal.timeout(8000)});const html=(await r.text()).slice(0,200_000);return siteHealth({url:r.url,status:r.status,https:r.url.startsWith("https:"),html,loadMs:Date.now()-t});}
 catch{return siteHealth({url,dnsFailed:true});}
}
export const drain=internalAction({args:{ownerId:v.string(),max:v.optional(v.number())},returns:v.number(),
 handler:async(ctx,a)=>{
  let n=0;
  for(;n<(a.max??10);n++){
   const t=await ctx.runMutation(internal.agent.claimNext,{ownerId:a.ownerId,worker:"builtin"}) as Doc<"agentTasks">|null;
   if(!t)break;
   const startedAt=Date.now();
   try{
    let site;
    if((t.kind==="recheck"||t.kind==="reach")&&t.prospectId){const w=await ctx.runQuery(internal.agent.websiteOf,{prospectId:t.prospectId});if(w)site=await fetchSite(w);}
    const result=await ctx.runMutation(internal.agent.runStep,{taskId:t._id,...(site?{site}:{})});
    await ctx.runMutation(internal.agent.complete,{taskId:t._id,worker:"builtin",leaseId:t.leaseId!,ok:true,result,startedAt,skipped:!!(result as {skipped?:boolean})?.skipped});
   }catch(e){await ctx.runMutation(internal.agent.complete,{taskId:t._id,worker:"builtin",leaseId:t.leaseId!,ok:false,error:e instanceof Error?e.message:String(e),startedAt});}
  }
  return n;
 }});
export const websiteOf=internalQuery({args:{prospectId:v.id("prospects")},returns:v.union(v.string(),v.null()),handler:async(ctx,a)=>{const p=await ctx.db.get(a.prospectId);return p?.website&&/^https?:\/\//.test(p.website)?p.website:null;}});

// ---------- Scheduler: enqueue from state, then drain. Exits at once when paused. ----------
export const plan=internalMutation({args:{ownerId:v.string()},returns:v.number(),
 handler:async(ctx,a)=>{
  const cfg=await loadConfig(ctx,a.ownerId);if(cfg.paused)return 0;
  const ps=await ctx.db.query("prospects").withIndex("by_owner_updated",q=>q.eq("ownerId",a.ownerId)).order("desc").take(300);
  let n=0;
  for(const p of ps){
   if(p.status==="blocked"||p.status==="paused"||!p.qualified)continue;
   if(p.stage==="Qualify"&&!p.tier){await enqueue(ctx,a.ownerId,"qualify",p._id);n++;}
   else if(p.stage==="Qualify"&&cfg.levels.build>=2&&(p.tier==="top"||p.tier==="strong")){await enqueue(ctx,a.ownerId,"build",p._id);n++;}
   else if(p.stage==="Demo"&&cfg.levels.reach>=3){await enqueue(ctx,a.ownerId,"reach",p._id);n++;}
  }
  return n;
 }});
export const owners=internalQuery({args:{},returns:v.array(v.string()),handler:async ctx=>(await ctx.db.query("agentConfig").take(50)).filter(r=>!(r.config as AgentConfig).paused).map(r=>r.ownerId)});
export const tick=internalAction({args:{},returns:v.null(),handler:async ctx=>{
 for(const o of await ctx.runQuery(internal.agent.owners,{})){await ctx.runMutation(internal.agent.plan,{ownerId:o});await ctx.runAction(internal.agent.drain,{ownerId:o,max:20});}
 return null;
}});
export const dailyDigest=internalMutation({args:{},returns:v.null(),handler:async ctx=>{for(const r of await ctx.db.query("agentConfig").take(200)){if((r.config as AgentConfig).paused)continue;await enqueue(ctx,r.ownerId,"digest",undefined,{day:new Date().toISOString().slice(0,10)});}return null;}});
export const weeklyLearn=internalMutation({args:{},returns:v.null(),handler:async ctx=>{for(const r of await ctx.db.query("agentConfig").take(200)){if((r.config as AgentConfig).paused)continue;await enqueue(ctx,r.ownerId,"learn",undefined,{week:Math.floor(Date.now()/(7*DAY))});}return null;}});

// ---------- Johnny asks for one step at L1 (e.g. build this demo, draft this one) ----------
export const request=mutation({args:{kind:v.union(v.literal("qualify"),v.literal("recheck"),v.literal("build"),v.literal("reach")),prospectId:v.id("prospects")},returns:v.id("agentTasks"),handler:async(ctx,a)=>{const user=await owner(ctx);const p=await ctx.db.get(a.prospectId);if(!p||p.ownerId!==user)throw Error("Prospect not found");return enqueue(ctx,user,a.kind,a.prospectId,{},true);}});
/** Unpark (retry) or cancel a parked/failed task. */
export const retryTask=mutation({args:{taskId:v.id("agentTasks")},returns:v.null(),handler:async(ctx,a)=>{const user=await owner(ctx);const t=await ctx.db.get(a.taskId);if(!t||t.ownerId!==user)throw Error("Task not found");if(t.status!=="parked"&&t.status!=="failed")return null;await ctx.db.patch(t._id,{status:"queued",attempts:0,notBefore:0,error:undefined,updatedAt:Date.now()});return null;}});
export const cancelTask=mutation({args:{taskId:v.id("agentTasks")},returns:v.null(),handler:async(ctx,a)=>{const user=await owner(ctx);const t=await ctx.db.get(a.taskId);if(!t||t.ownerId!==user)throw Error("Task not found");if(t.status==="done")return null;await ctx.db.patch(t._id,{status:"failed",leaseUntil:undefined,error:"Cancelled by Johnny",updatedAt:Date.now()});return null;}});
export const runNow=action({args:{},returns:v.number(),handler:async (ctx):Promise<number>=>{const user:string|null=await ctx.runQuery(internal.agent.whoami,{});if(!user)throw Error("Not signed in");return await ctx.runAction(internal.agent.drainRequested,{ownerId:user});}});
export const whoami=internalQuery({args:{},returns:v.union(v.string(),v.null()),handler:async ctx=>{try{return await owner(ctx);}catch{return null;}}});
/** Requested tasks run at L1 even when the loop is paused? No: the kill switch stops everything. */
export const drainRequested=internalAction({args:{ownerId:v.string()},returns:v.number(),handler:async(ctx,a):Promise<number>=>await ctx.runAction(internal.agent.drain,{ownerId:a.ownerId,max:5})});

// ---------- Observability ----------
export const trace=query({args:{prospectId:v.id("prospects")},returns:v.any(),handler:async(ctx,a)=>{
 const user=await owner(ctx);const p=await ctx.db.get(a.prospectId);if(!p||p.ownerId!==user)throw Error("Prospect not found");
 const runs=await ctx.db.query("agentRuns").withIndex("by_prospect",q=>q.eq("prospectId",a.prospectId)).take(200);
 const acts=await ctx.db.query("activities").withIndex("by_prospect",q=>q.eq("prospectId",a.prospectId)).take(200);
 const outs=await ctx.db.query("outcomes").withIndex("by_prospect",q=>q.eq("prospectId",a.prospectId)).take(200);
 return [...runs.map(r=>({at:r.startedAt,type:"run",what:r.kind+" "+r.status+(r.error?": "+r.error:""),usd:r.usd})),...acts.map(x=>({at:x.timestamp,type:"activity",what:x.kind+": "+x.summary})),...outs.map(o=>({at:o.at,type:"outcome",what:o.kind}))].sort((x,y)=>x.at-y.at);
}});
export const digests=query({args:{},returns:v.any(),handler:async ctx=>{const user=await owner(ctx);return await ctx.db.query("agentDigests").withIndex("by_owner_time",q=>q.eq("ownerId",user)).order("desc").take(14);}});

// ---------- Worker door (desktop/Sprite/allowlisted agents), guarded by the service secret ----------
// The secret proves the caller is ours; the worker name must also be registered (allowlisted) for that owner. "builtin" is internal only.
function checkSecret(secret:string){const s=process.env.AUTOPILOT_SERVICE_SECRET;if(!s||secret!==s)throw Error("Unauthorized worker");}
function checkWorkerName(worker:string){if(worker==="builtin"||!/^[a-z0-9_-]+:[a-z0-9_.-]{1,40}$/i.test(worker))throw Error("Invalid worker name");}
export const workerClaim=mutation({args:{secret:v.string(),ownerId:v.string(),worker:v.string(),kinds:v.optional(v.array(taskKind))},returns:v.any(),handler:async(ctx,a)=>{checkSecret(a.secret);checkWorkerName(a.worker);return await claimFor(ctx,{ownerId:a.ownerId,worker:a.worker,...(a.kinds?{kinds:a.kinds}:{})});}});
export const workerRenew=mutation({args:{secret:v.string(),taskId:v.id("agentTasks"),worker:v.string(),leaseId:v.string()},returns:v.boolean(),handler:async(ctx,a)=>{checkSecret(a.secret);checkWorkerName(a.worker);return await renewFor(ctx,a);}});
export const workerComplete=mutation({args:{secret:v.string(),taskId:v.id("agentTasks"),worker:v.string(),leaseId:v.string(),skipped:v.optional(v.boolean()),ok:v.boolean(),result:v.optional(v.any()),error:v.optional(v.string()),usd:v.optional(v.number()),tier:v.optional(v.string()),startedAt:v.number()},returns:v.null(),handler:async(ctx,a)=>{checkSecret(a.secret);checkWorkerName(a.worker);const {secret:_s,...rest}=a;void _s;return await completeFor(ctx,rest);}});

export const statusFor=internalQuery({args:{ownerId:v.string()},returns:v.any(),handler:async(ctx,a)=>{const cfg=await loadConfig(ctx,a.ownerId);const q=await ctx.db.query("agentTasks").withIndex("by_owner_status",x=>x.eq("ownerId",a.ownerId).eq("status","queued")).take(500);return {paused:cfg.paused,levels:cfg.levels,caps:cfg.caps,used:await usedToday(ctx,a.ownerId),queued:q.length};}});

export const workers=query({args:{},returns:v.any(),handler:async ctx=>{const user=await owner(ctx);const now=Date.now();return (await ctx.db.query("agentWorkers").withIndex("by_owner_worker",q=>q.eq("ownerId",user)).take(20)).map(w=>({worker:w.worker,lastSeen:w.lastSeen,stale:now-w.lastSeen>DESKTOP_HEARTBEAT_MS}));}});
export const tasks=query({args:{},returns:v.any(),handler:async ctx=>{const user=await owner(ctx);const out=[];for(const st of ["claimed","queued","parked","failed"] as const)out.push(...await ctx.db.query("agentTasks").withIndex("by_owner_status",q=>q.eq("ownerId",user).eq("status",st)).take(30));return out.map(t=>({_id:t._id,kind:t.kind,status:t.status,attempts:t.attempts,claimedBy:t.claimedBy,leaseUntil:t.leaseUntil,error:t.error}));}});

// ---------- Approval queue (drafts wait for Johnny; approving never sends, Send stays in Sales) ----------
export const approvals=query({args:{},returns:v.any(),handler:async ctx=>{
 const user=await owner(ctx);
 const drafts=(await ctx.db.query("outreach").withIndex("by_owner",q=>q.eq("ownerId",user)).order("desc").take(200)).filter(o=>o.status==="draft").slice(0,25);
 const sup=await loadSuppressions(ctx,user);
 return await Promise.all(drafts.map(async o=>{
  const p=await ctx.db.get(o.prospectId);
  const acts=await ctx.db.query("activities").withIndex("by_prospect",q=>q.eq("prospectId",o.prospectId)).order("desc").take(30);
  const card=acts.find(x=>x.kind==="call_now")??acts.find(x=>x.kind==="call_card");
  const issues=[...(/Unsubscribe|opt out/i.test(o.body)?[]:["No opt-out line"]),...(/Oakdale, MN 55128/.test(o.body)?[]:["No postal address"]),...(p&&isSuppressed({contact:p.contact,website:p.website},sup)?["Recipient opted out"]:[])];
  return {id:o._id,prospectId:o.prospectId,name:p?.name??"(deleted)",subject:o.subject,body:o.body,updatedAt:o.updatedAt,callCard:card?.summary??null,issues};
 }));
}});
export const approveDraft=mutation({args:{id:v.id("outreach")},returns:v.null(),handler:async(ctx,a)=>{
 const user=await owner(ctx);const o=await ctx.db.get(a.id);if(!o||o.ownerId!==user)throw Error("Draft not found");
 if(o.status!=="draft")return null;
 const p=await ctx.db.get(o.prospectId);
 if(p&&isSuppressed({contact:p.contact,website:p.website},await loadSuppressions(ctx,user)))throw Error("This business opted out; the draft cannot be approved");
 if(!/Unsubscribe|opt out/i.test(o.body))throw Error("Add the opt-out line before approving (CAN-SPAM)");
 await ctx.db.patch(o._id,{status:"approved",updatedAt:Date.now()});
 await ctx.db.insert("activities",{ownerId:user,prospectId:o.prospectId,kind:"draft_approved",summary:"Draft approved; not sent (press Send in Sales)",timestamp:Date.now()});
 return null;
}});
export const discardDraft=mutation({args:{id:v.id("outreach")},returns:v.null(),handler:async(ctx,a)=>{
 const user=await owner(ctx);const o=await ctx.db.get(a.id);if(!o||o.ownerId!==user)throw Error("Draft not found");
 if(o.status!=="draft")throw Error("Only unsent drafts can be discarded");
 await ctx.db.delete(o._id);
 await ctx.db.insert("activities",{ownerId:user,prospectId:o.prospectId,kind:"draft_discarded",summary:"Draft discarded: "+o.subject.slice(0,120),timestamp:Date.now()});
 return null;
}});
// ---------- Opt-out state ----------
export const optOuts=query({args:{},returns:v.any(),handler:async ctx=>{
 const user=await owner(ctx);
 const sup=await ctx.db.query("suppressions").withIndex("by_owner",q=>q.eq("ownerId",user)).order("desc").take(50);
 const outcomes=await ctx.db.query("outcomes").withIndex("by_owner_time",q=>q.eq("ownerId",user)).order("desc").take(500);
 const oneClick=outcomes.filter(o=>o.kind==="lost"&&o.reason==="opt_out");
 return {suppressed:sup.map(r=>({id:r._id,kind:r.kind,value:r.value,reason:r.reason??"",createdAt:r.createdAt})),oneClickOptOuts:oneClick.length,lastOptOutAt:oneClick[0]?.at??null,footer:process.env.OUTREACH_POSTAL_ADDRESS?"custom":"13 5th Ave, Oakdale, MN 55128"};
}});
