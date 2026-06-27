import assert from "node:assert/strict";
import { buildVideoTaskContext, redactProviderSecrets } from "../services/videoTaskContext.service.js";
import type { VideoRequestConfig } from "../services/providers/videoRequestAdapter.js";
import { isProviderAuthFailure, ProviderError } from "../utils/providerErrors.js";

function requestConfig(channel: VideoRequestConfig["channel"]): VideoRequestConfig {
  return {
    provider: "custom",
    channel,
    apiFamily: "openai_videos",
    baseUrl: "https://relay.example.com",
    createEndpoint: "/v1/videos",
    endpoint: "/v1/videos",
    finalUrl: "https://relay.example.com/v1/videos",
    authType: "bearer",
    requestFormat: "json",
    taskMode: "async",
    pollEndpoint: "/v1/videos/{taskId}",
    idField: "id",
    taskIdField: "task_id",
    statusField: "status",
    resultField: "result",
    supportedInputs: ["text"],
    imageTransport: "unsupported",
    videoTransport: "unsupported",
    supportedAspectRatios: ["16:9"],
    supportedDurations: [10],
    supportedResolutions: ["720p"]
  };
}

for (const channel of ["proxy", "official"] as const) {
  const context = buildVideoTaskContext({
    providerId: channel === "official" ? "official-provider" : "relay-provider",
    providerName: channel,
    modelId: `model-${channel}`,
    upstreamModelId: "video-upstream",
    credentialId: `credential-${channel}`,
    requestConfig: requestConfig(channel),
    createResponse: {
      task_id: `task-${channel}`,
      poll_url: `/v1/videos/task-${channel}`,
      apiKey: "secret-key",
      nested: { authorization: "Bearer secret" }
    }
  });
  assert.ok(context);
  assert.equal(context.taskId, `task-${channel}`);
  assert.equal(context.baseUrl, "https://relay.example.com");
  assert.equal(context.pollEndpoint, "/v1/videos/{taskId}");
  assert.equal(context.credentialId, `credential-${channel}`);
  assert.equal(context.providerType, channel === "official" ? "official" : "openai_compatible");
  const serialized = JSON.stringify(context);
  assert.equal(serialized.includes("secret-key"), false);
  assert.equal(serialized.includes("Bearer secret"), false);
}

const redacted = redactProviderSecrets({
  token: "secret",
  data: [{ api_key: "secret-2", value: "safe" }]
});
assert.deepEqual(redacted, {
  token: "[redacted]",
  data: [{ api_key: "[redacted]", value: "safe" }]
});
assert.equal(isProviderAuthFailure(new ProviderError("PROVIDER_ERROR", "HTTP 401 unauthorized")), true);
assert.equal(isProviderAuthFailure(new ProviderError("PROVIDER_ERROR", "HTTP 403 forbidden")), true);
assert.equal(isProviderAuthFailure(new ProviderError("PROVIDER_ERROR", "HTTP 500 upstream error")), false);

console.log("Video task context tests passed");
