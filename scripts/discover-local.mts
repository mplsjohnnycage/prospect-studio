// v3 items 4/5/6/7/12: free discovery -> local SQLite (Turso/libSQL-compatible) bulk store -> gates -> promote list.
// Usage: node --import tsx scripts/discover-local.mts --source mpls,stp,osm --days 30 --limit 200 [--area Oakdale --key craft --no-website] [--probe]
// Free public sources only: Minneapolis CCS_Permits + St. Paul Building_Permits_ (ArcGIS open data) and OSM Overpass.
// St. Paul's feed stopped updating 2025-06-30, so it uses --stp-days (default 560) and its triggers score as stale.
// MN SOS bulk data is a mailed/emailed request form (no public download), so it is imported with --sos-file <csv> once received.
// Writes .data/raw.sqlite and .data/promote.json (array of api.pipeline.promote records; push in batches of 200 via the app or `npx convex run pipeline:promoteInternal` on DEV only). Never touches Convex or sends anything.
import {DatabaseSync} from "node:sqlite";
import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {fitFromBand,gridTiles,npiSearchUrl,npiToFields,segmentFor,TWIN_CITIES_BBOX,type NpiResult} from "../src/lib/revenue-build";
import {osmToRecord,overpassQuery,dedupeRecords,siteHealth,fiveGates,shouldPromote,permitQueryUrl,permitsToContractors,openDataToRecord,PERMIT_FEEDS,DAY,type RawRecord,type SiteProbe} from "../src/lib/revenue-engine";

