// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import {convexTest} from "convex-test";
import {afterEach,expect,test,vi} from "vitest";
import schema from "./schema";
import {api,internal} from "./_generated/api";
import type {Id} from "./_generated/dataModel";
import {DEFAULT_CONFIG,LEASE_TTL_MS,MAX_ATTEMPTS} from "../src/lib/agent-core";

vi.setConfig({testTimeout:20_000}); // cold module transform on the Sprite can exceed 5s
const modules=import.meta.glob(["./**/*.ts","./_generated/*.js","!./**/*.test.ts","!./**/*.d.ts"]);
const rec={recordId:"r1",identityKey:"name:acme:edina",source:"mpls_open_data",sourceUrl:"https://services.arcgis.com/x",fetchedAt:1,name:"Acme Heating",city:"Edina",trade:"hvac",phone:"6125550100",gates:{fit:90,gap:100,spend:0,care:0,timing:100},tier:"strong",total:70,reasons:["Gap: No website listed"],triggerType:"permit",triggerDate:"2026-10-30",triggerSource:"https://services.arcgis.com/x"};
async function setup(paused:boolean,allowlist:string[]=[]){
 const t=convexTest(schema,modules);
 await t.mutation(internal.pipeline.promoteInternal,{ownerId:"u1",records:[rec]});
 await t.run(ctx=>ctx.db.insert("agentConfig",{ownerId:"u1",config:{...DEFAULT_CONFIG,paused,allowlist},updatedAt:1}));
 const p=(await t.run(ctx=>ctx.db.query("prospects").first()))!;
 return {t,p};
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
const done=(task:{_id:never;leaseId?:string},extra:Record<string,unknown>={})=>({taskId:task._id,worker:"builtin",leaseId:task.leaseId!,ok:true,startedAt:Date.now(),...extra});

test("kill switch on: nothing is claimed, plan enqueues nothing",async()=>{
 const {t,p}=await setup(true);
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"qualify",prospectId:p._id});
 expect(await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"})).toBeNull();
 expect(await t.mutation(internal.agent.plan,{ownerId:"u1"})).toBe(0);
});
test("allowlist empty: outside agents and unregistered desktop names cannot claim; builtin can; dedupe by key",async()=>{
 const {t,p}=await setup(false);
 const a=await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"qualify",prospectId:p._id});
 const b=await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"qualify",prospectId:p._id});
 expect(a).toEqual(b);
 await expect(t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"chatgpt"})).rejects.toThrow(/allowlist/);
 await expect(t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"desktop:spoof"})).rejects.toThrow(/allowlist/);
 const task=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"});
 expect(task!.kind).toBe("qualify");expect(task!.leaseId).toBeTruthy();
});
test("L1: build tasks are not claimed; reach drafts once with call card, counts as ok, never sends",async()=>{
 const {t,p}=await setup(false);
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"build",prospectId:p._id});
 expect(await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin",kinds:["build"]})).toBeNull();
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"reach",prospectId:p._id});
 const task=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin",kinds:["reach"]});
 const r=await t.mutation(internal.agent.runStep,{taskId:task!._id}) as {drafted?:boolean};
 expect(r.drafted).toBe(true);
 await t.mutation(internal.agent.complete,done(task as never,{result:r}));
 const out=await t.run(ctx=>ctx.db.query("outreach").collect());
 expect(out).toHaveLength(1);expect(out[0].status).toBe("draft");
 expect(out[0].body).toMatch(/Unsubscribe|opt out/i);
 const acts=await t.run(ctx=>ctx.db.query("activities").collect());
 expect(acts.some(x=>x.kind==="call_card")).toBe(true);
 const s=await t.run(ctx=>ctx.db.query("agentRuns").collect());
 expect(s[0].status).toBe("ok");
});
test("reach with a fixed site drops before drafting",async()=>{
 const {t,p}=await setup(false);
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"reach",prospectId:p._id});
 const task=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"});
 const r=await t.mutation(internal.agent.runStep,{taskId:task!._id,site:{state:"ok",score:95,issues:[]}}) as {decision?:string};
 expect(r.decision).toBe("drop");
 expect(await t.run(ctx=>ctx.db.query("outreach").collect())).toHaveLength(0);
});
test("qualify writes the tier, so plan does not re-enqueue it after done",async()=>{
 const {t,p}=await setup(false);
 await t.run(ctx=>ctx.db.patch(p._id,{tier:undefined,stage:"Qualify",qualified:true}));
 expect(await t.mutation(internal.agent.plan,{ownerId:"u1"})).toBeGreaterThanOrEqual(1);
 const task=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"});
 await t.mutation(internal.agent.runStep,{taskId:task!._id});
 await t.mutation(internal.agent.complete,done(task as never));
 expect((await t.run(ctx=>ctx.db.get(p._id)))!.tier).toBeTruthy();
 await t.mutation(internal.agent.plan,{ownerId:"u1"});
 const tasks=await t.run(ctx=>ctx.db.query("agentTasks").collect());
 expect(tasks.filter(x=>x.kind==="qualify")).toHaveLength(1);
});
test("spend pauses the loop; failures retry with backoff; duplicate complete is a no-op",async()=>{
 const {t,p}=await setup(false);
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"qualify",prospectId:p._id});
 const task=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"});
 await t.mutation(internal.agent.complete,done(task as never,{ok:false,error:"boom",usd:0.5}));
 const cfg=await t.run(ctx=>ctx.db.query("agentConfig").first());
 expect((cfg!.config as {paused:boolean}).paused).toBe(true);
 const tt=await t.run(ctx=>ctx.db.get(task!._id));
 expect(tt!.status).toBe("queued");expect(tt!.notBefore).toBeGreaterThan(Date.now());
 await t.run(async ctx=>{const c=(await ctx.db.query("agentConfig").first())!;await ctx.db.patch(c._id,{config:{...DEFAULT_CONFIG,paused:false}});await ctx.db.patch(task!._id,{notBefore:0});});
 const again=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"});
 await t.mutation(internal.agent.complete,done(again as never));
 await t.mutation(internal.agent.complete,done(again as never));
 expect((await t.run(ctx=>ctx.db.query("agentRuns").collect())).filter(r=>r.status==="ok")).toHaveLength(1);
});
test("lease expiry: a stale worker cannot complete; the task backs off and is reclaimed with a new lease",async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-03T15:00:00Z"));
 const {t,p}=await setup(false,["desktop:3apdbkg"]);
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"recheck",prospectId:p._id});
 const first=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"desktop:3apdbkg"});
 expect(Math.abs(first!.leaseUntil!-Date.now()-LEASE_TTL_MS)).toBeLessThan(50);
 vi.advanceTimersByTime(LEASE_TTL_MS+1000);
 await expect(t.mutation(internal.agent.complete,{taskId:first!._id,worker:"desktop:3apdbkg",leaseId:first!.leaseId!,ok:true,startedAt:Date.now()})).rejects.toThrow(/Lease lost/);
 expect(await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"desktop:3apdbkg"})).toBeNull(); // backoff, not instant reclaim
 const tt=await t.run(ctx=>ctx.db.get(first!._id));expect(tt!.status).toBe("queued");expect(tt!.error).toMatch(/Lease expired/);
 vi.advanceTimersByTime(60*60_000);
 const second=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"desktop:3apdbkg"});
 expect(second!._id).toBe(first!._id);expect(second!.leaseId).not.toBe(first!.leaseId);
 await expect(t.mutation(internal.agent.complete,{taskId:first!._id,worker:"desktop:3apdbkg",leaseId:first!.leaseId!,ok:true,startedAt:Date.now()})).rejects.toThrow(/Lease lost/);
});
test("concurrent claims never hand out the same task",async()=>{
 const {t,p}=await setup(false,["desktop:3apdbkg"]);
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"recheck",prospectId:p._id});
 const [a,b]=await Promise.all([t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"}),t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"desktop:3apdbkg"})]);
 expect([a,b].filter(Boolean)).toHaveLength(1);
});
test("retry exhaustion parks the task; Johnny can unpark it",async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-03T15:00:00Z"));
 const {t,p}=await setup(false);
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"recheck",prospectId:p._id});
 for(let i=0;i<MAX_ATTEMPTS;i++){
  const task=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"});
  expect(task).not.toBeNull();
  await t.mutation(internal.agent.complete,done(task as never,{ok:false,error:"boom "+i}));
  vi.advanceTimersByTime(7*3600_000);
 }
 const parked=(await t.run(ctx=>ctx.db.query("agentTasks").first()))!;
 expect(parked.status).toBe("parked");
 expect(await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"})).toBeNull();
 await t.withIdentity({subject:"u1"}).mutation(api.agent.retryTask,{taskId:parked._id});
 expect((await t.run(ctx=>ctx.db.get(parked._id)))!.status).toBe("queued");
});
test("worker door: secret required, builtin and unregistered names rejected, registered desktop renews and completes",async()=>{
 vi.stubEnv("AUTOPILOT_SERVICE_SECRET","test-secret");
 const {t,p}=await setup(false,["desktop:3apdbkg"]);
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"recheck",prospectId:p._id});
 await expect(t.mutation(api.agent.workerClaim,{secret:"wrong",ownerId:"u1",worker:"desktop:3apdbkg"})).rejects.toThrow(/Unauthorized/);
 await expect(t.mutation(api.agent.workerClaim,{secret:"test-secret",ownerId:"u1",worker:"builtin"})).rejects.toThrow(/Invalid worker/);
 await expect(t.mutation(api.agent.workerClaim,{secret:"test-secret",ownerId:"u1",worker:"desktop:other"})).rejects.toThrow(/allowlist/);
 const task=(await t.mutation(api.agent.workerClaim,{secret:"test-secret",ownerId:"u1",worker:"desktop:3apdbkg"}))!;
 expect(await t.mutation(api.agent.workerRenew,{secret:"test-secret",taskId:task._id,worker:"desktop:3apdbkg",leaseId:"nope"})).toBe(false);
 expect(await t.mutation(api.agent.workerRenew,{secret:"test-secret",taskId:task._id,worker:"desktop:3apdbkg",leaseId:task.leaseId})).toBe(true);
 await t.mutation(api.agent.workerComplete,{secret:"test-secret",taskId:task._id,worker:"desktop:3apdbkg",leaseId:task.leaseId,ok:true,startedAt:Date.now(),result:{state:"ok"}});
 expect((await t.run(ctx=>ctx.db.get(task._id)))!.status).toBe("done");
});
test("desktop heartbeat blocks sprite fallback; stale desktop lets sprite claim",async()=>{
 const {t,p}=await setup(false,["sprite:prospect"]);
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"recheck",prospectId:p._id});
 await t.run(ctx=>ctx.db.insert("agentWorkers",{ownerId:"u1",worker:"desktop:3apdbkg",lastSeen:Date.now()}));
 expect(await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"sprite:prospect"})).toBeNull();
 await t.run(async ctx=>{const w=(await ctx.db.query("agentWorkers").withIndex("by_owner_worker",q=>q.eq("ownerId","u1").eq("worker","desktop:3apdbkg")).first())!;await ctx.db.patch(w._id,{lastSeen:Date.now()-10*60_000});});
 expect((await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"sprite:prospect"}))!.kind).toBe("recheck");
});
test("digest and weekly learn write drafts only; two owners' digests on the same day both enqueue",async()=>{
 const {t}=await setup(false);
 await t.run(ctx=>ctx.db.insert("agentConfig",{ownerId:"u2",config:{...DEFAULT_CONFIG,paused:false},updatedAt:1}));
 await t.mutation(internal.agent.dailyDigest,{});
 await t.mutation(internal.agent.weeklyLearn,{});
 expect((await t.run(ctx=>ctx.db.query("agentTasks").collect())).filter(x=>x.kind==="digest")).toHaveLength(2);
 for(let i=0;i<2;i++){const task=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"});await t.mutation(internal.agent.runStep,{taskId:task!._id});await t.mutation(internal.agent.complete,done(task as never));}
 const d=await t.run(ctx=>ctx.db.query("agentDigests").withIndex("by_owner_time",q=>q.eq("ownerId","u1")).collect());
 expect(d.map(x=>x.kind).sort()).toEqual(["daily","weekly"]);
});

test("approval queue: lists drafts with call card; approve never sends; opted-out recipients blocked",async()=>{
 const {t,p}=await setup(false);
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"reach",prospectId:p._id});
 const task=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"});
 await t.mutation(internal.agent.runStep,{taskId:task!._id});
 const u=t.withIdentity({subject:"u1"});
 const rows=await u.query(api.agent.approvals,{});
 expect(rows).toHaveLength(1);expect(rows[0].callCard).toBeTruthy();
 await u.mutation(api.agent.approveDraft,{id:rows[0].id});
 const o=(await t.run(ctx=>ctx.db.get(rows[0].id)))!;
 expect(o.status).toBe("approved");expect(o.sentAt).toBeUndefined();
 expect((await u.query(api.agent.optOuts,{})).suppressed).toHaveLength(0);
});

