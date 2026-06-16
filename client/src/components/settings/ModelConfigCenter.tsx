import { useEffect, useMemo, useState } from "react";
import { Check, CreditCard, Image, KeyRound, Loader2, MessageSquare, Plus, RefreshCw, Trash2, Video, WalletCards } from "lucide-react";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { modelConfigApi } from "../../services/modelConfigApi";
import { useModelConfigStore } from "../../store/modelConfigStore";
import { fallbackModelCatalog } from "../../data/modelCatalog";
import type { ModelCapabilities, ModelCatalogItem, ModelConfig, ModelType } from "../../types/model";

type ApiMode = "platform" | "custom";
type ModelCategory = "image" | "video" | "text";
const lastApiRouteStorageKey = "aigcnong-last-custom-api-route";

const categoryMeta: Record<ModelCategory, { label: string; icon: typeof Image; activeClass: string }> = {
  image: { label: "图文模型", icon: Image, activeClass: "border-cyan-200/30 bg-cyan-300/[0.10] text-cyan-100" },
  video: { label: "视频模型", icon: Video, activeClass: "border-violet-200/30 bg-violet-300/[0.10] text-violet-100" },
  text: { label: "文本模型", icon: MessageSquare, activeClass: "border-emerald-200/30 bg-emerald-300/[0.10] text-emerald-100" }
};

const defaultImageCapabilities: ModelCapabilities = {
  inputModes: ["text-to-image", "image-to-image", "image-edit"],
  imageAspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2", "21:9"],
  imageSizes: ["auto", "1024x1024", "1536x1024", "1024x1536", "1920x1080", "1080x1920"],
  imageQualities: ["auto", "standard", "high"],
  imageFormats: ["png", "jpeg", "webp"],
  supportsImageInput: true,
  supportsMultiImageInput: true,
  supportsReferenceImage: true
};

const defaultTextCapabilities: ModelCapabilities = {
  inputModes: ["text"],
  contextWindow: 128000
};

const defaultVideoCapabilities: ModelCapabilities = {
  inputModes: ["text-to-video", "image-to-video", "reference-to-video", "video-to-video"],
  duration: { type: "enum", values: [4, 5, 6, 8, 10, 15] },
  aspectRatios: ["16:9", "9:16", "1:1", "3:4", "4:3", "21:9"],
  resolutions: ["480p", "720p", "1080p"],
  provider: "custom",
  channel: "proxy",
  apiFamily: "openai_videos",
  createEndpoint: "/v1/videos",
  endpoint: "/v1/videos",
  pollEndpoint: "/v1/videos/{taskId}",
  authType: "bearer",
  requestFormat: "json",
  taskMode: "async",
  idField: "id",
  taskIdField: "id",
  statusField: "status",
  resultField: "result",
  supportedInputs: ["text", "image"],
  imageTransport: "base64_json",
  supportedAspectRatios: ["16:9", "9:16", "1:1", "3:4", "4:3", "21:9"],
  supportedDurations: [4, 5, 6, 8, 10, 15],
  supportedResolutions: ["480p", "720p", "1080p"],
  supportsImageInput: true,
  supportsReferenceImage: true,
  supportsMultiImageInput: true,
  supportsVideoInput: true
};

