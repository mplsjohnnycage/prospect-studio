// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// Regression tests for Phase 1 "server-side owner gate".
import {convexTest} from "convex-test";
import {afterEach,beforeEach,expect,test,vi} from "vitest";
import schema from "./schema";
import {api,internal} from "./_generated/api";
import {isOwnerIdentity} from "./identity";
import type {Id} from "./_generated/dataModel";

const modules=import.meta.glob(["./**/*.ts","./_generated/*.js","!./**/*.test.ts","!./**/*.d.ts"]);
const OWNER={subject:"owner-sub",email:"Owner@Example.com",issuer:"https://test"};
const INTRUDER={subject:"intruder-sub",email:"bot@agentmail.to",issuer:"https://test"};
const SERVICE="k".repeat(40);
const gates={fit:90,gap:50,spend:0,care:0,timing:100};
let n=0;
const rec=(i:number)=>({recordId:"mpls:"+i,identityKey:"name:acme-"+i+":minneapolis",source:"mpls_open_data",sourceUrl:"https://services.arcgis.com/x",fetchedAt:1,name:"Acme "+i+" Roofing",city:"Minneapolis",trade:"roofing",gates,tier:"strong",total:60,reasons:["Timing: permit"],triggerType:"permit",triggerDate:"2026-11-01",triggerSource:"https://services.arcgis.com/x"});
const errOf=async(p:Promise<unknown>)=>{try{await p;return ""}catch(e){return e instanceof Error?e.message:String(e)}};

beforeEach(()=>{vi.stubEnv("OWNER_EMAIL","owner@example.com");vi.stubEnv("OWNER_SOCIAL_EXTRA_EMAILS","");vi.stubEnv("OWNER_SUBJECTS","");vi.stubEnv("CONVEX_PILOT_MODE","");vi.stubEnv("AUTOPILOT_SERVICE_SECRET",SERVICE);vi.stubEnv("AUTOPILOT_OWNER_ID","");});
afterEach(()=>vi.unstubAllEnvs());

async function seed(t:ReturnType<typeof convexTest>,ownerId:string){
 const key="name:acme-"+(++n)+":minneapolis";
 await t.mutation(internal.pipeline.promoteInternal,{ownerId,records:[{...rec(n),identityKey:key}]});
 return (await t.run(ctx=>ctx.db.query("prospects").filter(q=>q.eq(q.field("identityKey"),key)).first()))!._id as Id<"prospects">;
}

test("isOwnerIdentity fails closed and matches configured owner only",()=>{
 expect(isOwnerIdentity(OWNER)).toBe(true);
 expect(isOwnerIdentity(INTRUDER)).toBe(false);
 expect(isOwnerIdentity({subject:"x"})).toBe(false);
 vi.stubEnv("OWNER_SUBJECTS","pinned-sub");
 expect(isOwnerIdentity({subject:"pinned-sub"})).toBe(true);
 vi.stubEnv("OWNER_SUBJECTS","");vi.stubEnv("OWNER_EMAIL","");
 expect(isOwnerIdentity(OWNER)).toBe(false);
});

test("non-owner is rejected on research, prepareEmail, send, sendReply and autopilot; owner passes the gate",async()=>{
 const t=convexTest(schema,modules);
 const pid=await seed(t,OWNER.subject);
 const {outreachId,draftId}=await t.run(async ctx=>{
  const outreachId=await ctx.db.insert("outreach",{ownerId:OWNER.subject,prospectId:pid,subject:"s",body:"b",status:"draft",updatedAt:1});
  const replyId=await ctx.db.insert("replies",{ownerId:OWNER.subject,prospectId:pid,outreachId,messageId:"m",threadId:"t",from:"a@b.c",subject:"s",text:"t",optOut:false,receivedAt:1});
  const draftId=await ctx.db.insert("replyDrafts",{ownerId:OWNER.subject,prospectId:pid,replyId,body:"b",status:"sent",generator:"g",updatedAt:1});
  return {outreachId,draftId};
 });
 const intruder=t.withIdentity(INTRUDER),me=t.withIdentity(OWNER);
 const calls:[string,(c:typeof me)=>Promise<unknown>][]=[
  ["research.scrapeProspect",c=>c.action(api.research.scrapeProspect,{prospectId:pid,url:"https://acme.example"})],
  ["sales.prepareEmail",c=>c.action(api.sales.prepareEmail,{prospectId:pid})],
  ["sales.send",c=>c.mutation(api.sales.send,{outreachId})],
  ["sales.sendReply",c=>c.mutation(api.sales.sendReply,{draftId,body:"hi"})],
  ["autopilot.schedules",c=>c.query(api.autopilot.schedules,{})],
  ["autopilot.prepareDemo",c=>c.mutation(api.autopilot.prepareDemo,{prospectId:pid})],
 ];
 for(const [name,call] of calls){
  expect(await errOf(call(intruder)),name+" intruder").toMatch(/Forbidden/);
  expect(await errOf(call(me)),name+" owner").not.toMatch(/Forbidden|Authentication required/);
 }
 expect(await errOf(t.query(api.autopilot.schedules,{}))).toMatch(/Authentication required/);
});

