# Stage 2 Cherry-pick Plan

Baseline branch: `release/stable-provider-cloud-baseline`
Baseline source: `fa8b2a4 Add Grsai image relay adapter`

Rule: do not whole-branch merge `codex/fix-video-task-chain`. Cherry-pick only reviewed commits in small batches.

## A. Required candidates

| commit | message | cherry-pick | reason |
| --- | --- | --- | --- |
| `8e9a565` | Fix video result persistence pipeline | yes | Early persistence fix for video result URL/task state. Review conflicts carefully. |
| `c7fa9d4` | Keep video nodes pending until upstream settles | yes | Prevents premature completion without real video URL. |
| `bac93ba` | Require video URL before marking node complete | yes | Enforces real URL before completed state. |
| `2456bbd` | Fix omni relay video create routing | yes | Candidate for OpenAI-compatible `/v1/videos` create route correctness. |
| `6d68238` | Fix Omni fast video capability profiles | yes | Candidate for model capability/input mode correctness. |
| `7c74861` | Remove stale Omni video route fallback | yes | Prevents wrong fallback route. |
| `69037c2` | fix: constrain video fallback protocol | yes | Prevents blind fallback across incompatible protocols. |
| `af0706f` | fix: recover video nodes from provider tasks | yes | Recovers existing provider tasks without recreation. |
| `a0ae2d9` | fix: stop stale video generations from hanging | yes | Stops indefinite loading for stale tasks. |
| `4b62c47` | fix: stabilize video fullscreen and downloads | yes | Download/playback stabilization candidate. |
| `fe8ca0e` | fix: make generated media downloads reliable | yes | Download URL reliability. |
| `8a9c824` | fix: mark video nodes complete when output is available | yes | Canvas completion from existing output URL. |
| `9c11d92` | fix: clarify video generation status | yes | Status clarity for running/failed/success. |
| `b50e1f8` | fix: normalize completed project node status | yes | Reloaded project nodes keep correct status. |
| `38921a0` | fix: keep video tasks authoritative after provider creation | yes | Provider task state must beat diagnostics/local stale errors. |
| `5fa456b` | fix: restore video task polling backfill | yes | Backfills/polls existing provider tasks. |
| `6aeb987` | fix: keep video poll access errors retryable | yes | Poll access error handling. |
| `b912cd7` | fix: keep video success when aspect transform fails | yes | Post-success errors must not override success. |
| `518c54c` | fix: treat upstream failed video tasks as failed | yes | Terminal failed upstream should stop loading. |
| `9a4e177` | fix: stop loading on video poll access denial | yes | Access-denied polls should not hang. |
| `2345622` | fix: clear stale video task error metadata | yes | Clears stale node/task error on valid running/success states. |
| `f99f547` | fix: unify video result finalization | yes | Required finalizer path. |
| `d28b648` | fix: keep video poll failures retryable | yes | Poll retry/error behavior. |
| `08e84d6` | fix: skip missing canvas nodes in video reconciler | yes | Reconciler should not fail entire flow on missing canvas node. |
| `8857751` | fix: surface terminal video poll failures | yes | Terminal poll failure visibility. |
| `ed1010f` | fix: snapshot video task polling config | yes | Poll uses original task config/key/model, not current user's unrelated config. |
| `e42b9ca` | fix: preserve video task model identity | yes | Prevents task/model mismatch during poll/sync. |
| `804c604` | fix: stop retrying denied video polls | yes | Terminal permission/scope denial classification. |
| `a7f738f` | fix: require real video download urls | yes | Prevents fileName as URL and fixes download URL priority. |

## B. Optional candidates

| commit | message | cherry-pick | reason |
| --- | --- | --- | --- |
| `430df6f` | fix: clarify upstream failure causes | optional | Error clarity only; useful after core flow. |
| `15cd2fa` | fix: use signed cdn urls for asset playback | optional | Future CDN signing; not required for providerVideoUrl fallback. |
| `aaaf395` | fix: make cdn delivery origin agnostic | optional | Useful for COS/CDN migration safety. |
| `ceafd82` | fix: save cdn delivery metadata for public assets | optional | Useful after core URL persistence is stable. |
| `5aca4ff` | document provider adapter architecture | optional | Documentation only; baseline already has audit doc. |
| `5c253d3` | converge relay routing on protocol families | optional later | ProviderGateway/endpointProfile design; defer until separate phase. |
| `b97f3b4` | fix: lock selected model routing and audit adapters | optional later | Can affect provider routing broadly; review after core fixes. |
| `361ad0e` | Unify OpenAI-compatible provider routing | optional later | Broad routing change; not in minimal stability batch. |
| `6407e86` | fix: allow relay model probe fallback | optional later | Model probe behavior, not video completion core. |
| `e4c1b38` | fix: harden relay capability normalization | optional later | Capability robustness; verify no Grsai regression first. |

## C. Do not cherry-pick in this stage

