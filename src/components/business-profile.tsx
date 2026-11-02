"use client";
// Google-Business-Profile-style prospect header and Brand DNA, modeled on the Prospect Studio
// design reference. Every value shown comes from a saved source page and links back to it;
// anything not found is shown as missing rather than filled in.
import {useMemo} from "react";
import {CalendarDays,Clock,Globe2,Layers,Mail,MapPin,Navigation,Phone,Star} from "lucide-react";
import {buildBusinessProfile,type BusinessProfile,type Fact} from "@/lib/business-profile";

type P={name:string;trade:string;city:string;website:string;contact:string};
type Src={url:string;summary:string};

export function useBusinessProfile(p:P,sources:Src[]):BusinessProfile{
 const key=sources.map(s=>s.url+":"+s.summary.length).join("|");
 // eslint-disable-next-line react-hooks/exhaustive-deps
 return useMemo(()=>buildBusinessProfile({name:p.name,trade:p.trade,city:p.city,website:p.website,contact:p.contact},sources),[p.name,p.trade,p.city,p.website,p.contact,key]);
}

const mono="font-mono text-[10px] font-medium uppercase tracking-[.1em]";
export const siteStatusTone:Record<string,string>={
 "Weak site":"bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
 "Needs work":"bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
 "Solid site":"bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
 "Not assessed":"bg-muted text-muted-foreground","No site on file":"bg-muted text-muted-foreground",
};

function Meta({fact,manual}:{fact?:Fact;manual?:boolean}){
 if(fact?.sourceUrl)return <a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer" title={"“"+fact.evidence+"”"} className="shrink-0 text-[12px] font-medium text-emerald-600 hover:underline dark:text-emerald-400">Source ↗</a>;
 if(fact)return <span className="shrink-0 text-[12px] text-muted-foreground">Unlinked</span>;
 if(manual)return <span className="shrink-0 text-[12px] text-muted-foreground">Entered by you</span>;
 return <span className="shrink-0 text-[12px] text-muted-foreground/70">Not found</span>;
}
function Row({icon,children,meta}:{icon:React.ReactNode;children:React.ReactNode;meta:React.ReactNode}){
 return <div className="flex items-center gap-3 border-b border-border py-[9px] text-[13px] last:border-b-0"><span className="flex-none text-muted-foreground">{icon}</span><span className="min-w-0 flex-1 break-words">{children}</span>{meta}</div>;
}

export function contactChannels(prof:BusinessProfile,p:P){
 const manualPhone=!prof.phones.length&&/^[\d()+\-\s.]{7,}$/.test(p.contact.trim())?p.contact.trim():"";
 const manualEmail=!prof.emails.length&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.contact.trim())?p.contact.trim():"";
 return {phone:prof.phones[0]?.value||manualPhone,manualPhone:!!manualPhone,email:prof.emails[0]?.value||manualEmail,manualEmail:!!manualEmail};
}

