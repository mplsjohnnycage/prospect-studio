// AI demo generation (Gemini) and private share links.
// A demo is generated only from facts in saved source pages, checked before it is stored,
// and served publicly only through an unguessable link with noindex and a strict sandbox CSP.
import {action,internalAction,internalMutation,internalQuery} from "./_generated/server";
import type {ActionCtx} from "./_generated/server";
import type {Id} from "./_generated/dataModel";
import {components,internal} from "./_generated/api";
import {v} from "convex/values";
import {RateLimiter,HOUR} from "@convex-dev/rate-limiter";
import {owner} from "./identity";
import {directions} from "../src/lib/domain";
import {buildBusinessProfile} from "../src/lib/business-profile";
import {buildDemoFacts,buildDemoPrompt,buildFixPrompt,buildReviewPrompt,DEMO_REVIEW_SYSTEM,DEMO_SYSTEM_PROMPT,extractHtml,finalizeDemoHtml,parseReview,validateDemoHtml} from "../src/lib/demo-generation";
import {GeminiHttpError,withModelFallback} from "../src/lib/gemini";
import {demoModelList,generateAny} from "../src/lib/llm";
import {logOutcome} from "./outcomes";
import {pickPreset,presetBrief} from "../src/lib/design-presets";
import {tryDemoIR,type IRResult} from "./demoIr";
import {callScript} from "../src/lib/agent-core";
import type {TriggerType} from "../src/lib/revenue-engine";

const limiter=new RateLimiter(components.rateLimiter,{demoGeneration:{kind:"fixed window",rate:30,period:HOUR}});
const LEASE_MS=10*60_000;
export const SENDER_BRAND="Found It. Fix It.";

export const context=internalQuery({
 args:{prospectId:v.id("prospects"),ownerId:v.string()},
 handler:async(ctx,a)=>{
  const p=await ctx.db.get(a.prospectId);
  if(!p||p.ownerId!==a.ownerId)return null;
  const sources=await ctx.db.query("sources").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).take(20);
  return {prospect:p,sources:sources.map(s=>({url:s.url,summary:s.summary}))};
 }
});

/** Pick (or create) the approved direction and take a generation lease on it. */
export const begin=internalMutation({
 args:{prospectId:v.id("prospects"),ownerId:v.string(),claimId:v.string()},
 handler:async(ctx,a)=>{
  const p=await ctx.db.get(a.prospectId);
  if(!p||p.ownerId!==a.ownerId)throw Error("Prospect not found");
  if(p.status==="blocked"||p.status==="paused")throw Error("Prospect is paused or blocked");
  const now=Date.now();
  let concepts=await ctx.db.query("concepts").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).take(40);
  if(!concepts.length){
   for(const d of directions)await ctx.db.insert("concepts",{ownerId:p.ownerId,prospectId:p._id,variant:d.variant,direction:d.direction,description:d.description,status:d.direction==="Conversion"?"approved":"draft",updatedAt:now});
   concepts=await ctx.db.query("concepts").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).take(40);
  }
  let chosen=concepts.find(c=>c.status==="approved");
  if(!chosen){chosen=concepts.find(c=>c.direction==="Conversion")??concepts[0];await ctx.db.patch(chosen._id,{status:"approved",updatedAt:now});}
  if(chosen.buildClaimId&&(chosen.buildLeaseUntil??0)>now)throw Error("A demo is already being generated for this prospect");
  await ctx.db.patch(chosen._id,{buildClaimId:a.claimId,buildLeaseUntil:now+LEASE_MS,generationError:undefined});
  return {conceptId:chosen._id,variant:chosen.variant,direction:chosen.direction,description:chosen.description};
 }
});

export const release=internalMutation({
 args:{conceptId:v.id("concepts"),claimId:v.string()},
 handler:async(ctx,a)=>{
  const c=await ctx.db.get(a.conceptId);
  if(c&&c.buildClaimId===a.claimId)await ctx.db.patch(c._id,{buildClaimId:undefined,buildLeaseUntil:undefined});
 }
});

