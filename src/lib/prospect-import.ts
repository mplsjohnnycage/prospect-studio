// Normalizes business lists exported by scrapers (Apify Google Maps, Outscraper, browser
// extensions, spreadsheets) into one row shape the pipeline can import.
export type ImportRow={
 name:string;
 trade?:string;
 city?:string;
 website?:string;
 phone?:string;
 email?:string;
 address?:string;
 rating?:number;
 reviews?:number;
 sourceUrl?:string;
};

const KEYS:Record<keyof ImportRow,string[]>={
 name:["name","title","business","business name","company","company name","businessname"],
 trade:["trade","category","categoryname","category name","type","industry","main category","subtypes"],
 city:["city","town","locality","location"],
 website:["website","site","url website","domain","web","homepage"],
 phone:["phone","phone number","phonenumber","telephone","tel","phoneunformatted"],
 email:["email","emails","email address","email_1","e-mail"],
 address:["address","full_address","full address","street","fulladdress"],
 rating:["rating","totalscore","total score","stars","google rating"],
 reviews:["reviews","reviewscount","reviews count","review count","user_ratings_total","reviews_count"],
 sourceUrl:["sourceurl","source url","google maps url","maps url","place url","url","link","location_link"],
};
const norm=(k:string)=>k.trim().toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ");

/** Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, commas and newlines in quotes. */
export function parseCsv(text:string):Record<string,string>[]{
 const rows:string[][]=[];let row:string[]=[],field="",quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){
   if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else quoted=false;}
   else field+=c;
  }else if(c==='"')quoted=true;
  else if(c===","||c==="\t"){row.push(field);field="";}
  else if(c==="\n"||c==="\r"){if(c==="\r"&&text[i+1]==="\n")i++;row.push(field);field="";if(row.some(x=>x.trim()))rows.push(row);row=[];}
  else field+=c;
 }
 row.push(field);if(row.some(x=>x.trim()))rows.push(row);
 if(rows.length<2)return [];
 const head=rows[0].map(h=>h.replace(/^﻿/,""));
 return rows.slice(1).map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]??""])));
}

function pick(record:Record<string,unknown>,field:keyof ImportRow):unknown{
 const map=new Map(Object.entries(record).map(([k,v])=>[norm(k),v]));
 for(const k of KEYS[field]){const v=map.get(norm(k));if(v!==undefined&&v!==null&&String(v).trim()!=="")return v;}
 return undefined;
}
const str=(v:unknown,max=300)=>{
 if(v===undefined||v===null)return undefined;
 const s=(Array.isArray(v)?v[0]:v);
 const out=String(s??"").trim().slice(0,max);
 return out||undefined;
};
const num=(v:unknown)=>{const n=typeof v==="number"?v:parseFloat(String(v??"").replace(/[^0-9.]/g,""));return Number.isFinite(n)?n:undefined;};

/** City from an address like "123 Main St, Oakdale, MN 55128, United States". */
export function cityFromAddress(address?:string):string|undefined{
 if(!address)return undefined;
 const parts=address.split(",").map(s=>s.trim()).filter(Boolean).filter(p=>!/^(usa|us|united states)$/i.test(p));
 const stateIdx=parts.findIndex(p=>/^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/.test(p));
 if(stateIdx>0)return parts[stateIdx-1]+", "+parts[stateIdx].slice(0,2);
 return parts.length>=2?parts[parts.length-2]:undefined;
}

export function normalizeRecord(record:Record<string,unknown>):ImportRow|null{
 const name=str(pick(record,"name"),160);
 if(!name)return null;
 const address=str(pick(record,"address"),300);
 let website=str(pick(record,"website"),500);
 if(website&&!/^https?:\/\//i.test(website)&&/\./.test(website))website="https://"+website;
 const sourceUrl=str(pick(record,"sourceUrl"),500);
 const email=str(pick(record,"email"),250);
 return {
  name,
  trade:str(pick(record,"trade"),120),
  city:str(pick(record,"city"),160)??cityFromAddress(address),
  website:website&&sourceUrl!==website?website:website,
  phone:str(pick(record,"phone"),60),
  email:email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:undefined,
  address,
  rating:num(pick(record,"rating")),
  reviews:num(pick(record,"reviews")),
  sourceUrl:sourceUrl&&sourceUrl!==website?sourceUrl:undefined,
 };
}

/** Accepts CSV/TSV text, a JSON array, or JSON lines. */
export function parseImport(text:string):{rows:ImportRow[];skipped:number}{
 const t=text.trim();
 let records:Record<string,unknown>[]=[];
 if(t.startsWith("[")||t.startsWith("{")){
  try{
   const parsed=JSON.parse(t) as unknown;
   records=(Array.isArray(parsed)?parsed:(parsed as {items?:unknown[];data?:unknown[]}).items??(parsed as {data?:unknown[]}).data??[parsed]) as Record<string,unknown>[];
  }catch{
   records=t.split(/\r?\n/).filter(Boolean).flatMap(line=>{try{return [JSON.parse(line) as Record<string,unknown>];}catch{return [];}});
  }
 }else records=parseCsv(t);
 const rows:ImportRow[]=[];let skipped=0;
 for(const r of records){const n=r&&typeof r==="object"?normalizeRecord(r):null;if(n)rows.push(n);else skipped++;}
 return {rows,skipped};
}

/** Dedupe key for a business: lowercased name plus the city without its state ("Oakdale, MN" -> "oakdale"). */
export function businessKey(name:string,city:string):string{
 return name.trim().toLowerCase().replace(/[^a-z0-9]+/g," ").trim()+"|"+city.split(",")[0].trim().toLowerCase();
}
