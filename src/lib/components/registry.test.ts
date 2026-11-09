import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMPONENT_REGISTRY,
  getComponent,
  listApprovedComponents,
  withScreenshotEvidence,
} from "./registry.ts";
import { assertTokensExist } from "./tokens.ts";

test("registry has approved Button Badge Card with story ids", () => {
  const approved = listApprovedComponents();
  assert.equal(approved.length, 3);
  for (const id of ["ui.button", "ui.badge", "ui.card"]) {
    const entry = getComponent(id);
    assert.ok(entry);
    assert.equal(entry.status, "approved");
    assert.ok(entry.storyId.includes("ui-"));
    assert.ok(entry.version.match(/^\d+\.\d+\.\d+$/));
    assertTokensExist(entry.tokens);
  }
});

test("withScreenshotEvidence only for approved", () => {
  const button = getComponent("ui.button")!;
  const stamped = withScreenshotEvidence(button, {
    screenshotArtifactId: "comp-ui.button",
    screenshotObjectKey: "components/ui.button/v1/abc.png",
    screenshotContentHash: "abc",
  });
  assert.equal(stamped.screenshotArtifactId, "comp-ui.button");

  const draft = { ...COMPONENT_REGISTRY[0], status: "draft" as const };
  assert.throws(() =>
    withScreenshotEvidence(draft, {
      screenshotArtifactId: "x",
      screenshotObjectKey: "x",
      screenshotContentHash: "x",
    }),
  );
});
