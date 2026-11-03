"use client";
import { useRef, useState } from "react";
import { checkSeq, emptySeqCheck, type RivetEvent, type SeqCheck } from "@/lib/rivet-events";

export default function RivetSpikePage() {
  const [events, setEvents] = useState<RivetEvent[]>([]);
  const [check, setCheck] = useState<SeqCheck>(emptySeqCheck());
  const [status, setStatus] = useState("idle");
  const esRef = useRef<EventSource | null>(null);

  function start() {
    esRef.current?.close();
    const runId = `run-${Date.now().toString(36)}`;
    setEvents([]);
    setCheck(emptySeqCheck());
    setStatus("connecting");
    const es = new EventSource(`/api/rivet/stream?runId=${runId}&steps=20`);
    esRef.current = es;
    es.onopen = () => setStatus("streaming");
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data) as RivetEvent;
      setEvents((p) => [...p, ev]);
      setCheck((p) => checkSeq(p, ev.seq));
      if (ev.kind === "exit") {
        setStatus(ev.data?.ok ? "done" : "failed");
        es.close();
      }
    };
    es.onerror = () => {
      setStatus((s) => (s === "done" || s === "failed" ? s : "disconnected"));
      es.close();
    };
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Rivet stream spike</h1>
      <button onClick={start} disabled={status === "connecting" || status === "streaming"}>Start run</button>
      <p data-testid="status">
        Status: {status} · received {check.received} · gaps {check.gaps} · duplicates {check.duplicates}
      </p>
      <ol start={0} style={{ fontFamily: "monospace", fontSize: 13 }}>
        {events.map((e) => (
          <li key={`${e.runId}-${e.seq}`}>
            {e.kind} {e.data?.value ?? e.data?.message ?? ""}
          </li>
        ))}
      </ol>
    </main>
  );
}
