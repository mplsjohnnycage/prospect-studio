/** First-class website state for enrichment. Missing is not a silent skip. */

import { publicSite } from "../url-safety.ts";

export const WEBSITE_STATES = [
  "found",
  "missing",
  "unreachable",
  "directory_only",
  "invalid",
  "unknown",
] as const;

export type WebsiteState = (typeof WEBSITE_STATES)[number];

const DIRECTORY_HOSTS = new Set([
  "yelp.com",
  "angi.com",
  "angieslist.com",
  "thumbtack.com",
  "homeadvisor.com",
  "bbb.org",
  "yellowpages.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "nextdoor.com",
  "google.com",
  "maps.google.com",
  "wikipedia.org",
  "en.wikipedia.org",
  "houzz.com",
  "mapquest.com",
]);

export function normalizeWebsiteCandidate(raw: string | null | undefined): {
  state: WebsiteState;
  url?: string;
  host?: string;
  reason: string;
} {
  if (!raw || !String(raw).trim()) {
    return { state: "missing", reason: "No website field on source place" };
  }
  let candidate = String(raw).trim();
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  try {
    const safe = publicSite(candidate);
    const u = new URL(safe);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (
      DIRECTORY_HOSTS.has(host) ||
      [...DIRECTORY_HOSTS].some((d) => host.endsWith("." + d))
    ) {
      return {
        state: "directory_only",
        url: safe,
        host,
        reason: "URL resolves to a directory/social host, not a business site",
      };
    }
    return {
      state: "found",
      url: safe,
      host,
      reason: "Public business website candidate",
    };
  } catch (err) {
    return {
      state: "invalid",
      reason: err instanceof Error ? err.message : "Invalid website URL",
    };
  }
}

export type CheapCheck = {
  version: "cheap-check.v1";
  state: WebsiteState;
  url?: string;
  host?: string;
  httpStatus?: number;
  finalUrl?: string;
  title?: string;
  bytes?: number;
  elapsedMs: number;
  error?: string;
  fetchedAt: string;
};

export async function cheapWebsiteCheck(
  raw: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<CheapCheck> {
  const started = Date.now();
  const norm = normalizeWebsiteCandidate(raw);
  if (norm.state !== "found") {
    return {
      version: "cheap-check.v1",
      state: norm.state,
      url: norm.url,
      host: norm.host,
      elapsedMs: Date.now() - started,
      error: norm.reason,
      fetchedAt: new Date().toISOString(),
    };
  }
  try {
    const res = await fetchImpl(norm.url!, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "user-agent": "ProspectStudioEnrichment/0.1 (+cheap-check)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const buf = await res.arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: false }).decode(
      buf.slice(0, 80_000),
    );
    const title = text.match(/<title[^>]*>([^<]{1,200})/i)?.[1]?.trim();
    const state: WebsiteState = res.ok ? "found" : "unreachable";
    return {
      version: "cheap-check.v1",
      state,
      url: norm.url,
      host: norm.host,
      httpStatus: res.status,
      finalUrl: res.url,
      title,
      bytes: buf.byteLength,
      elapsedMs: Date.now() - started,
      error: res.ok ? undefined : `HTTP ${res.status}`,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      version: "cheap-check.v1",
      state: "unreachable",
      url: norm.url,
      host: norm.host,
      elapsedMs: Date.now() - started,
      error: err instanceof Error ? err.message : "fetch failed",
      fetchedAt: new Date().toISOString(),
    };
  }
}
