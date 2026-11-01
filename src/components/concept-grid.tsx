"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowRight,Check,CheckCircle2,FileCode2,ChevronDown,Eye,Layers,LoaderCircle,LockKeyhole,Monitor,Play,ShieldCheck,Smartphone,ThumbsUp} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {toast} from "sonner";
import type {Concept,Prospect} from "@/lib/domain";
import {shouldAcceptPreviewMessage} from "@/lib/demo-submission";
type Props={prospect:Prospect;concepts:Concept[];busy:boolean;run:(id:string,kind:string,params?:Record<string,unknown>)=>void;refresh:()=>Promise<void>};
type Direction="Editorial"|"Local First"|"Conversion"|"Signature";
const styles:Record<Direction,{bg:string;fg:string;accent:string;subtle:string;intro:string;cta:string;services:string[];details:string}>={
 Editorial:{bg:"#f5f1ea",fg:"#22221f",accent:"#8c754b",subtle:"#d9caba",intro:"Crafted with intention.",cta:"Explore our work",services:["An exacting approach","Built on trust","Considered details"],details:"Typography-led editorial style"},
 "Local First":{bg:"#eff7ef",fg:"#173d30",accent:"#228661",subtle:"#c2e2cb",intro:"Your neighborhood. Our commitment.",cta:"Talk to our team",services:["Local experience","Friendly service","A trusted approach"],details:"Community-first service identity"},
 Conversion:{bg:"#eff6fc",fg:"#101f38",accent:"#267bc2",subtle:"#cce5f9",intro:"The service you need. Done right.",cta:"Start your project",services:["How we help","What to expect","Get in touch"],details:"Direct response and clarity"},
 Signature:{bg:"#211c2e",fg:"#f9f6f1",accent:"#c4a2fb",subtle:"#473e5f",intro:"Work that speaks for itself.",cta:"Discover our approach",services:["Our standard","Featured work","The process"],details:"Bold distinctive visual identity"}
};
function ConceptArtwork({business,trade,city,direction,compact=false}:{business:string;trade:string;city:string;direction:Direction;compact?:boolean}){
 const s=styles[direction]||styles.Editorial;
 return <div style={{background:s.bg,color:s.fg}} className={`relative h-full min-h-[310px] overflow-hidden rounded-[13px] border border-black/5 shadow-sm ${compact?"":"sm:min-h-[490px]"}`}>
  <div className={`relative z-10 flex items-center justify-between border-b border-current/10 ${compact?"px-5 py-4":"px-6 py-6 sm:px-9"}`}><span className="max-w-[60%] truncate text-[11px] font-black tracking-[-.03em] sm:text-[16px]">{business}</span><span className="text-[9px] font-semibold uppercase tracking-[.15em] opacity-60">{city.split(",")[0]}</span></div>
  <div className={`relative z-10 px-6 sm:px-9 ${compact?"pb-8 pt-9":"pb-14 pt-16 sm:pt-20"}`}>
   <div className="mb-4 text-[9px] font-bold uppercase tracking-[.24em] opacity-60">{trade} / {direction}</div>
   <h2 className={`max-w-[490px] font-semibold leading-[1.05] tracking-[-.062em] ${compact?"text-[37px] sm:text-[45px]":"text-[48px] sm:text-[72px]"}`}>{s.intro}</h2>
   <p className="mt-5 max-w-[360px] text-[12px] leading-[1.8] opacity-65">A clear, memorable digital presence for {business}, focused on useful information and meaningful customer interactions.</p>
   <span style={{background:s.accent,color:direction==="Signature"?"#211c2e":"white"}} className="mt-8 inline-flex items-center gap-2 rounded-md px-5 py-3 text-[10px] font-bold">{s.cta}<ArrowRight size={13}/></span>
  </div>
  <div className="relative z-10 grid grid-cols-3 border-t border-current/10">{s.services.map((item,i)=><div key={item} className={`border-r border-current/10 p-4 last:border-r-0 ${compact?"":"sm:p-7"}`}><span className="block text-[9px] font-bold opacity-50">0{i+1} /</span><span className="mt-2 block text-[10px] font-semibold leading-4 sm:text-[12px]">{item}</span></div>)}</div>
  <div style={{borderColor:s.subtle}} className="pointer-events-none absolute -right-20 top-[75px] size-[320px] rounded-full border-[40px] opacity-35 sm:size-[430px]"/><div style={{borderColor:s.subtle}} className="pointer-events-none absolute -right-14 top-[145px] size-[220px] rounded-full border-[28px] opacity-50 sm:size-[300px]"/>
 </div>;
}
export function ConceptGrid({prospect:p,concepts,busy,run,refresh}:Props){
 const [active,setActive]=useState<string|null>(null),[building,setBuilding]=useState<string|null>(null),[display,setDisplay]=useState<"desktop"|"phone">("desktop"),[modal,setModal]=useState(false);
 const inlineFrame=useRef<HTMLIFrameElement>(null),expandedFrame=useRef<HTMLIFrameElement>(null);
 const [previewTests,setPreviewTests]=useState<{_id:string;name:string;email:string;message:string;createdAt:number}[]>([]);
 useEffect(()=>{if(!active&&concepts.length)queueMicrotask(()=>setActive(concepts.find(c=>c.status==="approved")?.id||concepts[0].id))},[active,concepts]);
 const c=concepts.find(c=>c.id===active)||concepts[0];
 const direction=(c?.direction||"Editorial") as Direction;
 const profile=styles[direction]||styles.Editorial;
 const built=!!c?.html;
 const approved=c?.status==="approved";
 useEffect(()=>{
  if(!c?.html)return;
  let active=true;
  fetch("/api/demo-submissions?prospectId="+encodeURIComponent(p.id),{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{if(active&&d?.submissions)setPreviewTests(d.submissions)}).catch(()=>{});
  return()=>{active=false};
 },[p.id,c?.html]);
 useEffect(()=>{
  if(!c?.html)return;
  const onMessage=async(event:MessageEvent)=>{
   const isInline=shouldAcceptPreviewMessage(event,inlineFrame.current?.contentWindow,p.id,c.direction);
   const isExpanded=shouldAcceptPreviewMessage(event,expandedFrame.current?.contentWindow,p.id,c.direction);
   if(!isInline&&!isExpanded)return;
   let ok=false;
   try{
    const response=await fetch("/api/demo-submissions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prospectId:p.id,conceptId:c.id,form:event.data.form})});
    ok=response.ok;
    if(ok){
     const r=await fetch("/api/demo-submissions?prospectId="+encodeURIComponent(p.id),{cache:"no-store"});
     if(r.ok){const d=await r.json();setPreviewTests(d.submissions||[])}
     toast.success("Private preview test saved. No email sent.");
    }else toast.error("Preview test could not be saved");
   }catch{toast.error("Preview test could not be saved")}
   (event.source as Window|null)?.postMessage({type:"prospect-studio:demo-result",ok},"*");
  };
  window.addEventListener("message",onMessage);
  return()=>window.removeEventListener("message",onMessage);
 },[p.id,c?.id,c?.html,c?.direction]);

 async function build(){
  if(!c)return;setBuilding(c.id);
  try{
   const r=await fetch("/api/agentos/build",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prospectId:p.id,conceptId:c.id})});
   const result=await r.json();if(!r.ok)throw Error(result.error||"Unable to build");
   await refresh();toast.success(result.alreadyBuilt?"Artifact already verified":"Verified artifact saved to Convex");
  }catch(e){toast.error(e instanceof Error?e.message:"Build unavailable")}finally{setBuilding(null)}
 }
 if(!concepts.length)return <div className="grid min-h-[480px] place-content-center rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center"><Layers className="mx-auto text-primary" size={28}/><h3 className="mt-4 text-sm font-semibold">No concept directions yet</h3><p className="mt-2 max-w-[310px] text-xs leading-6 text-muted-foreground">Qualify and extract the business, then prepare the four design directions to begin.</p></div>;
 return <div className="space-y-5">
 <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="ps-eyebrow">Prospect / {p.city}</div><h2 className="mt-1 text-xl font-semibold tracking-tight">{p.name}</h2><p className="mt-1 text-xs text-muted-foreground">Four real concept records · one controlled approval · isolated agentOS build</p></div><Badge variant="outline" className="gap-1 rounded-lg px-3 py-1.5"><span className="size-1.5 rounded-full bg-primary"/> {p.stage}</Badge></div>
 <div className="grid gap-4 xl:grid-cols-[225px_minmax(0,1fr)]">
  <div className="space-y-2">{concepts.map((item,i)=><button key={item.id} onClick={()=>{setActive(item.id);setDisplay("desktop")}} className={`flex w-full gap-3 rounded-xl border p-3 text-left transition ${c?.id===item.id?"border-primary/50 bg-primary/[.06] ring-1 ring-primary/10":"border-border bg-background hover:border-primary/30 hover:bg-muted/40"}`}><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-sm font-bold text-foreground">{item.variant}</div><div className="min-w-0 flex-1"><div className="truncate text-[12px] font-semibold">{item.direction}</div><div className="mt-1 truncate text-[10px] text-muted-foreground">{styles[item.direction as Direction]?.details||"Visual direction"}</div><div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">{item.html?<ShieldCheck className="text-primary" size={12}/>:item.status==="approved"?<Check className="text-primary" size={12}/>:<span className="size-1.5 rounded-full bg-muted-foreground/40"/>}{item.html?"Verified build":item.status==="approved"?"Approved":"Pending review"}</div></div>{i===concepts.length-1&&<ChevronDown size={14} className="self-start text-muted-foreground"/>}</button>)}
  <div className="rounded-xl border border-border bg-muted/30 p-4"><div className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Build integrity</div><div className="mt-3 flex items-center gap-2 text-xs"><ShieldCheck size={15} className="text-primary"/> Execution isolated</div><div className="mt-2 flex items-center gap-2 text-xs"><LockKeyhole size={15} className="text-primary"/> External network denied</div><div className="mt-2 flex items-center gap-2 text-xs"><FileCode2 size={15} className="text-primary"/> SHA-256 artifact check</div></div>
  </div>
  <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card"><div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-3"><span className="text-xs font-semibold">{c?.direction} / Visual review</span><Badge variant="secondary" className="text-[10px]">{built?"Built":"Direction"}</Badge><span className="flex-1"/><div className="flex rounded-lg border border-border bg-background p-0.5"><button title="Desktop" onClick={()=>setDisplay("desktop")} className={`grid size-8 place-items-center rounded-md ${display==="desktop"?"bg-muted shadow-sm":""}`}><Monitor size={15}/></button><button title="Phone" onClick={()=>setDisplay("phone")} className={`grid size-8 place-items-center rounded-md ${display==="phone"?"bg-muted shadow-sm":""}`}><Smartphone size={15}/></button></div></div>
   <div className="flex justify-center bg-[#e8e9e6] p-3 dark:bg-[#15181a] sm:p-5"><div className={`min-w-0 overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_12px_40px_#00000016] transition-all duration-200 ${display==="phone"?"w-[320px] max-w-full":"w-full"}`}>
    <div className="flex items-center gap-1.5 border-b border-black/10 bg-[#f6f6f6] px-3 py-2"><span className="size-2 rounded-full bg-[#d8d8d8]"/><span className="size-2 rounded-full bg-[#d8d8d8]"/><span className="size-2 rounded-full bg-[#d8d8d8]"/><div className="ml-3 flex-1 rounded bg-[#e8e8e8] px-3 py-1 text-center text-[9px] text-[#777]">{built?"Verified artifact · local":"Visual specification · not deployed"}</div></div>
    {built?<iframe title="Verified private interactive demo" ref={inlineFrame} sandbox="allow-forms allow-scripts" srcDoc={c.html} className={`block w-full border-0 ${display==="phone"?"h-[570px]":"h-[520px]"}`}/>:<div className="h-[520px] overflow-auto"><ConceptArtwork business={p.name} trade={p.trade} city={p.city} direction={direction} compact={display==="phone"}/></div>}
   </div></div>
   <div className="flex flex-wrap items-center gap-3 border-t border-border bg-card px-4 py-4"><div className="min-w-0 flex-1"><p className="text-[12px] font-semibold">{built?"Verified interactive private demo":profile.details}</p><p className="mt-1 text-[11px] text-muted-foreground">{built?`Checksum: ${c.sha256?.slice(0,18)}… · saved in Convex`:"This layout expresses the design direction; approval is required before execution."}</p></div>{built&&<Button size="sm" variant="outline" onClick={()=>setModal(true)}><Eye size={14}/> Expand</Button>}{!approved?<Button size="sm" disabled={busy||p.status==="blocked"||p.stage!=="Design"} onClick={()=>run(p.id,"approve_concept",{conceptId:c.id})}><ThumbsUp size={15}/> Approve direction</Button>:!built?<Button disabled={busy||!!building||p.status==="blocked"} size="sm" onClick={()=>void build()}>{building?<LoaderCircle size={14} className="animate-spin"/>:<Play size={14}/>} {building?"Building in agentOS…":"Build verified site"}</Button>:<Badge className="gap-1.5"><CheckCircle2 size={13}/> Approved and built</Badge>}</div>
  </div>
 </div>
 <div className="rounded-xl border border-border bg-muted/25 p-4"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold">Private form tests</h3><Badge variant="secondary">{previewTests.length} saved</Badge></div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Built demo forms can save real test records in Convex through the authenticated Studio. They cannot send emails or collect public business leads.</p>{previewTests.length>0&&<details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-primary">View test submissions</summary><div className="mt-3 max-h-52 space-y-2 overflow-y-auto">{previewTests.map(t=><div key={t._id} className="rounded-lg border border-border bg-background p-3"><div className="text-xs font-semibold">{t.name} · {t.email}</div><p className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">{t.message}</p><p className="mt-1 text-[10px] text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</p></div>)}</div></details>}</div>
 <Dialog open={modal} onOpenChange={setModal}><DialogContent className="w-[96vw] max-w-[1150px]"><DialogHeader><DialogTitle>{p.name} — {c?.direction}</DialogTitle><DialogDescription>Interactive private preview · test submissions saved to Convex · no publication</DialogDescription></DialogHeader><iframe title="Expanded verified site" ref={expandedFrame} sandbox="allow-forms allow-scripts" srcDoc={c?.html||""} className="h-[70vh] w-full rounded-lg border border-border bg-white"/></DialogContent></Dialog>
 </div>
}
