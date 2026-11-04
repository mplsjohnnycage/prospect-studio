import test from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../../next.config";

test("the default Vercel hostname redirects to the OAuth canonical origin before any sign-in can begin", async () => {
  assert.equal(typeof nextConfig.redirects, "function");
  const rules = await nextConfig.redirects!();
  assert.ok(rules.some(rule =>
    rule.source === "/:path*" &&
    rule.destination === "https://prospect-studio-johnnyc.vercel.app/:path*" &&
    rule.has?.some(condition => condition.type === "host" && condition.value === "prospect-studio-kappa.vercel.app")
  ), "the default deployment hostname must redirect before setting an OAuth state cookie");
});

test("the Git main hostname also redirects to the same canonical sign-in origin", async () => {
  assert.equal(typeof nextConfig.redirects, "function");
  const rules = await nextConfig.redirects!();
  assert.ok(rules.some(rule =>
    rule.source === "/:path*" &&
    rule.destination === "https://prospect-studio-johnnyc.vercel.app/:path*" &&
    rule.has?.some(condition => condition.type === "host" && condition.value === "prospect-studio-git-main-johnnyc.vercel.app")
  ), "both published alternate hostnames must converge on the canonical auth origin");
});
