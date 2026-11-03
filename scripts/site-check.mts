// v3 round 3: polite site-health pass over the local store, re-score, write .data/top25.md (drafts only, nothing sent).
// Finds a site by guessing the business's own domain from its name and verifying the page names the business.
// Usage: node --import tsx scripts/site-check.mts [--concurrency 4] [--max 400]
import {DatabaseSync} from "node:sqlite";
import {writeFileSync} from "node:fs";
import {siteHealth,fiveGates,composeWhyNow,type RawRecord,type SiteProbe} from "../src/lib/revenue-engine";
import {guessDomains,nameMatches} from "../src/lib/revenue-signals";

const UA="prospect-studio-dev/0.1 (+mailto:johnnyc@agentmail.to; site health check, low volume)";
const arg=(k:string,d:string)=>{const i=process.argv.indexOf("--"+k);return i>0?process.argv[i+1]:d;};
const conc=Math.min(6,Number(arg("concurrency","4"))),max=Number(arg("max","400"));
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

async function probe(url:string):Promise<SiteProbe&{html?:string}|null>{
 const t=Date.now();
 try{const r=await fetch(url,{redirect:"follow",headers:{"user-agent":UA},signal:AbortSignal.timeout(7000)});
  const html=(await r.text()).slice(0,250_000);return {url:r.url,status:r.status,https:r.url.startsWith("https:"),html,loadMs:Date.now()-t};}
 catch{return null;}
}
async function findSite(r:RawRecord):Promise<SiteProbe>{
 if(r.website){return (await probe(r.website))??{url:r.website,dnsFailed:true};}
 for(const d of guessDomains(r.name)){
  const p=await probe("https://"+d+"/")??await probe("http://"+d+"/");
  if(p&&p.status&&p.status<400&&nameMatches(r.name,p.html??""))return p;
  await sleep(250);
 }
 return {}; // no own site found -> "none"
}
async function main(){
 const db=new DatabaseSync(".data/raw.sqlite");
 db.exec("CREATE TABLE IF NOT EXISTS site_checks(identity_key TEXT PRIMARY KEY,url TEXT,state TEXT,score INTEGER,issues TEXT,checked_at INTEGER)");
 const rows=(db.prepare("SELECT json FROM raw_records").all() as {json:string}[]).map(x=>JSON.parse(x.json) as RawRecord&{permitCount?:number;permitValue?:number}).slice(0,max);
 const done=new Set((db.prepare("SELECT identity_key FROM site_checks").all() as {identity_key:string}[]).map(x=>x.identity_key));
 const up=db.prepare("INSERT OR REPLACE INTO site_checks VALUES(?,?,?,?,?,?)");
 let i=0;
 await Promise.all(Array.from({length:conc},async()=>{
  while(i<rows.length){const r=rows[i++];if(done.has(r.identityKey))continue;
   const p=await findSite(r);const h=siteHealth(p);
   up.run(r.identityKey,p.url??null,h.state,h.score,JSON.stringify(h.issues),Date.now());}
 }));
 const checks=new Map((db.prepare("SELECT * FROM site_checks").all() as {identity_key:string;url:string|null;state:string;score:number;issues:string}[]).map(c=>[c.identity_key,c]));
 const scored=rows.map(r=>{const c=checks.get(r.identityKey);const site=c?{state:c.state as "none",score:c.score,issues:JSON.parse(c.issues) as string[]}:siteHealth({unknown:true});
  const g=fiveGates({trade:r.trade??"",site,triggers:r.trigger?[r.trigger]:[],paidListing:(r.permitCount??0)>=3});
  const volume=Math.min(10,(r.permitCount??1)-1)*2; // busy contractors can pay
  return {r,c,site,g,rank:g.total+volume};}).sort((a,b)=>b.rank-a.rank);
 const counts={none:0,dead:0,weak:0,ok:0} as Record<string,number>;scored.forEach(s=>counts[s.site.state]=(counts[s.site.state]??0)+1);
 const top=scored.filter(s=>s.site.state!=="ok").slice(0,25);
 const md=["# Top 25 Twin Cities prospects (drafts only; nothing sent)","",`Generated ${new Date().toISOString()} from ${rows.length} free-source records. Site states: ${JSON.stringify(counts)}.`,"Rank = five-gate total + permit volume bonus. Website found by verifying the business's own domain; 'none' means no own site was found.",""];
 top.forEach((s,k)=>{const d=composeWhyNow({name:s.r.name,trade:s.r.trade??"",city:s.r.city,trigger:s.r.trigger??{type:"none"},gap:s.site.issues,facts:[]});
  const why=d.body.split("\n")[2];
  md.push(`## ${k+1}. ${s.r.name} (${s.r.city})`,`- Trade: ${s.r.trade} · permits in window: ${s.r.permitCount??1} · rank ${s.rank} · tier ${s.g.tier}`,`- Site: ${s.site.state}${s.c?.url?" ("+s.c.url+")":""}; ${s.site.issues.join("; ")}`,`- Trigger: ${s.r.trigger?.type??"none"} on ${s.r.trigger?.date??"n/a"}, source ${s.r.trigger?.source??s.r.sourceUrl}${s.r.trigger?.detail?" ("+s.r.trigger.detail.replace(/\s+/g," ").slice(0,90)+")":""}`,`- Why now (draft): ${why}`,"");});
 writeFileSync(".data/top25.md",md.join("\n"));
 console.log(JSON.stringify({records:rows.length,counts,top:top.length}));
}
main().catch(e=>{console.error(String(e));process.exit(1);});
