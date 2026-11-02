import {action,internalMutation} from "./_generated/server";
import type {ActionCtx} from "./_generated/server";
import type {Id} from "./_generated/dataModel";
import {FirecrawlClient} from "@firecrawl/firecrawl-convex";
import {RateLimiter,HOUR} from "@convex-dev/rate-limiter";
import {components,internal} from "./_generated/api";
import {v} from "convex/values";
import {owner} from "./identity";
import {publicSite} from "../src/lib/url-safety";
const firecrawl=new FirecrawlClient(components.firecrawl);
const limiter=new RateLimiter(components.rateLimiter,{research:{kind:"fixed window",rate:20,period:HOUR}});
export const save=internalMutation({args:{prospectId:v.id("prospects"),ownerId:v.string(),url:v.string(),summary:v.string()},handler:async(ctx,a)=>{
 const p=await ctx.db.get(a.prospectId);if(!p||p.ownerId!==a.ownerId)throw new Error("Prospect not found");
 await ctx.db.insert("sources",{ownerId:a.ownerId,prospectId:a.prospectId,url:a.url,summary:a.summary.slice(0,15000),checksum:"",verifiedAt:Date.now()});
 await ctx.db.insert("activities",{ownerId:a.ownerId,prospectId:a.prospectId,kind:"research",summary:"Firecrawl extracted a source page for review",timestamp:Date.now()});
 return true;
}});
export const scrapeProspect=action({args:{prospectId:v.id("prospects"),url:v.string()},handler:async(ctx,a)=>scrapeFor(ctx,await owner(ctx),a.prospectId,a.url)});
/** Scrape one public page into the prospect's sources. Used by the UI and by the agent tools. */
export async function scrapeFor(ctx:ActionCtx,user:string,prospectId:Id<"prospects">,url?:string){
 if(!process.env.FIRECRAWL_API_KEY||process.env.FIRECRAWL_API_KEY.startsWith("disabled"))throw new Error("Firecrawl API key not configured");
 const p=await ctx.runQuery(internal.research.lookup,{prospectId,ownerId:user});
 if(!p)throw new Error("Prospect not found");
 const target=(url??"").trim()||p.website;
 if(!target)throw new Error("This prospect has no website to research");
 const safeUrl=publicSite(target);
 await limiter.limit(ctx,"research",{key:user,throws:true});
 const result=await firecrawl.scrape(ctx,safeUrl,{formats:["markdown"],onlyMainContent:true,maxAge:3600000});
 const markdown=typeof result?.markdown==="string"?result.markdown:"";
 await ctx.runMutation(internal.research.save,{prospectId,ownerId:user,url:safeUrl,summary:markdown.slice(0,15000)});
 return {ok:true,characters:markdown.length,url:safeUrl};
}
import {internalQuery} from "./_generated/server";
export const lookup=internalQuery({args:{prospectId:v.id("prospects"),ownerId:v.string()},handler:async(ctx,args)=>{const p=await ctx.db.get(args.prospectId);return p?.ownerId===args.ownerId?{_id:p._id,website:p.website}:null;}});
