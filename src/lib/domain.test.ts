import {test} from "node:test";
import assert from "node:assert/strict";
import {canTransition,advance,stages,directions} from "./domain";
const p = (stage:typeof stages[number],status:"queued"|"paused"|"blocked"="queued")=>({stage,status});
test("Discover can qualify but cannot skip verification",()=>{assert.equal(canTransition(p("Discover"),"qualify"),true);assert.equal(canTransition(p("Discover"),"design"),false);});
test("paused and blocked prospects reject effects",()=>{assert.equal(canTransition(p("Extract","paused"),"design"),false);assert.equal(canTransition(p("Design","blocked"),"approve_concept"),false);assert.equal(canTransition(p("Design","paused"),"resume"),true);});
test("approval does not imply publication",()=>{assert.equal(advance("Design","approve_concept"),"Design");assert.equal(advance("Design","request_publish"),"Design");});
test("only demo stage permits outreach drafting",()=>{assert.equal(canTransition(p("Demo"),"draft_outreach"),true);assert.equal(canTransition(p("Design"),"draft_outreach"),false);});
test("exactly four distinct directions",()=>{assert.equal(directions.length,4);assert.equal(new Set(directions.map(d=>d.direction)).size,4);});
