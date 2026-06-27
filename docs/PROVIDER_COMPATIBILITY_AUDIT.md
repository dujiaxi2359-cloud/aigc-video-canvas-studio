# Moon｜Tv / AIGCNONG Provider Compatibility Audit

Generated during the clean-baseline consolidation pass.

## Baseline Decision

- Known working checkpoint: `fa8b2a4 Add Grsai image relay adapter`.
- Local tag: `baseline/main-working-grsai`.
- Clean baseline branch: `release/stable-provider-cloud-baseline`.
- Strategy: keep the verified `main` provider surface as `legacy_verified`, then cherry-pick only proven video result/download fixes from `codex/fix-video-task-chain`.
- Do not whole-branch merge `codex/fix-video-task-chain`, `refactor/provider-adapter-cleanup`, or `feature/moon-3d-director-stage`.

## Provider Classification Rules

| Type | Meaning | Migration Rule |
| --- | --- | --- |
| `official` | Direct official provider APIs with provider-specific auth/contracts. | Keep official adapters; expose unified `createVideo`, `pollVideo`, `extractTaskId`, `extractVideoUrl`, `finalizeVideoResult` surface. |
| `openai_compatible` | Relay/upstream that can be described by `endpointProfile` + model config. | Route through `OpenAICompatibleAdapter`/`ProviderGateway` after profile is explicit. No provider-name hardcoding. |
| `legacy_verified` | Capability already proven in `main`/`fa8b2a4`, including special relay contracts. | Preserve first; attach to unified finalizer and error/result extraction before replacing. |
| `custom_relay` | Non-standard relay with unique endpoint/result contract. | Keep as bridge or migrate to `endpointProfile: custom` only after tests. |

## Baseline Provider Files

From `fa8b2a4`:

- `server/src/services/providers/alibabaImage.service.ts`
- `server/src/services/providers/alibabaWan.service.ts`
- `server/src/services/providers/azureOpenAIImage.service.ts`
- `server/src/services/providers/deepseek.service.ts`
- `server/src/services/providers/googleImage.service.ts`
- `server/src/services/providers/googleRelay.service.ts`
- `server/src/services/providers/googleText.service.ts`
- `server/src/services/providers/googleVeo.service.ts`
- `server/src/services/providers/grokVideo.service.ts`
- `server/src/services/providers/grsaiImage.service.ts`
- `server/src/services/providers/grsaiImageProtocol.ts`
- `server/src/services/providers/klingVideo.service.ts`
- `server/src/services/providers/midjourneyImage.service.ts`
- `server/src/services/providers/minimaxVideo.service.ts`
- `server/src/services/providers/openaiImage.service.ts`
- `server/src/services/providers/seedanceVideo.service.ts`
- `server/src/services/providers/veoProxyVideo.service.ts`
- `server/src/services/providers/videoRequestAdapter.ts`

## Compatibility Matrix

| provider | model / family | type | capability | create endpoint | poll endpoint | task id path | video/result path | verified source | keep legacy | migrate Gateway | risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Grsai image relay | `gpt-image-2`, `gpt-image-2-vip`, `nano-banana-2` family | `legacy_verified` | `image_generation`, `image_edit` | `/v1/api/generate` via `grsaiGenerateEndpoint()` | `/v1/api/result?id={taskId}` via `grsaiResultEndpoint()` | `id` | image URL extracted by Grsai image service | `fa8b2a4`, `test:grsai-image-adapter ok` | yes | later as `custom` profile or bridge | medium; special relay contract must not be overwritten by generic OpenAI image/video adapter |
| OpenAI image | GPT Image / DALL-E family | `official` + compatible image relay where configured | `image_generation`, `image_edit` | `/v1/images/generations`, `/v1/images/edits` | sync or provider-specific | n/a | `url`, `b64_json`, image response paths | `main` | yes | Gateway only for compatible relay configs | medium; model name routing must come from config/upstreamModelId |
| Azure OpenAI image | Azure deployment images | `official` | `image_generation`, `image_edit` | Azure deployment image endpoint | sync | n/a | image response paths | `main` | yes | official adapter | medium; endpoint/deployment-specific |
| Google text/image | Gemini / Imagen relay/official | `official` or `custom_relay` for relay endpoint | `text`, `image_generation`, `image_edit` | Google GenAI / relay-specific | sync | n/a | provider-specific | `main` | yes | official adapter or custom profile | medium; Gemini image content format differs from OpenAI image API |
| Google Veo | Veo family | `official` | `text_to_video`, `image_to_video`, `reference_to_video` | Google operation create | Google operation poll | operation/name | operation media/result URL | `main` | yes | official adapter | high; async operation parser and safety handling must be preserved |
| Alibaba image | Wanx / Qwen image family | `official` | `image_generation`, `image_edit` | DashScope image endpoint | provider-specific | task id / request id | output image URL | `main` | yes | official adapter | medium |
| Alibaba Wan video | Wan / HappyHorse family | `official` | `text_to_video`, `image_to_video`, `reference_to_video`, `video_to_video` | DashScope video endpoint | DashScope task query | task id | video URL / output URL | `main` | yes | official adapter | high; asset and task semantics differ by model |
| Kling video | Kling family | `official` or compatible relay depending config | `text_to_video`, `image_to_video`, `reference_to_video` | Kling official endpoint or `/v1/videos` compatible profile | provider task endpoint or `GET /v1/videos/{task_id}` | `task_id`, `id` | `video_url`, `result_url`, `data[0].url` | `main` + later fixes | yes | Gateway for relay only | high; must not use Seedance asset flow unless configured |
| Grok video | Grok video family | `official` / compatible relay | `text_to_video`, `image_to_video`, `reference_to_video`, `video_to_video` | xAI/OpenAI-like video endpoint or relay `/v1/videos` | `GET /v1/videos/{task_id}` where compatible | `task_id`, `id` | `video_url`, `data[0].url` | `main` + cloud verified result | yes | Gateway for relay profile | medium |
| Seedance video | Seedance/Doubao family | `official` / `custom_relay` | `text_to_video`, `image_to_video`, `reference_to_video`, `video_to_video` | `/v1/videos`, `/v1/video/create`, or configured endpoint | configured poll endpoint | `task_id`, `id`, provider fields | `video_url`, `result_url`, output paths | `main` | yes | Gateway only after explicit endpointProfile | high; provider asset flow must be opt-in via `assetTransport=provider_asset` |
| Minimax video | Minimax family | `official` | video | Minimax create endpoint | Minimax query endpoint | task id | video URL | `main` provider file | yes | official adapter | medium |
| Sora / OpenAI video relay | OpenAI-compatible video family | `openai_compatible` | `text_to_video`, `image_to_video` | `/v1/videos` | `GET /v1/videos/{task_id}` | `id`, `task_id` | `video_url`, `result_url`, `data[0].url`, `url` | `main` catalog/relay base | yes | `openai_videos` profile | medium |
| Midjourney image | Midjourney relay | `custom_relay` | `image_generation` | provider-specific | provider-specific | task id | image URL | `main` provider file | yes | custom profile later | medium |
| DeepSeek text | DeepSeek chat | `official`/compatible text | `text` | `/v1/chat/completions` | sync | n/a | text content | `main` | yes | official/text compatible adapter | low |

