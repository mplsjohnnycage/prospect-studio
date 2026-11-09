/** Score-1 v1 constants — explicit, checked into repo. */

import type { ResolvedPlace } from "./identity.ts";
import { TWIN_CITIES_BBOX, pointInBBox } from "./metro.ts";

export const SCORE1_WEIGHTS_V1 = {
  version: "score1.v1",
  inMetroBBox: 0.35,
  hasAddress: 0.2,
  hasCoordinates: 0.2,
  rooftopPrecise: 0.15,
  hasCategory: 0.1,
} as const;

export type Score1Breakdown = {
  total: number;
  parts: {
    version: string;
    inMetroBBox: number;
    hasAddress: number;
    hasCoordinates: number;
    rooftopPrecise: number;
    hasCategory: number;
  };
};

export function score1(place: ResolvedPlace): Score1Breakdown {
  const parts = {
    version: SCORE1_WEIGHTS_V1.version,
    inMetroBBox: 0,
    hasAddress: 0,
    hasCoordinates: 0,
    rooftopPrecise: 0,
    hasCategory: 0,
  };
  if (
    place.lon !== undefined &&
    place.lat !== undefined &&
    pointInBBox(place.lon, place.lat, TWIN_CITIES_BBOX)
  ) {
    parts.inMetroBBox = SCORE1_WEIGHTS_V1.inMetroBBox;
  }
  if (place.addressNorm) parts.hasAddress = SCORE1_WEIGHTS_V1.hasAddress;
  if (Number.isFinite(place.lon) && Number.isFinite(place.lat)) {
    parts.hasCoordinates = SCORE1_WEIGHTS_V1.hasCoordinates;
  }
  if (place.rooftopPrecise) parts.rooftopPrecise = SCORE1_WEIGHTS_V1.rooftopPrecise;
  if (place.category) parts.hasCategory = SCORE1_WEIGHTS_V1.hasCategory;
  const total =
    parts.inMetroBBox +
    parts.hasAddress +
    parts.hasCoordinates +
    parts.rooftopPrecise +
    parts.hasCategory;
  return { total: Number(total.toFixed(4)), parts };
}

export type CoverageReport = {
  version: string;
  bbox: typeof TWIN_CITIES_BBOX;
  inputCount: number;
  uniqueCount: number;
  duplicateCount: number;
  inBBoxCount: number;
  rooftopPreciseCount: number;
  cityCenterProxyCount: number;
  meanScore1: number;
  notes: string[];
};

export function coverageReport(
  unique: ResolvedPlace[],
  duplicateCount: number,
  inputCount: number,
): CoverageReport {
  const inBBox = unique.filter(
    (p) =>
      p.lon !== undefined &&
      p.lat !== undefined &&
      pointInBBox(p.lon, p.lat),
  );
  const rooftopPreciseCount = unique.filter((p) => p.rooftopPrecise).length;
  const cityCenterProxyCount = unique.filter(
    (p) => Number.isFinite(p.lon) && Number.isFinite(p.lat) && !p.rooftopPrecise,
  ).length;
  const scores = unique.map((p) => score1(p).total);
  const meanScore1 = scores.length
    ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(4))
    : 0;
  return {
    version: SCORE1_WEIGHTS_V1.version,
    bbox: TWIN_CITIES_BBOX,
    inputCount,
    uniqueCount: unique.length,
    duplicateCount,
    inBBoxCount: inBBox.length,
    rooftopPreciseCount,
    cityCenterProxyCount,
    meanScore1,
    notes: [
      "Coordinates without rooftopPrecise are not treated as rooftop precision.",
      "City-center proxies are counted separately and do not receive rooftopPrecise weight.",
      "Score-1 weights are SCORE1_WEIGHTS_V1 constants.",
    ],
  };
}
