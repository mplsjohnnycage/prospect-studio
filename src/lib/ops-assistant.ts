type Prospect={id:string;name:string;trade:string;city:string;score:number;stage:string;status:string;qualified?:boolean};
type Draft={id:string;status:string;subject:string};
type Appointment={id:string;startAt:number;title:string;status:string};
type Campaign={key:string;enabled:boolean;lastRunAt:number};
export type OpsContext={prospects:Prospect[];messages:Draft[];appointments:Appointment[];campaigns:Campaign[]};
export type OpsReply={text:string;action?:"autopilot"|"inbox"|"calendar"|"studio"|"prospect";prospectId?:string};
export function answerOperations(raw:string,d:OpsContext):OpsReply{
 const q=raw.trim().toLowerCase();
 const drafts=d.messages.filter(m=>m.status==="draft"),approvals=d.prospects.filter(p=>p.status==="needs_approval");
 if(/\b(send|deliver|blast|email everyone|mail everyone)\b/.test(q))return {text:"Sending is not enabled. Prospect Studio creates unsent drafts only. Each message requires explicit approval, a verified sender integration, and a separate delivery action.",action:"inbox"};
 if(/\b(status|overview|summary|dashboard|how many|pipeline)\b/.test(q)){
  const qualified=d.prospects.filter(p=>p.qualified===true).length;
  const scheduled=d.campaigns.filter(c=>c.enabled).length;
  return {text:d.prospects.length+" prospects tracked; "+qualified+" automatically qualified; "+approvals.length+" awaiting review; "+drafts.length+" unsent draft"+(drafts.length===1?"":"s")+"; "+scheduled+" daily discovery campaign"+(scheduled===1?"":"s")+" enabled. No outbound emails are automatically sent.",action:"autopilot"};
 }
 if(/\b(top|rank|highest|score|leads|opportunit)\b/.test(q)){
  const ranked=[...d.prospects].sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,5);
  return {text:ranked.length?"Highest-scored prospects:\n"+ranked.map((p,i)=>(i+1)+". "+p.name+" — "+p.score+"/100 · "+p.stage+" · "+p.city).join("\n"):"No prospects yet. Use Autopilot to discover and qualify businesses.",action:"autopilot"};
 }
 if(/\b(draft|outreach|mail|inbox|message|reply)\b/.test(q))return {text:drafts.length+" unsent outreach draft"+(drafts.length===1?"":"s")+" awaiting review. Drafts are editable; approval does not send an email. Open the inbox to inspect them.",action:"inbox"};
 if(/\b(calendar|schedul\w*|calls?|meetings?|appointments?|booking)\b/.test(q)){
  const planned=d.appointments.filter(a=>a.status==="planned"&&a.startAt>=Date.now()).sort((a,b)=>a.startAt-b.startAt);
  return {text:planned.length?planned.length+" upcoming planned appointment"+(planned.length===1?"":"s")+". Next: "+planned[0].title+" — "+new Date(planned[0].startAt).toLocaleString()+". These are internal plans, not confirmed Cal.com bookings.":"No upcoming planned appointments. You can schedule an internal call in Calendar.",action:"calendar"};
 }
 if(/\b(demo|design|concept|preview|site|website|build)\b/.test(q))return {text:"Only the top floor(qualified prospect cohort ÷ 10) may receive a verified demo. For fewer than 10 qualified businesses, no demos are generated. Design Studio shows four distinct directions and private form tests; public publishing is disabled.",action:"studio"};
 if(/\b(autopilot|discover|search|find|crawl|research|start|run)\b/.test(q))return {text:"Autopilot uses Firecrawl to research businesses, verify evidence, score, and rank. Daily searches require explicit opt-in. The top 10% of qualified prospects may receive private demo builds and draft-only outreach.",action:"autopilot"};
 if(/\b(review|approval|blocked|pause)\b/.test(q))return {text:approvals.length+" prospects require review. Open the corresponding prospect inspector for source evidence, concepts, and approvals.",action:"autopilot"};
 const matches=d.prospects.filter(p=>p.name.toLowerCase().includes(q)||p.trade.toLowerCase().includes(q)).slice(0,5);
 if(matches.length===1)return {text:matches[0].name+" — score "+matches[0].score+"/100, "+matches[0].stage+" stage, "+matches[0].city+".",action:"prospect",prospectId:matches[0].id};
 return {text:"This is a rule-based operations console connected to your Convex records. A generative model is not connected. Try: status, top leads, review queue, demo policy, scheduled calls, draft emails, or discover prospects."};
}
