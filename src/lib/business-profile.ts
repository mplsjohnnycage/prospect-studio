// Builds a Google-Business-Profile-style view of a prospect from the source pages we already
// saved. Every value carries the URL it came from plus the exact snippet, and anything that was
// not found in a source is reported as a gap. Nothing here invents or estimates data.
import {assessOpportunity,extractContacts,siteKey} from "./prospect-signals";

export type SourceDoc={url:string;summary:string};
export type Fact={value:string;sourceUrl:string;evidence:string};
export type SiteStatusLabel="No site on file"|"Not assessed"|"Weak site"|"Needs work"|"Solid site";
export type BusinessProfile={
 name:string;category:string;city:string;website?:string;
 rating?:Fact&{score:number;count?:number};
 address?:Fact;
 phones:Fact[];emails:Fact[];
 hours?:Fact&{lines:string[]};
 services:Fact[];trust:Fact[];tone:(Fact&{label:string})[];
 palette:Fact[];quote?:Fact;
 siteStatus:{label:SiteStatusLabel;opportunity:number;assessed:boolean;factors:string[]};
 sourcesUsed:number;gaps:string[];
};

const PHONE_RE=/(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?([2-9]\d{2})[\s.-]?(\d{4})\b/g;
const ADDRESS_RE=/\b\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Za-z0-9.'\- ]{2,40}?\s(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pkwy|Parkway|Hwy|Highway|Pl|Place|Cir|Circle)\b\.?(?:,?\s+(?:Suite|Ste|Unit|#)\s*[A-Za-z0-9-]+)?(?:,?\s+[A-Za-z .'-]{2,30},?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?)?/;
const DAY="(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
const HOURS_RE=new RegExp(`\\b${DAY}\\b(?:\\s*[-–—to&,]+\\s*${DAY}\\b)?\\s*[:\\-–]?\\s*(?:\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?\\s*[-–—to]+\\s*\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)|open\\s*24\\s*hours|closed)`,"gi");
const RATING_RE=/(\d(?:\.\d)?)\s*(?:\/\s*5\b|stars?\b|★)/i;
const QUOTE_RE=/[\u201c"]([^\u201d"\n]{40,260})[\u201d"]/g;
const BLOCKQUOTE_RE=/^>\s*(.{40,260})$/gm;
const REVIEW_CONTEXT=/\b(?:reviews?|testimonials?|customers?|clients?|homeowners?|stars?)\b|\u2605/i;
const HEX_RE=/(?<![&\w])#([0-9a-f]{6})\b/gi;
const REVIEWS_RE=/\(?\b(\d[\d,]{0,6})\s*(?:google\s+)?(?:reviews?|ratings?)\b\)?/i;

const TRUST:[RegExp,string][]=[
 [/\blicensed\b/i,"Licensed"],[/\binsured\b/i,"Insured"],[/\bbonded\b/i,"Bonded"],
 [/\bfamily[- ]owned\b/i,"Family owned"],[/\blocally[- ]owned\b/i,"Locally owned"],
 [/\b(?:free\s+(?:estimates?|quotes?))\b/i,"Free estimates"],[/\b(?:warranty|guarantee[d]?)\b/i,"Warranty or guarantee"],
 [/\b(\d{1,2})\+?\s+years?(?:\s+of)?\s+experience\b/i,"Years of experience"],
 [/\bbbb\b|better business bureau/i,"BBB mentioned"],[/\b24\s*\/\s*7\b|\b24[- ]hour\b/i,"24/7 availability"],
];
const TONE:[RegExp,string][]=[
 [/\b(?:family|neighbor|neighbour|community|friendly)\b/i,"Friendly and local"],
 [/\b(?:premium|luxury|high[- ]end|craftsmanship|custom|detail[- ]oriented)\b/i,"Premium craft"],
 [/\b(?:affordable|competitive pricing|budget|value|free estimate)\b/i,"Value-focused"],
 [/\b(?:licensed|insured|certified|guarantee|trusted|reliable|professional)\b/i,"Trust and professionalism"],
 [/\b(?:same[- ]day|emergency|fast|prompt|on[- ]time|24\s*\/\s*7)\b/i,"Fast and responsive"],
];

function snippet(text:string,index:number,length:number):string{
 const start=Math.max(0,index-60);
 return text.slice(start,Math.min(text.length,index+length+60)).replace(/\s+/g," ").trim().slice(0,200);
}
const safeUrl=(u:string)=>/^https?:\/\//i.test(u)?u:"";
function firstMatch<T>(sources:SourceDoc[],fn:(text:string,url:string)=>T|undefined):T|undefined{
 for(const s of sources){const r=fn(s.summary,s.url);if(r!==undefined)return r;}
 return undefined;
}

function findServices(text:string,url:string):Fact[]{
 const out:Fact[]=[];
 const lines=text.split(/\r?\n/);
 let inServices=false;
 for(let i=0;i<lines.length;i++){
  const line=lines[i].trim();
  if(/^#{1,4}\s*(?:our\s+)?(?:services|what we do|specialt(?:y|ies))\b/i.test(line)||/^(?:our\s+)?services\s*:?$/i.test(line)){inServices=true;continue;}
  if(inServices&&/^#{1,4}\s/.test(line))break;
  if(!inServices)continue;
  const m=line.match(/^(?:[-*•]|\d+\.)\s+\**([^*\n]{3,50})\**\s*$/);
  if(m){out.push({value:m[1].replace(/\[|\]\([^)]*\)/g,"").trim(),sourceUrl:safeUrl(url),evidence:line.slice(0,160)});}
  if(out.length>=8)break;
 }
 return out;
}

export function buildBusinessProfile(p:{name:string;trade:string;city:string;website?:string;contact?:string},sources:SourceDoc[]):BusinessProfile{
 const docs=sources.filter(s=>s.summary&&s.summary.trim().length>0);
 const gaps:string[]=[];

 const addressHit=firstMatch(docs,(t,u)=>{const m=t.match(ADDRESS_RE);return m&&m.index!==undefined&&(/\d{5}/.test(m[0])||/,/.test(m[0]))?{value:m[0].replace(/\s+/g," ").trim(),sourceUrl:safeUrl(u),evidence:snippet(t,m.index,m[0].length)}:undefined;});

 const phones:Fact[]=[],emails:Fact[]=[];
 for(const s of docs){
  const c=extractContacts(s.summary,p.website??"");
  for(const phone of c.phones){
   if(phones.some(x=>x.value===phone))continue;
   for(const m of s.summary.matchAll(PHONE_RE)){
    if(`(${m[1]}) ${m[2]}-${m[3]}`===phone){phones.push({value:phone,sourceUrl:safeUrl(s.url),evidence:snippet(s.summary,m.index??0,m[0].length)});break;}
   }
  }
  for(const email of c.emails){
   if(emails.some(x=>x.value===email))continue;
   const idx=s.summary.toLowerCase().indexOf(email);
   emails.push({value:email,sourceUrl:safeUrl(s.url),evidence:snippet(s.summary,Math.max(0,idx),email.length)});
  }
 }

 const hours=firstMatch(docs,(t,u)=>{
  const matches=[...t.matchAll(HOURS_RE)];
  if(!matches.length)return undefined;
  const lines=[...new Set(matches.map(m=>m[0].replace(/\s+/g," ").trim()))].slice(0,7);
  return {value:lines.join("; "),lines,sourceUrl:safeUrl(u),evidence:snippet(t,matches[0].index??0,matches[0][0].length)};
 });

 const rating=firstMatch(docs,(t,u)=>{
  const r=t.match(RATING_RE);
  if(!r||r.index===undefined)return undefined;
  const score=Number(r[1]);
  if(!(score>=1&&score<=5))return undefined;
  const window=t.slice(Math.max(0,r.index-80),r.index+160);
  const rc=window.match(REVIEWS_RE);
  const count=rc?Number(rc[1].replace(/,/g,"")):undefined;
  return {value:`${score} out of 5${count?` from ${count} reviews`:""}`,score,count,sourceUrl:safeUrl(u),evidence:snippet(t,r.index,r[0].length)};
 });

 const services=firstMatch(docs,(t,u)=>{const f=findServices(t,u);return f.length?f:undefined;})??[];

 const trust:Fact[]=[];
 for(const [re,label] of TRUST){
  const hit=firstMatch(docs,(t,u)=>{const m=t.match(re);return m&&m.index!==undefined?{value:label==="Years of experience"?`${m[1]}+ years of experience`:label,sourceUrl:safeUrl(u),evidence:snippet(t,m.index,m[0].length)}:undefined;});
  if(hit)trust.push(hit);
 }
 const tone:(Fact&{label:string})[]=[];
 for(const [re,label] of TONE){
  const hit=firstMatch(docs,(t,u)=>{const m=t.match(re);return m&&m.index!==undefined?{label,value:m[0].toLowerCase(),sourceUrl:safeUrl(u),evidence:snippet(t,m.index,m[0].length)}:undefined;});
  if(hit)tone.push(hit);
 }

 const quote=firstMatch(docs,(t,u)=>{
  for(const m of [...t.matchAll(QUOTE_RE),...t.matchAll(BLOCKQUOTE_RE)]){
   const at=m.index??0;
   const around=t.slice(Math.max(0,at-250),at+m[0].length+250);
   if(REVIEW_CONTEXT.test(around))return {value:m[1].trim(),sourceUrl:safeUrl(u),evidence:snippet(t,at,m[0].length)};
  }
  return undefined;
 });
 const palette:Fact[]=[];
 for(const s of docs){
  for(const m of s.summary.matchAll(HEX_RE)){
   const hex="#"+m[1].toLowerCase();
   if(palette.some(x=>x.value===hex))continue;
   palette.push({value:hex,sourceUrl:safeUrl(s.url),evidence:snippet(s.summary,m.index??0,m[0].length)});
   if(palette.length>=4)break;
  }
  if(palette.length>=4)break;
 }

 // Site status: judge the business's own site when we have it, else the longest source.
 const host=p.website?siteKey(p.website):"";
 const own=docs.find(d=>host&&siteKey(d.url)===host);
 const judged=own??[...docs].sort((a,b)=>b.summary.length-a.summary.length)[0];
 let siteStatus:BusinessProfile["siteStatus"];
 if(!p.website&&!own)siteStatus={label:"No site on file",opportunity:0,assessed:false,factors:["No website on file for this business"]};
 else if(!judged)siteStatus={label:"Not assessed",opportunity:0,assessed:false,factors:["No saved source page to judge"]};
 else{
  const o=assessOpportunity(judged.summary);
  const label:SiteStatusLabel=!o.assessed?"Not assessed":o.opportunity>=60?"Weak site":o.opportunity>=30?"Needs work":"Solid site";
  siteStatus={label,opportunity:o.opportunity,assessed:o.assessed,factors:o.reasons.map(r=>r.replace(/^Opportunity:\s*/,""))};
 }

 if(!addressHit)gaps.push("Address");
 if(!phones.length&&!p.contact)gaps.push("Phone");
 if(!hours)gaps.push("Hours");
 if(!rating)gaps.push("Rating and reviews");
 if(!services.length)gaps.push("Services list");
 if(!quote)gaps.push("Review quotes");
 gaps.push("Photos",palette.length?"Logo and fonts":"Logo, colors and fonts (need the site's HTML, not just its text)");

 return {
  name:p.name,category:p.trade,city:p.city,website:p.website||undefined,
  rating,address:addressHit,phones,emails,hours,services,trust,tone,palette,quote,siteStatus,sourcesUsed:docs.length,gaps,
 };
}