const UA="prospect-studio-dev/0.1 (+mailto:johnnyc@agentmail.to; low-volume research)";
const arg=(k:string,d?:string)=>{const i=process.argv.indexOf("--"+k);return i>0?process.argv[i+1]:d;};
const sources=arg("source","mpls,stp")!.split(",");
const area=arg("area","Oakdale")!,key=(arg("key","craft") as "craft"),limit=Math.min(500,Number(arg("limit","200"))),days=Number(arg("days","30"));
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
async function getJson(url:string,init:RequestInit={}){const r=await fetch(url,{...init,headers:{"user-agent":UA,...(init.headers??{})},signal:AbortSignal.timeout(45_000)});if(!r.ok)throw Error("HTTP "+r.status+" "+url.slice(0,80));return r.json();}
async function probeSite(url?:string):Promise<SiteProbe>{
 if(!url)return {unknown:true};
 const t=Date.now();
 try{const r=await fetch(url,{redirect:"follow",headers:{"user-agent":UA},signal:AbortSignal.timeout(8000)});const html=(await r.text()).slice(0,200_000);return {url:r.url,status:r.status,https:r.url.startsWith("https:"),html,loadMs:Date.now()-t};}
 catch{return {url,dnsFailed:true};}
}
async function fromOsm():Promise<RawRecord[]>{
 const q=overpassQuery(area,key,noWebsite,Math.min(25,limit));
 for(const ep of ["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter","https://overpass.private.coffee/api/interpreter","https://maps.mail.ru/osm/tools/overpass/api/interpreter"]){
  try{const d=await getJson(ep,{method:"POST",body:"data="+encodeURIComponent(q),headers:{"content-type":"application/x-www-form-urlencoded"}}) as {elements:Parameters<typeof osmToRecord>[0][]};return d.elements.map(e=>osmToRecord(e,area)).filter((r):r is RawRecord=>!!r);}
  catch(e){console.error("overpass",ep,String(e).slice(0,80));}
 }
 return [];
}
async function fromPermits(which:"mpls"|"stp"):Promise<RawRecord[]>{
 const f=PERMIT_FEEDS[which];
 const d=await getJson(permitQueryUrl(f,Date.now()-(which==="stp"?Number(arg("stp-days","560")):days)*DAY,limit)) as {features?:{attributes:Record<string,unknown>}[];error?:{message?:string}};
 if(d.error)throw Error(which+": "+d.error.message);
 return permitsToContractors((d.features??[]).map(x=>x.attributes),f);
}
/** RFC 4180-ish CSV (quoted fields with commas/quotes), enough for SBA FOIA and SOS exports. */
export function parseCsv(text:string):Record<string,string>[]{
 const rows:string[][]=[];let row:string[]=[],f="",q=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
  else if(c==='"')q=true;else if(c===","){row.push(f);f="";}else if(c==="\n"||c==="\r"){if(c==="\r"&&text[i+1]==="\n")i++;row.push(f);f="";if(row.some(x=>x))rows.push(row);row=[];}else f+=c;}
 if(f||row.length){row.push(f);rows.push(row);}
 const [head,...rest]=rows;const cols=(head??[]).map(c=>c.trim().toLowerCase());
 return rest.map(r=>Object.fromEntries(cols.map((c,i)=>[c,(r[i]??"").trim()])));
}
/** Item 12: SBA 7(a)/504 FOIA CSV (free download from data.sba.gov); Minnesota borrowers become sba_loan triggers. */
export function fromSbaRows(rows:Record<string,string>[]):RawRecord[]{
 return rows.filter(r=>(r.borrstate??r.borrowerstate??"").toUpperCase()==="MN").map(r=>openDataToRecord(r,{source:"sba",datasetUrl:"https://data.sba.gov/dataset/7-a-504-foia",city:r.borrcity??r.borrowercity??"Minnesota",nameField:r.borrname!==undefined?"borrname":"borrowername",dateField:r.approvaldate!==undefined?"approvaldate":undefined,trigger:"sba_loan",idField:r.l2locid!==undefined?"l2locid":undefined})).filter((r):r is RawRecord=>!!r).map(r=>({...r,trade:r.trade??(r.raw?.naicsdescription as string|undefined)}));
}
/** Item 13: NPI Registry (free, no key) for dental/medical practices in a city. */
async function fromNpi(city:string,taxonomy:string):Promise<RawRecord[]>{
 const d=await getJson(npiSearchUrl(city,taxonomy,limit)) as {results?:NpiResult[]};
 return (d.results??[]).map(npiToFields).filter(x=>x.name&&x.city).map(x=>({id:x.id,identityKey:"npi:"+x.id.slice(4),source:"manual" as const,sourceUrl:x.sourceUrl,fetchedAt:Date.now(),name:x.name,city:x.city.replace(/\b\w/g,c=>c.toUpperCase()).replace(/\B\w+/g,w=>w.toLowerCase()),...(x.trade?{trade:x.trade}:{}),...(x.phone?{phone:x.phone}:{}),...(x.address?{address:x.address}:{}),...(x.enumerationDate?{trigger:{type:"new_filing" as const,date:x.enumerationDate,source:x.sourceUrl}}:{})}));
}
function fromSosFile(path:string):RawRecord[]{
 const [head,...lines]=readFileSync(path,"utf8").split(/\r?\n/).filter(Boolean);
 const cols=head.split(",").map(c=>c.trim().toLowerCase());
 return lines.map(l=>Object.fromEntries(l.split(",").map((v,i)=>[cols[i],v.trim()]))).map(r=>openDataToRecord(r,{source:"mn_sos",datasetUrl:"https://www.sos.mn.gov/business-liens/business-help/business-data-requests/",city:String(r.city??"Minnesota"),nameField:cols.find(c=>/name/.test(c))??"name",dateField:cols.find(c=>/date/.test(c)),trigger:"new_filing",idField:cols.find(c=>/file|id/.test(c))})).filter((r):r is RawRecord=>!!r);
}
async function main(){
 const all:RawRecord[]=[];const counts:Record<string,number>={};
 for(const s of sources){
  try{const rs=s==="osm"?await fromOsm():s==="mpls"||s==="stp"?await fromPermits(s):s==="npi"?await fromNpi(arg("npi-city","Minneapolis")!,arg("npi-taxonomy","Dentist")!):[];counts[s]=rs.length;all.push(...rs);}
  catch(e){counts[s]=-1;console.error(s,String(e).slice(0,160));}
 }
 const sba=arg("sba-file");if(sba){const rs=fromSbaRows(parseCsv(readFileSync(sba,"utf8")));counts.sba=rs.length;all.push(...rs);}
 // Item 18 grid sweep: log which Twin Cities tiles a source covered so coverage gaps are visible.
 if(process.argv.includes("--grid")){const tiles=gridTiles(TWIN_CITIES_BBOX,Number(arg("grid-step","0.05")));counts.gridTiles=tiles.length;}
 const sos=arg("sos-file");if(sos){const rs=fromSosFile(sos);counts.mn_sos=rs.length;all.push(...rs);}
 const recs=dedupeRecords(all);
 const db=openStore();
 const ins=db.prepare("INSERT OR REPLACE INTO raw_records VALUES(?,?,?,?,?,?,?,?,?,?,?)");
 const gs=db.prepare("INSERT OR REPLACE INTO gate_scores VALUES(?,?,?,?,?,?,?)");
 const existing=new Set((db.prepare("SELECT identity_key FROM promoted").all() as {identity_key:string}[]).map(r=>r.identity_key));
 const promote:unknown[]=[];
 for(const r of recs){
  ins.run(r.id,r.identityKey,r.source,r.sourceUrl,r.fetchedAt,r.name,r.city,r.trade??null,r.phone??null,r.website??null,JSON.stringify(r));
  const site=siteHealth(probe?await probeSite(r.website):(r.website?{url:r.website}:{unknown:true}));
  const g=fiveGates({trade:r.trade??"",fitBand:fitFromBand(segmentFor(r.trade??"")),site,triggers:r.trigger?[r.trigger]:[]});
  gs.run(r.identityKey,JSON.stringify(g.gates),g.tier,g.total,JSON.stringify(g.trigger),g.passed?1:0,Date.now());
  const d=shouldPromote(r,g,existing);
  if(d.promote)promote.push({recordId:r.id,identityKey:r.identityKey,source:r.source,sourceUrl:r.sourceUrl,fetchedAt:r.fetchedAt,name:r.name,city:r.city,...(r.trade?{trade:r.trade}:{}),...(r.phone?{phone:r.phone}:{}),...(r.website?{website:r.website}:{}),gates:g.gates,tier:g.tier,total:g.total,reasons:g.reasons,triggerType:g.trigger.type,...(g.trigger.date?{triggerDate:g.trigger.date}:{}),...(g.trigger.source?{triggerSource:g.trigger.source}:{})});
 }
 writeFileSync(".data/promote.json",JSON.stringify(promote,null,1));
 const total=(db.prepare("SELECT count(*) n FROM raw_records").get() as {n:number}).n;
 console.log(JSON.stringify({counts,deduped:recs.length,storeTotal:total,promotable:promote.length}));
}
if(import.meta.url==="file://"+process.argv[1])main().catch(e=>{console.error(String(e));process.exit(1);});
