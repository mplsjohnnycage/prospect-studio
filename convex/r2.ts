import { R2 } from "@convex-dev/r2";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { loadR2Credentials } from "./r2Credentials";

/**
 * Default R2 client — env-backed for component sync paths.
 * Prefer `r2WithSecretConfig` in actions when reading vaulted credentials.
 */
export const r2 = new R2(components.r2);

export const { generateUploadUrl, syncMetadata, getMetadata, listMetadata, deleteObject } =
  r2.clientApi<DataModel>({
    checkUpload: async () => {
      // Auth gates land with storage actions; component hooks stay permissive for now.
    },
  });

/** Build an R2 client using credentials from the secret store (env fallback). */
export async function r2WithSecretConfig(
  ctx: Parameters<typeof loadR2Credentials>[0],
): Promise<R2> {
  const creds = await loadR2Credentials(ctx);
  return new R2(components.r2, {
    bucket: creds.bucket,
    endpoint: creds.endpoint,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
  });
}
