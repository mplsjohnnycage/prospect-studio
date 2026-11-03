// Full-agentic loop: task queue with leases, kill switch, autonomy levels, caps, run log, trace, digest.
// Stateless: every task loads state from Convex, does one step, writes result + run row, exits.
// The agent can never send email, set prices or spend. Those paths do not exist here.
import {action,internalAction,internalMutation,internalQuery,mutation,query} from "./_generated/server";
import type {MutationCtx,QueryCtx} from "./_generated/server";
import {internal} from "./_generated/api";
import {v} from "convex/values";
import type {Doc,Id} from "./_generated/dataModel";
import {owner} from "./identity";
import {fallbackAllowed,DEFAULT_CONFIG,mayRun,mayClaim,setLevel,taskKey,onFailure,leaseFor,alertsFor,digest,callScript,weeklyReport,KIND_STAGE,type AgentConfig,type TaskKind,type Level,type AgentStage} from "../src/lib/agent-core";
import {buildIR,irIssues,renderIR} from "../src/lib/revenue-build";
import {demoQa,siteHealth,recheck,calibrateWeights,type TriggerType} from "../src/lib/revenue-engine";
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
export async function enqueue(ctx:MutationCtx,ownerId:string,kind:TaskKind,prospectId?:Id<"prospects">,input:unknown={}){
 const key=taskKey(kind,prospectId??"-",input);
 const dup=await ctx.db.query("agentTasks").withIndex("by_key",q=>q.eq("key",key)).first();
 if(dup&&dup.status!=="done"&&dup.status!=="failed")return dup._id;
 const now=Date.now();
 return await ctx.db.insert("agentTasks",{ownerId,key,kind,...(prospectId?{prospectId}:{}),input,status:"queued",attempts:0,createdAt:now,updatedAt:now});
}
export const enqueueInternal=internalMutation({args:{ownerId:v.string(),kind:taskKind,prospectId:v.optional(v.id("prospects")),input:v.optional(v.any())},returns:v.id("agentTasks"),handler:async(ctx,a)=>enqueue(ctx,a.ownerId,a.kind,a.prospectId,a.input)});
type ClaimArgs={ownerId:string;worker:string;kinds?:TaskKind[]};
export const claimNext=internalMutation({args:{ownerId:v.string(),worker:v.string(),kinds:v.optional(v.array(taskKind))},returns:v.any(),handler:async(ctx,a)=>claimFor(ctx,a)});
async function claimFor(ctx:MutationCtx,a:ClaimArgs){ {
  const cfg=await loadConfig(ctx,a.ownerId);
  if(!mayClaim(cfg,a.worker))throw Error("Worker not on the allowlist");
  const now=Date.now();
  // Heartbeat: every claim attempt marks the worker alive. Desktop is Tier 1; Sprite claims only when the desktop is stale.
  const hb=await ctx.db.query("agentWorkers").withIndex("by_owner_worker",q=>q.eq("ownerId",a.ownerId).eq("worker",a.worker)).first();
  if(hb)await ctx.db.patch(hb._id,{lastSeen:now});else await ctx.db.insert("agentWorkers",{ownerId:a.ownerId,worker:a.worker,lastSeen:now});
  const desk=(await ctx.db.query("agentWorkers").withIndex("by_owner_worker",q=>q.eq("ownerId",a.ownerId)).take(20)).filter(w=>w.worker.startsWith("desktop:")).reduce((m,w)=>Math.max(m,w.lastSeen),0);
  if(!fallbackAllowed(a.worker,desk||undefined,now))return null;
  if(cfg.paused)return null;
  const used=await usedToday(ctx,a.ownerId);
  const cands=[...await ctx.db.query("agentTasks").withIndex("by_owner_status",q=>q.eq("ownerId",a.ownerId).eq("status","queued")).take(100),...await ctx.db.query("agentTasks").withIndex("by_owner_status",q=>q.eq("ownerId",a.ownerId).eq("status","claimed")).take(50)]
   .filter(t=>(t.status==="queued"&&(t.notBefore??0)<=now)||(t.status==="claimed"&&(t.leaseUntil??0)<now)).filter(t=>!a.kinds||a.kinds.includes(t.kind));
  for(const t of cands){
   const d=mayRun(cfg,t.kind,used);
   if(!d.allow)continue;
   await ctx.db.patch(t._id,{status:"claimed",claimedBy:a.worker,leaseUntil:now+leaseFor(a.worker),attempts:t.attempts+1,updatedAt:now});
   return {...t,attempts:t.attempts+1};
  }
  return null;
 }}
