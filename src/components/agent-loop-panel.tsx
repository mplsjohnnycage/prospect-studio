"use client";
// Controls for the autonomous loop. Every control calls a real Convex function in convex/agent.ts.
// Sends and prices are never controlled here: they stay manual approvals in the Sales panel.
import {useState} from "react";
import {useMutation,useQuery} from "convex/react";
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
 const runNow=useMutation(api.agent.runNow);
 const [allow,setAllowText]=useState("");
 if(!s)return <div className="text-xs text-muted-foreground">Loading agent loop...</div>;
 const c=s.config;
 const act=async(f:()=>Promise<unknown>,ok:string)=>{try{await f();toast.success(ok);}catch(e){toast.error(e instanceof Error?e.message:"Failed");}};
 return <div className="mb-6 space-y-4 rounded-lg border p-4">
  <div className="flex items-center justify-between"><div><p className="ps-eyebrow">Autonomous loop</p><p className="text-sm font-semibold">{c.paused?"Paused (kill switch on)":"Running"}</p><p className="text-[11px] text-muted-foreground">Sends and prices always need your approval.</p></div>
   <div className="flex gap-2"><Button size="sm" variant={c.paused?"default":"destructive"} onClick={()=>act(()=>setPaused({paused:!c.paused}),c.paused?"Loop enabled":"Loop paused")}>{c.paused?"Enable loop":"Kill switch"}</Button>
   <Button size="sm" variant="outline" disabled={c.paused} onClick={()=>act(()=>runNow({}),"Started: the queue runs in the background")}>Run now</Button></div></div>
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
 const testLeadM=useMutation(api.agent.sendTestLead);
 const latest=(k:string)=>(rows??[]).filter(r=>r.what.startsWith(k+":")).pop()?.what.replace(new RegExp("^"+k+":\\s*"),"");
 const card=latest("call_now")??latest("call_card"),td=latest("teardown"),ptl=latest("pay_to_live");
 return <div className="space-y-2 border-b p-3">
  <div className="flex flex-wrap gap-1">{(["recheck","build","reach"] as const).map(k=><Button key={k} size="sm" variant="outline" className="h-7 text-[11px]" onClick={()=>ask(k)}>Agent: {k=="reach"?"draft":k}</Button>)}<Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={()=>testLeadM({prospectId:prospectId as Id<"prospects">}).then(()=>toast.success("Test lead logged (labeled TEST, nothing sent)"),e=>toast.error(String(e)))}>Demo test lead</Button></div>
  {[card,td,ptl].filter(Boolean).map((x,i)=><pre key={i} className="whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">{x}</pre>)}
  <ul className="max-h-32 overflow-auto text-[11px] text-muted-foreground">{(rows??[]).slice(-12).map((r,i)=><li key={i}>{new Date(r.at).toLocaleString()} · {r.type} · {r.what.slice(0,120)}</li>)}</ul>
 </div>;
}

type Approval={id:Id<"outreach">;prospectId:string;name:string;subject:string;body:string;updatedAt:number;callCard:string|null;issues:string[]};
/** Drafts the loop prepared. Approve marks it ready; sending stays a manual Send in Sales. */
export function ApprovalQueue(){
 const rows=useQuery(api.agent.approvals,{}) as Approval[]|undefined;
 const approve=useMutation(api.agent.approveDraft);
 const discard=useMutation(api.agent.discardDraft);
 const edit=useMutation(api.outreach.edit);
 const [open,setOpen]=useState<string|null>(null);
 const [draft,setDraft]=useState({subject:"",body:""});
 if(!rows)return <div className="text-xs text-muted-foreground">Loading approvals...</div>;
 const act=(p:Promise<unknown>,ok:string)=>p.then(()=>toast.success(ok),e=>toast.error(e instanceof Error?e.message:String(e)));
 return <div className="mb-6 rounded-2xl border border-border bg-card p-5">
  <p className="text-sm font-semibold">Approval queue <span className="text-xs font-normal text-muted-foreground">({rows.length} drafts · nothing is sent from here)</span></p>
  {rows.length===0&&<p className="mt-2 text-xs text-muted-foreground">No drafts waiting.</p>}
  <ul className="mt-2 grid gap-3">{rows.map(r=><li key={r.id} className="rounded-xl border border-border p-3 text-xs">
   <div className="flex items-center justify-between gap-2"><b>{r.name}</b><span className="text-muted-foreground">{r.subject}</span></div>
   {r.issues.length>0&&<p className="mt-1 text-amber-600">Before approving: {r.issues.join("; ")}</p>}
   {r.callCard&&<pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">{r.callCard}</pre>}
   {open===r.id?<div className="mt-2 grid gap-2"><Input value={draft.subject} onChange={e=>setDraft({...draft,subject:e.target.value})}/><textarea className="min-h-40 rounded border border-border p-2" value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/>
    <div className="flex gap-2"><Button size="sm" onClick={()=>act(edit({id:r.id,subject:draft.subject,body:draft.body}),"Saved").then(()=>setOpen(null))}>Save</Button><Button size="sm" variant="outline" onClick={()=>setOpen(null)}>Close</Button></div></div>
   :<pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">{r.body}</pre>}
   <div className="mt-2 flex gap-2"><Button size="sm" onClick={()=>act(approve({id:r.id}),"Approved. Send it from Sales when ready.")}>Approve</Button>
    <Button size="sm" variant="outline" onClick={()=>{setOpen(r.id);setDraft({subject:r.subject,body:r.body});}}>Edit</Button>
    <Button size="sm" variant="outline" onClick={()=>{if(confirm("Discard this draft?"))act(discard({id:r.id}),"Discarded");}}>Discard</Button></div>
  </li>)}</ul>
 </div>;
}
type OptOutState={suppressed:{id:string;kind:string;value:string;reason:string;createdAt:number}[];oneClickOptOuts:number;lastOptOutAt:number|null;footer:string};
/** Who opted out (one-click links and manual suppressions). Suppressed contacts never get a draft. */
export function OptOutPanel(){
 const s=useQuery(api.agent.optOuts,{}) as OptOutState|undefined;
 if(!s)return null;
 return <div className="mb-6 rounded-2xl border border-border bg-card p-5 text-xs">
  <p className="text-sm font-semibold">Opt-outs</p>
  <p className="mt-1 text-muted-foreground">{s.oneClickOptOuts} one-click opt-outs{s.lastOptOutAt?" · last "+new Date(s.lastOptOutAt).toLocaleString():""} · {s.suppressed.length} suppressed contacts · footer address: {s.footer}</p>
  <ul className="mt-2 max-h-32 overflow-auto">{s.suppressed.map(x=><li key={x.id}>{x.kind}: {x.value}{x.reason?" ("+x.reason+")":""} · {new Date(x.createdAt).toLocaleDateString()}</li>)}</ul>
 </div>;
}
