import assert from "node:assert/strict";
import { test } from "node:test";
import { ackLease, isActive, markRunning, openLease } from "./lease.ts";

test("lease opens, runs, acks within window", () => {
  const now = 1_000_000;
  const lease = openLease({
    leaseId: "L1",
    spriteName: "prospect-studio",
    ownerId: "p4",
    jobId: "J1",
    now,
    leaseMs: 60_000,
  });
  assert.equal(lease.status, "open");
  assert.equal(isActive(lease, now + 1), true);
  const running = markRunning(lease, now + 10);
  assert.equal(running.status, "running");
  const acked = ackLease(running, "cp-1", now + 20);
  assert.equal(acked.status, "acked");
  assert.equal(acked.checkpointId, "cp-1");
});

test("expired lease cannot run", () => {
  const now = 1_000_000;
  const lease = openLease({
    leaseId: "L2",
    spriteName: "prospect-studio",
    ownerId: "p4",
    jobId: "J2",
    now,
    leaseMs: 10,
  });
  assert.throws(() => markRunning(lease, now + 11));
  assert.equal(isActive(lease, now + 11), false);
});