| commit | message | reason |
| --- | --- | --- |
| `0ce1b84` | feat: add moon 3d director stage mvp | 3D Director scope excluded. |
| `95b6dfe` | chore: disable director 3d by default | 3D Director scope excluded. |
| `efb187d` | feat: add model health matrix | Model health matrix excluded. |
| `b690475` | fix: handle empty model health history | Model health matrix follow-up excluded. |
| `678aad6` | fix: lazy load canvas media previews | Canvas/media UI performance, not core video result. |
| `6ad0267` | fix: prefer cdn previews for canvas media | Media display policy; defer until core flow stable. |
| `061a839` | fix: gate provider asset video uploads | Asset flow logic; defer unless required by video tests. |
| `761a9f2` | enforce gpt image2 all outbound model | Image routing, not video flow. |
| `d61201c` | canonicalize gpt image2 all relay model | Image routing hardening; defer. |
| `af0acc9` | fix image2 relay routing and admin overview | Image/admin routing; defer. |
| `8119cfb` | remove temporary aliyun oss integration | Storage cleanup; risky in clean baseline stage. |
| `6a856be` | fix terminal video poll failures | Superseded/overlapped by later poll failure commits; inspect only if needed. |
| `8a0c486` | fix relay protocol routing and video completion sync | Broad provider/video routing; inspect only if required. |
| `7c4edde` | Improve light theme readability | UI excluded. |
| `3c3d004` | fix: improve light workspace text contrast | UI excluded. |
| `d679d93` | fix: separate relay image probing and light workspace contrast | Mixed image/UI; defer. |
| `4dfdd9f` | fix: support azure image relay endpoints | Image provider; defer. |
| `8f6e2d6` | fix: route cy88 image edits through relay generation | Image provider; defer. |
| `3f7d71b` | fix: use specified light plasma color | UI excluded. |
| `f6585e7` | fix: refine moon light home palette | UI excluded. |
| `b132aab` | fix: split moon theme backgrounds | UI excluded. |
| `af1b5f5` | fix: improve moon light theme visuals | UI excluded. |
| `6414869` | feat: add moon theme switching | UI/theme excluded. |
| `f2618a1` | fix: add Moon favicon assets | UI/asset excluded. |
| `0b27d60` | fix: align script guide and editor quality | Non-core editor/guide. |
| `d83b988` | fix: refine canvas workflows and grok recovery | Mixed broad workflow; inspect only if required. |
| `add7107` | fix: keep omni v2v upstream identity | Specific model identity; review after core polling config. |
| `de0d471` | fix: preserve upstream model contracts | Broad provider contract; defer. |
| `12a6f38` | fix: keep grok relay model names canonical | Specific relay identity; defer. |
| `5ed505d` | style: compact moon view controls | UI excluded. |
| `91aa775` | style: remove cyan from moon controls | UI excluded. |
| `8214190` | style: refine moon control readability | UI excluded. |
| `cad6ac3` | style: enlarge moon canvas controls | UI excluded. |
| `b7432b8` | fix: auto switch to video input models | Canvas/model UX; defer. |
| `e3c39bc` | fix: route video input to extension modes | Model UX; defer. |
| `1599911` | fix: normalize omni fast v2v configs | Specific config; defer. |
| `754f5d9` | fix: restore omni fast v2v model option | Specific model option; defer. |
| `e7cd6dc` | style: refine moon canvas controls | UI excluded. |
| `fc5add2` | fix: preserve video aspect ratio in fullscreen | UI/fullscreen; defer unless download tests need it. |
| `3a47405` | fix: generalize text reasoning node | Text node unrelated. |
| `37ff804` | fix: restore generated image previews | Image previews; defer. |
| `67f1309` | fix: filter video options by model capability | Model UX; defer. |
| `1c6d63f` | fix: align Grok relay with documented video API | Specific relay; defer until Gateway phase. |
| `0af0f4e` | Protect and recover deleted generation nodes | Broad canvas recovery; defer. |
| `513d2cf` | Support Finder image drops on canvas | UI/input excluded. |
| `ca2813b` | Redesign Moon canvas control system | UI excluded. |
| `125c511` | Unify Moon floating control chrome | UI excluded. |
| `c1626a3` | Lock Omni fast v2v video modes | Specific model config; defer. |
| `c4a9275` | Refine image asset floating toolbar | UI excluded. |
| `f8334ec` | Polish creation node scrolling controls | UI excluded. |
| `6254e29` | Force URL image transport for Agnes video | Specific provider/input transport; defer. |
| `6041ae2` | Clarify upstream image failure reasons | Image errors; defer. |
| `6df6cb6` | Add auto image ratio and pending safeguards | Image/canvas mixed; defer. |
| `26df054` | Stabilize image relay async handling | Image relay; defer. |
| `3b1abf7` | Pin NewToken video create endpoint | Specific platform fix; not endpointProfile-wide. |
| `58d6118` | Add Zhipu image endpoint fallback | Image provider; defer. |
| `4f0e4d0` | Fix NewToken video protocol profiles | Specific platform profile; defer. |
| `f395b36` | Fix official Agnes and Zhipu model integrations | Specific official/image integrations; defer. |

## Contradiction correction

The previous handoff summary incorrectly highlighted only the later finalizer/download commits as the required set while the plan also suggested `8e9a565` + `c7fa9d4` as the first batch. After checking `git show --stat`:

- `8e9a565` is a large but foundational video result persistence commit. It introduces `videoResultExtractor`, `generatedVideoPersistence`, `provider_video_url` schema/task persistence, admin repair hooks, COS post-success persistence hooks, and core model-service result handling. It belongs to the required candidate pool, but it is high risk and must be cherry-picked alone.
- `c7fa9d4` is a direct video node state fix that keeps nodes pending until upstream actually settles. It is required for the closed loop, but it should not be bundled with `8e9a565` because `8e9a565` is already a large integration step.

## First suggested batch after approval

1. `8e9a565` only.

Then run the full validation suite before considering `c7fa9d4` or any later commit.
