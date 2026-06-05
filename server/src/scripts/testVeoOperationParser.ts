import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseVeoOperationResult } from "../services/providers/googleVeo/veoOperationParser.js";
import { saveGeneratedBuffer } from "../utils/downloadGeneratedFile.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const camel = parseVeoOperationResult({
  done: true,
  response: { generatedVideos: [{ video: { uri: "files/video-1", mimeType: "video/mp4" } }] }
});
assert(camel.videoUri === "files/video-1", "camelCase generatedVideos should parse video uri");
assert(camel.sourceShape === "response.generatedVideos[0]", "camelCase source shape mismatch");

const snake = parseVeoOperationResult({
  done: true,
  response: { generated_videos: [{ video: { uri: "files/video-2" } }] }
});
assert(snake.videoUri === "files/video-2", "snake_case generated_videos should parse video uri");

const rest = parseVeoOperationResult({
  done: true,
  response: { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://example.test/video.mp4" } }] } }
});
assert(rest.videoUri === "https://example.test/video.mp4", "REST generatedSamples video uri should parse");

const nested = parseVeoOperationResult({
  done: true,
  response: { predictions: [{ video: { videoBytes: Buffer.from("video").toString("base64"), mimeType: "video/mp4" } }] }
});
assert(Boolean(nested.videoBytes), "prediction videoBytes should parse");

const deeplyNested = parseVeoOperationResult({
  done: true,
  name: "operations/not-a-video",
  response: {
    metadata: {
      candidates: [
        {
          result: {
            media: {
              file: {
                downloadUri: "https://example.test/generated/video.mp4",
                mimeType: "video/mp4"
              }
            }
          }
        }
      ]
    }
  }
});
assert(deeplyNested.videoUri === "https://example.test/generated/video.mp4", "deep nested video downloadUri should parse");

const empty = parseVeoOperationResult({ done: true, response: { foo: "bar" } });
assert(!empty.videoUri && !empty.videoBytes, "empty response should not parse a video");
assert(empty.rawSummary.responseKeys.includes("foo"), "raw summary should keep response keys");

const filtered = parseVeoOperationResult({
  done: true,
  response: {
    raiMediaFilteredCount: 1,
    raiMediaFilteredReasons: ["Your prompt conflicted with our safety policies."]
  }
});
assert(filtered.raiMediaFilteredCount === 1, "RAI filtered count should parse");
assert(filtered.raiMediaFilteredReasons?.[0]?.includes("safety policies"), "RAI filtered reasons should parse");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veo-parser-"));
process.env.UPLOAD_DIR = tmp;
const saved = await saveGeneratedBuffer({
  buffer: Buffer.from("fake-video"),
  prefix: "video_google_veo_test",
  extension: ".mp4",
  contentType: "video/mp4"
});
assert(fs.existsSync(saved.localPath), "saved test video should exist");
assert(fs.statSync(saved.localPath).size > 0, "saved test video should be non-empty");

console.log("test:veo-operation-parser ok");
