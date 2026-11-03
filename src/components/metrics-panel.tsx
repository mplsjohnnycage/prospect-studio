"use client";
// v3 item 23: the five success measures, computed from outcomes, stage costs and send snapshots.
import {useQuery} from "convex/react";
import {api} from "../../convex/_generated/api";

type M={costPerQualified:number;totalCostUsd:number;demoToReply:number;viewRate:number;replyToCall:number;callToClose:number;hoursPayToLive?:number;onTriggerShare:number;revenue:number};
const pct=(x:number)=>(x*100).toFixed(1)+"%";
export function MetricsPanel(){
 const m=useQuery(api.outcomes.dashboard,{}) as M|undefined;
 const w=useQuery(api.pipeline.weights,{}) as {labels:number;weights:number[];order:string[]}|undefined;
 if(!m)return <div className="text-xs text-muted-foreground">Loading metrics...</div>;
 const cells:[string,string][]=[["Cost per qualified prospect","$"+m.costPerQualified.toFixed(2)],["Demo to reply",pct(m.demoToReply)],["Reply to call",pct(m.replyToCall)],["Call to close",pct(m.callToClose)],["Hours payment to live",m.hoursPayToLive===undefined?"n/a":m.hoursPayToLive.toFixed(1)],["Sends on trigger (14d)",pct(m.onTriggerShare)],["Demo view rate",pct(m.viewRate)],["Revenue","$"+m.revenue.toLocaleString()]];
 return <div className="mb-6 rounded-lg border p-4"><p className="ps-eyebrow">Success measures</p>
  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">{cells.map(([k,v])=><div key={k}><div className="text-[11px] text-muted-foreground">{k}</div><div className="text-lg font-semibold">{v}</div></div>)}</div>
  {w&&<p className="mt-3 text-[11px] text-muted-foreground">Gate weights from {w.labels} labeled outcomes: {w.order.map((o,i)=>o+" "+w.weights[i]).join(" · ")}</p>}
 </div>;
}
