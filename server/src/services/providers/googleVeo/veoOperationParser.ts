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
  const videoUri = stringField(videoRecord, ["uri", "gcsUri", "gcs_uri", "fileUri", "file_uri", "name"]);
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

function generatedVideosFrom(response: UnknownRecord) {
  return response.generatedVideos ?? response.generated_videos;
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

  const generatedVideosArray = Array.isArray(generatedVideos) ? generatedVideos : undefined;
  const predictionsArray = Array.isArray(predictions) ? predictions : undefined;
  const videosArray = Array.isArray(videos) ? videos : undefined;

  return {
    ...parsed,
    rawSummary: {
      responseKeys: Object.keys(response),
      generatedVideosCount: generatedVideosArray?.length ?? 0,
      generatedVideosShape: summarizeShape(generatedVideosArray?.[0] ?? generatedVideos),
      predictionsCount: predictionsArray?.length,
      videosCount: videosArray?.length
    }
  };
}
