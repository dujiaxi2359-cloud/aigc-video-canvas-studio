import assert from "node:assert/strict";
import { extractImagePayload } from "../utils/imageResponseExtractor.js";

assert.deepEqual(extractImagePayload({ data: [{ url: "https://cdn.example.com/a.png" }] }), { type: "url", value: "https://cdn.example.com/a.png", sourcePath: "$.data[0].url" });
assert.deepEqual(extractImagePayload({ result_url: "https://cdn.example.com/b.png" }), { type: "url", value: "https://cdn.example.com/b.png", sourcePath: "$.result_url" });
assert.deepEqual(extractImagePayload({ output_url: "https://cdn.example.com/c.png" }), { type: "url", value: "https://cdn.example.com/c.png", sourcePath: "$.output_url" });
const base64 = "a".repeat(240);
assert.equal(extractImagePayload({ data: [{ b64_json: base64 }] })?.type, "base64");
assert.equal(extractImagePayload({ images: [{ url: "https://cdn.example.com/d.png" }] })?.value, "https://cdn.example.com/d.png");

console.log("Image result finalizer tests passed");
