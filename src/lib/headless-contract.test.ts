import {test} from "node:test";
import assert from "node:assert/strict";
import {
 canClaim,expiredTerminal,LEASE_MS,MAX_ATTEMPTS,MAX_LEASE_RENEWALS,
 publicJob,requireClaim,requireJobInput,requireSubmission,
} from "./headless-contract";

const good={kind:"research_business",instruction:"Research this legitimate business and cite current sources.",input:'{"business":"Test Painting","domain":"example.com"}',key:"research:example:1"};
const validUuid="12345678-1234-4234-a123-1234567890ab";

test("bounded accepted task inputs are deterministic",()=>{
 const r=requireJobInput(good.kind,good.instruction,good.input,good.key);
 assert.equal(r.kind,"research_business");
 assert.equal(r.idempotencyKey,good.key);
 assert.deepEqual(JSON.parse(r.inputJson),{business:"Test Painting",domain:"example.com"});
});
test("reject unknown kinds, malformed input, bad dedupe keys and overly large payloads",()=>{
 assert.throws(()=>requireJobInput("send_email",good.instruction,good.input,good.key),/Unsupported/);
 assert.throws(()=>requireJobInput(good.kind,"short",good.input,good.key),/Instruction/);
 assert.throws(()=>requireJobInput(good.kind,good.instruction,"[1,2]",good.key),/JSON object/);
 assert.throws(()=>requireJobInput(good.kind,good.instruction,"{bad",good.key),/valid JSON/);
 assert.throws(()=>requireJobInput(good.kind,good.instruction,good.input,"bad"),/idempotency/);
 assert.throws(()=>requireJobInput(good.kind,good.instruction,JSON.stringify({a:"🦅".repeat(5000)}),good.key),/16000/);
});
test("leases cannot be claimed while active, exhausted, or submitted",()=>{
 const now=1_000_000;
 assert.equal(canClaim("queued",undefined,0,now),true);
 assert.equal(canClaim("leased",now+LEASE_MS,1,now),false);
 assert.equal(canClaim("leased",now,1,now),true);
 assert.equal(canClaim("submitted",undefined,1,now),false);
 assert.equal(canClaim("verified",undefined,1,now),false);
 assert.equal(canClaim("queued",undefined,MAX_ATTEMPTS,now),false);
 assert.equal(expiredTerminal("leased",now,MAX_ATTEMPTS,now),true);
 assert.equal(expiredTerminal("leased",now+1,MAX_ATTEMPTS,now),false);
 assert.equal(MAX_LEASE_RENEWALS,12);
});
test("fencing lease requires a typed worker identity and UUID",()=>{
 assert.doesNotThrow(()=>requireClaim("external-agent:1",validUuid));
 assert.throws(()=>requireClaim("a",validUuid),/worker/);
 assert.throws(()=>requireClaim("external-agent:1","guessed"),/UUID/);
});
test("submission requires concrete evidence and cannot verify itself",()=>{
 assert.deepEqual(requireSubmission("Complete with source validation",["https://example.com/proof"]),{
  summary:"Complete with source validation",evidence:["https://example.com/proof"]
 });
 assert.throws(()=>requireSubmission("done",["https://example.com"]),/summary/);
 assert.throws(()=>requireSubmission("Complete with source validation",[]),/evidence/);
 assert.throws(()=>requireSubmission("Complete with source validation",["short"]),/evidence/);
});
test("public job status omits lease secrets and owner identifiers",()=>{
 const x=publicJob({
  _id:"job1",ownerId:"private-owner",leaseId:validUuid,
  kind:"build_demo",instruction:good.instruction,inputJson:good.input,
  status:"submitted",attempts:1,createdAt:10,updatedAt:15,summary:"submitted",
  evidence:["https://example.com/proof"],
 });
 assert.equal(x.status,"submitted");
 assert.equal(x.verifiedAt,null);
 assert.equal("leaseId" in x,false);
 assert.equal("ownerId" in x,false);
});
