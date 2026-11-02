"use client";
import {useMemo,useState} from "react";
import {useMutation} from "convex/react";
import {FileUp,LoaderCircle,Upload} from "lucide-react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {parseImport} from "@/lib/prospect-import";
import {api} from "../../convex/_generated/api";

/** Import businesses from any scraper export (Apify, Outscraper, extensions) or a spreadsheet. */
export function ImportPanel({onDone}:{onDone:()=>void}){
 const importBatch=useMutation(api.imports.importBatch);
 const [text,setText]=useState(""),[trade,setTrade]=useState(""),[city,setCity]=useState(""),[source,setSource]=useState(""),[busy,setBusy]=useState(false);
 const parsed=useMemo(()=>text.trim()?parseImport(text):{rows:[],skipped:0},[text]);
 async function readFile(f:File){
  if(f.size>5_000_000){toast.error("That file is over 5 MB. Split it up.");return;}
  setText(await f.text());
  if(!source)setSource(f.name.replace(/\.[a-z]+$/i,"").slice(0,40));
 }
 async function run(){
  setBusy(true);
  try{
   let added=0,duplicates=0,missingCity=0,blocked=0;
   for(let i=0;i<parsed.rows.length;i+=200){
    const r=await importBatch({rows:parsed.rows.slice(i,i+200),trade:trade.trim()||undefined,city:city.trim()||undefined,source:source.trim()||undefined});
    added+=r.added;duplicates+=r.duplicates;missingCity+=r.missingCity;blocked+=r.blocked;
   }
   toast.success(`Imported ${added} businesses`+(duplicates?` · ${duplicates} already in the pipeline`:"")+(missingCity?` · ${missingCity} skipped without a city`:"")+(blocked?` · ${blocked} on do-not-contact`:""));
   setText("");onDone();
  }catch(e){toast.error(e instanceof Error?e.message:"Import failed")}
  finally{setBusy(false)}
 }
 const preview=parsed.rows.slice(0,4);
 return <div className="space-y-3">
  <p className="text-xs leading-5 text-muted-foreground">Paste or upload a CSV or JSON export from any scraper (Apify Google Maps, Outscraper, a browser extension) or a spreadsheet. Name and city are required; phone, email, website, rating and reviews are picked up when present. Duplicates and do-not-contact matches are skipped.</p>
  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border p-4 text-xs font-medium hover:bg-muted/40"><FileUp size={16}/> Choose a .csv or .json file<input type="file" accept=".csv,.tsv,.json,.jsonl,.txt,text/csv,application/json" className="sr-only" onChange={e=>{const f=e.target.files?.[0];if(f)void readFile(f)}}/></label>
  <Textarea value={text} onChange={e=>setText(e.target.value)} rows={5} placeholder={"name,phone,website,city,rating,reviews\nAcme Painting,(651) 555-0100,acmepainting.com,\"Oakdale, MN\",4.8,112"} className="font-mono text-[11px]"/>
  <div className="grid gap-2 sm:grid-cols-3">
   <Input value={trade} onChange={e=>setTrade(e.target.value)} placeholder="Trade if missing (e.g. Painting)" className="h-9 text-xs"/>
   <Input value={city} onChange={e=>setCity(e.target.value)} placeholder="City if missing (e.g. Oakdale, MN)" className="h-9 text-xs"/>
   <Input value={source} onChange={e=>setSource(e.target.value)} placeholder="Source (e.g. Apify)" className="h-9 text-xs"/>
  </div>
  {!!text.trim()&&<div className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
   <div className="font-semibold">{parsed.rows.length} businesses found{parsed.skipped?` · ${parsed.skipped} rows without a name skipped`:""}</div>
   {preview.map((r,i)=><div key={i} className="mt-1 truncate text-muted-foreground">{r.name} · {r.city||city||"no city"}{r.phone?" · "+r.phone:""}{r.rating!==undefined?" · ★"+r.rating:""}</div>)}
  </div>}
  <Button className="w-full" disabled={busy||!parsed.rows.length} onClick={()=>void run()}>{busy?<LoaderCircle size={15} className="animate-spin"/>:<Upload size={15}/>} Import {parsed.rows.length||""} businesses</Button>
 </div>;
}
