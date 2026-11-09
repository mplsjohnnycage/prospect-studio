import { createHash } from "node:crypto";

export type ArtifactKind =
  | "demo_html"
  | "extract"
  | "image"
  | "receipt"
  | "other";

export type ArtifactProvenance = {
  ownerId: string;
  actorId: string;
  source: string;
  kind: ArtifactKind;
  contentHash: string;
  contentType: string;
  byteLength: number;
  createdAt: number;
  correlationId?: string;
  subjectType?: string;
  subjectId?: string;
};

export type ArtifactVersionKey = {
  /** Stable logical identity for dedupe across versions */
  artifactId: string;
  /** Monotonic version (1-based) */
  version: number;
  /** R2 object key */
  objectKey: string;
};

/** Canonical sha256 hex of raw bytes (P2 content identity). */
export function contentHashOf(bytes: Uint8Array | Buffer | string): string {
  const buf =
    typeof bytes === "string"
      ? Buffer.from(bytes, "utf8")
      : Buffer.from(bytes);
  return createHash("sha256").update(buf).digest("hex");
}

/** Versioned R2 key: artifacts/{ownerId}/{artifactId}/v{version}/{contentHashPrefix} */
export function buildObjectKey(input: {
  ownerId: string;
  artifactId: string;
  version: number;
  contentHash: string;
}): string {
  const safeOwner = encodeURIComponent(input.ownerId);
  const safeId = encodeURIComponent(input.artifactId);
  const prefix = input.contentHash.slice(0, 16);
  return `artifacts/${safeOwner}/${safeId}/v${input.version}/${prefix}`;
}

export function nextVersion(current: number | undefined): number {
  return (current ?? 0) + 1;
}

export function provenanceForWrite(input: {
  ownerId: string;
  actorId: string;
  source: string;
  kind: ArtifactKind;
  bytes: Uint8Array | Buffer | string;
  contentType: string;
  now?: number;
  correlationId?: string;
  subjectType?: string;
  subjectId?: string;
}): ArtifactProvenance {
  const buf =
    typeof input.bytes === "string"
      ? Buffer.from(input.bytes, "utf8")
      : Buffer.from(input.bytes);
  return {
    ownerId: input.ownerId,
    actorId: input.actorId,
    source: input.source,
    kind: input.kind,
    contentHash: contentHashOf(buf),
    contentType: input.contentType,
    byteLength: buf.byteLength,
    createdAt: input.now ?? Date.now(),
    correlationId: input.correlationId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
  };
}
