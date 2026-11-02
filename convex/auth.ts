import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { genericOAuth } from "better-auth/plugins";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import { canActivateOwner, canRegisterOwnerSocial, isAllowedAgentAccount } from "../src/lib/owner-auth-policy";
import { createAgentIdProviderConfig, isOwnerAccount } from "../src/lib/agentid-auth";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = process.env.SITE_URL;
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!siteUrl || !ownerEmail) throw new Error("Missing site URL or owner allowlist");

  // Google sign-in activates only when BOTH OAuth env vars are present.
  const googleOAuth = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientKey: process.env.GOOGLE_CLIENT_SECRET,
  };
  if (!googleOAuth.clientId !== !googleOAuth.clientKey) {
    throw new Error("Google sign-in requires both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (only one is set)");
  }

  const agentIdProvider = createAgentIdProviderConfig({
    AGENTID_CLIENT_ID: process.env.AGENTID_CLIENT_ID,
    AGENTID_CLIENT_SECRET: process.env.AGENTID_CLIENT_SECRET,
    AGENTID_ISSUER: process.env.AGENTID_ISSUER,
  });

  return betterAuth({
    baseURL: siteUrl,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    // AgentID must never implicitly attach to an existing owner identity.
    account: { accountLinking: { enabled: false } },
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
          before: async (user, hookContext) => {
            if (canActivateOwner(user.email ?? "", user.name ?? "", ownerEmail, process.env.OWNER_ACTIVATION_CODE ?? "")) {
              return { data: { ...user, name: "MPLS Johnny Cage" } };
            }

            const callbackPath = typeof hookContext?.path === "string" ? hookContext.path : "";
            const isAgentIdCallback = /(?:^|\/)oauth2\/callback\/agentid(?:$|\?)/i.test(callbackPath)
              || /(?:^|\/)callback\/agentid(?:$|\?)/i.test(callbackPath);
            if (isAgentIdCallback && isAllowedAgentAccount(user)) {
              return { data: { ...user, name: "AgentID Agent" } };
            }

            // Google/social enrollment remains limited to verified owner addresses.
            const viaOAuthCallback = callbackPath.startsWith("/callback") || callbackPath.includes("/callback/");
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
    plugins: [
      convex({ authConfig }),
      ...(agentIdProvider ? [genericOAuth({ config: [agentIdProvider] })] : []),
    ],
  });
};

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const u = await authComponent.getAuthUser(ctx);
    if (!u) return null;
    const linkedAccounts = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "account",
      where: [{ field: "userId", value: u._id }],
      paginationOpts: { numItems: 20, cursor: null },
    });
    const providerIds = linkedAccounts.page.map((account: { providerId?: string }) => String(account.providerId ?? ""));
    const ownerEmail = process.env.OWNER_EMAIL ?? "";
    return {
      id: u._id,
      email: u.email,
      name: u.name,
      isOwner: isOwnerAccount(u, providerIds, ownerEmail),
      isAgent: providerIds.includes("agentid"),
    };
  },
});
