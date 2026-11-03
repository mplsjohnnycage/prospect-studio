import { createClient } from "rivetkit/client";
import type { RivetEvent } from "@/lib/rivet-events";
import { isRunId } from "@/lib/rivet-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Spike: streams one run as SSE. Each step is a real action call on the `counter`
// actor served by the desktop node in the Rivet Cloud test namespace.
// RIVET_SPIKE_ENDPOINT comes from env only and is never echoed.
export async function GET(req: Request) {
  const endpoint = process.env.RIVET_SPIKE_ENDPOINT;
  if (!endpoint) return Response.json({ error: "RIVET_SPIKE_ENDPOINT not set" }, { status: 503 });
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId") ?? "";
  if (!isRunId(runId)) return Response.json({ error: "bad runId" }, { status: 400 });
  const steps = Math.max(1, Math.min(Number(url.searchParams.get("steps") ?? 20) || 20, 200));
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let seq = 0;
      const send = (e: Omit<RivetEvent, "seq" | "runId" | "at">) => {
        const ev: RivetEvent = { seq: seq++, runId, at: Date.now(), ...e };
        ctrl.enqueue(enc.encode(`id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`));
      };
      try {
        const client = createClient(endpoint);
        const actor = client.counter.getOrCreate(["run", runId]);
        send({ kind: "start", data: { actor: "counter", count: steps } });
        for (let i = 0; i < steps && !req.signal.aborted; i++) {
          send({ kind: "tool", data: { message: "counter.inc" } });
          const value = (await actor.inc(1)) as number;
          send({ kind: "output", data: { value } });
        }
        send({ kind: "exit", data: { ok: true, value: (await actor.get()) as number } });
      } catch (err) {
        const msg = String((err as Error)?.message ?? err).replace(/https?:\/\/[^\s]+/g, "<endpoint>");
        send({ kind: "exit", data: { ok: false, message: msg.slice(0, 200) } });
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
