/** Seven-county Twin Cities metro geometry (axis-aligned bbox + counties). */

export type BBox = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

export const TWIN_CITIES_COUNTIES = [
  "Anoka",
  "Carver",
  "Dakota",
  "Hennepin",
  "Ramsey",
  "Scott",
  "Washington",
] as const;

/** Conservative bbox covering the seven-county metro (not city-center-only). */
export const TWIN_CITIES_BBOX: BBox = {
  minLon: -94.012,
  minLat: 44.471,
  maxLon: -92.732,
  maxLat: 45.415,
};

export function pointInBBox(
  lon: number,
  lat: number,
  bbox: BBox = TWIN_CITIES_BBOX,
): boolean {
  return (
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= bbox.minLon &&
    lon <= bbox.maxLon &&
    lat >= bbox.minLat &&
    lat <= bbox.maxLat
  );
}
