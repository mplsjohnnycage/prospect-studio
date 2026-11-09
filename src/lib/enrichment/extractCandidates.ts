/** Pull Twin Cities places with website fields for enrichment shortlist. */

import duckdb from "duckdb";
import { TWIN_CITIES_BBOX } from "../discovery/metro.ts";
import { score1 } from "../discovery/score1.ts";
import { resolvePlace } from "../discovery/identity.ts";

export const OVERTURE_PLACES_GLOB =
  "s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/type=place/*";

export type EnrichmentCandidate = {
  id: string;
  name: string;
  address?: string;
  lon?: number;
  lat?: number;
  category?: string;
  websiteRaw?: string | null;
  phones?: string[];
  emails?: string[];
  score1: number;
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

export async function extractEnrichmentCandidates(args?: {
  limit?: number;
  requireWebsite?: boolean;
}): Promise<EnrichmentCandidate[]> {
  const limit = args?.limit ?? 80;
  const requireWebsite = args?.requireWebsite ?? false;
  const bbox = TWIN_CITIES_BBOX;
  const db = new duckdb.Database(":memory:");
  try {
    await run(db, "INSTALL httpfs; LOAD httpfs;");
    await run(
      db,
      "CREATE SECRET (TYPE S3, KEY_ID '', SECRET '', REGION 'us-west-2');",
    );
    const websiteFilter = requireWebsite
      ? "AND websites IS NOT NULL AND len(websites) > 0"
      : "";
    const sql = `
      SELECT
        id,
        names.primary AS name,
        COALESCE(addresses[1].freeform, addresses[1].locality, '') AS address,
        try_cast(bbox.xmin AS DOUBLE) AS lon,
        try_cast(bbox.ymin AS DOUBLE) AS lat,
        COALESCE(taxonomy.primary, basic_category) AS category,
        websites[1] AS website,
        phones,
        emails
      FROM read_parquet('${OVERTURE_PLACES_GLOB}')
      WHERE bbox.xmin BETWEEN ${bbox.minLon} AND ${bbox.maxLon}
        AND bbox.xmax BETWEEN ${bbox.minLon} AND ${bbox.maxLon}
        AND bbox.ymin BETWEEN ${bbox.minLat} AND ${bbox.maxLat}
        AND bbox.ymax BETWEEN ${bbox.minLat} AND ${bbox.maxLat}
        AND names.primary IS NOT NULL
        ${websiteFilter}
      LIMIT ${limit};
    `;
    const rows = await all(db, sql);
    return rows.map((row) => {
      const place = resolvePlace({
        id: row.id ? String(row.id) : undefined,
        name: String(row.name ?? ""),
        address: row.address ? String(row.address) : undefined,
        lon: typeof row.lon === "number" ? row.lon : undefined,
        lat: typeof row.lat === "number" ? row.lat : undefined,
        category: row.category ? String(row.category) : undefined,
        source: "overture-places-2026-10-21.0",
        rooftopPrecise: false,
      });
      return {
        id: place.id ?? place.placeKey,
        name: place.name,
        address: place.address,
        lon: place.lon,
        lat: place.lat,
        category: place.category,
        websiteRaw: row.website ? String(row.website) : null,
        phones: Array.isArray(row.phones)
          ? row.phones.map(String)
          : undefined,
        emails: Array.isArray(row.emails)
          ? row.emails.map(String)
          : undefined,
        score1: score1(place).total,
      };
    });
  } finally {
    db.close();
  }
}
