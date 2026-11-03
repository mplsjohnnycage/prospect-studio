// Agentic step 9: evals that must pass before a stage's autonomy level is raised. Offline, uses the local store fixtures.
// Usage: node --import tsx scripts/agent-evals.mts [path/to/promote.json]  -> writes .data/evals.json
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {evalQualify,evalBuild,evalReach} from "../src/lib/agent-core";
import {buildIR,irIssues,renderIR} from "../src/lib/revenue-build";
import {demoQa,composeWhyNow,type Trigger} from "../src/lib/revenue-engine";

type Rec={identityKey:string;sourceUrl:string;name:string;city:string;trade?:string;triggerType:string;triggerDate?:string;triggerSource?:string;reasons:string[]};
const path=process.argv[2]??".data/promote.json";
type Old={record:{identityKey:string;sourceUrl:string;name:string;city:string;trade?:string;trigger?:Trigger};gates:{trigger:Trigger;reasons:string[]}};
const raw=JSON.parse(readFileSync(path,"utf8")) as (Rec|Old)[];
const recs:Rec[]=raw.map(x=>"record" in x?{identityKey:x.record.identityKey,sourceUrl:x.record.sourceUrl,name:x.record.name,city:x.record.city,trade:x.record.trade,triggerType:x.gates.trigger.type,triggerDate:x.gates.trigger.date,triggerSource:x.gates.trigger.source,reasons:x.gates.reasons}:x);
const trig=(r:Rec):Trigger=>({type:r.triggerType as Trigger["type"],date:r.triggerDate,source:r.triggerSource});
const q=evalQualify(recs.slice(0,100).map(r=>({identityKey:r.identityKey,sourceUrl:r.sourceUrl,trigger:trig(r),gatesPassed:true})));
const b=evalBuild(recs.slice(0,25).map(r=>{const facts=[{text:`${r.trade??"Local"} work permitted in ${r.city}`,sourceUrl:r.sourceUrl}];const ir=buildIR({name:r.name,city:r.city,trade:r.trade??"",facts});const html=renderIR(ir,facts,"#book");return {qaPass:demoQa(html,facts).pass&&!irIssues(ir,facts,true).length,unsourced:irIssues(ir,facts,true).filter(i=>i.startsWith("Unsourced")).length};}));
const rr=evalReach(recs.slice(0,40).map(r=>composeWhyNow({name:r.name,trade:r.trade??"",city:r.city,trigger:trig(r),gap:r.reasons.filter(x=>x.startsWith("Gap:")),facts:[],optOutUrl:"https://rightful-elk-426.convex.site/optout/"+"0".repeat(32)})));
const out={at:new Date().toISOString(),fixtures:path,results:[q,b,rr]};
mkdirSync(".data",{recursive:true});writeFileSync(".data/evals.json",JSON.stringify(out,null,1));
for(const r of out.results)console.log(`${r.stage} L${r.level}: n=${r.n} score=${(r.score*100).toFixed(0)}% threshold=${r.threshold*100}% ${r.pass?"PASS":"FAIL"}`);
