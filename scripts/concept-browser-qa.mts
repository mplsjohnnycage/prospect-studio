import {chromium} from "playwright";
import {renderTemplate} from "../src/lib/concept-template";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
let failures=0;
for(const direction of ["Editorial","Local First","Conversion","Signature"] as const){
 for(const [label,width,height] of [["desktop",1440,900],["mobile",390,844]] as const){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  const html=renderTemplate({prospectId:"visual-qa-0001",businessName:"North Loop Painting",trade:"Painting",city:"Minneapolis, MN",direction});
  await page.setContent(html,{waitUntil:"load"});
  await page.locator("#services").waitFor();
  const x=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-window.innerWidth,links:[...document.querySelectorAll("nav a")].map(n=>n.getAttribute("href"))}));
  if(x.overflow>2||errors.length||x.links.length!==3){console.log("FAIL",direction,label,x,errors);failures++;}
  await page.screenshot({path:"/tmp/prospect-demo-"+direction.toLowerCase().replace(/ /g,"-")+"-"+label+".png",fullPage:true});
  if(label==="mobile"){
   await page.evaluate(()=>window.addEventListener("message",e=>{if(e.data?.type==="prospect-studio:demo-submit"){(window as unknown as {__previewPayload?:unknown}).__previewPayload=e.data;}}));
   await page.locator('input[name="name"]').fill("Sample Visitor");
   await page.locator('input[name="email"]').fill("sample@example.com");
   await page.locator('textarea[name="message"]').fill("I want an estimate for my home.");
   await page.getByRole("button",{name:/Save preview test/}).click();
   await page.waitForFunction(()=>(window as unknown as {__previewPayload?:unknown}).__previewPayload!==undefined,{timeout:5000});
   const payload=await page.evaluate(()=>(window as unknown as {__previewPayload?:{prospectId:string;form:{email:string}}}).__previewPayload);
   if(!payload||payload.prospectId!=="visual-qa-0001"||payload.form.email!=="sample@example.com"){console.log("FORM_FAIL",direction,payload);failures++;}
  }
  console.log("CHECK",direction,label,errors.length?errors:"ok",x.overflow);
  await page.close();
 }
}
await browser.close();
process.exitCode=failures?1:0;
console.log("BROWSER_QA",failures?"FAILED":"PASSED","failures",failures);