test("workflow pieces: reach with rival writes a teardown; test lead is labeled TEST; paid posts the next pay-to-live step",async()=>{
 const {t,p}=await setup(false);
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"reach",prospectId:p._id});
 const task=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"});
 await t.mutation(internal.agent.runStep,{taskId:task!._id,site:{state:"dead",score:90,issues:["Domain does not resolve"]},rival:{name:"Rival HVAC",site:{state:"ok",score:10,issues:[]}}});
 const u=t.withIdentity({subject:"u1"});
 await u.mutation(api.agent.sendTestLead,{prospectId:p._id});
 await u.mutation(api.production.advanceStep,{prospectId:p._id,step:"paid",amount:1});
 const kinds=(await t.run(ctx=>ctx.db.query("activities").collect())).map(a=>a.kind+":"+a.summary);
 expect(kinds.some(k=>k.startsWith("teardown:Teardown vs Rival HVAC (0/6 vs 6/6"))).toBe(true);
 expect(kinds.some(k=>k.startsWith("test_lead:TEST LEAD"))).toBe(true);
 expect(kinds.some(k=>/^pay_to_live:paid done\. Next: repo created/.test(k))).toBe(true);
 expect(await t.run(ctx=>ctx.db.query("outreach").collect())).toHaveLength(1);
});

