# Provider / Adapter Audit

Date: 2026-06-25

Scope: server and client model routing, provider adapters, OpenAI-compatible relay handling, official provider handling, image/video/text generation entry points, and legacy fallback code.

## Executive Finding

The project now has selected-model guards in the main image and video generation paths, but the codebase still contains historical relay-specific adapter logic, route heuristics, and legacy fallback names. The biggest immediate cleanup target is not deleting provider files blindly; it is removing any cross-model fallback path and documenting which relay-specific pieces must be merged into the OpenAI-compatible configuration layer later.

Status rule used below:

- keep: active and needed now
- merge: active but should be folded into unified OpenAI-compatible config/adapter later
- delete: safe to remove in this cleanup
- replace: behavior should be replaced by config-driven logic
- deprecated: not main flow; keep only until migration is verified
- unknown: requires runtime verification before changing

## Provider Files

| File | Role | Status | Reason |
| --- | --- | --- | --- |
| `server/src/services/providers/openaiCompatibleProtocol.ts` | Shared OpenAI-compatible defaults, endpoint join, headers, errors, capability derivation | keep | This is the correct shared foundation for relay providers and Azure config differences. |
| `server/src/services/providers/openaiCompatibleText.service.ts` | Text relay adapter, default `/v1/chat/completions` | keep | Text already follows the unified OpenAI-compatible path. |
| `server/src/services/providers/openaiImage.service.ts` | OpenAI official image and OpenAI-compatible image endpoint handling | merge | Active. Should remain now, but relay image behavior should eventually be named/split as OpenAI-compatible image adapter. |
| `server/src/services/providers/seedanceVideo.service.ts` | Main generic relay video adapter plus historical Seedance details | merge | Active for OpenAI-compatible video. Name is misleading; keep now, later rename/split to OpenAI-compatible video adapter. |
| `server/src/services/providers/videoRequestAdapter.ts` | Video endpoint/config resolver for `/v1/videos`, `/v1/video/create`, poll endpoints, transports | keep | Required for endpoint fallback within the same provider/model. |
| `server/src/services/providers/providerBaseUrl.ts` | Runtime base URL resolver | keep | Needed to keep provider config isolated from request payloads. |
| `server/src/services/providers/providerTypes.ts` | Common provider result types | keep | Shared types. |
| `server/src/services/providers/azureOpenAIImage.service.ts` | Azure image endpoint/header handling | replace | Azure must remain a config-layer variation under `openai_compatible`; current dedicated file should not expand, but cannot be removed until config path covers current tests. |
| `server/src/services/providers/googleImage.service.ts` | Google official image, with relay shortcut | keep | Official Google still needs provider-specific request schema. Relay shortcut should be audited later. |
| `server/src/services/providers/googleRelay.service.ts` | Gemini relay helper | merge | Relay-specific adapter; keep until unified image/text relay path fully covers it. |
| `server/src/services/providers/googleText.service.ts` | Google official text | keep | Official provider logic. |
| `server/src/services/providers/googleVeo.service.ts` | Google Veo official/proxy bridge | keep | Official/proxy code still active. Proxy-specific parts should migrate later. |
| `server/src/services/providers/veoProxyVideo.service.ts` | Historical Veo relay/proxy adapter | merge | Active for some relay paths; should become config-driven OpenAI-compatible video behavior. |
| `server/src/services/providers/grokVideo.service.ts` | Grok video official/relay adapter | merge | Active. Relay-specific endpoint rules should migrate to config. |
| `server/src/services/providers/alibabaImage.service.ts` | Alibaba/Qwen official image | keep | Official provider. |
| `server/src/services/providers/alibabaWan.service.ts` | Alibaba Wan official video | keep | Official provider. |
| `server/src/services/providers/klingVideo.service.ts` | Kling official video | keep | Official provider. |
| `server/src/services/providers/minimaxVideo.service.ts` | MiniMax video | keep | Active provider. |
| `server/src/services/providers/midjourneyImage.service.ts` | Midjourney image adapter | keep | Special image provider. Must only run when selected model is Midjourney. |
| `server/src/services/providers/grsaiImage.service.ts` | Grsai image relay | merge | Relay-specific image adapter. Keep until generic OpenAI-compatible image path covers response shape. |
| `server/src/services/providers/grsaiImageProtocol.ts` | Grsai model/protocol helpers | merge | Relay-specific discovery/config helper. |
| `server/src/services/providers/zhipuImage.service.ts` | Zhipu official image | keep | Official provider. |
| `server/src/services/providers/zhipuProtocol.ts` | Zhipu official model helpers | keep | Official provider model list. |
| `server/src/services/providers/deepseek.service.ts` | DeepSeek text | keep | Official/compatible text provider in current system. |

