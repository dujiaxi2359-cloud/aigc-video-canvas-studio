import assert from "node:assert/strict";
import {
  grsaiAspectValue,
  grsaiGenerateEndpoint,
  grsaiResultEndpoint,
  isGrsaiImageEndpoint,
  normalizeGrsaiImageBaseUrl
} from "../services/providers/grsaiImageProtocol.js";

assert.equal(isGrsaiImageEndpoint("https://grsaiapi.com/v1"), true);
assert.equal(isGrsaiImageEndpoint("https://grsai.dakka.com.cn/v1/api/generate"), true);
assert.equal(isGrsaiImageEndpoint("https://api.openai.com/v1"), false);

assert.equal(normalizeGrsaiImageBaseUrl("https://grsaiapi.com/v1"), "https://grsaiapi.com");
assert.equal(normalizeGrsaiImageBaseUrl("https://grsaiapi.com/v1/api/generate"), "https://grsaiapi.com");
assert.equal(grsaiGenerateEndpoint("https://grsaiapi.com/v1"), "https://grsaiapi.com/v1/api/generate");
assert.equal(grsaiResultEndpoint("https://grsaiapi.com/v1", "task_1"), "https://grsaiapi.com/v1/api/result?id=task_1");

assert.equal(grsaiAspectValue("gpt-image-2", "9:16", "1K"), "9:16");
assert.equal(grsaiAspectValue("gpt-image-2-vip", "9:16", "4K"), "2160x3840");
assert.equal(grsaiAspectValue("gpt-image-2-vip", "16:9", "2K"), "2048x1152");
assert.equal(grsaiAspectValue("nano-banana-2", "21:9", "4K"), "21:9");

console.log("test:grsai-image-adapter ok");
