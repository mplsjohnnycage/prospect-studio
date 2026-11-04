// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import {convexTest} from "convex-test";
import {afterEach,expect,test,vi} from "vitest";
import schema from "./schema";
import {api} from "./_generated/api";

const modules=import.meta.glob(["./**/*.ts","./_generated/*.js","!./**/*.test.ts","!./**/*.d.ts"]);
afterEach(()=>vi.unstubAllEnvs());

test("agent persists both user question and an explanatory reply even when models are unconfigured",async()=>{
 vi.stubEnv("GEMINI_API_KEY","");
 vi.stubEnv("OMNIROUTE_BASE_URL","");
 vi.stubEnv("OMNIROUTE_API_KEY","");
 const t=convexTest(schema,modules);
 const asOwner=t.withIdentity({subject:"owner1"});
 const reply=await asOwner.action(api.assistant.chat,{text:"How many prospects do I have?"});
 expect(reply.text).toMatch(/needs GEMINI_API_KEY or OmniRoute/);
 const messages=await asOwner.query(api.assistant.history,{});
 expect(messages.map(m=>m.role)).toEqual(["user","assistant"]);
 expect(messages[0].text).toBe("How many prospects do I have?");
 expect(messages[1].text).toBe(reply.text);
});
