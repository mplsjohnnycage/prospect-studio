import {isOwnerAccount} from "./agentid-auth";

export const AUTH_REQUIRED="Authentication required. Public deployment is disabled without auth.";
export const OWNER_REQUIRED="Owner access required.";

export type GateUser={email?:string|null;emailVerified?:boolean|null}|null|undefined;

/**
 * Decides which tenant a backend call acts for.
 *
 * Owner-only is enforced here, on the server. A signed-in identity that is not the
 * verified owner account (for example an AgentID agent) is refused, even if its
 * email matches the owner email: provider identity is part of the check.
 * Pilot mode only ever applies to callers with no identity at all.
 */
export function resolveOwnerSubject(input:{
 identity:{subject:string}|null;
 user:GateUser;
 providerIds:readonly string[];
 ownerEmail:string;
 pilotMode:boolean;
}):string{
 if(!input.identity){
  if(input.pilotMode)return "sprite-private-pilot";
  throw new Error(AUTH_REQUIRED);
 }
 if(!isOwnerAccount(input.user,input.providerIds,input.ownerEmail))throw new Error(OWNER_REQUIRED);
 return input.identity.subject;
}
