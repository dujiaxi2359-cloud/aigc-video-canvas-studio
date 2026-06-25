# Model Routing Rules

## Request Routing

Generation starts with the selected model config. The selected `modelConfigId` resolves to one enabled model in the current workspace.

The route is then determined by `providerType`:

1. `official` -> Official Provider Router
2. `openai_compatible` -> OpenAI-Compatible Router

The two routes must not fall through into each other.

## OpenAI-Compatible Image Generation

For `endpointFamily = openai_images_generation`:

```http
POST {baseUrl}/v1/images/generations
```

Allowed JSON keys:

- `model`
- `prompt`
- `size`
- `quality`
- `style`
- `n`
- `response_format`

Forbidden keys:

- `image`
- `images`
- `image_url`
- `input_image`
- `mask`
- `contents`
- `parts`
- `inlineData`
- `duration`
- `ratio`
- `aspect_ratio`
- `video`
- `files`

If a text-to-image model receives reference images, return:

```json
{
  "code": "CAPABILITY_MISMATCH",
  "message": "当前模型是文生图模型，不支持参考图输入，请切换 image_edit 模型或移除参考图。"
}
```

## Gemini / Nano Banana

Gemini-style models must not default to OpenAI-compatible image generation.

- Use `endpointFamily = gemini_generate_content` for Gemini generateContent.
- Use `endpointFamily = openai_images_generation` only when a relay explicitly wraps that model behind `/v1/images/generations` and the model config says so.

Gemini body shape:

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "prompt" }]
    }
  ],
  "generationConfig": {
    "responseModalities": ["IMAGE", "TEXT"]
  }
}
```

Images are downloaded and inserted as `parts[].inlineData`.

If Gemini receives an OpenAI-style body and upstream reports `contents is required`, return `GEMINI_REQUEST_SCHEMA_ERROR`.

## Model Field Rule

Outbound request model is:

```ts
requestBody.model = capabilities.upstreamModelId?.trim() || model.model_name || model.id
```

No adapter may rewrite this value.

## Error Rule

If the outgoing request body model differs from configured model identity, return:

```json
{
  "code": "MODEL_ROUTING_MISMATCH",
  "message": "实际发送给上游的模型名与模型配置不一致。"
}
```

## Output Normalization

Image output:

```json
{
  "outputUrl": "...",
  "providerImageUrl": "...",
  "rawResponse": {},
  "metadata": {}
}
```

Video output:

```json
{
  "providerTaskId": "...",
  "status": "...",
  "outputUrl": "...",
  "providerVideoUrl": "...",
  "rawResponse": {},
  "metadata": {}
}
```

Async video completion flow:

1. Provider reaches succeeded state.
2. Parse `providerVideoUrl`.
3. Persist to COS if COS env exists.
4. If COS env is missing, use provider URL temporarily and mark `isTemporaryProviderUrl = true`.
5. Update `generation_tasks.output_url`.
6. Update `generation_history.output_url`.
7. Update canvas node `previewUrl` / `outputUrl`.
8. Set loading false.

## Error Shape

Unified error shape:

```json
{
  "code": "...",
  "message": "...",
  "providerType": "official | openai_compatible",
  "providerFamily": "...",
  "providerId": "...",
  "modelId": "...",
  "capability": "...",
  "stage": "...",
  "rawResponse": {},
  "requestId": "...",
  "taskId": "..."
}
```

Official errors should use `OFFICIAL_*`; OpenAI-compatible errors should use `PROVIDER_*`.
