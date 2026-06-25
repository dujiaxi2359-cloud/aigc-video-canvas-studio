# Provider / Adapter Cleanup Summary

Date: 2026-06-25

## Scope

This cleanup intentionally did not add new provider features, UI redesign, payment logic, login logic, or invitation logic. It focused on removing stale provider routing ambiguity after the audit.

## Changes

1. Removed the dead `tryImageFallback` and `tryVideoFallback` stubs from `server/src/services/model.service.ts`.
2. Removed their generation-path call sites so image/video failures now stay attached to the selected model route instead of passing through legacy fallback names.
3. Preserved endpoint fallback only inside the existing selected provider/model request adapters.
4. Tightened `client/src/components/nodes/VideoNode.tsx` so connecting a video input no longer swaps away from an already selected video model. It may still adjust the mode for the selected model when that model supports the needed video-input mode.
5. Documented provider/adapter inventory and cleanup decisions in `docs/provider-adapter-audit.md`.

## What Was Not Deleted

No provider implementation file was deleted in this pass. Several relay-specific files are still active through imports and tests, so the audit marks them as `merge`, `replace`, or `deprecated` instead of removing them blindly.

Notable deferred cleanup:

- Rename/split `seedanceVideo.service.ts` into a generic OpenAI-compatible video adapter after tests cover all current relay behavior.
- Move relay-specific video heuristics in `videoRequestAdapter.ts` into saved provider configuration.
- Keep Azure behavior as OpenAI-compatible configuration, not an expanding Azure business adapter.
- Replace provider-local `未知错误` fallbacks with structured raw upstream error reporting in a later pass where each provider parser can be tested.

## Routing Guarantees Preserved

- Fixed image model generation stays on the selected provider/model.
- Fixed video model generation stays on the selected provider/model.
- Endpoint fallback does not change providerId or modelId.
- `autoModelSelection` and `autoVideoModelSelection` remain disabled by default and rejected by backend selected-model guards.
- Capability mismatch still fails before provider calls.

## Verification

Run after cleanup:

```bash
npm run typecheck --workspace server
npm run typecheck --workspace client
npm run test:video-provider-adapters --workspace server
npm run test:image-asset-compat --workspace server
npm run test:image-response-extractor --workspace server
npm run test:model-capability-classification --workspace server
npm run test:video-result-extractor --workspace server
npm run build --workspace server
npm run build --workspace client
git diff --check
```
