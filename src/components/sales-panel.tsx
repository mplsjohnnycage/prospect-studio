"use client";
import {useMutation} from "convex/react";
import {api} from "../../convex/_generated/api";
import type {Id} from "../../convex/_generated/dataModel";
// The end-to-end selling surface for one prospect: AI demo, private link, first email,
// replies and the deal outcome. Every send is an explicit two-step click by the owner.
import {useEffect,useState} from "react";
import {toast} from "sonner";
import {Check,Copy,ExternalLink,LoaderCircle,Mail,RefreshCw,Send,Sparkles,Trophy,X} from "lucide-react";
import {Button} from "@/components/ui/button";
import {ProposalBox} from "@/components/pricing-ui";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import type {Concept,Message,Prospect,Reply,Booking,FollowUp} from "@/lib/domain";

async function post<T=Record<string,unknown>>(body:Record<string,unknown>):Promise<T>{
 const r=await fetch("/api/sales",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
 const b=await r.json().catch(()=>({}));
 if(!r.ok)throw Error((b as {error?:string}).error||"Request failed");
 return b as T;
}
const mono="font-mono text-[10px] font-medium uppercase tracking-[.1em] text-muted-foreground";
const card="flex flex-col gap-3 rounded-xl border border-border p-4";
const when=(t?:number)=>t?new Date(t).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"";
const statusTone:Record<string,string>={draft:"bg-muted text-muted-foreground",approved:"bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",sent:"bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",failed:"bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"};

export function SalesPanel({p,concepts,messages,replies,bookings=[],followups=[],sourcesCount,refresh,approve,busy}:{p:Prospect;concepts:Concept[];messages:Message[];replies:Reply[];bookings?:Booking[];followups?:FollowUp[];sourcesCount:number;refresh:()=>Promise<void>;approve:(messageId:string)=>Promise<void>;busy:boolean}){
 const [working,setWorking]=useState<string|null>(null);
 const setBooking=useMutation(api.bookings.setStatus);
 const sendFollowUp=useMutation(api.followups.send),skipFollowUp=useMutation(api.followups.skip);
 const [fuEdits,setFuEdits]=useState<Record<string,string>>({}),[fuConfirm,setFuConfirm]=useState<string|null>(null);
 const [confirm,setConfirm]=useState<string|null>(null);
 const [demoUrl,setDemoUrl]=useState<string>("");
 const [contact,setContact]=useState("");
 const [replyText,setReplyText]=useState<Record<string,string>>({});
 const [amount,setAmount]=useState("");
 const demo=concepts.find(c=>c.status==="approved"&&!!c.html);
 const building=concepts.some(c=>c.building);
 const genError=concepts.find(c=>c.status==="approved")?.generationError;
 useEffect(()=>{if(!building)return;const t=setInterval(()=>{void refresh()},8000);return()=>clearInterval(t);},[building,refresh]);
 const open=messages.find(m=>m.status!=="sent");
 const sent=messages.find(m=>m.status==="sent");
 const email=(p.contact.match(/[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}/i)?.[0]??"").toLowerCase();
 const locked=p.status==="blocked"||p.status==="paused";
 async function act(key:string,fn:()=>Promise<unknown>,ok?:string){
  setWorking(key);setConfirm(null);
  try{await fn();if(ok)toast.success(ok);await refresh();}
  catch(e){toast.error(e instanceof Error?e.message:"Something went wrong");}
  finally{setWorking(null);}
 }
 const spin=(key:string,icon:React.ReactNode)=>working===key?<LoaderCircle size={14} className="animate-spin"/>:icon;

 async function copyLink(){
  await act("share",async()=>{
   const r=await post<{url:string}>({action:"shareDemo",prospectId:p.id});
   setDemoUrl(r.url);
   try{await navigator.clipboard.writeText(r.url);toast.success("Demo link copied");}catch{toast.success("Demo link ready");}
  });
 }

 return <div className="flex flex-col gap-4">
  {/* 1. Demo */}
  <div className={card}>
   <div className="flex items-center justify-between"><span className={mono}>1 · Demo site</span>{demo&&<span className="text-[11px] text-muted-foreground">{demo.generator==="gemini"||demo.generator==="ai"?"AI · "+(demo.model??"Gemini"):"Template"}{demo.qualityScore!==undefined?` · score ${demo.qualityScore}/10`:""}{demo.shared?` · opened ${demo.views??0}×`:""}</span>}</div>
   {building&&<p className="flex items-center gap-1.5 rounded-lg bg-primary/5 px-3 py-2 text-[12px] text-primary"><LoaderCircle size={13} className="animate-spin"/> Building, then an art-director review and one fix pass. This usually takes 3 to 6 minutes; you can keep working.</p>}
   {genError&&!building&&<p className="text-[12px] text-rose-600">Last attempt failed: {genError}</p>}
   {demo?<>
    <p className="text-[13px]">{demo.preset?demo.preset+" style · ":""}{demo.direction} direction{demo.builtAt?" · built "+when(demo.builtAt):""}{demo.lastViewedAt?" · last opened "+when(demo.lastViewedAt):""}</p>
    {!!demo.reviewNotes?.length&&<details className="rounded-lg bg-muted/40 px-3 py-2 text-[12px]"><summary className="cursor-pointer font-medium">Art-director notes ({demo.reviewNotes.length})</summary><ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">{demo.reviewNotes.map((n,i)=><li key={i}>{n}</li>)}</ul></details>}
    <div className="flex flex-wrap gap-2">
     <Button size="sm" variant="outline" disabled={!!working||locked} onClick={()=>void copyLink()}>{spin("share",<Copy size={14}/>)} Copy private link</Button>
     {demoUrl&&<a href={demoUrl+"?preview=1"} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-[12px] font-medium hover:bg-accent"><ExternalLink size={13}/> Open</a>}
     <Button size="sm" variant="ghost" disabled={!!working||building||locked||!sourcesCount} onClick={()=>void act("generate",()=>post({action:"generateDemo",prospectId:p.id}),"Building a new version")}>{spin("generate",<RefreshCw size={14}/>)} Regenerate</Button>
    </div>
    {demoUrl&&<input readOnly value={demoUrl} onFocus={e=>e.currentTarget.select()} className="w-full rounded-md border border-border bg-muted/40 px-2 py-1.5 font-mono text-[11px]"/>}
   </>:<>
    <p className="text-[13px] text-muted-foreground">{sourcesCount?"Gemini builds a custom one-page site from this business's sourced Brand DNA in the background.":"Extract website evidence first (Research tab). Demos use only sourced facts."}</p>
    <Button size="sm" disabled={!!working||building||locked||!sourcesCount} onClick={()=>void act("generate",()=>post({action:"generateDemo",prospectId:p.id}),"Building your demo")}>{working==="generate"?<LoaderCircle size={14} className="animate-spin"/>:<Sparkles size={14}/>} Generate AI demo</Button>
   </>}
  </div>

  {/* 2. First email */}
  <div className={card}>
   <div className="flex items-center justify-between"><span className={mono}>2 · First email</span>{(open??sent)&&<span className={"rounded px-1.5 text-[11px] font-medium capitalize "+statusTone[(open??sent)!.status]}>{(open??sent)!.status}</span>}</div>
   {!email&&<div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
    <p className="text-[12px] text-muted-foreground">No email address on file. Add the business email to send.</p>
    <div className="flex gap-2"><Input value={contact} onChange={e=>setContact(e.target.value)} placeholder="owner@business.com" className="h-8 text-[12px]"/><Button size="sm" variant="outline" disabled={!!working||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim())} onClick={()=>void act("contact",async()=>{const r=await fetch("/api/prospects/"+p.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({contact:p.contact?p.contact+", "+contact.trim():contact.trim()})});if(!r.ok)throw Error("Could not save the email");},"Email saved")}>Save</Button></div>
   </div>}
   {sent&&!open?<div className="text-[13px]"><p>Sent {when(sent.sentAt)} to <span className="font-medium">{sent.recipient}</span>.</p><p className="mt-1 text-[12px] text-muted-foreground">Replies show up below within about 5 minutes.</p></div>
   :open?<>
    <div className="text-[12px] text-muted-foreground">To {email||"(no email yet)"} · from johnnyc@agentmail.to</div>
    <div className="rounded-lg bg-muted/40 p-3"><div className="text-[13px] font-semibold">{open.subject}</div><p className="mt-2 max-h-56 overflow-auto whitespace-pre-line text-[12px] leading-5 text-muted-foreground">{open.body}</p></div>
    {open.status==="failed"&&<p className="text-[12px] text-rose-600">Not sent: {open.sendError}</p>}
    {open.deliveryStatus==="sending"&&<p className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><LoaderCircle size={13} className="animate-spin"/> Sending…</p>}
    <div className="flex flex-wrap gap-2">
     {!open.demoUrl&&demo&&<Button size="sm" variant="outline" disabled={!!working} onClick={()=>void act("prepare",()=>post({action:"prepareEmail",prospectId:p.id}),"Demo link added")}>{spin("prepare",<Sparkles size={14}/>)} Add demo link</Button>}
     {open.status==="draft"&&<Button size="sm" variant="outline" disabled={busy||!!working} onClick={()=>void act("approve",()=>approve(open.id))}><Check size={14}/> Approve</Button>}
     {(open.status==="approved"||open.status==="failed")&&open.deliveryStatus!=="sending"&&(confirm===open.id
      ?<><Button size="sm" disabled={!!working||!email||locked} onClick={()=>void act("send",()=>post({action:"send",outreachId:open.id}),"Sending to "+email)}>{spin("send",<Send size={14}/>)} Confirm send to {email}</Button><Button size="sm" variant="ghost" onClick={()=>setConfirm(null)}><X size={14}/></Button></>
      :<Button size="sm" disabled={!!working||!email||locked} onClick={()=>setConfirm(open.id)}><Send size={14}/> Send</Button>)}
    </div>
    <p className="text-[11px] text-muted-foreground">Edit the wording from the Inbox before approving. Approving a draft doesn&apos;t send it. Sending takes one more click.</p>
   </>
   :<>
    <p className="text-[13px] text-muted-foreground">{demo?"Creates the email with the private demo link, mailing address and opt-out line, then waits for your approval.":"Generate the demo first."}</p>
    <Button size="sm" disabled={!!working||!demo||locked} onClick={()=>void act("prepare",()=>post({action:"prepareEmail",prospectId:p.id}),"Email drafted")}>{spin("prepare",<Mail size={14}/>)} Prepare email</Button>
   </>}
  </div>

  {followups.some(f=>f.status!=="skipped")&&<div className={card}>
   <span className={mono}>Follow-ups</span>
   {followups.filter(f=>f.status!=="skipped").map(f=><div key={f.id} className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
    <div className="flex items-center justify-between text-[12px]"><span className="font-semibold">Follow-up {f.step} {f.step===1?"(day 3)":"(day 7)"}</span><span className="text-muted-foreground">{f.status==="sent"?"Sent "+when(f.sentAt):f.sending?"Sending…":f.status==="failed"?"Failed: "+(f.sendError??""):"Waiting for you"}</span></div>
    {f.status!=="sent"&&<>
     <Textarea value={fuEdits[f.id]??f.body} onChange={e=>setFuEdits(v=>({...v,[f.id]:e.target.value}))} rows={7} className="text-[12px]"/>
     <div className="flex gap-2">
      {fuConfirm===f.id
       ?<><Button size="sm" disabled={f.sending} onClick={()=>void sendFollowUp({id:f.id as Id<"followups">,body:fuEdits[f.id]??f.body}).then(()=>{toast.success("Follow-up sending");setFuConfirm(null);return refresh()}).catch(e=>toast.error(e instanceof Error?e.message.replace(/^.*Uncaught Error:\s*/,"").split("\n")[0]:"Send failed"))}><Send size={14}/> Confirm send</Button><Button size="sm" variant="ghost" onClick={()=>setFuConfirm(null)}>Cancel</Button></>
       :<><Button size="sm" disabled={f.sending} onClick={()=>setFuConfirm(f.id)}><Send size={14}/> Send follow-up</Button><Button size="sm" variant="ghost" onClick={()=>void skipFollowUp({id:f.id as Id<"followups">}).then(refresh)}>Skip</Button></>}
     </div>
    </>}
   </div>)}
  </div>}
  {/* 3. Replies */}
  <div className={card}>
   <span className={mono}>3 · Replies</span>
   {replies.length?replies.map(r=><div key={r.id} className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
    <div className="flex items-center justify-between gap-2 text-[12px]"><span className="truncate font-medium">{r.from}</span><span className="shrink-0 text-muted-foreground">{when(r.receivedAt)}</span></div>
    <p className="whitespace-pre-line rounded-lg bg-muted px-3 py-2 text-[13px] leading-5">{r.text||"(no text)"}</p>
    {r.optOut?<p className="text-[12px] text-rose-600">Asked not to be contacted. Added to the do-not-contact list.</p>
    :r.draft?(r.draft.status==="sent"?<p className="text-[12px] text-emerald-600">Your reply was sent.</p>:<>
     <span className="text-[11px] text-muted-foreground">Suggested reply{r.draft.generator!=="template"?" · "+r.draft.generator:""}{r.draft.status==="failed"?" · last send failed":""}</span>
     <Textarea rows={6} value={replyText[r.id]??r.draft.body} onChange={e=>setReplyText(s=>({...s,[r.id]:e.target.value}))} className="text-[12px]"/>
     {confirm===r.id
      ?<div className="flex gap-2"><Button size="sm" disabled={!!working} onClick={()=>void act("reply"+r.id,()=>post({action:"sendReply",draftId:r.draft!.id,body:replyText[r.id]??r.draft!.body}),"Reply sending")}>{spin("reply"+r.id,<Send size={14}/>)} Confirm send</Button><Button size="sm" variant="ghost" onClick={()=>setConfirm(null)}><X size={14}/></Button></div>
      :<Button size="sm" className="self-start" disabled={!!working} onClick={()=>setConfirm(r.id)}><Send size={14}/> Send reply</Button>}
    </>):<p className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><LoaderCircle size={13} className="animate-spin"/> Drafting a suggested reply…</p>}
   </div>):<p className="text-[13px] text-muted-foreground">{sent?"No replies yet. New replies are checked every 5 minutes.":"Replies to your email will appear here with a suggested response."}</p>}
  </div>

  {/* 4. Close */}
  <div className={card}>
   <span className={mono}>4 · Close</span>
   {bookings.map(b=><div key={b.id} className={"rounded-lg border px-3 py-2 text-[12px] "+(b.status==="new"?"border-primary/40 bg-primary/5":"border-border opacity-70")}>
    <div className="flex items-center justify-between gap-2"><span className="font-semibold">📅 {b.name} asked for a call</span><span className="text-[11px] text-muted-foreground">{when(b.createdAt)}</span></div>
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{b.phone&&<a className="font-medium text-primary underline" href={"tel:"+b.phone.replace(/[^\d+]/g,"")}>{b.phone}</a>}{b.email&&<a className="font-medium text-primary underline" href={"mailto:"+b.email}>{b.email}</a>}<span className="text-muted-foreground">Best time: {b.preferred||"any"}</span></div>
    {b.note&&<p className="mt-1 text-muted-foreground">“{b.note}”</p>}
    {b.status==="new"&&<button className="mt-1 text-[11px] font-medium text-muted-foreground underline" onClick={()=>void setBooking({id:b.id as Id<"bookings">,status:"done"}).then(refresh)}>Mark handled</button>}
   </div>)}
   {p.status==="succeeded"?<p className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-600"><Trophy size={15}/> Won. Time to build the real site.</p>:<>
    <p className="text-[12px] text-muted-foreground">After the call, send a proposal link. They pick a package; you get an alert. Mark won when the deposit is in.</p>
    <ProposalBox prospectId={p.id}/>
    <div className="flex flex-wrap items-center gap-2">
     <div className="relative w-32"><span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">$</span><Input value={amount} onChange={e=>setAmount(e.target.value.replace(/[^\d.]/g,""))} placeholder="Amount" className="h-8 pl-5 text-[12px]"/></div>
     <Button size="sm" disabled={!!working} onClick={()=>void act("won",()=>post({action:"outcome",prospectId:p.id,outcome:"won",amount:amount?Number(amount):undefined}),"Marked won")}>{spin("won",<Trophy size={14}/>)} Mark won</Button>
     <Button size="sm" variant="ghost" disabled={!!working} onClick={()=>void act("lost",()=>post({action:"outcome",prospectId:p.id,outcome:"lost"}),"Marked lost")}>Mark lost</Button>
    </div>
   </>}
  </div>
 </div>;
}
