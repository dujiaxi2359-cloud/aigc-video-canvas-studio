import type { ModelCapabilities } from "../../types/model";

export function defaultCapabilities(): ModelCapabilities {
  return {
    duration: { type: "enum", values: [5] },
    aspectRatios: ["16:9"],
    resolutions: ["720P"],
    inputModes: ["text-to-video"]
  };
}
