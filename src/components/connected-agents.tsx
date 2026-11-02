"use client";
import {useState} from "react";
import {useAction,useMutation,useQuery} from "convex/react";
import {Copy,KeyRound,LoaderCircle,PlugZap,Trash2} from "lucide-react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {api} from "../../convex/_generated/api";

const MCP_URL=(process.env.NEXT_PUBLIC_CONVEX_SITE_URL??"").replace(/\/$/,"")+"/mcp";
async function copy(text:string,label:string){try{await navigator.clipboard.writeText(text);toast.success(label+" copied")}catch{toast.error("Copy failed; select and copy it by hand")}}

/** Settings card: the MCP server URL, API keys for CLI agents, and connected agents. */
export function ConnectedAgents(){
 const connections=useQuery(api.mcp.listConnections);
 const createKey=useAction(api.mcp.createApiKey);
 const revoke=useMutation(api.mcp.revokeConnection);
 const [name,setName]=useState("Claude Code"),[busy,setBusy]=useState(false),[newKey,setNewKey]=useState<string|null>(null);
 async function create(){
  setBusy(true);
  try{const r=await createKey({name:name.trim()||"Agent"});setNewKey(r.apiKey);}
  catch(e){toast.error(e instanceof Error?e.message:"Could not create a key")}
  finally{setBusy(false)}
 }
 const cli=newKey?`claude mcp add --transport http prospect-studio ${MCP_URL} --header "Authorization: Bearer ${newKey}"`:"";
 return <div className="rounded-2xl border border-border bg-card p-5 md:col-span-2">
  <div className="flex items-center gap-2 text-sm font-semibold"><PlugZap size={17} className="text-primary"/> Outside agents (MCP)</div>
  <p className="mt-2 text-xs leading-5 text-muted-foreground">Let Claude, ChatGPT, Cursor, Claude Code or OpenCode work your pipeline with the same tools as the in-app agent. They can research, build demos and write drafts. They can never send email.</p>
  <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
   <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Server URL</div>
   <div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 truncate text-xs">{MCP_URL}</code><Button size="sm" variant="outline" onClick={()=>void copy(MCP_URL,"URL")}><Copy size={13}/></Button></div>
   <p className="mt-2 text-[11px] leading-5 text-muted-foreground"><b>Claude.ai or ChatGPT:</b> add a custom connector with this URL, then approve it on the page that opens. <b>Command-line agents:</b> create a key below.</p>
  </div>
  <div className="mt-4 flex flex-wrap items-end gap-2">
   <div className="min-w-[180px] flex-1"><label className="text-[11px] font-medium text-muted-foreground" htmlFor="key-name">Key name</label><Input id="key-name" value={name} onChange={e=>setName(e.target.value)} maxLength={60} className="mt-1 h-9 text-xs"/></div>
   <Button size="sm" className="h-9" disabled={busy} onClick={()=>void create()}>{busy?<LoaderCircle size={14} className="animate-spin"/>:<KeyRound size={14}/>} Create API key</Button>
  </div>
  {newKey&&<div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
   <p className="font-semibold">Copy this key now. It won&apos;t be shown again.</p>
   <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 truncate">{newKey}</code><Button size="sm" variant="outline" onClick={()=>void copy(newKey,"Key")}><Copy size={13}/></Button></div>
   <p className="mt-3 text-muted-foreground">Claude Code:</p>
   <div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 truncate">{cli}</code><Button size="sm" variant="outline" onClick={()=>void copy(cli,"Command")}><Copy size={13}/></Button></div>
   <button className="mt-2 text-[11px] text-muted-foreground underline" onClick={()=>setNewKey(null)}>Done</button>
  </div>}
  <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Connected</div>
  <div className="mt-2 divide-y divide-border rounded-xl border border-border">
   {connections===undefined?<div className="p-3 text-xs text-muted-foreground">Loading…</div>:!connections.length?<div className="p-3 text-xs text-muted-foreground">No agents connected yet.</div>:connections.map(c=><div key={c.id} className="flex items-center gap-3 p-3 text-xs">
    <div className="min-w-0 flex-1"><div className="truncate font-medium">{c.name}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{c.kind==="apiKey"?"API key":"Connected agent"} · {c.scopes.includes("pipeline:write")?"read and draft":"read only"} · {c.lastUsedAt?"used "+new Date(c.lastUsedAt).toLocaleDateString():"not used yet"}</div></div>
    <Button size="sm" variant="outline" aria-label={"Disconnect "+c.name} onClick={()=>void revoke({id:c.id}).then(()=>toast.success("Disconnected"))}><Trash2 size={13}/></Button>
   </div>)}
  </div>
 </div>;
}
