import {httpRouter} from "convex/server";
import {httpAction} from "./_generated/server";
import {AgentMail} from "@agentmail/convex";
import {components,internal} from "./_generated/api";
import { authComponent,createAuth } from "./auth";
import {mcp} from "./mcp";
const http=httpRouter();
authComponent.registerRoutesLazy(http,createAuth);
// MCP endpoint (/mcp) and its OAuth discovery routes for outside agents.
mcp.registerRoutes(http);
const agentmail=new AgentMail(components.agentmail);
http.route({path:"/agentmail/webhook",method:"POST",handler:httpAction(async(ctx,request)=>agentmail.handleWebhook(ctx as unknown as Parameters<typeof agentmail.handleWebhook>[0],request))});
// Public, unguessable demo links for prospects. Sandboxed so demo code cannot reach this origin.
const DEMO_CSP=["sandbox allow-scripts allow-popups allow-forms","default-src 'none'","img-src data: blob:","style-src 'unsafe-inline' https://fonts.googleapis.com","font-src https://fonts.gstatic.com data:","script-src 'unsafe-inline'","form-action 'none'","connect-src 'none'","base-uri 'none'"].join("; ");
const notFound=()=>new Response("<!doctype html><title>Not found</title><p style=\"font:16px system-ui;padding:40px\">This demo link is no longer available.</p>",{status:404,headers:{"content-type":"text/html; charset=utf-8","x-robots-tag":"noindex"}});
http.route({pathPrefix:"/demo/",method:"GET",handler:httpAction(async(ctx,request)=>{
 const token=new URL(request.url).pathname.slice("/demo/".length).replace(/\/$/,"");
 if(!/^[A-Za-z0-9_-]{24,64}$/.test(token))return notFound();
 const demo=await ctx.runQuery(internal.demos.byToken,{token});
 if(!demo)return notFound();
 await ctx.runMutation(internal.demos.recordView,{conceptId:demo.conceptId});
 return new Response(demo.html,{status:200,headers:{"content-type":"text/html; charset=utf-8","content-security-policy":DEMO_CSP,"x-robots-tag":"noindex, nofollow","referrer-policy":"no-referrer","cache-control":"private, no-store","x-content-type-options":"nosniff"}});
})});
export default http;
