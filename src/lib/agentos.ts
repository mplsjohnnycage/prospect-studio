import {createHash} from "node:crypto";
import {AgentOs} from "@rivet-dev/agentos-core";
import {renderTemplate, type ConceptInput} from "./concept-template";
export {renderTemplate, escapeHtml, validateConcept} from "./concept-template";
export type {ConceptInput} from "./concept-template";
export type ConceptBuildResult={prospectId:string;direction:ConceptInput["direction"];html:string;sha256:string;runtime:"rivet-agentos-core"|"vercel-sandbox";vmType:"ephemeral";verified:true};
export async function buildConceptInAgentOS(input:ConceptInput):Promise<ConceptBuildResult> {
 const html=renderTemplate(input);
 const vm=await AgentOs.create({
  permissions:{network:{default:"deny",rules:[]}},
  limits:{resources:{maxProcesses:8,maxFilesystemBytes:16*1024*1024}}
 });
 try {
  await vm.filesystem.writeFile("/tmp/index.html",html);
  const execution=await vm.process.exec("cat /tmp/index.html",{output:{capture:"all"}});
  if(execution.exitCode!==0 || execution.stdout!==html)throw Error("VM artifact verification failed");
  const artifact=await vm.filesystem.readFile("/tmp/index.html");
  if(new TextDecoder().decode(artifact)!==html)throw Error("VM filesystem verification failed");
  return {prospectId:input.prospectId,direction:input.direction,html,sha256:createHash("sha256").update(html).digest("hex"),runtime:"rivet-agentos-core",vmType:"ephemeral",verified:true};
 }finally{await vm.dispose()}
}