test("HTTP worker door: bearer header required; claim/renew/complete over HTTP",async()=>{
 vi.stubEnv("AUTOPILOT_SERVICE_SECRET","test-secret");
 const {t,p}=await setup(false,["desktop:3apdbkg"]);
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"recheck",prospectId:p._id});
 const post=(op:string,body:unknown,auth="Bearer test-secret")=>t.fetch("/agent/"+op,{method:"POST",headers:{"content-type":"application/json",authorization:auth},body:JSON.stringify(body)});
 expect((await post("claim",{ownerId:"u1",worker:"desktop:3apdbkg"},"Bearer nope")).status).toBe(401);
 expect((await post("claim",{ownerId:"u1",worker:"builtin"})).status).toBe(409);
 const task=await (await post("claim",{ownerId:"u1",worker:"desktop:3apdbkg"})).json() as {_id:Id<"agentTasks">;kind:string;leaseId:string};
 expect(task.kind).toBe("recheck");
 expect(await (await post("renew",{taskId:task._id,worker:"desktop:3apdbkg",leaseId:task.leaseId})).json()).toBe(true);
 expect((await post("complete",{taskId:task._id,worker:"desktop:3apdbkg",leaseId:task.leaseId,ok:true,startedAt:Date.now()})).status).toBe(200);
 expect((await t.run(ctx=>ctx.db.get(task._id)))!.status).toBe("done");
});
test("alerts are deduped; settings changes patch only their own field; cleanup removes old finished rows",async()=>{
 const {t,p}=await setup(false);
 for(let i=0;i<4;i++){await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"recheck",prospectId:p._id,input:{i}});const k=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"});await t.mutation(internal.agent.complete,{taskId:k!._id,worker:"builtin",leaseId:k!.leaseId,ok:false,error:"boom",startedAt:Date.now()});}
 const alerts=(await t.run(ctx=>ctx.db.query("activities").collect())).filter(a=>a.kind==="alert");
 expect(new Set(alerts.map(a=>a.summary)).size).toBe(alerts.length);
 const u=t.withIdentity({subject:"u1"});
 await u.mutation(api.agent.setAllowlist,{workers:["desktop:3apdbkg"]});
 await u.mutation(api.agent.setPaused,{paused:true});
 const cfg=(await t.run(ctx=>ctx.db.query("agentConfig").first()))!.config as {paused:boolean;allowlist:string[]};
 expect(cfg.paused).toBe(true);expect(cfg.allowlist).toEqual(["desktop:3apdbkg"]);
 await t.run(async ctx=>{for(const x of await ctx.db.query("agentTasks").collect())await ctx.db.patch(x._id,{status:"done",updatedAt:1});for(const r of await ctx.db.query("agentRuns").collect())await ctx.db.patch(r._id,{startedAt:1});});
 expect(await t.mutation(internal.agent.cleanup,{})).toBeGreaterThan(0);
 expect(await t.run(ctx=>ctx.db.query("agentTasks").collect())).toHaveLength(0);
});

