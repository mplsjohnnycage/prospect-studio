import test from "node:test";import assert from "node:assert/strict";
import {answerOperations} from "./ops-assistant";
const data={prospects:[{id:"a",name:"Lake Painting",trade:"Painting",city:"Minneapolis",score:89,stage:"Demo",status:"needs_approval",qualified:true},{id:"b",name:"West Roofing",trade:"Roofing",city:"Minneapolis",score:74,stage:"Qualify",status:"queued",qualified:true}],messages:[{id:"m1",status:"draft",subject:"A website concept"}],appointments:[{id:"cal",startAt:Date.now()+60000,title:"Intro call",status:"planned"}],campaigns:[{key:"painting::minneapolis",enabled:true,lastRunAt:0}]};
test("workspace summary and top prospects grounded in real context",()=>{
 const summary=answerOperations("status",data);assert.match(summary.text,/2 prospects/);assert.match(summary.text,/1 unsent draft/);
 const top=answerOperations("top leads",data);assert.match(top.text,/Lake Painting/);assert.doesNotMatch(top.text,/100 leads/);assert.equal(top.action,"autopilot");
});
test("outreach and calendar routes to correct workspace",()=>{
 assert.equal(answerOperations("draft emails",data).action,"inbox");
 assert.equal(answerOperations("scheduled calls",data).action,"calendar");
});
test("never implies outreach was sent or external model is active",()=>{
 const reply=answerOperations("send all emails",data);
 assert.match(reply.text,/cannot send|not enabled|approval/i);
 assert.notEqual(reply.action,"send");
 const unknown=answerOperations("invent the best AI pitch ever",data);
 assert.match(unknown.text,/rule-based|not connected/i);
});
