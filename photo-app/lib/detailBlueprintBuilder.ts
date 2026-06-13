import { createId } from "@/lib/id";
import { detailLayouts } from "@/lib/templates/detailLayouts";
import { amazonDetailTypes, detailTypes } from "@/lib/templates/detailTypes";
import { resolveGenerationSize } from "@/lib/image/resolveGenerationSize";
import { getPlatformRule } from "@/lib/templates/platformRules";
import type { DetailBlueprintInput, DetailBlueprintItem } from "@/types/detail";

function splitPoints(value: string, fallback: string[]) {
  const points = value
    .split(/\r?\n|,|，|;|；/)
    .map((item) => item.trim())
    .filter(Boolean);

  return points.length ? points.slice(0, 4) : fallback;
}

const detailTypeLabels: Record<string, Record<string, string>> = {
  "首屏核心卖点图": {
    en: "Hero Benefit Image",
    pt: "Imagem de Beneficio Principal",
    es: "Imagen de Beneficio Principal",
    ru: "Главное изображение преимуществ",
  },
  "产品整体展示图": {
    en: "Full Product Showcase",
    pt: "Apresentacao Completa do Produto",
    es: "Presentacion Completa del Producto",
    ru: "Общий обзор товара",
  },
  "核心功能图": {
    en: "Key Feature Image",
    pt: "Imagem de Funcao Principal",
    es: "Imagen de Funcion Principal",
    ru: "Основные функции",
  },
  "卖点拆解图": {
    en: "Benefit Breakdown",
    pt: "Detalhamento dos Beneficios",
    es: "Desglose de Beneficios",
    ru: "Разбор преимуществ",
  },
  "材质工艺图": {
    en: "Material and Craft Image",
    pt: "Materiais e Acabamento",
    es: "Materiales y Acabado",
    ru: "Материалы и качество",
  },
  "细节放大图": {
    en: "Detail Close-up",
    pt: "Detalhe Ampliado",
    es: "Detalle Ampliado",
    ru: "Крупный план деталей",
  },
  "参数说明图": {
    en: "Specification Image",
    pt: "Imagem de Especificacoes",
    es: "Imagen de Especificaciones",
    ru: "Характеристики",
  },
  "使用场景图": {
    en: "Usage Scenario Image",
    pt: "Imagem de Uso",
    es: "Imagen de Uso",
    ru: "Сценарии использования",
  },
  "对比优势图": {
    en: "Comparison Advantage Image",
    pt: "Comparativo de Vantagens",
    es: "Comparacion de Ventajas",
    ru: "Сравнение преимуществ",
  },
  "尺寸说明图": {
    en: "Size Guide Image",
    pt: "Guia de Tamanho",
    es: "Guia de Tamano",
    ru: "Размеры товара",
  },
  "包装清单图": {
    en: "Package Contents Image",
    pt: "Conteudo da Embalagem",
    es: "Contenido del Paquete",
    ru: "Комплектация",
  },
};

function languageCode(language: string) {
  if (language.includes("英文")) return "en";
  if (language.includes("葡语")) return "pt";
  if (language.includes("西语")) return "es";
  if (language.includes("俄文")) return "ru";
  return "zh";
}

function localizedType(type: string, language: string) {
  const code = languageCode(language);
  if (code === "zh") return type;
  return detailTypeLabels[type]?.[code] || detailTypeLabels[type]?.en || "Product Detail Image";
}

function noChineseInstruction(language: string, textMode: string) {
  if (languageCode(language) === "zh") {
    return textMode === "editable-layers"
      ? "默认可编辑文字层：图片内不要生成大段文字，保留干净信息卡片和文字留白。"
      : "图片内文字必须使用中文，避免乱码和错字。";
  }

  const languageName = language.includes("俄文")
    ? "Russian"
    : language.includes("葡语")
      ? "Brazilian Portuguese"
      : language.includes("西语")
        ? "Mexican Spanish"
        : "English";

  return textMode === "editable-layers"
    ? `Editable text layer mode. Do NOT render any readable text, words, letters, Chinese characters, captions, labels, UI text, slogans, or product copy inside the image. Create only clean blank cards, icons, background, product presentation, layout blocks, and empty text-safe areas.`
    : `If any text is rendered inside the image, it must be natural ${languageName} only. Absolutely no Chinese characters, no Chinese labels, no mixed Chinese text, no mojibake, no random glyphs. Translate all source copy to ${languageName}.`;
}

