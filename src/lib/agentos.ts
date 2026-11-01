import {createHash} from "node:crypto";
import {AgentOs} from "@rivet-dev/agentos-core";

export type ConceptInput = {
  prospectId:string;
  businessName:string;
  trade:string;
  city:string;
  direction:"Editorial"|"Local First"|"Conversion"|"Signature";
};
const allowed=new Set(["Editorial","Local First","Conversion","Signature"]);
export function escapeHtml(value:string):string{return value.replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]!))}
export function validateConcept(input:ConceptInput):void {
  if(!/^[a-zA-Z0-9_-]{5,128}$/.test(input.prospectId))throw Error("Invalid prospect key");
  if(!allowed.has(input.direction))throw Error("Unsupported concept direction");
  for(const key of ["businessName","trade","city"] as const){
    const val=input[key];
    if(typeof val!=="string"||val.trim().length<1||val.length>180)throw Error(`Invalid ${key}`);
  }
}
export function renderTemplate(input:ConceptInput):string {
 validateConcept(input);
 const name=escapeHtml(input.businessName.trim());
 const trade=escapeHtml(input.trade.trim());
 const city=escapeHtml(input.city.trim());
 const accent={Editorial:"#d5af72","Local First":"#5ed1a6",Conversion:"#8bc5ff",Signature:"#c4a2fb"}[input.direction];
 const headline={Editorial:"Built with intention.", "Local First":"Local expertise. Lasting results.",Conversion:"Make your next project happen.",Signature:"A different standard."}[input.direction];
 return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name} | Concept Preview</title><meta name="robots" content="noindex,nofollow">
<style>*{box-sizing:border-box}body{margin:0;background:#101720;color:#f0f5f6;font:16px system-ui,Arial,sans-serif}header,main,footer{max-width:1080px;margin:auto;padding:30px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #344351}.brand{font-size:19px;font-weight:700;letter-spacing:-.03em}.eyebrow{letter-spacing:.16em;text-transform:uppercase;color:${accent};font-size:12px;font-weight:650}.hero{padding:110px 0 95px;max-width:760px}h1{font-size:clamp(48px,7vw,89px);letter-spacing:-.065em;line-height:1.04;margin:18px 0}p{line-height:1.75;color:#b8c8d1;max-width:570px}.cta{display:inline-block;margin-top:20px;background:${accent};color:#101720;text-decoration:none;border-radius:8px;padding:14px 19px;font-weight:700}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:17px;margin-bottom:70px}.card{min-height:150px;border:1px solid #344351;border-radius:16px;padding:23px;background:#162431}.card h2{font-size:19px}footer{border-top:1px solid #344351;color:#7e939f;font-size:13px}</style></head>
<body><header><div class="brand">${name}</div><span class="eyebrow">${city}</span></header>
<main><section class="hero"><div class="eyebrow">${trade} · ${city}</div><h1>${headline}</h1><p>Explore a new digital direction for ${name}. Designed to communicate trust, clarify services and make a strong first impression.</p><a class="cta" href="#services">Explore the concept →</a></section>
<section class="cards" id="services"><article class="card"><span class="eyebrow">01</span><h2>Services</h2><p>Clear offerings built around what customers need.</p></article><article class="card"><span class="eyebrow">02</span><h2>Experience</h2><p>A polished, responsive presence for every device.</p></article><article class="card"><span class="eyebrow">03</span><h2>Local trust</h2><p>Representing the work and the community.</p></article></section></main>
<footer>Unpublished design concept only · Not an official ${name} website · No live forms or booking integrations</footer></body></html>`;
}
export type ConceptBuildResult={prospectId:string;direction:ConceptInput["direction"];html:string;sha256:string;runtime:"rivet-agentos-core";vmType:"ephemeral";verified:true};
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
