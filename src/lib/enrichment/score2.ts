/** Score-2 adds audited technical website need on top of Score-1. */

import type { BrandDna } from "./brandDna.ts";
import type { CheapCheck } from "./websiteState.ts";

export const SCORE2_WEIGHTS_V1 = {
  version: "score2.v1",
  score1Carry: 0.45,
  websiteReachable: 0.15,
  websiteNeed: 0.25,
  contactability: 0.15,
} as const;

export type Score2Breakdown = {
  version: "score2.v1";
  total: number | null;
  blockedReason?: string;
  parts: {
    score1Carry: number;
    websiteReachable: number;
    websiteNeed: number | null;
    contactability: number;
  };
  tier: "A" | "B" | "C" | "blocked" | "unknown";
};

export function score2(args: {
  score1: number;
  check: CheapCheck;
  brand: BrandDna;
}): Score2Breakdown {
  if (args.check.state === "missing") {
    return {
      version: "score2.v1",
      total: null,
      blockedReason: "missing_site",
      parts: {
        score1Carry: Number((args.score1 * SCORE2_WEIGHTS_V1.score1Carry).toFixed(4)),
        websiteReachable: 0,
        websiteNeed: null,
        contactability: 0,
      },
      tier: "blocked",
    };
  }
  if (args.check.state === "unreachable" || args.check.state === "invalid") {
    return {
      version: "score2.v1",
      total: null,
      blockedReason: args.check.state,
      parts: {
        score1Carry: Number((args.score1 * SCORE2_WEIGHTS_V1.score1Carry).toFixed(4)),
        websiteReachable: 0,
        websiteNeed: null,
        contactability: 0,
      },
      tier: "unknown",
    };
  }
  if (args.check.state === "directory_only") {
    return {
      version: "score2.v1",
      total: null,
      blockedReason: "directory_only",
      parts: {
        score1Carry: Number((args.score1 * SCORE2_WEIGHTS_V1.score1Carry).toFixed(4)),
        websiteReachable: 0,
        websiteNeed: null,
        contactability: 0,
      },
      tier: "blocked",
    };
  }

  const websiteReachable = SCORE2_WEIGHTS_V1.websiteReachable;
  const needRaw = args.brand.siteOpportunity.value;
  const websiteNeed =
    needRaw === null || needRaw === undefined
      ? null
      : Number(((needRaw / 100) * SCORE2_WEIGHTS_V1.websiteNeed).toFixed(4));
  const hasContact =
    (args.brand.phones.value?.length ?? 0) > 0 ||
    (args.brand.emails.value?.length ?? 0) > 0;
  const contactability = hasContact ? SCORE2_WEIGHTS_V1.contactability : 0;
  const score1Carry = Number((args.score1 * SCORE2_WEIGHTS_V1.score1Carry).toFixed(4));

  if (websiteNeed === null) {
    return {
      version: "score2.v1",
      total: null,
      blockedReason: "website_need_unknown",
      parts: { score1Carry, websiteReachable, websiteNeed, contactability },
      tier: "unknown",
    };
  }

  const total = Number(
    (score1Carry + websiteReachable + websiteNeed + contactability).toFixed(4),
  );
  const tier = total >= 0.72 ? "A" : total >= 0.55 ? "B" : "C";
  return {
    version: "score2.v1",
    total,
    parts: { score1Carry, websiteReachable, websiteNeed, contactability },
    tier,
  };
}

export type HandReviewItem = {
  entityId: string;
  name: string;
  website?: string;
  score2: Score2Breakdown;
  websiteState: CheapCheck["state"];
  reviewStatus: "pending_human" | "approved_a" | "rejected" | "missing_site_accounted";
  falseNegativeRisk: "none" | "possible_missing_site" | "directory_masked";
  notes: string[];
};

export function buildHandReviewQueue(
  items: Array<{
    entityId: string;
    name: string;
    check: CheapCheck;
    score2: Score2Breakdown;
  }>,
  limit = 20,
): {
  aTier: HandReviewItem[];
  missingSiteAccounted: HandReviewItem[];
  notes: string[];
} {
  const aTier: HandReviewItem[] = [];
  const missingSiteAccounted: HandReviewItem[] = [];

  for (const item of items) {
    if (item.check.state === "missing" || item.score2.blockedReason === "missing_site") {
      missingSiteAccounted.push({
        entityId: item.entityId,
        name: item.name,
        website: item.check.url,
        score2: item.score2,
        websiteState: item.check.state,
        reviewStatus: "missing_site_accounted",
        falseNegativeRisk: "possible_missing_site",
        notes: [
          "Missing website is first-class state; not treated as zero Score-2.",
          "Human may later attach a discovered URL if Overture omitted it.",
        ],
      });
      continue;
    }
    if (item.score2.tier === "A" && aTier.length < limit) {
      aTier.push({
        entityId: item.entityId,
        name: item.name,
        website: item.check.finalUrl ?? item.check.url,
        score2: item.score2,
        websiteState: item.check.state,
        reviewStatus: "pending_human",
        falseNegativeRisk:
          item.check.state === "directory_only" ? "directory_masked" : "none",
        notes: [
          "A-tier by Score-2 rule score2.v1; requires hand review before deep audit spend.",
        ],
      });
    }
  }

  return {
    aTier,
    missingSiteAccounted,
    notes: [
      `Hand-review queue size=${aTier.length} (target ${limit}).`,
      `Missing-site accounted=${missingSiteAccounted.length}.`,
      "Deep SiteOne/browser audit is gated on human A-tier approval.",
    ],
  };
}
