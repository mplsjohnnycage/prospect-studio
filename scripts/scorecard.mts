/* eslint-disable @typescript-eslint/no-explicit-any -- untyped JSON rows from convex data */
// Five-measures scorecard. Read-only: pulls tables with `npx convex data` from the deployment in CONVEX_DEPLOYMENT (use dev).
// Usage: node --import tsx scripts/scorecard.mts [--prod]  (default: dev from .env.local)
import {execFileSync} from "node:child_process";
const extra=process.argv.includes("--prod")?["--prod"]:[];
type Row=Record<string,any>;
function table(name:string):Row[]{
 const out=execFileSync("npx",["convex","data",name,"--limit","100000","--format","jsonLines",...extra],{encoding:"utf8",stdio:["ignore","pipe","ignore"],maxBuffer:1<<28});
 return out.split("\n").filter(l=>l.trim().startsWith("{")).map(l=>JSON.parse(l));
}
const pct=(n:number,d:number)=>d?`${(100*n/d).toFixed(1)}% (${n}/${d})`:`n/a (0 denominator)`;
const prospects=table("prospects"),outcomes=table("outcomes"),costs=table("stageCosts"),snaps=table("sendSnapshots"),runs=table("productionRuns");
const by=(k:string)=>new Set(outcomes.filter(o=>o.kind===k).map(o=>o.prospectId));
const viewed=by("viewed"),sent=by("sent"),replied=by("replied"),booked=by("call_booked"),paid=by("paid");
const demoed=new Set([...viewed,...sent]);
const qualified=prospects.filter(p=>p.qualifiedAt!==undefined||p.qualified===true);
const usd=costs.reduce((s,c)=>s+(c.usd||0),0);
const hours=runs.filter(r=>r.stamps?.paid&&r.stamps?.site_live).map(r=>(r.stamps.site_live-r.stamps.paid)/3.6e6).sort((a,b)=>a-b);
const sentSnaps=snaps.filter(s=>s.sentAt!==undefined);
const onTrigger=sentSnaps.filter(s=>s.triggerType&&s.triggerType!=="none"&&typeof s.triggerAgeDays==="number"&&s.triggerAgeDays<=14);
const inter=(a:Set<any>,b:Set<any>)=>[...a].filter(x=>b.has(x)).length;
const card={
 rows:{prospects:prospects.length,outcomes:outcomes.length,stageCosts:costs.length,sendSnapshots:snaps.length,productionRuns:runs.length},
 "1 cost per qualified prospect":qualified.length?`$${(usd/qualified.length).toFixed(4)} ($${usd.toFixed(4)} / ${qualified.length}; ${prospects.filter(p=>p.qualifiedAt!==undefined).length} with qualifiedAt)`:"n/a (0 qualified)",
 "2 demo-to-reply":pct(inter(demoed,replied),demoed.size),
 "3a reply-to-call":pct(inter(replied,booked),replied.size),
 "3b call-to-close":pct(inter(booked,paid),booked.size),
 "4 hours payment-to-live (median)":hours.length?`${hours[Math.floor(hours.length/2)].toFixed(1)} h (n=${hours.length})`:"n/a (0 paid+live runs)",
 "5 share of sends on trigger (<=14d)":pct(onTrigger.length,sentSnaps.length)
};
console.log(JSON.stringify(card,null,1));
