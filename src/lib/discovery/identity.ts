/** Place identity resolver — no city-center proxy as rooftop precision. */

export type PlaceRecord = {
  id?: string;
  name: string;
  address?: string;
  lon?: number;
  lat?: number;
  category?: string;
  source: string;
  /** True only when coordinates are feature-level, not centroid proxies. */
  rooftopPrecise: boolean;
};

export type ResolvedPlace = PlaceRecord & {
  placeKey: string;
  nameNorm: string;
  addressNorm: string;
};

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'#]/g, " ")
    .replace(/\b(llc|inc|co|company|ltd)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAddress(address: string | undefined): string {
  if (!address) return "";
  return address
    .toLowerCase()
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\broad\b/g, "rd")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function placeKey(input: {
  name: string;
  address?: string;
  lon?: number;
  lat?: number;
}): string {
  const nameNorm = normalizeName(input.name);
  const addressNorm = normalizeAddress(input.address);
  if (addressNorm) return `${nameNorm}|${addressNorm}`;
  if (
    Number.isFinite(input.lon) &&
    Number.isFinite(input.lat) &&
    input.lon !== undefined &&
    input.lat !== undefined
  ) {
    // ~11m grid — identity assist only, not claimed rooftop precision
    return `${nameNorm}|${input.lon.toFixed(4)},${input.lat.toFixed(4)}`;
  }
  return nameNorm;
}

export function resolvePlace(place: PlaceRecord): ResolvedPlace {
  const nameNorm = normalizeName(place.name);
  const addressNorm = normalizeAddress(place.address);
  return {
    ...place,
    nameNorm,
    addressNorm,
    placeKey: placeKey(place),
    rooftopPrecise: place.rooftopPrecise === true,
  };
}

export function dedupePlaces(places: PlaceRecord[]): {
  unique: ResolvedPlace[];
  duplicateCount: number;
} {
  const seen = new Map<string, ResolvedPlace>();
  let duplicateCount = 0;
  for (const p of places) {
    const resolved = resolvePlace(p);
    if (seen.has(resolved.placeKey)) {
      duplicateCount += 1;
      continue;
    }
    seen.set(resolved.placeKey, resolved);
  }
  return { unique: [...seen.values()], duplicateCount };
}
