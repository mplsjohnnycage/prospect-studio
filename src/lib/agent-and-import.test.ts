import test from "node:test";
import assert from "node:assert/strict";
import {businessKey,cityFromAddress,parseCsv,parseImport} from "./prospect-import";
import {cleanError,runAgentLoop,runAgentLoopOmni} from "./agent-loop";

test("parses an Apify Google Maps style JSON export", () => {
  const json = JSON.stringify([
    { title: "Acme Painting", categoryName: "Painter", address: "12 Main St, Oakdale, MN 55128, United States", phone: "(651) 555-0100", website: "acmepainting.com", totalScore: 4.8, reviewsCount: 112, url: "https://www.google.com/maps/place/acme" },
    { title: "" },
  ]);
  const { rows, skipped } = parseImport(json);
  assert.equal(skipped, 1);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.name, "Acme Painting");
  assert.equal(r.trade, "Painter");
  assert.equal(r.city, "Oakdale, MN");
  assert.equal(r.website, "https://acmepainting.com");
  assert.equal(r.rating, 4.8);
  assert.equal(r.reviews, 112);
  assert.equal(r.sourceUrl, "https://www.google.com/maps/place/acme");
});

test("parses CSV with quoted commas and Outscraper column names", () => {
  const csv = 'name,full_address,phone,site,rating,reviews,email\n"Bright Roofing, LLC","9 Elm Rd, Woodbury, MN 55125",651-555-0111,https://brightroof.example,4.6,40,hello@brightroof.example\n';
  const { rows } = parseImport(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Bright Roofing, LLC");
  assert.equal(rows[0].city, "Woodbury, MN");
  assert.equal(rows[0].email, "hello@brightroof.example");
  assert.equal(rows[0].website, "https://brightroof.example");
});

test("csv parser handles escaped quotes and CRLF", () => {
  const out = parseCsv('a,b\r\n"say ""hi""",2\r\n');
  assert.deepEqual(out, [{ a: 'say "hi"', b: "2" }]);
});

test("invalid emails are dropped and city falls back to address", () => {
  const { rows } = parseImport(JSON.stringify([{ name: "X Co", email: "not-an-email", address: "1 A St, Stillwater, MN 55082" }]));
  assert.equal(rows[0].email, undefined);
  assert.equal(cityFromAddress("1 A St, Stillwater, MN 55082, USA"), "Stillwater, MN");
});

test("business key ignores state suffix and punctuation", () => {
  assert.equal(businessKey("North Star Painting", "Minneapolis"), businessKey("North-Star  Painting", "Minneapolis, MN"));
  assert.notEqual(businessKey("North Star Painting", "St. Paul"), businessKey("North Star Painting", "Minneapolis"));
});

function fakeGemini(replies: unknown[]) {
  const bodies: unknown[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const next = replies.shift();
    if (typeof next === "number") return new Response(JSON.stringify({ error: { message: "busy" } }), { status: next });
    return new Response(JSON.stringify(next), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, bodies };
}

test("agent loop runs tools, passes results back, and returns the answer", async () => {
  const { fetchImpl, bodies } = fakeGemini([
    { candidates: [{ content: { role: "model", parts: [{ functionCall: { id: "c1", name: "get_prospect", args: { prospectId: "p1" } }, thoughtSignature: "sig" }] } }] },
    { candidates: [{ content: { role: "model", parts: [{ text: "North Star is ready for an email." }] } }] },
  ]);
  const called: string[] = [];
  const out = await runAgentLoop({
    apiKey: "k", models: ["m1"], system: "s", history: [], prompt: "status?", tools: [],
    callTool: async (name) => { called.push(name); return { ok: true }; }, fetchImpl,
  });
  assert.deepEqual(called, ["get_prospect"]);
  assert.equal(out.text, "North Star is ready for an email.");
  assert.deepEqual(out.touched, ["p1"]);
  assert.deepEqual(out.steps, [{ tool: "get_prospect", ok: true }]);
  // The model's own parts (with the thought signature) are sent back unchanged.
  const second = bodies[1] as { contents: { role: string; parts: Record<string, unknown>[] }[] };
  assert.equal(second.contents[1].parts[0].thoughtSignature, "sig");
  assert.equal((second.contents[2].parts[0].functionResponse as { id: string }).id, "c1");
});

test("agent loop falls back to the next model when the first is overloaded, and reports tool errors", async () => {
  const { fetchImpl } = fakeGemini([
    503,
    { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "build_demo", args: {} } }] } }] },
    { candidates: [{ content: { role: "model", parts: [{ text: "Couldn't build it yet." }] } }] },
  ]);
  const out = await runAgentLoop({
    apiKey: "k", models: ["busy-model", "m2"], system: "s", history: [], prompt: "build", tools: [],
    callTool: async () => { throw new Error("Research the business website first."); }, fetchImpl,
  });
  assert.equal(out.model, "m2");
  assert.equal(out.steps[0].ok, false);
  assert.match(out.steps[0].error ?? "", /Research the business website first/);
});

