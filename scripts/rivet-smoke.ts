import {createClient} from "rivetkit/client";
import type {registry} from "../src/lib/rivet";
const client=createClient<typeof registry>("http://127.0.0.1:6420");
const actor=client.prospectActor.getOrCreate(["qa-agentos-prospect"]);
async function main(){console.log(JSON.stringify(await actor.snapshot()))};main().catch(e=>{console.error(e);process.exitCode=1});
