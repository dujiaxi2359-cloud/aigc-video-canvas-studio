import {
  midjourneyCreateEndpointCandidates,
  isMidjourneyImageModel,
  midjourneyCreateEndpoint,
  midjourneyPollEndpoints,
  midjourneyResultUrl,
  midjourneyTaskId,
  midjourneyTaskStatus
} from "../services/providers/midjourneyImage.service.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(isMidjourneyImageModel({ providerId: "openai", modelName: "midjourney" }), "model identity must route to Midjourney adapter");
assert(!isMidjourneyImageModel({ providerId: "openai", modelName: "gpt-image-2" }), "OpenAI images must stay on their current adapter");
assert(
  midjourneyCreateEndpoint("https://api.apimart.ai/v1", "text-to-image") === "https://api.apimart.ai/v1/midjourney/generations",
  "official base URL must normalize to Midjourney generation endpoint"
);
assert(
  midjourneyCreateEndpoint("https://relay.example.com/v1/midjourney/generations", "image-edit") === "https://relay.example.com/v1/midjourney/generations/edits",
  "full relay endpoint must support image editing without duplicated paths"
);
assert(
  midjourneyCreateEndpointCandidates("https://relay.example.com/v1/midjourney/generations/imagine", "text-to-image")[0] === "https://relay.example.com/v1/midjourney/generations/imagine",
  "explicit relay imagine endpoint must be tried first"
);
assert(
  midjourneyCreateEndpointCandidates("https://relay.example.com/v1", "text-to-image").includes("https://relay.example.com/v1/midjourney/generations/imagine"),
  "relay-compatible imagine endpoint must be available as a fallback"
);
assert(
  midjourneyCreateEndpointCandidates("https://relay.example.com/v1", "text-to-image").includes("https://relay.example.com/mj/submit/imagine"),
  "common Midjourney submit endpoint must be available as a fallback"
);
assert(
  midjourneyPollEndpoints("https://relay.example.com/v1", "task 1")[0] === "https://relay.example.com/v1/tasks/task%201",
  "poll endpoint must encode task id"
);

const submitted = { code: 200, data: [{ status: "submitted", task_id: "task_123" }] };
assert(midjourneyTaskId(submitted) === "task_123", "APIMart submit response task id must parse");
assert(midjourneyTaskStatus(submitted) === "submitted", "APIMart submit status must parse");

const completed = { data: { status: "completed", grid_image_url: "https://cdn.example.com/grid.png", image_urls: ["https://cdn.example.com/1.png"] } };
assert(midjourneyTaskStatus(completed) === "completed", "nested query status must parse");
assert(midjourneyResultUrl(completed) === "https://cdn.example.com/grid.png", "grid image must be preferred over quadrant images");

console.log("test:midjourney-image-adapter ok");
