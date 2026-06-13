import type { Ratio } from "@/lib/workflow";
import type {
  ProductProtectionSettings,
  ProductVariantOutputType,
  ProductVisualStyle,
  ProductWorkflowOutputType,
} from "@/types/workflow";

const antiTemplateInstruction =
  "Do not reuse built-in sample products or default showroom compositions. Unless the user explicitly asks for them, do not default to earbuds, perfume bottles, skincare bottles, pet toys, blue tech glow, centered white-background packshots, or generic luxury beige studio scenes.";

export function buildProductProtectionPrompt(protection?: Partial<ProductProtectionSettings>) {
  const level = protection?.level || "strict";
  const strict =
    level === "strict"
      ? "严格锁定模式：不允许重绘产品主体，不允许改变产品颜色、结构、按键、表盘、接口、轮廓、logo、配件。"
      : level === "high-fidelity"
        ? "高保真模式：必须高度保持上传产品的真实外观，仅允许轻微光影融合。"
        : "标准模式：保持产品主体一致，避免明显变形或换款。";

  return [
    "产品保护规则：Use the uploaded product image as the fixed main product subject.",
    "Keep the exact product appearance, color, shape, structure, buttons, screen, ports, logo, accessories, and silhouette unchanged.",
    "Only change the background, lighting, scene, layout, mood, commercial visual style, selling-point cards, text areas, and decorative elements.",
    "Do not redesign, replace, recolor, or invent a new product.",
    "中文要求：请将上传的产品图作为固定主体，保持产品外观、颜色、结构、按键、屏幕、接口、logo、配件、轮廓完全一致。只改变背景、光影、场景、排版、氛围、商业视觉风格、卖点卡片和装饰元素。不要重新设计产品，不要生成另一款产品。",
    strict,
  ].join("\n");
}