const seedanceCapabilities: ModelCapabilities = {
  ...defaultVideoCapabilities,
  provider: "doubao",
  apiFamily: "seedance2_native",
  createEndpoint: "/v1/video/generations",
  endpoint: "/v1/video/generations",
  pollEndpoint: "/v1/video/generations/{taskId}",
  imageTransport: "url_or_asset",
  idField: "task_id",
  taskIdField: "task_id",
  duration: { type: "enum", values: [0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
  aspectRatios: ["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"],
  resolutions: ["480P", "720P", "1080P"],
  supportedAspectRatios: ["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"],
  supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  supportedResolutions: ["480P", "720P", "1080P"],
  inputModes: ["text-to-video", "image-to-video", "first-last-frame", "reference-to-video", "video-to-video"],
  supportedInputs: ["text", "image", "first_frame", "reference_image", "first_last_frame"],
  supportsFirstLastFrame: true,
  supportsAudio: true,
  maxReferenceImages: 9,
  maxReferenceVideos: 3,
  maxReferenceAudios: 3,
  maxReferenceFiles: 12
};

const veoCapabilities: ModelCapabilities = {
  ...defaultVideoCapabilities,
  provider: "veo",
  apiFamily: "openai_videos",
  createEndpoint: "/v1/videos",
  endpoint: "/v1/videos",
  pollEndpoint: "/v1/videos/{taskId}",
  duration: { type: "enum", values: [4, 6, 8, 10] },
  aspectRatios: ["16:9", "9:16"],
  resolutions: ["720p", "1080p", "4k"],
  supportedAspectRatios: ["16:9", "9:16"],
  supportedDurations: [4, 6, 8, 10],
  supportedResolutions: ["720p", "1080p", "4k"],
  inputModes: ["text-to-video", "image-to-video", "first-last-frame", "reference-to-video", "video-to-video"],
  supportedInputs: ["text", "image", "first_last_frame"],
  supportsFirstLastFrame: true,
  supportsAudio: true,
  maxReferenceImages: 5
};

function videoCapabilitiesFor(modelName: string): ModelCapabilities {
  const name = modelName.toLowerCase();
  if (/omni[-_]?fast[-_]?v2v/.test(name)) {
    return {
      ...veoCapabilities,
      apiFamily: "omni_fast_v2v",
      imageTransport: "unsupported",
      videoTransport: "url_or_base64_json",
      videoField: "video",
      inputModes: ["video-to-video"],
      supportedInputs: ["video"],
      supportsVideoInput: true,
      supportsImageInput: false,
      supportsReferenceImage: false,
      maxReferenceImages: 0,
      maxReferenceVideos: 1
    };
  }
  if (/omni[-_]?fast|omni[-_]?flash/.test(name)) {
    return {
      ...veoCapabilities,
      apiFamily: "omni_fast",
      imageTransport: "url",
      imageField: "first_image_url",
      inputModes: ["text-to-video", "image-to-video"],
      supportedInputs: ["text", "image", "first_frame"],
      supportsImageInput: true,
      supportsReferenceImage: true,
      maxReferenceImages: 1
    };
  }
  if (/doubao[-_]?seedance[-_]?1[-_]?5/.test(name)) {
    return {
      ...defaultVideoCapabilities,
      provider: "doubao",
      apiFamily: "doubao_seedance15",
      createEndpoint: "/v1/videos",
      endpoint: "/v1/videos",
      pollEndpoint: "/v1/videos/{taskId}",
      requestFormat: "multipart",
      imageTransport: "multipart_file",
      imageField: "first_frame_image",
      duration: { type: "range", min: 4, max: 11, step: 1 },
      supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11],
      inputModes: ["text-to-video", "image-to-video", "first-last-frame"],
      supportedInputs: ["text", "image", "first_frame", "first_last_frame"],
      supportsImageInput: true,
      supportsFirstLastFrame: true,
      maxReferenceImages: 2
    };
  }
  if (/doubao[-_]?seedance[-_]?2[-_]?0|seedance[-_ .]?2/.test(name)) return seedanceCapabilities;
  if (/kling|可灵/.test(name)) {
    const noReference = /(?:^|[-_])noref(?:$|[-_])/.test(name);
    return {
      ...defaultVideoCapabilities,
      provider: "kling",
      apiFamily: "aigc_video_json",
      createEndpoint: "/v1/videos",
      endpoint: "/v1/videos",
      pollEndpoint: "/v1/videos/{taskId}",
      requestFormat: "json",
      imageTransport: noReference ? "unsupported" : "url_or_asset",
      imageField: "image",
      inputModes: noReference ? ["text-to-video"] : ["text-to-video", "image-to-video", "first-last-frame"],
      supportedInputs: noReference ? ["text"] : ["text", "image", "first_frame", "first_last_frame"],
      supportsImageInput: !noReference,
      supportsReferenceImage: !noReference,
      supportsFirstLastFrame: !noReference,
      maxReferenceImages: noReference ? 0 : 2
    };
  }
  if (/\/v1\/video\/create|unified|vidu/.test(name)) {
    return {
      ...defaultVideoCapabilities,
      apiFamily: "unified_video_create",
      createEndpoint: "/v1/video/create",
      endpoint: "/v1/video/create",
      pollEndpoint: "/v1/video/query?id={taskId}",
      imageTransport: "url",
      supportedInputs: ["text", "image"],
      supportsImageInput: true,
      supportsReferenceImage: true
    };
  }
  if (/veo|gemini/.test(name)) return veoCapabilities;
  return defaultVideoCapabilities;
}

function videoCapabilitiesForChannel(modelName: string, baseUrl: string): ModelCapabilities {
  const capabilities = videoCapabilitiesFor(modelName);
  if (/runapi\.co/i.test(baseUrl)) {
    return {
      ...capabilities,
      channel: "proxy",
      apiFamily: "unified_video_create",
      createEndpoint: "/v1/video/create",
      endpoint: "/v1/video/create",
      pollEndpoint: "/v1/videos/{taskId}",
      requestFormat: "json",
      imageTransport: capabilities.supportedInputs?.some((input) => ["image", "first_frame", "reference_image", "first_last_frame"].includes(input)) ? "url" : "unsupported",
      videoTransport: capabilities.supportedInputs?.includes("video") ? "url_or_base64_json" : capabilities.videoTransport
    };
  }
  return capabilities;
}

function pickChannelCapability(capabilities: ModelCapabilities): NonNullable<ModelCapabilities["channelCapability"]> {
  return {
    provider: capabilities.provider,
    channel: capabilities.channel,
    apiFamily: capabilities.apiFamily,
    endpoint: capabilities.endpoint,
    createEndpoint: capabilities.createEndpoint,
    pollEndpoint: capabilities.pollEndpoint,
    authType: capabilities.authType,
    requestFormat: capabilities.requestFormat,
    taskMode: capabilities.taskMode,
    idField: capabilities.idField,
    taskIdField: capabilities.taskIdField,
    statusField: capabilities.statusField,
    resultField: capabilities.resultField,
    supportedInputs: capabilities.supportedInputs,
    imageTransport: capabilities.imageTransport,
    videoTransport: capabilities.videoTransport,
    imageField: capabilities.imageField,
    videoField: capabilities.videoField
  };
}

function modelCapabilityFor(capabilities: ModelCapabilities, officialModelKey: string): NonNullable<ModelCapabilities["modelCapability"]> {
  const inputModes = new Set(capabilities.inputModes ?? []);
  return {
    model: officialModelKey,
    supportsTextToVideo: inputModes.has("text-to-video"),
    supportsImageToVideo: inputModes.has("image-to-video") || inputModes.has("reference-to-video") || inputModes.has("first-last-frame"),
    supportsFirstLastFrame: inputModes.has("first-last-frame") || Boolean(capabilities.supportsFirstLastFrame),
    supportsVideoToVideo: inputModes.has("video-to-video") || Boolean(capabilities.supportsVideoInput)
  };
}

const officialVideoCatalog = fallbackModelCatalog.filter((item) => item.category === "video");

const officialAliasRules: Array<{ id: string; test: RegExp }> = [
  { id: "google-veo-3-1-fast", test: /\bveo[-_ .]?3[-_ .]?1(?:[-_ .]?fast|_fast)|veo_3_1-fast/i },
  { id: "google-veo-3-1-lite", test: /\bveo[-_ .]?3[-_ .]?1[-_ .]?lite/i },
  { id: "google-veo-3-1", test: /\bveo[-_ .]?3[-_ .]?1|veo_3_1/i },
  { id: "google-veo-3", test: /\bveo[-_ .]?3\b|veo_3\b/i },
  { id: "google-veo-2", test: /\bveo[-_ .]?2\b|veo_2\b/i },
  { id: "google-omni-flash-10s", test: /\bomni[-_ .]?(?:fast|flash)\b/i },
  { id: "seedance-2-0-fast", test: /doubao[-_]?seedance[-_]?2[-_]?0[-_]?fast|seedance[-_ .]?2[-_ .]?0[-_ .]?fast/i },
  { id: "seedance-2-0", test: /doubao[-_]?seedance[-_]?2[-_]?0|seedance[-_ .]?2/i },
  { id: "seedance-1-5-pro", test: /doubao[-_]?seedance[-_]?1[-_]?5|seedance[-_ .]?1[-_ .]?5/i },
  { id: "kling-3-0", test: /kling[-_ .]?3[-_ .]?0|kling[-_ .]?v3|可灵.*3/i },
  { id: "kling-2-6", test: /kling[-_ .]?2[-_ .]?6|kling[-_ .]?v2[-_ .]?6/i },
  { id: "kling-2-5", test: /kling[-_ .]?2[-_ .]?5|kling[-_ .]?v2[-_ .]?5/i },
  { id: "kling-2-1-master", test: /kling[-_ .]?2[-_ .]?1[-_ .]?master|kling[-_ .]?v2[-_ .]?1[-_ .]?master/i },
  { id: "kling-2-1", test: /kling[-_ .]?2[-_ .]?1|kling[-_ .]?v2[-_ .]?1/i },
  { id: "kling-1-6", test: /kling[-_ .]?1[-_ .]?6|kling[-_ .]?v1[-_ .]?6/i },
  { id: "kling-1-5", test: /kling[-_ .]?1[-_ .]?5|kling[-_ .]?v1[-_ .]?5/i },
  { id: "kling-1", test: /kling[-_ .]?1(?:\b|[-_])|kling[-_ .]?v1(?:\b|[-_])/i },
  { id: "grok-imagine-video-1-5-preview", test: /grok[-_ .]?imagine[-_ .]?video[-_ .]?1[-_ .]?5/i },
  { id: "grok-imagine-video", test: /grok[-_ .]?imagine[-_ .]?video/i },
  { id: "grok-video-3-max", test: /grok[-_ .]?video[-_ .]?3[-_ .]?max/i },
  { id: "grok-video-3-pro", test: /grok[-_ .]?video[-_ .]?3[-_ .]?pro/i },
  { id: "grok-video-3", test: /grok[-_ .]?video[-_ .]?3/i },
  { id: "grok-1-5-video-15s", test: /grok[-_ .]?1[-_ .]?5[-_ .]?video[-_ .]?15s/i },
  { id: "grok-1-5-video-10s", test: /grok[-_ .]?1[-_ .]?5[-_ .]?video[-_ .]?10s/i },
  { id: "grok-1-5-video-6s", test: /grok[-_ .]?1[-_ .]?5[-_ .]?video[-_ .]?6s/i },
  { id: "alibaba-wan-2-7-i2v-official", test: /wan2?[-_ .]?7.*(?:i2v|image|图生|r2v)/i },
  { id: "alibaba-wan-2-7-t2v-official", test: /wan2?[-_ .]?7.*(?:t2v|text|文生)/i },
  { id: "alibaba-wan-2-7-videoedit", test: /wan2?[-_ .]?7.*(?:videoedit|video[-_ .]?edit|edit|编辑)/i }
];

function normalizeModelKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function officialTemplateFor(upstreamModelName: string): ModelCatalogItem | undefined {
  const normalized = normalizeModelKey(upstreamModelName);
  const exact = officialVideoCatalog.find((item) => normalizeModelKey(item.name) === normalized || normalizeModelKey(item.id) === normalized);
  if (exact) return exact;
  const matched = officialAliasRules.find((rule) => rule.test.test(upstreamModelName));
  return matched ? officialVideoCatalog.find((item) => item.id === matched.id) : undefined;
}

function mergeOfficialAndChannelCapabilities(official: ModelCatalogItem | undefined, upstreamModelName: string, baseUrl: string) {
  const channelCapabilities = videoCapabilitiesForChannel(upstreamModelName, baseUrl);
  const officialCapabilities = official?.capabilities ?? channelCapabilities;
  return {
    ...officialCapabilities,
    modelCapability: modelCapabilityFor(officialCapabilities, official?.id ?? upstreamModelName),
    channelCapability: pickChannelCapability(channelCapabilities)
  } satisfies ModelCapabilities;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请确认后端服务已启动。";
}

function normalizeBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  try {
    const url = new URL(normalized);
    if (!url.pathname || url.pathname === "/") return `${url.origin}/v1`;
  } catch {
    return normalized;
  }
  return normalized;
}

