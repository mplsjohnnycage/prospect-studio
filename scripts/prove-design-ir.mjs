#!/usr/bin/env node
/** P8 exit-gate: Design IR round-trip + converged revision receipt → R2. */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".tmp", "design");
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
  "src/lib/design/*.test.ts",
]);
if (!/pass \d+/.test(unit) && !/ℹ pass/.test(unit) && !/tests \d+/.test(unit)) {
  // node:test still prints pass count; require zero fail
}
if (/ℹ fail [^0]/.test(unit) || /\bfail \d+\b/.test(unit) && !/fail 0/.test(unit)) {
  throw new Error(unit);
}

const reportJson = run("node", [
  "--import",
  "tsx",
  "-e",
  `
import { createDesignIr } from './src/lib/design/ir.ts';
import { convergeEdits, irToJsonRender, irToPuck } from './src/lib/design/adapters.ts';
const base = createDesignIr({
  docId: 'design-authff',
  prospectId: 'p7-demo-authentic-ff',
  title: 'Home',
  businessName: 'Authentic Form & Function',
  headline: 'Design with purpose',
});
const manual = irToPuck(base);
manual.root.props.title = 'Studio Home';
manual.content[2].props.label = 'Book a consult';
const agent = {
  type: 'design-proposal',
  version: 'json-render-adapter.v1',
  nodes: [{ id: 'hero-1', component: 'ui.card', props: { headline: 'Authentic spaces, thoughtfully formed' } }],
};
const { ir, path } = convergeEdits({ base, manualPuck: manual, agentSpec: agent });
const report = {
  version: 'design.prove.v1',
  provedAt: new Date().toISOString(),
  path,
  baseRevision: base.revision,
  finalRevision: ir.revision,
  ir,
  puckProjection: irToPuck(ir),
  jsonRenderProjection: irToJsonRender(ir),
};
console.log(JSON.stringify(report));
`,
]);

const report = JSON.parse(reportJson.trim().split("\n").filter(Boolean).at(-1));
if (report.finalRevision <= report.baseRevision) throw new Error("revision did not advance");
writeFileSync(join(outDir, "design-ir.json"), JSON.stringify(report, null, 2));

const upload = convexRun("internal.storageActions.proveBinaryUpload", {
  ownerId: "p8-design",
  artifactId: `design-ir-${report.ir.docId}-r${report.finalRevision}`,
  base64: Buffer.from(JSON.stringify(report, null, 2)).toString("base64"),
  contentType: "application/json",
  kind: "design-ir-revision",
  source: "p8-design-ir",
  actorId: "auto-loop",
});

const summary = {
  ok: upload.ok === true && report.finalRevision > 1,
  path: report.path,
  finalRevision: report.finalRevision,
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