test("cleanError keeps one readable line", () => {
  assert.equal(cleanError("[Request ID: abc] Server Error\nUncaught Error: The first email was already sent.\n    at handler (../../convex/sales.ts:49:54)"), "The first email was already sent.");
  assert.equal(cleanError("Plain failure\nstack"), "Plain failure");
});

import {brandAccent,contrast,pickPreset,presetBrief,presetTokens,PRESETS} from "./design-presets";
import {parseReview} from "./demo-generation";

test("presets match trades and never use banned fonts", () => {
  assert.equal(pickPreset("Painting").id, "editorial-craft");
  assert.equal(pickPreset("Roofing").id, "bold-industrial");
  assert.equal(pickPreset("HVAC").id, "clean-technical");
  assert.equal(pickPreset("Landscaping").id, "organic-natural");
  assert.equal(pickPreset("House Cleaning").id, "fresh-minimal");
  assert.equal(pickPreset("Underwater basket weaving").id, "heritage-trust");
  for (const p of PRESETS) {
    assert.doesNotMatch(p.display + p.body, /inter|roboto|arial|helvetica/i);
    assert.ok(contrast(p.tokens.ink, p.tokens.bg) >= 7, p.id + " body text contrast");
    assert.ok(contrast(p.tokens.accent, p.tokens.accentInk) >= 4.5, p.id + " button contrast");
  }
});

test("brand color replaces the accent only when it is saturated and readable", () => {
  assert.equal(brandAccent(["#ffffff", "#111111", "#d12f2f"]), "#d12f2f");
  assert.equal(brandAccent(["#f5f5f5", "#222222"]), null);
  const t = presetTokens(pickPreset("Painting"), ["#0b5fa5"]);
  assert.equal(t.accent, "#0b5fa5");
  assert.equal(t.brandColorUsed, true);
  assert.match(presetBrief(pickPreset("Painting"), []), /fonts\.googleapis\.com\/css2\?family=Fraunces/);
});

test("review parsing tolerates prose and clamps the score", () => {
  assert.deepEqual(parseReview('Here you go: {"score": 7.46, "fixes": ["Tighten hero spacing", "x"]}'), {score: 7.5, fixes: ["Tighten hero spacing"]});
  assert.equal(parseReview("no json"), null);
  assert.equal(parseReview('{"score": 14, "fixes": []}')?.score, 10);
});

import {bookingPage,injectBookingCta,isHumanView,parseBookingForm} from "./booking";

test("only real browser visits count as demo views", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
  const chrome = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1";
  assert.equal(isHumanView(h({ "user-agent": chrome, accept: "text/html,application/xhtml+xml", "sec-fetch-dest": "document" })), true);
  assert.equal(isHumanView(h({ "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)", accept: "text/html" })), false);
  assert.equal(isHumanView(h({ "user-agent": "Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook)", accept: "text/html" })), false);
  assert.equal(isHumanView(h({ "user-agent": chrome, accept: "*/*", "sec-fetch-dest": "image" })), false);
  assert.equal(isHumanView(h({ accept: "text/html" })), false);
});

test("booking form needs a name and a way to reach them, and drops honeypot spam", () => {
  assert.deepEqual(parseBookingForm("name=Dana&phone=612-555-0147&preferred=Saturday"), { ok: true, value: { name: "Dana", phone: "612-555-0147", email: "", preferred: "Saturday", note: "" } });
  assert.equal(parseBookingForm("name=Dana").ok, false);
  assert.equal(parseBookingForm("name=Dana&email=bad").ok, false);
  const spam = parseBookingForm("name=Bot&email=a@b.co&website=http://spam");
  assert.equal(spam.ok, false);
  assert.equal(!spam.ok && spam.spam, true);
});

test("booking CTA is injected once and the page escapes prospect text", () => {
  const once = injectBookingCta("<html><body><p>x</p></body></html>", "/book/abc", false);
  assert.equal(injectBookingCta(once, "/book/abc", false), once);
  assert.match(once, /data-book-cta href="\/book\/abc"/);
  const page = bookingPage({ businessName: "<script>x</script>", senderBrand: "Found It. Fix It.", demoHref: "/demo/abc", values: { name: '"><img src=x>' } });
  assert.doesNotMatch(page, /<script>x<\/script>|<img src=x>/);
});

import {DEFAULT_PACKAGES,parseAcceptForm,proposalPage,validatePackages} from "./pricing";
import {followUpText} from "./sales";

test("price list validation normalizes ids and rejects bad input", () => {
  const out = validatePackages([{ name: "Starter Site", setup: 1200.4, monthly: 49, includes: [" One page ", ""] }]);
  assert.deepEqual(out, [{ id: "starter-site", name: "Starter Site", setup: 1200, monthly: 49, includes: ["One page"] }]);
  assert.throws(() => validatePackages([]));
  assert.throws(() => validatePackages([{ name: "A", setup: -1, monthly: 0, includes: [] }]));
  assert.throws(() => validatePackages([{ name: "A", setup: 1, monthly: 0, includes: [], paymentUrl: "http://insecure" }]));
  assert.throws(() => validatePackages([{ name: "A", setup: 1, monthly: 0, includes: [] }, { name: "a", setup: 1, monthly: 0, includes: [] }]));
});

