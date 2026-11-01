import test from "node:test";
import assert from "node:assert/strict";
import { canActivateOwner } from "./owner-auth-policy";

test("owner activation requires matching email and independent enrollment code",()=>{
 assert.equal(canActivateOwner("johnnyc@agentmail.to","abc123","johnnyc@agentmail.to","abc123"),true);
 assert.equal(canActivateOwner("attacker@agentmail.to","abc123","johnnyc@agentmail.to","abc123"),false);
 assert.equal(canActivateOwner("johnnyc@agentmail.to","guess","johnnyc@agentmail.to","abc123"),false);
 assert.equal(canActivateOwner("johnnyc@agentmail.to","abc123","johnnyc@agentmail.to",""),false);
 assert.equal(canActivateOwner("johnnyc@agentmail.to","abc123","", "abc123"),false);
});
