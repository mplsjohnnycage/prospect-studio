import test from "node:test";
import assert from "node:assert/strict";
import {selectDemoEligible, candidateFromSearch, qualifyBusiness, composeOutreach} from "./prospect-intelligence";
const items=(n:number)=>Array.from({length:n},(_,i)=>({id:"p"+String(i).padStart(2,"0"),score:100-i,qualified:true,paused:false}));
test("strict top decile: no build before ten qualified; floor rather than ceil",()=>{
 for(const n of [0,1,5,9])assert.equal(selectDemoEligible(items(n)).length,0);
 for(const n of [10,11,19])assert.equal(selectDemoEligible(items(n)).length,1);
 assert.equal(selectDemoEligible(items(20)).length,2);
 assert.deepEqual(selectDemoEligible(items(20)).map(x=>x.id),["p00","p01"]);
});
test("unqualified or paused records cannot displace eligible qualified candidates",()=>{
 const prospects=[...items(10),{id:"blocked",score:100,qualified:true,paused:true},{id:"uncertain",score:100,qualified:false,paused:false}];
 assert.deepEqual(selectDemoEligible(prospects).map(x=>x.id),["p00"]);
});
test("stable sorting uses ID when scores tie",()=>{
 const cohort=Array.from({length:10},(_,i)=>({id:"p"+String(9-i),score:70,qualified:true,paused:false}));
 assert.equal(selectDemoEligible(cohort)[0].id,"p0");
});
test("directory listings and unrelated search results are rejected",()=>{
 assert.equal(candidateFromSearch({url:"https://www.yelp.com/biz/test",title:"Acme Painters",description:"Painting in Minneapolis"},"Painting","Minneapolis"),null);
 assert.equal(candidateFromSearch({url:"https://example.com/top-10-painters",title:"Top 10 painters",description:"Top businesses"},"Painting","Minneapolis"),null);
 const p=candidateFromSearch({url:"https://northstar.example/services",title:"North Star Painting | Minneapolis",description:"Interior and exterior painting locally"},"Painting","Minneapolis");
 assert.equal(p?.name,"North Star Painting");
 assert.equal(p?.website,"https://northstar.example/");
});
test("qualification is evidence-based and generates an unsent contextual draft",()=>{
 const p={name:"North Star Painting",city:"Minneapolis",trade:"Painting",website:"https://northstar.example/",description:"Minneapolis painting company",markdown:"# North Star Painting\nInterior and exterior painting services in Minneapolis, call us for a quote.",url:"https://northstar.example/"};
 const scored=qualifyBusiness(p);
 assert.ok(scored.score>=0&&scored.score<=100);
 assert.ok(scored.reasons.length>0);
 const draft=composeOutreach({name:p.name,trade:p.trade,city:p.city,findings:scored.reasons});
 assert.match(draft.body,/North Star Painting/);
 assert.doesNotMatch(draft.body,/we audited your site and found|guaranteed/i);
});
test("generic search labels do not hide a distinctive company name in sourced homepage evidence",()=>{
 const p=candidateFromSearch({url:"https://okeefepainting.example/",title:"House Painters | Interior and Exterior Painting",description:"Professional painting services in Minneapolis",markdown:"# O'Keefe Painting\n\n## Services\nO'Keefe Painting provides interior and exterior painting services in Minneapolis."},"Painting","Minneapolis");
 assert.equal(p?.name,"O'Keefe Painting");
});
test("distinctive search titles override generic website headings",()=>{
 const p=candidateFromSearch({url:"https://northstar.example/",title:"North Star Painting | Minneapolis",markdown:"# House Painters\nContact us for professional service"},"Painting","Minneapolis");
 assert.equal(p?.name,"North Star Painting");
});
