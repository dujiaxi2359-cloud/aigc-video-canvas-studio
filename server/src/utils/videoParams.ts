export function normalizeVideoAspectRatio(aspectRatio?: string) {
  if (aspectRatio === "9:16" || aspectRatio === "16:9" || aspectRatio === "1:1") return aspectRatio;
  return "16:9";
}

export function normalizeVideoResolution(resolution?: string) {
  if (/1080/i.test(resolution ?? "")) return "1080P";
  if (/4k/i.test(resolution ?? "")) return "4K";
  if (/480/i.test(resolution ?? "")) return "480P";
  return "720P";
}

export function mapVideoSize(aspectRatio?: string, resolution?: string) {
  const normalizedRatio = normalizeVideoAspectRatio(aspectRatio);
  const normalizedResolution = normalizeVideoResolution(resolution);
  const is1080 = normalizedResolution === "1080P";
  const is480 = normalizedResolution === "480P";
  const long = is1080 ? 1920 : is480 ? 854 : 1280;
  const short = is1080 ? 1080 : is480 ? 480 : 720;
  if (normalizedRatio === "9:16") return `${short}*${long}`;
  if (normalizedRatio === "1:1") return `${short}*${short}`;
  return `${long}*${short}`;
}

export function mapVideoParams(providerId: string | undefined, modelName: string, inputMode: string, aspectRatio?: string, resolution?: string, duration?: number) {
  const ratio = normalizeVideoAspectRatio(aspectRatio);
  const normalizedResolution = normalizeVideoResolution(resolution);
  const size = mapVideoSize(ratio, normalizedResolution);

  if (providerId === "alibaba") {
    return {
      ratio,
      resolution: normalizedResolution,
      size,
      duration,
      useWan27Media: /wan2\.7/i.test(modelName),
      inputMode
    };
  }

  if (providerId === "google") {
    return {
      aspectRatio: ratio === "1:1" ? "16:9" : ratio,
      resolution,
      durationSeconds: duration,
      inputMode
    };
  }

  return { ratio, resolution: normalizedResolution, size, duration, inputMode };
}
