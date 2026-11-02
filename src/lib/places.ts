// Google Places API (New) Text Search: real local businesses with phone, website, rating and
// review count. Pure helpers; the fetch lives in convex/places.ts.
import {cityFromAddress, type ImportRow} from "./prospect-import";

export const PLACES_FIELDS = [
  "places.id", "places.displayName", "places.formattedAddress", "places.nationalPhoneNumber", "places.websiteUri",
  "places.rating", "places.userRatingCount", "places.googleMapsUri", "places.businessStatus", "places.primaryTypeDisplayName",
  "places.location", "nextPageToken",
].join(",");

export type Place = {
  id?: string; displayName?: { text?: string }; formattedAddress?: string; nationalPhoneNumber?: string; websiteUri?: string;
  rating?: number; userRatingCount?: number; googleMapsUri?: string; businessStatus?: string;
  primaryTypeDisplayName?: { text?: string }; location?: { latitude?: number; longitude?: number };
};

/** Search phrases that surface actual businesses for a trade (Google understands "near"). */
export function placesQueries(trade: string, city: string): string[] {
  const t = trade.trim().toLowerCase();
  const base = [`${t} in ${city}`];
  const extra: Record<string, string[]> = {
    painting: ["house painters", "painting contractors"], roofing: ["roofers", "roofing contractors"],
    hvac: ["hvac contractors", "heating and air conditioning"], plumbing: ["plumbers"], electrical: ["electricians"],
    landscaping: ["landscapers", "lawn care"], cleaning: ["house cleaning", "cleaning services"], concrete: ["concrete contractors"],
    fencing: ["fence contractors"], carpentry: ["carpenters"],
  };
  for (const q of extra[t] ?? []) base.push(`${q} in ${city}`);
  return [...new Set(base)].slice(0, 3);
}

export function placeToRow(p: Place, trade: string, fallbackCity: string): (ImportRow & { latitude?: number; longitude?: number }) | null {
  const name = p.displayName?.text?.trim();
  if (!name) return null;
  if (p.businessStatus && p.businessStatus !== "OPERATIONAL") return null;
  const lat = p.location?.latitude, lng = p.location?.longitude;
  return {
    name: name.slice(0, 160),
    trade: trade || p.primaryTypeDisplayName?.text,
    city: cityFromAddress(p.formattedAddress) ?? fallbackCity,
    website: p.websiteUri,
    phone: p.nationalPhoneNumber,
    address: p.formattedAddress,
    rating: typeof p.rating === "number" ? p.rating : undefined,
    reviews: typeof p.userRatingCount === "number" ? p.userRatingCount : undefined,
    sourceUrl: p.googleMapsUri,
    ...(Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : {}),
  };
}
