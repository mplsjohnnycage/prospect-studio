/** Embedded DuckDB Overture places extract for Twin Cities metro. */

import duckdb from "duckdb";
import { dedupePlaces, type PlaceRecord } from "./identity.ts";
import { TWIN_CITIES_BBOX } from "./metro.ts";
import { coverageReport, type CoverageReport } from "./score1.ts";

export const OVERTURE_PLACES_GLOB =
  "s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/type=place/*";

export type DiscoveryExtract = {
  version: string;
  source: string;
  bbox: typeof TWIN_CITIES_BBOX;
  extractedAt: string;
  places: PlaceRecord[];
  coverage: CoverageReport;
};

function all(
  db: duckdb.Database,
  sql: string,
): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) reject(err);
      else resolve((rows ?? []) as Record<string, unknown>[]);
    });
  });
}

function run(db: duckdb.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => (err ? reject(err) : resolve()));
  });
}

export async function extractTwinCitiesPlaces(args?: {
  limit?: number;
  sourceGlob?: string;
}): Promise<DiscoveryExtract> {
  const limit = args?.limit ?? 250;
  const source = args?.sourceGlob ?? OVERTURE_PLACES_GLOB;
  const bbox = TWIN_CITIES_BBOX;
  const db = new duckdb.Database(":memory:");
  try {
    await run(db, "INSTALL httpfs; LOAD httpfs;");
    await run(
      db,
      "CREATE SECRET (TYPE S3, KEY_ID '', SECRET '', REGION 'us-west-2');",
    );
    const sql = `
      SELECT
        id,
        names.primary AS name,
        COALESCE(addresses[1].freeform, addresses[1].locality, '') AS address,
        try_cast(bbox.xmin AS DOUBLE) AS lon,
        try_cast(bbox.ymin AS DOUBLE) AS lat,
        COALESCE(taxonomy.primary, basic_category) AS category
      FROM read_parquet('${source}')
      WHERE bbox.xmin BETWEEN ${bbox.minLon} AND ${bbox.maxLon}
        AND bbox.xmax BETWEEN ${bbox.minLon} AND ${bbox.maxLon}
        AND bbox.ymin BETWEEN ${bbox.minLat} AND ${bbox.maxLat}
        AND bbox.ymax BETWEEN ${bbox.minLat} AND ${bbox.maxLat}
        AND names.primary IS NOT NULL
      LIMIT ${limit};
    `;
    const rows = await all(db, sql);
    const places: PlaceRecord[] = rows.map((row) => {
      const lon = typeof row.lon === "number" ? row.lon : undefined;
      const lat = typeof row.lat === "number" ? row.lat : undefined;
      return {
        id: row.id ? String(row.id) : undefined,
        name: String(row.name ?? ""),
        address: row.address ? String(row.address) : undefined,
        lon,
        lat,
        category: row.category ? String(row.category) : undefined,
        source: "overture-places-2026-10-21.0",
        // Overture place bbox is not a surveyed rooftop pin.
        rooftopPrecise: false,
      };
    });
    const { unique, duplicateCount } = dedupePlaces(places);
    return {
      version: "discovery.extract.v1",
      source,
      bbox,
      extractedAt: new Date().toISOString(),
      places: unique,
      coverage: coverageReport(unique, duplicateCount, places.length),
    };
  } finally {
    db.close();
  }
}
