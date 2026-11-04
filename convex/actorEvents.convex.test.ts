// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import {convexTest} from "convex-test";
import {afterEach,beforeEach,expect,test,vi} from "vitest";
import schema from "./schema";
import {internal} from "./_generated/api";
import {constantTimeEqual} from "./actorEvents";

const modules=import.meta.glob(["./**/*.ts","./_generated/*.js","!./**/*.test.ts","!./**/*.d.ts"]);
const ev=(sequence:number,actorId="run-1")=>({actorId,runId:actorId,sequence,eventType:"line",payload:"l"+sequence,ownerId:"u1",createdAt:sequence});
beforeEach(()=>vi.stubEnv("ACTOR_APPEND_OWNER_ID","u1"));
afterEach(()=>vi.unstubAllEnvs());

test("appendEvents dedupes by (actorId, sequence) within and across batches; prospectId optional",async()=>{
 const t=convexTest(schema,modules);
 expect(await t.mutation(internal.actorEvents.appendEvents,{events:[ev(1),ev(2),ev(1)]})).toEqual({inserted:2,skipped:1});
 expect(await t.mutation(internal.actorEvents.appendEvents,{events:[ev(2),ev(3),ev(1,"run-2")]})).toEqual({inserted:2,skipped:1});
 const rows=await t.run(ctx=>ctx.db.query("actorEvents").collect());
 expect(rows).toHaveLength(4);
 expect(rows.every(r=>r.prospectId===undefined)).toBe(true);
});

test("readEvents returns ordered range from sequence n with limit",async()=>{
 const t=convexTest(schema,modules);
 await t.mutation(internal.actorEvents.appendEvents,{events:[ev(5),ev(2),ev(4),ev(3),ev(1),ev(9,"other")]});
 const r=await t.query(internal.actorEvents.readEvents,{actorId:"run-1",fromSequence:2,limit:3});
 expect(r.map(x=>x.sequence)).toEqual([2,3,4]);
});

test("http append gate rejects missing/wrong secret, accepts right one",async()=>{
 const t=convexTest(schema,modules);
 const secret="s".repeat(40);
 vi.stubEnv("ACTOR_APPEND_SECRET",secret);
 const body=JSON.stringify({events:[ev(1)]});
 expect((await t.fetch("/actor-events/append",{method:"POST",body})).status).toBe(401);
 expect((await t.fetch("/actor-events/append",{method:"POST",body,headers:{authorization:"Bearer "+"x".repeat(40)}})).status).toBe(401);
 const ok=await t.fetch("/actor-events/append",{method:"POST",body,headers:{authorization:"Bearer "+secret}});
 expect(ok.status).toBe(200);
 expect(await ok.json()).toEqual({inserted:1,skipped:0});
 expect(constantTimeEqual("abc","abcd")).toBe(false);
 expect(constantTimeEqual("abc","abc")).toBe(true);
});

test("http append returns 503 when secret not configured",async()=>{
 const t=convexTest(schema,modules);
 vi.stubEnv("ACTOR_APPEND_SECRET","");
 expect((await t.fetch("/actor-events/append",{method:"POST",body:"{}",headers:{authorization:"Bearer x"}})).status).toBe(503);
});
