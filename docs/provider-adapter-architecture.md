# Provider / Adapter Architecture

## Goal

Moon separates generation providers by protocol family, not by relay vendor or concrete model name.

- `providerType = official` uses official provider routing.
- `providerType = openai_compatible` uses OpenAI-compatible routing.
- Model-name differences are data: `upstreamModelId || modelId`.
- Endpoint differences are data: `endpointFamily` plus provider config.

Code must not translate one vendor model name into another vendor model name.

## Provider Split

### Official Providers

Official providers represent first-party APIs such as OpenAI, Google, Volcengine / Seedance, Kling, Wan, and Grok.

Official providers must be routed by:

- `providerType = official`
- `providerFamily`
- `capability`
- `officialOperation`
- `adapterName`

Official routes must not use OpenAI-compatible fallback, relay route groups, relay aliases, or relay model fallback.

### OpenAI-Compatible Providers

OpenAI-compatible providers represent relay or custom gateways that expose OpenAI-like endpoints. They are routed by:

- `providerType = openai_compatible`
- `endpointFamily`
- `capability`
- `openaiCompatibleConfig`

Relay vendor hostnames must not create dedicated adapters.

## Allowed Adapter Families

### Official

- `OfficialOpenAIAdapter`
- `OfficialGoogleAdapter`
- `OfficialVolcengineAdapter`
- `OfficialKlingAdapter`
- `OfficialWanAdapter`
- `OfficialGrokAdapter`

### OpenAI-Compatible

- `OpenAICompatibleTextAdapter`
- `OpenAICompatibleImageGenerationAdapter`
- `OpenAICompatibleImageEditAdapter`
- `OpenAICompatibleVideoAdapter`

### Special Protocol

- `GoogleGeminiImageAdapter`, selected by `endpointFamily = gemini_generate_content`
- `MJAdapter`, selected by `endpointFamily = mj_task_submit`

## Model Identity Rules

Every model config must carry:

- `displayName`
- `modelId`
- `upstreamModelId`
- `providerId`
- `providerType`
- `providerFamily`
- `endpointFamily` or `officialOperation`
- `capability`
- `status`

The outbound model field is always:

```ts
body.model = upstreamModelId || modelId
```

If compatibility with a legacy frontend identifier is required, use a `model_aliases` data table/config. Do not hardcode aliases in adapter code.

## Endpoint Family Rules

OpenAI-compatible endpoint selection is data-driven:

- `openai_chat_completions` -> `POST /v1/chat/completions`
- `openai_images_generation` -> `POST /v1/images/generations`
- `openai_images_edits` -> `POST /v1/images/edits`
- `openai_videos` -> `POST /v1/videos`
- `unified_video_create` -> `POST /v1/video/create`
- `gemini_generate_content` -> `POST /v1beta/models/{upstreamModelId}:generateContent`
- `mj_task_submit` -> Midjourney task submit protocol

Endpoint path overrides belong in `openaiCompatibleConfig`, not in vendor-specific code branches.

## Fixed Model Rule

Once a user selects a model, generation may call only that selected provider and model.

Allowed:

- Endpoint fallback under the same provider and same model, when configured.

Forbidden:

- Model fallback
- Provider fallback
- `candidateModels`
- `fallbackModels`
- `tryNextModel`
- Automatic GPT/Gemini/video cross-routing

If `requestBody.model` does not match configured `upstreamModelId || modelId`, return `MODEL_ROUTING_MISMATCH`.

## Azure Rule

Azure does not get a dedicated business adapter. It is represented through configuration:

- Deployment name as `upstreamModelId`
- Endpoint path in config
- `api-version` in query params
- Auth header in config

Azure must not be mixed into official provider routing unless a future official registry explicitly models it as a first-party provider.
