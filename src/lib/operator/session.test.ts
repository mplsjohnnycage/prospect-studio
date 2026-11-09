import assert from "node:assert/strict";
import test from "node:test";
import {
  attachDesktopViewer,
  openOperatorSession,
  runHeadlessJob,
  sameSession,
  viewerControl,
} from "./session";

const owner = { role: "owner" as const, actorId: "johnny-cage", subject: "owner" };

test("headless job and viewer control share the same session", () => {
  let session = openOperatorSession({ ownerId: "johnny-cage", sessionId: "sess_p11_demo" });
  session = runHeadlessJob(session, {
    command: "echo p11-headless",
    stdout: "p11-headless\n",
    exitCode: 0,
  });
  session = attachDesktopViewer(session, owner);
  session = viewerControl(session, owner, "pointer.move", session.viewer!.controlToken);

  assert.equal(session.headlessJob?.sessionId, session.sessionId);
  assert.equal(session.viewer?.kind, "novnc");
  assert.equal(session.viewer?.websockifyPort, 6080);
  assert.ok(sameSession(session, { sessionId: session.headlessJob!.sessionId }));
  assert.ok(session.controlEvents.some((e) => e.action === "viewer.attach"));
  assert.ok(session.controlEvents.some((e) => e.action === "pointer.move"));
  assert.ok(session.controlEvents.some((e) => e.action === "job.complete"));
});

test("agent cannot attach desktop viewer", () => {
  const session = openOperatorSession({ ownerId: "johnny-cage" });
  assert.throws(
    () => attachDesktopViewer(session, { role: "agent", actorId: "bot" }),
    /cannot control desktop/,
  );
});

test("viewer rejects mismatched control token", () => {
  let session = openOperatorSession({ ownerId: "johnny-cage" });
  session = attachDesktopViewer(session, owner);
  assert.throws(
    () => viewerControl(session, owner, "keydown", "bad-token"),
    /token mismatch/,
  );
});
