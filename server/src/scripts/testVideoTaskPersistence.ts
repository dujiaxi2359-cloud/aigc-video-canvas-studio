import assert from "node:assert/strict";
import {
  finalizeVideoTaskResult,
  type VideoTaskFinalizerDependencies
} from "../services/videoTaskFinalizer.service.js";

type SavedTask = Parameters<VideoTaskFinalizerDependencies["saveTask"]>[0];

const videoUrl = "https://media.example.com/output/video.mp4";
const providerContext = {
  providerId: "relay",
  providerType: "openai_compatible",
  providerName: "Relay",
  modelId: "model_omni_fast",
  upstreamModelId: "omni-fast",
  baseUrl: "https://relay.example.com",
  endpointProfile: "omni_fast",
  createEndpoint: "/v1/videos",
  pollEndpoint: "/v1/videos/{taskId}",
  pollMethod: "GET",
  authMode: "bearer",
  credentialId: "model_omni_fast",
  taskId: "task_provider_123",
  apiKey: "sk-should-not-persist",
  nested: {
    authorization: "Bearer sk-nested-should-not-persist"
  }
};

let savedTask: SavedTask | undefined;
const result = await finalizeVideoTaskResult({
  taskId: "task_local_123",
  providerTaskId: "task_provider_123",
  canvasNodeId: "node_video_123",
  projectId: "project_123",
  userId: "user_123",
  provider: "relay",
  model: "model_omni_fast",
  providerContext,
  videoUrl,
  rawResponse: {
    id: "task_provider_123",
    status: "completed",
    video_url: videoUrl
  },
  source: "poll",
  fileName: "aigc_video_node_video_123.mp4",
  payloadSummary: {
    providerTaskId: "task_provider_123",
    video_url: videoUrl,
    result_url: "https://media.example.com/result.mp4"
  }
}, {
  saveTask: async (input) => {
    savedTask = input;
  },
  updateCanvas: async () => true
});

assert.equal(result.status, "success");
assert.equal(savedTask?.providerTaskId, "task_provider_123");
assert.equal(savedTask?.canvasNodeId, "node_video_123");
assert.equal(savedTask?.projectId, "project_123");
assert.equal(savedTask?.modelId, "model_omni_fast");
assert.equal(savedTask?.providerVideoUrl, videoUrl);
assert.equal(savedTask?.outputUrl, videoUrl);
assert.equal(savedTask?.previewUrl, videoUrl);
assert.equal(savedTask?.status, "success");
assert.equal(savedTask?.progress, 100);
assert.equal(savedTask?.errorMessage, null);
assert.ok(savedTask?.providerContext);
assert.ok(savedTask?.result);

const persistedContext = JSON.stringify(savedTask?.providerContext);
assert.ok(persistedContext.includes("task_provider_123"));
assert.ok(persistedContext.includes("https://relay.example.com"));
assert.ok(persistedContext.includes("model_omni_fast"));
assert.ok(!persistedContext.includes("sk-should-not-persist"));
assert.ok(!persistedContext.includes("sk-nested-should-not-persist"));
assert.ok(persistedContext.includes("[redacted]"));

const persistedResult = JSON.stringify(savedTask?.result);
assert.ok(persistedResult.includes("providerTaskId"));
assert.ok(persistedResult.includes("providerVideoUrl"));
assert.ok(persistedResult.includes("finalizerSource"));

console.log("Video task persistence tests passed");
