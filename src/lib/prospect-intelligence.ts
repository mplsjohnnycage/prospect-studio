export type SearchHit={url:string;title?:string;description?:string;markdown?:string};
export type DiscoveredBusiness={name:string;website:string;trade:string;city:string;description:string;markdown:string;url:string};
export type ScoredBusiness={score:number;qualified:boolean;reasons:string[];evidence:string[]};
const directoryDomains=new Set(["yelp.com","angi.com","angieslist.com","thumbtack.com","homeadvisor.com","bbb.org","yellowpages.com","facebook.com","instagram.com","linkedin.com","nextdoor.com","google.com","mapquest.com","houzz.com","indeed.com","reddit.com","tiktok.com","pinterest.com","youtube.com"]);
const genericTitle=/^(top\s+\d+|best\s+\d+|list of|directory|reviews? of|jobs? at|near me|find the best|compare|ranked)/i;
export function candidateFromSearch(hit:SearchHit,trade:string,city:string):DiscoveredBusiness|null {
 try {
  const u=new URL(hit.url);
  if(u.protocol!=="https:"||u.username||u.password||u.port)return null;
  const host=u.hostname.toLowerCase().replace(/^www\./,"");
  if(directoryDomains.has(host)||[...directoryDomains].some(d=>host.endsWith("."+d)))return null;
  if(!host.includes(".")||host==="localhost"||/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))return null;
  if(/\.(?:pdf|jpg|png|docx|zip)$/i.test(u.pathname))return null;
  const title=(hit.title||"").replace(/\s+/g," ").trim();
  const desc=(hit.description||"").slice(0,1000).trim();
  const name=title.split(/\s[|–—]\s/)[0].replace(/\s+-\s+(home|homepage|services)$/i,"").trim();
  if(name.length<3||name.length>130||genericTitle.test(name)||/^(home|homepage|about us|contact us)$/i.test(name))return null;
  return {name,website:u.origin+"/",trade:trade.slice(0,90),city:city.slice(0,160),description:desc,markdown:(hit.markdown||"").slice(0,8000),url:hit.url};
 }catch{return null;}
}
export function qualifyBusiness(p:DiscoveredBusiness):ScoredBusiness{
 const content=(p.description+" "+p.markdown).toLowerCase();
 const tokens=p.trade.toLowerCase().split(/\s+/).filter(x=>x.length>3);
 const cityToken=p.city.split(",")[0].trim().toLowerCase();
 const tradeMatch=tokens.some(t=>content.includes(t))||tokens.some(t=>p.name.toLowerCase().includes(t));
 const localMatch=Boolean(cityToken)&&content.includes(cityToken);
 const liveEvidence=p.markdown.trim().length>=120;
 const contactEvidence=/\b(?:contact|call us|call today|request (?:a )?quote|free estimate|email us|schedule|book now)\b/i.test(content);
 const detailsEvidence=/\b(?:services|projects|portfolio|our work|about us|residential|commercial|gallery)\b/i.test(content);
 const reasons:string[]=[];
 let score=20;
 if(tradeMatch){score+=25;reasons.push("Trade mentioned in search/site evidence");}
 if(localMatch){score+=20;reasons.push("Local service area referenced");}
 if(liveEvidence){score+=15;reasons.push("Business website content extracted");}
 if(contactEvidence){score+=10;reasons.push("Customer contact/quote pathway mentioned");}
 if(detailsEvidence){score+=10;reasons.push("Services or work examples mentioned");}
 const qualified=Boolean(p.name)&&Boolean(p.website)&&tradeMatch&&(localMatch||liveEvidence);
 if(!qualified)reasons.push("Insufficient verified trade/local evidence; held for review");
 return {score:Math.min(100,score),qualified,reasons,evidence:[p.url,"Search snippet: "+p.description.slice(0,220),...(liveEvidence?["Site excerpt: "+p.markdown.slice(0,260)]:[])]};
}
export type RankedProspect={id:string;score:number;qualified:boolean;paused:boolean};
export function selectDemoEligible<T extends RankedProspect>(items:T[]):T[]{
 const pool=items.filter(p=>p.qualified&&!p.paused).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 return pool.slice(0,Math.floor(pool.length/10));
}
export function composeOutreach(p:{name:string;trade:string;city:string;findings:string[]}):{subject:string;body:string}{
 const safe=p.findings.filter(x=>!x.startsWith("Insufficient")).slice(0,2).join("; ");
 return {subject:"A private website concept for "+p.name,body:"Hello,\n\nI researched "+p.name+" in "+p.city+" and prepared a private, unpublicized website concept for your "+p.trade+" business.\n\nResearch signals used: "+(safe||"publicly available company information")+".\n\nIf you'd like, I can share the concept for your feedback. Nothing has been published on your behalf.\n\nBest regards,\nMPLS Johnny Cage"};
}