type CompleteArgs={taskId:Id<"agentTasks">;worker:string;ok:boolean;result?:unknown;error?:string;usd?:number;tier?:string;startedAt:number;skipped?:boolean};
export const complete=internalMutation({args:{taskId:v.id("agentTasks"),worker:v.string(),ok:v.boolean(),result:v.optional(v.any()),error:v.optional(v.string()),usd:v.optional(v.number()),tier:v.optional(v.string()),startedAt:v.number(),skipped:v.optional(v.boolean())},returns:v.null(),handler:async(ctx,a)=>completeFor(ctx,a)});
async function completeFor(ctx:MutationCtx,a:CompleteArgs){ {
  const t=await ctx.db.get(a.taskId);if(!t)return null;
  if(t.claimedBy!==a.worker)throw Error("Lease lost");
  const now=Date.now();
  if(a.ok)await ctx.db.patch(t._id,{status:"done",result:a.result??null,leaseUntil:undefined,updatedAt:now});
  else{const n=onFailure({key:t.key,kind:t.kind,status:t.status,attempts:t.attempts},now);await ctx.db.patch(t._id,{status:n.status,notBefore:n.notBefore,leaseUntil:undefined,error:(a.error??"").slice(0,300),updatedAt:now});}
  const usd=a.usd??0;
  await ctx.db.insert("agentRuns",{ownerId:t.ownerId,taskId:t._id,kind:t.kind,tier:a.tier??"convex",worker:a.worker,startedAt:a.startedAt,endedAt:now,status:a.skipped?"skipped":a.ok?"ok":"error",usd,...(a.error?{error:a.error.slice(0,300)}:{}),...(t.prospectId?{prospectId:t.prospectId}:{})});
  await logStageCost(ctx,{ownerId:t.ownerId,stage:KIND_STAGE[t.kind],usd,computeSeconds:Math.round((now-a.startedAt)/1000),tool:"agent:"+t.kind,...(t.prospectId?{prospectId:t.prospectId}:{})});
  if(usd>0){const cfg=await loadConfig(ctx,t.ownerId);await saveConfig(ctx,t.ownerId,{...cfg,paused:true});await ctx.db.insert("activities",{ownerId:t.ownerId,kind:"alert",summary:"Agent loop paused: a task recorded spend ($"+usd+")",timestamp:now});}
  const recent=await ctx.db.query("agentRuns").withIndex("by_owner_time",q=>q.eq("ownerId",t.ownerId)).order("desc").take(3);
  for(const al of alertsFor(recent.reverse().map(r=>({status:r.status,usd:r.usd,kind:r.kind,error:r.error}))))await ctx.db.insert("activities",{ownerId:t.ownerId,kind:"alert",summary:al,timestamp:now});
  return null;
 }}

