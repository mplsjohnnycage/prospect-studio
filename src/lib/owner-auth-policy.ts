/** Owner enrollment is invite-only. Email alone never authorizes signup. */
export function canActivateOwner(candidateEmail:string,candidateCode:string,ownerEmail:string,requiredCode:string):boolean {
 if(!ownerEmail||!requiredCode||!candidateCode)return false;
 return candidateEmail.trim().toLowerCase()===ownerEmail.trim().toLowerCase() && candidateCode===requiredCode;
}

/**
 * Social (OAuth) enrollment carries no activation code, so the only social
 * sign-ups ever allowed are the owner's own addresses: the provider must
 * have verified the address, and it must exactly equal the owner email or
 * one of the explicitly listed extra owner addresses (e.g. the owner's
 * Google identity, which differs from the owner email). No other address,
 * and no whole-domain rule, ever qualifies.
 */
export function canRegisterOwnerSocial(candidateEmail:string,emailVerified:boolean,ownerEmail:string,extraAllowedEmails:readonly string[]=[]):boolean {
 if(!emailVerified)return false;
 const candidate=candidateEmail.trim().toLowerCase();
 if(!candidate)return false;
 const allowed=[ownerEmail,...extraAllowedEmails].map((email)=>email.trim().toLowerCase()).filter(Boolean);
 return allowed.includes(candidate);
}
