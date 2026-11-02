"use client";

import { useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ShieldCheck, LoaderCircle, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const currentUser = useQuery(api.auth.currentUser, isAuthenticated ? {} : "skip");
  const [password, setPassword] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [activate, setActivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");

  if (isLoading) return <div className="grid min-h-dvh place-items-center bg-background"><LoaderCircle className="size-7 animate-spin text-primary" aria-label="Verifying session"/></div>;
  if (isAuthenticated && currentUser === undefined) return <div className="grid min-h-dvh place-items-center bg-background"><LoaderCircle className="size-7 animate-spin text-primary" aria-label="Checking workspace permissions"/></div>;
  if (isAuthenticated && !currentUser?.isOwner) return <main className="grid min-h-dvh place-items-center bg-background px-5 text-foreground"><section className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-card p-8 shadow-xl"><ShieldCheck className="size-7 text-primary"/><h1 className="text-xl font-semibold">Agent account authenticated</h1><p className="text-sm text-muted-foreground">This AgentID identity is a non-owner AgentMail account. The owner workspace and its surfaces are not available to agent accounts.</p><Button className="w-full" variant="outline" onClick={() => void authClient.signOut()}><LogOut className="mr-2 size-4"/> Sign out</Button></section></main>;
  if (isAuthenticated && currentUser?.isOwner) return <>
    {children}
    <button className="fixed bottom-2 right-2 z-[1000] rounded-lg border border-border bg-background/85 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur hover:text-foreground" onClick={() => void authClient.signOut()} title="Sign out of Prospect Studio">
      <LogOut className="mr-1 inline size-3"/> Sign out
    </button>
  </>;

  const email = "johnnyc@agentmail.to";
  return <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-12 text-foreground">
    <form className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-8 shadow-xl" onSubmit={async e => {
      e.preventDefault();
      setBusy(true); setError("");
      try {
        if (activate) {
          const result=await authClient.signUp.email({email,password,name:activationCode.trim()});
          if(result.error) setError(result.error.message ?? "Activation failed");
          else setActivate(false);
        } else {
          const result = await authClient.signIn.email({email,password});
          if (result.error) setError(result.error.message ?? "Sign-in failed");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Authentication failed");
      } finally { setBusy(false); setPassword(""); }
    }}>
      <span className="inline-grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground"><ShieldCheck className="size-6"/></span>
      <div><h1 className="text-2xl font-semibold tracking-tight">Prospect Studio</h1>
      <p className="mt-2 text-sm text-muted-foreground">{activate ? "Use the one-time code sent to your AgentMail inbox to activate your private workspace." : "Private workspace. Sign in with your account password."}</p></div>
      <div className="space-y-1.5"><label className="text-xs font-semibold">Account</label><Input value={email} readOnly aria-label="Account email"/></div>
      {activate && <div className="space-y-1.5"><label htmlFor="studio-code" className="text-xs font-semibold">One-time AgentMail activation code</label><Input id="studio-code" autoComplete="one-time-code" required value={activationCode} onChange={e=>setActivationCode(e.target.value)} /></div>}
      <div className="space-y-1.5"><label htmlFor="studio-password" className="text-xs font-semibold">{activate ? "Choose a secure password (10+ characters)" : "Password"}</label><Input id="studio-password" type="password" autoComplete={activate?"new-password":"current-password"} minLength={10} required value={password} onChange={e=>setPassword(e.target.value)}/></div>
      {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy||password.length<10||(activate&&activationCode.length<16)}>{busy?"Working…":activate?"Activate account":"Sign in"}</Button>
      <div className="flex items-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-border"/><span className="text-[11px] font-medium text-muted-foreground">or</span><span className="h-px flex-1 bg-border"/></div>
      <Button type="button" variant="outline" className="w-full" disabled={busy||googleBusy} onClick={async () => {
        setGoogleBusy(true); setError("");
        try {
          const result = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
          if (result?.error) { setError(result.error.message ?? "Google sign-in failed"); setGoogleBusy(false); }
          // On success the auth client redirects the browser to Google.
        } catch (e) {
          setError(e instanceof Error ? e.message : "Google sign-in failed");
          setGoogleBusy(false);
        }
      }}>{googleBusy?"Redirecting to Google…":"Sign in with Google"}</Button>
      {!activate && <Button type="button" variant="outline" className="w-full" disabled={busy||googleBusy} onClick={async () => {
        setBusy(true); setError("");
        try {
          const result = await authClient.signIn.oauth2({ providerId: "agentid", callbackURL: window.location.origin });
          if (result.error) setError(result.error.message ?? "AgentID sign-in failed");
        } catch (e) {
          setError(e instanceof Error ? e.message : "AgentID sign-in failed");
        } finally { setBusy(false); }
      }}>Sign in with AgentID</Button>}
      <button type="button" className="w-full text-center text-xs text-primary underline-offset-4 hover:underline" onClick={()=>{setActivate(v=>!v);setError("");setPassword("");}}>{activate?"Back to sign in":"First time? Activate with AgentMail code"}</button>
      <p className="text-[11px] leading-5 text-muted-foreground">The workspace uses per-user Convex authentication. Public requests cannot access records, even with the deployment URL.</p>
    </form>
  </main>;
}
