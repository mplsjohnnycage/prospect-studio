#!/usr/bin/env node
/** P11 exit-gate: UI/MCP typed command parity; headless job; viewer same session. */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".tmp", "operator");
mkdirSync(outDir, { recursive: true });

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", maxBuffer: 20_000_000 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

function convexRun(fn, args) {
  const out = run("npx", ["convex", "run", "--no-push", fn, JSON.stringify(args)]);
  return JSON.parse(out.slice(out.indexOf("{")));
}

const unit = run("node", [
  "--import",
  "tsx",
  "--test",
  "--test-concurrency=4",
  "src/lib/operator/*.test.ts",
]);
if (/fail [^0]/.test(unit) && !/fail 0/.test(unit)) throw new Error(unit);

const reportJson = run("node", [
  "--import",
  "tsx",
  "scripts/_prove-operator-body.mts",
]);

const report = JSON.parse(reportJson.slice(reportJson.indexOf("{")));
if (!report.uiMcpParity) throw new Error("UI/MCP fingerprint mismatch");
if (!report.headless?.ok) throw new Error("headless job failed");
if (!report.session?.sameSessionAsHeadless) throw new Error("viewer/headless session mismatch");
if (!report.session?.novncPortsListening) throw new Error("noVNC/x11vnc ports not listening");

writeFileSync(join(outDir, "operator.json"), JSON.stringify(report, null, 2));

const upload = convexRun("internal.storageActions.proveBinaryUpload", {
  ownerId: "p11-operator",
  artifactId: `operator-session-${report.session.sessionId}-${report.fingerprint.slice(0, 12)}`,
  base64: Buffer.from(JSON.stringify(report, null, 2)).toString("base64"),
  contentType: "application/json",
  kind: "operator-session",
  source: "p11-operator",
  actorId: "auto-loop",
});

const summary = {
  ok:
    upload.ok === true &&
    report.uiMcpParity === true &&
    report.headless.ok === true &&
    report.session.sameSessionAsHeadless === true,
  fingerprint: report.fingerprint,
  sessionId: report.session.sessionId,
  receipt: {
    artifactId: upload.artifactId,
    objectKey: upload.objectKey,
    contentHash: upload.contentHash,
    bucket: upload.bucket,
  },
};
writeFileSync(join(outDir, "receipts.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exit(1);
