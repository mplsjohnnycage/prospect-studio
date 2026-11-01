import test from "node:test";
import assert from "node:assert/strict";
import {validateDemoSubmission,shouldAcceptPreviewMessage} from "./demo-submission";
const demo={name:"Test Visitor",email:"TEST@Example.com",message:"I would like an estimate for a small project."};
test("valid preview form has normalized, bounded fields",()=>{
 assert.deepEqual(validateDemoSubmission(demo),{name:"Test Visitor",email:"test@example.com",message:demo.message});
});
test("rejects oversized, invalid or missing preview submissions",()=>{
 assert.throws(()=>validateDemoSubmission({...demo,email:"not-an-email"}));
 assert.throws(()=>validateDemoSubmission({...demo,message:"short"}));
 assert.throws(()=>validateDemoSubmission({...demo,name:"a".repeat(121)}));
 assert.throws(()=>validateDemoSubmission(null));
});
test("only selected embedded preview frame may request storage",()=>{
 const source={}; const other={};
 const value={type:"prospect-studio:demo-submit",version:1,prospectId:"p10",direction:"Editorial",form:demo};
 assert.equal(shouldAcceptPreviewMessage({source,origin:"null",data:value},source,"p10","Editorial"),true);
 assert.equal(shouldAcceptPreviewMessage({source:other,origin:"null",data:value},source,"p10","Editorial"),false);
 assert.equal(shouldAcceptPreviewMessage({source,origin:"https://evil.example",data:value},source,"p10","Editorial"),false);
 assert.equal(shouldAcceptPreviewMessage({source,origin:"null",data:{...value,prospectId:"p11"}},source,"p10","Editorial"),false);
});
