// Johnny's price list and per-prospect proposal links. A proposal is a private page (like a
// demo link) showing the packages Johnny picked; the prospect can choose one, which alerts
// Johnny and, if he added a payment link to the package, shows a deposit button.
import {internalMutation,internalQuery,mutation,query} from "./_generated/server";
import type {MutationCtx} from "./_generated/server";
import type {Id} from "./_generated/dataModel";
import {internal} from "./_generated/api";
import {ConvexError,v} from "convex/values";
import {owner} from "./identity";
import {DEFAULT_PACKAGES,validatePackages,type Package} from "../src/lib/pricing";

export const packageV=v.object({id:v.string(),name:v.string(),setup:v.number(),monthly:v.number(),includes:v.array(v.string()),paymentUrl:v.optional(v.string())});

async function packagesFor(ctx:{db:MutationCtx["db"]},ownerId:string):Promise<{packages:Package[];custom:boolean}>{
 const row=await ctx.db.query("priceBook").withIndex("by_owner",q=>q.eq("ownerId",ownerId)).first();
 return row?{packages:row.packages,custom:true}:{packages:DEFAULT_PACKAGES,custom:false};
}

export const getPriceBook=query({args:{},handler:async ctx=>{
 const user=await owner(ctx);
 return await packagesFor(ctx as unknown as {db:MutationCtx["db"]},user);
}});

export const savePriceBook=mutation({
 args:{packages:v.array(packageV)},
 handler:async(ctx,a)=>{
  const user=await owner(ctx);
  let packages:Package[];
  try{packages=validatePackages(a.packages);}catch(e){throw new ConvexError(e instanceof Error?e.message:"Invalid price list");}
  const row=await ctx.db.query("priceBook").withIndex("by_owner",q=>q.eq("ownerId",user)).first();
  if(row)await ctx.db.patch(row._id,{packages,updatedAt:Date.now()});
  else await ctx.db.insert("priceBook",{ownerId:user,packages,updatedAt:Date.now()});
  return packages;
 }
});

