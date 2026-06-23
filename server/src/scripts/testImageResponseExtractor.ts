import assert from "node:assert/strict";
import { openAIImageTaskId, openAIImageTaskStatus } from "../services/providers/openaiImage.service.js";
import { aspectRatioToAlibabaSize, aspectRatioToGoogleSize, aspectRatioToOpenAIImageSize, normalizeImageAspectRatio } from "../utils/imageAspectRatio.js";
import { extractImagePayload, summarizeImageResponseShape } from "../utils/imageResponseExtractor.js";

const base64 = Buffer.alloc(256, 7).toString("base64");

const standard = extractImagePayload({ data: [{ b64_json: base64 }] });
assert(standard?.type === "base64", "standard OpenAI b64_json should be extracted");
assert(standard.sourcePath === "$.data[0].b64_json", "standard source path should be reported");

const relayUrl = extractImagePayload({ data: [{ image_url: "https://cdn.example.com/image.png" }] });
assert(relayUrl?.type === "url", "relay image_url should be extracted");
assert(relayUrl.value === "https://cdn.example.com/image.png", "relay URL should be preserved");

const nested = extractImagePayload({ output: { images: [{ url: "https://cdn.example.com/nested.webp" }] } });
assert(nested?.type === "url", "nested output images URL should be extracted");
assert(nested.sourcePath === "$.output.images[0].url", "nested source path should be reported");

const dataUrl = extractImagePayload({ result: { image: `data:image/png;base64,${base64}` } });
assert(dataUrl?.type === "base64", "data URL image should be extracted as base64");
assert(dataUrl.mimeType === "image/png", "data URL mime type should be preserved");

const empty = extractImagePayload({ id: "task_123", status: "processing" });
assert(empty === undefined, "async task response without image should not be treated as an image");
assert(openAIImageTaskId({ id: "task_123", status: "processing" }) === "task_123", "async OpenAI image task id should be preserved");
assert(openAIImageTaskStatus({ id: "task_123", status: "processing" }) === "processing", "async OpenAI image task status should be preserved");

const summary = summarizeImageResponseShape({ data: [{ b64_json: base64.repeat(30) }] });
assert(summary.includes("chars"), "large strings should be summarized");

assert(normalizeImageAspectRatio("auto") === undefined, "auto image ratio should not normalize to 1:1");
assert(aspectRatioToOpenAIImageSize("auto", "gpt-image-2", "2K") === undefined, "auto OpenAI image ratio should not send a fixed tier size");
assert(aspectRatioToAlibabaSize("auto") === undefined, "auto Alibaba image ratio should not send a fixed size");
assert(aspectRatioToGoogleSize("auto") === undefined, "auto Google image ratio should not send imageConfig dimensions");

console.log("Image response extractor tests passed");
