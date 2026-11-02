import assert from "node:assert/strict";

const base=process.env.PROSPECT_SMOKE_URL||"http://127.0.0.1:3111";
const expectReady=process.env.PROSPECT_EXPECT_READY==="1";
const checks=[
 {name:"application shell",path:"/",method:"GET",status:200},
 {name:"liveness",path:"/api/health",method:"GET",status:200,json:{ok:true,service:"prospect-studio"}},
 {name:"backend readiness reports actual availability",path:"/api/ready",method:"GET",status:expectReady?200:503,json:{ok:expectReady}},
 {name:"anonymous prospects are private",path:"/api/prospects",method:"GET",status:401,json:{error:"Sign in required"}},
 {name:"anonymous mutations are private",path:"/api/autopilot",method:"POST",status:401,body:{mode:"build",trade:"Painting",city:"Minneapolis"}},
 {name:"anonymous sandbox builds are private",path:"/api/agentos/build",method:"POST",status:401,body:{prospectId:"invalid",conceptId:"invalid"}},
 {name:"cron refuses missing secret",path:"/api/cron/autopilot",method:"GET",status:401,json:{error:"Unauthorized"}},
 {name:"invalid map coordinates rejected without upstream call",path:"/api/map/tiles/99/0/0",method:"GET",status:400},
];
let failures=0;
for(const c of checks){
 try{
  const r=await fetch(new URL(c.path,base),{
   method:c.method,
   headers:c.body?{"content-type":"application/json"}:undefined,
   body:c.body?JSON.stringify(c.body):undefined,
   redirect:"manual",
   signal:AbortSignal.timeout(12000)
  });
  assert.equal(r.status,c.status,`${c.name}: expected ${c.status} got ${r.status}`);
  if(c.json){const j=await r.json();for(const [k,v] of Object.entries(c.json))assert.equal(j[k],v,`${c.name}: ${k}`)}
  console.log("PASS",c.name,r.status);
 }catch(e){failures++;console.error("FAIL",c.name,e instanceof Error?e.message:String(e))}
}
if(failures){console.error(`${failures} release smoke checks failed`);process.exitCode=1}
else console.log(`All ${checks.length} release smoke checks passed`);
