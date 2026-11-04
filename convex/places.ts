// Discovery from Google Places (real, operating businesses). Used instead of web search when
// GOOGLE_MAPS_API_KEY is set. Results go through the same import path as scraper exports:
// dedupe, do-not-contact check, fit score, and a listing source with the verified facts.
import type {ActionCtx} from "./_generated/server";
import {internal} from "./_generated/api";
import {PLACES_FIELDS,placeToRow,placesQueries,type Place} from "../src/lib/places";
import {paidSourceAllowed} from "../src/lib/revenue-engine";

export async function placesDiscovery(ctx:ActionCtx,ownerId:string,trade:string,city:string,maxPages=2){
 const key=process.env.GOOGLE_MAPS_API_KEY;
 if(!key)throw Error("GOOGLE_MAPS_API_KEY is not configured");
 // v3 item 4: Google Places is a paid source; it runs only when ALLOW_PAID_SOURCES=true. Free discovery is scripts/discover-local.mts.
 if(!paidSourceAllowed(process.env))throw Error("Google Places is a paid source and ALLOW_PAID_SOURCES is off. Use free discovery (permits, NPI, SBA, SOS) instead.");
 const queries=placesQueries(trade,city);
 const seen=new Set<string>();
 const rows=[];
 let calls=0;
 for(const textQuery of queries){
  let pageToken:string|undefined;
  for(let page=0;page<maxPages;page++){
   const res=await fetch("https://places.googleapis.com/v1/places:searchText",{
    method:"POST",
    headers:{"content-type":"application/json","X-Goog-Api-Key":key,"X-Goog-FieldMask":PLACES_FIELDS},
    body:JSON.stringify({textQuery,pageSize:20,regionCode:"US",...(pageToken?{pageToken}:{})}),
    signal:AbortSignal.timeout(30_000),
   });
   calls++;
   const data=await res.json().catch(()=>({})) as {places?:Place[];nextPageToken?:string;error?:{message?:string}};
   if(!res.ok)throw Error("Google Places "+res.status+": "+(data.error?.message??"request failed").slice(0,200));
   for(const p of data.places??[]){
    if(!p.id||seen.has(p.id))continue;
    seen.add(p.id);
    const row=placeToRow(p,trade,city);
    if(row)rows.push(row);
   }
   pageToken=data.nextPageToken;
   if(!pageToken)break;
  }
 }
 let imported=0,duplicates=0,blocked=0;
 for(let i=0;i<rows.length;i+=100){
  const r=await ctx.runMutation(internal.imports.importForOwner,{ownerId,rows:rows.slice(i,i+100),trade,city,source:"Google Places"});
  imported+=r.added;duplicates+=r.duplicates;blocked+=r.blocked;
 }
 const withContact=rows.filter(r=>r.phone||r.email).length;
 return {provider:"Google Places",queries:queries.length,searchHits:rows.length,imported,qualified:imported,withContact,skipped:duplicates+blocked,creditsReported:calls,trade,city,emailsSent:0};
}
