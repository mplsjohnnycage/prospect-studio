import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { R2_NAMESPACE, R2_SECRET_NAMES, secrets, type R2SecretName } from "./secrets";

export type R2Credentials = {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  token: string;
};

async function readSecret(
  ctx: Parameters<typeof secrets.get>[0],
  name: R2SecretName,
): Promise<string | null> {
  const result = await secrets.get(ctx, {
    namespace: R2_NAMESPACE,
    name,
    now: Date.now(),
  });
  return result.ok ? result.value : null;
}

/** Load R2 credentials from the secret store (preferred) with env fallback. */
export async function loadR2Credentials(
  ctx: Parameters<typeof secrets.get>[0],
): Promise<R2Credentials> {
  const fromStore: Partial<Record<R2SecretName, string>> = {};
  for (const name of R2_SECRET_NAMES) {
    const value = await readSecret(ctx, name);
    if (value) fromStore[name] = value;
  }

  const bucket = fromStore.R2_BUCKET ?? process.env.R2_BUCKET;
  const endpoint = fromStore.R2_ENDPOINT ?? process.env.R2_ENDPOINT;
  const accessKeyId =
    fromStore.R2_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey =
    fromStore.R2_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY;
  const token = fromStore.R2_TOKEN ?? process.env.R2_TOKEN;

  const missing = [
    !bucket && "R2_BUCKET",
    !endpoint && "R2_ENDPOINT",
    !accessKeyId && "R2_ACCESS_KEY_ID",
    !secretAccessKey && "R2_SECRET_ACCESS_KEY",
    !token && "R2_TOKEN",
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(
      `R2 credentials missing from secret store/env: ${missing.join(", ")}`,
    );
  }

  return {
    bucket: bucket!,
    endpoint: endpoint!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    token: token!,
  };
}

/** One-shot seed: copy current deployment env R2_* into the encrypted vault. */
export const seedR2FromEnv = internalMutation({
  args: {},
  returns: v.object({
    namespace: v.string(),
    seeded: v.array(v.string()),
    skipped: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const seeded: string[] = [];
    const skipped: string[] = [];
    for (const name of R2_SECRET_NAMES) {
      const value = process.env[name]?.trim();
      if (!value) {
        skipped.push(name);
        continue;
      }
      await secrets.put(ctx, {
        namespace: R2_NAMESPACE,
        name,
        value,
        metadata: {
          owner: "prospect-studio",
          label: name,
          purpose: "cloudflare-r2-dev",
        },
      });
      seeded.push(name);
    }
    return { namespace: R2_NAMESPACE, seeded, skipped };
  },
});

/** Presence check only — never returns secret values. */
export const r2CredentialStatus = internalQuery({
  args: {},
  returns: v.object({
    namespace: v.string(),
    present: v.array(v.string()),
    missing: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const present: string[] = [];
    const missing: string[] = [];
    for (const name of R2_SECRET_NAMES) {
      const result = await secrets.get(ctx, {
        namespace: R2_NAMESPACE,
        name,
        now: Date.now(),
      });
      if (result.ok) present.push(name);
      else missing.push(name);
    }
    return { namespace: R2_NAMESPACE, present, missing };
  },
});