## Model And Config Files

| File | Role | Status | Reason |
| --- | --- | --- | --- |
| `server/src/services/model.service.ts` | Main text/image/video generation router | keep | Central runtime path. Must enforce selected model only. |
| `server/src/services/modelConfig.service.ts` | Model config CRUD/probe, providerType, default OpenAI-compatible config, Azure endpoint config | keep | Correct location for baseUrl/apiKey/model/capability configuration. |
| `server/src/services/modelCatalog.ts` | Built-in model catalog | keep | Static seed catalog. Hard-coded relay entries are allowed as defaults, not runtime fallback. |
| `server/src/services/providerCatalog.ts` | Provider catalog | keep | Settings/catalog support. |
| `server/src/services/modelCapability.service.ts` | Capability APIs | keep | Needed for strict capability checks. |
| `server/src/services/modelCapabilityPresets.ts` | Preset capability shapes | keep | Used by configuration UI and tests. |
| `server/src/services/imageCapabilityNormalization.ts` | Image capability normalization | keep | Needed for strict image mode/options. |
| `server/src/services/videoCapabilityNormalization.ts` | Video capability normalization | replace | Useful now, but name inference must not be used to bypass manually configured capability. |
| `server/src/config/videoModelRegistry.ts` | Historical official/relay video registry | merge | Keep for compatibility/tests. Long term move relay details to OpenAI-compatible config records. |
| `server/src/config/videoModelCapabilities.ts` | Video model capability presets | merge | Keep now. Avoid using it as auto-route source. |
| `server/src/config/officialModelCapabilities.ts` | Official capability presets | keep | Official model source. |
| `server/src/types/model.ts` | Model/provider capability types | keep | Required schema. |
| `client/src/store/modelConfigStore.ts` | Client model store | keep | UI state only. |
| `client/src/services/modelConfigApi.ts` | Client settings API | keep | UI config only. |
| `client/src/utils/modelConfigSelection.ts` | Canonical selection helper | keep | UI selection helper, not backend fallback. |
| `client/src/utils/videoChannelCapability.ts` | UI video channel capability diagnostics | keep | Same-model/same-provider suggestions only; not automatic generation fallback. |

## Entry Points By Capability

| Capability | Current Runtime Entry | Status | Notes |
| --- | --- | --- | --- |
| text | `generateText` in `model.service.ts` | keep | DeepSeek/Google official branches, otherwise OpenAI-compatible text. |
| image_generation | `generateImage` -> `callImageProvider` | keep | Must stay selected-model only. `image_generation` must not carry `image/images/mask`. |
| image_edit | `generateImage` -> provider image edit endpoint support | keep | Must be explicitly configured as `image_edit`; no text-to-image endpoint with image payload. |
| text_to_video | `generateVideo` -> `callVideoProvider` | keep | Must match selected capability. |
| image_to_video | `generateVideo` -> `callVideoProvider` | keep | Must require single image capability. |
| reference_to_video | `generateVideo` -> `callVideoProvider` | keep | Must require reference images/files capability. |
| video_to_video | `generateVideo` -> `callVideoProvider` | keep | Must create and poll with the same provider/model config. |
| video polling | Provider adapter poll logic plus `videoRequestAdapter` config | keep | Poll must bind to the create provider/model/task. |

## Official Logic

Official providers remain separate and should not be routed through relay heuristics unless their saved providerType/baseUrl explicitly says otherwise:

- OpenAI image: keep
- Google text/image/Veo: keep
- Alibaba Qwen/Wan: keep
- Kling: keep
- Zhipu: keep
- MiniMax: keep
- Midjourney: keep as special provider

## OpenAI-Compatible / Relay Logic

OpenAI-compatible relay handling should converge on:

- text: `POST /v1/chat/completions`
- image_generation: `POST /v1/images/generations`
- image_edit: `POST /v1/images/edits`
- video create: configured endpoint, default `POST /v1/videos`
- video poll: configured endpoint, default `GET /v1/videos/{taskId}`

Azure remains an OpenAI-compatible config variation:

- custom endpoint path
- `api-version` query
- `api-key` auth header

Do not add an Azure business adapter beyond existing compatibility coverage.

## Auto Route And Candidate Fallback

