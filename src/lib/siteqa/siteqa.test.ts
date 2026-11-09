import assert from "node:assert/strict";
import { test } from "node:test";
import { createDesignIr } from "../design/ir.ts";
import { qaHtml, renderDesignIrHtml } from "./render.ts";

test("Design IR renders accessible responsive preview HTML", () => {
  const ir = createDesignIr({
    docId: "doc-qa",
    prospectId: "p-qa",
    title: "Home",
    businessName: "Twin Cities Builders",
    headline: "Built for the neighborhood",
  });
  const html = renderDesignIrHtml(ir);
  const qa = qaHtml(html);
  assert.equal(qa.ok, true);
  assert.match(html, /Twin Cities Builders/);
  assert.match(html, /Built for the neighborhood/);
});
