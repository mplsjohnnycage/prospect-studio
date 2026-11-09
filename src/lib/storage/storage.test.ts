import assert from "node:assert/strict";
import { test } from "node:test";
import { UnauthorizedError } from "../contracts/auth-matrix";
import {
  applyExpiry,
  decideDedupe,
  makeReceipt,
  restoreArtifact,
  softDelete,
  type StoredArtifact,
} from "./lifecycle";
import { contentHashOf, provenanceForWrite } from "./provenance";
import { assertCanAccessArtifact, canAccessArtifact } from "./rights";

const owner = { role: "owner" as const, actorId: "owner-1", subject: "owner-1" };
const agent = { role: "agent" as const, actorId: "agent-1", subject: "owner-1" };

function baseArtifact(overrides: Partial<StoredArtifact> = {}): StoredArtifact {
  const provenance = provenanceForWrite({
    ownerId: "owner-1",
    actorId: "owner-1",
    source: "test",
    kind: "receipt",
    bytes: "hello-r2",
    contentType: "text/plain",
  });
  return {
    ownerId: "owner-1",
    artifactId: "art-1",
    version: 1,
    objectKey: "artifacts/owner-1/art-1/v1/abc",
    contentHash: provenance.contentHash,
    contentType: "text/plain",
    byteLength: provenance.byteLength,
    bucket: "prospect-studio-dev",
    provenance,
    ...overrides,
  };
}

test("contentHash is stable", () => {
  assert.equal(contentHashOf("hello-r2"), contentHashOf(Buffer.from("hello-r2")));
});

test("rights: owner can write; agent cannot", () => {
  const art = baseArtifact();
  assert.equal(canAccessArtifact(owner, art, "write"), true);
  assert.equal(canAccessArtifact(agent, art, "write"), false);
  assert.equal(canAccessArtifact(agent, art, "read"), true);
});

test("rights: expired and deleted deny agent reads", () => {
  const expired = applyExpiry(baseArtifact(), Date.now() - 1000);
  assert.equal(canAccessArtifact(agent, expired, "read"), false);
  const deleted = softDelete(baseArtifact());
  assert.equal(canAccessArtifact(agent, deleted, "read"), false);
  assert.throws(
    () => assertCanAccessArtifact(agent, deleted, "read"),
    UnauthorizedError,
  );
});

test("dedupe reuses same contentHash", () => {
  const art = baseArtifact();
  const candidate = provenanceForWrite({
    ownerId: "owner-1",
    actorId: "owner-1",
    source: "test",
    kind: "receipt",
    bytes: "hello-r2",
    contentType: "text/plain",
  });
  const decision = decideDedupe(art, candidate, "art-1");
  assert.equal(decision.kind, "reuse");
});

test("dedupe writes new version on content change", () => {
  const art = baseArtifact();
  const candidate = provenanceForWrite({
    ownerId: "owner-1",
    actorId: "owner-1",
    source: "test",
    kind: "receipt",
    bytes: "hello-r2-v2",
    contentType: "text/plain",
  });
  const decision = decideDedupe(art, candidate, "art-1");
  assert.equal(decision.kind, "write");
  if (decision.kind === "write") {
    assert.equal(decision.versionKey.version, 2);
  }
});

test("restore clears deletedAt and records receipt", () => {
  const deleted = softDelete(baseArtifact(), 111);
  const restored = restoreArtifact(deleted, { now: 222, clearExpiry: true });
  assert.equal(restored.deletedAt, null);
  assert.equal(restored.restoredFrom, deleted.objectKey);
  const receipt = makeReceipt({
    op: "restore",
    artifactId: restored.artifactId,
    objectKey: restored.objectKey,
    contentHash: restored.contentHash,
    version: restored.version,
    bucket: restored.bucket,
    restoredFrom: restored.restoredFrom,
    recordedAt: 222,
  });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.op, "restore");
});
