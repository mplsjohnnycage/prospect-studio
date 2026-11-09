/** Sprite worker pool leases for Loop1 P4. */

export type SpriteLeaseStatus = "open" | "running" | "acked" | "expired" | "failed";

export type SpriteLease = {
  leaseId: string;
  spriteName: string;
  ownerId: string;
  jobId: string;
  status: SpriteLeaseStatus;
  leasedAt: number;
  leaseUntil: number;
  checkpointId?: string;
};

export type SpriteJobReceipt = {
  ok: true;
  leaseId: string;
  jobId: string;
  spriteName: string;
  exitCode: number | null;
  stdoutHash: string;
  stderrBytes: number;
  timedOut: boolean;
  ms: number;
  woke: boolean;
  checkpointId?: string;
  recovered: boolean;
  authenticated: true;
  recordedAt: number;
};

export const DEFAULT_LEASE_MS = 120_000;

export function openLease(args: {
  leaseId: string;
  spriteName: string;
  ownerId: string;
  jobId: string;
  now?: number;
  leaseMs?: number;
}): SpriteLease {
  const now = args.now ?? Date.now();
  return {
    leaseId: args.leaseId,
    spriteName: args.spriteName,
    ownerId: args.ownerId,
    jobId: args.jobId,
    status: "open",
    leasedAt: now,
    leaseUntil: now + (args.leaseMs ?? DEFAULT_LEASE_MS),
  };
}

export function markRunning(lease: SpriteLease, now = Date.now()): SpriteLease {
  if (lease.leaseUntil <= now) throw new Error("lease expired");
  if (lease.status !== "open" && lease.status !== "running") {
    throw new Error(`cannot run from ${lease.status}`);
  }
  return { ...lease, status: "running" };
}

export function ackLease(
  lease: SpriteLease,
  checkpointId?: string,
  now = Date.now(),
): SpriteLease {
  if (lease.leaseUntil <= now) throw new Error("lease expired");
  return {
    ...lease,
    status: "acked",
    checkpointId: checkpointId ?? lease.checkpointId,
  };
}

export function isActive(lease: SpriteLease, now = Date.now()): boolean {
  return (
    lease.leaseUntil > now &&
    (lease.status === "open" || lease.status === "running")
  );
}
