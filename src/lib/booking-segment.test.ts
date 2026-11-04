import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingPage, parseSegmentExtras, segmentFields } from "./booking";
import { systemFor } from "./revenue-build";
import { composeWhyNow } from "./revenue-engine";

test("segment form: home services asks for the job address and requires it", () => {
  const spec = systemFor("home_services");
  assert.deepEqual(segmentFields(spec).map(f => f.name), ["address", "details"]);
  const html = bookingPage({ businessName: "Acme", senderBrand: "Found It. Fix It.", demoHref: "/demo/x", system: spec });
  assert.match(html, /Request a quote/); assert.match(html, /name="address"[^>]*required/);
  assert.equal(parseSegmentExtras("name=A&phone=6125550100", spec).ok, false);
  const ok = parseSegmentExtras("address=12+Main+St&details=leaky+roof", spec);
  assert.ok(ok.ok && ok.note.includes("Job address: 12 Main St"));
});
test("proposal link appears only when passed (flag off by default)", () => {
  const base = { name: "Acme", trade: "hvac", city: "Edina", trigger: { type: "none" as const }, gap: [], facts: [], optOutUrl: "https://x/optout/a" };
  assert.doesNotMatch(composeWhyNow(base).body, /Prices and options/);
  const d = composeWhyNow({ ...base, proposalUrl: "https://x.convex.site/proposal/abc" });
  assert.match(d.body, /Prices and options, if useful: https:\/\/x.convex.site\/proposal\/abc/);
  assert.equal(d.issues.filter(i => i.startsWith("Unsourced")).length, 0);
});
