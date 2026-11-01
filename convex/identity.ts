import type {QueryCtx,MutationCtx,ActionCtx} from "./_generated/server";
export async function owner(ctx:QueryCtx|MutationCtx|ActionCtx):Promise<string> {
 const identity=await ctx.auth.getUserIdentity();
 if(identity)return identity.subject;
 if(process.env.CONVEX_PILOT_MODE==="1")return "sprite-private-pilot";
 throw new Error("Authentication required. Public deployment is disabled without auth.");
}
