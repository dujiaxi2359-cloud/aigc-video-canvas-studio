import assert from "node:assert/strict";
import { normalizeVideoCapabilities } from "../services/videoCapabilityNormalization.js";
import type { ModelCapabilities } from "../types/model.js";

const missingMatrix: ModelCapabilities = { inputModes: [] };
const omni = normalizeVideoCapabilities({ inputModes: [], modelCapability: { model: "omni-fast" } }, "relay", "omni-fast");
assert.deepEqual(omni.supportedDurations, [10]);
assert.ok(omni.supportedAspectRatios?.includes("16:9"));
assert.ok(omni.supportedResolutions?.includes("720p"));
assert.deepEqual(missingMatrix.inputModes, []);

console.log("Model capability matrix tests passed");
