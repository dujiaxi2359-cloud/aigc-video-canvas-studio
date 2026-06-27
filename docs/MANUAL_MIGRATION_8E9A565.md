# Manual Migration Notes for 8e9a565

Source commit: `8e9a565 Fix video result persistence pipeline`
Target branch: `release/stable-provider-cloud-baseline`

## Why this commit is not cherry-picked directly

`8e9a565` is too broad for the clean baseline and conflicts with existing verified code:

1. Conflicts with `server/package.json` because the clean baseline already registered `test:grsai-image-adapter`.
2. Conflicts with `server/src/services/generationTask.service.ts` around generation task persistence.
3. Conflicts with `server/src/services/model.service.ts` around video fallback/provider logic.
4. Conflicts with `server/src/services/providers/videoRequestAdapter.ts`.
5. Includes semi-ProviderGateway `openai_compatible` video adapter/fallback changes that may affect legacy and official providers.
6. It is a 13-file integration commit, so it must be split into safe persistence-only pieces.

## Files touched by 8e9a565

From `git show --stat 8e9a565` / `git show --name-only 8e9a565`:

| file | action in this migration |
| --- | --- |
| `server/package.json` | Manually add `test:video-result-extractor` while preserving `test:grsai-image-adapter`. |
| `server/src/db/database.ts` | Add nullable generation task persistence columns only if missing. |
| `server/src/db/schema.sql` | Add nullable generation task columns. |
| `server/src/routes/admin.routes.ts` | Do not port broad admin repair changes in this pass. |
| `server/src/scripts/testVideoResultExtractor.ts` | Add test for URL/status/task extraction. |
| `server/src/services/generatedVideoPersistence.service.ts` | Add minimal canvas success/failure helpers that preserve real URLs and do not overwrite successful nodes. |
| `server/src/services/generationTask.service.ts` | Add safe URL/provider/storage fields and merge existing task state. |
| `server/src/services/model.service.ts` | Only add post-success protection and task persistence hooks; do not change provider routing. |
| `server/src/services/providers/videoRequestAdapter.ts` | Do not migrate. ProviderGateway/openai-compatible routing is deferred. |
| `server/src/services/storage/cosStorage.service.ts` | Do not migrate unless needed by post-success storage metadata later. |
| `server/src/services/videoCapabilityNormalization.ts` | Do not migrate in this pass. |
| `server/src/utils/providerErrors.ts` | Add new error codes only. |
| `server/src/utils/videoResultExtractor.ts` | Add extraction helpers for real video URLs, task IDs, status, and progress. |

## Allowed manual migration scope

- Video result URL extraction enhancements.
- Task persistence fields for `provider_video_url`, `output_url`, `preview_url`, `storage_status`, `storage_key`, `storage_error`, `raw_poll_response`, and `provider_status`.
- Canvas node success update with real URLs.
- Failure update guard that never overwrites an already successful node with a playable URL.
- Minimal post-success guard in `model.service.ts` so storage/archive errors do not override provider success.
- Error-code additions only.
- Test script registration for Grsai and video result extraction.

## Forbidden migration scope

- `videoRequestAdapter.ts` openai-compatible large routing branch.
- Large `apiFamily` fallback logic in `model.service.ts`.
- ProviderGateway replacement work.
- Any provider-name hardcoding for relay platforms.
- Any deletion or replacement of legacy providers.
- Any deletion or replacement of official providers.
- Any changes to Grsai image relay adapter behavior.
- Admin/storage UI large changes.
- 3D Director code.
- Model health matrix.
- Unverified asset group/provider asset transport logic.

## Migrated in this pass

- Added `server/src/utils/videoResultExtractor.ts` with real media URL detection, video URL extraction, task ID extraction, and status classification helpers.
- Added `server/src/scripts/testVideoResultExtractor.ts` and registered `test:video-result-extractor` without overwriting `test:grsai-image-adapter`.
- Added nullable `generation_tasks` fields in schema/migration: `provider_status`, `provider_video_url`, `output_url`, `preview_url`, `storage_status`, `storage_key`, `storage_error`, `raw_poll_response`.
- Extended `saveGenerationTask()` to preserve existing provider/storage fields and merge result JSON.
- Added `server/src/services/generatedVideoPersistence.service.ts` with success canvas URL backfill and failure guard that does not overwrite an already successful playable node.
- Added provider error codes for post-success storage failure and poll/result classification.
- Added minimal `generateVideo()` success-path persistence and post-success storage guard. Provider routing and `videoRequestAdapter.ts` were not changed.

## Deferred to ProviderGateway phase

- OpenAI-compatible video route/profile abstraction.
- `videoRequestAdapter.ts` routing branch changes.
- Broad provider fallback selection logic.
- Endpoint profile configuration UI/schema cleanup beyond persistence fields.
