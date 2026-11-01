import {test} from "node:test";
import assert from "node:assert/strict";
import {escapeHtml,renderTemplate,buildConceptInAgentOS} from "./agentos";
const input={prospectId:"qa-prospect",businessName:"Acme & <Test>",trade:"Painting",city:"Minneapolis",direction:"Editorial" as const};
test("HTML output is escaped and not active script",()=>{assert.equal(escapeHtml('"<>&\''),'&quot;&lt;&gt;&amp;&#39;');const html=renderTemplate(input);assert.match(html,/Acme &amp; &lt;Test&gt;/);assert.doesNotMatch(html,/<Test>/)});
test("invalid IDs and oversized content are rejected",()=>{assert.throws(()=>renderTemplate({...input,prospectId:"../.."}));assert.throws(()=>renderTemplate({...input,businessName:"A".repeat(1000)}));});
test("guest process verifies generated concept inside agentOS VM",async()=>{const output=await buildConceptInAgentOS(input);assert.equal(output.verified,true);assert.equal(output.vmType,"ephemeral");assert.match(output.html,/Unpublished design concept/);assert.match(output.sha256,/^[0-9a-f]{64}$/);});