function newToken(){
 const bytes=crypto.getRandomValues(new Uint8Array(24));
 return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
export function proposalUrl(token:string){
 const base=(process.env.CONVEX_SITE_URL??"").replace(/\/$/,"");
 return base+"/proposal/"+token;
}

export async function createProposalFor(ctx:MutationCtx,ownerId:string,prospectId:Id<"prospects">,packageIds:string[]|undefined,note:string|undefined){
 const p=await ctx.db.get(prospectId);
 if(!p||p.ownerId!==ownerId)throw new ConvexError("Prospect not found");
 if(p.status==="blocked")throw new ConvexError("This business is on the do-not-contact list");
 const {packages}=await packagesFor(ctx,ownerId);
 const wanted=packageIds?.length?packages.filter(x=>packageIds.some(id=>id.toLowerCase()===x.id||id.toLowerCase()===x.name.toLowerCase())):packages;
 if(!wanted.length)throw new ConvexError("None of those packages are in the price list: "+packages.map(x=>x.name).join(", "));
 const token=newToken(),now=Date.now();
 await ctx.db.insert("proposals",{ownerId,prospectId,token,packages:wanted,note:(note??"").trim().slice(0,1500)||undefined,status:"open",views:0,createdAt:now});
 await ctx.db.insert("activities",{ownerId,prospectId,kind:"proposal_created",summary:"Proposal link created ("+wanted.map(x=>x.name).join(", ")+")",timestamp:now});
 return {url:proposalUrl(token),packages:wanted.map(x=>({name:x.name,setup:x.setup,monthly:x.monthly}))};
}

export const createProposal=mutation({
 args:{prospectId:v.id("prospects"),packageIds:v.optional(v.array(v.string())),note:v.optional(v.string())},
 handler:async(ctx,a)=>createProposalFor(ctx,await owner(ctx),a.prospectId,a.packageIds,a.note),
});
export const createForOwner=internalMutation({
 args:{ownerId:v.string(),prospectId:v.string(),packageIds:v.optional(v.array(v.string())),note:v.optional(v.string())},
 handler:async(ctx,a)=>{
  const pid=ctx.db.normalizeId("prospects",a.prospectId);
  if(!pid)throw new ConvexError("No prospect with that id. Use find_prospects to look it up.");
  return createProposalFor(ctx,a.ownerId,pid,a.packageIds,a.note);
 }
});

export const forProspect=query({
 args:{prospectId:v.id("prospects")},
 handler:async(ctx,a)=>{
  const user=await owner(ctx);
  const rows=await ctx.db.query("proposals").withIndex("by_prospect",q=>q.eq("prospectId",a.prospectId)).order("desc").take(10);
  return rows.filter(r=>r.ownerId===user).map(r=>({id:r._id,url:proposalUrl(r.token),packages:r.packages.map(x=>x.name),status:r.status,views:r.views,acceptedPackage:r.acceptedPackage,acceptedBy:r.acceptedBy,acceptedAt:r.acceptedAt,createdAt:r.createdAt}));
 }
});

export const byToken=internalQuery({
 args:{token:v.string()},
 handler:async(ctx,a)=>{
  const r=await ctx.db.query("proposals").withIndex("by_token",q=>q.eq("token",a.token)).unique();
  if(!r)return null;
  const p=await ctx.db.get(r.prospectId);
  if(!p||p.status==="blocked")return null;
  const concepts=await ctx.db.query("concepts").withIndex("by_prospect",q=>q.eq("prospectId",p._id)).take(20);
  const shared=concepts.filter(c=>c.html&&c.shareToken).sort((x,y)=>(y.builtAt??0)-(x.builtAt??0))[0];
  return {proposalId:r._id,business:p.name,packages:r.packages,note:r.note,status:r.status,acceptedPackage:r.acceptedPackage,demoHref:shared?.shareToken?"/demo/"+shared.shareToken:undefined};
 }
});

export const recordView=internalMutation({
 args:{proposalId:v.id("proposals"),human:v.boolean()},
 handler:async(ctx,a)=>{
  if(!a.human)return;
  const r=await ctx.db.get(a.proposalId);if(!r)return;
  const views=r.views+1,now=Date.now();
  await ctx.db.patch(r._id,{views,viewedAt:now});
  if(views===1){
   await ctx.db.insert("activities",{ownerId:r.ownerId,prospectId:r.prospectId,kind:"proposal_viewed",summary:"Proposal opened for the first time",timestamp:now});
   await ctx.scheduler.runAfter(0,internal.alerts.proposalEvent,{proposalId:r._id,event:"viewed"});
  }
 }
});

export const accept=internalMutation({
 args:{token:v.string(),packageId:v.string(),name:v.string(),email:v.string()},
 handler:async(ctx,a):Promise<{ok:boolean;error?:string}>=>{
  const r=await ctx.db.query("proposals").withIndex("by_token",q=>q.eq("token",a.token)).unique();
  if(!r)return {ok:false,error:"This proposal is no longer available."};
  if(r.status==="accepted")return {ok:true};
  const pkg=r.packages.find(x=>x.id===a.packageId);
  if(!pkg)return {ok:false,error:"Please choose one of the packages."};
  const now=Date.now();
  await ctx.db.patch(r._id,{status:"accepted",acceptedPackage:pkg.name,acceptedBy:{name:a.name,email:a.email},acceptedAt:now});
  const p=await ctx.db.get(r.prospectId);
  if(p&&p.stage!=="Produce")await ctx.db.patch(p._id,{stage:"Convert",status:"needs_approval",updatedAt:now});
  await ctx.db.insert("activities",{ownerId:r.ownerId,prospectId:r.prospectId,kind:"proposal_accepted",summary:a.name+" chose "+pkg.name+" ($"+pkg.setup.toLocaleString("en-US")+(pkg.monthly?" + $"+pkg.monthly+"/mo":"")+")",timestamp:now});
  await ctx.scheduler.runAfter(0,internal.alerts.proposalEvent,{proposalId:r._id,event:"accepted"});
  return {ok:true};
 }
});
