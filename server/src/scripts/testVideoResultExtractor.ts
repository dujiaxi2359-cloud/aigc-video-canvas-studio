import assert from "node:assert/strict";
import { extractProviderStatus, extractProviderTaskId, extractProviderVideoUrl, isProviderSuccessStatus, sanitizeUrlForLog } from "../utils/videoResultExtractor.js";

const videoUrl = "https://cdn.example.com/result.mp4?token=secret";

const cases: Array<[string, unknown]> = [
  ["url", { url: videoUrl }],
  ["video_url", { video_url: videoUrl }],
  ["videoUrl", { videoUrl: videoUrl }],
  ["output_url", { output_url: videoUrl }],
  ["outputUrl", { outputUrl: videoUrl }],
  ["preview_url", { preview_url: videoUrl }],
  ["previewUrl", { previewUrl: videoUrl }],
  ["download_url", { download_url: videoUrl }],
  ["downloadUrl", { downloadUrl: videoUrl }],
  ["data.url", { data: { url: videoUrl } }],
  ["data.video_url", { data: { video_url: videoUrl } }],
  ["data.videoUrl", { data: { videoUrl: videoUrl } }],
  ["data.output_url", { data: { output_url: videoUrl } }],
  ["data.outputUrl", { data: { outputUrl: videoUrl } }],
  ["data.preview_url", { data: { preview_url: videoUrl } }],
  ["data.download_url", { data: { download_url: videoUrl } }],
  ["result.url", { result: { url: videoUrl } }],
  ["result.video_url", { result: { video_url: videoUrl } }],
  ["result.videoUrl", { result: { videoUrl: videoUrl } }],
  ["result.output_url", { result: { output_url: videoUrl } }],
  ["result.outputUrl", { result: { outputUrl: videoUrl } }],
  ["result.preview_url", { result: { preview_url: videoUrl } }],
  ["result.download_url", { result: { download_url: videoUrl } }],
  ["video.url", { video: { url: videoUrl } }],
  ["video.video_url", { video: { video_url: videoUrl } }],
  ["videos[0].url", { videos: [{ url: videoUrl }] }],
  ["videos[0].video_url", { videos: [{ video_url: videoUrl }] }],
  ["output[0].url", { output: [{ url: videoUrl }] }],
  ["outputs[0].url", { outputs: [{ url: videoUrl }] }],
  ["data[0].url", { data: [{ url: videoUrl }] }]
];

for (const [name, payload] of cases) {
  assert.equal(extractProviderVideoUrl(payload), videoUrl, `${name} should be parsed as provider video URL`);
}

assert.equal(extractProviderTaskId({ task_id: "task_123" }), "task_123");
assert.equal(extractProviderTaskId({ data: { id: "video_456" } }), "video_456");
assert.equal(extractProviderStatus({ result: { state: "completed" } }), "completed");
assert.equal(extractProviderStatus({ data: { task_status: "generated_success" } }), "generated_success");
assert.equal(isProviderSuccessStatus({ status: "succeeded" }), true);
assert.equal(isProviderSuccessStatus({ result: { taskStatus: "task_success" } }), true);
assert.equal(isProviderSuccessStatus({ data: { state: "failed" } }), false);
assert.equal(sanitizeUrlForLog(videoUrl), "https://cdn.example.com/result.mp4?***");

console.log("Video result extractor tests passed");
