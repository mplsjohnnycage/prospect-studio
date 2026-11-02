"use client";
import {useState} from "react";
import {useMutation,useQuery} from "convex/react";
import {Copy,FileText,LoaderCircle,Plus,Save,Tag,Trash2} from "lucide-react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {api} from "../../convex/_generated/api";
import type {Id} from "../../convex/_generated/dataModel";
import type {Package} from "@/lib/pricing";

const errMsg=(e:unknown)=>e instanceof Error?e.message.replace(/^.*(?:Uncaught (?:Convex)?Error:|ConvexError:)\s*/,"").split("\n")[0]:"Something went wrong";
const money=(n:number)=>"$"+n.toLocaleString("en-US");
type Row=Package&{includesText:string};
const toRow=(p:Package):Row=>({...p,includesText:p.includes.join("\n")});

/** Settings card: edit the packages used in proposals. */
export function PriceListEditor(){
 const book=useQuery(api.pricing.getPriceBook);
 const save=useMutation(api.pricing.savePriceBook);
 const [edits,setEdits]=useState<Row[]|null>(null),[busy,setBusy]=useState(false);
 const rows=edits??(book?book.packages.map(toRow):null);
 const setRows=(f:(r:Row[])=>Row[])=>setEdits(f(rows??[]));
 const set=(i:number,patch:Partial<Row>)=>setRows(r=>r.map((x,j)=>j===i?{...x,...patch}:x));
 async function onSave(){
  if(!rows)return;
  setBusy(true);
  try{
   const saved=await save({packages:rows.map(r=>({id:r.id,name:r.name,setup:Number(r.setup)||0,monthly:Number(r.monthly)||0,includes:r.includesText.split("\n").map(s=>s.trim()).filter(Boolean),...(r.paymentUrl?.trim()?{paymentUrl:r.paymentUrl.trim()}:{})}))});
   setEdits(saved.map(toRow));
   toast.success("Price list saved");
  }catch(e){toast.error(errMsg(e))}
  finally{setBusy(false)}
 }
 return <div className="rounded-2xl border border-border bg-card p-5 md:col-span-2">
  <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold"><Tag size={16} className="text-primary"/> Price list</div>{book&&!book.custom&&<span className="text-[11px] text-muted-foreground">Starting prices based on 2026 market ranges. Edit to match yours.</span>}</div>
  <p className="mt-1 text-xs text-muted-foreground">Used for proposal links. Add a Stripe (or other) payment link to a package to show a deposit button after the client chooses it.</p>
  {!rows?<div className="p-4 text-xs text-muted-foreground">Loading…</div>:<div className="mt-4 grid gap-3 md:grid-cols-3">
   {rows.map((r,i)=><div key={i} className="flex flex-col gap-2 rounded-xl border border-border p-3">
    <div className="flex gap-2"><Input value={r.name} onChange={e=>set(i,{name:e.target.value})} placeholder="Package name" className="h-8 text-xs font-semibold"/><button aria-label="Remove package" onClick={()=>setRows(rs=>rs.filter((_,j)=>j!==i))} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><Trash2 size={13}/></button></div>
    <div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-medium text-muted-foreground">Setup $<Input inputMode="numeric" value={String(r.setup)} onChange={e=>set(i,{setup:Number(e.target.value.replace(/[^\d]/g,""))||0})} className="mt-1 h-8 text-xs"/></label><label className="text-[10px] font-medium text-muted-foreground">Monthly $<Input inputMode="numeric" value={String(r.monthly)} onChange={e=>set(i,{monthly:Number(e.target.value.replace(/[^\d]/g,""))||0})} className="mt-1 h-8 text-xs"/></label></div>
    <label className="text-[10px] font-medium text-muted-foreground">What&apos;s included (one per line)<Textarea value={r.includesText} onChange={e=>set(i,{includesText:e.target.value})} rows={5} className="mt-1 text-[11px]"/></label>
    <label className="text-[10px] font-medium text-muted-foreground">Deposit payment link (optional)<Input value={r.paymentUrl??""} onChange={e=>set(i,{paymentUrl:e.target.value})} placeholder="https://buy.stripe.com/…" className="mt-1 h-8 text-[11px]"/></label>
   </div>)}
  </div>}
  <div className="mt-3 flex gap-2">
   <Button size="sm" variant="outline" disabled={!rows||rows.length>=6} onClick={()=>setRows(r=>[...r,{id:"",name:"",setup:0,monthly:0,includes:[],includesText:""}])}><Plus size={14}/> Add package</Button>
   <Button size="sm" disabled={busy||!rows} onClick={()=>void onSave()}>{busy?<LoaderCircle size={14} className="animate-spin"/>:<Save size={14}/>} Save price list</Button>
  </div>
 </div>;
}