/** Store the checked HTML. An already-built concept is kept as history and a new version becomes the approved one. */
export const finish=internalMutation({
 args:{prospectId:v.id("prospects"),conceptId:v.id("concepts"),ownerId:v.string(),claimId:v.string(),html:v.string(),sha256:v.string(),model:v.string(),qualityScore:v.optional(v.number()),reviewNotes:v.optional(v.array(v.string())),preset:v.optional(v.string())},
 handler:async(ctx,a)=>{
  const p=await ctx.db.get(a.prospectId),c=await ctx.db.get(a.conceptId);
  if(!p||!c||p.ownerId!==a.ownerId||c.prospectId!==p._id)throw Error("Concept not found");
  if(c.buildClaimId!==a.claimId)throw Error("Generation lease lost; another generation took over");
  const now=Date.now();
  let id=c._id;
  if(c.html){
   // The private link stays the same: it moves to the new version, so the prospect always sees the latest.
   await ctx.db.patch(c._id,{status:"draft",shareToken:undefined,buildClaimId:undefined,buildLeaseUntil:undefined,updatedAt:now});
   id=await ctx.db.insert("concepts",{ownerId:p.ownerId,prospectId:p._id,variant:c.variant,direction:c.direction,description:c.description,status:"approved",html:a.html,sha256:a.sha256,builtAt:now,generator:"ai",model:a.model,qualityScore:a.qualityScore,reviewNotes:a.reviewNotes,preset:a.preset,shareToken:c.shareToken,views:c.views,lastViewedAt:c.lastViewedAt,updatedAt:now});
  }else{
   await ctx.db.patch(c._id,{html:a.html,sha256:a.sha256,builtAt:now,generator:"ai",model:a.model,qualityScore:a.qualityScore,reviewNotes:a.reviewNotes,preset:a.preset,buildClaimId:undefined,buildLeaseUntil:undefined,updatedAt:now});
  }
  if(!["Outreach","Convert","Produce"].includes(p.stage))await ctx.db.patch(p._id,{stage:"Demo",status:"needs_approval",updatedAt:now});
  await ctx.db.insert("activities",{ownerId:p.ownerId,prospectId:p._id,kind:"ai_demo",summary:"Custom demo built by "+a.model+(a.preset?" in the "+a.preset+" style":"")+(a.qualityScore!==undefined?", art-director score "+a.qualityScore+"/10":"")+"; checked, unpublished",timestamp:now});
  return id;
 }
});