function apiHost(value?: string) {
  if (!value) return "";
  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  }
}

function classifyModel(modelName: string): ModelCategory {
  const official = officialTemplateFor(modelName);
  if (official?.category === "video") return "video";
  const name = modelName.toLowerCase();
  if (/seedance|kling|veo|omni|grok.*video|grok-.*video|sora|vidu|jimeng-video|hailuo|hunyuan|wan\d|qwen-video|video/.test(name)) return "video";
  if (/seedream|gpt-image|dall-e|imagen|image-preview|grok.*image|jimeng-(?!video)|flux|recraft|ideogram|midjourney|image|图像|图片/.test(name)) return "image";
  return "text";
}

function inferModel(modelName: string): Pick<ModelConfig, "provider" | "providerId" | "category" | "modelType" | "capabilities" | "displayName"> {
  const name = modelName.toLowerCase();
  const official = officialTemplateFor(modelName);
  if (official) {
    return {
      provider: official.provider,
      providerId: official.providerId,
      category: official.category,
      modelType: official.modelType,
      capabilities: official.capabilities,
      displayName: official.displayName
    };
  }
  const category = classifyModel(modelName);
  if (category === "image") {
    const isGeminiImage = /gemini.*image|image.*gemini/.test(name);
    return {
      provider: isGeminiImage ? "Gemini 图像中转" : "OpenAI 兼容图像中转",
      providerId: isGeminiImage ? "google" : "openai",
      category,
      modelType: "text-to-image",
      capabilities: defaultImageCapabilities,
      displayName: displayNameFor(modelName)
    };
  }
  if (category === "text") {
    return {
      provider: "OpenAI 兼容文本中转",
      providerId: "deepseek",
      category,
      modelType: "text",
      capabilities: defaultTextCapabilities,
      displayName: displayNameFor(modelName)
    };
  }
  const capabilities = videoCapabilitiesFor(modelName);
  return {
    provider: "OpenAI 兼容视频中转",
    providerId: "openai-video",
    category,
    modelType: /grok|xai/.test(name) ? "text-to-video" : "image-to-video",
    capabilities,
    displayName: displayNameFor(modelName)
  };
}

