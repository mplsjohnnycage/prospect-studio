import {mutation,query} from "./_generated/server";
import type {MutationCtx,QueryCtx} from "./_generated/server";
import {v} from "convex/values";
import {owner} from "./identity";
import {isSuppressed,normalizeSuppression,type Suppression} from "../src/lib/suppression";

const LIMIT=2000;

/** Fails closed: an oversized list refuses to draft rather than silently ignoring entries. */
export async function loadSuppressions(ctx:QueryCtx|MutationCtx,ownerId:string):Promise<Suppression[]> {
 const rows=await ctx.db.query("suppressions").withIndex("by_owner",q=>q.eq("ownerId",ownerId)).take(LIMIT+1);
 if(rows.length>LIMIT)throw Error("Do-not-contact list exceeds "+LIMIT+" entries; drafting paused until it is paginated");
 return rows.map(r=>({kind:r.kind,value:r.value}));
}

export const list=query({
 args:{},returns:v.any(),
 handler:async ctx=>{
  const user=await owner(ctx);
  const rows=await ctx.db.query("suppressions").withIndex("by_owner",q=>q.eq("ownerId",user)).order("desc").take(500);
  return rows.map(r=>({id:r._id,kind:r.kind,value:r.value,reason:r.reason??"",createdAt:r.createdAt}));
 }
});

export const add=mutation({
 args:{value:v.string(),reason:v.optional(v.string())},
 returns:v.object({added:v.boolean(),kind:v.string(),value:v.string(),blockedProspects:v.number()}),
 handler:async(ctx,a)=>{
  const user=await owner(ctx);
  const entry=normalizeSuppression(a.value);
  if(!entry)throw Error("Enter a valid email address, domain or website");
  const existing=await ctx.db.query("suppressions").withIndex("by_owner_value",q=>q.eq("ownerId",user).eq("value",entry.value)).first();
  const now=Date.now();
  if(!existing)await ctx.db.insert("suppressions",{ownerId:user,kind:entry.kind,value:entry.value,reason:(a.reason??"").slice(0,300)||undefined,createdAt:now});
  // Block every matching prospect so no pipeline path (ranking, demos, drafts) touches them.
  const prospects=await ctx.db.query("prospects").withIndex("by_owner_updated",q=>q.eq("ownerId",user)).take(1000);
  let blocked=0;
  for(const p of prospects){
   if(p.status==="blocked"||!isSuppressed({contact:p.contact,website:p.website},[entry]))continue;
   await ctx.db.patch(p._id,{status:"blocked",updatedAt:now});
   await ctx.db.insert("activities",{ownerId:user,prospectId:p._id,kind:"do_not_contact",summary:"Added to the do-not-contact list ("+entry.value+"); prospect blocked",timestamp:now});
   blocked++;
  }
  return {added:!existing,kind:entry.kind,value:entry.value,blockedProspects:blocked};
 }
});

export const remove=mutation({
 args:{id:v.id("suppressions")},returns:v.boolean(),
 handler:async(ctx,a)=>{
  const user=await owner(ctx);
  const row=await ctx.db.get(a.id);
  if(!row||row.ownerId!==user)throw Error("Entry not found");
  await ctx.db.delete(a.id);
  return true;
 }
});
