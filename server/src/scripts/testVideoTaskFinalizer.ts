import assert from "node:assert/strict";
import { mergeCanvasNodeGenerationFailure } from "../services/generatedVideoPersistence.service.js";
import {
  finalizeVideoTaskResult,
  type VideoTaskFinalizerDependencies
} from "../services/videoTaskFinalizer.service.js";

type SavedTask = Parameters<VideoTaskFinalizerDependencies["saveTask"]>[0];
type SavedCanvas = Parameters<VideoTaskFinalizerDependencies["updateCanvas"]>[0];

async function finalize(videoUrl: string) {
  let savedTask: SavedTask | undefined;
  let savedCanvas: SavedCanvas | undefined;
  const result = await finalizeVideoTaskResult({
    taskId: "task_local",
    providerTaskId: "task_provider",
    canvasNodeId: "node_video",
    projectId: "project_video",
    userId: "user_video",
    provider: "relay",
    model: "video-model",
    videoUrl,
    rawResponse: { status: "completed", video_url: videoUrl },
    source: "generate",
    fileName: "aigc_video_node.mp4"
  }, {
    saveTask: async (input) => {
      savedTask = input;
    },
    updateCanvas: async (input) => {
      savedCanvas = input;
      return true;
    }
  });
  return { result, savedTask, savedCanvas };
}

for (const videoUrl of [
  "http://media.example.com/video.mp4",
  "https://media.example.com/video.mp4",
  "data:video/mp4;base64,AAAA"
]) {
  const finalized = await finalize(videoUrl);
  assert.equal(finalized.result.status, "success");
  assert.equal(finalized.result.videoUrl, videoUrl);
  assert.equal(finalized.result.outputUrl, videoUrl);
  assert.equal(finalized.result.previewUrl, videoUrl);
  assert.equal(finalized.result.downloadUrl, videoUrl);
  assert.equal(finalized.result.providerVideoUrl, videoUrl);
  assert.equal(finalized.savedTask?.providerVideoUrl, videoUrl);
  assert.equal(finalized.savedTask?.outputUrl, videoUrl);
  assert.equal(finalized.savedTask?.previewUrl, videoUrl);
  assert.equal(finalized.savedTask?.errorMessage, null);
  assert.equal(finalized.savedCanvas?.realUrl, videoUrl);
}

const invalid = await finalize("aigc_video_xxx.mp4");
assert.equal(invalid.result.status, "error");
assert.equal(invalid.result.errorCode, "VIDEO_URL_NOT_MEDIA");
assert.equal(invalid.savedTask, undefined);
assert.equal(invalid.savedCanvas, undefined);

const successfulNode = {
  status: "completed",
  generationStatus: "success",
  loading: false,
  providerTaskId: "task_provider",
  videoUrl: "https://media.example.com/video.mp4",
  outputUrl: "https://media.example.com/video.mp4",
  previewUrl: "https://media.example.com/video.mp4",
  providerVideoUrl: "https://media.example.com/video.mp4"
};
const afterStorageFailure = mergeCanvasNodeGenerationFailure(successfulNode, {
  errorMessage: "COS transfer failed",
  errorCode: "COS_TRANSFER_FAILED_BUT_VIDEO_OK",
  diagnosticOnly: true
});
assert.equal(afterStorageFailure.status, "completed");
assert.equal(afterStorageFailure.generationStatus, "success");
assert.equal(afterStorageFailure.providerTaskId, "task_provider");
assert.equal(afterStorageFailure.videoUrl, successfulNode.videoUrl);
assert.equal(afterStorageFailure.outputUrl, successfulNode.outputUrl);
assert.equal(afterStorageFailure.previewUrl, successfulNode.previewUrl);
assert.equal(afterStorageFailure.providerVideoUrl, successfulNode.providerVideoUrl);
assert.equal(afterStorageFailure.diagnosticErrorCode, "COS_TRANSFER_FAILED_BUT_VIDEO_OK");

console.log("Video task finalizer tests passed");
