/** Approved UI component registry for Loop1 P3. */

export type ComponentStatus = "draft" | "approved" | "deprecated";

export type ComponentRegistryEntry = {
  id: string;
  name: string;
  version: string;
  status: ComponentStatus;
  /** Storybook story id (iframe `id=` param). */
  storyId: string;
  exportName: string;
  path: string;
  tokens: string[];
  screenshotArtifactId?: string;
  screenshotObjectKey?: string;
  screenshotContentHash?: string;
};

export const COMPONENT_REGISTRY: ComponentRegistryEntry[] = [
  {
    id: "ui.button",
    name: "Button",
    version: "1.0.0",
    status: "approved",
    storyId: "ui-button--default",
    exportName: "Button",
    path: "src/components/ui/button.tsx",
    tokens: ["--primary", "--primary-foreground", "--radius"],
  },
  {
    id: "ui.badge",
    name: "Badge",
    version: "1.0.0",
    status: "approved",
    storyId: "ui-badge--default",
    exportName: "Badge",
    path: "src/components/ui/badge.tsx",
    tokens: ["--primary", "--secondary", "--destructive"],
  },
  {
    id: "ui.card",
    name: "Card",
    version: "1.0.0",
    status: "approved",
    storyId: "ui-card--default",
    exportName: "Card",
    path: "src/components/ui/card.tsx",
    tokens: ["--card", "--card-foreground", "--border"],
  },
];

export function listApprovedComponents(): ComponentRegistryEntry[] {
  return COMPONENT_REGISTRY.filter((c) => c.status === "approved");
}

export function getComponent(id: string): ComponentRegistryEntry | undefined {
  return COMPONENT_REGISTRY.find((c) => c.id === id);
}

export function withScreenshotEvidence(
  entry: ComponentRegistryEntry,
  evidence: {
    screenshotArtifactId: string;
    screenshotObjectKey: string;
    screenshotContentHash: string;
  },
): ComponentRegistryEntry {
  if (entry.status !== "approved") {
    throw new Error(`refusing screenshot evidence for non-approved ${entry.id}`);
  }
  return { ...entry, ...evidence };
}
