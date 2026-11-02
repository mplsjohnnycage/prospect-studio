import {test} from "node:test";
import assert from "node:assert/strict";
import {BUILD_LEASE_MS, decideBuildClaim, requireBuildClaim, validateBuildClaimId} from "./build-lease";

const id1="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id2="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("concept build lease begins only when unbuilt and not claimed",()=>{
 assert.equal(decideBuildClaim({},1000),"acquired");
 assert.equal(decideBuildClaim({buildClaimId:id1,buildLeaseUntil:1000+BUILD_LEASE_MS},1000),"busy");
 assert.equal(decideBuildClaim({buildClaimId:id1,buildLeaseUntil:1000},1000),"acquired");
 assert.equal(decideBuildClaim({buildClaimId:id1,buildLeaseUntil:999},1000),"acquired");
 assert.equal(decideBuildClaim({html:"built",buildClaimId:id1,buildLeaseUntil:999999},1000),"built");
});
test("only current unexpired claimant may save a concept",()=>{
 const concept={buildClaimId:id1,buildLeaseUntil:1000+BUILD_LEASE_MS};
 assert.doesNotThrow(()=>requireBuildClaim(concept,id1,1000));
 assert.throws(()=>requireBuildClaim(concept,id2,1000),/expired or not owned/);
 assert.throws(()=>requireBuildClaim(concept,id1,1000+BUILD_LEASE_MS),/expired or not owned/);
 assert.throws(()=>requireBuildClaim({},id1,1000),/expired or not owned/);
});
test("only typed bounded claim identifiers are accepted",()=>{
 assert.doesNotThrow(()=>validateBuildClaimId(id1));
 for(const value of ["","not-a-uuid","../../secret","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-extra"])
  assert.throws(()=>validateBuildClaimId(value),/Invalid/);
});
