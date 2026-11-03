import {test} from "node:test";
import assert from "node:assert/strict";
import {runInWasm} from "./tier1-wasm";

test("runs a small snippet over input", async () => {
  assert.deepEqual(await runInWasm("return input.xs.map(x=>x*2)", {xs: [1, 2]}), [2, 4]);
});
test("no network or host globals", async () => {
  assert.equal(await runInWasm("return [typeof fetch, typeof require, typeof process].join()", null), "undefined,undefined,undefined");
});
test("time cap interrupts an infinite loop", async () => {
  await assert.rejects(runInWasm("while(true){}", null, {timeoutMs: 100}));
});
test("memory cap stops a runaway allocation", async () => {
  await assert.rejects(runInWasm("const a=[];while(true)a.push('x'.repeat(1e5));", null, {memoryBytes: 8 * 1024 * 1024, timeoutMs: 5000}));
});
