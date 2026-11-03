// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import {convexTest} from "convex-test";
import {expect,test} from "vitest";
import schema from "./schema";
import {internal} from "./_generated/api";

const modules=import.meta.glob(["./**/*.ts","./_generated/*.js","!./**/*.test.ts","!./**/*.d.ts"]);
const gates={fit:90,gap:50,spend:0,care:0,timing:100};
const rec=(i:number)=>({recordId:"mpls:"+i,identityKey:"name:acme-"+i+":minneapolis",source:"mpls_open_data",sourceUrl:"https://services.arcgis.com/x",fetchedAt:1,name:"Acme "+i+" Roofing",city:"Minneapolis",trade:"roofing",gates,tier:"strong",total:60,reasons:["Timing: permit"],triggerType:"permit",triggerDate:"2026-11-01",triggerSource:"https://services.arcgis.com/x"});

test("promote dedupes on identityKey and stores trigger + provenance",async()=>{
 const t=convexTest(schema,modules);
 const a=await t.mutation(internal.pipeline.promoteInternal,{ownerId:"u1",records:[rec(1),rec(2),rec(1)]});
 expect(a).toEqual({added:2,duplicates:1,blocked:0});
 const b=await t.mutation(internal.pipeline.promoteInternal,{ownerId:"u1",records:[rec(2)]});
 expect(b.duplicates).toBe(1);
 const rows=await t.run(ctx=>ctx.db.query("prospects").collect());
 expect(rows[0].triggerType).toBe("permit");
 expect(rows[0].promotedFrom?.sourceUrl).toContain("arcgis");
 const costs=await t.run(ctx=>ctx.db.query("stageCosts").collect());
 expect(costs.every(c=>c.usd===0)).toBe(true);
});

test("outcome labels and one-click opt-out write suppression + lost label",async()=>{
 const t=convexTest(schema,modules);
 await t.mutation(internal.pipeline.promoteInternal,{ownerId:"u1",records:[rec(3)]});
 const p=(await t.run(ctx=>ctx.db.query("prospects").first()))!;
 await t.mutation(internal.outcomes.recordInternal,{ownerId:"u1",prospectId:p._id,kind:"viewed"});
 await t.run(ctx=>ctx.db.insert("optOutTokens",{ownerId:"u1",prospectId:p._id,token:"a".repeat(40),value:"owner@acme3.com",createdAt:1}));
 expect(await t.mutation(internal.outcomes.optOut,{token:"a".repeat(40)})).toBe(true);
 expect(await t.mutation(internal.outcomes.optOut,{token:"a".repeat(40)})).toBe(true);
 expect(await t.mutation(internal.outcomes.optOut,{token:"b".repeat(40)})).toBe(false);
 const sup=await t.run(ctx=>ctx.db.query("suppressions").collect());
 expect(sup.map(s=>s.value)).toEqual(["owner@acme3.com"]);
 const out=await t.run(ctx=>ctx.db.query("outcomes").collect());
 expect(out.map(o=>o.kind).sort()).toEqual(["lost","viewed"]);
});

test("pay-to-production enforces order and feeds paid/live outcomes",async()=>{
 const t=convexTest(schema,modules);
 await t.mutation(internal.pipeline.promoteInternal,{ownerId:"u1",records:[rec(9)]});
 const p=(await t.run(ctx=>ctx.db.query("prospects").first()))!;
 await expect(t.mutation(internal.production.advanceInternal,{ownerId:"u1",prospectId:p._id,step:"site_live"})).rejects.toThrow();
 for(const s of ["paid","repo_created","domain_connected","backend_live","site_live"] as const)await t.mutation(internal.production.advanceInternal,{ownerId:"u1",prospectId:p._id,step:s,...(s==="paid"?{amount:2500}:{})});
 const out=await t.run(ctx=>ctx.db.query("outcomes").collect());
 expect(out.map(o=>o.kind).sort()).toEqual(["live","paid"]);
});