async function sha256Hex(text:string){
 const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
 return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

/** Starts generation and returns immediately; the panel shows "Building" until the worker finishes. */
export const generate=action({
 args:{prospectId:v.id("prospects"),forceModel:v.optional(v.boolean())},
 handler:async(ctx,a):Promise<{started:boolean;generator?:string;fallbackReason?:string[]}>=>startDemoFor(ctx,await owner(ctx),a.prospectId,{forceModel:a.forceModel})
});
/** Used by the UI action and by the agent tools. */
export const buildDeterministic=internalMutation({args:{prospectId:v.id("prospects"),ownerId:v.string()},returns:v.any(),
 handler:async(ctx,a)=>{const p=await ctx.db.get(a.prospectId);if(!p||p.ownerId!==a.ownerId)throw Error("Prospect not found");return await tryDemoIR(ctx,p);}});
/** DemoIR first (free, no model, every claim sourced); the model generator is the fallback when the IR can't pass QA. */
export async function startDemoFor(ctx:ActionCtx,user:string,prospectId:Id<"prospects">,opts:{forceModel?:boolean}={}):Promise<{started:boolean;generator?:string;fallbackReason?:string[]}>{
 let fallbackReason:string[]|undefined;
 if(!opts.forceModel){const ir=await ctx.runMutation(internal.demos.buildDeterministic,{prospectId,ownerId:user}) as IRResult;if("built" in ir)return {started:true,generator:"demo-ir"};fallbackReason=ir.issues;}
 if(!process.env.GEMINI_API_KEY)throw Error("DemoIR could not pass QA ("+(fallbackReason??[]).slice(0,2).join("; ")+") and GEMINI_API_KEY is not configured for the model fallback");
 const data=await ctx.runQuery(internal.demos.context,{prospectId,ownerId:user});
 if(!data)throw Error("Prospect not found");
 if(!data.sources.length)throw Error("Research the business website first. Demos are built only from sourced facts.");
 await limiter.limit(ctx,"demoGeneration",{key:user,throws:true});
 const claimId=crypto.randomUUID();
 const job=await ctx.runMutation(internal.demos.begin,{prospectId,ownerId:user,claimId});
 await ctx.scheduler.runAfter(0,internal.demos.generateWorker,{prospectId,ownerId:user,claimId,...job});
 return {started:true,generator:"model",...(fallbackReason?{fallbackReason}:{})};
}

export const failGeneration=internalMutation({
 args:{conceptId:v.id("concepts"),claimId:v.string(),error:v.string()},
 handler:async(ctx,a)=>{
  const c=await ctx.db.get(a.conceptId);
  if(!c||c.buildClaimId!==a.claimId)return;
  await ctx.db.patch(c._id,{buildClaimId:undefined,buildLeaseUntil:undefined,generationError:a.error.slice(0,400)});
  await ctx.db.insert("activities",{ownerId:c.ownerId,prospectId:c.prospectId,kind:"ai_demo_failed",summary:"Demo generation failed: "+a.error.slice(0,200),timestamp:Date.now()});
 }
});

export const generateWorker=internalAction({
 args:{prospectId:v.id("prospects"),ownerId:v.string(),claimId:v.string(),conceptId:v.id("concepts"),variant:v.string(),direction:v.string(),description:v.string(),retry:v.optional(v.number())},
 handler:async(ctx,a)=>{
  try{
   const geminiKey=process.env.GEMINI_API_KEY,zenKey=process.env.OPENCODE_API_KEY;
   if(!geminiKey&&!zenKey)throw Error("GEMINI_API_KEY is not configured");
   const data=await ctx.runQuery(internal.demos.context,{prospectId:a.prospectId,ownerId:a.ownerId});
   if(!data)throw Error("Prospect not found");
   const p=data.prospect;
   const prof=buildBusinessProfile({name:p.name,trade:p.trade,city:p.city,website:p.website,contact:p.contact},data.sources);
   const facts=buildDemoFacts(prof,p.contact);
   const preset=pickPreset(p.trade,a.direction);
   const designBrief=presetBrief(preset,facts.palette);
   // Flash models work on the free tier; Zen models are a fallback when OPENCODE_API_KEY is set. DEMO_MODELS overrides the order.
   const models=demoModelList(process.env.DEMO_MODELS,!!zenKey);
   const job={variant:a.variant,direction:a.direction,description:a.description};
   const gaps=prof.siteStatus.factors;
   // Stay inside Convex's 10-minute action limit no matter how many retries and fallbacks run.
   const deadline=Date.now()+540_000;
   const left=()=>deadline-Date.now();
   const budget=()=>{const l=left();if(l<45_000)throw Error("Ran out of time waiting for the model; try again in a few minutes");return Math.min(240_000,l-15_000);};
   // Free-tier models are often briefly overloaded: when every model is busy, wait and try the chain again.
   const gen=async(system:string,prompt:string,temperature:number,maxOutputTokens:number,timeoutMs:number)=>{
    let last:unknown;
    for(let round=0;round<3;round++){
     try{return await withModelFallback(models,m=>generateAny({model:m,system,prompt,temperature,maxOutputTokens,timeoutMs:Math.min(timeoutMs,Math.max(30_000,left()-20_000)),geminiKey,zenKey}));}
     catch(e){
      last=e;
      if(!(e instanceof GeminiHttpError&&[429,500,503,504].includes(e.status))||left()<120_000)throw e;
      await new Promise(r=>setTimeout(r,round===0?20_000:45_000));
     }
    }
    throw last;
   };
   let errors:string[]=[],html="",model=models[0];
   for(let attempt=1;attempt<=2;attempt++){
    const res=await gen(DEMO_SYSTEM_PROMPT,buildDemoPrompt(facts,job,gaps,errors,designBrief),0.85,24000,budget());
    model=res.model;
    html=extractHtml(res.text);
    const check=validateDemoHtml(html,facts);
    errors=check.ok?[]:check.errors;
    if(check.ok)break;
   }
   if(errors.length)throw Error("Generated page failed checks: "+errors.slice(0,3).join("; "));
   console.log("demo generated",model,html.length,"chars, left ms",left());
   // Art-director review, then one fix pass when it scores under 8.5 and time allows. Best effort:
   // if anything here fails, the already-checked page is kept.
   let qualityScore:number|undefined,reviewNotes:string[]|undefined;
   try{
    if(left()<=100_000)console.log("demo review skipped: only",left(),"ms left");
    if(left()>100_000){
     const r=await gen(DEMO_REVIEW_SYSTEM,buildReviewPrompt(html,facts),0.2,2048,Math.min(90_000,left()-30_000));
     const review=parseReview(r.text);
     console.log("demo review",review?review.score:"unparsed","left ms",left());
     if(review){
      qualityScore=review.score;reviewNotes=review.fixes;
      if(review.score<8.5&&review.fixes.length&&left()>200_000){
       const f=await gen(DEMO_SYSTEM_PROMPT,buildFixPrompt(facts,job,gaps,designBrief,html,review.fixes),0.6,24000,Math.min(240_000,left()-20_000));
       const fixed=extractHtml(f.text);
       if(validateDemoHtml(fixed,facts).ok){html=fixed;model=f.model;reviewNotes=review.fixes.map(x=>"Fixed: "+x);}
      }
     }
    }
   }catch(e){console.warn("demo review skipped:",e instanceof Error?e.message:e);/* keep the checked page */}
   const final=finalizeDemoHtml(html,{businessName:p.name,senderBrand:SENDER_BRAND});
   await ctx.runMutation(internal.demos.finish,{prospectId:a.prospectId,conceptId:a.conceptId,ownerId:a.ownerId,claimId:a.claimId,html:final,sha256:await sha256Hex(final),model,qualityScore,reviewNotes,preset:preset.name});
  }catch(e){
   const msg=e instanceof Error?e.message:"Generation failed";
   const busy=(e instanceof GeminiHttpError&&[429,500,503,504].includes(e.status))||/\((429|503|504)\)|did not answer in time|high demand/i.test(msg);
   const retry=a.retry??0;
   if(busy&&retry<2){
    await ctx.runMutation(internal.demos.failGeneration,{conceptId:a.conceptId,claimId:a.claimId,error:"The AI models are busy right now. Retrying automatically in 5 minutes."});
    await ctx.scheduler.runAfter(5*60_000,internal.demos.retryLater,{prospectId:a.prospectId,ownerId:a.ownerId,retry:retry+1});
   }else{
    await ctx.runMutation(internal.demos.failGeneration,{conceptId:a.conceptId,claimId:a.claimId,error:msg});
   }
  }
 }
});

/** Automatic retry after the models were overloaded. */
export const retryLater=internalAction({
 args:{prospectId:v.id("prospects"),ownerId:v.string(),retry:v.number()},
 handler:async(ctx,a)=>{
  const data=await ctx.runQuery(internal.demos.context,{prospectId:a.prospectId,ownerId:a.ownerId});
  if(!data||data.prospect.status==="blocked"||data.prospect.status==="paused")return;
  const claimId=crypto.randomUUID();
  try{
   const job=await ctx.runMutation(internal.demos.begin,{prospectId:a.prospectId,ownerId:a.ownerId,claimId});
   await ctx.scheduler.runAfter(0,internal.demos.generateWorker,{prospectId:a.prospectId,ownerId:a.ownerId,claimId,...job,retry:a.retry});
  }catch{/* another build is already running */}
 }
});

// ---------- Share links ----------
export const builtConcept=internalQuery({
 args:{prospectId:v.id("prospects"),ownerId:v.string()},
 handler:async(ctx,a)=>{
  const p=await ctx.db.get(a.prospectId);
  if(!p||p.ownerId!==a.ownerId)return null;
  const cs=await ctx.db.query("concepts").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).take(40);
  const c=cs.find(x=>x.status==="approved"&&!!x.html);
  return c?{conceptId:c._id,shareToken:c.shareToken??null}:null;
 }
});
export const setShareToken=internalMutation({
 args:{conceptId:v.id("concepts"),ownerId:v.string(),token:v.string()},
 handler:async(ctx,a)=>{
  const c=await ctx.db.get(a.conceptId);
  if(!c||c.ownerId!==a.ownerId||!c.html)throw Error("Demo not found");
  if(c.shareToken)return c.shareToken;
  await ctx.db.patch(c._id,{shareToken:a.token,updatedAt:Date.now()});
  await ctx.db.insert("activities",{ownerId:c.ownerId,prospectId:c.prospectId,kind:"demo_link",summary:"Private demo link created",timestamp:Date.now()});
  return a.token;
 }
});
export function demoUrl(token:string){
 const base=(process.env.CONVEX_SITE_URL??"").replace(/\/$/,"");
 if(!base)throw Error("CONVEX_SITE_URL unavailable");
 return base+"/demo/"+token;
}
function newToken(){
 const bytes=crypto.getRandomValues(new Uint8Array(24));
 return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
/** Used by the share action and the email preparation action. */
export async function ensureShareUrl(ctx:Pick<ActionCtx,"runQuery"|"runMutation">,prospectId:Id<"prospects">,ownerId:string):Promise<string>{
 const c=await ctx.runQuery(internal.demos.builtConcept,{prospectId,ownerId});
 if(!c)throw Error("Generate a demo first");
 const token=c.shareToken??await ctx.runMutation(internal.demos.setShareToken,{conceptId:c.conceptId,ownerId,token:newToken()});
 return demoUrl(token);
}
export const share=action({
 args:{prospectId:v.id("prospects")},
 handler:async(ctx,a):Promise<{url:string}>=>{
  const user=await owner(ctx);
  return {url:await ensureShareUrl(ctx,a.prospectId,user)};
 }
});

export const byToken=internalQuery({
 args:{token:v.string()},
 handler:async(ctx,a)=>{
  const c=await ctx.db.query("concepts").withIndex("by_share_token",q=>q.eq("shareToken",a.token)).unique();
  if(!c)return null;
  const p=await ctx.db.get(c.prospectId);
  if(!p||p.status==="blocked")return null;
  // Any link the prospect was given always shows the newest approved version.
  const all=await ctx.db.query("concepts").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).take(40);
  const latest=all.filter(x=>x.status==="approved"&&x.html).sort((x,y)=>(y.builtAt??0)-(x.builtAt??0))[0]??(c.html?c:null);
  return latest?.html?{conceptId:latest._id,html:latest.html}:null;
 }
});
export const recordView=internalMutation({
 args:{conceptId:v.id("concepts"),human:v.optional(v.boolean()),preview:v.optional(v.boolean())},
 handler:async(ctx,a)=>{
  // Johnny's own previews (?preview=1) and link scanners/bots are not counted.
  if(a.preview||a.human===false)return;
  const c=await ctx.db.get(a.conceptId);
  if(!c)return;
  const now=Date.now(),prev=c.lastViewedAt;
  const views=(c.views??0)+1;
  await ctx.db.patch(c._id,{views,lastViewedAt:now});
  if(views===1)await logOutcome(ctx,{ownerId:c.ownerId,prospectId:c.prospectId,kind:"viewed",at:now});
  const firstTime=views===1,cameBack=!!prev&&now-prev>24*3600_000;
  if(firstTime||cameBack){
   await ctx.db.insert("activities",{ownerId:c.ownerId,prospectId:c.prospectId,kind:"demo_viewed",summary:firstTime?"Demo opened for the first time":"Came back to the demo ("+views+" views)",timestamp:now});
   await ctx.scheduler.runAfter(0,internal.alerts.demoOpened,{conceptId:c._id,firstTime});
   // View-to-call: put a "call now" card with the script at the top of Johnny's queue.
   const p=await ctx.db.get(c.prospectId);
   if(p){const script=callScript({name:p.name,trade:p.trade,city:p.city,trigger:{type:(p.triggerType??"none") as TriggerType,date:p.triggerDate},gap:(p.scoreReasons??[]).filter(r=>r.startsWith("Gap:")),views});
    await ctx.db.insert("activities",{ownerId:c.ownerId,prospectId:c.prospectId,kind:"call_now",summary:("CALL NOW ("+(firstTime?"first view":"came back, "+views+" views")+")"+(p.contact&&!p.contact.includes("@")?" · "+p.contact:"")+"\n"+script.join("\n")).slice(0,700),timestamp:now});}
  }
 }
});
