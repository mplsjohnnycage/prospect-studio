// Tier 1: run a small JS snippet in QuickJS compiled to WebAssembly. No host functions are exposed, so there is
// no network, filesystem or process access. Caps: memory (default 32 MiB) and wall time (default 2 s).
// The snippet sees a frozen global `input` (JSON) and must evaluate to a JSON-serializable value.
import {QuickJS} from "quickjs-wasi";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";

let wasm: WebAssembly.Module | undefined;
async function module(): Promise<WebAssembly.Module> {
  if (!wasm) { const req = createRequire(import.meta.url); wasm = await WebAssembly.compile(await readFile(req.resolve("quickjs-wasi/quickjs.wasm"))); }
  return wasm;
}
export type WasmCaps = { memoryBytes?: number; timeoutMs?: number };
export async function runInWasm(code: string, input: unknown, caps: WasmCaps = {}): Promise<unknown> {
  const deadline = Date.now() + (caps.timeoutMs ?? 2000);
  const vm = await QuickJS.create({wasm: await module(), memoryLimit: caps.memoryBytes ?? 32 * 1024 * 1024, interruptHandler: () => Date.now() > deadline});
  try {
    const src = "const input=Object.freeze(JSON.parse(" + JSON.stringify(JSON.stringify(input ?? null)) + "));JSON.stringify((()=>{" + code + "})())";
    const h = vm.evalCode(src, "tier1.js");
    try { const out = vm.dump(h); return typeof out === "string" ? JSON.parse(out) : out; } finally { h.dispose(); }
  } finally { vm.dispose(); }
}
