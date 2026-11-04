import {test} from "node:test";
import assert from "node:assert/strict";
import {availableProviders,endpointFor,pickProvider,spriteFor} from "./execution";
import {demoModelList,omniChatUrl,omniFromEnv} from "./llm";
import {rivetRouteEnabled} from "./rivet-route";

test("execution provider defaults to vercel and ignores unknown values", () => {
  assert.equal(pickProvider({}), "vercel");
  assert.equal(pickProvider({EXECUTION_PROVIDER: "PC"}), "pc");
  assert.equal(pickProvider({EXECUTION_PROVIDER: "sprite"}), "sprite");
  assert.equal(pickProvider({EXECUTION_PROVIDER: "mainframe"}), "vercel");
});

test("always-on sandbox endpoints need both a URL and a token", () => {
  assert.equal(endpointFor("pc", {SANDBOX_AGENT_PC_URL: "http://100.94.150.48:2468"}), null);
  assert.deepEqual(endpointFor("pc", {SANDBOX_AGENT_PC_URL: "http://100.94.150.48:2468/", SANDBOX_AGENT_PC_TOKEN: "t"}), {baseUrl: "http://100.94.150.48:2468", token: "t"});
  assert.throws(() => endpointFor("pc", {SANDBOX_AGENT_PC_URL: "file:///etc", SANDBOX_AGENT_PC_TOKEN: "t"}));
});

test("sprite execution needs a Sprites token and a valid Sprite name", () => {
  assert.equal(spriteFor({}), null);
  assert.deepEqual(spriteFor({SPRITES_TOKEN: "t"}), {token: "t", name: "prospect-studio"});
  assert.throws(() => spriteFor({SPRITES_TOKEN: "t", SPRITE_EXEC_NAME: "../x"}));
});

test("available providers follow what this runtime can reach", () => {
  assert.deepEqual(availableProviders({}), []);
  assert.deepEqual(availableProviders({VERCEL: "1", SANDBOX_AGENT_PC_URL: "http://h:2468", SANDBOX_AGENT_PC_TOKEN: "t"}), ["vercel", "pc"]);
  assert.deepEqual(availableProviders({SPRITES_TOKEN: "t"}), ["sprite"]);
});

test("OmniRoute is opt-in and goes first when configured", () => {
  assert.equal(omniFromEnv({}), null);
  assert.equal(omniFromEnv({OMNIROUTE_BASE_URL: "http://h:20128"}), null);
  const o = omniFromEnv({OMNIROUTE_BASE_URL: "http://h:20128", OMNIROUTE_API_KEY: "k"});
  assert.equal(o?.model, "omni:auto");
  assert.deepEqual(demoModelList(undefined, false, o?.model).slice(0, 2), ["omni:auto", "gemini-3.5-flash"]);
  assert.deepEqual(demoModelList(undefined, false), ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-flash-latest"]);
});

test("OmniRoute URLs normalize to the chat completions path", () => {
  assert.equal(omniChatUrl("http://100.94.150.48:20128"), "http://100.94.150.48:20128/v1/chat/completions");
  assert.equal(omniChatUrl("http://h:20128/v1/"), "http://h:20128/v1/chat/completions");
  assert.throws(() => omniChatUrl("ftp://h"));
});

test("the Vercel actor route stays off without a private Rivet endpoint", () => {
  assert.equal(rivetRouteEnabled(undefined), false);
  assert.equal(rivetRouteEnabled("http://127.0.0.1:6420"), false);
  assert.equal(rivetRouteEnabled("https://api.rivet.dev"), false);
  assert.equal(rivetRouteEnabled("https://ns:sk_x@api.rivet.dev"), true);
});
