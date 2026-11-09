import {
  buildObjectKey,
  nextVersion,
  type ArtifactProvenance,
  type ArtifactVersionKey,
} from "./provenance";
import { isDeleted, isExpired, type ArtifactAccess } from "./rights";

export type StoredArtifact = ArtifactAccess & {
  artifactId: string;
  version: number;
  objectKey: string;
  contentHash: string;
  contentType: string;
  byteLength: number;
  bucket: string;
  provenance: ArtifactProvenance;
  /** prior objectKey when this version supersedes another */
  previousObjectKey?: string | null;
  restoredFrom?: string | null;
};

export type DedupeDecision =
  | { kind: "reuse"; existing: StoredArtifact }
  | { kind: "write"; versionKey: ArtifactVersionKey };

/** Same owner + contentHash on a live artifact → reuse (dedupe). */
export function decideDedupe(
  existing: StoredArtifact | undefined,
  candidate: ArtifactProvenance,
  artifactId: string
): DedupeDecision {
  if (
    existing &&
    existing.ownerId === candidate.ownerId &&
    existing.contentHash === candidate.contentHash &&
    !isDeleted(existing) &&
    !isExpired(existing)
  ) {
    return { kind: "reuse", existing };
  }
  const version = nextVersion(existing?.version);
  const objectKey = buildObjectKey({
    ownerId: candidate.ownerId,
    artifactId,
    version,
    contentHash: candidate.contentHash,
  });
  return {
    kind: "write",
    versionKey: { artifactId, version, objectKey },
  };
}

export function applyExpiry(
  artifact: StoredArtifact,
  expiresAt: number
): StoredArtifact {
  return { ...artifact, expiresAt };
}

export function softDelete(
  artifact: StoredArtifact,
  deletedAt = Date.now()
): StoredArtifact {
  return { ...artifact, deletedAt };
}

export function restoreArtifact(
  artifact: StoredArtifact,
  opts: { now?: number; clearExpiry?: boolean } = {}
): StoredArtifact {
  const now = opts.now ?? Date.now();
  return {
    ...artifact,
    deletedAt: null,
    expiresAt: opts.clearExpiry ? null : artifact.expiresAt,
    restoredFrom: artifact.objectKey,
    provenance: {
      ...artifact.provenance,
      createdAt: now,
      source: `${artifact.provenance.source}|restore`,
    },
  };
}

export type StorageReceipt = {
  ok: true;
  op: "upload" | "read" | "rights" | "expiry" | "dedupe" | "restore";
  artifactId: string;
  objectKey: string;
  contentHash: string;
  version: number;
  bucket: string;
  signedUrlExpiresIn?: number;
  reused?: boolean;
  expiresAt?: number | null;
  deletedAt?: number | null;
  restoredFrom?: string | null;
  recordedAt: number;
};

export function makeReceipt(
  partial: Omit<StorageReceipt, "ok" | "recordedAt"> & { recordedAt?: number }
): StorageReceipt {
  return {
    ok: true,
    recordedAt: partial.recordedAt ?? Date.now(),
    ...partial,
  };
}
