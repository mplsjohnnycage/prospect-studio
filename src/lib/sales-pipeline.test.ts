import test from "node:test";
import assert from "node:assert/strict";
import {buildDemoFacts,buildDemoPrompt,extractHtml,finalizeDemoHtml,validateDemoHtml,type DemoFacts} from "./demo-generation";
import {addDemoLink,fallbackReply,firstEmail,isOptOut,senderEmail,stripQuoted} from "./sales";
import {GeminiHttpError,modelList,parseGeminiResponse,withModelFallback} from "./gemini";
import {buildBusinessProfile} from "./business-profile";
import {composeOutreach} from "./prospect-intelligence";

const facts:DemoFacts={name:"North Star Painting",trade:"Painting",city:"Minneapolis",phone:"(612) 555-0147",email:"info@northstar.example",services:["Interior painting"],trustSignals:["Licensed"],voice:[],palette:[]};
const sections=Array.from({length:6},(_,i)=>`<section id="s${i}"><h2>Section ${i}</h2><p>${"Careful, specific copy about painting. ".repeat(12)}</p></section>`).join("");
const good=`<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Fraunces&display=swap" rel="stylesheet"><style>body{font-family:"Fraunces",serif}</style></head><body><header><a href="tel:6125550147">Call (612) 555-0147</a> <a href="mailto:info@northstar.example">info@northstar.example</a></header><h1>North Star Painting</h1>${sections}<form id="q"><label>Name<input name="n"></label><button>Send</button></form><svg viewBox="0 0 10 10"><path d="M212 345 6789"/></svg><script>document.getElementById("q").addEventListener("submit",e=>{e.preventDefault()})</script></body></html>`;

