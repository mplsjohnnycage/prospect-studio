#!/usr/bin/env node
/**
 * Mandatory agent harness preflight.
 * Exit 0 only when the repo is safe for Prospect Studio implementation agents.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];

function mustExist(rel) {
  if (!existsSync(join(root, rel))) errors.push(`missing required file: ${rel}`);
}

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

mustExist("AGENTS.md");
mustExist("docs/BASELINE.md");
mustExist("docs/LIFECYCLE.md");
mustExist("docs/SORT_OUT.md");
mustExist("docs/GIT_AND_DEPLOY.md");
mustExist("docs/AGENT_LOOP.md");
mustExist("scripts/agent-auto-loop.mjs");
mustExist("lifecycle/package.json");
mustExist("lifecycle/src/machine.ts");
mustExist("graph/package.json");
mustExist("graph/ps-loop1.exec.json");

const agents = existsSync(join(root, "AGENTS.md")) ? read("AGENTS.md") : "";
if (!agents.includes("Non-negotiable rules")) {
  errors.push("AGENTS.md missing mandatory rules section");
}
if (!agents.includes("lifecycle/")) {
  errors.push("AGENTS.md must require lifecycle/ spine");
}
if (!agents.includes("GitHub push / merge / deploy")) {
  errors.push("AGENTS.md missing GitHub push/merge/deploy section");
}
if (!/Humans merge|MUST NOT.*merge PR #35/s.test(agents)) {
  errors.push("AGENTS.md must forbid agents merging #35 / main");
}

if (existsSync(join(root, "QUARANTINE.md"))) {
  errors.push("QUARANTINE.md present — leave this tree; use wt-prospect-phase0 / build lane only");
}

if (existsSync(join(root, "package.json"))) {
  const pkg = JSON.parse(read("package.json"));
  if (pkg.name === "prospect-studio-sorted") {
    warnings.push("sorted docs package — implementation still targets mplsjohnnycage/prospect-studio phase0");
  }
  if (pkg.name === "prospect-studio") {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (!deps.next) errors.push("app package.json missing next — root manifest looks corrupted");
  }
}

function run(prefix, args) {
  const r = spawnSync("npm", ["--prefix", join(root, prefix), "run", ...args], {
    encoding: "utf8",
    cwd: root,
  });
  if (r.status !== 0) {
    errors.push(`${prefix} ${args.join(" ")} failed:\n${r.stdout || ""}\n${r.stderr || ""}`);
    return null;
  }
  return r.stdout;
}

// Ensure nested deps exist (best-effort)
for (const prefix of ["graph", "lifecycle"]) {
  if (!existsSync(join(root, prefix, "node_modules"))) {
    const install = spawnSync("npm", ["--prefix", join(root, prefix), "install"], {
      encoding: "utf8",
      cwd: root,
    });
    if (install.status !== 0) {
      errors.push(`npm install in ${prefix} failed`);
    }
  }
}

const graphOut = run("graph", ["validate"]);
const lifeOut = run("lifecycle", ["validate"]);

if (graphOut && !graphOut.includes('"ok": true')) {
  errors.push("graph validate did not report ok");
}
if (lifeOut && !lifeOut.includes('"ok": true')) {
  errors.push("lifecycle validate did not report ok");
}

const result = {
  ok: errors.length === 0,
  errors,
  warnings,
  next: errors.length
    ? ["Fix errors above before implementing."]
    : [
        "npm run graph -- next --loop loop1",
        "npm run graph -- prompt <NODE>",
        "npm run lifecycle -- can --from <A> --to <B>",
      ],
};

console.log(JSON.stringify(result, null, 2));
process.exit(errors.length ? 1 : 0);
