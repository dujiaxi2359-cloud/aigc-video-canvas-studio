import { strict as assert } from "node:assert";
import { probeOpenAiCompatibleModels } from "../services/modelConfig.service.js";

const originalFetch = globalThis.fetch;

function jsonResponse(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

try {
  globalThis.fetch = (async () => jsonResponse({ error: { message: "group has no model-list permission" } }, 403)) as typeof fetch;

  const relayVideo = await probeOpenAiCompatibleModels({
    apiBaseUrl: "https://ai.ctaigw.cn/v1",
    apiKey: "sk-test",
    validationPath: "/models",
    category: "video"
  });
  assert.equal(relayVideo.success, true);
  assert.match(relayVideo.message, /视频线路格式有效/);
  assert.match(relayVideo.message, /手动添加上游模型 ID/);

  const relayImage = await probeOpenAiCompatibleModels({
    apiBaseUrl: "https://ai.cy88.ai/v1",
    apiKey: "sk-test",
    validationPath: "/models",
    category: "image"
  });
  assert.equal(relayImage.success, true);
  assert.match(relayImage.message, /图片线路格式有效/);

  const officialVideo = await probeOpenAiCompatibleModels({
    apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    apiKey: "sk-test",
    validationPath: "/models",
    category: "video"
  });
  assert.equal(officialVideo.success, false);
  assert.match(officialVideo.message, /HTTP 403/);
  assert.match(officialVideo.message, /group has no model-list permission/);
  assert(!officialVideo.message.includes("[object Object]"), "Nested provider errors must be readable");

  globalThis.fetch = (async () => jsonResponse({ message: "method not allowed" }, 405)) as typeof fetch;
  const relayVideo405 = await probeOpenAiCompatibleModels({
    apiBaseUrl: "https://relay.example/v1",
    apiKey: "sk-test",
    validationPath: "/models",
    category: "video"
  });
  assert.equal(relayVideo405.success, true);
  assert.match(relayVideo405.message, /HTTP 405/);

  console.log("[test:model-config-probe] ok");
} finally {
  globalThis.fetch = originalFetch;
}
