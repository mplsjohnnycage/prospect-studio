/** Owner enrollment is invite-only. Email alone never authorizes signup. */
export function canActivateOwner(candidateEmail:string,candidateCode:string,ownerEmail:string,requiredCode:string):boolean {
 if(!ownerEmail||!requiredCode||!candidateCode)return false;
 return candidateEmail.trim().toLowerCase()===ownerEmail.trim().toLowerCase() && candidateCode===requiredCode;
}
