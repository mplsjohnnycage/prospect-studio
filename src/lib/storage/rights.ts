import {
  UnauthorizedError,
  type AuthActor,
  canRead,
} from "../contracts/auth-matrix";

export type ArtifactAccess = {
  ownerId: string;
  /** soft-delete tombstone */
  deletedAt?: number | null;
  /** absolute expiry ms; null/undefined = no expiry */
  expiresAt?: number | null;
};

export type AccessAction = "read" | "write" | "delete" | "restore";

export function isExpired(
  artifact: ArtifactAccess,
  now = Date.now()
): boolean {
  return typeof artifact.expiresAt === "number" && artifact.expiresAt <= now;
}

export function isDeleted(artifact: ArtifactAccess): boolean {
  return typeof artifact.deletedAt === "number" && artifact.deletedAt > 0;
}

/** Owner may always act; operators/agents may read live non-expired objects. */
export function canAccessArtifact(
  actor: AuthActor,
  artifact: ArtifactAccess,
  action: AccessAction,
  now = Date.now()
): boolean {
  if (actor.role === "anonymous") return false;
  if (actor.role === "owner") {
    if (action === "restore") return isDeleted(artifact) || isExpired(artifact);
    if (action === "read" && isDeleted(artifact)) return false;
    return true;
  }
  // non-owners
  if (action === "write" || action === "delete" || action === "restore") {
    return false;
  }
  if (!canRead(actor)) return false;
  if (isDeleted(artifact) || isExpired(artifact, now)) return false;
  // tenant isolation: actor subject must match owner when provided
  if (actor.subject && actor.subject !== artifact.ownerId) return false;
  return true;
}

export function assertCanAccessArtifact(
  actor: AuthActor,
  artifact: ArtifactAccess,
  action: AccessAction,
  now = Date.now()
): void {
  if (!canAccessArtifact(actor, artifact, action, now)) {
    throw new UnauthorizedError(
      `role ${actor.role} cannot ${action} artifact for owner ${artifact.ownerId}`
    );
  }
}
