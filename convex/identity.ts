import type {QueryCtx,MutationCtx,ActionCtx} from "./_generated/server";

type Identity={subject:string;email?:string|null;tokenIdentifier?:string};

/** Owner addresses come only from server env: OWNER_EMAIL plus optional OWNER_SOCIAL_EXTRA_EMAILS (comma list). */
export function ownerEmails():string[]{
 const list=[process.env.OWNER_EMAIL??"",...(process.env.OWNER_SOCIAL_EXTRA_EMAILS??"").split(",")];
 return list.map(e=>e.trim().toLowerCase()).filter(Boolean);
}

/** Optional pin: OWNER_SUBJECTS (comma list of auth subjects) also counts as owner. */
function ownerSubjects():string[]{
 return (process.env.OWNER_SUBJECTS??"").split(",").map(s=>s.trim()).filter(Boolean);
}

/** Pure check, exported for tests. Fails closed when no owner is configured. */
export function isOwnerIdentity(identity:Identity|null|undefined):boolean{
 if(!identity?.subject)return false;
 if(ownerSubjects().includes(identity.subject))return true;
 const emails=ownerEmails();
 if(emails.length===0)return false;
 const email=typeof identity.email==="string"?identity.email.trim().toLowerCase():"";
 return !!email&&emails.includes(email);
}

/**
 * Returns the caller's owner id (auth subject) only when the caller is the configured owner.
 * Any other signed-in identity (for example an AgentID agent or a stray sign-up) is rejected server-side.
 */
export async function owner(ctx:QueryCtx|MutationCtx|ActionCtx):Promise<string> {
 const identity=await ctx.auth.getUserIdentity();
 if(identity){
  if(isOwnerIdentity(identity))return identity.subject;
  throw new Error("Forbidden: this account is not the workspace owner.");
 }
 if(process.env.CONVEX_PILOT_MODE==="1")return "sprite-private-pilot";
 throw new Error("Authentication required. Public deployment is disabled without auth.");
}