test("autopilotService: token alone is not enough; prospect must be in owner scope",async()=>{
 const t=convexTest(schema,modules);
 const pid=await seed(t,OWNER.subject);
 expect(await errOf(t.action(api.autopilotService.prepare,{token:"x".repeat(40),prospectId:pid}))).toMatch(/Unauthorized/);
 expect(await errOf(t.action(api.autopilotService.prepare,{token:SERVICE,prospectId:pid}))).toMatch(/owner scope/);
 await t.run(ctx=>ctx.db.insert("campaigns",{ownerId:OWNER.subject,key:"roofing:minneapolis",trade:"roofing",city:"Minneapolis",enabled:true,lastRunAt:0,updatedAt:0}));
 expect(await errOf(t.action(api.autopilotService.prepare,{token:SERVICE,prospectId:pid}))).not.toMatch(/owner scope|Unauthorized/);
 vi.stubEnv("AUTOPILOT_OWNER_ID","someone-else");
 expect(await errOf(t.action(api.autopilotService.prepare,{token:SERVICE,prospectId:pid}))).toMatch(/owner scope/);
 expect(await t.action(api.autopilotService.runDaily,{token:SERVICE})).toMatchObject({idle:true});
 vi.stubEnv("AUTOPILOT_OWNER_ID","");
 const other=await seed(t,"other-owner");
 const cid=await t.run(ctx=>ctx.db.insert("concepts",{ownerId:"other-owner",prospectId:other,variant:"a",direction:"d",description:"d",status:"approved",updatedAt:1}));
 expect(await errOf(t.action(api.autopilotService.saveAndDraft,{token:SERVICE,prospectId:pid,conceptId:cid,html:"<!doctype html>",sha256:"a".repeat(64)}))).toMatch(/owner scope/);
 expect(await errOf(t.action(api.autopilotService.release,{token:SERVICE,prospectId:pid,conceptId:cid,claimId:"c".repeat(32)}))).toMatch(/owner scope/);
 expect(await errOf(t.action(api.autopilotService.prepare,{token:SERVICE,prospectId:other}))).toMatch(/owner scope/);
});

test("actor-events append ignores body ownerId, derives owner server-side, rejects bad input",async()=>{
 const t=convexTest(schema,modules);
 const secret="s".repeat(40);
 vi.stubEnv("ACTOR_APPEND_SECRET",secret);
 const post=(events:unknown[])=>t.fetch("/actor-events/append",{method:"POST",body:JSON.stringify({events}),headers:{authorization:"Bearer "+secret}});
 const ev=(o:Record<string,unknown>={})=>({actorId:"run-9",sequence:1,eventType:"line",payload:"x",ownerId:"attacker",createdAt:1,...o});
 vi.stubEnv("ACTOR_APPEND_OWNER_ID","");
 expect((await post([ev()])).status).toBe(503);
 vi.stubEnv("ACTOR_APPEND_OWNER_ID",OWNER.subject);
 const before=Date.now();
 expect((await post([ev()])).status).toBe(200);
 const row=(await t.run(ctx=>ctx.db.query("actorEvents").first()))!;
 expect(row.ownerId).toBe(OWNER.subject);
 expect(row.createdAt).toBeGreaterThanOrEqual(before);
 const mine=await seed(t,OWNER.subject),theirs=await seed(t,"other-owner");
 expect((await post([ev({sequence:2,prospectId:mine})])).status).toBe(200);
 expect((await post([ev({sequence:3,prospectId:theirs})])).status).toBe(400);
 for(const bad of [{sequence:-1},{sequence:1.5},{sequence:"1"},{payload:"p".repeat(64*1024+1)},{actorId:"a".repeat(129)},{actorId:""},{eventType:"e".repeat(65)}]){
  expect((await post([ev({sequence:10,...bad})])).status,JSON.stringify(bad).slice(0,40)).toBe(400);
 }
 expect((await post(Array.from({length:201},(_,i)=>ev({sequence:100+i})))).status).toBe(400);
 const rows=await t.run(ctx=>ctx.db.query("actorEvents").collect());
 expect(rows.map(r=>r.sequence).sort()).toEqual([1,2]);
 expect(rows.every(r=>r.ownerId===OWNER.subject)).toBe(true);
});
