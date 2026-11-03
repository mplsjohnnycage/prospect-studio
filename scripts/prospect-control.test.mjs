import {test} from "node:test";
import assert from "node:assert/strict";
import {createMcpClient,parseMcpResponse} from "./prospect-control.mjs";

test("MCP response parser handles JSON and SSE and rejects wrong correlation id",()=>{
 assert.deepEqual(parseMcpResponse('{"jsonrpc":"2.0","id":3,"result":{"ok":true}}',"application/json",3),{ok:true});
 const sse='event: message\ndata: {"jsonrpc":"2.0","id":4,"result":{"items":[1]}}\n\n';
 assert.deepEqual(parseMcpResponse(sse,"text/event-stream",4),{items:[1]});
 assert.throws(()=>parseMcpResponse(sse,"text/event-stream",7),/matching/);
 assert.throws(()=>parseMcpResponse('{"id":1,"error":{"message":"denied"}}',"application/json",1),/denied/);
});
test("MCP client initializes, authorizes, carries session header, and calls tools",async()=>{
 const seen=[];
 const fakeFetch=async(url,init)=>{
  const msg=JSON.parse(init.body);seen.push({url,method:msg.method,headers:init.headers});
  if(msg.method==="notifications/initialized")return new Response("",{status:202});
  const body=msg.method==="initialize"?{
   protocolVersion:"2025-06-18",capabilities:{tools:{}},serverInfo:{name:"test",version:"1"}
  }:msg.method==="tools/list"?{
   tools:[{name:"list_headless_jobs"}]
  }:{content:[{type:"text",text:'{"status":"queued"}'}]};
  return new Response(JSON.stringify({jsonrpc:"2.0",id:msg.id,result:body}),{
   status:200,headers:{"content-type":"application/json","mcp-session-id":"session-test"}
  });
 };
 const client=createMcpClient({url:"https://mock.example/mcp",token:"scoped-test-token",fetchImpl:fakeFetch});
 await client.initialize();
 assert.equal((await client.tools()).tools[0].name,"list_headless_jobs");
 const result=await client.call("list_headless_jobs",{limit:2});
 assert.match(result.content[0].text,/queued/);
 assert.deepEqual(seen.map(s=>s.method),[
  "initialize","notifications/initialized","tools/list","tools/call"
 ]);
 assert(seen.every(s=>s.headers.authorization==="Bearer scoped-test-token"));
 assert.equal(seen[2].headers["mcp-session-id"],"session-test");
});
test("client refuses missing token and insecure HTTP endpoints",()=>{
 assert.throws(()=>createMcpClient({url:"http://example.com/mcp",token:"test"}),/HTTPS/);
 assert.throws(()=>createMcpClient({url:"https://example.com/mcp",token:""}),/PROSPECT_MCP_TOKEN/);
});
test("rejects unauthorized MCP responses",async()=>{
 const fakeFetch=async()=>new Response("Forbidden",{status:401});
 const client=createMcpClient({url:"https://mock.example/mcp",token:"limited",fetchImpl:fakeFetch});
 await assert.rejects(client.initialize(),/401/);
});
