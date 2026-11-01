import { env } from "../../env";

const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-image";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type GeneratedTaskImage = {
  buffer: Buffer;
  extension: ".png" | ".jpg" | ".webp";
  contentType: "image/png" | "image/jpeg" | "image/webp";
  model: string;
};

function imageType(buffer: Buffer): GeneratedTaskImage["contentType"] | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export function getOpenRouterImageModel(): string {
  return String(env.OPENROUTER_IMAGE_MODEL || "").trim() || DEFAULT_IMAGE_MODEL;
}

export async function generateTaskIllustration(prompt: string): Promise<GeneratedTaskImage> {
  const apiKey = String(env.OPENROUTER_API_KEY || "").trim()
    || String(env.OPENROUTER_BACKUP_API_KEYS || "").split(",").map(value => value.trim()).find(Boolean)
    || "";
  if (!apiKey) throw new Error("IMAGE_GENERATION_UNAVAILABLE: OpenRouter API key is not configured");

  const model = getOpenRouterImageModel();
  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": String(env.OPENROUTER_REFERER || env.FRONTEND_URL || "https://studycod.space"),
        "X-Title": "StudyCod EDU",
      },
      body: JSON.stringify({ model, prompt }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new Error("IMAGE_GENERATION_FAILED: OpenRouter image request failed or timed out");
  }

  if (!response.ok) {
    // Keep provider response bodies out of the API error and logs; they can
    // contain account metadata or internal routing details.
    throw new Error(`IMAGE_GENERATION_FAILED: OpenRouter returned HTTP ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("IMAGE_GENERATION_FAILED: Invalid response from image provider");
  }
  const first = payload && typeof payload === "object" && "data" in payload && Array.isArray(payload.data)
    ? payload.data[0]
    : undefined;
  const base64 = first && typeof first === "object" && "b64_json" in first && typeof first.b64_json === "string"
    ? first.b64_json
    : "";
  if (!base64 || base64.length > Math.ceil(MAX_IMAGE_BYTES * 1.4)) {
    throw new Error("IMAGE_GENERATION_FAILED: Image response is empty or too large");
  }

  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("IMAGE_GENERATION_FAILED: Image response is empty or too large");
  }
  const contentType = imageType(buffer);
  if (!contentType) throw new Error("IMAGE_GENERATION_FAILED: Provider did not return a supported raster image");

  return {
    buffer,
    contentType,
    extension: contentType === "image/jpeg" ? ".jpg" : contentType === "image/webp" ? ".webp" : ".png",
    model,
  };
}
