"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowRight,CornerDownLeft,LoaderCircle,ShieldCheck,Sparkles,TerminalSquare} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";

type Action="autopilot"|"inbox"|"calendar"|"studio"|"prospect";
type Msg={_id?:string;role:"user"|"assistant";text:string;action?:Action;prospectId?:string;createdAt?:number};
const prompts=["Workspace status","Top leads","Draft emails","Scheduled calls","Demo policy","Review queue"];
export function AgentPanel({onAction}:{onAction:(action:Action,prospectId?:string)=>void}){
 const [messages,setMessages]=useState<Msg[]>([]),[prompt,setPrompt]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const bottom=useRef<HTMLDivElement>(null);
 useEffect(()=>{let active=true;fetch("/api/assistant",{cache:"no-store"}).then(r=>r.json()).then(d=>{if(active&&d.messages)setMessages(d.messages)}).catch(()=>{if(active)setError("Could not load conversation history")});return()=>{active=false}},[]);
 useEffect(()=>{bottom.current?.scrollIntoView({behavior:"smooth",block:"end"})},[messages,busy]);
 async function ask(value:string){
  const text=value.trim();
  if(!text||busy)return;
  setError("");setBusy(true);setPrompt("");
  setMessages(v=>[...v,{role:"user",text}]);
  try{
   const response=await fetch("/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});
   const result=await response.json() as {text?:string;action?:Action;prospectId?:string;error?:string};
   if(!response.ok)throw Error(result.error||"Query failed");
   setMessages(v=>[...v,{role:"assistant",text:result.text||"No answer",action:result.action,prospectId:result.prospectId}]);
  }catch(e){setError(e instanceof Error?e.message:"Operations query failed");setMessages(v=>[...v,{role:"assistant",text:"The operation could not be completed. No changes were made."}])}
  finally{setBusy(false)}
 }
 return <div className="flex min-h-[480px] flex-col gap-3">
  <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3"><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><TerminalSquare size={18}/></div><div><div className="text-sm font-semibold">Operations Agent</div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Persistent Convex-backed workspace context. Rule-based commands; no generative model is connected. Read-only recommendations and explicit navigation actions.</p></div></div>
  <div className="min-h-[240px] max-h-[52vh] flex-1 space-y-3 overflow-y-auto rounded-xl border border-border bg-muted/20 p-3" aria-live="polite">
   {!messages.length&&<div className="mt-6 text-center"><Sparkles size={24} className="mx-auto text-primary"/><p className="mt-3 text-sm font-semibold">What needs attention?</p><p className="mt-1 text-xs text-muted-foreground">Ask about real prospect scores, approvals, drafts, or planned calls.</p></div>}
   {messages.map((m,i)=><div key={m._id||i} className={m.role==="user"?"flex justify-end":"flex justify-start"}><div className={"max-w-[93%] rounded-xl px-4 py-3 text-[12px] leading-6 "+(m.role==="user"?"bg-primary text-primary-foreground":"border border-border bg-card text-foreground")}><p className="whitespace-pre-wrap">{m.text}</p>{m.role==="assistant"&&m.action&&<Button size="sm" variant="outline" className="mt-2 gap-2 text-[11px]" onClick={()=>onAction(m.action!,m.prospectId)}><ArrowRight size={12}/> Open {m.action==="inbox"?"Inbox":m.action==="prospect"?"Prospect":m.action==="autopilot"?"Autopilot":m.action==="studio"?"Design Studio":"Calendar"}</Button>}</div></div>)}
   {busy&&<div className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle size={14} className="animate-spin"/> Checking Convex records…</div>}
   <div ref={bottom}/>
  </div>
  {!messages.length&&<div className="flex flex-wrap gap-2">{prompts.map(p=><button key={p} disabled={busy} onClick={()=>void ask(p)} className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-medium hover:bg-accent">{p}</button>)}</div>}
  {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
  <form className="flex items-end gap-2" onSubmit={e=>{e.preventDefault();void ask(prompt)}}><Textarea aria-label="Ask operations agent" className="min-h-[62px] flex-1 resize-none text-xs" maxLength={500} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="e.g. Show the highest-scoring painting prospects…" rows={2}/><Button type="submit" size="icon" aria-label="Ask agent" disabled={busy||prompt.trim().length<2}><CornerDownLeft size={18}/></Button></form>
  <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><ShieldCheck size={13}/> No autonomous sending, publishing, or model-generated claims.</div>
 </div>;
}