function displayNameFor(modelName: string) {
  return officialTemplateFor(modelName)?.displayName ?? modelName;
}

function uniqueModels(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function StatusMessage({ message, tone = "muted" }: { message: string; tone?: "muted" | "success" | "danger" }) {
  if (!message) return null;
  const color = tone === "success" ? "text-emerald-200" : tone === "danger" ? "text-red-200" : "text-white/45";
  return <div className={`text-[12px] leading-5 ${color}`}>{message}</div>;
}

type FetchedModelGroup = {
  key: string;
  label: string;
  category: ModelCategory;
  models: string[];
  official?: ModelCatalogItem;
};

type EnabledModelGroup = {
  key: string;
  label: string;
  models: ModelConfig[];
};

function groupFetchedModels(models: string[]): FetchedModelGroup[] {
  const groups = new Map<string, FetchedModelGroup>();
  for (const model of models) {
    const category = classifyModel(model);
    const official = officialTemplateFor(model);
    const key = official ? `${category}:official:${official.id}` : `${category}:raw:${model}`;
    const existing = groups.get(key);
    if (existing) {
      existing.models.push(model);
      continue;
    }
    groups.set(key, {
      key,
      label: official?.displayName ?? model,
      category,
      models: [model],
      official
    });
  }
  return Array.from(groups.values());
}

function groupSelectionState(group: FetchedModelGroup, selectedModels: Set<string>) {
  const selectedCount = group.models.filter((model) => selectedModels.has(model)).length;
  return {
    selectedCount,
    allSelected: selectedCount === group.models.length,
    partiallySelected: selectedCount > 0 && selectedCount < group.models.length
  };
}

function groupEnabledModels(models: ModelConfig[]): EnabledModelGroup[] {
  const groups = new Map<string, EnabledModelGroup>();
  for (const model of models) {
    const modelName = model.modelName || model.displayName || model.id;
    const official = officialTemplateFor(modelName);
    const modelCapability = model.capabilities?.modelCapability?.model;
    const baseLabel = official?.displayName || model.displayName || model.modelName;
    const host = apiHost(model.apiBaseUrl);
    const label = host ? `${baseLabel} · ${host}` : baseLabel;
    const channelKey = model.apiBaseUrl?.trim().replace(/\/+$/, "").toLowerCase() || model.providerId || model.provider || "default";
    const key = official ? `official:${official.id}:${channelKey}` : modelCapability ? `capability:${modelCapability}:${channelKey}` : `raw:${baseLabel}:${channelKey}`;
    const existing = groups.get(key);
    if (existing) {
      existing.models.push(model);
      continue;
    }
    groups.set(key, { key, label, models: [model] });
  }
  return Array.from(groups.values());
}

function savedApiRoutes(models: ModelConfig[]) {
  const routes = new Map<string, { baseUrl: string; host: string; count: number; updatedAt: number }>();
  for (const model of models) {
    const baseUrl = normalizeBaseUrl(model.apiBaseUrl);
    if (!baseUrl) continue;
    const key = baseUrl.toLowerCase();
    const existing = routes.get(key);
    const updatedAt = model.updatedAt ?? model.createdAt ?? 0;
    if (existing) {
      existing.count += 1;
      existing.updatedAt = Math.max(existing.updatedAt, updatedAt);
      continue;
    }
    routes.set(key, { baseUrl, host: apiHost(baseUrl) || baseUrl, count: 1, updatedAt });
  }
  return Array.from(routes.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function ModelConfigCenter() {
  const { modelConfigs, fetchModelConfigs, saveModelConfigsBulk, deleteModelConfigs } = useModelConfigStore();
  const [mode, setMode] = useState<ApiMode>("custom");
  const [apiBaseUrl, setApiBaseUrl] = useState("https://ai.cy88.ai/v1");
  const [apiKey, setApiKey] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<ModelCategory>("image");
  const [busy, setBusy] = useState<"pull" | "save" | "delete" | "">("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"muted" | "success" | "danger">("muted");

  useEffect(() => {
    fetchModelConfigs().catch(() => {
      setMessage("无法连接后端服务，模型配置需要后端加密保存。");
      setMessageTone("danger");
    });
  }, [fetchModelConfigs]);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(lastApiRouteStorageKey) : "";
    if (saved) setApiBaseUrl(saved);
  }, []);

  const videoConfigs = useMemo(() => modelConfigs.filter((model) => model.category === "video" || ["text-to-video", "image-to-video", "video-to-video"].includes(model.modelType)), [modelConfigs]);
  const imageConfigs = useMemo(() => modelConfigs.filter((model) => model.category === "image" || ["text-to-image", "image-to-image", "image-edit", "image"].includes(model.modelType)), [modelConfigs]);
  const textConfigs = useMemo(() => modelConfigs.filter((model) => model.category === "text" || model.modelType === "text"), [modelConfigs]);
  const apiRoutes = useMemo(() => savedApiRoutes(modelConfigs), [modelConfigs]);
  const categorizedFetchedModels = useMemo(() => ({
    image: fetchedModels.filter((model) => classifyModel(model) === "image"),
    video: fetchedModels.filter((model) => classifyModel(model) === "video"),
    text: fetchedModels.filter((model) => classifyModel(model) === "text")
  }), [fetchedModels]);
  const groupedFetchedModels = useMemo(() => ({
    image: groupFetchedModels(categorizedFetchedModels.image),
    video: groupFetchedModels(categorizedFetchedModels.video),
    text: groupFetchedModels(categorizedFetchedModels.text)
  }), [categorizedFetchedModels]);
  const selectedGroupCount = useMemo(() => {
    return (Object.keys(groupedFetchedModels) as ModelCategory[]).reduce((count, category) => {
      return count + groupedFetchedModels[category].filter((group) => group.models.some((model) => selectedModels.has(model))).length;
    }, 0);
  }, [groupedFetchedModels, selectedModels]);

  function toggleModelGroup(group: FetchedModelGroup) {
    setSelectedModels((current) => {
      const next = new Set(current);
      const allSelected = group.models.every((model) => next.has(model));
      for (const model of group.models) {
        if (allSelected) next.delete(model);
        else next.add(model);
      }
      return next;
    });
  }

  function selectCategory(category: ModelCategory, selected: boolean) {
    setSelectedModels((current) => {
      const next = new Set(current);
      for (const model of categorizedFetchedModels[category]) {
        if (selected) next.add(model);
        else next.delete(model);
      }
      return next;
    });
  }

  async function deleteModelIds(ids: string[]) {
    if (!ids.length) return;
    setBusy("delete");
    try {
      const result = await deleteModelConfigs(ids);
      setMessage(`已删除 ${result.deletedCount} 个模型配置。`);
      setMessageTone("success");
    } finally {
      setBusy("");
    }
  }

  async function pullModels() {
    setBusy("pull");
    setMessage("");
    try {
      const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl);
      const result = await modelConfigApi.probe({ apiBaseUrl: normalizedBaseUrl, apiKey, validationPath: "/models", pullModels: true });
      if (typeof window !== "undefined") window.localStorage.setItem(lastApiRouteStorageKey, normalizedBaseUrl);
      setApiBaseUrl(normalizedBaseUrl);
      setMessage(result.message);
      setMessageTone(result.success ? "success" : "danger");
      if (result.models.length) {
        setFetchedModels(result.models);
        const autoSelectedModels = result.models.filter((model) => classifyModel(model) !== "video" || officialTemplateFor(model));
        const skippedVideoCount = result.models.filter((model) => classifyModel(model) === "video" && !officialTemplateFor(model)).length;
        setSelectedModels(new Set(autoSelectedModels));
        if (skippedVideoCount > 0) {
          setMessage(`${result.message} 已默认勾选官方可识别模型；${skippedVideoCount} 个未知视频模型需手动确认后启用。`);
        }
        const firstCategory = (["image", "video", "text"] as ModelCategory[]).find((category) => result.models.some((model) => classifyModel(model) === category));
        if (firstCategory) setActiveCategory(firstCategory);
      }
    } catch (error) {
      setMessage(errorText(error));
      setMessageTone("danger");
    } finally {
      setBusy("");
    }
  }

  async function saveModels() {
    const models = uniqueModels([...selectedModels, ...manualModel.split(/[\n,，\s]+/)]);
    if (!normalizeBaseUrl(apiBaseUrl) || !apiKey.trim() || models.length === 0) {
      setMessage("请填写请求地址、API Key，并至少选择或添加一个模型。");
      setMessageTone("danger");
      return;
    }
    setBusy("save");
    setMessage("");
    try {
      const payloads = models.map((modelName) => {
        const inferred = inferModel(modelName);
        const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl);
        const official = officialTemplateFor(modelName);
        return {
          providerId: inferred.providerId,
          provider: inferred.provider,
          category: inferred.category,
          displayName: inferred.displayName,
          apiBaseUrl: normalizedBaseUrl,
          requiresApiBaseUrl: true,
          apiKey: apiKey.trim(),
          modelName,
          modelType: inferred.modelType as ModelType,
          enabled: true,
          capabilities: inferred.category === "video" ? mergeOfficialAndChannelCapabilities(official, modelName, normalizedBaseUrl) : inferred.capabilities
        } satisfies Partial<ModelConfig> & { apiKey?: string };
      });
      const result = await saveModelConfigsBulk(payloads, false);
      const savedRoute = normalizeBaseUrl(apiBaseUrl);
      if (typeof window !== "undefined") window.localStorage.setItem(lastApiRouteStorageKey, savedRoute);
      setApiBaseUrl(savedRoute);
      setManualModel("");
      const counts = models.reduce((result, model) => {
        result[classifyModel(model)] += 1;
        return result;
      }, { image: 0, video: 0, text: 0 });
      setMessage(`同步成功：新增 ${result.createdCount} 个、更新 ${result.updatedCount} 个。其它中转线路已保留，可在节点模型下拉里按线路切换。视频模型按官方名称/能力归一，实际请求仍使用上游模型 ID。当前保存：图文 ${counts.image}、视频 ${counts.video}、文本 ${counts.text}。`);
      setMessageTone("success");
    } catch (error) {
      setMessage(errorText(error));
      setMessageTone("danger");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <section className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#101114]/95 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="grid min-h-[620px] grid-cols-[240px_1fr]">
          <aside className="border-r border-white/[0.08] bg-black/25 p-5">
            <div className="text-[14px] font-semibold tracking-[0.04em] text-white">AIGC｜创作平台</div>
            <div className="mt-8 space-y-2">
              <button type="button" className="flex h-11 w-full items-center gap-3 rounded-[12px] px-3 text-left text-[13px] text-white/45">
                <WalletCards size={16} /> 充值中心
              </button>
              <button type="button" className="flex h-11 w-full items-center gap-3 rounded-[12px] bg-[#6d34d8]/25 px-3 text-left text-[13px] text-white">
                <KeyRound size={16} /> API 接入
              </button>
            </div>
            <div className="mt-auto pt-[360px]">
              <button type="button" className="h-10 w-full rounded-full border border-white/[0.08] bg-white/[0.03] text-[12px] text-white/60">联系客服</button>
              <p className="mt-3 text-[11px] leading-5 text-white/25">支付接口已预留，默认可使用平台 API 充值付费。</p>
            </div>
          </aside>

          <div className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[22px] font-semibold text-white">API 接入</h2>
                <p className="mt-1 text-[13px] text-white/40">填写上游地址和 API Key；视频模型按官方名称与能力归一，上游模型 ID 仅作为实际请求名。</p>
              </div>
              <div className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-1.5 text-[12px] text-emerald-100">
                {imageConfigs.length + videoConfigs.length + textConfigs.length} 个模型已启用
              </div>
            </div>

            <div className="mt-6 rounded-[18px] border border-white/[0.08] bg-white/[0.025] p-3">
              <div className="grid grid-cols-2 rounded-[14px] border border-white/[0.08] bg-black/20 p-1">
                <button type="button" onClick={() => setMode("custom")} className={`flex h-12 items-center justify-center gap-2 rounded-[12px] text-[13px] font-semibold transition ${mode === "custom" ? "bg-[#8b3ff5] text-white shadow-[0_10px_30px_rgba(139,63,245,0.25)]" : "text-white/45"}`}>
                  <KeyRound size={16} /> 使用 API 接口
                </button>
                <button type="button" onClick={() => setMode("platform")} className={`flex h-12 items-center justify-center gap-2 rounded-[12px] text-[13px] font-semibold transition ${mode === "platform" ? "bg-white text-black" : "text-white/45"}`}>
                  <CreditCard size={16} /> 使用平台余额
                </button>
              </div>
            </div>

            {mode === "platform" ? (
              <div className="mt-4 rounded-[18px] border border-white/[0.08] bg-[#151519] p-6">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-cyan-300/10 text-cyan-100"><CreditCard size={20} /></div>
                  <div>
                    <div className="text-[15px] font-semibold text-white">平台 API 与充值付费</div>
                    <p className="mt-1 text-[12px] text-white/40">接口位置已预留，后续接支付后客户无需自带 Key。</p>
                  </div>
                </div>
                <Button className="mt-5 h-10 rounded-full" variant="primary" disabled>充值入口待接入</Button>
              </div>
            ) : (
              <div className="mt-4 rounded-[18px] border border-white/[0.08] bg-[#151519]">
                <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
                  <div>
                    <div className="text-[15px] font-semibold text-white">自定义 API 线路</div>
                    <p className="mt-1 text-[12px] text-white/38">/models 只用于发现上游模型 ID；功能参数来自官方模型模板，通道协议来自当前上游配置。</p>
                  </div>
                  <Button className="h-9 rounded-full bg-white text-black hover:bg-white/90" onClick={() => void saveModels()} disabled={busy === "save"}>
                    {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} 保存并启用
                  </Button>
                </div>

                <div className="space-y-5 p-5">
                  <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr_auto]">
                    <label className="space-y-2">
                      <span className="text-[12px] font-medium text-white/50">上游请求地址</span>
                      <Input className="h-11 rounded-[11px] bg-black/35" value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} placeholder="https://example.com/v1" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-[12px] font-medium text-white/50">API Key</span>
                      <Input className="h-11 rounded-[11px] bg-black/35" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." />
                    </label>
                    <div className="flex items-end">
                      <Button className="h-11 rounded-full" onClick={() => void pullModels()} disabled={busy === "pull" || !apiBaseUrl || !apiKey}>
                        {busy === "pull" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} 拉取模型
                      </Button>
                    </div>
                  </div>
                  {apiRoutes.length > 0 && (
                    <div className="rounded-[14px] border border-white/[0.06] bg-black/20 p-3">
                      <div className="mb-2 text-[11px] font-medium text-white/42">已保存 API 线路，点击可回填当前输入框</div>
                      <div className="flex flex-wrap gap-2">
                        {apiRoutes.map((route) => {
                          const active = normalizeBaseUrl(apiBaseUrl).toLowerCase() === route.baseUrl.toLowerCase();
                          return (
                            <button
                              key={route.baseUrl}
                              type="button"
                              title={route.baseUrl}
                              onClick={() => {
                                setApiBaseUrl(route.baseUrl);
                                if (typeof window !== "undefined") window.localStorage.setItem(lastApiRouteStorageKey, route.baseUrl);
                              }}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition ${active ? "border-violet-200/35 bg-violet-300/[0.14] text-violet-50" : "border-white/[0.08] bg-white/[0.035] text-white/50 hover:bg-white/[0.07] hover:text-white/75"}`}
                            >
                              <span>{route.host}</span>
                              <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] text-white/45">{route.count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <StatusMessage message={message} tone={messageTone} />

                  <div className="rounded-[16px] border border-white/[0.08] bg-black/20 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <div className="text-[13px] font-semibold text-white">模型列表</div>
                        <div className="mt-1 text-[11px] text-white/35">同名官方模型会按当前上游线路保存；其它已保存中转不会被覆盖或删除。</div>
                      </div>
                      <div className="rounded-full bg-white/[0.06] px-2 py-1 text-[11px] text-white/45">已选 {selectedGroupCount} 组 · {selectedModels.size} / {fetchedModels.length} 上游</div>
                    </div>
                    {fetchedModels.length ? (
                      <div>
                        <div className="grid grid-cols-3 gap-1 rounded-[12px] border border-white/[0.08] bg-white/[0.025] p-1">
                          {(Object.keys(categoryMeta) as ModelCategory[]).map((category) => {
                            const meta = categoryMeta[category];
                            const Icon = meta.icon;
                            const count = groupedFetchedModels[category].length;
                            return (
                              <button
                                key={category}
                                type="button"
                                onClick={() => setActiveCategory(category)}
                                className={`flex h-10 items-center justify-center gap-2 rounded-[9px] text-[12px] transition ${activeCategory === category ? "bg-white/[0.09] text-white" : "text-white/40 hover:text-white/65"}`}
                              >
                                <Icon size={14} /> {meta.label}
                                <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px]">{count}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <div className="text-[11px] text-white/30">
                            当前分类：{groupedFetchedModels[activeCategory].length} 组官方模型 · {categorizedFetchedModels[activeCategory].length} 个上游 ID
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => selectCategory(activeCategory, true)} className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[11px] text-white/55 hover:bg-white/[0.06] hover:text-white">全选当前</button>
                            <button type="button" onClick={() => selectCategory(activeCategory, false)} className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[11px] text-white/45 hover:bg-white/[0.06] hover:text-white">取消当前</button>
                          </div>
                        </div>
                        <div className="mt-3 flex min-h-[92px] max-h-[180px] flex-wrap content-start gap-2 overflow-auto rounded-[12px] border border-dashed border-white/[0.08] p-3">
                          {groupedFetchedModels[activeCategory].map((group) => {
                            const meta = categoryMeta[activeCategory];
                            const { selectedCount, allSelected, partiallySelected } = groupSelectionState(group, selectedModels);
                            return (
                              <button
                                key={group.key}
                                type="button"
                                title={group.models.join("\n")}
                                onClick={() => toggleModelGroup(group)}
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition ${allSelected ? meta.activeClass : partiallySelected ? "border-amber-200/35 bg-amber-300/[0.08] text-amber-100" : "border-white/[0.08] bg-white/[0.03] text-white/45"}`}
                              >
                                <span>{group.label}</span>
                                {group.models.length > 1 && (
                                  <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] text-white/55">{selectedCount}/{group.models.length}</span>
                                )}
                              </button>
                            );
                          })}
                          {!groupedFetchedModels[activeCategory].length && (
                            <div className="grid w-full place-items-center text-[12px] text-white/30">当前上游没有返回{categoryMeta[activeCategory].label}</div>
                          )}
                        </div>
                        <div className="mt-3 flex justify-end">
                          <Button className="h-10 rounded-full bg-white text-black hover:bg-white/90" onClick={() => void saveModels()} disabled={busy === "save" || selectedModels.size === 0}>
                            {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} 保存并启用 {selectedModels.size} 个模型
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[12px] leading-6 text-white/35">还没有拉取模型。填写上游请求地址和 API Key 后点击“拉取模型”；也可以手动输入上游模型 ID。</p>
                    )}
                    <div className="mt-4 flex gap-2">
                      <Input className="h-11 rounded-[11px] bg-black/35" value={manualModel} onChange={(event) => setManualModel(event.target.value)} placeholder="手动添加上游模型 ID，保存后按官方名称显示" />
                      <Button className="h-11 rounded-full" onClick={() => {
                        const models = uniqueModels(manualModel.split(/[\n,，\s]+/));
                        if (!models.length) return;
                        setFetchedModels((current) => uniqueModels([...current, ...models]));
                        setSelectedModels((current) => new Set([...current, ...models]));
                        setManualModel("");
                      }}><Plus size={15} /> 添加</Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {([
          ["image", imageConfigs],
          ["video", videoConfigs],
          ["text", textConfigs]
        ] as Array<[ModelCategory, ModelConfig[]]>).map(([category, models]) => {
          const meta = categoryMeta[category];
          const Icon = meta.icon;
          const groups = groupEnabledModels(models);
          return (
            <div key={category} className="rounded-[18px] border border-white/[0.08] bg-white/[0.025] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[14px] font-semibold text-white"><Icon size={16} /> 已启用{meta.label}</div>
                <div className="flex items-center gap-2">
                  {models.length > 0 && (
                    <button type="button" onClick={() => void deleteModelIds(models.map((model) => model.id))} disabled={busy === "delete"} className="rounded-full border border-red-200/15 px-2 py-1 text-[10px] text-red-100/70 hover:bg-red-400/10 hover:text-red-100">清空本类</button>
                  )}
                  <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] text-white/35">{groups.length} 组 · {models.length}</span>
                </div>
              </div>
              <div className="flex min-h-9 flex-wrap gap-2">
                {groups.map((group) => (
                  <span key={group.key} title={group.models.map((model) => model.modelName).join("\n")} className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/65">
                    {group.label}
                    {group.models.length > 1 && <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] text-white/45">{group.models.length}</span>}
                    <button type="button" title="删除" onClick={() => {
                      void deleteModelIds(group.models.map((model) => model.id));
                    }} disabled={busy === "delete"} className="text-white/35 hover:text-red-200"><Trash2 size={12} /></button>
                  </span>
                ))}
                {!models.length && <span className="text-[12px] text-white/35">暂无{meta.label}。</span>}
              </div>
              {category === "image" && <p className="mt-3 text-[11px] leading-5 text-white/25">仅新增中转模型配置，不修改现有图片 adapter 与图片参数。</p>}
            </div>
          );
        })}
      </section>
    </div>
  );
}
