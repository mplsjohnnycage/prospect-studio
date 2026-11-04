import {createClient} from "@convex-dev/better-auth";
import type {QueryCtx,MutationCtx,ActionCtx} from "./_generated/server";
import type {DataModel} from "./_generated/dataModel";
import {components} from "./_generated/api";
import {resolveOwnerSubject} from "../src/lib/owner-gate";

type AnyCtx=QueryCtx|MutationCtx|ActionCtx;
// Lightweight client: avoids importing the full auth setup into every module that needs the owner.
const authClient=createClient<DataModel>(components.betterAuth);

async function accountFacts(ctx:AnyCtx){
 const user=await authClient.safeGetAuthUser(ctx);
 if(!user)return {user:null,providerIds:[] as string[]};
 const linked=await ctx.runQuery(components.betterAuth.adapter.findMany,{
  model:"account",where:[{field:"userId",value:user._id}],paginationOpts:{numItems:20,cursor:null},
 });
 return {user,providerIds:linked.page.map((a:{providerId?:string})=>String(a.providerId??""))};
}

/**
 * The tenant this call acts for. Server-side owner gate: only the verified owner account
 * passes. Other signed-in identities (such as AgentID agents) are refused here, so the
 * rule never depends on the browser UI.
 */
export async function owner(ctx:AnyCtx):Promise<string> {
 const identity=await ctx.auth.getUserIdentity();
 const facts=identity?await accountFacts(ctx):{user:null,providerIds:[] as string[]};
 return resolveOwnerSubject({
  identity,user:facts.user,providerIds:facts.providerIds,
  ownerEmail:process.env.OWNER_EMAIL??"",pilotMode:process.env.CONVEX_PILOT_MODE==="1",
 });
}

/** Owner subject for a signed-in owner, otherwise null (never throws, never applies pilot mode). */
export async function ownerSubjectOrNull(ctx:AnyCtx):Promise<string|null> {
 if(!(await ctx.auth.getUserIdentity()))return null;
 try{return await owner(ctx)}catch{return null}
}
