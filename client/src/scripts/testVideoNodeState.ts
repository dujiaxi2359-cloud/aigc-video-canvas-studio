import assert from "node:assert/strict";
import {
  deriveVideoNodeState,
  syncVideoNodeTask,
  videoNodePatchFromSyncResult
} from "../utils/videoNodeState.js";

const processing = deriveVideoNodeState({
  status: "generating",
  generationStatus: "processing",
  providerStatus: "queued",
  providerTaskId: "task_provider"
});
assert.equal(processing.phase, "processing");
assert.equal(processing.statusLabel, "上游处理中");
assert.equal(processing.frameStatus, "generating");
assert.equal(processing.canSync, true);
assert.equal(processing.canGenerate, false);

const queryBlocked = deriveVideoNodeState({
  status: "error",
  providerTaskId: "task_provider",
  errorCode: "PROVIDER_TASK_QUERY_FORBIDDEN"
});
assert.equal(queryBlocked.phase, "query_blocked");
assert.equal(queryBlocked.frameStatus, "generating");
assert.equal(queryBlocked.canSync, true);

const success = deriveVideoNodeState({
  status: "success",
  videoUrl: "https://cdn.example.com/video.mp4"
});
assert.equal(success.phase, "success");
assert.equal(success.canPlay, true);
assert.equal(success.canDownload, true);

const filenameOnly = deriveVideoNodeState({
  status: "success",
  fileName: "aigc_video_xxx.mp4",
  outputUrl: "aigc_video_xxx.mp4"
});
assert.equal(filenameOnly.canPlay, false);
assert.equal(filenameOnly.canDownload, false);

const pendingPatch = videoNodePatchFromSyncResult({
  status: "generating",
  providerTaskId: "task_provider"
}, {
  status: "processing",
  providerStatus: "processing",
  providerTaskId: "task_provider"
});
assert.equal(pendingPatch.status, "generating");
assert.equal(pendingPatch.providerTaskId, "task_provider");

let syncCalls = 0;
const synced = await syncVideoNodeTask({
  localTaskId: "task_local",
  providerTaskId: "task_provider",
  canvasNodeId: "node_video",
  current: {
    status: "generating",
    providerTaskId: "task_provider"
  }
}, async (input) => {
  syncCalls += 1;
  assert.equal(input.localTaskId, "task_local");
  assert.equal(input.providerTaskId, "task_provider");
  return {
    status: "success",
    providerTaskId: "task_provider",
    videoUrl: "https://cdn.example.com/synced.mp4"
  };
});
assert.equal(syncCalls, 1);
assert.equal(synced.patch.status, "success");
assert.equal(synced.patch.providerTaskId, "task_provider");
assert.equal(synced.patch.videoUrl, "https://cdn.example.com/synced.mp4");

console.log("Video node state tests passed");