function detailRoleInstruction(type: string) {
  if (type.includes("首屏") || type.includes("核心卖点")) {
    return "视觉角色：首屏/核心卖点。使用强主视觉、大留白或大信息区，突出购买理由。";
  }
  if (type.includes("整体展示")) {
    return "视觉角色：整体展示。完整呈现产品结构和比例，可以使用场景底座或多角度排布。";
  }
  if (type.includes("功能") || type.includes("卖点拆解")) {
    return "视觉角色：功能拆解。使用分区、图标感区域、说明线、步骤感或局部窗口，不能只是产品居中。";
  }
  if (type.includes("材质") || type.includes("工艺") || type.includes("细节")) {
    return "视觉角色：材质/细节。使用微距、局部放大、剖面、放大框或纹理对比。";
  }
  if (type.includes("参数") || type.includes("尺寸")) {
    return "视觉角色：参数/尺寸。使用尺寸线、表格式信息区、比例参照和技术说明版式。";
  }
  if (type.includes("场景") || type.includes("使用")) {
    return "视觉角色：使用场景。放入真实场景，体现空间、人物动作或使用前后关系。";
  }
  if (type.includes("对比")) {
    return "视觉角色：对比优势。必须有左右/上下对比结构或明确差异区。";
  }
  if (type.includes("包装")) {
    return "视觉角色：包装清单。平铺产品、配件、包装和数量关系。";
  }
  return "视觉角色：按当前详情图类型选择独立构图，不要复用上一张图的产品摆放。";
}

function localizedCopy(input: DetailBlueprintInput, type: string, index: number) {
  const product = input.productName || "产品";
  const language = input.language;
  const platform = input.platform;
  const displayType = localizedType(type, language);

  if (language.includes("英文")) {
    return {
      title:
        platform.includes("Amazon") && index > 1
          ? `${displayType} for ${product}`
          : `${product} Highlights`,
      subtitle: "Clear, trustworthy product information for ecommerce shoppers.",
    };
  }

  if (language.includes("葡语")) {
    return {
      title: `${product}: ${displayType}`,
      subtitle: "Informacoes claras e naturais para o mercado brasileiro.",
    };
  }

  if (language.includes("西语")) {
    return {
      title: `${product}: ${displayType}`,
      subtitle: "Informacion clara y natural para compradores en Mexico.",
    };
  }

  if (language.includes("俄文")) {
    return {
      title: `${product}: ${displayType}`,
      subtitle: "Понятная и надежная информация о товаре для маркетплейсов.",
    };
  }

  return {
    title: index === 1 ? `${product} 核心卖点` : type,
    subtitle:
      platform.includes("Amazon")
        ? "专业、可信、清晰呈现产品信息"
        : "清晰展示卖点，提升电商转化效率",
  };
}

