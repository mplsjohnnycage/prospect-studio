import test from "node:test";
import assert from "node:assert/strict";
import {businessKey,cityFromAddress,parseCsv,parseImport} from "./prospect-import";
import {cleanError,runAgentLoop} from "./agent-loop";

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
