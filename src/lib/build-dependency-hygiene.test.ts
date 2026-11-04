import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);
const lock = JSON.parse(
  readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"),
);

test("AgentOS runtime is retained without the unused AgentOS UI bundle", () => {
  assert.ok(manifest.dependencies["@rivet-dev/agentos-core"]);
  assert.equal(manifest.dependencies["@rivet-dev/agentos"], undefined);
  assert.equal(lock.packages["node_modules/@rivet-dev/agentos"], undefined);
});

test("removed UI bundle does not introduce legacy Pi dependencies", () => {
  assert.equal(lock.packages["node_modules/@agentos-software/pi"], undefined);
  assert.equal(lock.packages["node_modules/@mariozechner/pi-coding-agent"], undefined);
});
