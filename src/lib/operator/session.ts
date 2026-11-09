/** Rivet + desktop/noVNC session binding for operator control. */

import { createHash, randomUUID } from "node:crypto";
import {
  assertCanControlDesktop,
  type AuthActor,
} from "../contracts/auth-matrix";

export type DesktopViewer = {
  kind: "novnc";
  /** Local noVNC/websockify endpoint on the Sprite */
  url: string;
  vncPort: number;
  websockifyPort: number;
  /** Viewer control token bound to sessionId */
  controlToken: string;
};

export type HeadlessJob = {
  jobId: string;
  sessionId: string;
  command: string;
  status: "queued" | "running" | "completed" | "failed";
  exitCode: number | null;
  stdoutHash: string | null;
  startedAt: number;
  finishedAt?: number;
};

export type OperatorSession = {
  sessionId: string;
  rivetActorKey: string;
  spriteName: string;
  ownerId: string;
  status: "open" | "running" | "closed";
  createdAt: number;
  viewer?: DesktopViewer;
  headlessJob?: HeadlessJob;
  controlEvents: Array<{ at: number; actorId: string; action: string }>;
};

const DEFAULT_NOVNC = {
  url: "http://127.0.0.1:6080/vnc.html",
  vncPort: 5900,
  websockifyPort: 6080,
} as const;

export function openOperatorSession(args: {
  ownerId: string;
  spriteName?: string;
  rivetActorKey?: string;
  sessionId?: string;
  now?: number;
}): OperatorSession {
  const sessionId = args.sessionId ?? `sess_${randomUUID()}`;
  return {
    sessionId,
    rivetActorKey: args.rivetActorKey ?? `prospect-operator:${sessionId}`,
    spriteName: args.spriteName ?? "prospect-studio",
    ownerId: args.ownerId,
    status: "open",
    createdAt: args.now ?? Date.now(),
    controlEvents: [],
  };
}

export function attachDesktopViewer(
  session: OperatorSession,
  actor: AuthActor,
  ports: Partial<typeof DEFAULT_NOVNC> = {},
): OperatorSession {
  assertCanControlDesktop(actor);
  if (session.status === "closed") throw new Error("session closed");
  const url = ports.url ?? DEFAULT_NOVNC.url;
  const vncPort = ports.vncPort ?? DEFAULT_NOVNC.vncPort;
  const websockifyPort = ports.websockifyPort ?? DEFAULT_NOVNC.websockifyPort;
  const controlToken = createHash("sha256")
    .update(`${session.sessionId}:viewer:${actor.actorId}`)
    .digest("hex")
    .slice(0, 32);
  return {
    ...session,
    status: session.status === "open" ? "running" : session.status,
    viewer: {
      kind: "novnc",
      url,
      vncPort,
      websockifyPort,
      controlToken,
    },
    controlEvents: [
      ...session.controlEvents,
      { at: Date.now(), actorId: actor.actorId, action: "viewer.attach" },
    ],
  };
}

export function viewerControl(
  session: OperatorSession,
  actor: AuthActor,
  action: string,
  controlToken: string,
): OperatorSession {
  assertCanControlDesktop(actor);
  if (!session.viewer) throw new Error("no viewer attached");
  if (session.viewer.controlToken !== controlToken) {
    throw new Error("viewer control token mismatch");
  }
  return {
    ...session,
    controlEvents: [
      ...session.controlEvents,
      { at: Date.now(), actorId: actor.actorId, action },
    ],
  };
}

/** Headless path: same sessionId, no viewer required. */
export function runHeadlessJob(
  session: OperatorSession,
  args: {
    command: string;
    stdout: string;
    exitCode?: number;
    jobId?: string;
    now?: number;
  },
): OperatorSession {
  if (session.status === "closed") throw new Error("session closed");
  const now = args.now ?? Date.now();
  const job: HeadlessJob = {
    jobId: args.jobId ?? `job_${randomUUID()}`,
    sessionId: session.sessionId,
    command: args.command,
    status: "completed",
    exitCode: args.exitCode ?? 0,
    stdoutHash: createHash("sha256").update(args.stdout).digest("hex").slice(0, 16),
    startedAt: now,
    finishedAt: now,
  };
  return {
    ...session,
    status: "running",
    headlessJob: job,
    controlEvents: [
      ...session.controlEvents,
      { at: now, actorId: "headless", action: "job.complete" },
    ],
  };
}

export function sameSession(
  a: Pick<OperatorSession, "sessionId">,
  b: Pick<OperatorSession, "sessionId">,
): boolean {
  return a.sessionId === b.sessionId;
}