test("a clean concept passes every check",()=>{
 const v=validateDemoHtml(good,facts);
 assert.deepEqual(v.errors,[]);
});
test("invented contact details, ratings and external assets are rejected",()=>{
 const bad=good.replace("</h1>","</h1><p>Call (651) 555-0199 or email sales@other.example. Rated 4.9 stars!</p><img src=\"https://images.example/x.jpg\"><script src=\"https://cdn.example/x.js\"></script>").replace('body{font-family:"Fraunces"','body{font-family:Inter');
 const e=validateDemoHtml(bad,facts).errors.join(" | ");
 for(const want of ["Unverified phone","Unverified email","star rating","images from the web","External script","Banned primary font"])assert.match(e,new RegExp(want),want);
});
test("numbers inside SVG paths are not mistaken for phone numbers; a missing name and thin pages fail",()=>{
 assert.ok(validateDemoHtml(good,facts).ok);
 const e=validateDemoHtml("<!doctype html><html><body><section></section></body></html>",facts).errors.join(" ");
 assert.match(e,/too short/);assert.match(e,/business name/);assert.match(e,/section/);assert.match(e,/interactivity/);
});
test("form placeholder text is sample input, not a claim; the same address as visible text still fails",()=>{
 const withPh=good.replace('<input name="n">','<input name="n" placeholder="your.email@example.com"><input placeholder=\'(555) 123-4567\'>');
 assert.deepEqual(validateDemoHtml(withPh,facts).errors,[]);
 assert.match(validateDemoHtml(withPh.replace("</h1>","</h1><p>Email your.email@example.com</p>"),facts).errors.join(" "),/Unverified email/);
});
test("forms may not post anywhere and only Google Fonts links are allowed",()=>{
 const e=validateDemoHtml(good.replace('<form id="q">','<form id="q" action="https://x.example/collect">').replace("</head>",'<link rel="icon" href="https://x.example/favicon.ico"></head>'),facts).errors.join(" ");
 assert.match(e,/action attribute/);assert.match(e,/Only Google Fonts/);
});
test("model output is unwrapped from fences and commentary",()=>{
 assert.equal(extractHtml("Here you go:\n```html\n<!doctype html><html><body>x</body></html>\n```\nEnjoy"),"<!doctype html><html><body>x</body></html>");
});
test("finalize adds noindex and a visible DEMO label exactly once, escaping the name",()=>{
 const once=finalizeDemoHtml(good,{businessName:"Smith & <Sons>",senderBrand:"Found It. Fix It."});
 const twice=finalizeDemoHtml(once,{businessName:"Smith & <Sons>",senderBrand:"Found It. Fix It."});
 assert.equal(once,twice);
 assert.match(once,/noindex,nofollow/);
 assert.match(once,/DEMO · A private website concept for Smith &amp; &lt;Sons&gt;/);
});
test("facts come only from the sourced profile; the prompt carries direction, gaps and retry errors",()=>{
 const prof=buildBusinessProfile({name:"North Star Painting",trade:"Painting",city:"Minneapolis",website:"https://northstar.example/"},[{url:"https://northstar.example/",summary:"North Star Painting. Call (612) 555-0147 for a free estimate on interior painting in Minneapolis today."}]);
 const f=buildDemoFacts(prof);
 assert.equal(f.phone,"(612) 555-0147");
 assert.equal(f.rating,undefined);
 assert.equal(f.reviewQuote,undefined);
 const p=buildDemoPrompt(f,{variant:"C",direction:"Conversion",description:"Quote-first"},["no clear call to action"],["Unverified phone number"]);
 assert.match(p,/Conversion/);assert.match(p,/no clear call to action/);assert.match(p,/previous attempt was rejected[\s\S]*Unverified phone/);
 assert.equal(buildDemoFacts(buildBusinessProfile({name:"A",trade:"B",city:"C"},[]),"(952) 555-0199").phone,"(952) 555-0199");
});
test("gemini parsing skips thought parts and explains empty responses",()=>{
 assert.equal(parseGeminiResponse({candidates:[{content:{parts:[{text:"thinking",thought:true},{text:"<!doctype html>"}]}}]},"m").text,"<!doctype html>");
 assert.throws(()=>parseGeminiResponse({promptFeedback:{blockReason:"SAFETY"}},"m"),/blocked: SAFETY/);
});
test("model fallback skips quota and overload errors but stops on real failures",async()=>{
 assert.deepEqual(modelList("a, b",["b","c"]),["a","b","c"]);
 const tried:string[]=[];
 const r=await withModelFallback(["pro","busy","flash"],async m=>{tried.push(m);if(m==="pro")throw new GeminiHttpError(429,"quota");if(m==="busy")throw new GeminiHttpError(503,"busy");return m;});
 assert.equal(r,"flash");assert.deepEqual(tried,["pro","busy","flash"]);
 await assert.rejects(withModelFallback(["x","y"],async m=>{if(m==="x")throw new GeminiHttpError(400,"bad request");return m;}),/bad request/);
 await assert.rejects(withModelFallback(["x"],async()=>{throw new GeminiHttpError(429,"quota");}),/quota/);
});
test("email helpers find addresses, strip quoted history and detect opt-outs",()=>{
 assert.equal(firstEmail("Call (612) 555-0147, Info@NorthStar.example"),"info@northstar.example");
 assert.equal(firstEmail("(612) 555-0147"),"");
 assert.equal(senderEmail("Dana R <Dana@x.example>"),"dana@x.example");
 const reply="Sure, what does it cost?\n\nOn Mon, Nov 2, 2026 at 9:00 AM Johnny wrote:\n> If you would rather not hear from me, just reply \"no thanks\"";
 assert.equal(stripQuoted(reply),"Sure, what does it cost?");
 assert.equal(isOptOut(stripQuoted(reply)),false);
 assert.ok(isOptOut("Please remove me from your list"));
 assert.ok(isOptOut("Not interested, thanks"));
});
test("the demo link is added once before the sign-off; outreach includes link, address and opt-out",()=>{
 const d=composeOutreach({name:"North Star Painting",trade:"Painting",city:"Minneapolis",findings:[],demoUrl:"https://x.convex.site/demo/abc"},{postalAddress:"13 5th Ave, Oakdale, MN 55128",senderName:"MPLS Johnny Cage, Found It. Fix It."});
 assert.match(d.body,/You can see it here: https:\/\/x\.convex\.site\/demo\/abc/);
 assert.match(d.body,/13 5th Ave, Oakdale, MN 55128/);
 assert.match(d.body,/Found It\. Fix It\./);
 assert.deepEqual(d.issues,[]);
 const plain=composeOutreach({name:"A B",trade:"Painting",city:"Edina",findings:[]},{postalAddress:"x"}).body;
 const withLink=addDemoLink(plain,"https://x/demo/1");
 assert.equal(addDemoLink(withLink,"https://x/demo/1"),withLink);
 assert.ok(withLink.indexOf("https://x/demo/1")<withLink.indexOf("Best regards"));
 assert.match(fallbackReply({}),/two times/);
 assert.doesNotMatch(fallbackReply({bookingUrl:"https://cal.example/j"}),/\$\d/);
});
