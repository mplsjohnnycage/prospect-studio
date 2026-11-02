// Imports business lists from any scraper or spreadsheet (Apify, Outscraper, browser
// extensions, CSV). Rows are normalized in the browser or by the calling agent, then
// deduplicated, checked against the do-not-contact list and added to the owner's pipeline.
import {internalMutation,mutation} from "./_generated/server";
import type {MutationCtx} from "./_generated/server";
import {ConvexError,v} from "convex/values";
import type {Infer} from "convex/values";
import {owner} from "./identity";
import {loadSuppressions} from "./suppressions";
import {isSuppressed} from "../src/lib/suppression";
import {siteKey} from "../src/lib/prospect-signals";
import {publicSite} from "../src/lib/url-safety";
import {businessKey} from "../src/lib/prospect-import";
import {geo} from "./geospatial";

export const importRowV=v.object({
 name:v.string(),trade:v.optional(v.string()),city:v.optional(v.string()),website:v.optional(v.string()),
 phone:v.optional(v.string()),email:v.optional(v.string()),address:v.optional(v.string()),
 rating:v.optional(v.number()),reviews:v.optional(v.number()),sourceUrl:v.optional(v.string()),
 latitude:v.optional(v.number()),longitude:v.optional(v.number()),
});
type Row=Infer<typeof importRowV>;
const MAX_ROWS=250;

function safeUrl(u?:string){if(!u?.trim())return "";try{return publicSite(u.trim());}catch{return "";}}

export async function importRowsFor(ctx:MutationCtx,ownerId:string,rows:Row[],opts:{trade?:string;city?:string;source?:string}){
 if(rows.length>MAX_ROWS)throw new ConvexError("Import up to "+MAX_ROWS+" businesses at a time");
 const source=(opts.source??"import").trim().slice(0,60)||"import";
 const existing=await ctx.db.query("prospects").withIndex("by_owner_updated",q=>q.eq("ownerId",ownerId)).take(2000);
 const sites=new Set(existing.filter(p=>p.website).map(p=>siteKey(p.website)));
 const names=new Set(existing.map(p=>businessKey(p.name,p.city)));
 const blockList=await loadSuppressions(ctx,ownerId);
 const now=Date.now();
 let added=0,duplicates=0,missingCity=0,blocked=0;
 const addedNames:string[]=[];
 for(const r of rows){
  const name=r.name.trim().slice(0,160);
  const city=(r.city??opts.city??"").trim().slice(0,160);
  if(!name)continue;
  if(!city){missingCity++;continue;}
  const website=safeUrl(r.website);
  const key=businessKey(name,city);
  if((website&&sites.has(siteKey(website)))||names.has(key)){duplicates++;continue;}
  const email=r.email?.trim()??"",phone=r.phone?.trim()??"";
  const contact=(email||phone).slice(0,250);
  const isBlocked=!!isSuppressed({contact:[email,phone].filter(Boolean).join(" "),website},blockList);
  if(isBlocked)blocked++;
  const reasons:string[]=[];let score=50;
  if(!website){score+=12;reasons.push("No website found: needs one");}
  if((r.reviews??0)>=20){score+=10;reasons.push(r.reviews+" reviews: established business");}
  if((r.rating??0)>=4.5){score+=8;reasons.push("Rated "+r.rating+": strong reputation to show off");}
  if(contact){score+=5;reasons.push("Contact info on file");}
  const coords=r.latitude!==undefined&&r.longitude!==undefined&&Math.abs(r.latitude)<=90&&Math.abs(r.longitude)<=180?{lat:r.latitude,lng:r.longitude}:null;
  const notes=["Imported from "+source,r.address&&"Address: "+r.address,phone&&"Phone: "+phone,email&&"Email: "+email,r.rating!==undefined&&"Rating: "+r.rating+(r.reviews!==undefined?" ("+r.reviews+" reviews)":""),r.sourceUrl&&"Listing: "+r.sourceUrl].filter(Boolean).join("\n");
  const id=await ctx.db.insert("prospects",{ownerId,name,city,trade:(r.trade??opts.trade??"Other").trim().slice(0,120)||"Other",website,contact,notes:notes.slice(0,4000),score:Math.min(95,score),stage:"Discover",status:isBlocked?"blocked":"queued",source:"import:"+source,qualified:!isBlocked&&score>=70,opportunity:website?undefined:90,scoreReasons:reasons,updatedAt:now,...(coords?{latitude:coords.lat,longitude:coords.lng}:{})});
  if(coords)await geo.insert(ctx,id,{latitude:coords.lat,longitude:coords.lng},{ownerId,trade:(r.trade??opts.trade??"Other").slice(0,120)},Math.min(95,score));
  const listing=safeUrl(r.sourceUrl);
  if(listing){
   const facts=["Business listing for "+name+" (imported from "+source+").",r.trade&&"Category: "+r.trade+".",r.address&&"Address: "+r.address+".",phone&&"Phone: "+phone+".",email&&"Email: "+email+".",r.rating!==undefined&&"Rating: "+r.rating+" out of 5"+(r.reviews!==undefined?" from "+r.reviews+" reviews":"")+".",website&&"Website: "+website+"."].filter(Boolean).join("\n");
   await ctx.db.insert("sources",{ownerId,prospectId:id,url:listing,summary:facts,checksum:"",verifiedAt:now});
  }
  if(website)sites.add(siteKey(website));
  names.add(key);
  added++;
  if(addedNames.length<10)addedNames.push(name);
 }
 if(added)await ctx.db.insert("activities",{ownerId,kind:"imported",summary:"Imported "+added+" businesses from "+source+(duplicates?" ("+duplicates+" already in the pipeline)":""),timestamp:now});
 return {added,duplicates,missingCity,blocked,examples:addedNames};
}

export const importBatch=mutation({
 args:{rows:v.array(importRowV),trade:v.optional(v.string()),city:v.optional(v.string()),source:v.optional(v.string())},
 handler:async(ctx,a)=>importRowsFor(ctx,await owner(ctx),a.rows,{trade:a.trade,city:a.city,source:a.source}),
});

export const importForOwner=internalMutation({
 args:{ownerId:v.string(),rows:v.array(importRowV),trade:v.optional(v.string()),city:v.optional(v.string()),source:v.optional(v.string())},
 handler:async(ctx,a)=>importRowsFor(ctx,a.ownerId,a.rows,{trade:a.trade,city:a.city,source:a.source}),
});
