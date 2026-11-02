import {query} from "./_generated/server";

/** Public, data-free backend availability probe. Never returns tenant data. */
export const ping=query({args:{},handler:async()=>({ok:true})});

/** Which integrations are configured on this deployment (booleans only, owner-only). */
export const config=query({args:{},handler:async ctx=>{
 const identity=await ctx.auth.getUserIdentity();
 if(!identity)return null;
 const has=(k:string)=>!!process.env[k]?.trim();
 return {
  gemini:has("GEMINI_API_KEY"),
  agentmail:has("AGENTMAIL_API_KEY")&&has("AGENTMAIL_INBOX_ID"),
  postalAddress:has("OUTREACH_POSTAL_ADDRESS"),
  firecrawl:(process.env.FIRECRAWL_API_KEY??"").startsWith("fc-"),
  places:has("GOOGLE_MAPS_API_KEY"),
  zen:has("OPENCODE_API_KEY"),
  bookingUrl:has("OUTREACH_BOOKING_URL"),
 };
}});
