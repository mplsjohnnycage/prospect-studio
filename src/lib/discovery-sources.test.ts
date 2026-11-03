import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, fromSbaRows } from "../../scripts/discover-local.mjs";
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
