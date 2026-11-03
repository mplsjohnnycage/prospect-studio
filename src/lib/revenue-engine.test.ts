import test from "node:test";
import assert from "node:assert/strict";
import * as E from "./revenue-engine";
const NOW = Date.parse("2026-11-03T12:00:00Z");
const days = (n: number) => new Date(NOW - n * E.DAY).toISOString().slice(0, 10);

test("identity key prefers place id, then phone+city, never needs a website", () => {
  assert.equal(E.identityKey({ placeId: "abc" }), "place:abc");
  assert.equal(E.identityKey({ phone: "+1 (612) 555-0199", city: "Minneapolis, MN" }), "phone:6125550199:minneapolis");
  assert.equal(E.identityKey({ osmId: "node/1", name: "X" }), "osm:node/1");
  assert.match(E.identityKey({ name: "Bob's Roofing", city: "St Paul" }), /^name:bob-s-roofing:st-paul$/);
});

test("OSM elements become sourced raw records; unnamed are skipped; dedupe merges", () => {
  const r = E.osmToRecord({ type: "node", id: 7, lat: 44.9, lon: -93.2, tags: { name: "Acme Plumbing", craft: "plumber", phone: "612-555-0100" } }, "Minneapolis", NOW)!;
  assert.equal(r.sourceUrl, "https://www.openstreetmap.org/node/7");
  assert.equal(r.identityKey, "phone:6125550100:minneapolis");
  assert.equal(E.osmToRecord({ type: "node", id: 8, tags: {} }, "x"), null);
  const o = E.openDataToRecord({ business_name: "Acme Plumbing", phone: "6125550100", issue_date: days(3) + "T00:00" }, { source: "mpls_open_data", datasetUrl: "https://opendata.minneapolismn.gov/x", city: "Minneapolis", nameField: "business_name", phoneField: "phone", dateField: "issue_date", trigger: "permit" }, NOW)!;
  const merged = E.dedupeRecords([r, o]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].trigger?.type, "permit");
  assert.match(E.overpassQuery('Minneapolis"', "craft", true), /\[!website\]/);
});

test("site health: none, dead, business.site, weak", () => {
  assert.equal(E.siteHealth({}).state, "none");
  assert.equal(E.siteHealth({ url: "https://x.business.site" }).state, "dead");
  assert.equal(E.siteHealth({ url: "https://x.com", dnsFailed: true }).state, "dead");
  const w = E.siteHealth({ url: "http://x.com", html: "<html>© 2019 powered by wix.com</html>" }, 2026);
  assert.equal(w.state, "weak");
  assert.ok(w.issues.includes("No SSL"));
});

test("five gates: top tier = ads + care + weak site, trigger picked freshest", () => {
  const g = E.fiveGates({ trade: "roofing", site: E.siteHealth({ url: "http://x.com", html: "© 2018" }, 2026), adsActive: true, reviews: { lastReviewAt: NOW - 5 * E.DAY, responseRate: 0.9, count: 40 }, triggers: [{ type: "permit", date: days(40) }, { type: "new_filing", date: days(2), source: "s" }], now: NOW });
  assert.equal(g.tier, "top");
  assert.equal(g.trigger.type, "new_filing");
  assert.equal(g.gates.timing, 100);
  const h = E.fiveGates({ trade: "nail salon", site: E.siteHealth({ url: "https://ok.com", https: true, html: "<meta name=viewport> gtag( © 2026" }, 2026), now: NOW });
  assert.equal(h.passed, false);
  assert.equal(h.trigger.type, "none");
});

test("demo budget fills daily capacity, fresh triggers first, no 10% rule", () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ id: "p" + i, score: 90 - i, qualified: true, paused: false, tier: "standard" as const }));
  assert.equal(E.selectDemoBudget(items, { dailyCapacity: 5, now: NOW }).length, 5);
  const withTrig = [...items, { id: "fresh", score: 55, qualified: true, paused: false, tier: "standard" as const, trigger: { type: "permit" as const, date: days(1) } }];
  assert.equal(E.selectDemoBudget(withTrig, { dailyCapacity: 2, now: NOW })[0].id, "fresh");
  assert.equal(E.selectDemoBudget(items, { dailyCapacity: 5, usedToday: 5, now: NOW }).length, 0);
  assert.equal(E.selectDemoBudget([{ id: "low", score: 10, qualified: true, paused: false }], { dailyCapacity: 5 }).length, 0);
  const built = [{ id: "b", score: 99, qualified: true, paused: false, alreadyBuilt: true }, ...items];
  const sel = E.selectDemoBudget(built, { dailyCapacity: 2, usedToday: 1, now: NOW });
  assert.deepEqual(sel.map(x => x.id), ["b", "p0"]);
});

