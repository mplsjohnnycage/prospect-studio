/** Versioned Brand DNA evidence — never silently promote proposals. */

import { assessOpportunity, extractContacts } from "../prospect-signals.ts";
import type { CheapCheck } from "./websiteState.ts";

export type FactTag = "verified" | "inferred" | "proposed" | "disputed" | "unknown";

export type BrandFact<T = string> = {
  value: T | null;
  tag: FactTag;
  sourceUrl?: string;
  evidence?: string;
};

export type BrandDna = {
  version: "brand-dna.v1";
  entityId: string;
  name: BrandFact;
  website: BrandFact;
  phones: BrandFact<string[]>;
  emails: BrandFact<string[]>;
  services: BrandFact<string[]>;
  trustSignals: BrandFact<string[]>;
  colors: BrandFact<string[]>;
  voice: BrandFact;
  siteOpportunity: BrandFact<number>;
  unknownFields: string[];
  extractedAt: string;
};

const SERVICE_HINTS =
  /\b(painting|painter|roofing|roofer|plumbing|plumber|hvac|landscap(?:e|ing)|cleaning|remodel(?:ing)?|siding|gutters?|electrical|electrician)\b/gi;
const TRUST_HINTS =
  /\b(licensed|insured|bonded|family[- ]owned|warranty|guarantee|bbb)\b/gi;
const HEX_RE = /(?<![&\w])#([0-9a-f]{6})\b/gi;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractBrandDna(args: {
  entityId: string;
  name: string;
  check: CheapCheck;
  html?: string;
}): BrandDna {
  const unknownFields: string[] = [];
  const url = args.check.finalUrl ?? args.check.url;
  const html = args.html ?? "";
  const text = html ? stripHtml(html) : "";
  const contacts = text ? extractContacts(text, url ?? "") : { emails: [], phones: [], best: "" };
  const services = [...new Set((text.match(SERVICE_HINTS) ?? []).map((s) => s.toLowerCase()))].slice(0, 8);
  const trust = [...new Set((text.match(TRUST_HINTS) ?? []).map((s) => s.toLowerCase()))].slice(0, 8);
  const colors = [...new Set([...(html.matchAll(HEX_RE) ?? [])].map((m) => `#${m[1].toLowerCase()}`))].slice(0, 6);
  const opp = text ? assessOpportunity(text) : { assessed: false, opportunity: 0, reasons: [] };

  if (!services.length) unknownFields.push("services");
  if (!trust.length) unknownFields.push("trustSignals");
  if (!colors.length) unknownFields.push("colors");
  if (!contacts.emails.length && !contacts.phones.length) unknownFields.push("contact");
  if (!opp.assessed) unknownFields.push("siteOpportunity");

  return {
    version: "brand-dna.v1",
    entityId: args.entityId,
    name: { value: args.name, tag: "verified", sourceUrl: url, evidence: "source place name" },
    website: {
      value: url ?? null,
      tag: args.check.state === "found" ? "verified" : "unknown",
      sourceUrl: url,
      evidence: args.check.error,
    },
    phones: {
      value: contacts.phones,
      tag: contacts.phones.length ? "inferred" : "unknown",
      sourceUrl: url,
    },
    emails: {
      value: contacts.emails,
      tag: contacts.emails.length ? "inferred" : "unknown",
      sourceUrl: url,
    },
    services: {
      value: services,
      tag: services.length ? "inferred" : "unknown",
      sourceUrl: url,
    },
    trustSignals: {
      value: trust,
      tag: trust.length ? "inferred" : "unknown",
      sourceUrl: url,
    },
    colors: {
      value: colors,
      tag: colors.length ? "inferred" : "unknown",
      sourceUrl: url,
      evidence: "hex literals observed in HTML; not approved brand tokens",
    },
    voice: {
      value: null,
      tag: "unknown",
      evidence: "Voice not asserted without human review",
    },
    siteOpportunity: {
      value: opp.assessed ? opp.opportunity : null,
      tag: opp.assessed ? "inferred" : "unknown",
      sourceUrl: url,
      evidence: opp.reasons.join("; ") || undefined,
    },
    unknownFields,
    extractedAt: new Date().toISOString(),
  };
}