/** Name, rating line, chips, primary action, five quick actions and the info rows. */
export function ProfileSummary({prof,p,stage,status,onStudio,onCalendar}:{prof:BusinessProfile;p:P;stage:string;status:string;onStudio:()=>void;onCalendar:()=>void}){
 const {phone,manualPhone,email,manualEmail}=contactChannels(prof,p);
 const site=/^https?:\/\//i.test(p.website)?p.website:"";
 const directions="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(prof.address?.value??(p.name+" "+p.city));
 const tile="flex flex-col items-center gap-1.5 rounded-[10px] border border-border bg-background px-1 py-2.5 text-[12px] text-foreground transition-colors hover:bg-accent";
 const off="flex flex-col items-center gap-1.5 rounded-[10px] border border-dashed border-border px-1 py-2.5 text-[12px] text-muted-foreground/60";
 const quick:[string,React.ReactNode,string|undefined,(()=>void)|undefined,boolean][]=[
  ["Website",<Globe2 key="w" size={17}/>,site||undefined,undefined,true],
  ["Call",<Phone key="c" size={17}/>,phone?"tel:"+phone.replace(/[^\d+]/g,""):undefined,undefined,false],
  ["Map",<Navigation key="m" size={17}/>,directions,undefined,true],
  ["Studio",<Layers key="s" size={17}/>,undefined,onStudio,false],
  ["Email",<Mail key="e" size={17}/>,email?"mailto:"+email:undefined,undefined,false],
 ];
 return <>
  <div className="flex flex-col gap-2.5 px-5 pb-4 pt-3">
   <h2 className="m-0 text-[24px] font-semibold leading-tight tracking-[-.025em] [text-wrap:balance]">{prof.name}</h2>
   <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
    {prof.rating?<>
     <span className="font-semibold text-foreground">{prof.rating.score.toFixed(1)}</span>
     <span className="inline-flex" aria-label={prof.rating.score+" out of 5"}>{[1,2,3,4,5].map(i=><Star key={i} size={13} className={i<=Math.round(prof.rating!.score)?"fill-amber-400 text-amber-400":"text-muted-foreground/40"}/>)}</span>
     {prof.rating.count!==undefined&&<span>({prof.rating.count.toLocaleString()})</span>}
     {prof.rating.sourceUrl&&<a href={prof.rating.sourceUrl} target="_blank" rel="noopener noreferrer" title={"“"+prof.rating.evidence+"”"} className="text-[11px] text-emerald-600 hover:underline dark:text-emerald-400">source</a>}
    </>:<span>No rating found</span>}
    <span>·</span><span>{prof.category} · {prof.city}</span>
   </div>
   <div className="flex flex-wrap gap-1.5">
    <span className={"inline-flex h-[22px] items-center rounded-md px-2 text-[12px] font-medium "+siteStatusTone[prof.siteStatus.label]}>{prof.siteStatus.label}</span>
    {prof.trust.slice(0,2).map(t=><span key={t.value} className="inline-flex h-[22px] items-center rounded-md bg-primary/10 px-2 text-[12px] font-medium text-primary">{t.value}</span>)}
    <span className="inline-flex h-[22px] items-center rounded-md border border-border px-2 text-[12px] font-medium">Stage · {stage}</span>
    {status!=="queued"&&<span className="inline-flex h-[22px] items-center rounded-md border border-border px-2 text-[12px] capitalize text-muted-foreground">{status.replaceAll("_"," ")}</span>}
   </div>
   <button onClick={onCalendar} className="mt-1 flex h-10 items-center justify-center gap-2 rounded-[calc(var(--radius)-2px)] bg-primary font-medium text-primary-foreground hover:opacity-90"><CalendarDays size={15}/>Schedule call · attach outreach</button>
   <div className="grid grid-cols-5 gap-1.5">
    {quick.map(([label,icon,href,fn,external])=>fn
     ?<button key={label} onClick={fn} className={tile}>{icon}{label}</button>
     :href?<a key={label} href={href} {...(external?{target:"_blank",rel:"noopener noreferrer"}:{})} className={tile}>{icon}{label}</a>
     :<span key={label} className={off} title={label+" not found in saved sources"}>{icon}{label}</span>)}
   </div>
  </div>
  <div className="border-t border-border px-5 py-1.5">
   <Row icon={<MapPin size={15}/>} meta={<Meta fact={prof.address}/>}>{prof.address?.value??<span className="text-muted-foreground">Address not found</span>}</Row>
   <Row icon={<Phone size={15}/>} meta={<Meta fact={prof.phones[0]} manual={manualPhone}/>}>{phone||<span className="text-muted-foreground">Phone not found</span>}</Row>
   <Row icon={<Globe2 size={15}/>} meta={<span className={"shrink-0 rounded px-1.5 text-[11px] font-medium "+siteStatusTone[prof.siteStatus.label]}>{prof.siteStatus.label}</span>}>{site?<a href={site} target="_blank" rel="noopener noreferrer" className="hover:underline">{site.replace(/^https?:\/\/(www\.)?/,"").replace(/\/$/,"")}</a>:<span className="text-muted-foreground">No website on file</span>}</Row>
   <Row icon={<Clock size={15}/>} meta={<Meta fact={prof.hours}/>}>{prof.hours?<>Hours · {prof.hours.lines.join(" · ")}</>:<span className="text-muted-foreground">Hours not found</span>}</Row>
   <Row icon={<Mail size={15}/>} meta={<Meta fact={prof.emails[0]} manual={manualEmail}/>}>{email||<span className="text-muted-foreground">Email not found</span>}</Row>
  </div>
 </>;
}

