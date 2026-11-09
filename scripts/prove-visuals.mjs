#!/usr/bin/env node
/** P7 exit-gate: prospect-specific model run with traced I/O + R2 receipt. */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".tmp", "visuals");
mkdirSync(outDir, { recursive: true });

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 40_000_000,
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
  }
  return r.stdout;
}

function convexRun(fn, args) {
  const out = run("npx", ["convex", "run", "--no-push", fn, JSON.stringify(args)]);
  const start = out.indexOf("{");
  return JSON.parse(out.slice(start));
}

function convexEnvGet(name) {
  const out = run("npx", ["convex", "env", "get", name]);
  return out.trim();
}

const apiKey = convexEnvGet("GEMINI_API_KEY");
if (!apiKey || apiKey.length < 8) {
  throw new Error("GEMINI_API_KEY missing on Convex dev; cannot prove real model run");
}

// Keep key only in env for child; never print it.
process.env.GEMINI_API_KEY = apiKey;

const runner = `
import { retrieveLayoutPriors } from './src/lib/visuals/layoutPriors.ts';
import { buildReferenceBundle } from './src/lib/visuals/referenceBundle.ts';
import { generateProspectVisual, checkImageProviderPermission } from './src/lib/visuals/imageProvider.ts';
import { extractBrandDna } from './src/lib/enrichment/brandDna.ts';
import { cheapWebsiteCheck } from './src/lib/enrichment/websiteState.ts';

const perm = checkImageProviderPermission({ GEMINI_API_KEY: process.env.GEMINI_API_KEY });
if (!perm.allowed) throw new Error(perm.reason);

const prospect = {
  id: 'p7-demo-authentic-ff',
  name: 'Authentic Form & Function',
  website: 'https://www.authenticff.com',
};
const check = await cheapWebsiteCheck(prospect.website);
let html = '';
if (check.state === 'found') {
  try {
    const res = await fetch(check.finalUrl || check.url, {
      signal: AbortSignal.timeout(12000),
      headers: { 'user-agent': 'ProspectStudioVisuals/0.1', accept: 'text/html' },
    });
    html = new TextDecoder('utf-8', { fatal: false }).decode((await res.arrayBuffer()).slice(0, 80000));
  } catch { html = ''; }
}
const brand = extractBrandDna({ entityId: prospect.id, name: prospect.name, check, html });
const priors = retrieveLayoutPriors();
const bundle = buildReferenceBundle({
  prospectId: prospect.id,
  prospectName: prospect.name,
  brand,
  layoutPriors: priors,
});
const asset = await generateProspectVisual({
  apiKey: process.env.GEMINI_API_KEY,
  bundle,
});
const report = {
  version: 'visuals.prove.v1',
  generatedAt: new Date().toISOString(),
  permission: perm,
  bundle,
  trace: asset.trace,
  review: {
    status: 'generated_proposed',
    humanRequired: true,
    notes: ['Generated hero is proposed only; not a verified brand asset.'],
  },
  image: {
    contentType: asset.contentType,
    extension: asset.extension,
    byteLength: asset.bytes.byteLength,
    sha256: asset.trace.output.sha256,
    base64: asset.bytes.toString('base64'),
  },
};
console.log(JSON.stringify(report));
`;

const reportJson = run("node", ["--import", "tsx", "-e", runner]);
const report = JSON.parse(reportJson.trim().split("\n").filter(Boolean).at(-1));
if (report.trace?.output?.reviewStatus !== "generated_proposed") {
  throw new Error("missing proposed review status");
}
if (!report.image?.base64 || report.image.byteLength < 100) {
  throw new Error("image payload too small");
}

const imageBytes = Buffer.from(report.image.base64, "base64");
const imagePath = join(outDir, `hero.${report.image.extension}`);
writeFileSync(imagePath, imageBytes);
const { base64: _omit, ...imageMeta } = report.image;
const tracePath = join(outDir, "trace.json");
writeFileSync(
  tracePath,
  JSON.stringify({ ...report, image: imageMeta }, null, 2),
);

const uploadImage = convexRun("internal.storageActions.proveBinaryUpload", {
  ownerId: "p7-visuals",
  artifactId: `visual-hero-${report.trace.input.prospectId}`,
  base64: report.image.base64,
  contentType: report.image.contentType,
  kind: "generated-visual",
  source: "p7-gemini-image",
  actorId: "auto-loop",
});

const uploadTrace = convexRun("internal.storageActions.proveBinaryUpload", {
  ownerId: "p7-visuals",
  artifactId: `visual-trace-${report.trace.input.prospectId}`,
  base64: Buffer.from(JSON.stringify({ ...report, image: imageMeta }, null, 2)).toString("base64"),
  contentType: "application/json",
  kind: "visual-gen-trace",
  source: "p7-gemini-image",
  actorId: "auto-loop",
});

const summary = {
  ok: uploadImage.ok === true && uploadTrace.ok === true,
  prospect: report.trace.input.prospectName,
  model: report.trace.model,
  reviewStatus: report.trace.output.reviewStatus,
  imageReceipt: {
    artifactId: uploadImage.artifactId,
    objectKey: uploadImage.objectKey,
    contentHash: uploadImage.contentHash,
    bucket: uploadImage.bucket,
  },
  traceReceipt: {
    artifactId: uploadTrace.artifactId,
    objectKey: uploadTrace.objectKey,
    contentHash: uploadTrace.contentHash,
    bucket: uploadTrace.bucket,
  },
};
writeFileSync(join(outDir, "receipts.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exit(1);