| Location | Finding | Status | Action |
| --- | --- | --- | --- |
| `model.service.ts` selected image/video routing guards | Enforces selected provider/model/capability against actual route | keep | Required. |
| `model.service.ts` `tryImageFallback` | No-op cross-model fallback stub remains | delete | Remove to prevent future misuse. |
| `model.service.ts` `tryVideoFallback` | No-op cross-model fallback stub remains | delete | Remove to prevent future misuse. |
| `client/src/components/nodes/ImageGenerateNode.tsx` auto selection when empty | Selects first available image model only when node has no model | keep | UI default, not backend fallback. |
| `client/src/components/nodes/VideoNode.tsx` auto selection when empty | Selects first available video model only when node has no model | keep | UI default, not backend fallback. |
| `client/src/components/nodes/VideoNode.tsx` video-input mode adjustment | Previously could replace the selected model when a video input was connected | replace | Must only adjust the selected model's mode; never swap model after a user has one selected. |
| `client/src/components/nodes/VideoNode.tsx` safety-filter "切换模型" button | User-triggered model switch | keep | Not automatic generation fallback. |
| Backend model generation | No `candidateModels`/`fallbackModels` loops found in main runtime after selected-model guard | keep | Keep searching in future changes. |

## Hard-Coded BaseUrl / ModelId

| Location | Finding | Status | Action |
| --- | --- | --- | --- |
| `server/src/services/modelCatalog.ts` | Static defaults for official and relay models | keep | Catalog defaults are acceptable; runtime must still use selected saved config. |
| `client/src/data/modelCatalog.ts` | Client catalog defaults | keep | UI seed data only. |
| `server/src/config/videoModelRegistry.ts` | Static registry entries for official/relay video | merge | Keep for tests; migrate relay endpoint facts to config records later. |
| `server/src/db/database.ts` | Migration/update logic for existing relay rows | keep | Needed to repair old local DB rows. Do not use for runtime fallback. |
| `server/src/scripts/testVideoProviderAdapters.ts` | Hard-coded relay docs in tests | keep | Tests protect known relay behavior. |

## Capability / modelType / apiFamily Mixed Logic

| Location | Finding | Status | Action |
| --- | --- | --- | --- |
| `model.service.ts` `assertModelRuntimeReady` | Requires providerType, baseUrl, key, modelId, ready status, capability | keep | Correct guard. |
| `model.service.ts` `validateImageRequest` | Blocks image refs for text-to-image-only models | keep | Correct. |
| `model.service.ts` `validateVideoRequest` | Blocks capability/node mismatch | keep | Correct. |
| `videoRequestAdapter.ts` apiFamily heuristics | Uses baseUrl/model to infer relay protocol | replace | Long term should be explicit config. Keep now because tests depend on it. |
| `videoCapabilityNormalization.ts` name inference | Enriches capability presets by model name | replace | Do not let inference override explicit selected capability at runtime. |
| `modelConfig.service.ts` `capabilityKindsFor` | Derives capability from saved input modes | keep | Config-layer derivation is acceptable for manual setup. |

## Unknown Error Handling

| Location | Finding | Status | Action |
| --- | --- | --- | --- |
| `server/src/utils/providerErrors.ts` | Central error code/message mapping | keep | Current route metadata should surface raw upstream details. |
| `server/src/services/model.service.ts` `providerErrorMeta` usage | Error response now includes debug/payload summary | keep | Avoids blind "生成失败". |
| Provider files with literal `未知错误` fallback | Several provider-local parser fallbacks remain | replace | Not part of this cleanup unless it hides raw response. Long term convert to raw response detail. |
| Client preview text `生成失败` | Generic UI state label | keep | User asked not to change UI in this cleanup. Detailed message still shown in node error line/logs. |

## Seedance Material Group Logic

| Location | Finding | Status | Action |
| --- | --- | --- | --- |
| `server/src/services/providers/seedanceVideo.service.ts` `CreateAssetGroup` helpers | Historical Seedance material group flow | deprecated | Keep only until runtime confirms no selected model still depends on it. Do not add new material-group behavior. |
| `videoRequestAdapter.ts` `imageTransport` / `videoTransport` | Current transport selection | keep | This is the preferred path for relay video inputs. |

## Immediate Cleanup Plan

1. Delete the no-op `tryImageFallback` and `tryVideoFallback` functions.
2. Delete their calls in `generateImage` and `generateVideo`.
3. Keep provider files in place unless unused imports prove safe removal.
4. Keep endpoint fallback only inside same selected provider/model config.
5. Write a cleanup summary after code changes and verification.
