/** Bounded, durable Convex lease for a single approved demo concept. */
export const BUILD_LEASE_MS = 4 * 60_000;
export type BuildLeaseState = {
  html?: string;
  buildClaimId?: string;
  buildLeaseUntil?: number;
};
export type BuildClaimState = "built" | "busy" | "acquired";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateBuildClaimId(id:string):void {
  if (!UUID.test(id)) throw new Error("Invalid concept build claim");
}
export function decideBuildClaim(concept:BuildLeaseState, now:number):BuildClaimState {
  if(concept.html) return "built";
  if(concept.buildClaimId && (concept.buildLeaseUntil ?? 0) > now) return "busy";
  return "acquired";
}
export function requireBuildClaim(concept:BuildLeaseState, claimId:string, now:number):void {
  validateBuildClaimId(claimId);
  if(!concept.buildClaimId || concept.buildClaimId!==claimId || (concept.buildLeaseUntil??0)<=now)
    throw new Error("Concept build claim expired or not owned");
}
