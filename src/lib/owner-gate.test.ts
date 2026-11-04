import test from "node:test";
import assert from "node:assert/strict";
import {AUTH_REQUIRED,OWNER_REQUIRED,resolveOwnerSubject} from "./owner-gate";

const ownerEmail="owner@example.com";
const id={subject:"user-1"};
const base={ownerEmail,pilotMode:false};

test("anonymous callers are refused unless pilot mode is on",()=>{
 assert.throws(()=>resolveOwnerSubject({...base,identity:null,user:null,providerIds:[]}),new RegExp(AUTH_REQUIRED.slice(0,20)));
 assert.equal(resolveOwnerSubject({...base,pilotMode:true,identity:null,user:null,providerIds:[]}),"sprite-private-pilot");
});

test("the owner's credential account acts as its own tenant",()=>{
 assert.equal(resolveOwnerSubject({...base,identity:id,user:{email:ownerEmail},providerIds:["credential"]}),"user-1");
});

test("a Google identity with the owner email is accepted (email verification is tightened separately in the auth PR)",()=>{
 assert.equal(resolveOwnerSubject({...base,identity:id,user:{email:ownerEmail,emailVerified:true},providerIds:["google"]}),"user-1");
});

test("an AgentID agent is refused even when its email equals the owner email",()=>{
 assert.throws(()=>resolveOwnerSubject({...base,identity:id,user:{email:ownerEmail,emailVerified:true},providerIds:["agentid"]}),new RegExp(OWNER_REQUIRED));
});

test("any other signed-in user is refused, including with pilot mode on",()=>{
 for(const pilotMode of [false,true]){
  assert.throws(()=>resolveOwnerSubject({ownerEmail,pilotMode,identity:id,user:{email:"stranger@example.com",emailVerified:true},providerIds:["credential","google"]}),new RegExp(OWNER_REQUIRED));
 }
});

test("a signed-in identity whose user record cannot be loaded is refused",()=>{
 assert.throws(()=>resolveOwnerSubject({...base,identity:id,user:null,providerIds:[]}),new RegExp(OWNER_REQUIRED));
});
