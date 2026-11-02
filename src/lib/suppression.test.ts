import test from "node:test";
import assert from "node:assert/strict";
import {isSuppressed,normalizeSuppression} from "./suppression";

test("normalizes emails, domains and URLs; rejects junk",()=>{
 assert.deepEqual(normalizeSuppression(" Info@NorthStar.Example "),{kind:"email",value:"info@northstar.example"});
 assert.deepEqual(normalizeSuppression("mailto:a@b.co"),{kind:"email",value:"a@b.co"});
 assert.deepEqual(normalizeSuppression("https://www.NorthStar.example/about"),{kind:"domain",value:"northstar.example"});
 assert.deepEqual(normalizeSuppression("northstar.example"),{kind:"domain",value:"northstar.example"});
 for(const bad of ["","   ","a@b@c.com","@x.com","x@","not a domain","localhost","a@b"])assert.equal(normalizeSuppression(bad),null,bad);
 assert.equal(normalizeSuppression("a".repeat(260)+"@x.com"),null);
});
test("an email entry blocks only that address",()=>{
 const list=[{kind:"email" as const,value:"info@northstar.example"}];
 assert.ok(isSuppressed({contact:"info@northstar.example"},list));
 assert.ok(isSuppressed({contact:"Call (612) 555-0147, INFO@northstar.example"},list));
 assert.equal(isSuppressed({contact:"owner@northstar.example"},list),null);
});
test("a domain entry blocks the site, contacts on that domain and subdomains",()=>{
 const list=[{kind:"domain" as const,value:"northstar.example"}];
 assert.ok(isSuppressed({website:"https://www.northstar.example/"},list));
 assert.ok(isSuppressed({contact:"owner@northstar.example"},list));
 assert.ok(isSuppressed({website:"https://paint.northstar.example/"},list));
 assert.equal(isSuppressed({website:"https://notnorthstar.example/"},list),null);
 assert.equal(isSuppressed({contact:"(612) 555-0147"},list),null);
});
test("empty list or empty target never suppresses",()=>{
 assert.equal(isSuppressed({contact:"a@b.co"},[]),null);
 assert.equal(isSuppressed({},[{kind:"domain",value:"b.co"}]),null);
});
