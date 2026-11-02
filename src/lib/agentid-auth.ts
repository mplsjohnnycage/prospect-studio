export const AGENTID_PROVIDER_ID = "agentid";
export const AGENTID_ISSUER_DEFAULT = "https://auth.agentid.com";

export type AgentIdEnvironment = {
  AGENTID_CLIENT_ID?: string;
  AGENTID_CLIENT_SECRET?: string;
  AGENTID_ISSUER?: string;
};

export function createAgentIdProviderConfig(env: AgentIdEnvironment) {
  const clientId = env.AGENTID_CLIENT_ID?.trim();
  const clientSecret = env.AGENTID_CLIENT_SECRET?.trim();
  const issuer = (env.AGENTID_ISSUER?.trim() || AGENTID_ISSUER_DEFAULT).replace(/\/$/, "");
  if (!clientId || !clientSecret) return null;
  const issuerUrl = new URL(issuer);
  if (issuerUrl.protocol !== "https:") throw new Error("AgentID issuer must use HTTPS");

  return {
    providerId: AGENTID_PROVIDER_ID,
    discoveryUrl: `${issuer}/.well-known/openid-configuration`,
    issuer,
    requireIssuerValidation: true,
    clientId,
    clientSecret,
    scopes: ["openid", "profile", "email"],
    pkce: true,
    disableImplicitSignUp: false,
    disableSignUp: false,
    mapProfileToUser: (profile: Record<string, unknown>) => {
      const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
      const verified = profile.email_verified === true || profile.emailVerified === true;
      if (!isAgentMailIdentity(email) || !verified) {
        throw new Error("AgentID sign-in requires a verified AgentMail inbox identity");
      }
      return {
        email,
        emailVerified: true,
        name: "AgentID Agent",
        image: typeof profile.picture === "string" ? profile.picture : undefined,
      };
    },
  };
}

export function isAgentMailIdentity(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const [localPart, domain, ...extra] = normalized.split("@");
  return Boolean(localPart && !/[\s]/.test(localPart) && domain === "agentmail.to" && extra.length === 0);
}

/** Provider identity, not a display name, is part of the owner authorization boundary. */
export function isOwnerAccount(
  user: { email?: string | null } | null | undefined,
  accountProviderIds: readonly string[],
  ownerEmail: string,
): boolean {
  return Boolean(
    user &&
    user.email?.trim().toLowerCase() === ownerEmail.trim().toLowerCase() &&
    accountProviderIds.some((providerId) => providerId === "credential" || providerId === "google"),
  );
}
