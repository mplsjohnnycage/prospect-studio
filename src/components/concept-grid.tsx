"use client";
import {useState} from "react";
import {Blocks,Check,Code2,Eye,PlayCircle} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {toast} from "sonner";
import type {Concept,Prospect} from "@/lib/domain";

type Props={prospect:Prospect;concepts:Concept[];busy:boolean;run:(id:string,kind:string,params?:Record<string,unknown>)=>void;refresh:()=>Promise<void>};
export function ConceptGrid({prospect:p,concepts,busy,run,refresh}:Props){
 const [building,setBuilding]=useState<string|null>(null);
 const [preview,setPreview]=useState<Concept|null>(null);
 async function build(c:Concept){
  setBuilding(c.id);
  try {
   const resp=await fetch("/api/agentos/build",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prospectId:p.id,conceptId:c.id})});
   const result=await resp.json();
   if(!resp.ok)throw Error(result.error||"agentOS build failed");
   await refresh();
   toast.success(result.alreadyBuilt?"Preview already built":"Static preview verified inside agentOS");
  }catch(e){toast.error(e instanceof Error?e.message:"Build unavailable")}finally{setBuilding(null)}
 }
 if(!concepts.length)return <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#101925] p-8 text-center"><Blocks className="mb-4 text-[#538b83]" size={34}/><h3 className="text-sm font-semibold">No design briefs</h3><p className="mt-2 max-w-[300px] text-xs leading-6 text-[#8799ad]">Advance this prospect through qualification and extraction before preparing concepts.</p></div>;
 return <div>
 <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-[16px] font-semibold">{p.name}</h3><p className="mt-1 text-[11px] text-[#879bab]">Four concept directions · agentOS static preview runtime</p></div><Badge variant="outline" className="border-white/15 text-[#a4d9c9]">{p.stage}</Badge></div>
 <div className="grid gap-4 md:grid-cols-2">{concepts.map((c,i)=><div key={c.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#101925]">
 <div className={`relative h-[170px] overflow-hidden p-5 ${["bg-[#19362f]","bg-[#2d3027]","bg-[#1c3040]","bg-[#33283b]"][i%4]}`}>
 <div className="absolute -right-8 -top-10 size-40 rounded-full border border-white/10"/><div className="absolute -right-2 top-8 size-28 rounded-full border border-white/10"/>
 <div className="text-[10px] font-semibold uppercase tracking-[.3em] text-white/60">DIRECTION {c.variant}</div><div className="mt-8 text-[26px] font-semibold tracking-tighter text-white">{c.direction}</div><div className="mt-2 h-1.5 w-24 rounded-full bg-white/40"/>
 </div>
 <div className="p-4"><p className="min-h-14 text-xs leading-6 text-[#abbccc]">{c.description}</p>
 <div className="mt-4 flex flex-wrap items-center justify-between gap-2">{c.status==="approved"?<Badge className="bg-[#1c503b] text-[#99e9c6]"><Check size={12}/> Approved</Badge>:<span className="text-[10px] text-[#8191a0]">Unbuilt brief</span>}
 <Button variant="outline" size="sm" disabled={busy||building!==null||c.status==="approved"||p.status==="blocked"} onClick={()=>run(p.id,"approve_concept",{conceptId:c.id})} className="border-[#4e8a76]/40 bg-[#1a3732] text-[#9ce7c8]">Approve concept</Button></div>
 {c.status==="approved"&&<div className="mt-3 border-t border-white/[.08] pt-3">{c.html?<div className="flex items-center justify-between gap-2"><span className="text-[11px] text-[#84d7b4]"><Code2 size={13} className="mr-1 inline"/> agentOS verified</span><Button variant="outline" size="sm" className="border-white/15 bg-[#20343c] text-[#b1eccc]" onClick={()=>setPreview(c)}><Eye size={13}/> Open preview</Button></div>:<Button className="w-full bg-[#78e1ba] text-[#0a251c] hover:bg-[#a8f1d7]" disabled={busy||building!==null||p.status==="blocked"} size="sm" onClick={()=>void build(c)}><PlayCircle size={14}/>{building===c.id?"Building in agentOS…":"Build static preview"}</Button>}</div>}
 </div></div>)}</div>
 <p className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/[.04] p-4 text-[11px] leading-5 text-[#cfb889]">agentOS executes this template in an isolated, network-denied VM. These previews are static and unpublished—not model-generated production websites, sent campaigns, or live booking systems.</p>
 <Dialog open={!!preview} onOpenChange={open=>{if(!open)setPreview(null)}}><DialogContent className="max-w-[95vw] border-white/10 bg-[#101925] p-3 text-white sm:max-w-[1100px]"><DialogHeader className="px-3 pt-2"><DialogTitle>{preview?.direction} · Static preview</DialogTitle><DialogDescription>Generated in a Rivet agentOS VM. Sandboxed, not deployed.</DialogDescription></DialogHeader><iframe title="Unpublished concept preview" sandbox="" srcDoc={preview?.html||""} className="h-[65vh] w-full rounded-lg border border-white/10 bg-[#101720]"/></DialogContent></Dialog>
 </div>
}