export function buildTextToImagePrompt(input: {
  prompt: string;
  style: string;
  ratio: Ratio;
  platformPrompt?: string;
}) {
  return [
    "Text-to-image workflow. The user's prompt defines the subject and visual language; do not force it into a product packshot.",
    input.prompt,
    `风格：${input.style}`,
    `比例：${input.ratio}`,
    input.platformPrompt,
    "Decide composition, scene, palette, camera/viewpoint, and information density from the user prompt. It may be a cover, campaign visual, concept scene, lifestyle image, background, or ecommerce creative.",
    antiTemplateInstruction,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildReferenceMimicPrompt(input: {
  productName: string;
  sellingPoints: string;
  extraRequirements: string;
  outputType: string;
  dimensions: string[];
  strength: string;
  ratio: Ratio;
  protection?: Partial<ProductProtectionSettings>;
  platformPrompt?: string;
}) {
  const typeGuide: Record<string, string> = {
    产品图:
      "输出导向：商品首图/货架图。产品占画面主视觉，背景和道具服务于产品识别，避免海报式大标题和复杂信息块。",
    详情图:
      "输出导向：详情页单屏模块。需要有清晰的信息区域、卖点卡片、局部展示或功能场景，适合后期叠加可编辑文字。",
    海报图:
      "输出导向：营销海报/活动视觉。允许更强的空间层次、标题留白、氛围光和视觉冲击，但产品仍必须清晰可信。",
  };
  const strengthGuide: Record<string, string> = {
    低: "低强度：只借参考图的大方向和情绪，构图、背景、道具和色彩可以明显重新设计。",
    中: "中强度：借鉴参考图的主要构图关系、色彩气质和视觉节奏，但主体内容必须替换为上传产品。",
    高: "高强度：更接近参考图的构图、排版节奏、光影和色调，同时严禁复制参考图的原商品、品牌、文案和人物。",
  };
  const dimensionGuide = input.dimensions.length
    ? `重点模仿维度：${input.dimensions.join("、")}。未选择的维度可以自由重构，避免所有结果套用同一模板。`
    : "重点模仿维度：风格、构图、排版、色调、氛围。";

  return [
    "参考图模仿生图工作流。",
    "参考图只用于模仿风格、构图、排版、色调、氛围和材质表现，不得复制参考图中的品牌、logo、人物、产品或文案。",
    "产品图是唯一真实产品主体。",
    buildProductProtectionPrompt(input.protection),
    `产品名称：${input.productName || "根据上传产品图判断"}`,
    `卖点：${input.sellingPoints || "突出产品质感、核心功能和电商转化价值"}`,
    `生成类型：${input.outputType}`,
    typeGuide[input.outputType] || "输出导向：按用户选择的电商用途生成，不要套用固定样片模板。",
    dimensionGuide,
    strengthGuide[input.strength] || `模仿强度：${input.strength}`,
    `比例：${input.ratio}`,
    input.platformPrompt,
    `补充要求：${input.extraRequirements || "高级、干净、适合电商展示"}`,
    "差异化要求：根据本次上传的参考图和产品图重新组织画面，不要复用内置示例里的耳机、香氛、护肤、宠物玩具等默认商品意象。",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildProductWorkflowPrompt(input: {
  productName: string;
  category: string;
  userPrompt?: string;
  outputType?: ProductWorkflowOutputType | string;
  backgroundType?: string;
  style?: ProductVisualStyle | string;
  ratio: Ratio;
  protection?: Partial<ProductProtectionSettings>;
  platformPrompt?: string;
}) {
  const outputGuide: Record<string, string> = {
    白底图:
      "Output type guide: marketplace packshot. Use plain white or very light neutral background, accurate product geometry, minimal props, no poster headline, no lifestyle scene.",
    场景图:
      "Output type guide: usage scene. Place the product in a believable environment with contextual props, spatial depth, surface contact, and practical usage mood.",
    高级质感图:
      "Output type guide: material hero. Emphasize texture, macro detail, controlled highlights, shadow, surface material, and brand-photography craft.",
    电商主图:
      "Output type guide: ecommerce hero image. Balance product scale, selling-point space, shelf readability, and clean conversion layout.",
  };
  const styleGuide: Record<string, string> = {
    高级极简: "Visual style guide: strict order, low element count, large negative space, precise alignment.",
    苹果风: "Visual style guide: bright studio light, soft gradients, clean product surfaces, subtle shadows, restrained copy area.",
    科技感: "Visual style guide: technical structure, interface-like details, cool light, precise perspective; avoid overusing generic blue glow.",
    电商风: "Visual style guide: conversion layout, product-first hierarchy, benefit callout areas, readable marketplace composition.",
    暗色高级: "Visual style guide: dark premium set, controlled rim light, deep contrast, reflective surfaces when suitable.",
    浅色高级: "Visual style guide: airy light palette, soft material contrast, calm brand photography.",
    户外场景: "Visual style guide: real outdoor context, natural light, believable surface contact, active usage clues.",
    节日氛围: "Visual style guide: seasonal props, gift mood, richer decoration, warm/cool festive rhythm depending on the prompt.",
  };

  return [
    "Product workflow: generate a product visual from the uploaded product image. This workflow must look different from poster, detail, reference mimic, variant, and text-to-image outputs.",
    buildProductProtectionPrompt(input.protection),
    `产品名称：${input.productName || "根据上传产品图判断"}`,
    `产品品类：${input.category || "未填写"}`,
    `用户提示词：${input.userPrompt || "根据输出类型生成产品图，不套用固定背景或样片。"}`,
    input.outputType ? `输出类型：${input.outputType}` : "",
    input.outputType ? outputGuide[input.outputType] : "Output type guide: infer from user prompt and avoid a generic all-purpose ecommerce image.",
    input.backgroundType ? `背景类型：${input.backgroundType}` : "",
    input.style ? `视觉风格：${input.style}` : "",
    input.style ? styleGuide[input.style] : "Visual style guide: driven by the user prompt, not by a fixed preset.",
    `比例：${input.ratio}`,
    input.platformPrompt,
    "Strictly follow the user's requested scene, background, lighting, display method, and commerce purpose. Add props, surfaces, shadows, reflections, callout space, or layout only when they fit the chosen output type.",
    antiTemplateInstruction,
    "Output quality requirements: high-resolution commercial product photography, sharp focus, crisp product edges, clean anti-aliased silhouette, detailed material texture, accurate highlights, natural shadows, no blur, no pixelation, no compression artifacts, no low-resolution look.",
    "电商高清要求：产品边缘清晰锐利，材质细节完整，高光和阴影自然，画面不能模糊、不能糊边、不能有低清像素感或压缩噪点。",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildProductVariantPrompt(input: {
  userPrompt: string;
  outputType: ProductVariantOutputType | string;
  style: ProductVisualStyle | string;
  ratio: Ratio;
  protection?: Partial<ProductProtectionSettings>;
  platformPrompt?: string;
}) {
  const variantGuide: Record<string, string> = {
    白底图: "Variant direction: produce a clean marketplace baseline variant, not a lifestyle or poster composition.",
    场景图: "Variant direction: change the environment, usage context, surface, depth, and surrounding props.",
    高级质感图: "Variant direction: change lighting craft, material emphasis, macro/hero framing, and brand photography treatment.",
    电商主图: "Variant direction: change ecommerce layout, shelf hierarchy, selling-point area, and product scale.",
    产品海报图: "Variant direction: change into poster composition with title-safe area, campaign mood, stronger color and rhythm.",
  };
  const styleGuide: Record<string, string> = {
    高级极简: "Style direction: minimal order and restrained elements.",
    苹果风: "Style direction: bright product launch photography with soft gradients.",
    科技感: "Style direction: technical mood, precise light, interface-like geometry, no generic blue-glow repetition.",
    电商风: "Style direction: high-conversion marketplace layout.",
    暗色高级: "Style direction: dark premium lighting and contrast.",
    浅色高级: "Style direction: light premium studio scene.",
    户外场景: "Style direction: real outdoor use, natural materials, spatial context.",
    节日氛围: "Style direction: festive props, gift mood, rich seasonal decoration.",
  };

  return [
    "Product variant workflow: create a noticeably different visual variant for the same uploaded product. The goal is variation, not another generic product image.",
    buildProductProtectionPrompt(input.protection),
    `用户提示词：${input.userPrompt}`,
    `输出类型：${input.outputType}`,
    variantGuide[input.outputType] || "Variant direction: change composition, scene, lighting, palette, and layout according to the user's prompt.",
    `视觉风格：${input.style}`,
    styleGuide[input.style] || "Style direction: driven by the user prompt; do not apply one fixed preset.",
    `比例：${input.ratio}`,
    input.platformPrompt,
    "Only change presentation: background, scene, lighting, mood, composition, camera angle, layout, props, and poster/detail feel. Do not redesign the product.",
    antiTemplateInstruction,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildDetailImagePrompt(input: {
  blueprintPrompt: string;
  title: string;
  subtitle: string;
  layout: string;
  language?: string;
  textMode: "editable-layers" | "image-text" | "minimal-text";
  protection?: Partial<ProductProtectionSettings>;
}) {
  const isChinese = input.language?.includes("中文");
  const languageName = input.language?.includes("俄文")
    ? "Russian"
    : input.language?.includes("葡语")
      ? "Brazilian Portuguese"
      : input.language?.includes("西语")
        ? "Mexican Spanish"
        : input.language?.includes("英文")
          ? "English"
          : "the selected output language";
  const textPolicy =
    input.textMode === "editable-layers"
      ? "Editable text layer mode is ON. Do not render any readable text inside the image: no titles, no captions, no labels, no bullet text, no Chinese characters, no random letters, no mojibake. Generate only the product, background, blank information cards, icons, layout blocks, and empty safe areas for frontend HTML text overlay."
      : isChinese
        ? "Image-text mode is ON. Visible text may be generated, but it must be clean Chinese only and must avoid typos."
        : `Image-text mode is ON. Any visible text must be natural ${languageName} only. Absolutely no Chinese characters or Chinese labels. Translate all source copy to ${languageName}.`;

  return [
    "Ecommerce detail image generation. This workflow must create an information module, not a plain product hero or poster.",
    buildProductProtectionPrompt(input.protection),
    input.blueprintPrompt,
    `Output language: ${input.language || "selected language"}`,
    `Text-layer title reference only: ${input.title}`,
    `Text-layer subtitle reference only: ${input.subtitle}`,
    `Layout: ${input.layout}`,
    "Detail design requirements: use the provided layout as the main composition driver. Include blank callout cards, icon-like areas, comparison zones, detail zooms, size lines, scenario panels, or modular sections when appropriate to the blueprint.",
    "Avoid making every detail image a centered product on a clean background. Each screen in the detail set should have a distinct role, scale, crop, information density, and spatial structure.",
    textPolicy,
    antiTemplateInstruction,
  ].join("\n");
}

export function buildPosterPrompt(input: {
  productName: string;
  title: string;
  subtitle: string;
  campaignInfo: string;
  posterType: string;
  style: string;
  ratio: Ratio;
  protection?: Partial<ProductProtectionSettings>;
  platformPrompt?: string;
}) {
  const typeGuide: Record<string, string> = {
    促销: "Poster type guide: promotional conversion visual with offer/action zones, strong contrast, and direct hierarchy.",
    活动: "Poster type guide: event/campaign visual with theme, entrance feeling, time/occasion mood, and title-safe area.",
    节日: "Poster type guide: festive visual with seasonal symbols, gift mood, decorative rhythm, and richer atmosphere.",
    上新: "Poster type guide: new-arrival launch visual with freshness, debut ritual, product reveal, and stronger composition.",
    品牌: "Poster type guide: brand campaign visual with story, restraint, material quality, and distinctive brand tone.",
  };
  const styleGuide: Record<string, string> = {
    科技感: "Style guide: technical space, precise lighting, structure lines, interface rhythm; avoid always using the same blue glow.",
    高级感: "Style guide: brand-grade photography, controlled palette, material detail, deliberate negative space.",
    极简: "Style guide: very few elements, strong visual order, one decisive composition idea.",
    清新: "Style guide: bright lifestyle feeling, natural light, light props, soft colors.",
    节日氛围: "Style guide: festive decoration, gifting, rich mood, seasonal symbols.",
    电商强转化: "Style guide: bold hierarchy, product benefit area, action focus, marketplace readability.",
  };

  return [
    "Product poster workflow. The result must read as a campaign poster, not as a product packshot or detail module.",
    buildProductProtectionPrompt(input.protection),
    `产品名称：${input.productName || "根据上传产品图判断"}`,
    `主标题：${input.title}`,
    `副标题：${input.subtitle}`,
    `活动信息：${input.campaignInfo}`,
    `海报类型：${input.posterType}`,
    typeGuide[input.posterType],
    `风格：${input.style}`,
    styleGuide[input.style],
    `比例：${input.ratio}`,
    input.platformPrompt,
    "Create poster composition with a clear headline-safe area, campaign mood, product-brand relationship, background story, and visual rhythm. Use stronger layout decisions than product/detail workflows.",
    "Only change background, lighting, typography-safe layout, decoration, props, color, and atmosphere; keep the product identity fixed.",
    antiTemplateInstruction,
  ]
    .filter(Boolean)
    .join("\n");
}