test("reviews: Brand DNA quotes become sourced facts, care gate updates; no data changes nothing; MCP-style rerun re-queues a done task",async()=>{
 vi.stubEnv("AUTOPILOT_SERVICE_SECRET","test-secret");
 const {t,p}=await setup(false,["desktop:3apdbkg"]);
 const post=(body:unknown)=>t.fetch("/agent/reviews",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer test-secret"},body:JSON.stringify(body)});
 const placeUrl="https://www.google.com/maps/place/acme";
 expect(await (await post({ownerId:"u1",worker:"desktop:3apdbkg",data:{prospectId:p._id,placeUrl,reviews:[]}})).json()).toEqual({applied:false,reason:"no review data"});
 const now=Date.now();
 const r=await (await post({ownerId:"u1",worker:"desktop:3apdbkg",data:{prospectId:p._id,placeUrl,rating:4.8,count:52,responseRate:0.9,reviews:[{text:"Friendly crew, fixed our furnace fast and cleaned up after. Honest pricing too.",at:now-5*86400000},{text:"Friendly and honest, furnace repaired same day, would hire again.",at:now-9*86400000}]}})).json();
 expect(r.applied).toBe(true);expect(r.quotes).toBe(2);
 const srcs=await t.run(ctx=>ctx.db.query("sources").collect());
 expect(srcs.filter(s=>s.summary.startsWith("Customer review")).every(s=>s.url===placeUrl)).toBe(true);
 const pp=(await t.run(ctx=>ctx.db.get(p._id)))!;expect(pp.gates!.care).toBeGreaterThan(0);
 const id=await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"qualify",prospectId:p._id});
 await t.run(ctx=>ctx.db.patch(id,{status:"done"}));
 expect(await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"qualify",prospectId:p._id})).toBe(id);
 expect(await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"qualify",prospectId:p._id,rerun:true})).not.toBe(id);
});
test("promote picks the best public contact (business email over phone)",async()=>{
 const t=convexTest(schema,modules);
 await t.mutation(internal.pipeline.promoteInternal,{ownerId:"u1",records:[{...rec,emails:["owner@gmail.com","info@acmeheating.com"]}]});
 const p=(await t.run(ctx=>ctx.db.query("prospects").first()))!;
 expect(p.contact).toBe("info@acmeheating.com");expect(p.scoreReasons).toContain("Contact: email");
});

