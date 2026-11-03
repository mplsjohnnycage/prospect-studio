import {test} from "node:test";
import assert from "node:assert/strict";
import {sandboxArgs} from "./tier2-sandbox";

test("sandbox has no network, caps and drops privileges", () => {
  const a = sandboxArgs(["npm", "test"]);
  assert.equal(a[a.indexOf("--network") + 1], "none");
  for (const f of ["--memory", "--cpus", "--pids-limit", "--read-only", "--cap-drop"]) assert.ok(a.includes(f), f);
  assert.deepEqual(a.slice(-3), ["prospect-sandbox:local", "npm", "test"]);
});
test("empty command is refused", () => { assert.throws(() => sandboxArgs([])); });