test("accepting a proposal needs a package, name, email and the checkbox", () => {
  assert.equal(parseAcceptForm("package=starter&name=Dana&email=d%40x.co&agree=yes", DEFAULT_PACKAGES).ok, true);
  assert.equal(parseAcceptForm("package=nope&name=Dana&email=d%40x.co&agree=yes", DEFAULT_PACKAGES).ok, false);
  assert.equal(parseAcceptForm("package=starter&name=Dana&email=d%40x.co", DEFAULT_PACKAGES).ok, false);
  const page = proposalPage({ business: "<b>x</b>", senderBrand: "F", packages: DEFAULT_PACKAGES, note: "<script>" });
  assert.doesNotMatch(page, /<b>x<\/b>|<script>/);
  assert.match(page, /\$1,200/);
});

test("follow-up copy includes the demo link and stays short", () => {
  const one = followUpText(1, { name: "Acme", demoUrl: "https://x.convex.site/demo/abc" });
  assert.match(one, /Acme/);
  assert.match(one, /demo\/abc/);
  assert.ok(one.length < 500);
  assert.match(followUpText(2, { name: "Acme" }), /Last note/);
});

import {placeToRow,placesQueries} from "./places";

test("google places results become import rows; closed businesses are skipped", () => {
  const row = placeToRow({ id: "x", displayName: { text: "Acme Painting" }, formattedAddress: "12 Main St, Oakdale, MN 55128, USA", nationalPhoneNumber: "(651) 555-0100", websiteUri: "https://acme.example/", rating: 4.9, userRatingCount: 88, googleMapsUri: "https://maps.google.com/?cid=1", businessStatus: "OPERATIONAL", location: { latitude: 44.96, longitude: -92.96 } }, "Painting", "Oakdale, MN");
  assert.equal(row?.city, "Oakdale, MN");
  assert.equal(row?.reviews, 88);
  assert.equal(row?.latitude, 44.96);
  assert.equal(placeToRow({ displayName: { text: "Gone LLC" }, businessStatus: "CLOSED_PERMANENTLY" }, "Painting", "X"), null);
  assert.deepEqual(placesQueries("Painting", "Oakdale, MN"), ["painting in Oakdale, MN", "house painters in Oakdale, MN", "painting contractors in Oakdale, MN"]);
});

function fakeOmni(replies: unknown[]) {
  const calls: {url: string; body: Record<string, unknown>}[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({url: String(url), body: JSON.parse(String(init.body)) as Record<string, unknown>});
    const next = replies.shift();
    if (typeof next === "number") return new Response(JSON.stringify({error: {message: "busy"}}), {status: next});
    return new Response(JSON.stringify(next), {status: 200});
  }) as unknown as typeof fetch;
  return {fetchImpl, calls};
}

test("omni agent loop runs tools over the OpenAI-compatible API and returns the answer", async () => {
  const {fetchImpl, calls} = fakeOmni([
    {choices: [{message: {content: "", tool_calls: [{id: "t1", type: "function", function: {name: "get_prospect", arguments: JSON.stringify({prospectId: "p9"})}}]}, finish_reason: "tool_calls"}]},
    {choices: [{message: {content: "Acme is ready for outreach."}, finish_reason: "stop"}]},
  ]);
  const called: string[] = [];
  const out = await runAgentLoopOmni({
    baseUrl: "https://omni.example/omni", apiKey: "k", models: ["omni:auto"], system: "sys", history: [], prompt: "hi",
    tools: [{name: "get_prospect", description: "d", parametersJsonSchema: {type: "object", properties: {prospectId: {type: "string"}}}}],
    callTool: async (name) => { called.push(name); return {ok: true}; }, fetchImpl,
  });
  assert.deepEqual(called, ["get_prospect"]);
  assert.equal(out.text, "Acme is ready for outreach.");
  assert.equal(out.model, "omni:auto");
  assert.deepEqual(out.touched, ["p9"]);
  assert.deepEqual(out.steps, [{tool: "get_prospect", ok: true}]);
  assert.equal(calls[0].url, "https://omni.example/omni/v1/chat/completions");
  assert.equal(calls[0].body.model, "auto");
  const second = calls[1].body.messages as {role: string; content?: string; tool_call_id?: string}[];
  assert.equal(second[second.length - 1].role, "tool");
  assert.equal(second[second.length - 1].tool_call_id, "t1");
});

test("omni agent loop falls back to the next model when the first is overloaded", async () => {
  const {fetchImpl} = fakeOmni([
    503,
    {choices: [{message: {content: "Recovered."}, finish_reason: "stop"}]},
  ]);
  const out = await runAgentLoopOmni({
    baseUrl: "http://h:20128", apiKey: "k", models: ["omni:a", "omni:b"], system: "sys", history: [], prompt: "hi",
    tools: [], callTool: async () => ({}), fetchImpl,
  });
  assert.equal(out.model, "omni:b");
  assert.equal(out.text, "Recovered.");
});
