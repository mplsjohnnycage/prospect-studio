// Shared by the /api/rivet route (server) and the /rivet page (client).
export type RivetEventKind = "start" | "output" | "tool" | "exit";
export type RivetEvent = {
  seq: number;
  runId: string;
  kind: RivetEventKind;
  at: number;
  data?: { value?: number; actor?: string; message?: string; ok?: boolean; count?: number };
};
export type SeqCheck = { received: number; gaps: number; duplicates: number; lastSeq: number };
export const emptySeqCheck = (): SeqCheck => ({ received: 0, gaps: 0, duplicates: 0, lastSeq: -1 });
export function checkSeq(prev: SeqCheck, seq: number): SeqCheck {
  if (seq <= prev.lastSeq) return { ...prev, received: prev.received + 1, duplicates: prev.duplicates + 1 };
  const gaps = prev.gaps + (seq - prev.lastSeq - 1);
  return { received: prev.received + 1, gaps, duplicates: prev.duplicates, lastSeq: seq };
}
export const isRunId = (s: string) => /^[a-z0-9-]{4,48}$/.test(s);
