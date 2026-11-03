"use client";
// Controls for the autonomous loop. Every control calls a real Convex function in convex/agent.ts.
// Sends and prices are never controlled here: they stay manual approvals in the Sales panel.
import {useState} from "react";
import {useAction,useMutation,useQuery} from "convex/react";
import {toast} from "sonner";
import {api} from "../../convex/_generated/api";
import type {Id} from "../../convex/_generated/dataModel";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {STAGES,type AgentConfig,type AgentStage,type Level} from "@/lib/agent-core";

type Status={config:AgentConfig;used:{demos:number;drafts:number;promotes:number};queued:number;parked:number};
const LEVELS:[Level,string][]=[[0,"L0 suggest"],[1,"L1 draft"],[2,"L2 auto-build"],[3,"L3 auto-queue"]];
const ago=(t:number)=>{const m=Math.round((Date.now()-t)/60000);return m<60?m+"m ago":Math.round(m/60)+"h ago";};

export function AgentLoopPanel(){
 const s=useQuery(api.agent.status,{}) as Status|undefined;
 const workers=useQuery(api.agent.workers,{});
 const tasks=useQuery(api.agent.tasks,{});
 const digests=useQuery(api.agent.digests,{});
 const setPaused=useMutation(api.agent.setPaused);
 const setLevel=useMutation(api.agent.setStageLevel);
 const setAllow=useMutation(api.agent.setAllowlist);
 const retryTask=useMutation(api.agent.retryTask);
 const cancelTask=useMutation(api.agent.cancelTask);
 const runNow=useAction(api.agent.runNow);
 const [allow,setAllowText]=useState("");
 if(!s)return <div className="text-xs text-muted-foreground">Loading agent loop...</div>;
 const c=s.config;
 const act=async(f:()=>Promise<unknown>,ok:string)=>{try{await f();toast.success(ok);}catch(e){toast.error(e instanceof Error?e.message:"Failed");}};
 return <div className="mb-6 space-y-4 rounded-lg border p-4">
  <div className="flex items-center justify-between"><div><p className="ps-eyebrow">Autonomous loop</p><p className="text-sm font-semibold">{c.paused?"Paused (kill switch on)":"Running"}</p><p className="text-[11px] text-muted-foreground">Sends and prices always need your approval.</p></div>
   <div className="flex gap-2"><Button size="sm" variant={c.paused?"default":"destructive"} onClick={()=>act(()=>setPaused({paused:!c.paused}),c.paused?"Loop enabled":"Loop paused")}>{c.paused?"Enable loop":"Kill switch"}</Button>
   <Button size="sm" variant="outline" disabled={c.paused} onClick={()=>act(()=>runNow({}),"Ran queued steps")}>Run now</Button></div></div>
  <div className="grid grid-cols-2 gap-2 md:grid-cols-5">{STAGES.map((st:AgentStage)=><label key={st} className="text-[11px]"><span className="block text-muted-foreground">{st}</span>
   <select className="w-full rounded border bg-background p-1 text-xs" value={c.levels[st]} onChange={e=>act(()=>setLevel({stage:st,level:Number(e.target.value) as Level}),st+" level saved")}>{LEVELS.map(([l,n])=><option key={l} value={l}>{n}</option>)}</select></label>)}</div>
  <p className="text-[11px] text-muted-foreground">Today: demos {s.used.demos}/{c.caps.demosPerDay} · drafts {s.used.drafts}/{c.caps.draftsPerDay} · promotes {s.used.promotes}/{c.caps.promotesPerDay} · queued {s.queued} · parked {s.parked} · evals passed: {Object.keys(c.evalsPassed).filter(k=>c.evalsPassed[k as AgentStage]).join(", ")||"none"}</p>
  <div><p className="text-[11px] font-medium">Workers (desktop is primary; Sprite runs only when the desktop is offline)</p>
   {(workers??[]).length?<ul className="text-[11px]">{workers!.map(w=><li key={w.worker}>{w.worker}: {ago(w.lastSeen)}{w.stale?" (offline)":""}</li>)}</ul>:<p className="text-[11px] text-muted-foreground">No worker has checked in yet. Start scripts/desktop/start-agent-worker.ps1 on DESKTOP-3APDBKG.</p>}</div>
  <div className="flex gap-2"><Input className="h-8 text-xs" placeholder={"Registered workers and outside agents, e.g. desktop:3apdbkg, sprite:prospect (comma separated). Current: "+(c.allowlist.join(", ")||"none")} value={allow} onChange={e=>setAllowText(e.target.value)}/>
   <Button size="sm" variant="outline" onClick={()=>act(()=>setAllow({workers:allow.split(",")}),"Allowlist saved")}>Save</Button></div>
  <div><p className="text-[11px] font-medium">Task queue</p><ul className="max-h-40 overflow-auto text-[11px]">{(tasks??[]).map(t=><li key={t._id} className="flex items-center gap-2"><span className="flex-1">{t.kind} · {t.status}{t.claimedBy?" · "+t.claimedBy:""}{t.status==="claimed"&&t.leaseUntil?" · lease to "+new Date(t.leaseUntil).toLocaleTimeString():""} · tries {t.attempts}{t.error?" · "+t.error:""}</span>{(t.status==="parked"||t.status==="failed")&&<button type="button" className="underline" onClick={()=>retryTask({taskId:t._id}).then(()=>toast.success("Re-queued"),e=>toast.error(String(e)))}>Retry</button>}{(t.status==="queued"||t.status==="parked"||t.status==="claimed")&&<button type="button" className="underline" onClick={()=>cancelTask({taskId:t._id}).then(()=>toast.success("Cancelled"),e=>toast.error(String(e)))}>Cancel</button>}</li>)}</ul></div>
  <div><p className="text-[11px] font-medium">Digests (drafts, never emailed)</p>{(digests??[]).slice(0,3).map(d=><pre key={d._id} className="whitespace-pre-wrap text-[11px] text-muted-foreground">{d.subject}{"\n"}{d.body}</pre>)}</div>
 </div>;
}

/** Per-prospect trace: agent runs, activities (incl. call-script cards, opt-outs) and outcomes, plus one-step requests. */
export function AgentTrace({prospectId}:{prospectId:string}){
 const rows=useQuery(api.agent.trace,{prospectId:prospectId as Id<"prospects">}) as {at:number;type:string;what:string;usd?:number}[]|undefined;
 const request=useMutation(api.agent.request);
 const ask=async(kind:"qualify"|"build"|"reach"|"recheck")=>{try{await request({kind,prospectId:prospectId as Id<"prospects">});toast.success(kind+" queued");}catch(e){toast.error(e instanceof Error?e.message:"Failed");}};
 const card=(rows??[]).filter(r=>r.what.startsWith("call_card:")).pop();
 return <div className="space-y-2 border-b p-3">
  <div className="flex flex-wrap gap-1">{(["recheck","build","reach"] as const).map(k=><Button key={k} size="sm" variant="outline" className="h-7 text-[11px]" onClick={()=>ask(k)}>Agent: {k=="reach"?"draft":k}</Button>)}</div>
  {card&&<pre className="whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">{card.what.replace(/^call_card:\s*/,"")}</pre>}
  <ul className="max-h-32 overflow-auto text-[11px] text-muted-foreground">{(rows??[]).slice(-12).map((r,i)=><li key={i}>{new Date(r.at).toLocaleString()} · {r.type} · {r.what.slice(0,120)}</li>)}</ul>
 </div>;
}
