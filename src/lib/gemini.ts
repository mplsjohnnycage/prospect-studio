// Minimal Gemini REST client used by Convex actions. The API key is passed in from the
// deployment environment and never logged or returned.
export type GeminiResult = {
  text: string;
  model: string;
  finishReason?: string;
  usage?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
};

type Part = { text?: string; thought?: boolean };
type Response = {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: GeminiResult["usage"];
  error?: { message?: string; status?: string };
};

export class GeminiHttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
/** Statuses where trying the next model makes sense: quota, overload, retired model, server error. */
const FALLBACK_STATUSES = new Set([404, 429, 500, 503, 504]);

export function modelList(envValue: string | undefined, defaults: string[]): string[] {
  const list = (envValue ?? "").split(",").map(s => s.trim()).filter(Boolean);
  return [...new Set([...list, ...defaults])];
}

/** Run fn with each model in turn until one succeeds; non-retryable errors stop immediately. */
export async function withModelFallback<T>(models: string[], fn: (model: string) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const m of models) {
    try { return await fn(m); }
    catch (e) {
      last = e;
      if (!(e instanceof GeminiHttpError && FALLBACK_STATUSES.has(e.status))) throw e;
    }
  }
  throw last instanceof Error ? last : new Error("No model available");
}

export function parseGeminiResponse(data: Response, model: string): GeminiResult {
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .filter(p => !p.thought && typeof p.text === "string")
    .map(p => p.text)
    .join("");
  if (!text) {
    const why = data.promptFeedback?.blockReason ? `blocked: ${data.promptFeedback.blockReason}` : cand?.finishReason ?? "empty response";
    throw new Error(`Gemini returned no text (${why})`);
  }
  return { text, model, finishReason: cand?.finishReason, usage: data.usageMetadata };
}

export async function generateText(opts: {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<GeminiResult> {
  if (!/^[a-z0-9.\-]+$/i.test(opts.model)) throw new Error("Invalid model name");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`;
  let res: globalThis.Response;
  try {
  res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      generationConfig: { temperature: opts.temperature ?? 0.8, maxOutputTokens: opts.maxOutputTokens ?? 32768 },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 240_000),
  });
  } catch (e) {
    // A timeout or dropped connection is treated like an overloaded model so the next one is tried.
    throw new GeminiHttpError(504, `Gemini ${opts.model} did not answer in time${e instanceof Error && e.name !== "TimeoutError" ? " (" + e.message.slice(0, 80) + ")" : ""}`);
  }
  const data = (await res.json().catch(() => ({}))) as Response;
  if (!res.ok) throw new GeminiHttpError(res.status, `Gemini ${opts.model} failed (${res.status}): ${(data.error?.message ?? "").slice(0, 160)}`);
  return parseGeminiResponse(data, opts.model);
}
