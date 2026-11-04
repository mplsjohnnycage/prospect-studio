import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, fromSbaRows, tileCoverage } from "../../scripts/discover-local.mjs";
import { parseAgo } from "../../scripts/scrape-reviews.mjs";
import { fiveGates, siteHealth } from "./revenue-engine";

test("SBA FOIA CSV: quoted commas parse; only MN borrowers; sba_loan trigger", () => {
  const csv = 'BorrName,BorrCity,BorrState,ApprovalDate,NaicsDescription\n"Acme Roofing, LLC",Edina,MN,2026-09-01,Roofing Contractors\nOther Co,Fargo,ND,2026-09-01,Bakeries\n';
  const rows = parseCsv(csv);
  assert.equal(rows[0].borrname, "Acme Roofing, LLC");
  const recs = fromSbaRows(rows);
  assert.equal(recs.length, 1); assert.equal(recs[0].trigger?.type, "sba_loan"); assert.equal(recs[0].source, "sba");
  assert.match(recs[0].sourceUrl, /^https:\/\/data\.sba\.gov/);
});
test("price band feeds the Fit gate", () => {
  const site = siteHealth({ url: undefined });
  const a = fiveGates({ trade: "roofing", site }), b = fiveGates({ trade: "roofing", fitBand: 10, site });
  assert.ok(b.gates.fit < a.gates.fit); assert.ok(b.reasons.some(r => r.startsWith("Fit: segment price band")));
});

test("grid sweep records tiles per source; no-coordinate records counted", () => {
  const tiles: [number, number, number, number][] = [[44.9, -93.3, 44.95, -93.25], [44.95, -93.3, 45, -93.25]];
  const c = tileCoverage([{ source: "osm", lat: 44.92, lon: -93.27 }, { source: "osm", lat: 44.97, lon: -93.27 }, { source: "sba" }], tiles);
  assert.deepEqual(c.rows.map(r => r.tile).sort(), [0, 1]); assert.equal(c.noCoords, 1);
});
test("review age text parses", () => {
  assert.equal(parseAgo("2 weeks ago", 1_000_000_000_000), 1_000_000_000_000 - 2 * 6048e5);
  assert.equal(parseAgo("a month ago", 1e12), 1e12 - 2592e6);
});
