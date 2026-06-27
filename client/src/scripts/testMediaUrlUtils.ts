import assert from "node:assert/strict";
import {
  isRealMediaUrl,
  mediaDownloadUrl,
  videoPlayableUrl
} from "../utils/mediaUrls.js";

assert.equal(isRealMediaUrl("https://cdn.example.com/video.mp4"), true);
assert.equal(isRealMediaUrl("http://cdn.example.com/video.mp4"), true);
assert.equal(isRealMediaUrl("blob:https://moon.example/video"), true);
assert.equal(isRealMediaUrl("data:video/mp4;base64,AAAA"), true);
assert.equal(isRealMediaUrl("aigc_video_xxx.mp4"), false);

assert.equal(mediaDownloadUrl({
  downloadUrl: "aigc_video_xxx.mp4",
  outputUrl: "https://cdn.example.com/output.mp4"
}), "https://cdn.example.com/output.mp4");
assert.equal(mediaDownloadUrl({
  outputUrl: "aigc_video_xxx.mp4",
  videoUrl: "https://cdn.example.com/video.mp4"
}), "https://cdn.example.com/video.mp4");
assert.equal(mediaDownloadUrl({
  videoUrl: "aigc_video_xxx.mp4",
  providerVideoUrl: "https://provider.example.com/video"
}), "https://provider.example.com/video");
assert.equal(mediaDownloadUrl({ url: "aigc_video_xxx.mp4" }), "");
assert.equal(videoPlayableUrl({ outputUrl: "aigc_video_xxx.mp4", previewUrl: "blob:https://moon.example/video" }), "blob:https://moon.example/video");

console.log("Media URL utility tests passed");
