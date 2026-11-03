import test from "node:test";
import assert from "node:assert/strict";
import * as B from "./revenue-build";
import {demoQa} from "./revenue-engine";
const facts = [{ text: "Storm repairs in 48 hours", sourceUrl: "https://maps/r1" }, { text: "Roof replacement", sourceUrl: "https://site/s" }, { text: "Gutters", sourceUrl: "https://site/s" }];

test("DemoIR renders deterministically, every claim cited, passes demo QA", () => {
  const ir = B.buildIR({ name: "Acme <Roofing>", city: "Oakdale", trade: "roofing", facts, images: [{ src: "https://img/1.jpg", alt: "roof", factIdx: 0 }] });
  assert.deepEqual(B.irIssues(ir, facts), []);
  const html = B.renderIR(ir, facts, "/book/x");
  assert.equal(html, B.renderIR(ir, facts, "/book/x"));
  assert.match(html, /Acme &lt;Roofing&gt;/);
  assert.equal((html.match(/class="src"/g) ?? []).length, 3);
  assert.equal(demoQa(html, facts).pass, true);
  assert.ok(B.irIssues({ ...ir, images: [] }, facts).includes("No sourced images (images-first)"));
});
test("segment systems + submission validation", () => {
  assert.equal(B.systemFor(B.segmentFor("dentist")).kind, "intake");
  assert.equal(B.systemFor(B.segmentFor("plumbing")).kind, "quote");
  assert.deepEqual(B.validateSubmission(B.systemFor("real_estate"), { name: "a", phone: "1" }), ["Preferred time is required"]);
});
test("NPI, brand DNA, contacts, grid, bands, leases, production, proposal", () => {
  const n = B.npiToFields({ number: 123, basic: { organization_name: "Smile Dental" }, addresses: [{ address_purpose: "LOCATION", city: "OAKDALE", state: "MN", telephone_number: "651-555-0100" }], taxonomies: [{ desc: "Dentist", primary: true }] });
  assert.equal(n.name, "Smile Dental"); assert.match(n.sourceUrl, /123$/);
  assert.match(B.npiSearchUrl("Oakdale", "Dentist"), /state=MN/);
  const d = B.brandDna([{ text: "Friendly crew, fast cleanup, friendly and honest pricing all around", url: "u1" }, { text: "Fast and friendly service", url: "u2" }]);
  assert.equal(d.tone, "warm"); assert.ok(d.themes.includes("friendly"));
  assert.equal(B.bestContact({ emails: ["bob@gmail.com", "info@acme.com"] }).value, "info@acme.com");
  assert.equal(B.bestContact({}).channel, "none");
  assert.equal(B.gridTiles([0, 0, 0.1, 0.1], 0.05).length, 4);
  assert.ok(B.fitFromBand("home_services") > B.fitFromBand("restaurant_salon_auto"));
  const t = { id: "t", status: "queued" as const, attempts: 0 };
  const c = B.claim(t, "chatgpt", 0)!; assert.equal(c.claimedBy, "chatgpt");
  assert.equal(B.claim(c, "builtin", 1000), null);
  assert.equal(B.nextForBuiltin([c], 6 * 60_000)?.id, "t");
  let s = B.advance({}, "paid", 0); assert.throws(() => B.advance(s, "site_live", 1));
  for (const st of ["repo_created", "domain_connected", "backend_live", "site_live"] as const) s = B.advance(s, st, 2 * 3_600_000);
  assert.equal(B.hoursToLive(s), 2);
  assert.equal(B.proposalLine("https://p", false), "");
  assert.match(B.proposalLine("https://p", true), /https:\/\/p/);
});
