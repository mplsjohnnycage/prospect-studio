#!/usr/bin/env node
/** P5 exit-gate: DuckDB Overture extract → coverage report → R2. */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".tmp", "discovery");
mkdirSync(outDir, { recursive: true });

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20_000_000,
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

const extractJson = run("node", [
  "--import",
  "tsx",
  "-e",
  `import { extractTwinCitiesPlaces } from './src/lib/discovery/extract.ts';
   const extract = await extractTwinCitiesPlaces({ limit: 200 });
   console.log(JSON.stringify(extract));`,
]);
const extract = JSON.parse(extractJson.trim().split("\n").filter(Boolean).at(-1));
if (!extract.places?.length) throw new Error("extract returned zero places");
if (extract.coverage.cityCenterProxyCount < 0) throw new Error("invalid coverage");

const artifactBody = JSON.stringify(extract, null, 2);
const extractPath = join(outDir, "twin-cities-places.json");
const coveragePath = join(outDir, "coverage.json");
writeFileSync(extractPath, artifactBody);
writeFileSync(coveragePath, JSON.stringify(extract.coverage, null, 2));

const upload = convexRun("internal.storageActions.proveBinaryUpload", {
  ownerId: "p5-discovery",
  artifactId: `overture-tc-${extract.extractedAt.slice(0, 10)}`,
  base64: Buffer.from(artifactBody, "utf8").toString("base64"),
  contentType: "application/json",
  kind: "discovery-extract",
  source: "p5-overture-duckdb",
  actorId: "auto-loop",
});

const summary = {
  ok: upload.ok === true && extract.places.length > 0,
  placeCount: extract.places.length,
  coverage: extract.coverage,
  receipt: {
    artifactId: upload.artifactId,
    objectKey: upload.objectKey,
    contentHash: upload.contentHash,
    bucket: upload.bucket,
    op: upload.op,
  },
};
writeFileSync(join(outDir, "receipts.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exit(1);