## Endpoint Profiles To Introduce

| endpointProfile | create | poll | task id paths | success result paths | Notes |
| --- | --- | --- | --- | --- | --- |
| `openai_videos` | `POST /v1/videos` | `GET /v1/videos/{task_id}` | `id`, `task_id` | `video_url`, `result_url`, `output_url`, `data[0].url`, `data.url`, `result.url`, `url` | For Omni/Grok/Kling/Sora-style OpenAI-compatible video relays. |
| `unified_video_create` | `POST /v1/video/create` | `GET /v1/video/{task_id}` or configured endpoint | `task_id`, `id` | same extractor list | Only when profile explicitly says so. |
| `tasks_api` | configured create, often `POST /v1/videos` | `GET /v1/tasks/{task_id}` | `task_id`, `id` | same extractor list | No blind fallback. |
| `custom` | configured | configured | configured `task_id_paths` | configured `video_url_paths` | For Grsai-like/custom relay contracts. |

## Verified Fixes To Cherry-Pick From `codex/fix-video-task-chain`

Required candidates:

- `f99f547 fix: unify video result finalization`
- `d28b648 fix: keep video poll failures retryable`
- `08e84d6 fix: skip missing canvas nodes in video reconciler`
- `8857751 fix: surface terminal video poll failures`
- `ed1010f fix: snapshot video task polling config`
- `e42b9ca fix: preserve video task model identity`
- `804c604 fix: stop retrying denied video polls`
- `a7f738f fix: require real video download urls`

Cherry-pick with review, not as a range merge. After each logical group, run:

```bash
npm run typecheck --workspace server
npm run typecheck --workspace client
npm run build --workspace server
npm run build --workspace client
npm run test:grsai-image-adapter
```

## Commits Not To Cherry-Pick In This Cleanup Pass

- `0ce1b84 feat: add moon 3d director stage mvp`
- `95b6dfe chore: disable director 3d by default`
- `b690475 fix: handle empty model health history`
- Any broad UI rewrite not required for provider/video closure.
- Any unverified provider deletion or legacy adapter removal.

## COS/CDN Preservation Rules

Current target behavior:

1. Provider video URL must be written immediately after provider success.
2. COS/CDN transfer is post-success only.
3. COS/CDN failure must not mark generation failed.
4. `providerVideoUrl` remains usable for preview/download when transfer fails.
5. CDN success writes `cdnUrl`, `outputUrl`, `previewUrl`, `downloadUrl`/`downloadableUrl`.
6. Download URL priority: `cdnUrl` → `outputUrl` → `downloadUrl`/`downloadableUrl` → `videoUrl` → `providerVideoUrl` → `previewUrl`.
7. `fileName` is a save name only, never a media URL.

## Gateway Status

- `ProviderGateway` is not yet established on the clean baseline.
- `openaiCompatibleProtocol.ts`, `videoResultExtractor.ts`, `videoTaskFinalizer.service.ts`, and `videoTaskReconciler.service.ts` exist in later branches/cloud snapshot and should be cherry-picked or reintroduced carefully.
- Legacy providers remain the safety net until Gateway coverage is tested.

## Cloud Snapshot Reference

- Cloud directory: `/www/wwwroot/aigcnong-unified`.
- Cloud snapshot branch: `cloud/live-snapshot-20260627-105507`.
- Cloud snapshot commit: `04c2ca23f481141bd72176d831f128c8fbcbd972`.
- Excluded from snapshot commit: `.env`, key/cert files, node_modules, dist, dist backups, logs, uploads, generated media, video files, sqlite/db, AppleDouble metadata.

