/* eslint-disable @next/next/no-img-element -- Generated previews can be blob/data URLs or provider URLs that are not known at build time. */
"use client";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
} from "framer-motion";
import {
  Download,
  FileImage,
  History,
  Image as ImageIcon,
  Layers,
  Loader2,
  RefreshCw,
  Settings,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { type ChangeEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildDetailPrompt,
  buildMimicPrompt,
  buildPosterPrompt,
  buildTextPrompt,
} from "@/lib/prompt-builders";
import { createId } from "@/lib/id";
import { getHistoryImages, saveHistoryImages } from "@/lib/client-image-store";
import {
  detailTemplates,
  ecommercePlatforms,
  mimicCounts,
  mimicDimensions,
  mimicStrengths,
  mimicTypes,
  posterTypes,
  ratioToSize,
  platformPrompt,
  type DetailTemplateId,
  type EcommercePlatformId,
  type MimicDimension,
  type MimicStrength,
  type MimicType,
  type PosterStyle,
  type PosterType,
} from "@/lib/templates";
import { platformPresets } from "@/lib/templates/platformPresets";
import { productVariantOutputTypes } from "@/lib/templates/productVariantStyles";
import type { DetailBlueprintInput, DetailBlueprintItem, DetailLanguage, DetailMarket, DetailPlatform } from "@/types/detail";
import { defaultProductProtection, type ProductProtectionLevel } from "@/types/workflow";
import {
  qualities,
  qualityLabels,
  type ImageQuality,
  type ImageSize,
  type Ratio,
  type StyleKey,
} from "@/lib/workflow";
import {
  defaultAzureApiVersion,
  defaultGoogleBananaModel,
  defaultImageModel,
  isLegacyDallEModel,
  loadUserApiKey,
  saveUserApiKey,
  clearUserApiKey,
  userApiConfigVersionStorageKey,
  userApiConfigMigratedStorageKey,
  userImageModelStorageKey,
} from "@/lib/apiKey/userApiKey";
import { maskApiKey } from "@/lib/apiKey/maskApiKey";
import { AigcNongLogo } from "@/components/brand/AigcNongLogo";
import type { ApiProvider, UserApiKeyConfig } from "@/lib/apiKey/apiKeyTypes";
import { hasFeatureAccess } from "@/lib/license/featureAccess";
import { loadLicenseCode, saveLicenseCode } from "@/lib/license/licenseStorage";
import type { FeatureKey, LicenseStatus } from "@/lib/license/licenseTypes";
import { workflowRegistry } from "@/lib/workflows/workflowRegistry";
import type { WorkflowId } from "@/lib/workflows/workflowTypes";
import { photoPath } from "@/lib/app-path";

type TabKey = "text" | "mimic" | "product" | "variant" | "detail" | "poster";

const workflowTabMap: Record<WorkflowId, TabKey> = {
  "text-image": "text",
  "reference-mimic": "mimic",
  "product-workflow": "product",
  "product-variant": "variant",
  "detail-workflow": "detail",
  "poster-workflow": "poster",
};

const tabFeatureMap: Record<TabKey, FeatureKey> = {
  text: "text-image",
  mimic: "reference-mimic",
  product: "product-workflow",
  variant: "product-variant",
  detail: "detail-batch",
  poster: "poster",
};

const workflowTabItems = workflowRegistry.map((workflow) => ({
  ...workflow,
  tab: workflowTabMap[workflow.id],
}));

type GeneratedImage = {
  id: string;
  url: string;
  index: number;
};

type HistoryItem = {
  id: string;
  workflow: string;
  title: string;
  finalPrompt: string;
  createdAt: string;
  customerId?: string;
  outputType?: string;
  referenceThumb?: string;
  productThumb?: string;
  imageCount?: number;
};

type ServerLogEntry = {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  scope: string;
  message: string;
  detail?: string;
};

const historyKey = "ecommerce-image-workflow-history-v2";
const showWorkflowInternals = true;
const hiddenPromptText = "工作流内部提示词已隐藏。";
const legacyGenerationStorageKeys = [
  "commerce_ai_model",
  "commerce_ai_selected_model",
  "commerce_ai_selected_image_model",
  "selectedImageModel",
  "defaultImageModel",
  "imageModel",
  "selectedTextModel",
  "commerce_ai_group",
  "commerce_ai_channel",
  "commerce_ai_distributor",
  "group",
  "channel",
  "distributor",
];

const commercialRatioOptions: Array<{ value: Ratio; label: string }> = [
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "3:4", label: "3:4" },
  { value: "9:16", label: "9:16" },
  { value: "16:9", label: "16:9" },
  { value: "custom", label: "自定义" },
];

const apiProviderOptions: Array<{ value: ApiProvider; label: string; desc: string }> = [
  { value: "openai", label: "OpenAI", desc: "普通 OpenAI / 兼容接口" },
  { value: "azure", label: "Azure OpenAI", desc: "Endpoint + Deployment" },
  { value: "banana", label: "Banana", desc: "Banana 2 / Banana Pro" },
];

const bananaModelOptions = [
  { value: "banana-2", label: "Banana 2" },
  { value: "banana-pro", label: "Banana Pro" },
];

type ApiConnectionStatus = "untested" | "ok" | "error";

type UnifiedImageModel = {
  id: string;
  provider: string;
  category?: string;
  displayName: string;
  modelName: string;
  enabled: boolean;
  maskedApiKey?: string;
};

function providerDisplayName(provider: ApiProvider) {
  return apiProviderOptions.find((item) => item.value === provider)?.label || "OpenAI";
}

function isBananaProvider(provider: ApiProvider) {
  return provider === "banana";
}

function providerKeyLabel(provider: ApiProvider) {
  if (provider === "azure") return "Azure OpenAI";
  if (isBananaProvider(provider)) return "Banana";
  return "OpenAI";
}

function ratioOptions() {
  return commercialRatioOptions;
}

function inferDetailLocaleFromPrompt(prompt: string): {
  market?: DetailMarket;
  language?: DetailLanguage;
} {
  if (/巴西|Brazil|葡萄牙语|葡语|Portuguese/i.test(prompt)) {
    return { market: "巴西", language: "葡语（巴西）" };
  }
  if (/墨西哥|Mexico|西语|Spanish|Mercado Libre/i.test(prompt)) {
    return { market: "墨西哥", language: "西语（墨西哥）" };
  }
  if (/中国|天猫|京东|抖音|小红书|中文/i.test(prompt)) {
    return { market: "中国", language: "中文" };
  }
  if (/欧洲|EU|Ozon|WB|俄文|Russian/i.test(prompt)) {
    return { market: "欧洲", language: "俄文" };
  }
  if (/美国|US|USA|Amazon|英文|English/i.test(prompt)) {
    return { market: "美国", language: "英文" };
  }
  return {};
}

const emptyLicenseStatus: LicenseStatus = {
  valid: false,
  code: "",
  features: [],
  message: "当前未激活授权码",
};

function normalizeClientLicenseCode(code: string) {
  return code
    .trim()
    .replace(/[－—–]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function historyStorageKeyForLicense(code: string) {
  const normalizedCode = normalizeClientLicenseCode(code);
  return normalizedCode ? `${historyKey}-${normalizedCode}` : `${historyKey}-anonymous`;
}

function historyApiUrlForLicense(code: string) {
  const normalizedCode = normalizeClientLicenseCode(code);
  if (!normalizedCode) return photoPath("/api/history");

  const encodedCode = encodeURIComponent(normalizedCode);
  return `${photoPath("/api/history")}?licenseCode=${encodedCode}&adminCode=${encodedCode}`;
}

function getClientFallbackLicense(code: string): LicenseStatus | null {
  const normalizedCode = normalizeClientLicenseCode(code);
  void normalizedCode;
  return null;
}

async function verifyLicenseOnServer(code: string): Promise<LicenseStatus> {
  const normalizedCode = normalizeClientLicenseCode(code);
  if (!normalizedCode) {
    return emptyLicenseStatus;
  }

  try {
    const response = await fetch(photoPath("/api/license/verify"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: normalizedCode }),
    });
    const payload = (await response.json().catch(() => null)) as LicenseStatus | null;
    if (payload && typeof payload.valid === "boolean") {
      if (!payload.valid) {
        return getClientFallbackLicense(normalizedCode) || payload;
      }
      return payload;
    }
  } catch {
    // Keep the UI stable when the license API is temporarily unavailable.
  }

  const fallbackLicense = getClientFallbackLicense(normalizedCode);
  if (fallbackLicense) {
    return fallbackLicense;
  }

  return {
    ...emptyLicenseStatus,
    code: normalizedCode,
    message: "授权服务暂时不可用，请稍后重试。",
  };
}

function withPlatform(value: string, platform: EcommercePlatformId) {
  return [value.trim(), platformPrompt(platform)].filter(Boolean).join("\n");
}

function loadInitialLicenseCode() {
  if (typeof window === "undefined") return "";
  return loadLicenseCode();
}

function loadInitialApiKey(): UserApiKeyConfig {
  if (typeof window === "undefined") {
    return {
      provider: "openai",
      apiKey: "",
      baseURL: "",
      textModel: "",
      imageModel: "",
      googleBananaModel: defaultGoogleBananaModel,
      azureEndpoint: "",
      azureDeployment: "",
      azureApiVersion: defaultAzureApiVersion,
    };
  }

  return loadUserApiKey();
}

let initialApiKeyCache: UserApiKeyConfig | null = null;

function getInitialApiKey() {
  if (!initialApiKeyCache) {
    initialApiKeyCache = loadInitialApiKey();
  }
  return initialApiKeyCache;
}

