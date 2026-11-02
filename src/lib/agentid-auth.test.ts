import test from "node:test";
import assert from "node:assert/strict";
import { createAgentIdProviderConfig, isAgentMailIdentity, isOwnerAccount } from "./agentid-auth";

const credentials = {
  AGENTID_CLIENT_ID: "client-id-placeholder",
  AGENTID_CLIENT_SECRET: "client-secret-placeholder",
  AGENTID_ISSUER: "https://auth.agentid.com",
};

test("AgentID provider uses the configured OIDC discovery URL and issuer", () => {
  const provider = createAgentIdProviderConfig(credentials);
  assert.ok(provider);
  assert.equal(provider.providerId, "agentid");
  assert.equal(provider.discoveryUrl, "https://auth.agentid.com/.well-known/openid-configuration");
  assert.equal(provider.issuer, "https://auth.agentid.com");
  assert.equal(provider.requireIssuerValidation, true);
  assert.equal(provider.pkce, true);
});

test("AgentID provider stays unavailable until both credentials are supplied", () => {
  assert.equal(createAgentIdProviderConfig({ AGENTID_CLIENT_ID: "id" }), null);
  assert.equal(createAgentIdProviderConfig({ AGENTID_CLIENT_SECRET: "secret" }), null);
});

test("AgentID only accepts verified AgentMail inbox identities", () => {
  const provider = createAgentIdProviderConfig(credentials)!;
  assert.deepEqual(provider.mapProfileToUser({ email: "bot@agentmail.to", email_verified: true }), {
    email: "bot@agentmail.to", emailVerified: true, name: "AgentID Agent", image: undefined,
  });
  assert.throws(() => provider.mapProfileToUser({ email: "person@example.com", email_verified: true }), /verified AgentMail inbox/);
  assert.throws(() => provider.mapProfileToUser({ email: "bot@agentmail.to", email_verified: false }), /verified AgentMail inbox/);
  assert.equal(isAgentMailIdentity(" BOT@AGENTMAIL.TO "), true);
  assert.equal(isAgentMailIdentity("bot@example.com"), false);
});

test("AgentID identity can never satisfy the owner gate", () => {
  assert.equal(isOwnerAccount({ email: "owner@agentmail.to" }, ["agentid"], "owner@agentmail.to"), false);
  assert.equal(isOwnerAccount({ email: "owner@agentmail.to" }, ["credential"], "owner@agentmail.to"), true);
  assert.equal(isOwnerAccount({ email: "owner@agentmail.to" }, ["google"], "owner@agentmail.to"), true);
  assert.equal(isOwnerAccount({ email: "other@agentmail.to" }, ["credential"], "owner@agentmail.to"), false);
});
