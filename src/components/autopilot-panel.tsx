"use client";
import {useState} from "react";
import {Search,ShieldCheck,Sparkles,Mail,LoaderCircle,Database,ExternalLink} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {toast} from "sonner";

type Rank={total:number;qualified:number;demoBudget:number;eligible:{id:string;name:string;score:number;stage:string;website:string}[]};
type Result={search?:{searchHits:number;imported:number;qualified:number;creditsReported:number;skipped:number};ranking?:Rank;built?:{name:string;prospectId:string;draftCreated:boolean}[];errors?:{prospectId:string;message:string}[];remaining?:number;emailsSent:number};
const providers=[
 ["Firecrawl","Search + scrape","Production credential installed",true],
 ["TinyFish","Browser research","AgentMail account; API not wired",false],
 ["Context.dev","Secondary extraction","AgentMail account; API not wired",false],
 ["Keenable","Search cross-check","AgentMail account; API not wired",false],
 ["Sixtyfour","Company enrichment","AgentMail account; API not wired",false],
 ["Notte","Browser verification","AgentMail account; API not wired",false],
 ["SuperSend","Outbound sequencing","AgentMail account; sending disabled",false],
 ["Retrace","Agent run observability","AgentMail account; API not wired",false],
 ["Supermemory","Research continuity","AgentMail account; API not wired",false],
 ["Orange Slice","GTM enrichment","Not connected in AgentMail",false]
] as const;
export function AutopilotPanel({onUpdated}:{onUpdated:()=>Promise<void>}){
 const [trade,setTrade]=useState("Painting"),[city,setCity]=useState("Minneapolis, MN");
 const [busy,setBusy]=useState(false),[phase,setPhase]=useState("");
 const [autoDaily,setAutoDaily]=useState(true);
 const [rank,setRank]=useState<Rank|null>(null),[results,setResults]=useState<string[]>([]),[error,setError]=useState("");
 const [catalogOpen,setCatalogOpen]=useState(false);
 async function request(body:{mode:"discover"|"build"|"schedule";trade:string;city:string;enabled?:boolean}):Promise<Result>{
  const response=await fetch("/api/autopilot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||"Autopilot request failed");
  return data;
 }
 async function start(){
  if(busy||trade.trim().length<3||city.trim().length<3)return;
  setBusy(true);setError("");setResults([]);
  try{
   setPhase("Recording the daily automation preference…");
   await request({mode:"schedule",trade,city,enabled:autoDaily});
   setPhase("Searching and scoring public company websites…");
   const discovered=await request({mode:"discover",trade,city});
   if(!discovered.ranking||!discovered.search)throw Error("Discovery did not return a ranked cohort");
   setRank(discovered.ranking);
   setResults(["Search hits: "+discovered.search.searchHits+"; unique businesses: "+discovered.search.imported+"; qualified in this run: "+discovered.search.qualified,
    "Qualified pool: "+discovered.ranking.qualified+"; top 10% demo slots: "+discovered.ranking.demoBudget]);
   await onUpdated();
   if(!discovered.ranking.demoBudget){setPhase("At least 10 qualified businesses required before generating the first demo.");return;}
   let totalBuilt=0;
   for(let round=0;round<10;round++){
    setPhase("Generating verified sandbox demos and preparing private email drafts…");
    const result=await request({mode:"build",trade,city});
    const newBuilds=result.built||[];
    totalBuilt+=newBuilds.length;
    setResults(p=>[...p,...newBuilds.map(x=>"Verified demo + "+(x.draftCreated?"new draft":"existing draft")+": "+x.name),...(result.errors||[]).map(x=>"Build needs attention: "+x.message)]);
    if(newBuilds.length===0||!result.remaining||result.errors?.length)break;
   }
   await onUpdated();
   setPhase(totalBuilt?"Finished: "+totalBuilt+" new demos processed. No emails sent.":"Ranking saved. Eligible demos were already built or could not be verified.");
   toast.success("Autopilot run recorded; email sending remains disabled");
  }catch(e){setError(e instanceof Error?e.message:"Unable to complete pipeline");setPhase("Stopped safely");toast.error("Autopilot stopped; see details")}
  finally{setBusy(false)}
 }
 return <div className="grid gap-5">
  <div><h2 className="text-xl font-semibold tracking-tight">Prospect Autopilot</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Find companies, verify evidence, qualify, score and rank. Only the top 10% receive verified private demos and unsent email drafts.</p></div>
  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
   <label className="grid gap-1.5 text-xs font-medium">Business type<Input value={trade} onChange={e=>setTrade(e.target.value)} disabled={busy} placeholder="Painting"/></label>
   <label className="grid gap-1.5 text-xs font-medium">Target city / metro<Input value={city} onChange={e=>setCity(e.target.value)} disabled={busy} placeholder="Minneapolis, MN"/></label>
   <Button onClick={()=>void start()} disabled={busy||trade.length<3||city.length<3}>{busy?<LoaderCircle className="size-4 animate-spin"/>:<Search className="size-4"/>}{busy?"Running…":"Run Autopilot"}</Button>
  </div>
  <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" className="size-4 accent-primary" checked={autoDaily} disabled={busy} onChange={e=>setAutoDaily(e.target.checked)}/><span><strong className="text-foreground">Enable daily automatic discovery</strong> at 13:00 UTC, capped at one new verified demo per daily run; Firecrawl and sandbox usage may incur costs.</span></label>
  <div className="rounded-xl border border-border bg-muted/40 px-4 py-3"><div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="size-4 text-primary"/> Strict top-decile policy</div><p className="mt-1 text-xs text-muted-foreground">Demo allowance = floor(qualified, non-paused prospects ÷ 10), evaluated by the backend at preparation and artifact-save time. Less than 10 qualified = zero demos.</p></div>
  {phase&&<div role="status" className="text-xs font-medium text-foreground">{busy&&<LoaderCircle className="mr-1 inline size-3 animate-spin"/>}{phase}</div>}
  {error&&<p role="alert" className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
  {rank&&<div className="grid grid-cols-3 gap-2">{[["Discovered",rank.total],["Qualified",rank.qualified],["Demo slots",rank.demoBudget]].map(([label,value])=><div className="rounded-lg border border-border p-3 text-center" key={String(label)}><div className="text-xl font-semibold">{value}</div><div className="mt-1 text-[10px] text-muted-foreground">{label}</div></div>)}</div>}
  {results.length>0&&<div className="max-h-40 space-y-1 overflow-auto rounded-lg border border-border p-3">{results.map((r,i)=><p className="text-xs leading-5" key={i}>{r}</p>)}</div>}
  <div className="rounded-xl border border-border p-3"><button className="flex w-full items-center justify-between text-left text-xs font-semibold" onClick={()=>setCatalogOpen(x=>!x)}><span className="flex items-center gap-2"><Database className="size-4"/> Research and outreach providers</span><span className="text-muted-foreground">{catalogOpen?"Hide":"View"} catalog</span></button>
   {catalogOpen&&<div className="mt-3 space-y-2">{providers.map(([name,role,status,active])=><div key={name} className="grid grid-cols-[120px_1fr] gap-2 border-t border-border py-2 text-xs"><div className="font-semibold">{name}</div><div><div>{role}</div><div className={active?"text-emerald-600":"text-muted-foreground"}>{status}</div></div></div>)}<p className="text-[11px] text-muted-foreground">AgentMail marketplace accounts do not transfer API keys to this application. Providers remain unavailable until separately configured and verified. Accounts checked November 1, 2026.</p><a target="_blank" rel="noreferrer" href="https://www.agentmail.to/docs/integrations/mcp" className="inline-flex items-center gap-1 text-[11px] text-primary">AgentMail integration docs <ExternalLink size={12}/></a></div>}
  </div>
  <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1"><Sparkles size={13}/> Demo generated only for top decile</span><span className="inline-flex items-center gap-1"><Mail size={13}/> Email drafts only; sending off</span></div>
 </div>;
}
