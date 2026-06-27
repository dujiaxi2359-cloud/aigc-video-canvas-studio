import assert from "node:assert/strict";
import {
  materializeVideoPollUrl,
  pollVideoTaskFromSavedContext,
  type VideoPollResolverDependencies
} from "../services/videoPollResolver.service.js";
import type { VideoTaskContext } from "../services/videoTaskContext.service.js";

const context: VideoTaskContext = {
  providerId: "relay-provider",
  providerType: "openai_compatible",
  providerName: "Relay",
  modelId: "model-config",
  upstreamModelId: "omni-fast",
  baseUrl: "https://relay.example.com",
  endpointProfile: "openai_videos",
  createEndpoint: "https://relay.example.com/v1/videos",
  pollEndpoint: "/v1/videos/{taskId}",
  pollMethod: "GET",
  authMode: "bearer",
  credentialId: "model-config",
  taskId: "task-provider",
  taskIdPath: "id",
  videoUrlPaths: ["video_url", "data[0].url"],
  statusPaths: ["status"],
  createdAt: new Date().toISOString(),
  rawCreateResponse: { id: "task-provider", status: "queued" }
};

const task = {
  id: "task-local",
  userId: "user",
  providerTaskId: "task-provider",
  canvasNodeId: "node",
  projectId: "project",
  providerId: "relay-provider",
  modelId: "model-config",
  providerContext: context,
  status: "processing",
  providerStatus: "queued",
  providerVideoUrl: undefined,
  progress: 0,
  outputUrl: undefined,
  previewUrl: undefined,
  storageStatus: undefined,
  storageKey: undefined,
  storageError: undefined,
  rawPollResponse: undefined,
  result: { providerTaskContext: context },
  errorMessage: undefined,
  createdAt: Date.now(),
  updatedAt: Date.now()
};

assert.equal(
  materializeVideoPollUrl(context, "task-provider"),
  "https://relay.example.com/v1/videos/task-provider"
);

type SavedInput = Parameters<VideoPollResolverDependencies["saveTask"]>[0];
type FinalizeInput = Parameters<VideoPollResolverDependencies["finalize"]>[0];

async function run(payload: unknown, status = 200, source: "poll" | "sync" = "poll") {
  const saved: SavedInput[] = [];
  const finalized: FinalizeInput[] = [];
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const credentials: string[] = [];
  const processingUpdates: Array<{ providerTaskId?: string; progress?: number }> = [];
  const failureUpdates: Array<{ errorCode?: string }> = [];
  const dependencies: VideoPollResolverDependencies = {
    loadTask: async () => task,
    saveTask: async (input) => {
      saved.push(input);
    },
    loadCredential: async (credentialId) => {
      credentials.push(credentialId);
      return "customer-key";
    },
    request: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" }
      });
    },
    finalize: async (input) => {
      finalized.push(input);
      return {
        status: "success",
        progress: 100,
        providerTaskId: input.providerTaskId,
        videoUrl: input.videoUrl,
        outputUrl: input.videoUrl,
        previewUrl: input.videoUrl,
        downloadUrl: input.videoUrl,
        providerVideoUrl: input.videoUrl
      };
    },
    updateCanvasProcessing: async (input) => {
      processingUpdates.push(input);
      return true;
    },
    updateCanvasFailure: async (input) => {
      failureUpdates.push(input);
      return true;
    }
  };
  const result = await pollVideoTaskFromSavedContext("task-local", dependencies, source);
  return { result, saved, finalized, requests, credentials, processingUpdates, failureUpdates };
}

for (const status of ["queued", "processing"]) {
  const pending = await run({ status, progress: 42 });
  assert.equal(pending.result.status, "processing");
  assert.equal(pending.saved[0]?.status, "processing");
  assert.equal(pending.saved[0]?.providerTaskId, "task-provider");
  assert.equal(pending.saved[0]?.providerContext, context);
  assert.equal(pending.requests.length, 1);
  assert.equal(pending.requests[0]?.init?.method, "GET");
  assert.equal(pending.requests[0]?.init?.body, undefined);
  assert.equal((pending.requests[0]?.init?.headers as Record<string, string>).Authorization, "Bearer customer-key");
  assert.equal(pending.requests[0]?.url, "https://relay.example.com/v1/videos/task-provider");
  assert.deepEqual(pending.credentials, ["model-config"]);
  assert.equal(pending.processingUpdates[0]?.providerTaskId, "task-provider");
}

const completed = await run({ status: "completed", video_url: "https://cdn.example.com/video.mp4" });
assert.equal(completed.finalized.length, 1);
assert.equal(completed.finalized[0]?.videoUrl, "https://cdn.example.com/video.mp4");
assert.equal(completed.finalized[0]?.source, "poll");

const completedArray = await run({ status: "completed", data: [{ url: "https://cdn.example.com/array.mp4" }] }, 200, "sync");
assert.equal(completedArray.finalized[0]?.videoUrl, "https://cdn.example.com/array.mp4");
assert.equal(completedArray.finalized[0]?.source, "sync");
assert.equal(completedArray.requests.length, 1);

const empty = await run({ status: "completed" });
assert.equal(empty.result.errorCode, "PROVIDER_RESULT_EMPTY");
assert.equal(empty.saved[0]?.providerTaskId, "task-provider");

for (const status of [401, 403]) {
  const forbidden = await run({ message: "forbidden" }, status);
  assert.equal(forbidden.result.status, "processing");
  assert.equal(forbidden.result.errorCode, "PROVIDER_TASK_QUERY_FORBIDDEN");
  assert.equal(forbidden.saved[0]?.providerTaskId, "task-provider");
  assert.equal(forbidden.saved[0]?.providerContext, context);
}

const wrongRoute = await run({ message: "prompt is too short" }, 400);
assert.equal(wrongRoute.result.errorCode, "POLL_ROUTE_WRONG_CREATE_ENDPOINT");
assert.equal(wrongRoute.saved[0]?.status, "processing");

const missingTaskDependencies: VideoPollResolverDependencies = {
  loadTask: async () => ({ ...task, providerTaskId: undefined }),
  saveTask: async () => undefined,
  loadCredential: async () => "key",
  request: fetch,
  finalize: async () => ({ status: "error", errorCode: "VIDEO_URL_NOT_MEDIA" }),
  updateCanvasProcessing: async () => true,
  updateCanvasFailure: async () => true
};
const missingTask = await pollVideoTaskFromSavedContext("task-local", missingTaskDependencies);
assert.equal(missingTask.errorCode, "TASK_ID_MISSING");

console.log("Video poll resolver tests passed");
