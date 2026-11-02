// One entry point for text generation across providers. Models are plain Gemini names
// ("gemini-3.5-flash") or OpenCode Zen models prefixed with "zen:" ("zen:deepseek-v4-flash-free").
// Errors use GeminiHttpError statuses so withModelFallback treats every provider the same.
import {GeminiHttpError,generateText,type GeminiResult} from "./gemini";

export type GenerateOpts = {
  model: string; system: string; prompt: string;
  temperature?: number; maxOutputTokens?: number; timeoutMs?: number;
  geminiKey?: string; zenKey?: string;
};

type ZenResponse = {choices?: {message?: {content?: string}; finish_reason?: string}[]; usage?: {prompt_tokens?: number; completion_tokens?: number; total_tokens?: number}; error?: {message?: string}};

export async function generateZen(opts: GenerateOpts): Promise<GeminiResult> {
  const model = opts.model.replace(/^zen:/, "");
  if (!opts.zenKey) throw new GeminiHttpError(404, "OPENCODE_API_KEY is not configured");
  if (!/^[a-z0-9.\-]+$/i.test(model)) throw new Error("Invalid model name");
  let res: Response;
  try {
    res = await fetch("https://opencode.ai/zen/v1/chat/completions", {
      method: "POST",
      headers: {"content-type": "application/json", authorization: "Bearer " + opts.zenKey},
      body: JSON.stringify({model, messages: [{role: "system", content: opts.system}, {role: "user", content: opts.prompt}], temperature: opts.temperature ?? 0.8, max_tokens: opts.maxOutputTokens ?? 24000}),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 240_000),
    });
  } catch {
    throw new GeminiHttpError(504, `Zen ${model} did not answer in time`);
  }
  const data = (await res.json().catch(() => ({}))) as ZenResponse;
  if (!res.ok) throw new GeminiHttpError(res.status, `Zen ${model} failed (${res.status}): ${(data.error?.message ?? "").slice(0, 160)}`);
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new GeminiHttpError(503, `Zen ${model} returned no text`);
  return {text, model: "zen:" + model, finishReason: data.choices?.[0]?.finish_reason, usage: {promptTokenCount: data.usage?.prompt_tokens, candidatesTokenCount: data.usage?.completion_tokens, totalTokenCount: data.usage?.total_tokens}};
}

export async function generateAny(opts: GenerateOpts): Promise<GeminiResult> {
  if (opts.model.startsWith("zen:")) return generateZen(opts);
  if (!opts.geminiKey) throw new GeminiHttpError(404, "GEMINI_API_KEY is not configured");
  return generateText({apiKey: opts.geminiKey, model: opts.model, system: opts.system, prompt: opts.prompt, temperature: opts.temperature, maxOutputTokens: opts.maxOutputTokens, timeoutMs: opts.timeoutMs});
}

/** Gemini models first, then OpenCode Zen models when a Zen key is set. */
export function demoModelList(envValue: string | undefined, hasZen: boolean): string[] {
  const env = (envValue ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const defaults = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-flash-latest", ...(hasZen ? ["zen:deepseek-v4-flash-free", "zen:mimo-v2.5-free"] : [])];
  return [...new Set([...env, ...defaults])];
}
