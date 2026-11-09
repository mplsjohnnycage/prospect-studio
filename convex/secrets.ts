import { SecretStore } from "convex-secret-store";
import { components } from "./_generated/api";

/** Envelope-encrypted vault for Prospect Studio (phase0 / Convex dev). */
export const secrets = new SecretStore<
  `prospect-studio:${"dev" | "prod"}`,
  { owner?: string; label?: string; purpose?: string }
>(components.secretStore);

export const R2_SECRET_NAMES = [
  "R2_BUCKET",
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_TOKEN",
] as const;

export type R2SecretName = (typeof R2_SECRET_NAMES)[number];

export const R2_NAMESPACE = "prospect-studio:dev" as const;
