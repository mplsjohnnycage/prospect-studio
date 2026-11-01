import { createHash } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import { renderTemplate, type ConceptInput } from "./concept-template";
import type { ConceptBuildResult } from "./agentos";

/** One approved static concept per fresh, isolated Vercel Sandbox. No secrets or network access in VM. */
export async function buildConceptInVercelSandbox(input:ConceptInput):Promise<ConceptBuildResult> {
  const html=renderTemplate(input);
  if(Buffer.byteLength(html,"utf8")>100_000)throw Error("Concept exceeds isolated build limit");
  const localHash=createHash("sha256").update(html).digest("hex");
  const sandbox=await Sandbox.create({
    persistent:false,
    timeout:120_000,
    resources:{vcpus:1},
    networkPolicy:"deny-all",
  });
  try {
    const path="/vercel/sandbox/index.html";
    await sandbox.writeFiles([{path,content:Buffer.from(html,"utf8")}]);
    const result=await sandbox.runCommand({
      cmd:"node",
      args:["-e","const f=require('node:fs');const c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(f.readFileSync('/vercel/sandbox/index.html')).digest('hex'));"],
    });
    if(result.exitCode!==0 || (await result.stdout()).trim()!==localHash) {
      throw new Error("Sandbox artifact checksum verification failed");
    }
    return {prospectId:input.prospectId,direction:input.direction,html,sha256:localHash,runtime:"vercel-sandbox",vmType:"ephemeral",verified:true};
  } finally { await sandbox.stop(); }
}
