import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import { canActivateOwner } from "../src/lib/owner-auth-policy";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = process.env.SITE_URL;
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!siteUrl || !ownerEmail) throw new Error("Missing site URL or owner allowlist");
  return betterAuth({
    baseURL: siteUrl,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      disableSignUp: process.env.OWNER_SIGNUP_ENABLED !== "1",
      requireEmailVerification: false,
      minPasswordLength: 16,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!canActivateOwner(user.email ?? "", user.name ?? "", ownerEmail, process.env.OWNER_ACTIVATION_CODE ?? "")) {
              return false;
            }
            return { data: { ...user, name: "MPLS Johnny Cage" } };
          },
        },
      },
    },
    plugins: [convex({ authConfig })],
  });
};

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const u = await authComponent.getAuthUser(ctx);
    return u ? { id: u._id, email: u.email, name: u.name } : null;
  },
});
