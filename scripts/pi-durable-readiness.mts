import {createClient} from "rivetkit/client";
import type {registry} from "../src/actors/pi-start.mjs";
async function main(){
 const client=createClient<typeof registry>("http://127.0.0.1:6420");
 const actor=client.durableDesignAgent.getOrCreate(["qa-pi-agent-no-model"]);
 const status=await actor.readiness();
 console.log(JSON.stringify(status));
 if(typeof status.configured!=="boolean")throw Error("Invalid credential readiness status");
 if(status.actorPersistence!=="rivet-sqlite")throw Error("Unexpected persistence backend");
}
main().catch(e=>{console.error(e);process.exitCode=1});