/** Close card: make a proposal link for this prospect and track it. */
export function ProposalBox({prospectId}:{prospectId:string}){
 const book=useQuery(api.pricing.getPriceBook);
 const proposals=useQuery(api.pricing.forProspect,{prospectId:prospectId as Id<"prospects">});
 const create=useMutation(api.pricing.createProposal);
 const [picked,setPicked]=useState<string[]|null>(null),[note,setNote]=useState(""),[busy,setBusy]=useState(false),[open,setOpen]=useState(false);
 const chosen=picked??book?.packages.map(p=>p.id)??[];
 async function make(){
  setBusy(true);
  try{
   const r=await create({prospectId:prospectId as Id<"prospects">,packageIds:chosen,note:note.trim()||undefined});
   try{await navigator.clipboard.writeText(r.url);toast.success("Proposal link copied");}catch{toast.success("Proposal link ready");}
   setOpen(false);setNote("");
  }catch(e){toast.error(errMsg(e))}
  finally{setBusy(false)}
 }
 return <div className="flex flex-col gap-2">
  {proposals?.map(r=><div key={r.id} className={"rounded-lg border px-3 py-2 text-[12px] "+(r.status==="accepted"?"border-emerald-500/50 bg-emerald-500/5":"border-border")}>
   <div className="flex items-center justify-between gap-2"><span className="font-semibold">{r.status==="accepted"?`✅ Chose ${r.acceptedPackage}`:"Proposal: "+r.packages.join(", ")}</span><span className="text-[11px] text-muted-foreground">{r.views?`opened ${r.views}×`:"not opened yet"}</span></div>
   {r.acceptedBy&&<p className="mt-0.5 text-muted-foreground">{r.acceptedBy.name} · {r.acceptedBy.email}</p>}
   <div className="mt-1 flex gap-3"><button className="text-[11px] font-medium underline" onClick={()=>void navigator.clipboard.writeText(r.url).then(()=>toast.success("Link copied"))}><Copy size={11} className="mr-1 inline"/>Copy link</button><a className="text-[11px] font-medium underline" href={r.url+"?preview=1"} target="_blank" rel="noopener noreferrer">Preview</a></div>
  </div>)}
  {!open?<Button size="sm" variant="outline" onClick={()=>setOpen(true)}><FileText size={14}/> Create proposal link</Button>:<div className="flex flex-col gap-2 rounded-lg border border-border p-3">
   <div className="text-[12px] font-semibold">Packages to offer</div>
   {book?.packages.map(p=><label key={p.id} className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={chosen.includes(p.id)} onChange={e=>setPicked(e.target.checked?[...chosen,p.id]:chosen.filter(x=>x!==p.id))}/>{p.name} · {money(p.setup)}{p.monthly?` + ${money(p.monthly)}/mo`:""}</label>)}
   <Textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Optional note shown on the proposal (e.g. what we agreed on the call)" className="text-[12px]"/>
   <div className="flex gap-2"><Button size="sm" disabled={busy||!chosen.length} onClick={()=>void make()}>{busy?<LoaderCircle size={14} className="animate-spin"/>:<FileText size={14}/>} Create and copy link</Button><Button size="sm" variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button></div>
  </div>}
 </div>;
}
