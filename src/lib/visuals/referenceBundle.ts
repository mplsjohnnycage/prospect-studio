/** Build a generation reference bundle from Brand DNA — proposals stay proposed. */

import type { BrandDna } from "../enrichment/brandDna.ts";
import type { LayoutPrior } from "./layoutPriors.ts";

export type ReferenceBundle = {
  version: "reference-bundle.v1";
  prospectId: string;
  prospectName: string;
  brandVersion: BrandDna["version"];
  verified: {
    name?: string;
    website?: string;
  };
  inferred: {
    services: string[];
    trustSignals: string[];
    colors: string[];
  };
  unknownFields: string[];
  layoutPriors: LayoutPrior[];
  generationPolicy: {
    assetsAre: "generated_proposed";
    mayNotClaimVerifiedBrand: true;
  };
};

export function buildReferenceBundle(args: {
  prospectId: string;
  prospectName: string;
  brand: BrandDna;
  layoutPriors: LayoutPrior[];
}): ReferenceBundle {
  return {
    version: "reference-bundle.v1",
    prospectId: args.prospectId,
    prospectName: args.prospectName,
    brandVersion: args.brand.version,
    verified: {
      name: args.brand.name.tag === "verified" ? (args.brand.name.value ?? undefined) : undefined,
      website:
        args.brand.website.tag === "verified"
          ? (args.brand.website.value ?? undefined)
          : undefined,
    },
    inferred: {
      services: args.brand.services.value ?? [],
      trustSignals: args.brand.trustSignals.value ?? [],
      colors: args.brand.colors.value ?? [],
    },
    unknownFields: [...args.brand.unknownFields],
    layoutPriors: args.layoutPriors,
    generationPolicy: {
      assetsAre: "generated_proposed",
      mayNotClaimVerifiedBrand: true,
    },
  };
}
