// One entry point for text generation across providers. Models are plain Gemini names
// ("gemini-3.5-flash"), OpenCode Zen models prefixed with "zen:" ("zen:deepseek-v4-flash-free"),
// or OmniRoute models prefixed with "omni:" ("omni:auto"). OmniRoute is the self-hosted model
// router on the PC node (tailnet only), so it is used only where OMNIROUTE_BASE_URL is set.
// Errors use GeminiHttpError statuses so withModelFallback treats every provider the same.
import {GeminiHttpError,generateText,type GeminiResult} from "./gemini";

export type GenerateOpts = {
  model: string; system: string; prompt: string;
  temperature?: number; maxOutputTokens?: number; timeoutMs?: number;
  geminiKey?: string; zenKey?: string;
  omniKey?: string; omniBaseUrl?: string;
};

type ChatResponse = {choices?: {message?: {content?: string}; finish_reason?: string}[]; usage?: {prompt_tokens?: number; completion_tokens?: number; total_tokens?: number}; error?: {message?: string}};

/** POSTs an OpenAI-compatible chat completion and maps the answer to GeminiResult. */
async function chatCompletion(url: string, key: string, label: string, prefix: string, model: string, opts: GenerateOpts): Promise<GeminiResult> {
  if (!/^[a-z0-9.\-/:_]+$/i.test(model)) throw new Error("Invalid model name");
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {"content-type": "application/json", authorization: "Bearer " + key},
      body: JSON.stringify({model, messages: [{role: "system", content: opts.system}, {role: "user", content: opts.prompt}], temperature: opts.temperature ?? 0.8, max_tokens: opts.maxOutputTokens ?? 24000}),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 240_000),
    });
  } catch {
    throw new GeminiHttpError(504, `${label} ${model} did not answer in time`);
  }
  const data = (await res.json().catch(() => ({}))) as ChatResponse;
  if (!res.ok) throw new GeminiHttpError(res.status, `${label} ${model} failed (${res.status}): ${(data.error?.message ?? "").slice(0, 160)}`);
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new GeminiHttpError(503, `${label} ${model} returned no text`);
  return {text, model: prefix + model, finishReason: data.choices?.[0]?.finish_reason, usage: {promptTokenCount: data.usage?.prompt_tokens, candidatesTokenCount: data.usage?.completion_tokens, totalTokenCount: data.usage?.total_tokens}};
}

export async function generateZen(opts: GenerateOpts): Promise<GeminiResult> {
  if (!opts.zenKey) throw new GeminiHttpError(404, "OPENCODE_API_KEY is not configured");
  return chatCompletion("https://opencode.ai/zen/v1/chat/completions", opts.zenKey, "Zen", "zen:", opts.model.replace(/^zen:/, ""), opts);
}

/** Normalizes an OmniRoute base URL ("http://host:20128" or ".../v1") to its chat completions URL. */
export function omniChatUrl(baseUrl: string): string {
  const u = new URL(baseUrl);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("OmniRoute URL must be http or https");
  const path = u.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");
  return `${u.origin}${path}/v1/chat/completions`;
}

export async function generateOmni(opts: GenerateOpts): Promise<GeminiResult> {
  if (!opts.omniKey || !opts.omniBaseUrl) throw new GeminiHttpError(404, "OMNIROUTE_BASE_URL and OMNIROUTE_API_KEY are not configured");
  return chatCompletion(omniChatUrl(opts.omniBaseUrl), opts.omniKey, "OmniRoute", "omni:", opts.model.replace(/^omni:/, ""), opts);
}

export async function generateAny(opts: GenerateOpts): Promise<GeminiResult> {
  if (opts.model.startsWith("omni:")) return generateOmni(opts);
  if (opts.model.startsWith("zen:")) return generateZen(opts);
  if (!opts.geminiKey) throw new GeminiHttpError(404, "GEMINI_API_KEY is not configured");
  return generateText({apiKey: opts.geminiKey, model: opts.model, system: opts.system, prompt: opts.prompt, temperature: opts.temperature, maxOutputTokens: opts.maxOutputTokens, timeoutMs: opts.timeoutMs});
}

/** OmniRoute settings from env, or null when the router is not reachable from this runtime. */
export function omniFromEnv(env: Record<string, string | undefined> = process.env): {omniBaseUrl: string; omniKey: string; model: string} | null {
  const omniBaseUrl = env.OMNIROUTE_BASE_URL?.trim(), omniKey = env.OMNIROUTE_API_KEY?.trim();
  if (!omniBaseUrl || !omniKey) return null;
  return {omniBaseUrl, omniKey, model: "omni:" + (env.OMNIROUTE_MODEL?.trim() || "auto")};
}

/** OmniRoute first when configured, then Gemini models, then OpenCode Zen models when a Zen key is set. */
export function demoModelList(envValue: string | undefined, hasZen: boolean, omniModel?: string): string[] {
  const env = (envValue ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const defaults = [...(omniModel ? [omniModel] : []), "gemini-3.5-flash", "gemini-3.8-flash", "gemini-flash-latest", ...(hasZen ? ["zen:deepseek-v4-flash-free", "zen:mimo-v2.5-free"] : [])];
  return [...new Set([...env, ...defaults])];
}
