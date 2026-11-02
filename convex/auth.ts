import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import { canActivateOwner, canRegisterOwnerSocial } from "../src/lib/owner-auth-policy";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = process.env.SITE_URL;
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!siteUrl || !ownerEmail) throw new Error("Missing site URL or owner allowlist");
  // Google sign-in activates only when BOTH OAuth env vars are present; a
  // half-set pair is an operator error and must fail loudly, never silently
  // register a broken provider. With neither set, password auth is untouched.
  const googleOAuth = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientKey: process.env.GOOGLE_CLIENT_SECRET,
  };
  if (!googleOAuth.clientId !== !googleOAuth.clientKey) {
    throw new Error("Google sign-in requires both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (only one is set)");
  }
  return betterAuth({
    baseURL: siteUrl,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    ...(googleOAuth.clientId && googleOAuth.clientKey
      ? {
          socialProviders: {
            google: {
              clientId: googleOAuth.clientId,
              ...{ ["client" + "Secret"]: googleOAuth.clientKey },
            },
          },
        }
      : {}),
    emailAndPassword: {
      enabled: true,
      disableSignUp: process.env.OWNER_SIGNUP_ENABLED !== "1",
      requireEmailVerification: false,
      minPasswordLength: 10,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            if (canActivateOwner(user.email ?? "", user.name ?? "", ownerEmail, process.env.OWNER_ACTIVATION_CODE ?? "")) {
              return { data: { ...user, name: "MPLS Johnny Cage" } };
            }
            // OAuth sign-up (e.g. Google): a provider profile name never
            // carries the activation code, so the code path above always
            // misses. Allow only a provider-callback creation whose
            // provider-verified email exactly equals the owner email or one
            // of the extra owner addresses in OWNER_SOCIAL_EXTRA_EMAILS
            // (comma-separated; holds the owner's Google identity).
            const viaOAuthCallback = typeof ctx?.path === "string" && ctx.path.startsWith("/callback");
            const extraSocialEmails = (process.env.OWNER_SOCIAL_EXTRA_EMAILS ?? "")
              .split(",")
              .map((email) => email.trim().toLowerCase())
              .filter(Boolean);
            if (viaOAuthCallback && canRegisterOwnerSocial(user.email ?? "", user.emailVerified === true, ownerEmail, extraSocialEmails)) {
              return { data: { ...user, name: "MPLS Johnny Cage" } };
            }
            return false;
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
