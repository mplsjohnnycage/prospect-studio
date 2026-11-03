// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import {convexTest} from "convex-test";
import {expect,test} from "vitest";
import schema from "./schema";
import {internal} from "./_generated/api";
import {DEFAULT_CONFIG} from "../src/lib/agent-core";

const modules=import.meta.glob(["./**/*.ts","./_generated/*.js","!./**/*.test.ts","!./**/*.d.ts"]);
const rec={recordId:"r1",identityKey:"name:acme:edina",source:"mpls_open_data",sourceUrl:"https://services.arcgis.com/x",fetchedAt:1,name:"Acme Heating",city:"Edina",trade:"hvac",phone:"6125550100",gates:{fit:90,gap:100,spend:0,care:0,timing:100},tier:"strong",total:70,reasons:["Gap: No website listed"],triggerType:"permit",triggerDate:"2026-10-30",triggerSource:"https://services.arcgis.com/x"};
async function setup(paused:boolean){
 const t=convexTest(schema,modules);
 await t.mutation(internal.pipeline.promoteInternal,{ownerId:"u1",records:[rec]});
 await t.run(ctx=>ctx.db.insert("agentConfig",{ownerId:"u1",config:{...DEFAULT_CONFIG,paused},updatedAt:1}));
 const p=(await t.run(ctx=>ctx.db.query("prospects").first()))!;
 return {t,p};
}
test("kill switch on: nothing is claimed, plan enqueues nothing",async()=>{
 const {t,p}=await setup(true);
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"qualify",prospectId:p._id});
 expect(await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"})).toBeNull();
 expect(await t.mutation(internal.agent.plan,{ownerId:"u1"})).toBe(0);
});
test("allowlist empty: outside agents cannot claim; builtin can; dedupe by key",async()=>{
 const {t,p}=await setup(false);
 const a=await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"qualify",prospectId:p._id});
 const b=await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"qualify",prospectId:p._id});
 expect(a).toEqual(b);
 await expect(t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"chatgpt"})).rejects.toThrow(/allowlist/);
 const task=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"});
 expect(task.kind).toBe("qualify");
});
test("L1: build tasks are not claimed; reach drafts with call card and never sends",async()=>{
 const {t,p}=await setup(false);
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"build",prospectId:p._id});
 expect(await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin",kinds:["build"]})).toBeNull();
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"reach",prospectId:p._id});
 const task=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin",kinds:["reach"]});
 const r=await t.mutation(internal.agent.runStep,{taskId:task._id});
 expect(r.drafted).toBe(true);
 await t.mutation(internal.agent.complete,{taskId:task._id,worker:"builtin",ok:true,result:r,startedAt:Date.now()});
 const out=await t.run(ctx=>ctx.db.query("outreach").collect());
 expect(out[0].status).toBe("draft");
 expect(out[0].body).toMatch(/13 5th Ave, Oakdale, MN 55128/);
 const acts=await t.run(ctx=>ctx.db.query("activities").collect());
 expect(acts.some(x=>x.kind==="call_card")).toBe(true);
 const runs=await t.run(ctx=>ctx.db.query("agentRuns").collect());
 expect(runs[0].status).toBe("ok");
});
test("spend pauses the loop; failures retry with backoff",async()=>{
 const {t,p}=await setup(false);
 await t.mutation(internal.agent.enqueueInternal,{ownerId:"u1",kind:"qualify",prospectId:p._id});
 const task=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"});
 await t.mutation(internal.agent.complete,{taskId:task._id,worker:"builtin",ok:false,error:"boom",startedAt:Date.now(),usd:0.5});
 const cfg=await t.run(ctx=>ctx.db.query("agentConfig").first());
 expect((cfg!.config as {paused:boolean}).paused).toBe(true);
 const tt=await t.run(ctx=>ctx.db.get(task._id));
 expect(tt!.status).toBe("queued");expect(tt!.notBefore).toBeGreaterThan(Date.now());
});
test("digest and weekly learn write drafts only",async()=>{
 const {t}=await setup(false);
 await t.mutation(internal.agent.dailyDigest,{});
 await t.mutation(internal.agent.weeklyLearn,{});
 for(let i=0;i<2;i++){const task=await t.mutation(internal.agent.claimNext,{ownerId:"u1",worker:"builtin"});await t.mutation(internal.agent.runStep,{taskId:task._id});await t.mutation(internal.agent.complete,{taskId:task._id,worker:"builtin",ok:true,startedAt:Date.now()});}
 const d=await t.run(ctx=>ctx.db.query("agentDigests").collect());
 expect(d.map(x=>x.kind).sort()).toEqual(["daily","weekly"]);
});
