#!/usr/bin/env node
/**
 * P3 exit-gate: build Storybook, screenshot approved stories, upload PNGs to R2.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "storybook-static");
const shotDir = join(root, ".tmp", "component-shots");
const require = createRequire(import.meta.url);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`,
    );
  }
  return r.stdout;
}

function loadRegistry() {
  // Compile-free: read registry via tsx child
  const out = run("node", [
    "--import",
    "tsx",
    "-e",
    `import { listApprovedComponents } from './src/lib/components/registry.ts'; console.log(JSON.stringify(listApprovedComponents()))`,
  ]);
  const line = out.trim().split("\n").filter(Boolean).at(-1);
  return JSON.parse(line);
}

async function serveStatic(dir) {
  const { createReadStream, statSync } = await import("node:fs");
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".map": "application/json",
  };
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = join(dir, rel);
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
    const type = mime[ext] || "application/octet-stream";
    const stream = createReadStream(file);
    res.writeHead(200, { "Content-Type": type });
    stream.pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function convexRun(fn, args) {
  const payload = JSON.stringify(args);
  const out = run("npx", ["convex", "run", "--no-push", fn, payload]);
  const start = out.indexOf("{");
  return JSON.parse(out.slice(start));
}

async function main() {
  mkdirSync(shotDir, { recursive: true });
  if (process.env.SKIP_STORYBOOK_BUILD === "1" && existsSync(outDir)) {
    console.log("[p3] reusing existing storybook-static");
  } else {
    console.log("[p3] building storybook...");
    run("npx", ["storybook", "build", "-o", "storybook-static", "--quiet"], {
      env: { ...process.env, CI: "1" },
    });
  }

  const approved = loadRegistry();
  if (!approved.length) throw new Error("no approved components");

  const server = await serveStatic(outDir);
  const browser = await chromium.launch({ headless: true });
  const receipts = [];

  try {
    for (const entry of approved) {
      const page = await browser.newPage({
        viewport: { width: 800, height: 600 },
      });
      const storyUrl = `${server.url}/iframe.html?id=${encodeURIComponent(entry.storyId)}&viewMode=story`;
      console.log(`[p3] screenshot ${entry.id} → ${storyUrl}`);
      await page.goto(storyUrl, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(500);
      const pngPath = join(shotDir, `${entry.id.replace(/\./g, "-")}.png`);
      await page.screenshot({ path: pngPath, fullPage: true });
      await page.close();

      const base64 = readFileSync(pngPath).toString("base64");
      if (base64.length < 64) throw new Error(`screenshot too small for ${entry.id}`);

      const artifactId = `comp-${entry.id}-v${entry.version}`;
      const receipt = convexRun("internal.storageActions.proveBinaryUpload", {
        ownerId: "p3-component-library",
        artifactId,
        base64,
        contentType: "image/png",
        kind: "screenshot",
        source: "p3-storybook-playwright",
        actorId: "auto-loop",
      });
      if (!receipt.ok) throw new Error(`upload failed for ${entry.id}`);
      receipts.push({
        ...receipt,
        componentId: entry.id,
        componentVersion: entry.version,
        storyId: entry.storyId,
        requestedArtifactId: `comp-${entry.id}-v${entry.version}`,
      });
      console.log(
        `[p3] uploaded ${entry.id} key=${receipt.objectKey} hash=${receipt.contentHash.slice(0, 12)}`,
      );
    }
  } finally {
    await browser.close();
    await server.close();
  }

  const summary = {
    ok: receipts.length === approved.length && receipts.every((r) => r.ok),
    count: receipts.length,
    receipts,
  };
  writeFileSync(
    join(shotDir, "receipts.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
