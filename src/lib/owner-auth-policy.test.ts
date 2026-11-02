import test from "node:test";
import assert from "node:assert/strict";
import { canActivateOwner, canRegisterOwnerSocial } from "./owner-auth-policy";

test("owner activation requires matching email and independent enrollment code",()=>{
 assert.equal(canActivateOwner("johnnyc@agentmail.to","abc123","johnnyc@agentmail.to","abc123"),true);
 assert.equal(canActivateOwner("attacker@agentmail.to","abc123","johnnyc@agentmail.to","abc123"),false);
 assert.equal(canActivateOwner("johnnyc@agentmail.to","guess","johnnyc@agentmail.to","abc123"),false);
 assert.equal(canActivateOwner("johnnyc@agentmail.to","abc123","johnnyc@agentmail.to",""),false);
 assert.equal(canActivateOwner("johnnyc@agentmail.to","abc123","", "abc123"),false);
});

test("owner social registration requires the provider-verified owner email only",()=>{
 assert.equal(canRegisterOwnerSocial("johnnyc@agentmail.to",true,"johnnyc@agentmail.to"),true);
 assert.equal(canRegisterOwnerSocial(" JohnnyC@AgentMail.to ",true,"johnnyc@agentmail.to"),true);
 assert.equal(canRegisterOwnerSocial("johnnyc@agentmail.to",false,"johnnyc@agentmail.to"),false);
 assert.equal(canRegisterOwnerSocial("attacker@agentmail.to",true,"johnnyc@agentmail.to"),false);
 assert.equal(canRegisterOwnerSocial("johnnyc@agentmail.to",true,""),false);
});

test("owner social registration allows only the listed extra owner addresses",()=>{
 const owner="johnnyc@agentmail.to";
 const extras=["mplsjohnnycage@makeithappenentllc.com"];
 // The owner's Google identity (a different address than the owner email).
 assert.equal(canRegisterOwnerSocial("mplsjohnnycage@makeithappenentllc.com",true,owner,extras),true);
 assert.equal(canRegisterOwnerSocial(" MplsJohnnyCage@MakeItHappenEntLLC.com ",true,owner,extras),true);
 // Same address without provider verification never qualifies.
 assert.equal(canRegisterOwnerSocial("mplsjohnnycage@makeithappenentllc.com",false,owner,extras),false);
 // An unrelated verified address never qualifies, extras or not.
 assert.equal(canRegisterOwnerSocial("someone.else@makeithappenentllc.com",true,owner,extras),false);
 assert.equal(canRegisterOwnerSocial("attacker@example.com",true,owner,extras),false);
 // Without the extras list, the Google identity does not qualify.
 assert.equal(canRegisterOwnerSocial("mplsjohnnycage@makeithappenentllc.com",true,owner),false);
 assert.equal(canRegisterOwnerSocial("mplsjohnnycage@makeithappenentllc.com",true,owner,[]),false);
});
