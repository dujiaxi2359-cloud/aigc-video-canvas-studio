import assert from "node:assert/strict";
import { calculateAvailableVideoOptions } from "../services/modelCapability.service.js";
import { normalizeVideoCapabilities } from "../services/videoCapabilityNormalization.js";
import type { ModelCapabilities } from "../types/model.js";

const omniBase: ModelCapabilities = {
  inputModes: ["text-to-video"],
  modelCapability: { model: "omni-fast", supportsTextToVideo: true },
  supportedAspectRatios: ["16:9", "9:16"],
  supportedResolutions: ["720p"]
};
const normalized = normalizeVideoCapabilities(omniBase, "relay", "omni-fast");
assert.deepEqual(normalized.supportedDurations, [10]);
assert.deepEqual(normalized.duration, { type: "fixed", value: 10 });
const options = calculateAvailableVideoOptions(normalized, {
  inputMode: "text-to-video",
  selectedDuration: 8,
  selectedAspectRatio: "16:9",
  selectedResolution: "720p",
  hasImageInput: false,
  hasVideoInput: false,
  hasReferenceImage: false,
  hasFirstLastFrame: false
});
assert.deepEqual(options.availableDurations, [10]);
assert.equal(options.normalizedSelection.duration, 10);
assert.equal(options.lockedFields.duration, true);

const explicit = normalizeVideoCapabilities({ ...omniBase, supportedDurations: [8, 10, 12], duration: { type: "enum", values: [8, 10, 12] } }, "relay", "omni-fast");
assert.deepEqual(explicit.supportedDurations, [8, 10, 12]);
assert.deepEqual(explicit.duration, { type: "enum", values: [8, 10, 12] });

const staleGeneric = normalizeVideoCapabilities({
  ...omniBase,
  supportedDurations: Array.from({ length: 27 }, (_, index) => index + 4),
  duration: { type: "range", min: 4, max: 30, step: 1 }
}, "relay", "omni-fast");
assert.deepEqual(staleGeneric.supportedDurations, [10]);
assert.deepEqual(staleGeneric.duration, { type: "fixed", value: 10 });

console.log("Video model params tests passed");