// ---------- Handlers (one step each, all free, none send) ----------
export const runStep=internalMutation({args:{taskId:v.id("agentTasks"),site:v.optional(v.any())},returns:v.any(),
 handler:async(ctx,a)=>{
  const t=(await ctx.db.get(a.taskId))!;const p=t.prospectId?await ctx.db.get(t.prospectId):null;
  switch(t.kind){
   case "qualify":case "recheck":{
    if(!p)return {skipped:true};
    if(a.site){const prev={site:{state:"weak" as const,score:50,issues:[]},trigger:{type:(p.triggerType??"none") as TriggerType,date:p.triggerDate}};
     const decision=recheck(prev,{site:a.site,trigger:prev.trigger});
     if(decision==="drop")await ctx.db.patch(p._id,{status:"paused",notes:p.notes+"\nAgent: site looks fixed; dropped",updatedAt:Date.now()});
     if(decision==="upgrade")await ctx.db.patch(p._id,{tier:"top",updatedAt:Date.now()});
     return {decision};}
    return {tier:p.tier??"standard"};
   }
   case "build":{
    if(!p)return {skipped:true};
    const srcs=await ctx.db.query("sources").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).take(7);
    const facts=srcs.filter(s=>s.url).map(s=>({text:s.summary.split("\n")[0].slice(0,160),sourceUrl:s.url}));
    const ir=buildIR({name:p.name,city:p.city,trade:p.trade,facts});
    const issues=irIssues(ir,facts,true);
    const html=renderIR(ir,facts,"#book");const qa=demoQa(html,facts);
    if(issues.length||!qa.pass)return {fallback:"model",issues:[...issues,...qa.failures]}; // model generator builds it on request
    const now=Date.now();
    await ctx.db.insert("concepts",{ownerId:p.ownerId,prospectId:p._id,variant:"A",direction:"Conversion",description:"Deterministic DemoIR render",status:"approved",html,builtAt:now,generator:"demo-ir",qualityScore:100,updatedAt:now});
    await ctx.db.patch(p._id,{stage:"Demo",status:"needs_approval",updatedAt:now});
    return {built:true};
   }
   case "reach":{
    if(!p)return {skipped:true};
    if(await ctx.db.query("outreach").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).first())return {skipped:true,reason:"draft exists"};
    if(isSuppressed({contact:p.contact,website:p.website},await loadSuppressions(ctx,p.ownerId)))return {skipped:true,reason:"suppressed"};
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
    if(t.kind==="reach"&&site&&t.prospectId){const r=await ctx.runMutation(internal.agent.runStep,{taskId:t._id,site}) as {decision?:string};if(r.decision==="drop"){await ctx.runMutation(internal.agent.complete,{taskId:t._id,worker:"builtin",ok:true,result:r,startedAt,skipped:true});continue;}}
    const result=await ctx.runMutation(internal.agent.runStep,{taskId:t._id,...(t.kind==="recheck"&&site?{site}:{})});
    await ctx.runMutation(internal.agent.complete,{taskId:t._id,worker:"builtin",ok:true,result,startedAt,skipped:!!(result as {skipped?:boolean})?.skipped});
   }catch(e){await ctx.runMutation(internal.agent.complete,{taskId:t._id,worker:"builtin",ok:false,error:e instanceof Error?e.message:String(e),startedAt});}
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
export const dailyDigest=internalMutation({args:{},returns:v.null(),handler:async ctx=>{for(const r of await ctx.db.query("agentConfig").take(50)){await enqueue(ctx,r.ownerId,"digest",undefined,{day:new Date().toISOString().slice(0,10)});}return null;}});
export const weeklyLearn=internalMutation({args:{},returns:v.null(),handler:async ctx=>{for(const r of await ctx.db.query("agentConfig").take(50)){await enqueue(ctx,r.ownerId,"learn",undefined,{week:Math.floor(Date.now()/(7*DAY))});}return null;}});

// ---------- Johnny asks for one step at L1 (e.g. build this demo, draft this one) ----------
export const request=mutation({args:{kind:taskKind,prospectId:v.optional(v.id("prospects"))},returns:v.id("agentTasks"),handler:async(ctx,a)=>{const user=await owner(ctx);if(a.prospectId){const p=await ctx.db.get(a.prospectId);if(!p||p.ownerId!==user)throw Error("Prospect not found");}return enqueue(ctx,user,a.kind,a.prospectId,{requested:Date.now()});}});
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
function checkSecret(secret:string){const s=process.env.AUTOPILOT_SERVICE_SECRET;if(!s||secret!==s)throw Error("Unauthorized worker");}
export const workerClaim=mutation({args:{secret:v.string(),ownerId:v.string(),worker:v.string(),kinds:v.optional(v.array(taskKind))},returns:v.any(),handler:async(ctx,a)=>{checkSecret(a.secret);return await claimFor(ctx,{ownerId:a.ownerId,worker:a.worker,...(a.kinds?{kinds:a.kinds}:{})});}});
export const workerComplete=mutation({args:{secret:v.string(),taskId:v.id("agentTasks"),worker:v.string(),ok:v.boolean(),result:v.optional(v.any()),error:v.optional(v.string()),usd:v.optional(v.number()),tier:v.optional(v.string()),startedAt:v.number()},returns:v.null(),handler:async(ctx,a)=>{checkSecret(a.secret);const {secret:_s,...rest}=a;void _s;return await completeFor(ctx,rest);}});

export const statusFor=internalQuery({args:{ownerId:v.string()},returns:v.any(),handler:async(ctx,a)=>{const cfg=await loadConfig(ctx,a.ownerId);const q=await ctx.db.query("agentTasks").withIndex("by_owner_status",x=>x.eq("ownerId",a.ownerId).eq("status","queued")).take(500);return {paused:cfg.paused,levels:cfg.levels,caps:cfg.caps,used:await usedToday(ctx,a.ownerId),queued:q.length};}});
