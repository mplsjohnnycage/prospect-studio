"use client";
import {useEffect,useRef,useState} from "react";
import {useAction,useMutation,useQuery} from "convex/react";
import {ArrowRight,Bot,Check,CornerDownLeft,LoaderCircle,ShieldCheck,Trash2,X} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {api} from "../../convex/_generated/api";

type Action="autopilot"|"inbox"|"calendar"|"studio"|"prospect";
type Step={tool:string;ok:boolean;error?:string};
type Msg={_id?:string;role:"user"|"assistant";text:string;action?:Action;prospectId?:string;steps?:Step[];createdAt?:number};

const TOOL_LABELS:Record<string,string>={
 pipeline_summary:"Checked pipeline",find_prospects:"Searched prospects",get_prospect:"Opened prospect",list_replies:"Read replies",
 add_prospect:"Added prospect",find_new_businesses:"Started finding businesses",research_prospect:"Researched website",build_demo:"Started demo build",
 get_demo_link:"Made demo link",draft_first_email:"Drafted email",draft_reply:"Drafted reply",import_prospects:"Imported businesses",add_to_do_not_contact:"Added to do-not-contact",
};
const prompts=["How's the pipeline? What should I do next?","Which replies need an answer?","Build demos for my top 3 leads","Find painters in Oakdale, MN"];

/** Renders **bold** and line breaks from the agent's short markdown without injecting HTML. */
const TOKEN=/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s)]+)/g;
function Inline({text}:{text:string}){
 return <>{text.split(TOKEN).map((part,j)=>{
  if(part.startsWith("**")&&part.endsWith("**"))return <strong key={j}>{part.slice(2,-2)}</strong>;
  const md=part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
  const url=md?md[2]:/^https?:\/\//.test(part)?part:null;
  if(url)return <a key={j} href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">{md?md[1]:part}</a>;
  return <span key={j}>{part}</span>;
 })}</>;
}
function Rich({text}:{text:string}){
 return <>{text.split("\n").map((line,i)=><p key={i} className={line.trim()?"":"h-2"}><Inline text={line.replace(/^\s*[*-]\s+/,"• ")}/></p>)}</>;
}

export function AgentPanel({onAction}:{onAction:(action:Action,prospectId?:string)=>void}){
 const history=useQuery(api.assistant.history) as Msg[]|undefined;
 const chat=useAction(api.assistant.chat);
 const clear=useMutation(api.assistant.clear);
 const [pending,setPending]=useState<string|null>(null),[prompt,setPrompt]=useState(""),[error,setError]=useState("");
 const bottom=useRef<HTMLDivElement>(null);
 const messages:Msg[]=[...(history??[]),...(pending?[{role:"user" as const,text:pending}]:[])];
 useEffect(()=>{bottom.current?.scrollIntoView({behavior:"smooth",block:"end"})},[messages.length,pending]);
 async function ask(value:string){
  const text=value.trim();
  if(!text||pending)return;
  setError("");setPending(text);setPrompt("");
  try{await chat({text});}
  catch(e){setError(e instanceof Error?e.message.replace(/^.*Uncaught Error:\s*/,"").split("\n")[0]:"The agent couldn't answer");}
  finally{setPending(null)}
 }
 return <div className="flex min-h-[480px] flex-col gap-3">
  <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
   <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Bot size={18}/></div>
   <div className="min-w-0 flex-1"><div className="text-sm font-semibold">Prospect Studio Agent</div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Ask in plain words. It looks up your pipeline, researches businesses, builds demos and writes drafts. You approve and send.</p></div>
   {!!history?.length&&<button aria-label="Clear conversation" title="Clear conversation" onClick={()=>void clear({})} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Trash2 size={14}/></button>}
  </div>
  <div className="min-h-[240px] max-h-[56vh] flex-1 space-y-3 overflow-y-auto rounded-xl border border-border bg-muted/20 p-3" aria-live="polite">
   {history===undefined&&<div className="flex justify-center p-6"><LoaderCircle size={18} className="animate-spin text-muted-foreground"/></div>}
   {history!==undefined&&!messages.length&&<div className="mt-6 text-center"><Bot size={26} className="mx-auto text-primary"/><p className="mt-3 text-sm font-semibold">What should we work on?</p><p className="mt-1 text-xs text-muted-foreground">Try one of these, or type your own.</p></div>}
   {messages.map((m,i)=><div key={m._id||"p"+i} className={m.role==="user"?"flex justify-end":"flex justify-start"}>
    <div className={"max-w-[93%] rounded-xl px-4 py-3 text-[12.5px] leading-6 "+(m.role==="user"?"bg-primary text-primary-foreground":"border border-border bg-card text-foreground")}>
     {m.role==="assistant"&&!!m.steps?.length&&<div className="mb-2 flex flex-wrap gap-1.5">{m.steps.map((s,j)=><span key={j} title={s.error} className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium "+(s.ok?"bg-primary/10 text-primary":"bg-destructive/10 text-destructive")}>{s.ok?<Check size={10}/>:<X size={10}/>}{TOOL_LABELS[s.tool]??s.tool}</span>)}</div>}
     {m.role==="assistant"?<Rich text={m.text}/>:<p className="whitespace-pre-wrap">{m.text}</p>}
     {m.role==="assistant"&&m.prospectId&&<Button size="sm" variant="outline" className="mt-2 gap-2 text-[11px]" onClick={()=>onAction("prospect",m.prospectId)}><ArrowRight size={12}/> Open prospect</Button>}
    </div>
   </div>)}
   {pending&&<div className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle size={14} className="animate-spin"/> Working on it…</div>}
   <div ref={bottom}/>
  </div>
  {history!==undefined&&!messages.length&&<div className="flex flex-wrap gap-2">{prompts.map(p=><button key={p} disabled={!!pending} onClick={()=>void ask(p)} className="rounded-full border border-border bg-background px-3 py-1.5 text-left text-[11px] font-medium hover:bg-accent">{p}</button>)}</div>}
  {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
  <form className="flex items-end gap-2" onSubmit={e=>{e.preventDefault();void ask(prompt)}}>
   <Textarea aria-label="Message the agent" className="min-h-[62px] flex-1 resize-none text-[13px]" maxLength={2000} value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void ask(prompt)}}} placeholder="e.g. Research the top roofing leads and build their demos" rows={2}/>
   <Button type="submit" size="icon" aria-label="Send to agent" disabled={!!pending||prompt.trim().length<2}><CornerDownLeft size={18}/></Button>
  </form>
  <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><ShieldCheck size={13}/> The agent never sends email or replies. You approve and send in the Outreach tab.</div>
 </div>;
}
