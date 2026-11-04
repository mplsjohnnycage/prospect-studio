// Items 14/16: read public Google Business Profile reviews on the desktop (free, low volume, one place per task).
// Johnny accepted the ToS risk for desktop Maps reading. Untested against live Google pages: selectors may need tuning.
// Returns null when nothing is found, so the pipeline stays unchanged (gated off without review data).
export type ScrapedReviews={prospectId:string;placeUrl:string;rating?:number;count?:number;reviews:{text:string;at?:number;url?:string}[]};
const AGO:Record<string,number>={minute:6e4,hour:36e5,day:864e5,week:6048e5,month:2592e6,year:31536e6};
export function parseAgo(s:string,now=Date.now()):number|undefined{const m=s.match(/(a|an|\d+)\s+(minute|hour|day|week|month|year)s?\s+ago/i);if(!m)return undefined;const n=/^\d+$/.test(m[1])?+m[1]:1;return now-n*AGO[m[2].toLowerCase()];}
export async function scrapeReviews(prospectId:string,input?:{name?:string;city?:string;placeUrl?:string}):Promise<ScrapedReviews|null>{
 const q=input?.placeUrl??(input?.name?"https://www.google.com/maps/search/"+encodeURIComponent(input.name+" "+(input.city??"")):null);
 if(!q)return null;
 const {chromium}=await import("playwright");
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({locale:"en-US"});
  await page.goto(q,{waitUntil:"domcontentloaded",timeout:30_000});
  await page.waitForTimeout(3000+Math.random()*2000);
  const placeUrl=page.url();
  const head=await page.locator('div[role="main"]').first().innerText({timeout:8000}).catch(()=>"");
  const rating=Number(head.match(/(\d\.\d)\s*\n?\s*\(?[\d,]+\)?/)?.[1])||undefined;
  const count=Number((head.match(/\(([\d,]+)\)/)?.[1]??"").replace(/,/g,""))||undefined;
  const tab=page.getByRole("tab",{name:/reviews/i}).first();
  if(await tab.count())await tab.click().catch(()=>undefined);
  await page.waitForTimeout(2500);
  const rows=await page.locator("div[data-review-id]").evaluateAll(els=>els.slice(0,20).map(e=>({text:(e.querySelector("span.wiI7pd") as HTMLElement|null)?.innerText??"",ago:(e.querySelector("span.rsqaWe") as HTMLElement|null)?.innerText??""})));
  const reviews=rows.filter(r=>r.text.trim().length>=10).map(r=>({text:r.text.trim(),at:parseAgo(r.ago),url:placeUrl}));
  if(!reviews.length&&count===undefined)return null;
  return {prospectId,placeUrl,...(rating?{rating}:{}),...(count!==undefined?{count}:{}),reviews};
 }finally{await browser.close();}
}
