import assert from "node:assert/strict";
import { test } from "node:test";
import { dedupePlaces, normalizeName, placeKey } from "./identity.ts";
import { TWIN_CITIES_BBOX, pointInBBox } from "./metro.ts";
import { SCORE1_WEIGHTS_V1, coverageReport, score1 } from "./score1.ts";
import { resolvePlace } from "./identity.ts";

test("metro bbox covers Minneapolis and rejects far-away points", () => {
  assert.equal(pointInBBox(-93.265, 44.977, TWIN_CITIES_BBOX), true);
  assert.equal(pointInBBox(-87.629, 41.878, TWIN_CITIES_BBOX), false);
});

test("identity resolver dedupes same name+address", () => {
  const { unique, duplicateCount } = dedupePlaces([
    {
      name: "Acme Painting LLC",
      address: "123 Main Street, Minneapolis",
      source: "test",
      rooftopPrecise: false,
    },
    {
      name: "Acme Painting",
      address: "123 Main St, Minneapolis",
      source: "test",
      rooftopPrecise: false,
    },
  ]);
  assert.equal(normalizeName("Acme Painting LLC"), "acme painting");
  assert.equal(unique.length, 1);
  assert.equal(duplicateCount, 1);
  assert.equal(
    placeKey({
      name: "Acme Painting LLC",
      address: "123 Main Street",
    }),
    placeKey({ name: "Acme Painting", address: "123 Main St" }),
  );
});

test("Score-1 weights are explicit v1 constants and ignore city-center proxy rooftop", () => {
  assert.equal(SCORE1_WEIGHTS_V1.version, "score1.v1");
  const sum =
    SCORE1_WEIGHTS_V1.inMetroBBox +
    SCORE1_WEIGHTS_V1.hasAddress +
    SCORE1_WEIGHTS_V1.hasCoordinates +
    SCORE1_WEIGHTS_V1.rooftopPrecise +
    SCORE1_WEIGHTS_V1.hasCategory;
  assert.equal(Number(sum.toFixed(2)), 1);

  const proxy = resolvePlace({
    name: "Proxy Shop",
    address: "1 Nicollet Mall",
    lon: -93.27,
    lat: 44.98,
    category: "paint",
    source: "test",
    rooftopPrecise: false,
  });
  const scored = score1(proxy);
  assert.equal(scored.parts.rooftopPrecise, 0);
  assert.ok(scored.total < 1);

  const report = coverageReport([proxy], 0, 1);
  assert.equal(report.cityCenterProxyCount, 1);
  assert.equal(report.rooftopPreciseCount, 0);
});
