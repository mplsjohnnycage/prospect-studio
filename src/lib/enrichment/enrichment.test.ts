import assert from "node:assert/strict";
import { test } from "node:test";
import { extractBrandDna } from "./brandDna.ts";
import { buildHandReviewQueue, score2, SCORE2_WEIGHTS_V1 } from "./score2.ts";
import {
  cheapWebsiteCheck,
  normalizeWebsiteCandidate,
} from "./websiteState.ts";

test("missing website is first-class state", () => {
  const missing = normalizeWebsiteCandidate(null);
  assert.equal(missing.state, "missing");
  const directory = normalizeWebsiteCandidate("https://www.yelp.com/biz/acme");
  assert.equal(directory.state, "directory_only");
  const found = normalizeWebsiteCandidate("example-painters.example");
  assert.equal(found.state, "found");
});

test("Score-2 blocks missing sites instead of scoring zero", () => {
  assert.equal(SCORE2_WEIGHTS_V1.version, "score2.v1");
  const brand = extractBrandDna({
    entityId: "p1",
    name: "No Site LLC",
    check: {
      version: "cheap-check.v1",
      state: "missing",
      elapsedMs: 0,
      fetchedAt: new Date().toISOString(),
      error: "No website field on source place",
    },
  });
  const scored = score2({
    score1: 0.8,
    check: {
      version: "cheap-check.v1",
      state: "missing",
      elapsedMs: 0,
      fetchedAt: new Date().toISOString(),
    },
    brand,
  });
  assert.equal(scored.total, null);
  assert.equal(scored.blockedReason, "missing_site");
  assert.equal(scored.tier, "blocked");
});

test("hand-review queue accounts for missing-site false negatives", () => {
  const queue = buildHandReviewQueue([
    {
      entityId: "a1",
      name: "A Tier Co",
      check: {
        version: "cheap-check.v1",
        state: "found",
        url: "https://a-tier.example/",
        elapsedMs: 10,
        fetchedAt: new Date().toISOString(),
      },
      score2: {
        version: "score2.v1",
        total: 0.8,
        parts: {
          score1Carry: 0.36,
          websiteReachable: 0.15,
          websiteNeed: 0.2,
          contactability: 0.15,
        },
        tier: "A",
      },
    },
    {
      entityId: "m1",
      name: "Missing Site Co",
      check: {
        version: "cheap-check.v1",
        state: "missing",
        elapsedMs: 0,
        fetchedAt: new Date().toISOString(),
      },
      score2: {
        version: "score2.v1",
        total: null,
        blockedReason: "missing_site",
        parts: {
          score1Carry: 0.3,
          websiteReachable: 0,
          websiteNeed: null,
          contactability: 0,
        },
        tier: "blocked",
      },
    },
  ]);
  assert.equal(queue.aTier.length, 1);
  assert.equal(queue.missingSiteAccounted.length, 1);
  assert.equal(queue.missingSiteAccounted[0].reviewStatus, "missing_site_accounted");
});

test("cheapWebsiteCheck uses injected fetch", async () => {
  const html =
    "<html><head><title>Acme Painting</title></head><body>Licensed painters. Call (612) 555-0100 for a free estimate. #112233</body></html>";
  const check = await cheapWebsiteCheck("https://acme.example/", async () =>
    new Response(html, {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  );
  assert.equal(check.state, "found");
  assert.equal(check.title, "Acme Painting");
  const brand = extractBrandDna({
    entityId: "acme",
    name: "Acme Painting",
    check,
    html,
  });
  assert.ok((brand.phones.value?.length ?? 0) >= 1);
  assert.equal(brand.colors.tag, "inferred");
  assert.equal(brand.voice.tag, "unknown");
});
