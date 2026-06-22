export type ExtractedImagePayload =
  | { type: "base64"; value: string; mimeType?: string; sourcePath: string }
  | { type: "url"; value: string; sourcePath: string };

const urlKeys = new Set([
  "url",
  "image_url",
  "imageUrl",
  "image",
  "output_url",
  "outputUrl",
  "file_url",
  "fileUrl",
  "download_url",
  "downloadUrl",
  "signed_url",
  "signedUrl",
  "asset_url",
  "assetUrl"
]);

const base64Keys = new Set([
  "b64_json",
  "b64",
  "base64",
  "image_base64",
  "imageBase64",
  "output_base64",
  "outputBase64"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseDataUrl(value: string) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(value.trim());
  if (!match) return undefined;
  return { mimeType: match[1], base64: match[2].replace(/\s+/g, "") };
}

function looksLikeImageUrl(value: string) {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed);
}

function looksLikeBase64Image(value: string) {
  const trimmed = value.trim();
  if (parseDataUrl(trimmed)) return true;
  if (trimmed.length < 200) return false;
  return /^[A-Za-z0-9+/=_-]+$/.test(trimmed.replace(/\s+/g, ""));
}

function fromString(value: string, sourcePath: string, preferBase64: boolean): ExtractedImagePayload | undefined {
  const dataUrl = parseDataUrl(value);
  if (dataUrl) return { type: "base64", value: dataUrl.base64, mimeType: dataUrl.mimeType, sourcePath };
  if (!preferBase64 && looksLikeImageUrl(value)) return { type: "url", value: value.trim(), sourcePath };
  if (looksLikeBase64Image(value)) return { type: "base64", value: value.trim().replace(/\s+/g, ""), sourcePath };
  if (looksLikeImageUrl(value)) return { type: "url", value: value.trim(), sourcePath };
  return undefined;
}

function directCandidate(record: Record<string, unknown>, path: string): ExtractedImagePayload | undefined {
  for (const key of base64Keys) {
    const value = record[key];
    if (typeof value === "string") {
      const extracted = fromString(value, `${path}.${key}`, true);
      if (extracted) return extracted;
    }
  }

  for (const key of urlKeys) {
    const value = record[key];
    if (typeof value === "string") {
      const extracted = fromString(value, `${path}.${key}`, false);
      if (extracted) return extracted;
    }
    if (isRecord(value)) {
      const nested = directCandidate(value, `${path}.${key}`);
      if (nested) return nested;
    }
  }

  return undefined;
}

export function extractImagePayload(json: unknown): ExtractedImagePayload | undefined {
  const seen = new Set<unknown>();

  function walk(value: unknown, path: string, depth: number): ExtractedImagePayload | undefined {
    if (depth > 8 || value == null) return undefined;
    if (typeof value === "string") return fromString(value, path, false);
    if (typeof value !== "object" || seen.has(value)) return undefined;
    seen.add(value);

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const extracted = walk(value[index], `${path}[${index}]`, depth + 1);
        if (extracted) return extracted;
      }
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const direct = directCandidate(record, path);
    if (direct) return direct;

    for (const key of ["data", "result", "results", "output", "outputs", "response", "images", "choices"]) {
      if (key in record) {
        const extracted = walk(record[key], `${path}.${key}`, depth + 1);
        if (extracted) return extracted;
      }
    }

    for (const [key, child] of Object.entries(record)) {
      const extracted = walk(child, `${path}.${key}`, depth + 1);
      if (extracted) return extracted;
    }
    return undefined;
  }

  return walk(json, "$", 0);
}

export function summarizeImageResponseShape(value: unknown) {
  const redact = (input: unknown, depth: number): unknown => {
    if (depth > 4) return "[depth]";
    if (typeof input === "string") {
      if (input.length > 120) return `${input.slice(0, 60)}...[${input.length} chars]`;
      return input;
    }
    if (Array.isArray(input)) return input.slice(0, 3).map((item) => redact(item, depth + 1));
    if (!isRecord(input)) return input;
    const entries = Object.entries(input).slice(0, 12).map(([key, child]) => [key, redact(child, depth + 1)]);
    return Object.fromEntries(entries);
  };

  try {
    return JSON.stringify(redact(value, 0));
  } catch {
    return String(value);
  }
}
