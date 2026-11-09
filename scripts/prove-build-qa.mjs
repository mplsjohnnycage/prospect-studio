#!/usr/bin/env node
/** P9 exit-gate: Design IR → HTML preview → Playwright screenshots → R2. */
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".tmp", "build-qa");
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
  "src/lib/siteqa/*.test.ts",
]);
if (/fail [^0]/.test(unit) && !/fail 0/.test(unit)) throw new Error(unit);

const rendered = run("node", [
  "--import",
  "tsx",
  "-e",
  `
import { createDesignIr } from './src/lib/design/ir.ts';
import { applyPatch } from './src/lib/design/ir.ts';
import { renderDesignIrHtml, qaHtml } from './src/lib/siteqa/render.ts';
let ir = createDesignIr({
  docId: 'build-authff',
  prospectId: 'p7-demo-authentic-ff',
  title: 'Home',
  businessName: 'Authentic Form & Function',
  headline: 'Spaces shaped with care',
});
ir = applyPatch(ir, { op: 'setProp', nodeId: 'cta-1', key: 'label', value: 'Book a consult' }, ir.revision);
const html = renderDesignIrHtml(ir);
const qa = qaHtml(html);
if (!qa.ok) throw new Error('QA checklist failed: ' + qa.notes.join('; '));
console.log(JSON.stringify({ html, qa, revision: ir.revision, docId: ir.docId }));
`,
]);

const { html, qa, revision, docId } = JSON.parse(
  rendered.trim().split("\n").filter(Boolean).at(-1),
);
const htmlPath = join(outDir, "preview.html");
writeFileSync(htmlPath, html);

const server = createServer((req, res) => {
  if (req.url === "/" || req.url?.startsWith("/index")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const previewUrl = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({ headless: true });
const shots = [];
for (const vp of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(previewUrl, { waitUntil: "networkidle" });
  const shotPath = join(outDir, `qa-${vp.name}.png`);
  await page.screenshot({ path: shotPath, fullPage: true });
  await page.close();
  shots.push({ name: vp.name, path: shotPath, width: vp.width, height: vp.height });
}
await browser.close();
server.close();

const uploads = [];
for (const shot of shots) {
  const bytes = readFileSync(shot.path);
  const upload = convexRun("internal.storageActions.proveBinaryUpload", {
    ownerId: "p9-build-qa",
    artifactId: `qa-${docId}-${shot.name}-r${revision}`,
    base64: bytes.toString("base64"),
    contentType: "image/png",
    kind: "qa-screenshot",
    source: "p9-playwright",
    actorId: "auto-loop",
  });
  uploads.push({
    viewport: shot.name,
    artifactId: upload.artifactId,
    objectKey: upload.objectKey,
    contentHash: upload.contentHash,
    bucket: upload.bucket,
    ok: upload.ok === true,
  });
}

const report = {
  version: "build-qa.prove.v1",
  provedAt: new Date().toISOString(),
  previewUrlLocal: previewUrl,
  docId,
  revision,
  qa,
  screenshots: uploads,
};
writeFileSync(join(outDir, "receipts.json"), JSON.stringify(report, null, 2));

const reportUpload = convexRun("internal.storageActions.proveBinaryUpload", {
  ownerId: "p9-build-qa",
  artifactId: `qa-report-${docId}-r${revision}`,
  base64: Buffer.from(JSON.stringify(report, null, 2)).toString("base64"),
  contentType: "application/json",
  kind: "qa-report",
  source: "p9-playwright",
  actorId: "auto-loop",
});

const summary = {
  ok: uploads.every((u) => u.ok) && reportUpload.ok === true && qa.ok,
  revision,
  screenshots: uploads.length,
  reportReceipt: {
    artifactId: reportUpload.artifactId,
    objectKey: reportUpload.objectKey,
    contentHash: reportUpload.contentHash,
    bucket: reportUpload.bucket,
  },
  screenshotsReceipts: uploads,
};
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exit(1);
