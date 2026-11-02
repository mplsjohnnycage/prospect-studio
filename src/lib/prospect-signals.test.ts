import test from "node:test";
import assert from "node:assert/strict";
import {assessOpportunity,buildSearchQueries,extractContacts,outreachFooter,outreachIssues,pickSubject,rankScore,siteKey,websiteVariants} from "./prospect-signals";

test("contact extraction prefers same-domain role mailboxes and drops junk",()=>{
 const text="Call (612) 555-0147 or email owner@gmail.com, info@northstar.example, a1b2c3@sentry.io, logo@2x.png, noreply@northstar.example. Mobile 612.555.0188.";
 const c=extractContacts(text,"https://www.northstar.example/");
 assert.deepEqual(c.emails,["info@northstar.example","owner@gmail.com"]);
 assert.deepEqual(c.phones,["(612) 555-0147","(612) 555-0188"]);
 assert.equal(c.best,"info@northstar.example");
});
test("contact extraction falls back to a phone number, then to empty",()=>{
 assert.equal(extractContacts("Reach us at 651-555-0100 today").best,"(651) 555-0100");
 assert.equal(extractContacts("No details here at all").best,"");
 assert.equal(extractContacts("fake 123-456-7890 number").best,"");
});
test("opportunity is unassessed when there is too little content",()=>{
 const o=assessOpportunity("short");
 assert.equal(o.assessed,false);
 assert.equal(o.opportunity,0);
});
test("a stale thin site has more opportunity than a strong modern one",()=>{
 const weak=assessOpportunity("# North Star Painting\nWelcome to our website. Painting for homes in town. © 2016 North Star. Powered by Wix website builder.".padEnd(200," "),2026);
 const strong=assessOpportunity(("# North Star Painting\nOur services and projects gallery. Licensed and insured, 5-star reviews. Free estimate: call us at (612) 555-0147 or request a quote. Family owned. © 2026\n").repeat(12),2026);
 assert.equal(weak.assessed,true);
 assert.equal(strong.assessed,true);
 assert.ok(weak.opportunity>strong.opportunity+40,`weak ${weak.opportunity} strong ${strong.opportunity}`);
 assert.ok(weak.reasons.some(r=>/copyright is 2016/.test(r)));
 assert.ok(weak.opportunity<=100);
});
test("ranking keeps fit dominant and ignores missing opportunity",()=>{
 assert.equal(rankScore(80),80);
 assert.equal(rankScore(80,undefined),80);
 assert.equal(rankScore(80,Number.NaN),80);
 assert.equal(rankScore(100,0),80);
 assert.equal(rankScore(50,100),60);
 assert.equal(rankScore(60,500),Math.round(0.8*60+20));
 assert.ok(rankScore(90,0)>rankScore(60,100));
});
test("search expansion is capped, unique and keeps the original two queries first",()=>{
 const q=buildSearchQueries("Painting","Minneapolis, MN");
 assert.equal(q.length,3);
 assert.equal(q[0],"Painting business Minneapolis, MN official website");
 assert.equal(q[1],"Painting contractor services Minneapolis, MN locally owned");
 assert.match(q[2],/house painters Minneapolis, MN free estimate/);
 assert.equal(buildSearchQueries("Painting","Minneapolis",1).length,1);
 assert.equal(buildSearchQueries("Painting","Minneapolis",99).length,4);
 assert.equal(new Set(buildSearchQueries("Plumbing","St Paul",4).map(x=>x.toLowerCase())).size,4);
 assert.match(buildSearchQueries("Tree service","Edina")[2],/Tree service Edina free estimate/);
});
test("www and bare hosts resolve to the same site key and both variants",()=>{
 assert.equal(siteKey("https://www.Northstar.example/"),"northstar.example");
 assert.equal(siteKey("https://northstar.example/"),siteKey("https://www.northstar.example/"));
 const v=websiteVariants("https://www.northstar.example/");
 assert.ok(v.includes("https://northstar.example/")&&v.includes("https://www.northstar.example/"));
});
test("outreach footer carries identity, address and opt-out; missing address is flagged",()=>{
 const withAddress=outreachFooter({postalAddress:"123 Main St\nMinneapolis, MN 55401"});
 assert.match(withAddress,/123 Main St, Minneapolis, MN 55401/);
 assert.match(withAddress,/no thanks/);
 assert.deepEqual(outreachIssues("Hello"+withAddress,{postalAddress:"123 Main St"}),[]);
 const noAddress=outreachIssues("Hello"+outreachFooter(),{});
 assert.equal(noAddress.length,1);
 assert.match(noAddress[0],/postal address/);
 assert.ok(outreachIssues("Hello there",{postalAddress:"x"}).some(i=>/opt-out/.test(i)));
});
test("subject lines are honest, stable per business and mention the business",()=>{
 const s=pickSubject("North Star Painting");
 assert.equal(s,pickSubject("North Star Painting"));
 assert.match(s,/North Star Painting/);
 assert.doesNotMatch(s,/^(re|fwd):/i);
});
import {composeOutreach} from "./prospect-intelligence";
test("outreach never repeats internal site-weakness findings and ends with the compliance footer",()=>{
 const d=composeOutreach({name:"North Star Painting",trade:"Painting",city:"Minneapolis",findings:["Opportunity: footer copyright is 2016","Opportunity: no phone number visible"]},{postalAddress:"123 Main St, Minneapolis, MN 55401"});
 assert.doesNotMatch(d.body,/copyright|phone number|Opportunity/i);
 assert.match(d.body,/123 Main St, Minneapolis, MN 55401/);
 assert.match(d.body,/no thanks/);
 assert.deepEqual(d.issues,[]);
 const unconfigured=composeOutreach({name:"A B",trade:"Painting",city:"Edina",findings:[]});
 assert.equal(unconfigured.issues.length,1);
 assert.doesNotMatch(unconfigured.body,/\[|TODO|placeholder/i);
});