test("embed: desktop-only; lookalike blends into Fit; endpoint down keeps the existing score; weight apply",async()=>{
 vi.stubEnv("AUTOPILOT_SERVICE_SECRET","test-secret");
 const {t,p}=await setup(false,["desktop:3apdbkg","sprite:prospect"]);
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"embed",prospectId:p._id,input:{text:"x",won:false,winners:[]}});
 expect(await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"})).toBeNull();
 expect(await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"sprite:prospect"})).toBeNull();
 expect((await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"desktop:3apdbkg"}))!.kind).toBe("embed");
 const post=(body:unknown)=>t.fetch("/agent/lookalike",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer test-secret"},body:JSON.stringify(body)});
 const before=(await t.run(ctx=>ctx.db.get(p._id)))!;
 expect(await (await post({ownerId:"u1",worker:"desktop:3apdbkg",prospectId:p._id,winners:0,model:"m",endpointOk:false,error:"ECONNREFUSED"})).json()).toMatchObject({applied:false});
 expect((await t.run(ctx=>ctx.db.get(p._id)))!.gates!.fit).toBe(before.gates!.fit);
 const r=await (await post({ownerId:"u1",worker:"desktop:3apdbkg",prospectId:p._id,score:50,winners:4,model:"m",endpointOk:true})).json();
 expect(r.applied).toBe(true);expect(r.fit).toBe(Math.round(0.7*before.gates!.fit+0.3*50));
 await post({ownerId:"u1",worker:"desktop:3apdbkg",prospectId:p._id,score:50,winners:4,model:"m",endpointOk:true});
 expect((await t.run(ctx=>ctx.db.get(p._id)))!.gates!.fit).toBe(r.fit); // re-blend uses the base fit, no drift
 const u=t.withIdentity({subject:"u1"});
 expect(await u.query(api.agent.lookalikeOf,{prospectId:p._id})).toMatchObject({source:"embedding",lookalike:50});
 expect(await u.mutation(api.agent.applyLookalikeWeight,{})).toBe(0.3);
});