export default function Home() {
  const [hasMounted, setHasMounted] = useState(false);
  const [hasEnteredStudio, setHasEnteredStudio] = useState(false);
  const [isPortalTransitioning, setIsPortalTransitioning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("text");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [finalPrompt, setFinalPrompt] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(
    null,
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const [logs, setLogs] = useState<ServerLogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [downloadingHistoryId, setDownloadingHistoryId] = useState("");
  const [historyPreviewUrls, setHistoryPreviewUrls] = useState<Record<string, string>>({});
  const [licenseCode, setLicenseCode] = useState(loadInitialLicenseCode);
  const [licenseStatus, setLicenseStatus] =
    useState<LicenseStatus>(emptyLicenseStatus);
  const [apiProvider, setApiProvider] = useState<ApiProvider>(() => getInitialApiKey().provider || "openai");
  const [userApiKey, setUserApiKey] = useState(() => getInitialApiKey().apiKey);
  const [userBaseURL, setUserBaseURL] = useState(() => getInitialApiKey().baseURL || "");
  const [userTextModel, setUserTextModel] = useState(() => getInitialApiKey().textModel || "");
  const [azureEndpoint, setAzureEndpoint] = useState(() => getInitialApiKey().azureEndpoint || "");
  const [azureDeployment, setAzureDeployment] = useState(() => {
    const initialApiKey = getInitialApiKey();
    if (initialApiKey.provider === "banana") {
      return initialApiKey.azureDeployment || initialApiKey.googleBananaModel || defaultGoogleBananaModel;
    }
    return initialApiKey.azureDeployment || initialApiKey.imageModel || defaultImageModel;
  });
  const [azureApiVersion, setAzureApiVersion] = useState(() => getInitialApiKey().azureApiVersion || defaultAzureApiVersion);
  const [apiConnectionStatus, setApiConnectionStatus] = useState<ApiConnectionStatus>("untested");
  const [apiConnectionMessage, setApiConnectionMessage] = useState("");
  const [unifiedImageModels, setUnifiedImageModels] = useState<UnifiedImageModel[]>([]);
  const [selectedUnifiedModelId, setSelectedUnifiedModelId] = useState("");
  const [unifiedModelError, setUnifiedModelError] = useState("");
  const [unifiedModelsLoaded, setUnifiedModelsLoaded] = useState(false);
  const skipNextApiResetRef = useRef(false);

  const [textPrompt, setTextPrompt] = useState("");
  const [textStyle, setTextStyle] = useState<StyleKey>("" as StyleKey);
  const [textRatio, setTextRatio] = useState<Ratio>("1:1");
  const [textSize, setTextSize] = useState<ImageSize>("1024x1024");
  const [textQuality, setTextQuality] = useState<ImageQuality>("low");
  const [textCount, setTextCount] = useState(1);
  const [textPlatform, setTextPlatform] =
    useState<EcommercePlatformId>("general");

  const [mimicReference, setMimicReference] = useState<File | null>(null);
  const [mimicProduct, setMimicProduct] = useState<File | null>(null);
  const [mimicReferencePreview, setMimicReferencePreview] = useState("");
  const [mimicProductPreview, setMimicProductPreview] = useState("");
  const [mimicReferenceThumb, setMimicReferenceThumb] = useState("");
  const [mimicProductThumb, setMimicProductThumb] = useState("");
  const [mimicProductName, setMimicProductName] = useState("");
  const [mimicSellingPoints, setMimicSellingPoints] = useState("");
  const [mimicExtra, setMimicExtra] = useState("");
  const [mimicType, setMimicType] = useState<MimicType>("产品图");
  const [mimicSelectedDimensions, setMimicSelectedDimensions] = useState<
    MimicDimension[]
  >(["模仿风格", "模仿构图", "模仿色调"]);
  const [mimicStrength, setMimicStrength] = useState<MimicStrength>("中");
  const [mimicRatio, setMimicRatio] = useState<Ratio>("1:1");
  const [mimicCount, setMimicCount] = useState(1);
  const [mimicQuality, setMimicQuality] = useState<ImageQuality>("low");
  const [mimicPlatform, setMimicPlatform] =
    useState<EcommercePlatformId>("general");
  const [mimicProtectionLevel, setMimicProtectionLevel] =
    useState<ProductProtectionLevel>("strict");

  const [productMain, setProductMain] = useState<File | null>(null);
  const [productMainPreview, setProductMainPreview] = useState("");
  const [productMainThumb, setProductMainThumb] = useState("");
  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productBrand, setProductBrand] = useState("");
  const [productSellingPoints, setProductSellingPoints] = useState("");
  const [productSpecs, setProductSpecs] = useState("");
  const [productPrompt, setProductPrompt] = useState("");
  const [productRatio, setProductRatio] = useState<Ratio>("1:1");
  const [productQuality, setProductQuality] = useState<ImageQuality>("high");
  const [productPlatform, setProductPlatform] =
    useState<EcommercePlatformId>("general");
  const [productProtectionLevel, setProductProtectionLevel] =
    useState<ProductProtectionLevel>("strict");

  const [variantProduct, setVariantProduct] = useState<File | null>(null);
  const [variantProductPreview, setVariantProductPreview] = useState("");
  const [variantProductThumb, setVariantProductThumb] = useState("");
  const [variantPrompt, setVariantPrompt] = useState("");
  const [variantOutputType, setVariantOutputType] = useState("电商主图");
  const [variantStyle, setVariantStyle] = useState("");
  const [variantRatio, setVariantRatio] = useState<Ratio>("1:1");
  const [variantCount, setVariantCount] = useState(1);
  const [variantQuality, setVariantQuality] = useState<ImageQuality>("low");
  const [variantPlatform, setVariantPlatform] =
    useState<EcommercePlatformId>("general");
  const [variantProtectionLevel, setVariantProtectionLevel] =
    useState<ProductProtectionLevel>("strict");

  const [detailProduct, setDetailProduct] = useState<File | null>(null);
  const [detailProductPreview, setDetailProductPreview] = useState("");
  const [detailProductThumb, setDetailProductThumb] = useState("");
  const [detailProductName, setDetailProductName] = useState("");
  const [detailCategory, setDetailCategory] = useState("");
  const [detailBrand, setDetailBrand] = useState("");
  const [detailSellingPoints, setDetailSellingPoints] = useState("");
  const [detailSpecs, setDetailSpecs] = useState("");
  const [detailMaterial, setDetailMaterial] = useState("");
  const [detailFunctions, setDetailFunctions] = useState("");
  const [detailPackageList, setDetailPackageList] = useState("");
  const [detailUseScenes, setDetailUseScenes] = useState("");
  const [detailAudience, setDetailAudience] = useState("");
  const [detailAfterSales, setDetailAfterSales] = useState("");
  const [detailVisualPrompt, setDetailVisualPrompt] = useState("");
  const [detailTemplate, setDetailTemplate] =
    useState<DetailTemplateId>("core-selling-point");
  const [detailRatio, setDetailRatio] = useState<Ratio>("4:5");
  const [detailQuality, setDetailQuality] = useState<ImageQuality>("low");
  const [detailPlatform, setDetailPlatform] =
    useState<EcommercePlatformId>("general");
  const [detailStep, setDetailStep] = useState(1);
  const [detailSetCount, setDetailSetCount] = useState(5);
  const [detailMarket, setDetailMarket] = useState<DetailMarket>("美国");
  const [detailLanguage, setDetailLanguage] = useState<DetailLanguage>("英文");
  const [detailWorkflowPlatform, setDetailWorkflowPlatform] =
    useState<DetailPlatform>("Amazon / 亚马逊");
  const [detailStyle, setDetailStyle] = useState("");
  const [detailTextMode, setDetailTextMode] = useState<"editable-layers" | "image-text">("editable-layers");
  const [detailBlueprints, setDetailBlueprints] = useState<DetailBlueprintItem[]>([]);

  const [posterProduct, setPosterProduct] = useState<File | null>(null);
  const [posterLogo, setPosterLogo] = useState<File | null>(null);
  const [posterProductPreview, setPosterProductPreview] = useState("");
  const [posterLogoPreview, setPosterLogoPreview] = useState("");
  const [posterProductThumb, setPosterProductThumb] = useState("");
  const [posterLogoThumb, setPosterLogoThumb] = useState("");
  const [posterProductName, setPosterProductName] = useState("");
  const [posterTitle, setPosterTitle] = useState("");
  const [posterSubtitle, setPosterSubtitle] = useState("");
  const [posterCampaignInfo, setPosterCampaignInfo] = useState("");
  const [posterType, setPosterType] = useState<PosterType>("上新");
  const [posterStyle, setPosterStyle] = useState<PosterStyle>("" as PosterStyle);
  const [posterRatio, setPosterRatio] = useState<Ratio>("4:5");
  const [posterQuality, setPosterQuality] = useState<ImageQuality>("low");
  const [posterPlatform, setPosterPlatform] =
    useState<EcommercePlatformId>("general");
  const [posterProtectionLevel, setPosterProtectionLevel] =
    useState<ProductProtectionLevel>("strict");

  const glowX = useMotionValue(-450);
  const glowY = useMotionValue(-450);
  const smoothX = useSpring(glowX, { stiffness: 54, damping: 22, mass: 0.55 });
  const smoothY = useSpring(glowY, { stiffness: 54, damping: 22, mass: 0.55 });

  useEffect(() => setHasMounted(true), []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      glowX.set(event.clientX - 450);
      glowY.set(event.clientY - 450);
    };

    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [glowX, glowY]);

  useEffect(() => {
    if (!hasMounted) return;

    const migratedMessage = localStorage.getItem(userApiConfigMigratedStorageKey);
    if (!migratedMessage) return;

    setApiConnectionStatus("untested");
    setApiConnectionMessage(migratedMessage);
    setStatus(migratedMessage);
    setShowSettings(true);
    localStorage.removeItem(userApiConfigMigratedStorageKey);
  }, [hasMounted]);

  useEffect(() => {
    if (!hasMounted) return;
    const workspaceId = localStorage.getItem("aigcnong-active-workspace") || "";
    fetch("/api/model-configs", {
      credentials: "include",
      headers: workspaceId ? { "X-Workspace-Id": workspaceId } : {},
    })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign("/login");
          return [];
        }
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.errorMessage || "统一模型配置加载失败");
        return response.json() as Promise<UnifiedImageModel[]>;
      })
      .then((models) => {
        const images = models.filter((model) => model.enabled && model.category === "image");
        setUnifiedImageModels(images);
        const saved = localStorage.getItem("aigcnong-photo-model") || "";
        const selected = images.find((model) => model.id === saved)?.id || images[0]?.id || "";
        setSelectedUnifiedModelId(selected);
        if (selected) localStorage.setItem("aigcnong-photo-model", selected);
        setUnifiedModelError(images.length ? "" : "当前工作空间还没有图片模型，请前往统一设置中心配置。");
        setUnifiedModelsLoaded(true);
      })
      .catch((error) => {
        setUnifiedModelError(error instanceof Error ? error.message : "统一模型配置加载失败");
        setUnifiedModelsLoaded(true);
      });
  }, [hasMounted]);

  const promptPreview = useMemo(() => {
    if (activeTab === "text") {
      return textPrompt
        ? buildTextPrompt({
            prompt: textPrompt,
            style: textStyle,
            ratio: textRatio,
          })
        : "";
    }

    if (activeTab === "mimic") {
      return buildMimicPrompt({
        productName: mimicProductName,
        sellingPoints: mimicSellingPoints,
        extraRequirements: withPlatform(mimicExtra, mimicPlatform),
        outputType: mimicType,
        dimensions: mimicSelectedDimensions,
        strength: mimicStrength,
        ratio: mimicRatio,
      });
    }

    if (activeTab === "product") {
      return [
        "产品图工作流",
        `产品：${productName || "根据上传产品图判断"}`,
        `品类：${productCategory || "未填写"}`,
        productBrand ? `品牌：${productBrand}` : "",
        productSellingPoints ? `卖点：${productSellingPoints}` : "",
        productSpecs ? `参数：${productSpecs}` : "",
        `提示词：${productPrompt || "按用户填写的视觉方向生成背景、场景、光影和版式，不改变产品本体。"}`,
        "仅锁定产品图主体，背景和视觉效果按提示词生成。",
        `保护等级：${productProtectionLevel}`,
        platformPrompt(productPlatform),
      ].filter(Boolean).join("\n");
    }

    if (activeTab === "variant") {
      return [
        "产品风格变体",
        variantPrompt || "同一产品多风格展示",
        `输出：${variantOutputType}`,
        `风格：${variantStyle}`,
        `保护等级：${variantProtectionLevel}`,
        platformPrompt(variantPlatform),
      ].join("\n");
    }

    if (activeTab === "detail") {
      return buildDetailPrompt({
        productName: detailProductName,
        sellingPoints: withPlatform(detailSellingPoints, detailPlatform),
        templateId: detailTemplate,
        ratio: detailRatio,
      });
    }

    return buildPosterPrompt({
      productName: posterProductName,
      title: posterTitle,
      subtitle: withPlatform(
        [posterSubtitle, posterCampaignInfo].filter(Boolean).join("\n"),
        posterPlatform,
      ),
      posterType,
      posterStyle,
      ratio: posterRatio,
    });
  }, [
    activeTab,
    textPrompt,
    textStyle,
    textRatio,
    textPlatform,
    mimicProductName,
    mimicSellingPoints,
    mimicExtra,
    mimicType,
    mimicSelectedDimensions,
    mimicStrength,
    mimicRatio,
    mimicPlatform,
    productName,
    productCategory,
    productBrand,
    productSellingPoints,
    productSpecs,
    productPrompt,
    productProtectionLevel,
    productPlatform,
    variantPrompt,
    variantOutputType,
    variantStyle,
    variantProtectionLevel,
    variantPlatform,
    detailProductName,
    detailSellingPoints,
    detailTemplate,
    detailRatio,
    detailPlatform,
    posterProductName,
    posterTitle,
    posterSubtitle,
    posterCampaignInfo,
    posterType,
    posterStyle,
    posterRatio,
    posterPlatform,
  ]);

  const syncLocalHistoryToServer = useCallback(async (items: HistoryItem[], activeLicenseCode: string) => {
    const customerId = normalizeClientLicenseCode(activeLicenseCode);
    if (!customerId) return;

    for (const item of items.slice(0, 40)) {
      try {
        const itemWithCustomer = { ...item, customerId };
        const itemImages = await getHistoryImages(itemWithCustomer.id);
        if (!itemImages?.length) continue;

        await fetch(photoPath("/api/history"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item: itemWithCustomer,
            images: itemImages,
            licenseCode: customerId,
          }),
        });
      } catch {
        // Local history sync is best-effort; generation and downloads still work.
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const storedLicense = loadLicenseCode();

    if (storedLicense) {
      verifyLicenseOnServer(storedLicense).then((next) => {
        if (!cancelled) {
          setLicenseStatus(next);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasMounted) return;

    let cancelled = false;

    async function loadHistory() {
      const activeLicenseCode = licenseStatus.valid ? licenseStatus.code : "";
      const currentHistoryKey = historyStorageKeyForLicense(activeLicenseCode);
      let localHistory: HistoryItem[] = [];

      const raw = localStorage.getItem(currentHistoryKey);
      if (raw) {
        try {
          localHistory = JSON.parse(raw) as HistoryItem[];
          if (!cancelled) {
            setHistory(localHistory);
          }
        } catch {
          localStorage.removeItem(currentHistoryKey);
        }
      } else if (!cancelled) {
        setHistory([]);
      }

      try {
        const response = await fetch(historyApiUrlForLicense(activeLicenseCode), { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;
        const sharedHistory = (payload.history || []) as HistoryItem[];
        const merged = mergeHistory(sharedHistory, localHistory);
        setHistory(merged);
        localStorage.setItem(currentHistoryKey, JSON.stringify(merged));
        syncLocalHistoryToServer(localHistory, activeLicenseCode);
      } catch {
        if (cancelled) return;
        if (localHistory.length) {
          setHistory(localHistory);
        }
        syncLocalHistoryToServer(localHistory, activeLicenseCode);
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [hasMounted, licenseStatus.code, licenseStatus.valid, licenseStatus.planId, syncLocalHistoryToServer]);

  useEffect(() => {
    if (!hasMounted || !history.length) return;

    let cancelled = false;
    const itemsNeedingPreview = history
      .filter((item) => !item.referenceThumb && !item.productThumb && !historyPreviewUrls[item.id])
      .slice(0, 12);

    if (!itemsNeedingPreview.length) return;

    async function loadHistoryPreviews() {
      const activeLicenseCode = licenseStatus.valid
        ? licenseStatus.code
        : normalizeClientLicenseCode(licenseCode);
      const encodedLicenseCode = encodeURIComponent(activeLicenseCode);
      const historyQuery = `licenseCode=${encodedLicenseCode}&adminCode=${encodedLicenseCode}`;

      for (const item of itemsNeedingPreview) {
        try {
          let storedImages = (await getHistoryImages(item.id)) || [];

          if (!storedImages.length && activeLicenseCode) {
            const response = await fetch(`${photoPath(`/api/history/${item.id}`)}?${historyQuery}`, {
              cache: "no-store",
            });
            const payload = await response.json();

            if (response.ok) {
              storedImages = payload.images || [];
              if (storedImages.length) {
                await saveHistoryImages(item.id, storedImages);
              }
            }
          }

          const previewUrl = storedImages[0]?.url;
          if (!cancelled && previewUrl) {
            setHistoryPreviewUrls((current) => ({
              ...current,
              [item.id]: previewUrl,
            }));
          }
        } catch {
          // Preview loading is best-effort; download still fetches full history images.
        }
      }
    }

    loadHistoryPreviews();

    return () => {
      cancelled = true;
    };
  }, [
    hasMounted,
    history,
    historyPreviewUrls,
    licenseCode,
    licenseStatus.code,
    licenseStatus.planId,
    licenseStatus.valid,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadLogs() {
      try {
        const response = await fetch(photoPath("/api/logs"), { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled) {
          setLogs(payload.logs || []);
        }
      } catch {
        if (!cancelled) {
          setLogs([]);
        }
      }
    }

    loadLogs();
    const timer = window.setInterval(loadLogs, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!isGenerating || !generationStartedAt) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - generationStartedAt);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [generationStartedAt, isGenerating]);

  useFilePreview(mimicReference, setMimicReferencePreview, setMimicReferenceThumb);
  useFilePreview(mimicProduct, setMimicProductPreview, setMimicProductThumb);
  useFilePreview(productMain, setProductMainPreview, setProductMainThumb);
  useFilePreview(variantProduct, setVariantProductPreview, setVariantProductThumb);
  useFilePreview(detailProduct, setDetailProductPreview, setDetailProductThumb);
  useFilePreview(posterProduct, setPosterProductPreview, setPosterProductThumb);
  useFilePreview(posterLogo, setPosterLogoPreview, setPosterLogoThumb);

  useEffect(() => {
    if (skipNextApiResetRef.current) {
      skipNextApiResetRef.current = false;
      return;
    }
    resetApiConnectionStatus();
  }, [
    apiProvider,
    userApiKey,
    userBaseURL,
    userTextModel,
    azureEndpoint,
    azureDeployment,
    azureApiVersion,
  ]);

  function apiConfigPayload() {
    const normalizedDeployment = azureDeployment.trim();
    const imageModel = isBananaProvider(apiProvider) ? "" : normalizedDeployment;
    const googleBananaModel = isBananaProvider(apiProvider) ? normalizedDeployment || defaultGoogleBananaModel : "";

    return {
      provider: apiProvider,
      apiProvider,
      apiKey: userApiKey,
      baseURL: userBaseURL,
      textModel: userTextModel,
      azureEndpoint,
      azureDeployment,
      azureApiVersion,
      imageModel,
      googleBananaModel,
    };
  }

  function appendApiConfig(formData: FormData) {
    if (selectedUnifiedModelId) {
      formData.append("modelConfigId", selectedUnifiedModelId);
      formData.append("workspaceId", localStorage.getItem("aigcnong-active-workspace") || "");
    }
  }

  function isAzureEndpoint(value: string) {
    return value.toLowerCase().includes("cognitiveservices.azure.com");
  }

  function getApiConfigIssue() {
    if (selectedUnifiedModelId) return "";
    if (!unifiedModelsLoaded) return "正在加载当前工作空间的统一图片模型，请稍候。";
    if (unifiedModelError) return unifiedModelError;
    return "请先到统一设置中心配置并启用一个图片模型。";
  }

  function resetApiConnectionStatus() {
    setApiConnectionStatus("untested");
    setApiConnectionMessage("");
  }

  const apiBadgeLabel = useMemo(() => {
    const providerName = providerKeyLabel(apiProvider);
    if (apiConnectionStatus === "ok") return `${providerName} 已配置`;
    if (apiConnectionStatus === "error") return `${providerName} 配置异常`;
    return `${providerName} 未配置`;
  }, [apiConnectionStatus, apiProvider]);

  const apiBadgeIsOk = apiConnectionStatus === "ok";

  async function checkOpenAIStatus() {
    setIsChecking(true);
    setError("");
    setStatus("");

    try {
      const localIssue = getApiConfigIssue();
      if (localIssue) {
        setApiConnectionStatus("error");
        setApiConnectionMessage(localIssue);
        throw new Error(localIssue);
      }

      const config = apiConfigPayload();
      const response = await fetch(photoPath("/api/check-openai"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "连接检测失败");
      }
      if (payload.model && typeof payload.model === "string") {
        if (payload.model !== azureDeployment) {
          skipNextApiResetRef.current = true;
        }
        setAzureDeployment(payload.model);
      }
      const message = payload.message || "接口连接正常";
      setApiConnectionStatus("ok");
      setApiConnectionMessage(message);
      setStatus(message);
    } catch (statusError) {
      const message =
        statusError instanceof Error
          ? statusError.message
          : "图片服务连接检测失败";
      setApiConnectionStatus("error");
      setApiConnectionMessage(message);
      setError(message);
    } finally {
      setIsChecking(false);
    }
  }

  async function verifyApiConfig() {
    const config = apiConfigPayload();
    const localIssue = getApiConfigIssue();
    if (localIssue) {
      throw new Error(localIssue);
    }

    const response = await fetch(photoPath("/api/check-openai"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "接口认证失败");
    }

    const verifiedImageModel =
      payload.model && typeof payload.model === "string"
        ? payload.model
      : config.imageModel || config.googleBananaModel || "";

    return {
      ...config,
      azureDeployment: isBananaProvider(apiProvider) ? config.azureDeployment : verifiedImageModel,
      textModel: config.textModel,
      imageModel: isBananaProvider(apiProvider) ? "" : verifiedImageModel,
      googleBananaModel: isBananaProvider(apiProvider) ? verifiedImageModel : "",
      message: payload.message || "图片服务连接正常。",
    };
  }

  async function clearLogs() {
    await fetch(photoPath("/api/logs"), { method: "DELETE" });
    setLogs([]);
  }

  async function activateLicense() {
    const next = await verifyLicenseOnServer(licenseCode);
    setLicenseStatus(next);
    if (next.valid) {
      saveLicenseCode(licenseCode);
      setStatus(next.message || "授权已激活。");
      setError("");
    } else {
      setError(next.message || "授权码无效，请检查后重试。");
    }
  }

  async function saveApiKeyConfig() {
    setIsChecking(true);
    setError("");

    try {
      const verifiedConfig = await verifyApiConfig();
      if (verifiedConfig.azureDeployment !== azureDeployment) {
        skipNextApiResetRef.current = true;
      }
      setAzureDeployment(verifiedConfig.azureDeployment);
      saveUserApiKey(verifiedConfig);
      setApiConnectionStatus("ok");
      setApiConnectionMessage(verifiedConfig.message);
      setStatus(`${verifiedConfig.message} 已保存：${maskApiKey(userApiKey)}`);
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "接口认证失败，请检查 API Key、Base URL 或模型权限。";
      setApiConnectionStatus("error");
      setApiConnectionMessage(message);
      setError(message);
    } finally {
      setIsChecking(false);
    }
  }

  function clearApiKeyConfig() {
    clearUserApiKey();
    setApiProvider("openai");
    setUserApiKey("");
    setUserBaseURL("");
    setUserTextModel("");
    setAzureEndpoint("");
    setAzureDeployment("");
    setAzureApiVersion(defaultAzureApiVersion);
    setApiConnectionStatus("untested");
    setApiConnectionMessage("");
    setStatus("本机浏览器中的 API Key 已清除。");
  }

  function resetLocalApiConfig() {
    clearUserApiKey();
    for (const key of legacyGenerationStorageKeys) {
      localStorage.removeItem(key);
    }
    localStorage.removeItem(userApiConfigVersionStorageKey);
    localStorage.removeItem(userImageModelStorageKey);
    setStatus("本机接口配置已重置，请重新填写 API Key、Base URL 和 Image Model。");
    window.setTimeout(() => window.location.reload(), 300);
  }

  function ensureAccess(featureKey = tabFeatureMap[activeTab], requireApiKey = true) {
    if (!licenseStatus.valid || !hasFeatureAccess(licenseStatus, featureKey)) {
      setError("请先输入有效授权码，或升级到包含该工作流权限的套餐。");
      return false;
    }

    if (requireApiKey) {
      const localIssue = getApiConfigIssue();
      if (localIssue) {
        setApiConnectionStatus("error");
        setApiConnectionMessage(localIssue);
        setError(localIssue);
        setShowSettings(true);
        return false;
      }
    }

    if (requireApiKey && !selectedUnifiedModelId && apiConnectionStatus !== "ok") {
      const message = `${providerKeyLabel(apiProvider)} 未通过连接测试，请先在设置中心点击“测试连接/保存”。`;
      setError(message);
      setShowSettings(true);
      return false;
    }

    if (requireApiKey && !selectedUnifiedModelId && apiProvider === "azure" && !azureEndpoint.trim()) {
      setError("请填写接口地址。Azure 可填资源地址；OpenAI 兼容接口可填 /v1、/v1/images/generations 或 /v1/images/edits。");
      return false;
    }

    if (requireApiKey && !selectedUnifiedModelId && apiProvider === "azure" && isAzureEndpoint(azureEndpoint) && !azureDeployment.trim()) {
      setError("Azure OpenAI 需要填写 Deployment，例如 gpt-image-2。");
      return false;
    }

    return true;
  }

  async function optimizeTextPrompt() {
    if (!textPrompt.trim()) {
      setError("请先输入一段描述。");
      return;
    }

    setIsOptimizing(true);
    setError("");

    try {
      const response = await fetch(photoPath("/api/optimize-prompt"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: textPrompt,
          workflowType: activeTab,
          platform: textPlatform,
          ratio: textRatio,
          useCase: "text-to-image",
          style: textStyle,
        }),
      });
      const payload = await response.json();
      setTextPrompt(payload.prompt || textPrompt);
    } catch {
      setError("提示词优化失败，请稍后重试。");
    } finally {
      setIsOptimizing(false);
    }
  }

  async function persistHistory(item: HistoryItem, itemImages: GeneratedImage[]) {
    const activeLicenseCode = licenseStatus.valid
      ? licenseStatus.code
      : normalizeClientLicenseCode(licenseCode);
    const currentHistoryKey = historyStorageKeyForLicense(activeLicenseCode);
    const historyItem = { ...item, customerId: activeLicenseCode };
    const next = mergeHistory([historyItem], history).slice(0, 40);
    setHistory(next);
    if (!historyItem.referenceThumb && !historyItem.productThumb && itemImages[0]?.url) {
      setHistoryPreviewUrls((current) => ({
        ...current,
        [historyItem.id]: itemImages[0].url,
      }));
    }
    try {
      localStorage.setItem(currentHistoryKey, JSON.stringify(next));
      await saveHistoryImages(historyItem.id, itemImages);
    } catch {
      setStatus("图片已生成并保存到共享历史，本机浏览器缓存空间不足，已跳过本地缓存。");
    }

    try {
      const response = await fetch(photoPath("/api/history"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: historyItem,
          images: itemImages,
          licenseCode: activeLicenseCode,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "共享历史保存失败。");
      }
    } catch (historyError) {
      setStatus(
        historyError instanceof Error
          ? `图片已生成，但共享历史同步失败：${historyError.message}`
          : "图片已生成，但共享历史同步失败。",
      );
    }
  }

  async function generateText() {
    if (!textPrompt.trim()) {
      setError("请输入 prompt，或从模板库选择一个。");
      return;
    }

    const formData = new FormData();
    formData.append("prompt", textPrompt);
    formData.append("style", textStyle);
    formData.append("platform", textPlatform);
    formData.append("ratio", textRatio);
    formData.append("size", textSize);
    formData.append("quality", textQuality);
    formData.append("count", String(textCount));

    await submitGeneration(photoPath("/api/generate-image"), formData, {
      workflow: "文本生图",
      title: textPrompt,
      outputType: textStyle || "视觉方向",
    });
  }

  async function generateMimic() {
    if (!mimicReference || !mimicProduct) {
      setError("请同时上传参考图和产品图。");
      return;
    }

    const formData = new FormData();
    formData.append("referenceImage", mimicReference);
    formData.append("productImage", mimicProduct);
    formData.append("productName", mimicProductName);
    formData.append("sellingPoints", mimicSellingPoints);
    formData.append("extraRequirements", mimicExtra);
    formData.append("platform", mimicPlatform);
    formData.append("outputType", mimicType);
    formData.append("dimensions", mimicSelectedDimensions.join(","));
    formData.append("strength", mimicStrength);
    formData.append("protectionLevel", mimicProtectionLevel);
    formData.append("ratio", mimicRatio);
    formData.append("quality", mimicQuality);
    formData.append("count", String(mimicCount));

    await submitGeneration(photoPath("/api/generate-reference"), formData, {
      workflow: "参考图模仿生图",
      title: mimicProductName || mimicType,
      outputType: mimicType,
      referenceThumb: mimicReferenceThumb,
      productThumb: mimicProductThumb,
    });
  }

  async function generateProductWorkflow() {
    if (!productMain) {
      setError("请上传产品主图。");
      return;
    }

    const formData = new FormData();
    const productWorkflowPrompt = [
      productSellingPoints ? `核心卖点：${productSellingPoints}` : "",
      productSpecs ? `产品参数：${productSpecs}` : "",
      productPrompt ? `视觉方向：${productPrompt}` : "",
    ].filter(Boolean).join("\n");

    formData.append("productImage", productMain);
    formData.append("productName", productName);
    formData.append("category", productCategory);
    formData.append("brandName", productBrand);
    formData.append("sellingPoints", productSellingPoints);
    formData.append("parameters", productSpecs);
    formData.append("prompt", productWorkflowPrompt || productPrompt);
    formData.append("ratio", productRatio);
    formData.append("quality", productQuality);
    formData.append("count", "1");
    formData.append("platform", productPlatform);
    formData.append("protectionLevel", productProtectionLevel);

    await submitGeneration(photoPath("/api/product-workflow"), formData, {
      workflow: "产品图工作流",
      title: productName || productSellingPoints || productPrompt || "产品图工作流",
      outputType: "产品锁定生图",
      productThumb: productMainThumb,
    });
  }

  async function generateProductVariant() {
    if (!variantProduct) {
      setError("请上传产品图。");
      return;
    }

    const formData = new FormData();
    formData.append("productImage", variantProduct);
    formData.append("prompt", variantPrompt);
    formData.append("outputType", variantOutputType);
    formData.append("style", variantStyle);
    formData.append("ratio", variantRatio);
    formData.append("quality", variantQuality);
    formData.append("count", String(variantCount));
    formData.append("platform", variantPlatform);
    formData.append("protectionLevel", variantProtectionLevel);

    await submitGeneration(photoPath("/api/product-variant"), formData, {
      workflow: "产品风格变体",
      title: variantPrompt || variantOutputType,
      outputType: variantOutputType,
      productThumb: variantProductThumb,
    });
  }

  function detailInput(): DetailBlueprintInput {
    const inferredLocale = inferDetailLocaleFromPrompt(
      [detailVisualPrompt, detailStyle, detailSellingPoints, detailWorkflowPlatform].join("\n"),
    );
    return {
      productName: detailProductName,
      category: detailCategory,
      brandName: detailBrand,
      sellingPoints: detailSellingPoints,
      specs: detailSpecs,
      material: detailMaterial,
      functions: detailFunctions,
      packageList: detailPackageList,
      useScenes: detailUseScenes,
      audience: detailAudience,
      advantages: "",
      dimensions: "",
      variants: "",
      afterSales: detailAfterSales,
      visualPrompt: detailVisualPrompt,
      targetMarket: inferredLocale.market || detailMarket,
      language: inferredLocale.language || detailLanguage,
      platform: detailWorkflowPlatform,
      count: detailSetCount,
      style: detailStyle,
      textMode: detailTextMode,
    };
  }

  async function generateDetailBlueprints() {
    if (!detailProductName.trim()) {
      setError("请先填写产品名称。");
      return;
    }

    if (!ensureAccess("detail-single", false)) {
      return;
    }

    setError("");
      const response = await fetch(photoPath("/api/detail-blueprint"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...detailInput(),
        licenseCode,
        ...apiConfigPayload(),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "详情图蓝图生成失败。");
      return;
    }
    setDetailBlueprints(payload.blueprint || []);
    setDetailStep(3);
    setFinalPrompt(
      showWorkflowInternals
        ? (payload.blueprint || []).map((item: DetailBlueprintItem) => item.prompt).join("\n\n---\n\n")
        : hiddenPromptText,
    );
  }

  function updateDetailBlueprint(id: string, patch: Partial<DetailBlueprintItem>) {
    setDetailBlueprints((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  async function generateDetailBatch() {
    if (!detailProduct) {
      setError("请上传产品主图。");
      return;
    }
    if (!detailBlueprints.length) {
      setError("请先生成详情图蓝图。");
      return;
    }

    const formData = new FormData();
    formData.append("productImage", detailProduct);
    formData.append("blueprints", JSON.stringify(detailBlueprints));
    formData.append("ratio", detailRatio);
    formData.append("quality", detailQuality);
    formData.append("textMode", detailTextMode);

    await submitGeneration(photoPath("/api/detail-batch-generate"), formData, {
      workflow: "电商详情图套图",
      title: detailProductName || "详情图套图",
      outputType: detailWorkflowPlatform,
      productThumb: detailProductThumb,
    });
  }

  async function generateDetail() {
    if (!detailProductName && !detailProduct) {
      setError("请至少输入产品名称，或上传产品图。");
      return;
    }

    const prompt = buildDetailPrompt({
      productName: detailProductName,
      sellingPoints: withPlatform(detailSellingPoints, detailPlatform),
      templateId: detailTemplate,
      ratio: detailRatio,
    });
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("style", "minimalEcommerce");
    formData.append("ratio", detailRatio);
    formData.append("size", ratioToSize[detailRatio]);
    formData.append("quality", detailQuality);
    formData.append("count", "1");
    if (detailProduct) {
      formData.append("mode", "reference");
      formData.append("reference", detailProduct);
    }

    await submitGeneration(photoPath("/api/generate-image"), formData, {
      workflow: "详情图工作流",
      title:
        detailTemplates.find((item) => item.id === detailTemplate)?.name ||
        "详情图",
      outputType: "详情图",
      productThumb: detailProductThumb,
    });
  }

  async function generatePoster() {
    if (!posterProductName && !posterProduct) {
      setError("请至少输入产品名称，或上传产品图。");
      return;
    }

    const prompt = buildPosterPrompt({
      productName: posterProductName,
      title: posterTitle,
      subtitle: withPlatform(
        [posterSubtitle, posterCampaignInfo].filter(Boolean).join("\n"),
        posterPlatform,
      ),
      posterType,
      posterStyle,
      ratio: posterRatio,
    });

    if (posterProduct) {
      const formData = new FormData();
      formData.append("productImage", posterProduct);
      if (posterLogo) {
        formData.append("logo", posterLogo);
      }
      formData.append("productName", posterProductName);
      formData.append("title", posterTitle);
      formData.append("subtitle", posterSubtitle);
      formData.append("campaignInfo", posterCampaignInfo);
      formData.append("posterType", posterType);
      formData.append("style", posterStyle);
      formData.append("ratio", posterRatio);
      formData.append("quality", posterQuality);
      formData.append("platform", posterPlatform);
      formData.append("protectionLevel", posterProtectionLevel);

      await submitGeneration(photoPath("/api/poster-generate"), formData, {
        workflow: "海报工作流",
        title: posterTitle || posterType,
        outputType: posterType,
        referenceThumb: posterLogoThumb,
        productThumb: posterProductThumb,
      });
      return;
    }

    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("style", "poster");
    formData.append("ratio", posterRatio);
    formData.append("size", ratioToSize[posterRatio]);
    formData.append("quality", posterQuality);
    formData.append("count", "1");
    if (posterProduct) {
      formData.append("mode", "reference");
      formData.append("reference", posterProduct);
    }

    await submitGeneration(photoPath("/api/generate-image"), formData, {
      workflow: "海报工作流",
      title: posterTitle || posterType,
      outputType: posterType,
      productThumb: posterProductThumb,
    });
  }

  async function submitGeneration(
    endpoint: string,
    formData: FormData,
    meta: Omit<HistoryItem, "id" | "createdAt" | "finalPrompt">,
  ) {
    if (!ensureAccess()) {
      return;
    }

    const startedAt = Date.now();
    setError("");
    setStatus("");
    setFinalPrompt(showWorkflowInternals ? promptPreview : hiddenPromptText);
    setIsGenerating(true);
    setGenerationStartedAt(startedAt);
    setElapsedMs(0);
    setLastDurationMs(null);

    try {
      const historyMeta = {
        id: createId("history"),
        ...meta,
      };
      formData.append("licenseCode", licenseCode);
      appendApiConfig(formData);
      formData.append("__historyMeta", JSON.stringify(historyMeta));

      const response = await fetch(endpoint, { method: "POST", body: formData });
      const responseText = await response.text();
      let payload: {
        error?: string;
        reason?: string;
        statusCode?: number;
        provider?: string;
        model?: string;
        hasBaseURL?: boolean;
        hasApiKey?: boolean;
        configSource?: string;
        serverEnv?: {
          hasOpenAIKey?: boolean;
          hasOpenAIBaseURL?: boolean;
          hasOpenAIImageModel?: boolean;
          hasAzureEndpoint?: boolean;
          hasAzureKey?: boolean;
          hasBananaBaseURL?: boolean;
        };
        images?: GeneratedImage[];
        finalPrompt?: string;
        durationMs?: number;
        warning?: string;
        historyItem?: HistoryItem;
        createdAt?: string;
      } = {};

      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        const shortText = responseText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
        throw new Error(
          shortText
            ? `Backend returned non-JSON content (${response.status}): ${shortText}`
            : "Backend returned no valid content. Check PM2 logs and retry.",
        );
      }

      if (!response.ok) {
        throw new Error(formatGenerationFailure(payload, response.status));
      }

      const nextImages = payload.images || [];
      if (!nextImages.length) {
        throw new Error(
          payload.error ||
            "接口已返回成功，但没有返回图片。请确认当前 API Key 和模型支持 images.generate / images.edit，并检查代理是否完整返回 data[0].b64_json 或 data[0].url。",
        );
      }

      setError("");
      setImages(nextImages);
      setFinalPrompt(
        showWorkflowInternals
          ? payload.finalPrompt || promptPreview
          : hiddenPromptText,
      );
      setLastDurationMs(payload.durationMs ?? Date.now() - startedAt);
      if (payload.warning) {
        setStatus(payload.warning);
      }

      const historyItem = payload.historyItem || {
        ...historyMeta,
        imageCount: nextImages.length,
        finalPrompt: showWorkflowInternals
          ? payload.finalPrompt || promptPreview
          : hiddenPromptText,
        createdAt: payload.createdAt || new Date().toISOString(),
      };
      await persistHistory(historyItem, nextImages);
      setError("");
    } catch (generationError) {
      setError(formatClientGenerationError(generationError, endpoint));
    } finally {
      setIsGenerating(false);
      setGenerationStartedAt(null);
    }
  }

  function formatClientGenerationError(error: unknown, endpoint: string) {
    const message = error instanceof Error ? error.message : String(error || "");
    const lower = message.toLowerCase();

    if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
      return [
        "生成请求没有收到后端响应。",
        `接口：${endpoint}`,
        "请检查本地服务是否还在运行、网络/代理是否拦截请求，以及设置中心的图片接口是否支持带参考图的生成。",
        "如果刚才等待时间很长后失败，可以先把输出数量设为 1、质量设为 low 或 medium 再重试。",
      ].join("\n");
    }

    if (
      lower.includes("504") ||
      lower.includes("gateway time-out") ||
      lower.includes("gateway timeout") ||
      lower.includes("time-out nginx")
    ) {
      return [
        "生成超时：宝塔 / Nginx 在图片接口返回前断开了请求。",
        `接口：${endpoint}`,
        "请在宝塔站点的 Nginx 反向代理配置里把 proxy_read_timeout、proxy_send_timeout、proxy_connect_timeout 调到 600 秒左右，然后重载 Nginx。",
        "临时规避：输出数量先设为 1，质量设为 low 或 medium，再重试。",
      ].join("\n");
    }

    if (lower.includes("backend returned non-json content")) {
      return `后端返回了非 JSON 内容，通常是服务报错页或代理中断。${message}`;
    }

    if (lower.includes("backend returned no valid content")) {
      return "后端没有返回有效内容，请确认本地服务仍在运行，并查看服务日志。";
    }

    return message || "生成失败，请稍后重试。";
  }

  function formatGenerationFailure(
    payload: {
      error?: string;
      reason?: string;
      statusCode?: number;
      provider?: string;
      model?: string;
      hasBaseURL?: boolean;
      hasApiKey?: boolean;
      configSource?: string;
      serverEnv?: {
        hasOpenAIKey?: boolean;
        hasOpenAIBaseURL?: boolean;
        hasOpenAIImageModel?: boolean;
        hasAzureEndpoint?: boolean;
        hasAzureKey?: boolean;
        hasBananaBaseURL?: boolean;
      };
    },
    fallbackStatus: number,
  ) {
    const config = apiConfigPayload();
    const rawReason = payload.reason || payload.error || "生成失败，请检查接口配置。";
    const parsedStatus = rawReason.match(/\b(400|401|403|404|408|409|429|503|5\d\d)\b/);
    const parsedModel = rawReason.match(/model\s+([A-Za-z0-9._-]+)/i)?.[1] || "";
    const provider = payload.provider || providerDisplayName(apiProvider);
    const model =
      payload.model ||
      parsedModel ||
      config.googleBananaModel ||
      config.imageModel ||
      config.azureDeployment ||
      "未填写";
    const statusCode = payload.statusCode || (parsedStatus ? Number(parsedStatus[1]) : fallbackStatus);
    const hasBaseURL =
      typeof payload.hasBaseURL === "boolean"
        ? payload.hasBaseURL
        : Boolean(config.baseURL || config.azureEndpoint);
    const hasApiKey =
      typeof payload.hasApiKey === "boolean"
        ? payload.hasApiKey
        : Boolean(config.apiKey?.trim());
    const reason =
      isLegacyDallEModel(model) && (statusCode === 503 || rawReason.toLowerCase().includes("available channel"))
        ? `当前模型 ${model} 没有可用通道，请在设置中心更换为 ${defaultImageModel} 或当前接口支持的模型。`
        : rawReason;
    const source =
      payload.configSource === "browser-localStorage-formData"
        ? "浏览器 localStorage，经前端表单提交给后端 API route"
        : "当前浏览器配置";
    const serverEnv = payload.serverEnv;
    const envMissingHint =
      !hasApiKey && serverEnv?.hasOpenAIKey === false
        ? "\n服务器 .env.local 未配置 OPENAI_API_KEY。"
        : "";
    const browserMissingHint = !hasApiKey
      ? "\n浏览器 localStorage 未配置 API Key，请打开右上角设置中心重新填写。"
      : "";

    return [
      "生成失败：",
      `Provider: ${provider}`,
      `Model: ${model}`,
      `状态码：${statusCode}`,
      `Base URL / Endpoint：${hasBaseURL ? "已填写" : "未填写"}`,
      `API Key：${hasApiKey ? "已填写" : "缺失"}`,
      `配置来源：${source}`,
      `原因：${reason}${browserMissingHint}${envMissingHint}`,
    ].join("\n");
  }

  function downloadImage(url: string, filename: string) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function downloadAll() {
    images.forEach((image, index) => {
      window.setTimeout(
        () => downloadImage(image.url, `ecommerce-ai-${Date.now()}-${index + 1}.png`),
        index * 120,
      );
    });
  }

  async function downloadHistoryImages(item: HistoryItem) {
    setDownloadingHistoryId(item.id);

    try {
      let storedImages = (await getHistoryImages(item.id)) || [];

      if (!storedImages?.length) {
        const activeLicenseCode = licenseStatus.valid
          ? licenseStatus.code
          : normalizeClientLicenseCode(licenseCode);
        const encodedLicenseCode = encodeURIComponent(activeLicenseCode);
        const historyQuery = `licenseCode=${encodedLicenseCode}&adminCode=${encodedLicenseCode}`;
        const response = await fetch(`${photoPath(`/api/history/${item.id}`)}?${historyQuery}`, {
          cache: "no-store",
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "共享历史图片读取失败。");
        }

        storedImages = payload.images || [];
        if (storedImages.length) {
          await saveHistoryImages(item.id, storedImages);
        }
      }

      if (!storedImages.length) {
        setError("这条历史记录没有可下载的图片数据，请重新生成一次。");
        return;
      }

      if (false) {
        setError("这条历史记录没有可下载的图片数据。请重新生成一次。");
        return;
      }

      storedImages.forEach((image, index) => {
        window.setTimeout(
          () =>
            downloadImage(
              image.url,
              `history-${item.workflow}-${item.id}-${index + 1}.png`,
            ),
          index * 120,
        );
      });
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "历史图片下载失败，请稍后重试。",
      );
    } finally {
      setDownloadingHistoryId("");
    }
  }

  function runCurrentTab() {
    if (activeTab === "text") return generateText();
    if (activeTab === "mimic") return generateMimic();
    if (activeTab === "product") return generateProductWorkflow();
    if (activeTab === "variant") return generateProductVariant();
    if (activeTab === "detail") return generateDetailBatch();
    return generatePoster();
  }

  function enterStudio(tab: TabKey) {
    if (isPortalTransitioning) return;
    setActiveTab(tab);
    setIsPortalTransitioning(true);
    window.setTimeout(() => {
      setHasEnteredStudio(true);
      setIsPortalTransitioning(false);
    }, 620);
  }

  const flagshipModes: Array<{ tab: TabKey; label: string; short: string }> = [
    { tab: "text", label: "文本生图", short: "Prompt" },
    { tab: "mimic", label: "参考模仿", short: "Mimic" },
    { tab: "product", label: "产品图流", short: "Product" },
    { tab: "variant", label: "风格变体", short: "Variant" },
    { tab: "detail", label: "详情套图", short: "Suite" },
    { tab: "poster", label: "海报流", short: "Poster" },
  ];

  if (!hasEnteredStudio) {
    return (
      <main className={`studio-shell relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[#030305] px-6 text-zinc-400 ${isPortalTransitioning ? "studio-hub-exiting" : ""}`}>
        <div className="noise absolute inset-0 z-50 opacity-[0.03] pointer-events-none" />
        <nav className="absolute right-6 top-6 z-[60] flex items-center gap-2">
          <a href="/" className="studio-secondary-button">统一首页</a>
          <a href="/video" className="studio-secondary-button">视频画布</a>
          <a href="/settings" className="studio-secondary-button">设置中心</a>
        </nav>
        <motion.div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{ x: smoothX, y: smoothY }}
        >
          <div className="h-[900px] w-[900px] rounded-full bg-indigo-600/10 blur-[120px]" />
        </motion.div>
        <div className="studio-hub-orb studio-hub-orb-a" />
        <div className="studio-hub-orb studio-hub-orb-b" />
        <div className="studio-hub-ring" />
        <div className="studio-hub-sheen" />
        <section className="relative z-10 w-full max-w-6xl text-center">
          <AigcNongLogo variant="hub" className="mx-auto mb-10" />
          <h1 className="studio-launch-title text-5xl font-bold text-white sm:text-7xl">
            今天要做点什么？
          </h1>
          <p className="studio-launch-copy mx-auto mt-5 max-w-2xl text-sm text-zinc-400">
            选择你的创作模式，进入专业级 AIGC 图片工作流。
          </p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { tab: "product" as TabKey, title: "产品图工作流", desc: "Product Workflow" },
              { tab: "detail" as TabKey, title: "详情图套图", desc: "Detail Suite" },
              { tab: "poster" as TabKey, title: "海报工作流", desc: "Poster Flow" },
              { tab: "mimic" as TabKey, title: "参考图模仿", desc: "Reference Mimic" },
              { tab: "variant" as TabKey, title: "产品风格变体", desc: "Style Variation" },
              { tab: "text" as TabKey, title: "文本生图", desc: "Prompt to Image" },
            ].map((item, index) => (
              <button
                key={item.tab}
                className="studio-launch-card group text-left"
                style={{ animationDelay: `${260 + index * 70}ms` }}
                onClick={() => enterStudio(item.tab)}
              >
                <span className="studio-launch-icon relative z-10 mb-8 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-300/20 transition group-hover:bg-indigo-500/25">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="relative z-10 block text-[15px] font-bold text-zinc-100">{item.title}</span>
                <span className="relative z-10 mt-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                  {item.desc}
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="studio-shell relative h-screen w-screen overflow-hidden bg-[#030305] text-zinc-400">
      <div className="noise absolute inset-0 z-50 opacity-[0.03] pointer-events-none" />
      <motion.div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ x: smoothX, y: smoothY }}
      >
        <div className="h-[900px] w-[900px] rounded-full bg-indigo-600/10 blur-[120px]" />
      </motion.div>

      <div className="relative z-10 flex h-full w-full">
        <aside className="flex h-full w-[420px] shrink-0 flex-col border-r border-white/5 bg-black/40 p-8 backdrop-blur-3xl">
          <div className="mb-10 flex items-center justify-between gap-4 border-b border-white/5 pb-8">
            <button className="text-left" onClick={() => setHasEnteredStudio(false)} aria-label="返回启动页">
              <AigcNongLogo variant="sidebar" />
            </button>
              <span className={`studio-status ${licenseStatus.valid ? "studio-status-ok" : "studio-status-warn"}`}>
                {licenseStatus.valid ? "已授权" : "待授权"}
              </span>
          </div>

          <div className="mb-10 grid grid-cols-2 gap-3">
              {flagshipModes.map((workflow) => {
                const locked = !hasFeatureAccess(licenseStatus, tabFeatureMap[workflow.tab]);
                return (
                  <button
                    key={workflow.tab}
                    className={`p-4 rounded-2xl border transition-all text-left text-[11px] ${
                      activeTab === workflow.tab
                        ? "border-indigo-500 bg-indigo-500/10 text-white shadow-[0_0_30px_rgba(99,102,241,0.18)]"
                        : "border-white/5 bg-white/5 text-zinc-400 hover:border-white/15 hover:bg-white/[0.07]"
                    }`}
                    onClick={() => setActiveTab(workflow.tab)}
                    title={locked ? "当前授权未开放该工作流" : workflow.short}
                  >
                    <span className="block font-bold">{workflow.label}</span>
                    <span className="mt-1 block text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                      {locked ? "Locked" : workflow.short}
                    </span>
                  </button>
                );
              })}
            </div>

          <div className="no-scrollbar flex-1 space-y-6 overflow-y-auto pb-20">
              {activeTab === "text" && (
                <TextWorkflow
                  prompt={textPrompt}
                  setPrompt={setTextPrompt}
                  style={textStyle}
                  setStyle={setTextStyle}
                  ratio={textRatio}
                  setRatio={setTextRatio}
                  size={textSize}
                  setSize={setTextSize}
                  quality={textQuality}
                  setQuality={setTextQuality}
                  platform={textPlatform}
                  setPlatform={setTextPlatform}
                  count={textCount}
                  setCount={setTextCount}
                  optimize={optimizeTextPrompt}
                  isOptimizing={isOptimizing}
                />
              )}
              {activeTab === "mimic" && (
                <MimicWorkflow
                  reference={mimicReference}
                  setReference={setMimicReference}
                  product={mimicProduct}
                  setProduct={setMimicProduct}
                  referencePreview={mimicReferencePreview}
                  productPreview={mimicProductPreview}
                  productName={mimicProductName}
                  setProductName={setMimicProductName}
                  sellingPoints={mimicSellingPoints}
                  setSellingPoints={setMimicSellingPoints}
                  extra={mimicExtra}
                  setExtra={setMimicExtra}
                  outputType={mimicType}
                  setOutputType={setMimicType}
                  dimensions={mimicSelectedDimensions}
                  setDimensions={setMimicSelectedDimensions}
                  strength={mimicStrength}
                  setStrength={setMimicStrength}
                  ratio={mimicRatio}
                  setRatio={setMimicRatio}
                  count={mimicCount}
                  setCount={setMimicCount}
                  quality={mimicQuality}
                  setQuality={setMimicQuality}
                  platform={mimicPlatform}
                  setPlatform={setMimicPlatform}
                  protectionLevel={mimicProtectionLevel}
                  setProtectionLevel={setMimicProtectionLevel}
                />
              )}
              {activeTab === "product" && (
                <ProductWorkflow
                  product={productMain}
                  setProduct={setProductMain}
                  productPreview={productMainPreview}
                  productName={productName}
                  setProductName={setProductName}
                  category={productCategory}
                  setCategory={setProductCategory}
                  brand={productBrand}
                  setBrand={setProductBrand}
                  sellingPoints={productSellingPoints}
                  setSellingPoints={setProductSellingPoints}
                  specs={productSpecs}
                  setSpecs={setProductSpecs}
                  prompt={productPrompt}
                  setPrompt={setProductPrompt}
                  ratio={productRatio}
                  setRatio={setProductRatio}
                  quality={productQuality}
                  setQuality={setProductQuality}
                  platform={productPlatform}
                  setPlatform={setProductPlatform}
                  protectionLevel={productProtectionLevel}
                  setProtectionLevel={setProductProtectionLevel}
                />
              )}
              {activeTab === "variant" && (
                <ProductVariantWorkflow
                  product={variantProduct}
                  setProduct={setVariantProduct}
                  productPreview={variantProductPreview}
                  prompt={variantPrompt}
                  setPrompt={setVariantPrompt}
                  outputType={variantOutputType}
                  setOutputType={setVariantOutputType}
                  style={variantStyle}
                  setStyle={setVariantStyle}
                  ratio={variantRatio}
                  setRatio={setVariantRatio}
                  count={variantCount}
                  setCount={setVariantCount}
                  quality={variantQuality}
                  setQuality={setVariantQuality}
                  platform={variantPlatform}
                  setPlatform={setVariantPlatform}
                  protectionLevel={variantProtectionLevel}
                  setProtectionLevel={setVariantProtectionLevel}
                />
              )}
              {activeTab === "detail" && (
                <DetailSuiteWorkflow
                  product={detailProduct}
                  setProduct={setDetailProduct}
                  productPreview={detailProductPreview}
                  productName={detailProductName}
                  setProductName={setDetailProductName}
                  category={detailCategory}
                  setCategory={setDetailCategory}
                  brand={detailBrand}
                  setBrand={setDetailBrand}
                  sellingPoints={detailSellingPoints}
                  setSellingPoints={setDetailSellingPoints}
                  specs={detailSpecs}
                  setSpecs={setDetailSpecs}
                  material={detailMaterial}
                  setMaterial={setDetailMaterial}
                  functions={detailFunctions}
                  setFunctions={setDetailFunctions}
                  packageList={detailPackageList}
                  setPackageList={setDetailPackageList}
                  useScenes={detailUseScenes}
                  setUseScenes={setDetailUseScenes}
                  audience={detailAudience}
                  setAudience={setDetailAudience}
                  afterSales={detailAfterSales}
                  setAfterSales={setDetailAfterSales}
                  visualPrompt={detailVisualPrompt}
                  setVisualPrompt={setDetailVisualPrompt}
                  step={detailStep}
                  setStep={setDetailStep}
                  count={detailSetCount}
                  setCount={setDetailSetCount}
                  market={detailMarket}
                  setMarket={setDetailMarket}
                  language={detailLanguage}
                  setLanguage={setDetailLanguage}
                  workflowPlatform={detailWorkflowPlatform}
                  setWorkflowPlatform={setDetailWorkflowPlatform}
                  style={detailStyle}
                  setStyle={setDetailStyle}
                  ratio={detailRatio}
                  setRatio={setDetailRatio}
                  quality={detailQuality}
                  setQuality={setDetailQuality}
                  textMode={detailTextMode}
                  setTextMode={setDetailTextMode}
                  blueprints={detailBlueprints}
                  updateBlueprint={updateDetailBlueprint}
                  generateBlueprints={generateDetailBlueprints}
                  generateBatch={generateDetailBatch}
                />
              )}
              {activeTab === "poster" && (
                <PosterWorkflow
                  product={posterProduct}
                  setProduct={setPosterProduct}
                  logo={posterLogo}
                  setLogo={setPosterLogo}
                  productPreview={posterProductPreview}
                  logoPreview={posterLogoPreview}
                  productName={posterProductName}
                  setProductName={setPosterProductName}
                  title={posterTitle}
                  setTitle={setPosterTitle}
                  subtitle={posterSubtitle}
                  setSubtitle={setPosterSubtitle}
                  campaignInfo={posterCampaignInfo}
                  setCampaignInfo={setPosterCampaignInfo}
                  posterType={posterType}
                  setPosterType={setPosterType}
                  posterStyle={posterStyle}
                  setPosterStyle={setPosterStyle}
                  ratio={posterRatio}
                  setRatio={setPosterRatio}
                  quality={posterQuality}
                  setQuality={setPosterQuality}
                  platform={posterPlatform}
                  setPlatform={setPosterPlatform}
                  protectionLevel={posterProtectionLevel}
                  setProtectionLevel={setPosterProtectionLevel}
                />
              )}
              {error && <div className="studio-error">{error}</div>}
              {status && <div className="studio-success">{status}</div>}
            </div>

          <div className="studio-sidebar-action border-t border-white/[0.06] p-6">
            <button className="studio-primary-button w-full" onClick={runCurrentTab} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              {activeTab === "detail" ? "执行详情图套图" : "执行生图蓝图"}
            </button>
            <p className="mt-3 text-center text-[11px] text-zinc-600">
              {isGenerating
                ? `生成中 ${formatDuration(elapsedMs)}`
                : lastDurationMs !== null
                  ? `上次耗时 ${formatDuration(lastDurationMs)}`
                  : "生成耗时会在这里显示"}
            </p>
          </div>
        </aside>

        <section className="dot-grid relative flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-[74px] items-center justify-between border-b border-white/[0.06] px-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-zinc-600">
                Workspace / {tabTitle(activeTab)} / Preview
              </p>
              <h1 className="mt-1 text-xl font-semibold text-white">{tabTitle(activeTab)}</h1>
            </div>
            <div className="flex items-center gap-3">
              <a href="/" className="studio-secondary-button">首页</a>
              <a href="/video" className="studio-secondary-button">视频画布</a>
              <label className="flex h-10 items-center gap-2 rounded-[9px] border border-white/[0.1] bg-white/[0.04] px-3 text-[11px] text-white/55">
                图片模型
                <select
                  value={selectedUnifiedModelId}
                  onChange={(event) => {
                    setSelectedUnifiedModelId(event.target.value);
                    localStorage.setItem("aigcnong-photo-model", event.target.value);
                  }}
                  className="max-w-[210px] bg-transparent text-white outline-none"
                >
                  {unifiedImageModels.length === 0 && <option value="">尚未配置</option>}
                  {unifiedImageModels.map((model) => <option key={model.id} value={model.id}>{model.displayName} · {model.modelName}</option>)}
                </select>
              </label>
              <a href="/settings" className="studio-secondary-button">设置中心</a>
              <span className={`studio-api-badge ${apiBadgeIsOk ? "studio-api-ok" : "studio-api-missing"}`}>
                {selectedUnifiedModelId ? "统一模型已连接" : apiBadgeLabel}
              </span>
              <button className="studio-secondary-button" onClick={downloadAll} disabled={images.length === 0}>
                <Download className="h-4 w-4" />
                下载全部
              </button>
              <button className="studio-icon-button" onClick={() => window.location.assign("/settings")} title="设置中心">
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8">
            <div className="studio-preview-frame">
              {images.length ? (
                <div className="grid w-full gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {images.map((image, index) => (
                    <figure key={image.id} className="studio-result-card group">
                      <img src={image.url} alt={`Generated result ${index + 1}`} className="h-full w-full rounded-[48px] object-contain" />
                      <figcaption className="absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1 text-[10px] font-bold text-white/80 backdrop-blur">
                        #{index + 1}
                      </figcaption>
                      <figcaption className="absolute bottom-4 left-4 right-4 rounded-[22px] border border-white/[0.08] bg-black/55 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-200 backdrop-blur-xl">
                        商业渲染状态 / {isGenerating ? "Loading" : "Done"}
                      </figcaption>
                      <button
                        className="studio-floating-action opacity-0 group-hover:opacity-100"
                        onClick={() => downloadImage(image.url, `aigc-studio-${image.id}.png`)}
                        title="下载单张"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </figure>
                  ))}
                </div>
              ) : (
                <div className="studio-card flex max-w-lg flex-col items-center rounded-[36px] px-10 py-9 text-center">
                  <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[28px] border border-indigo-300/20 bg-indigo-500/10 text-indigo-200 shadow-[0_0_70px_rgba(99,102,241,0.18)]">
                    {isGenerating ? <Loader2 className="h-8 w-8 animate-spin" /> : <Layers className="h-8 w-8" />}
                  </div>
                  <h2 className="text-xl font-bold text-zinc-100">
                    {isGenerating ? "正在生成" : "准备开始创作"}
                  </h2>
                  <p className="mt-3 rounded-full border border-white/[0.06] bg-white/[0.035] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-200">
                    商业渲染状态 / {isGenerating ? "Loading" : images.length ? "Done" : "Standby"}
                  </p>
                  <p className="mt-3 max-w-md text-sm leading-7 text-zinc-400">
                    {isGenerating
                      ? `模型正在执行工作流，已耗时 ${formatDuration(elapsedMs)}。`
                      : "选择工作流并填写核心信息，生成结果将在这里呈现。"}
                  </p>
                  {!isGenerating && (
                    <div className="mt-5 grid gap-2 text-left sm:grid-cols-3">
                      {["上传产品图", "填写提示词", "点击生成"].map((step, index) => (
                        <span key={step} className="rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-xs font-semibold text-zinc-300">
                          <span className="mr-2 text-indigo-300">0{index + 1}</span>
                          {step}
                        </span>
                      ))}
                    </div>
                  )}
                  {!isGenerating && (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {["Amazon 主图", "详情图套图", "小红书封面", "产品海报"].map((tag) => (
                        <span key={tag} className="studio-mini-button">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {showWorkflowInternals && (
            <details className="border-t border-white/[0.06] bg-black/25 px-8 py-4">
              <summary className="cursor-pointer text-sm font-medium text-zinc-300">
                最终增强 Prompt
              </summary>
              <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 text-xs leading-6 text-zinc-400">
                {finalPrompt || promptPreview || "生成前会在这里显示系统增强后的 prompt。"}
              </pre>
            </details>
          )}
        </section>

        <aside className="studio-history flex min-h-0 w-[280px] shrink-0 flex-col">
          <div className="border-b border-white/[0.06] px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-zinc-500" />
                <h2 className="text-[17px] font-semibold text-zinc-100">历史资产库</h2>
              </div>
              <span className="text-sm text-zinc-500">{history.length}</span>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 no-scrollbar">
            {history.length ? (
              history.map((item) => {
                const generatedPreviewUrl = historyPreviewUrls[item.id];
                const hasInputThumbs = Boolean(item.referenceThumb || item.productThumb);

                return (
                  <article key={item.id} className="studio-history-card group">
                    <div className="mb-3 grid grid-cols-2 gap-2">
                      {item.referenceThumb && <img src={item.referenceThumb} alt="Reference thumbnail" className="studio-history-thumb" />}
                      {item.productThumb && <img src={item.productThumb} alt="Product thumbnail" className="studio-history-thumb" />}
                      {!hasInputThumbs && generatedPreviewUrl && (
                        <img src={generatedPreviewUrl} alt="Generated thumbnail" className="studio-history-thumb col-span-2" />
                      )}
                      {!hasInputThumbs && !generatedPreviewUrl && (
                        <div className="studio-history-thumb flex items-center justify-center">
                          <FileImage className="h-5 w-5 text-zinc-600" />
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-white">{item.workflow}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{item.title}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-zinc-700">
                      {item.outputType || "Image"} / {new Date(item.createdAt).toLocaleString()}
                    </p>
                    <div className="mt-3 flex gap-2">
                      {showWorkflowInternals && (
                        <button className="studio-mini-button" onClick={() => setFinalPrompt(item.finalPrompt)}>
                          Prompt
                        </button>
                      )}
                      <button className="studio-mini-button flex-1" onClick={() => downloadHistoryImages(item)} disabled={downloadingHistoryId === item.id}>
                        {downloadingHistoryId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        下载{item.imageCount ? `(${item.imageCount})` : ""}
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="studio-empty-history">
                <FileImage className="mx-auto mb-3 h-6 w-6 text-zinc-600" />
                <p className="text-sm font-medium text-zinc-400">暂无历史资产</p>
                <p className="mt-2 text-xs leading-6 text-zinc-600">生成后会保存缩略图、工作流、Prompt 和下载数据。</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {showSettings && (
        <motion.div
          className="studio-settings-backdrop fixed inset-0 z-50 flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.section
            className="studio-settings-panel"
            initial={{ opacity: 0, y: 20, scale: 0.96, filter: "blur(14px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 16, scale: 0.98, filter: "blur(12px)" }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
          >
            <div className="mb-7 flex items-start justify-between gap-6">
              <div>
                <AigcNongLogo variant="compact" className="mb-6" />
                <p className="label">Settings Center</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">授权与模型接口</h2>
                <p className="mt-2 text-sm text-zinc-500">API Key、授权码、模型配置和开发者日志都集中在这里。</p>
              </div>
              <button className="studio-icon-button" onClick={() => setShowSettings(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <CustomerApiAccessPanel
              licenseCode={licenseCode}
              setLicenseCode={setLicenseCode}
              licenseStatus={licenseStatus}
              activateLicense={activateLicense}
              apiProvider={apiProvider}
              setApiProvider={setApiProvider}
              apiKey={userApiKey}
              setApiKey={setUserApiKey}
              baseURL={userBaseURL}
              setBaseURL={setUserBaseURL}
              textModel={userTextModel}
              setTextModel={setUserTextModel}
              azureEndpoint={azureEndpoint}
              setAzureEndpoint={setAzureEndpoint}
              azureDeployment={azureDeployment}
              setAzureDeployment={setAzureDeployment}
              azureApiVersion={azureApiVersion}
              setAzureApiVersion={setAzureApiVersion}
              saveApiKey={saveApiKeyConfig}
              testConnection={checkOpenAIStatus}
              clearApiKey={clearApiKeyConfig}
              resetLocalConfig={resetLocalApiConfig}
              isChecking={isChecking}
              apiConnectionStatus={apiConnectionStatus}
              apiConnectionMessage={apiConnectionMessage}
              logs={logs}
              showLogs={showLogs}
              setShowLogs={setShowLogs}
              clearLogs={clearLogs}
            />
          </motion.section>
        </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MouseGlow() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!glowRef.current) return;
      glowRef.current.style.transform = `translate3d(${event.clientX - 380}px, ${
        event.clientY - 380
      }px, 0)`;
    };

    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  return <div ref={glowRef} className="studio-glow" aria-hidden="true" />;
}

function CustomerApiAccessPanel({
  licenseCode,
  setLicenseCode,
  licenseStatus,
  activateLicense,
  apiProvider,
  setApiProvider,
  apiKey,
  setApiKey,
  baseURL,
  setBaseURL,
  textModel,
  setTextModel,
  azureEndpoint,
  setAzureEndpoint,
  azureDeployment,
  setAzureDeployment,
  azureApiVersion,
  setAzureApiVersion,
  saveApiKey,
  testConnection,
  clearApiKey,
  resetLocalConfig,
  isChecking,
  apiConnectionStatus,
  apiConnectionMessage,
  logs,
  showLogs,
  setShowLogs,
  clearLogs,
}: {
  licenseCode: string;
  setLicenseCode: (value: string) => void;
  licenseStatus: LicenseStatus;
  activateLicense: () => void | Promise<void>;
  apiProvider: ApiProvider;
  setApiProvider: (value: ApiProvider) => void;
  apiKey: string;
  setApiKey: (value: string) => void;
  baseURL: string;
  setBaseURL: (value: string) => void;
  textModel: string;
  setTextModel: (value: string) => void;
  azureEndpoint: string;
  setAzureEndpoint: (value: string) => void;
  azureDeployment: string;
  setAzureDeployment: (value: string) => void;
  azureApiVersion: string;
  setAzureApiVersion: (value: string) => void;
  saveApiKey: () => void | Promise<void>;
  testConnection: () => void | Promise<void>;
  clearApiKey: () => void;
  resetLocalConfig: () => void;
  isChecking: boolean;
  apiConnectionStatus: ApiConnectionStatus;
  apiConnectionMessage: string;
  logs: ServerLogEntry[];
  showLogs: boolean;
  setShowLogs: (value: boolean) => void;
  clearLogs: () => void | Promise<void>;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-white/[0.06] bg-white/[0.025] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="label">授权</p>
            <h3 className="mt-1 text-base font-semibold text-white">License</h3>
          </div>
          <span className={`studio-status ${licenseStatus.valid ? "studio-status-ok" : "studio-status-warn"}`}>
            {licenseStatus.valid ? `${licenseStatus.planId?.toUpperCase() || "PRO"} 已激活` : "未激活"}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            className="control min-w-0 flex-1"
            value={licenseCode}
            onChange={(event) => setLicenseCode(event.target.value)}
            placeholder="输入授权码，例如 AIGC-XXXX-2026"
          />
          <button className="studio-secondary-button px-4" onClick={activateLicense}>
            激活
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          {licenseStatus.message || "授权信息只用于打开对应工作流权限。"}
        </p>
      </section>

      <section className="rounded-[28px] border border-white/[0.06] bg-white/[0.025] p-5">
        <p className="label">模型接口</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {apiProviderOptions.map((provider) => (
            <button
              key={provider.value}
              type="button"
              className={`studio-mode-card min-h-[68px] ${apiProvider === provider.value ? "studio-mode-card-active" : ""}`}
              onClick={() => {
                setApiProvider(provider.value);
                if (provider.value === "banana" && !bananaModelOptions.some((item) => item.value === azureDeployment)) {
                  setAzureDeployment("banana-pro");
                }
                if (
                  provider.value === "openai" &&
                  (!azureDeployment || bananaModelOptions.some((item) => item.value === azureDeployment))
                ) {
                  setAzureDeployment(defaultImageModel);
                }
              }}
            >
              <span className="block text-xs font-semibold text-white">{provider.label}</span>
              <span className="mt-1 block text-[10px] leading-4 text-zinc-600">{provider.desc}</span>
            </button>
          ))}
        </div>

        <p className="label mt-5">API Key</p>
        <input
          className="control mt-2"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={`填写 ${providerDisplayName(apiProvider)} API Key`}
        />
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          API 配置保存在当前浏览器。更换电脑或浏览器后，需要重新填写 API Key。
        </p>

        {apiProvider === "azure" ? (
          <div className="mt-4 space-y-3">
            <input
              className="control"
              value={azureEndpoint}
              onChange={(event) => setAzureEndpoint(event.target.value)}
              placeholder="Azure Endpoint，例如 https://xxx.cognitiveservices.azure.com/"
            />
            <input
              className="control"
              value={azureDeployment}
              onChange={(event) => setAzureDeployment(event.target.value)}
              placeholder="Image Deployment，例如 gpt-image-2"
            />
            {isLegacyDallEModel(azureDeployment) ? (
              <p className="text-xs leading-5 text-red-300">该模型不可用，请更换为 {defaultImageModel} 或当前接口支持的模型。</p>
            ) : null}
            <input
              className="control"
              value={textModel}
              onChange={(event) => setTextModel(event.target.value)}
              placeholder="Text Deployment（可选，例如 gpt-4.1-mini）"
            />
            <input
              className="control"
              value={azureApiVersion}
              onChange={(event) => setAzureApiVersion(event.target.value)}
              placeholder="API Version，例如 2025-04-01-preview"
            />
          </div>
        ) : isBananaProvider(apiProvider) ? (
          <div className="mt-4 grid grid-cols-1 gap-3">
            <SelectField
              label="Model"
              value={bananaModelOptions.some((item) => item.value === azureDeployment) ? azureDeployment : "banana-pro"}
              onChange={setAzureDeployment}
              options={bananaModelOptions}
            />
            <input
              className="control"
              value={baseURL}
              onChange={(event) => setBaseURL(event.target.value)}
              placeholder="Base URL（可选）：真实接口地址可后续在这里替换"
            />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <input
              className="control"
              value={baseURL}
              onChange={(event) => setBaseURL(event.target.value)}
              placeholder="Base URL 留空走 OpenAI 原生；填写任意兼容中转，如 https://your-relay.com/v1"
            />
            <input
              className="control"
              value={textModel}
              onChange={(event) => setTextModel(event.target.value)}
              placeholder="Text Model（可选，例如 gpt-4.1-mini）"
            />
            <input
              className="control"
              value={azureDeployment}
              onChange={(event) => setAzureDeployment(event.target.value)}
              placeholder="Image Model，例如 gpt-image-2；请填写当前接口支持的图片模型"
            />
            {isLegacyDallEModel(azureDeployment) ? (
              <p className="text-xs leading-5 text-red-300">该模型不可用，请更换为 {defaultImageModel} 或当前接口支持的模型。</p>
            ) : null}
          </div>
        )}

        <p className="mt-3 text-xs leading-5 text-zinc-500">
          当前实际配置：Provider {providerDisplayName(apiProvider)} / Base URL {baseURL || (apiProvider === "openai" ? "官方默认" : azureEndpoint || "未填写")} / Text Model {textModel || "未填写"} / Image Model {isBananaProvider(apiProvider) ? azureDeployment || defaultGoogleBananaModel : azureDeployment || "未填写"}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs text-zinc-500">
            {apiConnectionMessage
              ? `${apiConnectionStatus === "ok" ? "接口连接正常" : "配置异常"}：${apiConnectionMessage}`
              : apiKey
                ? `已填写：${maskApiKey(apiKey)}`
                : "平台不会保存你的完整 Key"}
          </span>
          <div className="flex gap-2">
            <button className="studio-secondary-button min-h-9 px-3 text-xs" onClick={clearApiKey}>
              清除
            </button>
            <button className="studio-secondary-button min-h-9 px-3 text-xs" onClick={resetLocalConfig}>
              重置本机配置
            </button>
            <button
              className="studio-secondary-button min-h-9 px-3 text-xs"
              onClick={testConnection}
              disabled={isChecking}
            >
              {isChecking ? "测试中" : "测试连接"}
            </button>
            <button
              className="studio-primary-button min-h-9 px-4 text-xs"
              onClick={saveApiKey}
              disabled={isChecking}
            >
              {isChecking ? "认证中" : "保存"}
            </button>
          </div>
        </div>
      </section>

      <details className="rounded-[24px] border border-white/[0.06] bg-white/[0.02] p-5">
        <summary className="cursor-pointer text-sm font-semibold text-white">导出设置</summary>
        <p className="mt-3 text-xs leading-6 text-zinc-500">
          当前仍由平台尺寸锁定、generationSize/exportSize 分离和导出画布逻辑控制最终图片尺寸。
        </p>
      </details>

      <details className="rounded-[24px] border border-white/[0.06] bg-white/[0.02] p-5">
        <summary className="cursor-pointer text-sm font-semibold text-white">开发者日志</summary>
        <div className="mt-4 flex gap-2">
          <button className="studio-secondary-button min-h-9 px-3 text-xs" onClick={() => setShowLogs(!showLogs)}>
            {showLogs ? "隐藏日志" : "查看日志"}
          </button>
          <button className="studio-secondary-button min-h-9 px-3 text-xs" onClick={clearLogs}>
            清空日志
          </button>
        </div>
        {showLogs ? (
          <div className="mt-4 max-h-64 space-y-2 overflow-auto rounded-2xl border border-white/[0.06] bg-black/25 p-3">
            {logs.length ? (
              logs.map((log) => (
                <article key={log.id} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-xs leading-5 text-zinc-400">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-zinc-200">{log.level.toUpperCase()} · {log.scope}</span>
                    <span className="text-zinc-600">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="mt-1">{log.message}</p>
                  {log.detail ? (
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-[10px] leading-4 text-zinc-500">
                      {log.detail}
                    </pre>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="py-6 text-center text-xs text-zinc-600">暂无日志。生成或检测接口后会显示。</p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-xs leading-6 text-zinc-600">日志默认隐藏，避免主界面出现开发测试感。</p>
        )}
      </details>
    </div>
  );
}

function AccessControlPanel({
  licenseCode,
  setLicenseCode,
  licenseStatus,
  activateLicense,
  apiProvider,
  setApiProvider,
  apiKey,
  setApiKey,
  baseURL,
  setBaseURL,
  azureEndpoint,
  setAzureEndpoint,
  azureDeployment,
  setAzureDeployment,
  azureApiVersion,
  setAzureApiVersion,
  saveApiKey,
  clearApiKey,
}: {
  licenseCode: string;
  setLicenseCode: (value: string) => void;
  licenseStatus: LicenseStatus;
  activateLicense: () => void | Promise<void>;
  apiProvider: ApiProvider;
  setApiProvider: (value: ApiProvider) => void;
  apiKey: string;
  setApiKey: (value: string) => void;
  baseURL: string;
  setBaseURL: (value: string) => void;
  azureEndpoint: string;
  setAzureEndpoint: (value: string) => void;
  azureDeployment: string;
  setAzureDeployment: (value: string) => void;
  azureApiVersion: string;
  setAzureApiVersion: (value: string) => void;
  saveApiKey: () => void | Promise<void>;
  clearApiKey: () => void;
}) {
  return (
    <div className="mb-4 space-y-3 border border-line bg-paper p-3">
      <div>
        <p className="label">工具权限</p>
        <div className="mt-2 flex gap-2">
          <input
            className="min-w-0 flex-1 border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
            value={licenseCode}
            onChange={(event) => setLicenseCode(event.target.value)}
            placeholder="输入授权码，例如 AIGC-XXXX-2026"
          />
          <button className="border border-line bg-ink px-3 py-2 text-sm text-white" onClick={activateLicense}>
            激活
          </button>
        </div>
        <p className={`mt-2 text-xs ${licenseStatus.valid ? "text-green-700" : "text-neutral-500"}`}>
          {licenseStatus.valid ? `${licenseStatus.planId?.toUpperCase()} 已激活` : "当前未激活授权码"}
        </p>
      </div>

      <div>
        <p className="label">API 密钥</p>
        <input
          className="mt-2 w-full border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="粘贴 OpenAI sk-... 或 Azure OpenAI 密钥，只保存在本机浏览器"
        />
        <p className="mt-1 text-xs text-neutral-500">
          系统会自动识别 OpenAI / Azure OpenAI。正常只需要填写这一项。
        </p>
        <details className="mt-2 text-xs text-neutral-600">
          <summary className="cursor-pointer select-none">高级选项：自定义 OPENAI_BASE_URL</summary>
          <input
            className="mt-2 w-full border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
            value={baseURL}
            onChange={(event) => setBaseURL(event.target.value)}
            placeholder="可留空；仅普通 OpenAI 代理或完整 Azure 终结点需要填写"
          />
        </details>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-neutral-500">
            {apiKey ? `已填写：${maskApiKey(apiKey)}` : "平台不会保存你的完整 Key"}
          </span>
          <div className="flex gap-2">
            <button className="border border-line bg-white px-3 py-1.5 text-xs" onClick={clearApiKey}>
              清除
            </button>
            <button className="border border-line bg-white px-3 py-1.5 text-xs" onClick={saveApiKey}>
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
function TextWorkflow(props: {
  prompt: string;
  setPrompt: (value: string) => void;
  style: StyleKey;
  setStyle: (value: StyleKey) => void;
  ratio: Ratio;
  setRatio: (value: Ratio) => void;
  size: ImageSize;
  setSize: (value: ImageSize) => void;
  quality: ImageQuality;
  setQuality: (value: ImageQuality) => void;
  platform: EcommercePlatformId;
  setPlatform: (value: EcommercePlatformId) => void;
  count: number;
  setCount: (value: number) => void;
  optimize: () => void;
  isOptimizing: boolean;
}) {
  return (
    <>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label" htmlFor="text-prompt">
            Prompt
          </label>
          <button
            className="secondary-button px-2.5 py-1.5"
            onClick={props.optimize}
            disabled={props.isOptimizing}
          >
            {props.isOptimizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            优化
          </button>
        </div>
        <textarea
          id="text-prompt"
          className="control min-h-36 resize-none leading-6"
          value={props.prompt}
          onChange={(event) => props.setPrompt(event.target.value)}
          placeholder="描述你想生成的图片，也可以直接写目标市场和语言。例如：面向美国亚马逊市场，英文卖点文案，高端科技感产品主图。"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InputField
          label="视觉方向 / 风格补充"
          value={["realistic", "minimalEcommerce", "tech", "poster", "luxury"].includes(props.style) ? "" : props.style}
          onChange={(value) => props.setStyle(value as StyleKey)}
          placeholder="例如：巴西电商促销风、葡萄牙语标题、复古胶片风、冷色科技感"
        />
        <SelectField
          label="图片比例"
          value={props.ratio}
          onChange={(value) => {
            const nextRatio = value as Ratio;
            props.setRatio(nextRatio);
            props.setSize(ratioToSize[nextRatio]);
          }}
          options={ratioOptions()}
        />
        <SelectField
          label="质量"
          value={props.quality}
          onChange={(value) => props.setQuality(value as ImageQuality)}
          options={qualities.map((item) => ({ value: item, label: qualityLabels[item] }))}
        />
        <PlatformField value={props.platform} onChange={props.setPlatform} />
      </div>

      <SegmentedNumbers
        label="输出数量"
        values={[1, 2, 3, 4]}
        value={props.count}
        setValue={props.setCount}
      />
    </>
  );
}

function MimicWorkflow(props: {
  reference: File | null;
  setReference: (file: File | null) => void;
  product: File | null;
  setProduct: (file: File | null) => void;
  referencePreview: string;
  productPreview: string;
  productName: string;
  setProductName: (value: string) => void;
  sellingPoints: string;
  setSellingPoints: (value: string) => void;
  extra: string;
  setExtra: (value: string) => void;
  outputType: MimicType;
  setOutputType: (value: MimicType) => void;
  dimensions: MimicDimension[];
  setDimensions: (value: MimicDimension[]) => void;
  strength: MimicStrength;
  setStrength: (value: MimicStrength) => void;
  ratio: Ratio;
  setRatio: (value: Ratio) => void;
  count: number;
  setCount: (value: number) => void;
  quality: ImageQuality;
  setQuality: (value: ImageQuality) => void;
  platform: EcommercePlatformId;
  setPlatform: (value: EcommercePlatformId) => void;
  protectionLevel: ProductProtectionLevel;
  setProtectionLevel: (value: ProductProtectionLevel) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <UploadBox
          label="参考图"
          file={props.reference}
          preview={props.referencePreview}
          setFile={props.setReference}
        />
        <UploadBox
          label="产品图"
          file={props.product}
          preview={props.productPreview}
          setFile={props.setProduct}
        />
      </div>
      <div className="border border-blue-100 bg-white px-3 py-2 text-sm leading-6 text-neutral-500">
        参考图只用于学习风格、构图、色调和版式；产品图会作为唯一产品主体。若生成失败，请在设置中心检测当前图片接口是否支持带参考图的生成。
      </div>

      <InputField
        label="产品名称"
        value={props.productName}
        onChange={props.setProductName}
        placeholder="例如：智能筋膜枪 Pro"
      />
      <TextareaField
        label="卖点描述"
        value={props.sellingPoints}
        onChange={props.setSellingPoints}
        placeholder="输入核心卖点、材质、功能、目标人群..."
      />
      <TextareaField
        label="补充要求"
        value={props.extra}
        onChange={props.setExtra}
        placeholder="参考图主导风格、构图、排版、色调和光影；也可以写目标市场和语言，例如：巴西促销视觉，葡萄牙语标题。"
      />

      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="生成类型"
          value={props.outputType}
          onChange={(value) => props.setOutputType(value as MimicType)}
          options={mimicTypes.map((item) => ({ value: item, label: item }))}
        />
        <SelectField
          label="模仿强度"
          value={props.strength}
          onChange={(value) => props.setStrength(value as MimicStrength)}
          options={mimicStrengths.map((item) => ({ value: item, label: item }))}
        />
        <SelectField
          label="比例"
          value={props.ratio}
          onChange={(value) => props.setRatio(value as Ratio)}
          options={ratioOptions()}
        />
        <SelectField
          label="输出数量"
          value={String(props.count)}
          onChange={(value) => props.setCount(Number(value))}
          options={mimicCounts.map((item) => ({
            value: String(item),
            label: String(item),
          }))}
        />
      </div>

      <div>
        <p className="label mb-2">模仿维度</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-full mb-3 grid grid-cols-2 gap-3">
            <QualityField value={props.quality} onChange={props.setQuality} />
            <PlatformField value={props.platform} onChange={props.setPlatform} />
          </div>
          <div className="col-span-full">
            <ProductProtectionPanel
              level={props.protectionLevel}
              setLevel={props.setProtectionLevel}
            />
          </div>
          {mimicDimensions.map((dimension) => {
            const checked = props.dimensions.includes(dimension);
            return (
              <button
                key={dimension}
                className={`border px-3 py-2 text-left text-sm transition ${
                  checked
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-white text-neutral-700"
                }`}
                onClick={() =>
                  props.setDimensions(
                    checked
                      ? props.dimensions.filter((item) => item !== dimension)
                      : [...props.dimensions, dimension],
                  )
                }
              >
                {dimension}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

const protectionLevelOptions = [
  { value: "standard", label: "标准模式" },
  { value: "high-fidelity", label: "高保真模式" },
  { value: "strict", label: "严格锁定模式" },
];
const detailMarketOptions = ["中国", "美国", "巴西", "墨西哥", "东南亚", "欧洲"];
const detailLanguageOptions = ["中文", "英文", "葡语（巴西）", "西语（墨西哥）", "俄文"];
const detailPlatformOptions = [
  "TikTok Shop",
  "Shopee",
  "Lazada",
  "Amazon / 亚马逊",
  "WB/OZON",
  "独立站",
  "小红书",
  "抖音",
  "通用电商",
];
const detailCountOptions = [3, 5, 9, 12];

function ProductProtectionPanel(props: {
  level: ProductProtectionLevel;
  setLevel: (value: ProductProtectionLevel) => void;
}) {
  const locked = [
    "产品主体锁定",
    "颜色严格保留",
    "结构严格保留",
    "logo 严格保留",
    "配件严格保留",
  ];

  return (
    <div className="border border-amber-200 bg-amber-50 p-3">
      <SelectField
        label="产品保护等级"
        value={props.level}
        onChange={(value) => props.setLevel(value as ProductProtectionLevel)}
        options={protectionLevelOptions}
      />
      <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-amber-800">
        {locked.map((item) => (
          <span key={item} className="border border-amber-200 bg-white px-2 py-1">
            {item}：开启
          </span>
        ))}
      </div>
    </div>
  );
}

function StudioAccordion({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="studio-accordion group">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3 text-sm font-semibold text-zinc-200">
        <span>{title}</span>
        <span className="text-xs text-zinc-500 transition group-open:rotate-180">?</span>
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

function ProductWorkflow(props: {
  product: File | null;
  setProduct: (file: File | null) => void;
  productPreview: string;
  productName: string;
  setProductName: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  brand: string;
  setBrand: (value: string) => void;
  sellingPoints: string;
  setSellingPoints: (value: string) => void;
  specs: string;
  setSpecs: (value: string) => void;
  prompt: string;
  setPrompt: (value: string) => void;
  ratio: Ratio;
  setRatio: (value: Ratio) => void;
  quality: ImageQuality;
  setQuality: (value: ImageQuality) => void;
  platform: EcommercePlatformId;
  setPlatform: (value: EcommercePlatformId) => void;
  protectionLevel: ProductProtectionLevel;
  setProtectionLevel: (value: ProductProtectionLevel) => void;
}) {
  return (
    <>
      <UploadBox
        label="产品主图"
        file={props.product}
        preview={props.productPreview}
        setFile={props.setProduct}
      />
      <div className="grid grid-cols-2 gap-4">
        <InputField
          label="产品名称"
          value={props.productName}
          onChange={props.setProductName}
          placeholder="例如：WF6 智能耳机"
        />
        <InputField
          label="产品品类"
          value={props.category}
          onChange={props.setCategory}
          placeholder="例如：蓝牙耳机"
        />
      </div>
      <InputField
        label="品牌名称"
        value={props.brand}
        onChange={props.setBrand}
        placeholder="可选：用于统一商业视觉语气"
      />
      <TextareaField
        label="卖点描述"
        value={props.sellingPoints}
        onChange={props.setSellingPoints}
        placeholder="输入核心卖点、目标人群、使用场景和转化诉求。例如：长续航、主动降噪、通勤运动两用。"
      />
      <TextareaField
        label="产品参数"
        value={props.specs}
        onChange={props.setSpecs}
        placeholder="输入规格、材质、容量、颜色、包装清单等参数，系统会作为产品信息参考。"
      />
      <TextareaField
        label="视觉方向 / 风格补充"
        value={props.prompt}
        onChange={props.setPrompt}
        placeholder="描述背景、场景、光影、陈列和商业氛围，也可写目标市场和语言。例如：面向美国 Amazon，英文卖点，高端科技感。产品只锁定外观，不锁定风格。"
      />
      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="常用比例"
          value={props.ratio}
          onChange={(value) => props.setRatio(value as Ratio)}
          options={ratioOptions()}
        />
        <PlatformField value={props.platform} onChange={props.setPlatform} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <QualityField value={props.quality} onChange={props.setQuality} />
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 text-xs leading-5 text-zinc-500">
          平台规则：已锁定最终导出尺寸
        </div>
      </div>
      <StudioAccordion title="产品保护等级">
        <ProductProtectionPanel
          level={props.protectionLevel}
          setLevel={props.setProtectionLevel}
        />
      </StudioAccordion>
    </>
  );
}

function ProductVariantWorkflow(props: {
  product: File | null;
  setProduct: (file: File | null) => void;
  productPreview: string;
  prompt: string;
  setPrompt: (value: string) => void;
  outputType: string;
  setOutputType: (value: string) => void;
  style: string;
  setStyle: (value: string) => void;
  ratio: Ratio;
  setRatio: (value: Ratio) => void;
  count: number;
  setCount: (value: number) => void;
  quality: ImageQuality;
  setQuality: (value: ImageQuality) => void;
  platform: EcommercePlatformId;
  setPlatform: (value: EcommercePlatformId) => void;
  protectionLevel: ProductProtectionLevel;
  setProtectionLevel: (value: ProductProtectionLevel) => void;
}) {
  return (
    <>
      <UploadBox
        label="产品图"
        file={props.product}
        preview={props.productPreview}
        setFile={props.setProduct}
      />
      <TextareaField
        label="变体提示词"
        value={props.prompt}
        onChange={props.setPrompt}
        placeholder="描述想变化的视觉方向、场景和市场语言。例如：巴西电商促销风，葡萄牙语标题，高饱和热带广告风。"
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="输出类型"
          value={props.outputType}
          onChange={props.setOutputType}
          options={productVariantOutputTypes.map((item) => ({ value: item, label: item }))}
        />
        <InputField
          label="视觉方向 / 风格补充"
          value={props.style}
          onChange={props.setStyle}
          placeholder="例如：冷色科技感、英文卖点、轻奢杂志大片、热带广告风"
        />
        <SelectField
          label="比例"
          value={props.ratio}
          onChange={(value) => props.setRatio(value as Ratio)}
          options={ratioOptions()}
        />
        <QualityField value={props.quality} onChange={props.setQuality} />
      </div>
      <SegmentedNumbers
        label="输出数量"
        values={[1, 2, 4]}
        value={props.count}
        setValue={props.setCount}
      />
      <PlatformField value={props.platform} onChange={props.setPlatform} />
      <ProductProtectionPanel
        level={props.protectionLevel}
        setLevel={props.setProtectionLevel}
      />
    </>
  );
}

function DetailSuiteWorkflow(props: {
  product: File | null;
  setProduct: (file: File | null) => void;
  productPreview: string;
  productName: string;
  setProductName: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  brand: string;
  setBrand: (value: string) => void;
  sellingPoints: string;
  setSellingPoints: (value: string) => void;
  specs: string;
  setSpecs: (value: string) => void;
  material: string;
  setMaterial: (value: string) => void;
  functions: string;
  setFunctions: (value: string) => void;
  packageList: string;
  setPackageList: (value: string) => void;
  useScenes: string;
  setUseScenes: (value: string) => void;
  audience: string;
  setAudience: (value: string) => void;
  afterSales: string;
  setAfterSales: (value: string) => void;
  visualPrompt: string;
  setVisualPrompt: (value: string) => void;
  step: number;
  setStep: (value: number) => void;
  count: number;
  setCount: (value: number) => void;
  market: DetailMarket;
  setMarket: (value: DetailMarket) => void;
  language: DetailLanguage;
  setLanguage: (value: DetailLanguage) => void;
  workflowPlatform: DetailPlatform;
  setWorkflowPlatform: (value: DetailPlatform) => void;
  style: string;
  setStyle: (value: string) => void;
  ratio: Ratio;
  setRatio: (value: Ratio) => void;
  quality: ImageQuality;
  setQuality: (value: ImageQuality) => void;
  textMode: "editable-layers" | "image-text";
  setTextMode: (value: "editable-layers" | "image-text") => void;
  blueprints: DetailBlueprintItem[];
  updateBlueprint: (id: string, patch: Partial<DetailBlueprintItem>) => void;
  generateBlueprints: () => void;
  generateBatch: () => void;
}) {
  const stepLabels = ["产品资料", "套图规划", "蓝图编辑", "批量生成"];

  return (
    <>
      <div className="grid grid-cols-4 gap-1 border border-line bg-paper p-1">
        {stepLabels.map((label, index) => {
          const step = index + 1;
          return (
            <button
              key={label}
              className={`px-2 py-2 text-xs font-medium ${
                props.step === step ? "bg-ink text-white" : "text-neutral-600"
              }`}
              onClick={() => props.setStep(step)}
            >
              {step}. {label}
            </button>
          );
        })}
      </div>

      {props.step === 1 && (
        <>
          <UploadBox
            label="产品主图"
            file={props.product}
            preview={props.productPreview}
            setFile={props.setProduct}
          />
          <div className="grid grid-cols-2 gap-4">
            <InputField label="产品名称" value={props.productName} onChange={props.setProductName} />
            <InputField label="产品品类" value={props.category} onChange={props.setCategory} />
          </div>
          <TextareaField label="核心卖点" value={props.sellingPoints} onChange={props.setSellingPoints} />
          <TextareaField
            label="视觉方向 / 风格补充"
            value={props.visualPrompt}
            onChange={props.setVisualPrompt}
            placeholder="描述整套详情图的视觉方向，也可以直接写目标市场和语言。例如：面向美国 Amazon，英文卖点卡片，产品大图靠左，右侧保留信息区。"
          />
          <StudioAccordion title="产品扩展信息">
            <InputField label="品牌名称" value={props.brand} onChange={props.setBrand} />
            <TextareaField label="产品参数" value={props.specs} onChange={props.setSpecs} />
            <TextareaField label="材质信息" value={props.material} onChange={props.setMaterial} />
            <TextareaField label="功能说明" value={props.functions} onChange={props.setFunctions} />
            <TextareaField label="包装清单" value={props.packageList} onChange={props.setPackageList} />
            <TextareaField label="使用场景" value={props.useScenes} onChange={props.setUseScenes} />
            <TextareaField label="适用人群" value={props.audience} onChange={props.setAudience} />
            <TextareaField label="售后信息" value={props.afterSales} onChange={props.setAfterSales} />
          </StudioAccordion>
        </>
      )}

      {props.step === 2 && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="生成张数"
              value={String(props.count)}
              onChange={(value) => props.setCount(Number(value))}
              options={detailCountOptions.map((item) => ({
                value: String(item),
                label: item === 12 ? "自定义 12 张" : `${item} 张`,
              }))}
            />
            <SelectField
              label="电商平台"
              value={props.workflowPlatform}
              onChange={(value) => props.setWorkflowPlatform(value as DetailPlatform)}
              options={detailPlatformOptions.map((item) => ({ value: item, label: item }))}
            />
            <InputField
              label="视觉方向 / 风格补充"
              value={props.style}
              onChange={props.setStyle}
              placeholder="例如：巴西电商促销风，葡萄牙语标题，高饱和夏日场景"
            />
            <SelectField
              label="常用比例"
              value={props.ratio}
              onChange={(value) => props.setRatio(value as Ratio)}
              options={ratioOptions()}
            />
          </div>
          <TextareaField
            label="套图生成提示词"
            value={props.visualPrompt}
            onChange={props.setVisualPrompt}
            placeholder="控制整套详情图的背景、场景、光影、卡片风格、排版、目标市场和文案语言。默认文字可做后期可编辑层。"
          />
          <StudioAccordion title="高级输出设置">
            <div className="grid grid-cols-2 gap-4">
              <QualityField value={props.quality} onChange={props.setQuality} />
              <SelectField
                label="文字模式"
                value={props.textMode}
                onChange={(value) => props.setTextMode(value as "editable-layers" | "image-text")}
                options={[
                  { value: "editable-layers", label: "可编辑文字层" },
                  { value: "image-text", label: "图片内生成文字" },
                ]}
              />
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 text-xs leading-6 text-zinc-400">
              尺寸策略由平台规则自动锁定，生成尺寸与最终导出尺寸分离处理。
            </div>
          </StudioAccordion>
          <button className="secondary-button w-full justify-center" onClick={props.generateBlueprints}>
            生成详情图蓝图
          </button>
        </>
      )}

      {props.step === 3 && (
        <div className="space-y-3">
          <button className="secondary-button w-full justify-center" onClick={props.generateBlueprints}>
            重新生成蓝图
          </button>
          {props.blueprints.map((item) => (
            <div key={item.id} className="border border-line bg-paper p-3">
              <p className="mb-2 text-sm font-semibold text-ink">
                第 {item.index} 张 · {item.type}
              </p>
              <InputField
                label="主标题"
                value={item.title}
                onChange={(value) => props.updateBlueprint(item.id, { title: value })}
              />
              <InputField
                label="副标题"
                value={item.subtitle}
                onChange={(value) => props.updateBlueprint(item.id, { subtitle: value })}
              />
              <TextareaField
                label="卖点"
                value={item.sellingPoints.join("\n")}
                onChange={(value) =>
                  props.updateBlueprint(item.id, {
                    sellingPoints: value.split("\n").filter(Boolean),
                  })
                }
              />
              <InputField
                label="版式"
                value={item.layout}
                onChange={(value) => props.updateBlueprint(item.id, { layout: value })}
              />
              {showWorkflowInternals ? (
                <TextareaField
                  label="最终 Prompt"
                  value={item.prompt}
                  onChange={(value) => props.updateBlueprint(item.id, { prompt: value })}
                />
              ) : (
                <div className="border border-line bg-white px-3 py-2 text-xs text-neutral-500">
                  最终 Prompt 已隐藏，防止工作流设计被复制。
                </div>
              )}
            </div>
          ))}
          {!props.blueprints.length && (
            <div className="border border-dashed border-line bg-paper p-4 text-sm text-neutral-500">
              还没有蓝图，请先到 Step 2 生成详情图蓝图。
            </div>
          )}
        </div>
      )}

      {props.step === 4 && (
        <>
          <div className="border border-line bg-paper p-3 text-sm leading-6 text-neutral-600">
            将按当前蓝图批量生成整套详情图。默认使用可编辑文字层模式，AI 主要生成背景、产品展示、光影和信息区域。
          </div>
          <button className="secondary-button w-full justify-center" onClick={props.generateBatch}>
            批量生成整套详情图
          </button>
        </>
      )}
    </>
  );
}

function DetailWorkflow(props: {
  product: File | null;
  setProduct: (file: File | null) => void;
  productPreview: string;
  productName: string;
  setProductName: (value: string) => void;
  sellingPoints: string;
  setSellingPoints: (value: string) => void;
  templateId: DetailTemplateId;
  setTemplateId: (value: DetailTemplateId) => void;
  ratio: Ratio;
  setRatio: (value: Ratio) => void;
  quality: ImageQuality;
  setQuality: (value: ImageQuality) => void;
  platform: EcommercePlatformId;
  setPlatform: (value: EcommercePlatformId) => void;
}) {
  return (
    <>
      <UploadBox
        label="产品图"
        file={props.product}
        preview={props.productPreview}
        setFile={props.setProduct}
      />
      <InputField
        label="产品名称"
        value={props.productName}
        onChange={props.setProductName}
        placeholder="例如：便携式冲牙器"
      />
      <TextareaField
        label="卖点信息"
        value={props.sellingPoints}
        onChange={props.setSellingPoints}
        placeholder="输入功能、参数、材质、适用场景、对比优势..."
      />
      <SelectField
        label="详情图模板"
        value={props.templateId}
        onChange={(value) => props.setTemplateId(value as DetailTemplateId)}
        options={detailTemplates.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
      />
      <SelectField
        label="比例"
        value={props.ratio}
        onChange={(value) => props.setRatio(value as Ratio)}
        options={ratioOptions()}
      />
      <div className="grid grid-cols-2 gap-3">
        <QualityField value={props.quality} onChange={props.setQuality} />
        <PlatformField value={props.platform} onChange={props.setPlatform} />
      </div>
    </>
  );
}

function PosterWorkflow(props: {
  product: File | null;
  setProduct: (file: File | null) => void;
  logo: File | null;
  setLogo: (file: File | null) => void;
  productPreview: string;
  logoPreview: string;
  productName: string;
  setProductName: (value: string) => void;
  title: string;
  setTitle: (value: string) => void;
  subtitle: string;
  setSubtitle: (value: string) => void;
  campaignInfo: string;
  setCampaignInfo: (value: string) => void;
  posterType: PosterType;
  setPosterType: (value: PosterType) => void;
  posterStyle: PosterStyle;
  setPosterStyle: (value: PosterStyle) => void;
  ratio: Ratio;
  setRatio: (value: Ratio) => void;
  quality: ImageQuality;
  setQuality: (value: ImageQuality) => void;
  platform: EcommercePlatformId;
  setPlatform: (value: EcommercePlatformId) => void;
  protectionLevel: ProductProtectionLevel;
  setProtectionLevel: (value: ProductProtectionLevel) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <UploadBox
          label="产品图"
          file={props.product}
          preview={props.productPreview}
          setFile={props.setProduct}
        />
        <UploadBox
          label="Logo"
          file={props.logo}
          preview={props.logoPreview}
          setFile={props.setLogo}
        />
      </div>
      <InputField
        label="产品名称"
        value={props.productName}
        onChange={props.setProductName}
        placeholder="例如：智能恒温杯"
      />
      <InputField
        label="主标题"
        value={props.title}
        onChange={props.setTitle}
        placeholder="例如：新品上市"
      />
      <InputField
        label="副标题"
        value={props.subtitle}
        onChange={props.setSubtitle}
        placeholder="例如：轻巧便携，全天候保温"
      />
      <InputField
        label="活动信息"
        value={props.campaignInfo}
        onChange={props.setCampaignInfo}
        placeholder="例如：新品首发 / 限时折扣 / Prime Day"
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="海报类型"
          value={props.posterType}
          onChange={(value) => props.setPosterType(value as PosterType)}
          options={posterTypes.map((item) => ({ value: item, label: item }))}
        />
        <InputField
          label="视觉方向 / 风格补充"
          value={props.posterStyle}
          onChange={(value) => props.setPosterStyle(value as PosterStyle)}
          placeholder="例如：高饱和热带广告风、英文标题、赛博促销、轻奢杂志大片"
        />
        <SelectField
          label="常用比例"
          value={props.ratio}
          onChange={(value) => props.setRatio(value as Ratio)}
          options={ratioOptions()}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <QualityField value={props.quality} onChange={props.setQuality} />
        <PlatformField value={props.platform} onChange={props.setPlatform} />
      </div>
      <ProductProtectionPanel
        level={props.protectionLevel}
        setLevel={props.setProtectionLevel}
      />
    </>
  );
}

function UploadBox({
  label,
  file,
  preview,
  setFile,
}: {
  label: string;
  file: File | null;
  preview: string;
  setFile: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] || null;
    if (!selectedFile) {
      setFile(null);
      return;
    }

    setIsCompressing(true);
    try {
      setFile(await compressUploadImage(selectedFile));
    } catch {
      setFile(selectedFile);
    } finally {
      setIsCompressing(false);
      event.target.value = "";
    }
  }

  return (
    <div>
      <p className="label mb-2">{label}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        className="studio-upload-button w-full max-w-none justify-center"
        onClick={() => inputRef.current?.click()}
        disabled={isCompressing}
      >
        {isCompressing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {file ? "更换图片" : "上传图片"}
      </button>
      {file && (
        <p className="mt-2 text-xs leading-5 text-neutral-500">
          {formatFileSize(file.size)}
          {file.name.includes("-optimized") ? " · 已优化上传" : ""}
        </p>
      )}
      {preview && (
        <img
          src={preview}
          alt={`${label}预览`}
          className="mt-3 aspect-square w-full bg-paper object-cover"
        />
      )}
    </div>
  );
}

async function compressUploadImage(file: File) {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const maxDimension = 1536;
  const shouldResize =
    Math.max(bitmap.width, bitmap.height) > maxDimension || file.size > 1_500_000;

  if (!shouldResize) {
    bitmap.close?.();
    return file;
  }

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close?.();
    return file;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, outputType, outputType === "image/jpeg" ? 0.82 : undefined);
  });

  if (!blob || blob.size >= file.size) {
    return file;
  }

  const extension = outputType === "image/png" ? "png" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}-optimized.${extension}`, {
    type: outputType,
    lastModified: Date.now(),
  });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function mergeHistory(primary: HistoryItem[], secondary: HistoryItem[]) {
  const byId = new Map<string, HistoryItem>();

  for (const item of [...primary, ...secondary]) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }

  return Array.from(byId.values())
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
    .slice(0, 80);
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label>
      <span className="label mb-2 block">{label}</span>
      <input
        className="control w-full max-w-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label>
      <span className="label mb-2 block">{label}</span>
      <textarea
        className="control min-h-[128px] w-full max-w-none resize-none leading-relaxed"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function QualityField({
  value,
  onChange,
}: {
  value: ImageQuality;
  onChange: (value: ImageQuality) => void;
}) {
  return (
    <SelectField
      label="质量"
      value={value}
      onChange={(nextValue) => onChange(nextValue as ImageQuality)}
      options={qualities.map((item) => ({ value: item, label: qualityLabels[item] }))}
    />
  );
}

function PlatformField({
  value,
  onChange,
}: {
  value: EcommercePlatformId;
  onChange: (value: EcommercePlatformId) => void;
}) {
  return (
    <SelectField
      label="电商平台"
      value={value}
      onChange={(nextValue) => onChange(nextValue as EcommercePlatformId)}
      options={ecommercePlatforms
        .filter((item) => item.id !== "ozon")
        .map((item) => ({
          value: item.id,
          label: item.name,
        }))}
    />
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="label mb-2 block">{label}</span>
      <select
        className="control w-full max-w-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SegmentedNumbers({
  label,
  values,
  value,
  setValue,
}: {
  label: string;
  values: number[];
  value: number;
  setValue: (value: number) => void;
}) {
  return (
    <div>
      <label className="label mb-2 block">{label}</label>
      <div className="grid grid-cols-4 gap-2">
        {values.map((item) => (
          <button
            key={item}
            className={`border px-3 py-2 text-sm font-medium transition ${
              value === item
                ? "border-ink bg-ink text-white"
                : "border-line bg-white text-neutral-700 hover:border-neutral-400"
            }`}
            onClick={() => setValue(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function useFilePreview(
  file: File | null,
  setPreview: (value: string) => void,
  setThumb: (value: string) => void,
) {
  useEffect(() => {
    if (!file) {
      setPreview("");
      setThumb("");
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);
    createThumbnail(file).then(setThumb).catch(() => setThumb(""));
    return () => URL.revokeObjectURL(url);
  }, [file, setPreview, setThumb]);
}

async function createThumbnail(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const size = 160;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return "";

  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
  return canvas.toDataURL("image/jpeg", 0.58);
}

function tabTitle(tab: TabKey) {
  const map: Record<TabKey, string> = {
    text: "文本生图",
    mimic: "参考图模仿生图",
    product: "产品图工作流",
    variant: "产品风格变体",
    detail: "电商详情图",
    poster: "海报工作流",
  };
  return map[tab];
}

function formatDuration(ms: number | null | undefined) {
  const totalSeconds = Math.max(0, Math.round((ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds} 秒`;
  }

  return `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`;
}

function logBorderClass(level: ServerLogEntry["level"]) {
  const map: Record<ServerLogEntry["level"], string> = {
    info: "border-blue-100",
    warn: "border-amber-200",
    error: "border-red-200",
    success: "border-emerald-200",
  };
  return map[level];
}

function logTextClass(level: ServerLogEntry["level"]) {
  const map: Record<ServerLogEntry["level"], string> = {
    info: "text-blue-700",
    warn: "text-amber-700",
    error: "text-red-700",
    success: "text-emerald-700",
  };
  return map[level];
}
