// v3 items 4/5/6/7: free discovery -> local SQLite (Turso/libSQL-compatible) bulk store -> gates -> promote list.
// Usage: node --import tsx scripts/discover-local.mts --area Oakdale --key craft --limit 10 [--no-website] [--probe]
// Free sources only (OSM Overpass). Writes .data/raw.sqlite and .data/promote.json. Never touches Convex or sends anything.
import {DatabaseSync} from "node:sqlite";
import {mkdirSync,writeFileSync} from "node:fs";
import {osmToRecord,overpassQuery,dedupeRecords,siteHealth,fiveGates,shouldPromote,type RawRecord,type SiteProbe} from "../src/lib/revenue-engine";

const arg=(k:string,d?:string)=>{const i=process.argv.indexOf("--"+k);return i>0?process.argv[i+1]:d;};
const area=arg("area","Oakdale")!,key=(arg("key","craft") as "craft"),limit=Math.min(25,Number(arg("limit","10")));
const noWebsite=process.argv.includes("--no-website"),probe=process.argv.includes("--probe");

export function openStore(path=".data/raw.sqlite"){
 mkdirSync(".data",{recursive:true});
 const db=new DatabaseSync(path);
 db.exec(`CREATE TABLE IF NOT EXISTS raw_records(id TEXT PRIMARY KEY,identity_key TEXT NOT NULL,source TEXT NOT NULL,source_url TEXT NOT NULL,fetched_at INTEGER NOT NULL,name TEXT,city TEXT,trade TEXT,phone TEXT,website TEXT,json TEXT);
 CREATE INDEX IF NOT EXISTS raw_identity ON raw_records(identity_key);
 CREATE TABLE IF NOT EXISTS gate_scores(identity_key TEXT PRIMARY KEY,gates TEXT,tier TEXT,total INTEGER,trigger TEXT,passed INTEGER,scored_at INTEGER);
 CREATE TABLE IF NOT EXISTS promoted(identity_key TEXT PRIMARY KEY,promoted_at INTEGER);`);
 return db;
}
async function probeSite(url?:string):Promise<SiteProbe>{
 if(!url)return {};
 const t=Date.now();
 try{const r=await fetch(url,{redirect:"follow",signal:AbortSignal.timeout(8000)});const html=(await r.text()).slice(0,200_000);return {url:r.url,status:r.status,https:r.url.startsWith("https:"),html,loadMs:Date.now()-t};}
 catch{return {url,dnsFailed:true};}
}
async function main(){
 const q=overpassQuery(area,key,noWebsite,limit);
 let res:Response|undefined;
 for(const ep of ["https://overpass-api.de/api/interpreter","https://overpass.private.coffee/api/interpreter","https://overpass.kumi.systems/api/interpreter"]){
  try{res=await fetch(ep,{method:"POST",body:"data="+encodeURIComponent(q),headers:{"content-type":"application/x-www-form-urlencoded","user-agent":"prospect-studio-dev/0.1"},signal:AbortSignal.timeout(40_000)});if(res.ok)break;}catch{res=undefined;}
 }
 if(!res?.ok)throw Error("Overpass unavailable: HTTP "+(res?.status??"network"));
 const data=await res.json() as {elements:Parameters<typeof osmToRecord>[0][]};
 const recs=dedupeRecords(data.elements.map(e=>osmToRecord(e,area)).filter((r):r is RawRecord=>!!r));
 const db=openStore();
 const ins=db.prepare("INSERT OR REPLACE INTO raw_records VALUES(?,?,?,?,?,?,?,?,?,?,?)");
 const gs=db.prepare("INSERT OR REPLACE INTO gate_scores VALUES(?,?,?,?,?,?,?)");
 const existing=new Set((db.prepare("SELECT identity_key FROM promoted").all() as {identity_key:string}[]).map(r=>r.identity_key));
 const promote:unknown[]=[];
 for(const r of recs){
  ins.run(r.id,r.identityKey,r.source,r.sourceUrl,r.fetchedAt,r.name,r.city,r.trade??null,r.phone??null,r.website??null,JSON.stringify(r));
  const site=siteHealth(probe?await probeSite(r.website):(r.website?{url:r.website}:{}));
  const g=fiveGates({trade:r.trade??"",site,triggers:r.trigger?[r.trigger]:[]});
  gs.run(r.identityKey,JSON.stringify(g.gates),g.tier,g.total,JSON.stringify(g.trigger),g.passed?1:0,Date.now());
  const d=shouldPromote(r,g,existing);
  if(d.promote)promote.push({record:r,gates:g});
 }
 writeFileSync(".data/promote.json",JSON.stringify(promote,null,1));
 console.log(JSON.stringify({area,key,fetched:data.elements.length,records:recs.length,noWebsite:recs.filter(r=>!r.website).length,promotable:promote.length}));
}
if(import.meta.url==="file://"+process.argv[1])main().catch(e=>{console.error(String(e));process.exit(1);});
