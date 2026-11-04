import {httpRouter} from "convex/server";
import {httpAction} from "./_generated/server";
import {AgentMail} from "@agentmail/convex";
import {components,internal} from "./_generated/api";
import { authComponent,createAuth } from "./auth";
import {mcp} from "./mcp";
import {appendHttp as actorEventsAppend} from "./actorEvents";
import {BOOKING_CSP,bookingPage,bookingThanksPage,injectBookingCta,isHumanView,parseBookingForm,parseSegmentExtras} from "../src/lib/booking";
import {segmentFor,systemFor} from "../src/lib/revenue-build";
import {SENDER_BRAND} from "./demos";
import {parseAcceptForm,proposalAcceptedPage,proposalPage} from "../src/lib/pricing";
const http=httpRouter();
authComponent.registerRoutesLazy(http,createAuth);
// MCP endpoint (/mcp) and its OAuth discovery routes for outside agents.
mcp.registerRoutes(http);
const agentmail=new AgentMail(components.agentmail);
http.route({path:"/agentmail/webhook",method:"POST",handler:httpAction(async(ctx,request)=>agentmail.handleWebhook(ctx as unknown as Parameters<typeof agentmail.handleWebhook>[0],request))});
// Secret-gated batch append for Rivet actor streams (env ACTOR_APPEND_SECRET).
http.route({path:"/actor-events/append",method:"POST",handler:actorEventsAppend});
// Public, unguessable demo links for prospects. Sandboxed so demo code cannot reach this origin.
const DEMO_CSP=["sandbox allow-scripts allow-popups allow-forms","default-src 'none'","img-src data: blob:","style-src 'unsafe-inline' https://fonts.googleapis.com","font-src https://fonts.gstatic.com data:","script-src 'unsafe-inline'","form-action 'none'","connect-src 'none'","base-uri 'none'"].join("; ");
const notFound=()=>new Response("<!doctype html><title>Not found</title><p style=\"font:16px system-ui;padding:40px\">This demo link is no longer available.</p>",{status:404,headers:{"content-type":"text/html; charset=utf-8","x-robots-tag":"noindex"}});
http.route({pathPrefix:"/demo/",method:"GET",handler:httpAction(async(ctx,request)=>{
 const url=new URL(request.url);
 const token=url.pathname.slice("/demo/".length).replace(/\/$/,"");
 if(!/^[A-Za-z0-9_-]{24,64}$/.test(token))return notFound();
 const demo=await ctx.runQuery(internal.demos.byToken,{token});
 if(!demo)return notFound();
 await ctx.runMutation(internal.demos.recordView,{conceptId:demo.conceptId,human:isHumanView(request.headers),preview:url.searchParams.get("preview")==="1"});
 const external=process.env.OUTREACH_BOOKING_URL;
 const html=injectBookingCta(demo.html,external||"/book/"+token,!!external);
 return new Response(html,{status:200,headers:{"content-type":"text/html; charset=utf-8","content-security-policy":DEMO_CSP,"x-robots-tag":"noindex, nofollow","referrer-policy":"no-referrer","cache-control":"private, no-store","x-content-type-options":"nosniff"}});
})});
// "Book a free 15-minute call" page behind each private demo link.
const bookHeaders={"content-type":"text/html; charset=utf-8","content-security-policy":BOOKING_CSP,"x-robots-tag":"noindex, nofollow","referrer-policy":"no-referrer","cache-control":"private, no-store","x-content-type-options":"nosniff","x-frame-options":"DENY"};
const bookToken=(request:Request)=>{const t=new URL(request.url).pathname.slice("/book/".length).replace(/\/$/,"");return /^[A-Za-z0-9_-]{24,64}$/.test(t)?t:null;};
http.route({pathPrefix:"/book/",method:"GET",handler:httpAction(async(ctx,request)=>{
 const token=bookToken(request);if(!token)return notFound();
 const page=await ctx.runQuery(internal.bookings.pageContext,{token});if(!page)return notFound();
 return new Response(bookingPage({businessName:page.businessName,senderBrand:SENDER_BRAND,demoHref:"/demo/"+token,system:systemFor(segmentFor(page.trade))}),{status:200,headers:bookHeaders});
})});
http.route({pathPrefix:"/book/",method:"POST",handler:httpAction(async(ctx,request)=>{
 const token=bookToken(request);if(!token)return notFound();
 const page=await ctx.runQuery(internal.bookings.pageContext,{token});if(!page)return notFound();
 const body=(await request.text()).slice(0,8000);
 const system=systemFor(segmentFor(page.trade));
 const base=parseBookingForm(body),extras=parseSegmentExtras(body,system);
 const parsed=!base.ok?base:!extras.ok?{ok:false as const,error:extras.error}:{ok:true as const,value:{...base.value,note:[extras.note,base.value.note].filter(Boolean).join("\n").slice(0,1000)}};
 const demoHref="/demo/"+token;
 if(!parsed.ok){
  if(parsed.spam)return new Response(bookingThanksPage({businessName:page.businessName,senderBrand:SENDER_BRAND,demoHref}),{status:200,headers:bookHeaders});
  const values=Object.fromEntries(new URLSearchParams(body));
  return new Response(bookingPage({businessName:page.businessName,senderBrand:SENDER_BRAND,demoHref,error:parsed.error,values,system}),{status:400,headers:bookHeaders});
 }
 const r=await ctx.runMutation(internal.bookings.create,{token,...parsed.value});
 if(!r.ok)return new Response(bookingPage({businessName:page.businessName,senderBrand:SENDER_BRAND,demoHref,error:r.error,values:parsed.value,system}),{status:429,headers:bookHeaders});
 return new Response(bookingThanksPage({businessName:page.businessName,senderBrand:SENDER_BRAND,demoHref}),{status:200,headers:bookHeaders});
})});
// Proposal links: the packages Johnny picked for a prospect, with a "Choose" button each.
// v3 item 3: one-click opt-out (GET shows a confirm button, POST records it; RFC 8058 List-Unsubscribe-Post compatible).
const optToken=(request:Request)=>{const t=new URL(request.url).pathname.slice("/optout/".length).replace(/\/$/,"");return /^[a-f0-9]{32,48}$/.test(t)?t:null;};
http.route({pathPrefix:"/optout/",method:"GET",handler:httpAction(async(_ctx,request)=>{
 const t=optToken(request);if(!t)return new Response("Not found",{status:404});
 return new Response('<!doctype html><meta name="robots" content="noindex"><form method="post"><p>Stop all emails from MPLS Johnny Cage?</p><button>Unsubscribe</button></form>',{headers:{"content-type":"text/html; charset=utf-8"}});
})});
http.route({pathPrefix:"/optout/",method:"POST",handler:httpAction(async(ctx,request)=>{
 const t=optToken(request);if(!t)return new Response("Not found",{status:404});
 const ok=await ctx.runMutation(internal.outcomes.optOut,{token:t});
 return new Response(ok?"You are unsubscribed. You will not hear from us again.":"Link not recognised",{status:ok?200:404,headers:{"content-type":"text/plain; charset=utf-8"}});
})});
const propToken=(request:Request)=>{const t=new URL(request.url).pathname.slice("/proposal/".length).replace(/\/$/,"");return /^[A-Za-z0-9_-]{24,64}$/.test(t)?t:null;};
http.route({pathPrefix:"/proposal/",method:"GET",handler:httpAction(async(ctx,request)=>{
 const token=propToken(request);if(!token)return notFound();
 const r=await ctx.runQuery(internal.pricing.byToken,{token});if(!r)return notFound();
 if(new URL(request.url).searchParams.get("preview")!=="1")await ctx.runMutation(internal.pricing.recordView,{proposalId:r.proposalId,human:isHumanView(request.headers)});
 if(r.status==="accepted"){const pkg=r.packages.find(x=>x.name===r.acceptedPackage)??r.packages[0];return new Response(proposalAcceptedPage({business:r.business,senderBrand:SENDER_BRAND,pkg}),{status:200,headers:bookHeaders});}
 return new Response(proposalPage({business:r.business,senderBrand:SENDER_BRAND,packages:r.packages,note:r.note,demoHref:r.demoHref}),{status:200,headers:bookHeaders});
})});
http.route({pathPrefix:"/proposal/",method:"POST",handler:httpAction(async(ctx,request)=>{
 const token=propToken(request);if(!token)return notFound();
 const r=await ctx.runQuery(internal.pricing.byToken,{token});if(!r)return notFound();
 const parsed=parseAcceptForm((await request.text()).slice(0,8000),r.packages);
 if(!parsed.ok){
  if(parsed.spam)return new Response("Thanks",{status:200,headers:bookHeaders});
  return new Response(proposalPage({business:r.business,senderBrand:SENDER_BRAND,packages:r.packages,note:r.note,demoHref:r.demoHref,error:parsed.error}),{status:400,headers:bookHeaders});
 }
 const out=await ctx.runMutation(internal.pricing.accept,{token,packageId:parsed.pkg.id,name:parsed.name,email:parsed.email});
 if(!out.ok)return new Response(proposalPage({business:r.business,senderBrand:SENDER_BRAND,packages:r.packages,note:r.note,demoHref:r.demoHref,error:out.error}),{status:400,headers:bookHeaders});
 return new Response(proposalAcceptedPage({business:r.business,senderBrand:SENDER_BRAND,pkg:parsed.pkg}),{status:200,headers:bookHeaders});
})});
export default http;
