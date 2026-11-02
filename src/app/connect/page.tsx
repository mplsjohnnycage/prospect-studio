"use client";
// Consent page for outside agents connecting over MCP. The AuthGate in the root layout
// makes sure the owner is signed in before this renders.
import {Suspense,useState,useSyncExternalStore} from "react";
import {useSearchParams} from "next/navigation";
import {useAction,useMutation,useQuery} from "convex/react";
import {LoaderCircle,PlugZap,ShieldAlert,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {api} from "../../../convex/_generated/api";

const noop=()=>()=>{};
function isFramed(){try{return window.top!==window.self}catch{return true}}
function Consent(){
 const params=useSearchParams();
 const [requestId,setRequestId]=useState<string|null>(params.get("request"));
 const framed=useSyncExternalStore(noop,isFramed,()=>false);
 if(framed)return <Shell><p className="text-sm">For your safety this page can&apos;t be shown inside another site. Open it directly.</p></Shell>;
 return requestId?<Decide requestId={requestId}/>:<EnterCode onFound={setRequestId}/>;
}

function Shell({children}:{children:React.ReactNode}){
 return <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-12 text-foreground"><div className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-7 shadow-xl"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><PlugZap size={20}/></span><div><h1 className="text-lg font-semibold">Connect an agent</h1><p className="text-xs text-muted-foreground">Prospect Studio</p></div></div>{children}</div></main>;
}

function EnterCode({onFound}:{onFound:(id:string)=>void}){
 const find=useMutation(api.mcp.findAuthRequest);
 const [code,setCode]=useState(""),[error,setError]=useState("");
 return <Shell>
  <p className="text-sm text-muted-foreground">Type the code your agent is showing you.</p>
  <form className="flex gap-2" onSubmit={async e=>{e.preventDefault();setError("");const id=await find({userCode:code}).catch(()=>null);if(id)onFound(id);else setError("No pending request with that code.")}}>
   <Input value={code} onChange={e=>setCode(e.target.value)} placeholder="ABCD-EFGH" className="font-mono uppercase"/><Button type="submit">Continue</Button>
  </form>
  {error&&<p className="text-xs text-destructive">{error}</p>}
 </Shell>;
}

function Decide({requestId}:{requestId:string}){
 const request=useQuery(api.mcp.getAuthRequest,{requestId});
 const authorize=useAction(api.mcp.authorize);
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[done,setDone]=useState<string|null>(null),[error,setError]=useState("");
 if(request===undefined)return <Shell><LoaderCircle className="mx-auto animate-spin text-muted-foreground"/></Shell>;
 if(request===null)return <Shell><p className="text-sm">This request has expired or doesn&apos;t exist. Start the connection again from your agent.</p></Shell>;
 if(done)return <Shell><p className="text-sm">{done}</p></Shell>;
 if(request.status!=="pending")return <Shell><p className="text-sm">This request was already {request.status}.</p></Shell>;
 const device=request.kind==="device";
 async function decide(approve:boolean){
  setBusy(true);setError("");
  try{
   const r=await authorize({requestId,approve,...(device&&approve?{userCode:request!.userCode}:{})});
   if(r.redirectUrl){window.location.assign(r.redirectUrl);return;}
   setDone(approve?"Connected. Go back to your agent; it can start working now.":"Request denied. Nothing was shared.");
  }catch(e){setError(e instanceof Error?e.message:"Something went wrong")}
  finally{setBusy(false)}
 }
 return <Shell>
  <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
   <p><b>{request.clientName||"An agent"}</b> <span className="text-xs text-muted-foreground">(name reported by the agent, not verified)</span> wants to use your Prospect Studio pipeline.</p>
   {request.redirectUri&&<p className="mt-2 break-all text-[11px] text-muted-foreground">Returns to: {request.redirectUri}</p>}
  </div>
  <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">It will be able to</p><ul className="mt-2 space-y-1.5 text-sm">{request.scopes.map(s=><li key={s.name} className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary"/>{s.description}</li>)}</ul><p className="mt-2 flex gap-2 text-xs text-muted-foreground"><ShieldAlert size={14} className="mt-0.5 shrink-0"/>It can never send email or replies. You approve and send everything in the app.</p></div>
  {device&&<label className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>My agent is showing the code <b className="font-mono">{request.userCode}</b></span></label>}
  {error&&<p className="text-xs text-destructive">{error}</p>}
  <div className="flex gap-2"><Button variant="outline" className="flex-1" disabled={busy} onClick={()=>void decide(false)}>Deny</Button><Button className="flex-1" disabled={busy||(device&&!confirmed)} onClick={()=>void decide(true)}>{busy?<LoaderCircle size={15} className="animate-spin"/>:null} Allow</Button></div>
 </Shell>;
}

export default function ConnectPage(){
 return <Suspense fallback={null}><Consent/></Suspense>;
}
