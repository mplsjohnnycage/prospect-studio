import {test} from "node:test";
import assert from "node:assert/strict";
import {publicSite} from "./url-safety";
test("allows public https source",()=>assert.equal(publicSite("https://example.org/about"),"https://example.org/about"));
test("blocks private and loopback origins",()=>{for(const url of ["http://localhost","http://127.0.0.1","http://10.3.4.5","http://192.168.1.2","http://172.16.3.1","http://169.254.169.254","http://2130706433","http://a.local"]){assert.throws(()=>publicSite(url),url)}});
test("rejects unsafe protocols and credentials",()=>{for(const url of ["file:///etc/passwd","ftp://example.org","http://user:pass@example.org","https://example.org:8443"]){assert.throws(()=>publicSite(url),url)}});