test("why-now email: trigger first, sourced, CAN-SPAM footer, opt-out link, DEMO", () => {
  const d = E.composeWhyNow({ name: "Acme Roofing", trade: "roofing", city: "Oakdale", trigger: { type: "new_filing", date: days(3), source: "https://mblsportal.sos.mn.gov/x" }, gap: ["Gap: No SSL"], facts: [{ text: "fast storm repairs", sourceUrl: "https://maps.example/r" }], optOutUrl: "https://app/x/optout?t=1", now: NOW });
  assert.equal(d.from, "johnnyc@agentmail.to");
  assert.match(d.body, /^Hi there,\n\nI saw Acme Roofing filed/);
  assert.match(d.body, /13 5th Ave, Oakdale, MN 55128/);
  assert.match(d.body, /DEMO/);
  assert.match(d.body, /Found it: No SSL/);
  assert.deepEqual(d.issues, []);
  assert.equal(d.onTrigger, true);
  const bad = E.composeWhyNow({ name: "X", trade: "t", city: "c", trigger: E.NO_TRIGGER, gap: [], facts: [], postalAddress: "", now: NOW });
  assert.ok(bad.alerts.length === 1 && bad.issues.some(i => /postal/.test(i)));
  assert.ok(E.claimCheck("we guarantee (https://evil)", [], E.NO_TRIGGER).length === 2);
});

test("metrics compute the five success measures", () => {
  const ev: E.OutcomeEvent[] = [
    { prospectId: "a", kind: "sent", at: 0 }, { prospectId: "b", kind: "sent", at: 0 }, { prospectId: "a", kind: "replied", at: 1 },
    { prospectId: "a", kind: "call_booked", at: 2 }, { prospectId: "a", kind: "paid", at: 0, amount: 2500 }, { prospectId: "a", kind: "live", at: 3 * 3_600_000 },
  ];
  const m = E.metrics(ev, [{ stage: "enrich", usd: 1, computeSeconds: 2 }], [{ prospectId: "a", trigger: { type: "permit", date: days(2) }, variant: "v", subject: "s", sentAt: NOW }], 4);
  assert.equal(m.demoToReply, 0.5); assert.equal(m.callToClose, 1); assert.equal(m.hoursPayToLive, 3); assert.equal(m.costPerQualified, 0.25); assert.equal(m.onTriggerShare, 1); assert.equal(m.revenue, 2500);
});

test("lookalike, calibration, promote, QA, reply intent, recheck, spend flag", () => {
  const g = { fit: 90, gap: 80, spend: 70, care: 60, timing: 100 };
  assert.equal(E.lookalike(g, [g]), 100);
  assert.equal(E.lookalike(g, []), 0);
  const lab = [...Array(5)].map(() => ({ gates: g, won: true })).concat([...Array(5)].map(() => ({ gates: { ...g, spend: 0 }, won: false })));
  const w = E.calibrateWeights(lab); assert.ok(w[2] > 0.2); assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 0.01);
  const rec = E.osmToRecord({ type: "node", id: 1, tags: { name: "A" } }, "M")!;
  const pass = E.fiveGates({ trade: "roofing", site: E.siteHealth({}), now: NOW });
  assert.equal(E.shouldPromote(rec, pass, new Set()).promote, true);
  assert.equal(E.shouldPromote(rec, pass, new Set([rec.identityKey])).promote, false);
  assert.equal(E.demoQa('<meta name="robots" content="noindex"><div>DEMO</div><a href="tel:1">call</a>').pass, true);
  assert.ok(E.demoQa("<div>hi</div>").failures.includes("No visible DEMO label"));
  assert.equal(E.classifyReply("please remove me").route, "suppress");
  assert.equal(E.classifyReply("how much would this cost?").intent, "price");
  const ok = E.siteHealth({ url: "https://a.com", https: true }); const weak = { state: "weak" as const, score: 40, issues: [] };
  assert.equal(E.recheck({ site: weak, trigger: E.NO_TRIGGER }, { site: ok, trigger: E.NO_TRIGGER }), "drop");
  assert.equal(E.paidSourceAllowed({}), false);
});

test("permit feeds aggregate to sourced contractor records with permit triggers", () => {
  const f = E.PERMIT_FEEDS.stp;
  const rows = [
    { CONTRACTORNAME: "SCOTT SPIESS SPIESS PLBG", CONTRACTORADDRESS: "493 BEAR AVE S VADNAIS HEIGHTS MN 55127 0000", ISSUEDATE: Date.parse("2026-10-01"), FOLDER_TYPE: "Plumbing", FOLDERDESCRIPTION: "bath", EST_VALUE_OF_WORK: 9000 },
    { CONTRACTORNAME: "SCOTT SPIESS SPIESS PLBG", CONTRACTORADDRESS: "493 BEAR AVE S VADNAIS HEIGHTS MN 55127 0000", ISSUEDATE: Date.parse("2026-10-20"), FOLDER_TYPE: "Plumbing", FOLDERDESCRIPTION: "x", EST_VALUE_OF_WORK: 1000 },
    { CONTRACTORNAME: "Homeowner", ISSUEDATE: 1 },
  ];
  const out = E.permitsToContractors(rows, f, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "Spiess Plbg");
  assert.equal(out[0].city, "Vadnais Heights");
  assert.equal(out[0].permitCount, 2);
  assert.equal(out[0].trigger?.date, "2026-10-20");
  assert.equal(out[0].trade, "plumbing");
  assert.match(E.permitQueryUrl(E.PERMIT_FEEDS.mpls, 0, 5), /resultRecordCount=5/);
  assert.equal(E.siteHealth({ unknown: true }).score, 50);
});
