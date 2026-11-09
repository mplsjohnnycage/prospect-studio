/** Retrieve approved layout priors from the P3 component registry. */

import {
  listApprovedComponents,
  type ComponentRegistryEntry,
} from "../components/registry.ts";

export type LayoutPrior = {
  componentId: string;
  name: string;
  version: string;
  storyId: string;
  tokens: string[];
  role: "hero" | "trust" | "services" | "cta" | "shell";
};

const ROLE_BY_ID: Record<string, LayoutPrior["role"]> = {
  "ui.card": "shell",
  "ui.button": "cta",
  "ui.badge": "trust",
};

export function retrieveLayoutPriors(
  entries: ComponentRegistryEntry[] = listApprovedComponents(),
): LayoutPrior[] {
  return entries.map((e) => ({
    componentId: e.id,
    name: e.name,
    version: e.version,
    storyId: e.storyId,
    tokens: [...e.tokens],
    role: ROLE_BY_ID[e.id] ?? "shell",
  }));
}