export function buildDetailBlueprint(input: DetailBlueprintInput): DetailBlueprintItem[] {
  const platform = getPlatformRule(input.platform);
  const count = Math.min(Math.max(Number(input.count) || platform.defaultCount, 1), 20);
  const resolvedSize = resolveGenerationSize(platform.targetSize.width, platform.targetSize.height);
  const typePool = input.platform.includes("Amazon")
    ? [...platform.structure, ...amazonDetailTypes, ...detailTypes]
    : [...platform.structure, ...detailTypes];
  const sellingPoints = splitPoints(input.sellingPoints, [
    languageCode(input.language) === "zh" ? "核心功能清晰" : "Clear key feature",
    languageCode(input.language) === "zh" ? "材质质感可靠" : "Reliable material quality",
    languageCode(input.language) === "zh" ? "适合目标使用场景" : "Suitable for target usage scenarios",
    languageCode(input.language) === "zh" ? "购买理由明确" : "Clear reason to buy",
  ]);

  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const type = typePool[offset % typePool.length];
    const displayType = localizedType(type, input.language);
    const layout = detailLayouts[offset % detailLayouts.length];
    const copy = localizedCopy(input, type, index);
    const itemPoints =
      index === 1
        ? sellingPoints.slice(0, 3)
        : splitPoints(
            [
              input.functions,
              input.specs,
              input.material,
              input.useScenes,
              input.audience,
              input.advantages,
              input.dimensions,
              input.packageList,
              input.afterSales,
            ][offset % 9] || "",
            sellingPoints,
          );
    const prompt =
      languageCode(input.language) === "zh"
        ? [
            `详情图第 ${index} 张：${displayType}`,
            `产品：${input.productName || "根据产品图判断"}，品类：${input.category || "未填写"}，品牌：${input.brandName || "未填写"}`,
            `平台：${input.platform}。${platform.promptHint}`,
            `平台规则：${platform.rules.join("；")}`,
            `目标导出尺寸：${resolvedSize.exportSize}。模型生成尺寸：${resolvedSize.generationSize}，最终下载需后处理到平台目标尺寸。`,
            `目标市场：${input.targetMarket}，输出语言：${input.language}`,
            `套图生成提示词：${input.visualPrompt || "按平台和产品卖点生成清晰详情图视觉。"}`,
            `视觉倾向：${input.style || "由用户提示词决定，不套用固定风格模板"}`,
            `版式：${layout}`,
            detailRoleInstruction(type),
            "差异化要求：本张必须与同套其他详情图在构图、裁切、信息密度、背景、产品比例或场景关系上明显不同。",
            `文字层标题：${copy.title}`,
            `文字层副标题：${copy.subtitle}`,
            `文字层卖点：${itemPoints.join("；")}`,
            noChineseInstruction(input.language, input.textMode),
          ].join("\n")
        : [
            `Detail image ${index}: ${displayType}`,
            `Product: ${input.productName || "infer from uploaded product image"}`,
            `Category: ${input.category || "not specified"}`,
            `Brand: ${input.brandName || "not specified"}`,
            `Platform: ${input.platform}. ${platform.promptHint}`,
            `Platform rules: ${platform.rules.join("; ")}`,
            `Target export size: ${resolvedSize.exportSize}. Generate with ${resolvedSize.generationSize}, then export to the platform target size.`,
            `Target market: ${input.targetMarket}`,
            `Output language: ${input.language}`,
            `User visual prompt for the whole detail set: ${input.visualPrompt || "Create a clean ecommerce detail image according to the product benefits and platform style."}`,
            `Visual direction: ${input.style || "driven by user prompt, not a fixed style preset"}`,
            `Layout: ${layout}`,
            detailRoleInstruction(type),
            "Differentiation requirement: this screen must differ from the other detail images in composition, crop, information density, background, product scale, or scene relationship.",
            `Text-layer title only, do not render in image unless image-text mode: ${copy.title}`,
            `Text-layer subtitle only, do not render in image unless image-text mode: ${copy.subtitle}`,
            `Text-layer selling points only, do not render in image unless image-text mode: ${itemPoints.join("; ")}`,
            noChineseInstruction(input.language, input.textMode),
          ].join("\n");

    return {
      id: createId("detail"),
      index,
      type: displayType,
      language: input.language,
      platform: input.platform,
      title: copy.title,
      subtitle: copy.subtitle,
      sellingPoints: itemPoints,
      layout,
      visualDirection: `${input.style}，${platform.name} 详情页视觉`,
      productPlacement:
        index % 3 === 0 ? "产品居中大图展示" : index % 2 === 0 ? "产品右侧展示" : "产品左侧展示",
      backgroundStyle:
        input.platform.includes("Amazon") ? "白底或浅灰专业背景" : "干净商业背景，可带轻量场景氛围",
      prompt,
      textLayers: [
        { id: createId("text"), role: "title", text: copy.title, x: 8, y: 8 },
        { id: createId("text"), role: "subtitle", text: copy.subtitle, x: 8, y: 16 },
        ...itemPoints.map((point, pointIndex) => ({
          id: createId("text"),
          role: "point" as const,
          text: point,
          x: 8,
          y: 28 + pointIndex * 8,
        })),
      ],
      targetWidth: resolvedSize.targetWidth,
      targetHeight: resolvedSize.targetHeight,
      generationSize: resolvedSize.generationSize,
      exportSize: resolvedSize.exportSize,
    };
  });
}
