import {test} from "node:test";import assert from "node:assert/strict";import {safeWebsite} from "./integrations";
test("only HTTPS research inputs",()=>{assert.throws(()=>safeWebsite("http://example.com"));assert.equal(safeWebsite("https://example.com/"),"https://example.com/")});
test("reject local network",()=>{for(const u of ["https://localhost","https://127.0.0.1","https://10.1.1.1","https://192.168.1.1"])assert.throws(()=>safeWebsite(u))});
