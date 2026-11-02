import test from "node:test";
import assert from "node:assert/strict";
import {buildBusinessProfile} from "./business-profile";

const SITE=`# North Star Painting
Family owned and licensed & insured since 2009. 15 years of experience. Free estimates.

## Services
- Interior painting
- Exterior painting
- Cabinet refinishing
## About
Rated 4.8 stars by 126 Google reviews. Visit us at 1425 Hennepin Ave, Minneapolis, MN 55403.
Call (612) 555-0147 or email info@northstar.example. Mon-Fri: 8am-5pm, Sat: 9am-1pm.
© 2025 North Star Painting`;
const P={name:"North Star Painting",trade:"Painting",city:"Minneapolis",website:"https://northstar.example/"};

test("every extracted fact points at its source page with an exact snippet",()=>{
 const prof=buildBusinessProfile(P,[{url:"https://northstar.example/",summary:SITE}]);
 assert.match(prof.address!.value,/1425 Hennepin Ave, Minneapolis, MN 55403/);
 assert.equal(prof.phones[0].value,"(612) 555-0147");
 assert.equal(prof.emails[0].value,"info@northstar.example");
 assert.equal(prof.rating?.score,4.8);
 assert.equal(prof.rating?.count,126);
 assert.ok(prof.hours&&prof.hours.lines.length>=2);
 assert.deepEqual(prof.services.map(s=>s.value),["Interior painting","Exterior painting","Cabinet refinishing"]);
 const all=[prof.address!,prof.rating!,prof.hours!,...prof.phones,...prof.emails,...prof.services,...prof.trust,...prof.tone];
 for(const f of all){
  assert.equal(f.sourceUrl,"https://northstar.example/");
  assert.ok(f.evidence.length>0);
 }
 assert.ok(prof.trust.some(t=>t.value==="15+ years of experience"));
 assert.ok(prof.trust.some(t=>t.value==="Family owned"));
 assert.equal(prof.siteStatus.label,"Solid site");
});
test("missing data is reported as gaps and never invented",()=>{
 const prof=buildBusinessProfile({...P},[{url:"https://northstar.example/",summary:"# North Star Painting\nWelcome to our small site about painting in town."}]);
 assert.equal(prof.address,undefined);
 assert.equal(prof.rating,undefined);
 assert.equal(prof.hours,undefined);
 assert.equal(prof.phones.length,0);
 for(const g of ["Address","Phone","Hours","Rating and reviews"])assert.ok(prof.gaps.includes(g),g);
 assert.ok(prof.gaps.some(g=>/Photos/.test(g)));
});
test("no sources: no site status guess, no facts",()=>{
 const none=buildBusinessProfile({...P,website:undefined},[]);
 assert.equal(none.siteStatus.label,"No site on file");
 assert.equal(none.sourcesUsed,0);
 const noText=buildBusinessProfile(P,[]);
 assert.equal(noText.siteStatus.label,"Not assessed");
});
test("a thin stale site is labeled weak with its factors",()=>{
 const prof=buildBusinessProfile(P,[{url:"https://northstar.example/",summary:"Welcome to our website. We do painting for homes around town and have for a long time now. \u00a9 2015 North Star Painting. Powered by Wix website builder."}]);
 assert.equal(prof.siteStatus.label,"Weak site");
 assert.ok(prof.siteStatus.factors.length>=3);
 assert.ok(prof.siteStatus.factors.every(f=>!f.startsWith("Opportunity:")));
});
test("ratings outside 1-5 and non-http source URLs are rejected",()=>{
 const prof=buildBusinessProfile(P,[{url:"javascript:alert(1)",summary:"Rated 9 stars everywhere. Call (612) 555-0147 today for estimates and services."}]);
 assert.equal(prof.rating,undefined);
 assert.equal(prof.phones[0].sourceUrl,"");
});
test("review quotes need review context; brand colors only come from real hex codes",()=>{
 const prof=buildBusinessProfile(P,[{url:"https://northstar.example/",summary:"## Testimonials\n\u201cThey repainted our whole house in three days and left it spotless, highly recommend.\u201d \u2014 Dana, homeowner\nBrand colors: #1F4E79 and #F2B134. See #services."}]);
 assert.match(prof.quote!.value,/repainted our whole house/);
 assert.equal(prof.quote!.sourceUrl,"https://northstar.example/");
 assert.deepEqual(prof.palette.map(p=>p.value),["#1f4e79","#f2b134"]);
 const none=buildBusinessProfile(P,[{url:"https://northstar.example/",summary:"Our motto: \u201cWe paint like it is our own home, every single time we pick up a brush.\u201d Call (612) 555-0147."}]);
 assert.equal(none.quote,undefined);
 assert.equal(none.palette.length,0);
 assert.ok(none.gaps.includes("Review quotes"));
});
test("first source that has a fact wins, later sources fill other gaps",()=>{
 const prof=buildBusinessProfile(P,[
  {url:"https://northstar.example/",summary:"# Home\nCall (612) 555-0147 for a free estimate on interior painting in Minneapolis."},
  {url:"https://listing.example/ns",summary:"4.5 stars from 40 reviews. 77 Main St, Edina, MN 55424."},
 ]);
 assert.equal(prof.phones[0].sourceUrl,"https://northstar.example/");
 assert.equal(prof.rating?.sourceUrl,"https://listing.example/ns");
 assert.equal(prof.address?.sourceUrl,"https://listing.example/ns");
});
