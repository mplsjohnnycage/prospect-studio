import { spawnSync } from "node:child_process";
import {
  runTypedCommandFromMcp,
  runTypedCommandFromUi,
} from "../src/lib/operator/mcp-tools.ts";
import {
  attachDesktopViewer,
  openOperatorSession,
  runHeadlessJob,
  viewerControl,
} from "../src/lib/operator/session.ts";

const actor = { role: "owner" as const, actorId: "johnny-cage", subject: "owner" };
const issuedAt = Date.parse("2026-11-09T21:00:00.000Z");
const input = {
  kind: "qa.evaluate" as const,
  commandId: "cmd-p11-parity",
  idempotencyKey: "idem-p11-parity",
  correlationId: "corr-p11-prove",
  expectedRevision: 4,
  subjectType: "artifact" as const,
  subjectId: "p7-demo-authentic-ff",
  payload: { checklist: "qa.v1", source: "p11-prove" },
};

const ui = runTypedCommandFromUi(actor, input, issuedAt);
const mcp = runTypedCommandFromMcp(actor, input, issuedAt);

let session = openOperatorSession({
  ownerId: "johnny-cage",
  sessionId: "sess_p11_prove",
  rivetActorKey: "prospect-operator:sess_p11_prove",
});

const headlessStdout = "p11-headless-ok\n";
session = runHeadlessJob(session, {
  command: "echo p11-headless-ok",
  stdout: headlessStdout,
  exitCode: 0,
  jobId: "job_p11_headless",
});

session = attachDesktopViewer(session, actor, {
  url: "http://127.0.0.1:6080/vnc.html",
  vncPort: 5900,
  websockifyPort: 6080,
});
session = viewerControl(session, actor, "pointer.move", session.viewer!.controlToken);

const novncAlive =
  spawnSync("bash", ["-lc", 'ss -ltn | grep -E ":6080|:5900"'], {
    encoding: "utf8",
  }).status === 0;

console.log(
  JSON.stringify({
    version: "operator.prove.v1",
    provedAt: new Date().toISOString(),
    uiMcpParity: ui.fingerprint === mcp.fingerprint,
    fingerprint: ui.fingerprint,
    uiChannel: ui.channel,
    mcpChannel: mcp.channel,
    headless: {
      ok:
        session.headlessJob?.status === "completed" &&
        session.headlessJob.exitCode === 0,
      sessionId: session.headlessJob?.sessionId,
      stdoutHash: session.headlessJob?.stdoutHash,
    },
    session: {
      sessionId: session.sessionId,
      rivetActorKey: session.rivetActorKey,
      viewerKind: session.viewer?.kind,
      viewerUrl: session.viewer?.url,
      sameSessionAsHeadless: session.headlessJob?.sessionId === session.sessionId,
      controlActions: session.controlEvents.map((e) => e.action),
      novncPortsListening: novncAlive,
    },
  }),
);
