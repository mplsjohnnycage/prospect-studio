import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrandDna } from "../enrichment/brandDna.ts";
import {
  buildVisualPrompt,
  checkImageProviderPermission,
  generateProspectVisual,
} from "./imageProvider.ts";
import { retrieveLayoutPriors } from "./layoutPriors.ts";
import { buildReferenceBundle } from "./referenceBundle.ts";

const brand: BrandDna = {
  version: "brand-dna.v1",
  entityId: "p1",
  name: { value: "Northside Painters", tag: "verified" },
  website: { value: "https://northside.example/", tag: "verified" },
  phones: { value: [], tag: "unknown" },
  emails: { value: [], tag: "unknown" },
  services: { value: ["painting"], tag: "inferred" },
  trustSignals: { value: ["licensed"], tag: "inferred" },
  colors: { value: ["#123456"], tag: "inferred" },
  voice: { value: null, tag: "unknown" },
  siteOpportunity: { value: 40, tag: "inferred" },
  unknownFields: ["voice"],
  extractedAt: new Date().toISOString(),
};

test("layout priors come only from approved registry entries", () => {
  const priors = retrieveLayoutPriors();
  assert.ok(priors.length >= 1);
  assert.ok(priors.every((p) => p.componentId.startsWith("ui.")));
});

test("reference bundle keeps assets proposed and unknown fields explicit", () => {
  const bundle = buildReferenceBundle({
    prospectId: "p1",
    prospectName: "Northside Painters",
    brand,
    layoutPriors: retrieveLayoutPriors(),
  });
  assert.equal(bundle.generationPolicy.assetsAre, "generated_proposed");
  assert.equal(bundle.generationPolicy.mayNotClaimVerifiedBrand, true);
  assert.deepEqual(bundle.unknownFields, ["voice"]);
  assert.match(buildVisualPrompt(bundle), /Northside Painters/);
});

test("provider permission refuses generation without API key", () => {
  const denied = checkImageProviderPermission({});
  assert.equal(denied.allowed, false);
  const allowed = checkImageProviderPermission({ GEMINI_API_KEY: "test-key-12345" });
  assert.equal(allowed.allowed, true);
});

test("generateProspectVisual traces inputs and marks output proposed", async () => {
  const bundle = buildReferenceBundle({
    prospectId: "p1",
    prospectName: "Northside Painters",
    brand,
    layoutPriors: retrieveLayoutPriors(),
  });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const asset = await generateProspectVisual({
    apiKey: "test-key",
    bundle,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: png.toString("base64"),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
  assert.equal(asset.trace.output.reviewStatus, "generated_proposed");
  assert.equal(asset.trace.input.prospectId, "p1");
  assert.ok(asset.trace.output.sha256.length === 64);
  assert.ok(asset.bytes.byteLength > 0);
});
