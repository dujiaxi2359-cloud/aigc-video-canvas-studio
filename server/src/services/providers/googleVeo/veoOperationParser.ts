type UnknownRecord = Record<string, unknown>;

export type ParsedVeoVideo = {
  videoObject?: unknown;
  videoUri?: string;
  videoBytes?: string;
  fileName?: string;
  mimeType?: string;
  sourceShape?: string;
};

export type VeoOperationParseResult = ParsedVeoVideo & {
  raiMediaFilteredCount?: number;
  raiMediaFilteredReasons?: string[];
  rawSummary: {
    responseKeys: string[];
    generatedVideosCount: number;
    generatedVideosShape?: string;
    predictionsCount?: number;
    videosCount?: number;
  };
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function firstArrayItem(value: unknown) {
  return Array.isArray(value) ? value[0] : undefined;
}

function stringField(record: UnknownRecord | undefined, keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function summarizeShape(value: unknown): string | undefined {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (isRecord(value)) return Object.keys(value).sort().join(",");
  if (value == null) return undefined;
  return typeof value;
}

function extractVideo(candidate: unknown, sourceShape: string): ParsedVeoVideo | undefined {
  const record = asRecord(candidate);
  if (!record) return undefined;

  const videoRecord = asRecord(record.video) ?? record;
  const videoUri = stringField(videoRecord, ["uri", "gcsUri", "gcs_uri", "fileUri", "file_uri", "downloadUri", "download_uri", "signedUri", "signed_uri", "name"]);
  const videoBytes = stringField(videoRecord, ["videoBytes", "video_bytes"]);
  const mimeType = stringField(videoRecord, ["mimeType", "mime_type"]) ?? "video/mp4";
  const fileName = stringField(videoRecord, ["displayName", "display_name", "name"]);

  if (videoUri || videoBytes) {
    return {
      videoObject: videoRecord,
      videoUri,
      videoBytes,
      fileName,
      mimeType,
      sourceShape
    };
  }

  return undefined;
}

function looksLikeVideoRecord(record: UnknownRecord) {
  const mimeType = stringField(record, ["mimeType", "mime_type", "contentType", "content_type"]);
  if (mimeType?.startsWith("video/")) return true;
  if (stringField(record, ["videoBytes", "video_bytes"])) return true;
  const uri = stringField(record, ["uri", "gcsUri", "gcs_uri", "fileUri", "file_uri", "downloadUri", "download_uri", "signedUri", "signed_uri"]);
  return Boolean(uri && (/^gs:\/\//.test(uri) || /^https?:\/\//.test(uri) || /^files\//.test(uri) || /\.(mp4|mov|webm)(\?|$)/i.test(uri)));
}

function findNestedVideo(candidate: unknown, sourceShape: string, depth = 0, seen = new WeakSet<object>()): ParsedVeoVideo | undefined {
  if (depth > 8) return undefined;
  if (Array.isArray(candidate)) {
    for (let index = 0; index < candidate.length; index += 1) {
      const parsed = findNestedVideo(candidate[index], `${sourceShape}[${index}]`, depth + 1, seen);
      if (parsed) return parsed;
    }
    return undefined;
  }
  const record = asRecord(candidate);
  if (!record) return undefined;
  if (seen.has(record)) return undefined;
  seen.add(record);

  const direct = extractVideo(record, sourceShape);
  if (direct && looksLikeVideoRecord(asRecord(direct.videoObject) ?? record)) return direct;

  for (const [key, value] of Object.entries(record)) {
    const parsed = findNestedVideo(value, `${sourceShape}.${key}`, depth + 1, seen);
    if (parsed) return parsed;
  }
  return undefined;
}

function generatedVideosFrom(response: UnknownRecord) {
  return response.generatedVideos ?? response.generated_videos;
}

function numberField(record: UnknownRecord | undefined, keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function stringArrayField(record: UnknownRecord | undefined, keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  }
  return undefined;
}

export function parseVeoOperationResult(operation: unknown): VeoOperationParseResult {
  const op = asRecord(operation) ?? {};
  const response = asRecord(op.response) ?? asRecord(operation) ?? {};
  const generatedVideos = generatedVideosFrom(response);
  const generateVideoResponse = asRecord(response.generateVideoResponse ?? response.generate_video_response);
  const generatedSamples = generateVideoResponse?.generatedSamples ?? generateVideoResponse?.generated_samples;
  const predictions = response.predictions;
  const videos = response.videos;

  const candidates: Array<{ value: unknown; shape: string }> = [
    { value: firstArrayItem(generatedVideos), shape: "response.generatedVideos[0]" },
    { value: firstArrayItem(generatedSamples), shape: "response.generateVideoResponse.generatedSamples[0]" },
    { value: firstArrayItem(predictions), shape: "response.predictions[0]" },
    { value: firstArrayItem(videos), shape: "response.videos[0]" },
    { value: generatedVideos, shape: "response.generatedVideos" },
    { value: generatedSamples, shape: "response.generateVideoResponse.generatedSamples" },
    { value: predictions, shape: "response.predictions" },
    { value: videos, shape: "response.videos" },
    { value: response.video, shape: "response.video" },
    { value: response, shape: "response" }
  ];

  let parsed: ParsedVeoVideo | undefined;
  for (const candidate of candidates) {
    parsed = extractVideo(candidate.value, candidate.shape);
    if (parsed) break;
  }
  if (!parsed) parsed = findNestedVideo(response, "response");

  const generatedVideosArray = Array.isArray(generatedVideos) ? generatedVideos : undefined;
  const predictionsArray = Array.isArray(predictions) ? predictions : undefined;
  const videosArray = Array.isArray(videos) ? videos : undefined;

  return {
    ...parsed,
    raiMediaFilteredCount: numberField(response, ["raiMediaFilteredCount", "rai_media_filtered_count"]),
    raiMediaFilteredReasons: stringArrayField(response, ["raiMediaFilteredReasons", "rai_media_filtered_reasons"]),
    rawSummary: {
      responseKeys: Object.keys(response),
      generatedVideosCount: generatedVideosArray?.length ?? 0,
      generatedVideosShape: summarizeShape(generatedVideosArray?.[0] ?? generatedVideos),
      predictionsCount: predictionsArray?.length,
      videosCount: videosArray?.length
    }
  };
}
