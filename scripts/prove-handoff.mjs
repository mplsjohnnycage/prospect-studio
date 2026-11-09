#!/usr/bin/env node
/** P10 exit-gate: one real SHA-bound approved handoff; unauthorized blocked. */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".tmp", "handoff");
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
  "src/lib/handoff/*.test.ts",
]);
if (/fail [^0]/.test(unit) && !/fail 0/.test(unit)) throw new Error(unit);

const reportJson = run("node", [
  "--import",
  "tsx",
  "-e",
  `
import {
  approveHandoff,
  attemptUnauthorizedApproval,
  createHandoffPackage,
} from './src/lib/handoff/package.ts';

const draft = createHandoffPackage({
  prospectId: 'p7-demo-authentic-ff',
  businessName: 'Authentic Form & Function',
  evidence: {
    sourceExtractObjectKey: 'artifacts/p5-discovery/overture-tc-2026-11-09',
    enrichmentObjectKey: 'artifacts/p6-enrichment/enrichment-tc-2026-11-09',
    visualTraceObjectKey: 'artifacts/p7-visuals/visual-trace-p7-demo-authentic-ff',
    designIrObjectKey: 'artifacts/p8-design/design-ir-design-authff-r5',
    qaReportObjectKey: 'artifacts/p9-build-qa/qa-report-build-authff-r2',
    previewSha256: '33240f406ffbbac4d64b4055ed194b84540729cc632c6b6623eed0c880bce495',
  },
});

const blocked = attemptUnauthorizedApproval(draft, {
  role: 'agent',
  actorId: 'auto-loop',
});

const approved = approveHandoff({
  pkg: draft,
  actor: { role: 'owner', actorId: 'johnny-cage', subject: 'owner' },
  expectedContentSha: draft.contentSha,
  approverProof: 'owner-approver-proof-loop1',
  rationale: 'Real source→demo path for Authentic Form & Function with QA receipts.',
});

console.log(JSON.stringify({
  version: 'handoff.prove.v1',
  provedAt: new Date().toISOString(),
  blocked,
  package: approved,
}));
`,
]);

const report = JSON.parse(reportJson.trim().split("\n").filter(Boolean).at(-1));
if (report.package?.status !== "approved") throw new Error("handoff not approved");
if (report.blocked?.status !== "blocked_unauthorized") {
  throw new Error("unauthorized path was not blocked");
}
writeFileSync(join(outDir, "handoff.json"), JSON.stringify(report, null, 2));

const upload = convexRun("internal.storageActions.proveBinaryUpload", {
  ownerId: "p10-handoff",
  artifactId: `handoff-${report.package.prospectId}-${report.package.contentSha.slice(0, 12)}`,
  base64: Buffer.from(JSON.stringify(report, null, 2)).toString("base64"),
  contentType: "application/json",
  kind: "handoff-package",
  source: "p10-approvals",
  actorId: "auto-loop",
});

const summary = {
  ok: upload.ok === true && report.package.status === "approved",
  businessName: report.package.businessName,
  contentSha: report.package.contentSha,
  unauthorizedBlocked: true,
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