/** Overview card: website gap and fit as bars, with the factors behind the gap. */
export function OpportunityCard({prof,fit}:{prof:BusinessProfile;fit:number}){
 const bars:[string,number|undefined][]=[["Website gap",prof.siteStatus.assessed?prof.siteStatus.opportunity:undefined],["Fit",fit]];
 return <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
  <div className="flex flex-wrap items-baseline gap-2"><span className="font-semibold">Opportunity</span><span className={"rounded px-1.5 text-[11px] font-medium "+siteStatusTone[prof.siteStatus.label]}>{prof.siteStatus.label}</span><span className="text-[12px] text-muted-foreground">from {prof.sourcesUsed} saved source{prof.sourcesUsed===1?"":"s"}</span></div>
  {bars.map(([label,val])=><div key={label} className="flex flex-col gap-1.5"><div className="flex justify-between text-[12px]"><span>{label}</span><span className="font-mono text-muted-foreground">{val===undefined?"not assessed":val}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:(val??0)+"%"}}/></div></div>)}
  {prof.siteStatus.factors.length>0&&<ul className="space-y-0.5 text-[12px] text-muted-foreground">{prof.siteStatus.factors.map(f=><li key={f}>• {f}</li>)}</ul>}
 </div>;
}

function Chip({f,label}:{f:Fact;label?:string}){
 return <a href={f.sourceUrl||undefined} target="_blank" rel="noopener noreferrer" title={"“"+f.evidence+"”"} className="inline-flex h-[26px] items-center rounded-[7px] border border-border px-2.5 text-[12px] hover:bg-accent">{label??f.value}</a>;
}

/** Brand DNA tab: palette, voice, services, trust and review language, each traced to a source. */
export function BrandDnaPanel({prof}:{prof:BusinessProfile}){
 const swatches=[0,1,2,3].map(i=>prof.palette[i]);
 return <div className="flex flex-col gap-4">
  <div className="flex flex-col gap-2"><span className={mono+" text-muted-foreground"}>Palette</span>
   <div className="grid grid-cols-4 gap-2">{swatches.map((f,i)=>f
    ?<a key={f.value} href={f.sourceUrl||undefined} target="_blank" rel="noopener noreferrer" title={"“"+f.evidence+"”"} className="flex flex-col gap-1"><div className="h-12 rounded-lg border border-border" style={{background:f.value}}/><span className="font-mono text-[11px] text-muted-foreground">{f.value}</span></a>
    :<div key={"empty"+i} className="flex flex-col gap-1"><div className="h-12 rounded-lg border border-dashed border-border bg-muted/30"/><span className="font-mono text-[11px] text-muted-foreground/60">—</span></div>)}</div>
   {!prof.palette.length&&<span className="text-[12px] text-muted-foreground">Colors not extracted yet. They need the site&apos;s HTML and images; saved sources hold page text only.</span>}
  </div>
  <div className="flex flex-col gap-2"><span className={mono+" text-muted-foreground"}>Voice</span>
   {prof.tone.length?<div className="flex flex-wrap gap-1.5">{prof.tone.map(t=><Chip key={t.label} f={t} label={t.label}/>)}</div>:<span className="text-[12px] text-muted-foreground">No voice signals found in saved sources.</span>}
  </div>
  {prof.services.length>0&&<div className="flex flex-col gap-2"><span className={mono+" text-muted-foreground"}>Services</span><div className="flex flex-wrap gap-1.5">{prof.services.map(f=><Chip key={f.value} f={f}/>)}</div></div>}
  {prof.trust.length>0&&<div className="flex flex-col gap-2"><span className={mono+" text-muted-foreground"}>Trust signals</span><div className="flex flex-wrap gap-1.5">{prof.trust.map(f=><Chip key={f.value} f={f}/>)}</div></div>}
  <div className="flex flex-col gap-2"><span className={mono+" text-muted-foreground"}>From the reviews</span>
   {prof.quote?<><div className="rounded-xl bg-muted px-4 py-3.5 text-[14px] leading-normal [text-wrap:pretty]">{"“"+prof.quote.value+"”"}</div>{prof.quote.sourceUrl&&<a href={prof.quote.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] text-emerald-600 hover:underline dark:text-emerald-400">Source ↗</a>}</>
   :<div className="rounded-xl border border-dashed border-border px-4 py-3.5 text-[12px] text-muted-foreground">No review text in saved sources yet.</div>}
  </div>
  <span className="text-[12px] text-muted-foreground">Extracted from {prof.sourcesUsed} saved source page{prof.sourcesUsed===1?"":"s"}{prof.rating?.count?` and a listing showing ${prof.rating.count.toLocaleString()} reviews`:""}. Not collected yet: {prof.gaps.join(", ")}.</span>
 </div>;
}
