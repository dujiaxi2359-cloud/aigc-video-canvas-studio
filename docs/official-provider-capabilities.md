# Official Provider Capabilities

## Official Provider Registry

The official provider registry is the source of truth for first-party provider families and official adapters.

Suggested registry shape:

```ts
type OfficialProviderRegistryEntry = {
  id: string;
  providerFamily: "openai" | "google" | "volcengine" | "kling" | "wan" | "grok" | "other_official";
  displayName: string;
  authMode: "bearer" | "api-key" | "oauth" | "custom";
  supportedCapabilities: ModelCapabilityKind[];
  adapterName: string;
  enabled: boolean;
};
```

## Provider Families

| providerFamily | Adapter | Capabilities |
| --- | --- | --- |
| `openai` | `OfficialOpenAIAdapter` | text, image generation, image edit, video when supported |
| `google` | `OfficialGoogleAdapter` | Gemini generateContent, image, video |
| `volcengine` | `OfficialVolcengineAdapter` | Seedance text-to-video, image-to-video, reference-to-video |
| `kling` | `OfficialKlingAdapter` | text-to-video, image-to-video |
| `wan` | `OfficialWanAdapter` | text-to-video, image-to-video, reference-to-video, video-to-video |
| `grok` | `OfficialGrokAdapter` | text / image / video when officially supported |

## officialOperation

Official providers should use `officialOperation`, not relay `endpointFamily`.

Examples:

- `openai_chat`
- `openai_image_generation`
- `openai_image_edit`
- `google_generate_content`
- `google_video`
- `volcengine_text_to_video`
- `volcengine_image_to_video`
- `kling_text_to_video`
- `kling_image_to_video`
- `wan_text_to_video`
- `wan_image_to_video`
- `grok_text`
- `grok_video`

## Official Model Readiness

Official models cannot become `ready` from model-name guessing alone. They require:

- `providerType = official`
- `providerFamily`
- `adapterName`
- `modelId`
- `upstreamModelId`
- `capability`
- `officialOperation`
- `status = ready`

Missing official routing metadata should keep the model in `need_config`.

## Separation From OpenAI-Compatible

Official providers must not use:

- OpenAI-compatible endpoint fallback
- Relay aliases
- Relay route groups
- Relay model fallback
- OpenAI-compatible adapter selection

Official provider output must still normalize into Moon's shared output shape.
