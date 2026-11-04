#!/usr/bin/env node
// Headless Prospect Studio control client. Uses the existing scoped Convex MCP endpoint.
// No provider-specific agent SDK, login cookie, UI session or direct DB credentials.
import {fileURLToPath} from "node:url";

export const DEFAULT_MCP_URL = "https://rightful-elk-426.convex.site/mcp";
export function parseMcpResponse(raw, contentType="application/json", expectedId) {
  const candidates = [];
  if (contentType.includes("text/event-stream")) {
    for (const block of raw.replace(/\r\n/g,"\n").split("\n\n")) {
      const data = block.split("\n").filter(x=>x.startsWith("data:")).map(x=>x.slice(5).trim()).join("\n");
      if (data && data !== "[DONE]") {
        try { candidates.push(JSON.parse(data)); } catch { /* non-result SSE frame */ }
      }
    }
  } else if (raw.trim()) {
    try { candidates.push(JSON.parse(raw)); } catch {throw Error("MCP returned invalid JSON");}
  }
  const found = candidates.find(x=>x&&typeof x==="object"&&x.id===expectedId);
  if(!found)throw Error("MCP returned no matching JSON-RPC response");
  if(found.error)throw Error("MCP error: "+String(found.error.message??"unknown error"));
  return found.result;
}
export function createMcpClient({url,token,fetchImpl=fetch}) {
  if(!/^https:\/\//.test(url)&&!/^http:\/\/127\.0\.0\.1(?::\d+)?\//.test(url))
    throw Error("MCP URL must be HTTPS (loopback permitted for testing)");
  if(!token)throw Error("PROSPECT_MCP_TOKEN is required; create a scoped API key in Prospect Studio");
  let sessionId,protocolVersion="2025-06-18",serial=0;
  async function rpc(method,params,notification=false){
    const id=notification?undefined:++serial;
    const message={jsonrpc:"2.0",...(notification?{}:{id}),method,...(params===undefined?{}:{params})};
    const headers={
      authorization:"Bearer "+token,"content-type":"application/json",
      accept:"application/json, text/event-stream","mcp-protocol-version":protocolVersion,
      ...(sessionId?{"mcp-session-id":sessionId}:{})
    };
    const response=await fetchImpl(url,{method:"POST",headers,body:JSON.stringify(message),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error("MCP HTTP "+response.status+" ("+method+")");
    sessionId=response.headers.get("mcp-session-id")??sessionId;
    if(notification)return undefined;
    return parseMcpResponse(await response.text(),response.headers.get("content-type")??"",id);
  }
  return {
    async initialize(){
      const result=await rpc("initialize",{protocolVersion,capabilities:{},clientInfo:{name:"prospect-studio-control",version:"0.1.0"}});
      protocolVersion=result.protocolVersion??protocolVersion;
      await rpc("notifications/initialized",undefined,true);
      return result;
    },
    tools:()=>rpc("tools/list",{}),
    call:(name,args={})=>rpc("tools/call",{name,arguments:args}),
  };
}
export function help() {
 return [
 "Prospect Studio — agent-neutral headless CLI",
 "Requires PROSPECT_MCP_TOKEN (scoped key), optional PROSPECT_MCP_URL",
 "Commands:",
 "  prospect-control tools",
 "  prospect-control call TOOL_NAME '{\"field\":\"value\"}'",
 "  prospect-control queue KIND INSTRUCTION INPUT_JSON IDEMPOTENCY_KEY",
 "  prospect-control jobs",
 "  prospect-control job JOB_ID",
 "  prospect-control events JOB_ID",
 "  prospect-control claim WORKER_ID [JOB_ID]",
 "  prospect-control renew JOB_ID WORKER_ID LEASE_ID",
 "  prospect-control submit JOB_ID WORKER_ID LEASE_ID SUMMARY '[\"evidence-ref\"]'",
 "  prospect-control fail JOB_ID WORKER_ID LEASE_ID REASON",
 "Notes: submitted != verified; outreach, publishing, billing require separate approval.",
 ].join("\n");
}
export async function main(argv=process.argv.slice(2),env=process.env,fetchImpl=fetch) {
 const [command,...rest]=argv;
 if(!command||["help","--help","-h"].includes(command)){console.log(help());return;}
 const client=createMcpClient({url:env.PROSPECT_MCP_URL??DEFAULT_MCP_URL,token:env.PROSPECT_MCP_TOKEN,fetchImpl});
 await client.initialize();
 let result;
 switch(command){
  case "tools":result=await client.tools();break;
  case "call":{
   const [name,raw="{}"]=rest;if(!name)throw Error("Missing MCP tool name");
   let args;try{args=JSON.parse(raw)}catch{throw Error("Arguments must be JSON")}
   if(!args||typeof args!=="object"||Array.isArray(args))throw Error("Arguments must be a JSON object");
   result=await client.call(name,args);break;
  }
  case "queue":{
   const [kind,instruction,inputRaw,idempotencyKey]=rest;
   if(!kind||!instruction||!inputRaw||!idempotencyKey)throw Error("queue requires kind instruction inputJson idempotencyKey");
   let input;try{input=JSON.parse(inputRaw)}catch{throw Error("Input must be valid JSON")}
   if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Input must be a JSON object");
   result=await client.call("queue_headless_job",{kind,instruction,inputJson:JSON.stringify(input),idempotencyKey});break;
  }
  case "jobs":result=await client.call("list_headless_jobs",{});break;
  case "job":if(!rest[0])throw Error("Job ID required");result=await client.call("get_headless_job",{jobId:rest[0]});break;
  case "events":if(!rest[0])throw Error("Job ID required");result=await client.call("get_headless_job_events",{jobId:rest[0]});break;
  case "claim":if(!rest[0])throw Error("Worker ID required");result=await client.call("claim_headless_job",{workerId:rest[0],...(rest[1]?{jobId:rest[1]}:{})});break;
  case "renew":{
   const [jobId,workerId,leaseId]=rest;
   if(!jobId||!workerId||!leaseId)throw Error("renew requires jobId workerId leaseId");
   result=await client.call("renew_headless_job",{jobId,workerId,leaseId});break;
  }
  case "fail":{
   const [jobId,workerId,leaseId,reason]=rest;
   if(!jobId||!workerId||!leaseId||!reason)throw Error("fail requires jobId workerId leaseId reason");
   result=await client.call("fail_headless_job",{jobId,workerId,leaseId,reason});break;
  }
  case "submit":{
   const [jobId,workerId,leaseId,summary,evidenceRaw]=rest;
   if(!jobId||!workerId||!leaseId||!summary||!evidenceRaw)throw Error("submit requires jobId workerId leaseId summary evidenceJson");
   let evidence;try{evidence=JSON.parse(evidenceRaw)}catch{throw Error("Evidence must be JSON")}
   if(!Array.isArray(evidence))throw Error("Evidence must be a JSON array");
   result=await client.call("submit_headless_job",{jobId,workerId,leaseId,summary,evidence});break;
  }
  default:throw Error("Unknown command: "+command+"\n"+help());
 }
 console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 main().catch(error=>{console.error(String(error.message??error));process.exitCode=1});
}
