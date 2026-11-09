/** Image provider adapter — traced inputs/outputs; assets remain proposed. */

import { createHash } from "node:crypto";
import { generateText, modelList, withModelFallback } from "../gemini.ts";
import type { ReferenceBundle } from "./referenceBundle.ts";

export type ImageProviderPermission = {
  provider: "gemini-imagen" | "gemini-text-svg";
  allowed: boolean;
  reason: string;
};

export type GenerationTrace = {
  version: "visual-gen-trace.v1";
  provider: ImageProviderPermission["provider"];
  model: string;
  startedAt: string;
  finishedAt: string;
  input: {
    prospectId: string;
    prospectName: string;
    prompt: string;
    referenceBundleVersion: string;
    layoutPriorIds: string[];
  };
  output: {
    contentType: string;
    byteLength: number;
    sha256: string;
    reviewStatus: "generated_proposed";
    notes: string[];
  };
  usage?: Record<string, unknown>;
  fallbackFrom?: string;
};

export type GeneratedAsset = {
  bytes: Buffer;
  contentType: string;
  extension: string;
  trace: GenerationTrace;
};

export function checkImageProviderPermission(env: {
  GEMINI_API_KEY?: string;
}): ImageProviderPermission {
  if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 8) {
    return {
      provider: "gemini-imagen",
      allowed: true,
      reason: "GEMINI_API_KEY present for prospect-specific generation",
    };
  }
  return {
    provider: "gemini-text-svg",
    allowed: false,
    reason: "GEMINI_API_KEY missing; refuse silent unverified brand fabrication",
  };
}

export function buildVisualPrompt(bundle: ReferenceBundle): string {
  const colors =
    bundle.inferred.colors.slice(0, 4).join(", ") || "neutral professional palette";
  const services =
    bundle.inferred.services.slice(0, 4).join(", ") || "local home services";
  const priors = bundle.layoutPriors.map((p) => p.componentId).join(", ");
  return [
    `Create a single website hero concept mock for local business "${bundle.prospectName}".`,
    `Services cues: ${services}.`,
    `Suggested palette (inferred, not verified brand tokens): ${colors}.`,
    `Layout priors from approved registry: ${priors}.`,
    "Do not invent a logo mark as an official trademark.",
    "Clean modern contractor homepage hero, wide landscape composition.",
    "No watermark text. No phone numbers unless already verified.",
  ].join(" ");
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function extractSvg(text: string): string {
  const match = text.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) throw new Error("Model returned no SVG markup");
  return match[0];
}

async function generateImageModality(args: {
  apiKey: string;
  model: string;
  prompt: string;
  fetchImpl: typeof fetch;
}): Promise<{ bytes: Buffer; contentType: string; usage?: Record<string, unknown> }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${args.model}:generateContent`;
  const res = await args.fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": args.apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: args.prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: {
      content?: {
        parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[];
      };
    }[];
    usageMetadata?: Record<string, unknown>;
  };
  if (!res.ok) {
    throw new Error(
      `Gemini visual failed (${res.status}): ${(data.error?.message ?? "").slice(0, 200)}`,
    );
  }
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new Error("Gemini returned no image part");
  }
  return {
    bytes: Buffer.from(imagePart.inlineData.data, "base64"),
    contentType: imagePart.inlineData.mimeType ?? "image/png",
    usage: data.usageMetadata,
  };
}

async function generateSvgFallback(args: {
  apiKey: string;
  prompt: string;
}): Promise<{ bytes: Buffer; contentType: string; model: string; usage?: Record<string, unknown> }> {
  const models = modelList(process.env.GEMINI_VISUAL_TEXT_MODELS, [
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
    "gemini-3.8-flash",
  ]);
  const result = await withModelFallback(models, (model) =>
    generateText({
      apiKey: args.apiKey,
      model,
      system:
        "You output only one complete SVG document for a website hero mock. No markdown fences. Mark it clearly as a concept mock, not an official logo.",
      prompt:
        args.prompt +
        " Return a 1200x630 SVG with business name text, simple geometric shapes, and a CTA button rectangle. Use only inferred palette hints.",
      temperature: 0.6,
      maxOutputTokens: 4096,
      timeoutMs: 90_000,
    }),
  );
  const svg = extractSvg(result.text);
  return {
    bytes: Buffer.from(svg, "utf8"),
    contentType: "image/svg+xml",
    model: result.model,
    usage: result.usage as Record<string, unknown> | undefined,
  };
}

export async function generateProspectVisual(args: {
  apiKey: string;
  bundle: ReferenceBundle;
  model?: string;
  fetchImpl?: typeof fetch;
}): Promise<GeneratedAsset> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const imageModel = args.model ?? "gemini-2.5-flash-image";
  const prompt = buildVisualPrompt(args.bundle);
  const startedAt = new Date().toISOString();

  let bytes: Buffer;
  let contentType: string;
  let modelUsed = imageModel;
  let provider: ImageProviderPermission["provider"] = "gemini-imagen";
  let usage: Record<string, unknown> | undefined;
  let fallbackFrom: string | undefined;

  try {
    const image = await generateImageModality({
      apiKey: args.apiKey,
      model: imageModel,
      prompt,
      fetchImpl,
    });
    bytes = image.bytes;
    contentType = image.contentType;
    usage = image.usage;
  } catch (err) {
    // Quota/model gaps fall back to traced text→SVG so the exit gate still gets a real model run.
    const svg = await generateSvgFallback({ apiKey: args.apiKey, prompt });
    bytes = svg.bytes;
    contentType = svg.contentType;
    modelUsed = svg.model;
    provider = "gemini-text-svg";
    usage = svg.usage;
    fallbackFrom = `${imageModel}: ${err instanceof Error ? err.message.slice(0, 160) : "image failed"}`;
  }

  const finishedAt = new Date().toISOString();
  const extension = contentType.includes("svg")
    ? "svg"
    : contentType.includes("jpeg")
      ? "jpg"
      : "png";

  return {
    bytes,
    contentType,
    extension,
    trace: {
      version: "visual-gen-trace.v1",
      provider,
      model: modelUsed,
      startedAt,
      finishedAt,
      input: {
        prospectId: args.bundle.prospectId,
        prospectName: args.bundle.prospectName,
        prompt,
        referenceBundleVersion: args.bundle.version,
        layoutPriorIds: args.bundle.layoutPriors.map((p) => p.componentId),
      },
      output: {
        contentType,
        byteLength: bytes.byteLength,
        sha256: sha256(bytes),
        reviewStatus: "generated_proposed",
        notes: [
          "Asset is generated/proposed until human review.",
          "Must not be presented as a verified brand asset.",
          ...(fallbackFrom ? [`Image modality unavailable; used SVG fallback (${fallbackFrom})`] : []),
        ],
      },
      usage,
      fallbackFrom,
    },
  };
}
