import test from "node:test";
import assert from "node:assert/strict";
import {guessDomains,nameMatches} from "./revenue-signals";
test("domain guesses and verification", () => {
  assert.deepEqual(guessDomains("Amigo Roofing LLC"), ["amigoroofing.com", "amigoroofingmn.com", "amigo-roofing.com"]);
  assert.equal(nameMatches("Amigo Roofing", "<title>Amigo Roofing | MN</title>"), true);
  assert.equal(nameMatches("Amigo Roofing", "amigo roofing domain is for sale"), false);
  assert.equal(nameMatches("Amigo Roofing", "<title>Other</title>"), false);
});
