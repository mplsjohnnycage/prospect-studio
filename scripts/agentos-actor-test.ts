import assert from "node:assert/strict";
import {createClient} from "rivetkit/client";
import type {registry} from "../src/lib/rivet";
async function main(){
 const client=createClient<typeof registry>("http://127.0.0.1:6420");
 const actor=client.prospectActor.getOrCreate(["qa-agentos-prospect"]);
 const result=await actor.generateConcept({prospectId:"qa-agentos-prospect",businessName:"QA Studio Services",trade:"Painting",city:"Minneapolis",direction:"Conversion"});
 assert.equal(result.verified,true);
 assert.equal(result.vmType,"ephemeral");
 assert.match(result.html,/<html lang="en">/);
 const snapshot=await actor.snapshot();
 assert.equal(snapshot.lastConcept?.sha256,result.sha256);
 console.log(JSON.stringify({verified:result.verified,direction:result.direction,sha256:result.sha256,actorState:snapshot.lastConcept,htmlBytes:result.html.length}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
