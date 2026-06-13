import { createId } from "@/lib/id";

export const stylePresets = {
  realistic:
    "photorealistic commercial photography, natural light, refined texture, premium visual detail",
  minimalEcommerce:
    "minimal ecommerce product image, clean studio background, crisp shadows, conversion-focused composition",
  tech:
    "futuristic technology aesthetic, precise lighting, sleek materials, cinematic depth, high-end product launch mood",
  poster:
    "bold poster design, strong hierarchy, expressive composition, editorial color rhythm, eye-catching visual impact",
  luxury:
    "luxury premium aesthetic, understated elegance, refined palette, delicate lighting, high-end brand campaign style",
} as const;

export const styleLabels: Record<keyof typeof stylePresets, string> = {
  realistic: "写实",
  minimalEcommerce: "极简电商",
  tech: "科技感",
  poster: "海报风",
  luxury: "高级感",
};

export const ratios = [
  "1:1",
  "3:4",
  "4:5",
  "9:16",
  "16:9",
  "1464:600",
  "1464:625",
  "600:450",
  "463:625",
  "1200:1500",
  "1600:1600",
  "custom",
] as const;
export const sizes = [
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "1464x600",
  "1464x625",
  "600x450",
  "463x625",
  "1200x1500",
  "1600x1600",
  "1200x1600",
  "1024x1792",
  "1792x1024",
  "1952x800",
  "1600x1200",
  "2928x1250",
  "1482x2000",
] as const;
export const qualities = ["low", "medium", "high"] as const;
export const qualityLabels: Record<(typeof qualities)[number], string> = {
  low: "快速",
  medium: "标准",
  high: "精细",
};

export type StyleKey = keyof typeof stylePresets;
export type Ratio = (typeof ratios)[number];
export type ImageSize = (typeof sizes)[number];
export type ImageQuality = (typeof qualities)[number];

export function buildFinalPrompt(prompt: string, style: StyleKey, ratio: Ratio) {
  return [
    prompt.trim(),
    `Style preset: ${stylePresets[style]}.`,
    `Aspect ratio: ${ratio}.`,
    "Follow the user's subject and intent first. Do not force every image into a centered ecommerce product packshot. Avoid watermarks, broken text, low-resolution artifacts, and distorted products.",
  ].join("\n");
}

export const promptTemplates = [
  {
    id: "marketplace-packshot",
    name: "平台白底主图",
    prompt:
      "为指定产品生成平台白底主图：准确比例、真实轮廓、浅色背景、自然接触阴影，减少道具和装饰，适合商品列表审核",
  },
  {
    id: "lifestyle-scene",
    name: "生活方式场景",
    prompt:
      "为指定产品生成真实生活方式场景：产品在目标用户会出现的空间中，自然光、真实表面、轻量道具、可感知的使用情境",
  },
  {
    id: "detail-callout",
    name: "详情卖点模块",
    prompt:
      "为指定产品生成详情页卖点模块：产品、局部特写、说明线、图标感信息区和后期文字留白组成清晰版式",
  },
  {
    id: "campaign-poster",
    name: "营销海报",
    prompt:
      "为指定产品生成营销海报：明确主标题区域、活动氛围、背景故事、色彩节奏和视觉冲击，和普通产品主图区分开",
  },
  {
    id: "material-closeup",
    name: "材质细节特写",
    prompt:
      "为指定产品生成材质细节特写：局部放大、微距纹理、剖面或边缘细节、精准高光和材质对比，适合详情页工艺说明",
  },
] as const;

const fallbackPalettes: Record<StyleKey, [string, string, string]> = {
  realistic: ["#f4f0e8", "#202020", "#b8a78d"],
  minimalEcommerce: ["#f8f7f2", "#151515", "#d8d1c4"],
  tech: ["#eef5ff", "#08111f", "#2563eb"],
  poster: ["#fff4e6", "#151515", "#ef4444"],
  luxury: ["#f6f2e8", "#111111", "#b99d62"],
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(value: string, maxLength = 18) {
  const text = value.trim().replace(/\s+/g, " ");
  const lines: string[] = [];

  for (let index = 0; index < text.length; index += maxLength) {
    lines.push(text.slice(index, index + maxLength));
  }

  return lines.slice(0, 7);
}

export function createFallbackImages({
  prompt,
  style,
  ratio,
  size,
  count,
}: {
  prompt: string;
  style: StyleKey;
  ratio: Ratio;
  size: ImageSize;
  count: number;
}) {
  const [width, height] = size.split("x").map(Number);
  const palette = fallbackPalettes[style];
  const lines = wrapText(prompt);

  return Array.from({ length: count }, (_, index) => {
    const yStart = Math.round(height * 0.36);
    const textLines = lines
      .map(
        (line, lineIndex) =>
          `<text x="${Math.round(width * 0.1)}" y="${
            yStart + lineIndex * 48
          }" font-size="34" font-weight="600" fill="${palette[1]}">${escapeXml(
            line,
          )}</text>`,
      )
      .join("");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${palette[0]}"/>
  <rect x="${Math.round(width * 0.06)}" y="${Math.round(
    height * 0.06,
  )}" width="${Math.round(width * 0.88)}" height="${Math.round(
    height * 0.88,
  )}" fill="none" stroke="${palette[2]}" stroke-width="4"/>
  <circle cx="${Math.round(width * 0.78)}" cy="${Math.round(
    height * 0.2,
  )}" r="${Math.round(Math.min(width, height) * 0.12)}" fill="${palette[2]}" opacity="0.18"/>
  <text x="${Math.round(width * 0.1)}" y="${Math.round(
    height * 0.16,
  )}" font-size="24" fill="${palette[2]}" font-weight="700">LOCAL PREVIEW ${index + 1}</text>
  <text x="${Math.round(width * 0.1)}" y="${Math.round(
    height * 0.24,
  )}" font-size="42" fill="${palette[1]}" font-weight="800">${escapeXml(styleLabels[style])} · ${ratio}</text>
  ${textLines}
  <text x="${Math.round(width * 0.1)}" y="${Math.round(
    height * 0.88,
  )}" font-size="22" fill="${palette[1]}" opacity="0.55">OpenAI connection unavailable. This is an offline workflow preview.</text>
</svg>`;

    return {
      id: createId("fallback"),
      index,
      url: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString(
        "base64",
      )}`,
    };
  });
}
