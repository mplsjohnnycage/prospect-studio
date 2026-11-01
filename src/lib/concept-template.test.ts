import test from "node:test";
import assert from "node:assert/strict";
import {renderTemplate} from "./concept-template";
const base={prospectId:"abc-prospect-123",businessName:"North Loop Painting",trade:"Painting",city:"Minneapolis, MN"} as const;

test("four directions produce materially different sites and usable responsive navigation",()=>{
 const directions=["Editorial","Local First","Conversion","Signature"] as const;
 const pages=directions.map(direction=>renderTemplate({...base,direction}));
 for(const html of pages){
  assert.match(html,/<meta name="viewport"/);
  assert.match(html,/<nav aria-label="Main navigation"/);
  assert.match(html,/id="services"/);
  assert.match(html,/id="approach"/);
  assert.match(html,/id="contact"/);
  assert.match(html,/<form id="private-demo-form"/);
  assert.match(html,/Unpublished design concept only/);
  assert.match(html,/Not an official North Loop Painting website/);
  assert.match(html,/@media\s*\(max-width:\s*720px\)/);
 }
 assert.equal(new Set(pages.map(x=>x.match(/data-direction="([^"]+)"/)?.[1])).size,4);
 assert.equal(new Set(pages.map(x=>x.match(/--paper:([^;]+);/)?.[1])).size,4);
});
test("preview form stays private and routes to parent without contacting businesses",()=>{
 const html=renderTemplate({...base,direction:"Conversion"});
 assert.match(html,/window\.parent\.postMessage/);
 assert.match(html,/prospect-studio:demo-submit/);
 assert.match(html,/Preview test/);
 assert.doesNotMatch(html,/action="https?:/);
 assert.doesNotMatch(html,/<script[^>]*src=/);
});
test("prospect content cannot inject script or markup",()=>{
 const html=renderTemplate({...base,businessName:'<script>alert("hi")</script>',city:'<img src=x onerror=alert(1)>',direction:"Signature"});
 assert.doesNotMatch(html,/<script>alert/);
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&lt;img/);
});
