"use client";

import { useMemo, useState } from "react";
import { Monitor, Terminal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isCommandKind } from "@/lib/contracts/command-kind";
import { runTypedCommandFromUi } from "@/lib/operator/mcp-tools";
import {
  attachDesktopViewer,
  openOperatorSession,
  runHeadlessJob,
  viewerControl,
} from "@/lib/operator/session";

/** Settings surface: same typed CommandKind path as MCP + desktop session controls. */
export function OperatorPanel() {
  const [kind, setKind] = useState("qa.evaluate");
  const [subjectId, setSubjectId] = useState("p7-demo-authentic-ff");
  const [lastFingerprint, setLastFingerprint] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const actor = useMemo(
    () => ({ role: "owner" as const, actorId: "johnny-cage", subject: "owner" }),
    [],
  );

  function dispatch() {
    if (!isCommandKind(kind)) {
      toast.error("Unknown CommandKind");
      return;
    }
    try {
      const result = runTypedCommandFromUi(actor, {
        kind,
        commandId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        correlationId: `ui-${Date.now()}`,
        expectedRevision: 1,
        subjectType: "artifact",
        subjectId: subjectId.trim() || "unknown",
      });
      setLastFingerprint(result.fingerprint);
      toast.success(`Typed command accepted (${result.channel})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Command failed");
    }
  }

  function startSession() {
    try {
      let session = openOperatorSession({ ownerId: actor.actorId });
      session = runHeadlessJob(session, {
        command: "echo operator-ui-headless",
        stdout: "operator-ui-headless\n",
        exitCode: 0,
      });
      session = attachDesktopViewer(session, actor);
      session = viewerControl(
        session,
        actor,
        "viewer.focus",
        session.viewer!.controlToken,
      );
      setSessionId(session.sessionId);
      setViewerUrl(session.viewer?.url ?? null);
      toast.success("Desktop session bound (headless + noVNC)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Session failed");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 md:col-span-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Terminal size={17} className="text-primary" /> Operator / MCP parity
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Dispatch the same typed CommandKind envelope the MCP `run_typed_command`
        tool uses. Headless jobs and the noVNC viewer share one Rivet/Sprite
        session id.
      </p>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground" htmlFor="op-kind">
            CommandKind
          </label>
          <Input
            id="op-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="mt-1 h-9 font-mono text-xs"
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground" htmlFor="op-subject">
            Subject id
          </label>
          <Input
            id="op-subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="mt-1 h-9 font-mono text-xs"
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={dispatch}>
          Run typed command (UI)
        </Button>
        <Button size="sm" variant="outline" onClick={startSession}>
          <Monitor size={14} /> Open desktop session
        </Button>
      </div>
      {lastFingerprint && (
        <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">
          fingerprint {lastFingerprint}
        </p>
      )}
      {sessionId && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          session <code className="font-mono">{sessionId}</code>
          {viewerUrl ? (
            <>
              {" · "}
              <a className="underline" href={viewerUrl} target="_blank" rel="noreferrer">
                noVNC viewer
              </a>
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
