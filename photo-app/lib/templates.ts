import type { Ratio, StyleKey } from "@/lib/workflow";

export const ecommercePromptTemplates = [
  {
    id: "marketplace-packshot",
    name: "平台白底主图",
    prompt:
      "为我上传或描述的产品生成平台白底主图：准确呈现产品比例、轮廓和材质，背景纯白或极浅灰，少量自然接触阴影，不添加生活方式道具，不生成促销文案。",
  },
  {
    id: "usage-scene",
    name: "真实使用场景",
    prompt:
      "把我上传或描述的产品放入真实使用场景：有明确空间、表面接触、自然光和场景道具，体现目标人群正在使用或即将使用产品，画面像生活方式摄影而不是白底主图。",
  },
  {
    id: "conversion-detail",
    name: "卖点详情模块",
    prompt:
      "生成电商详情页卖点模块：产品与 2-3 个信息区形成清晰版式，包含局部特写、说明线或图标感区域，预留后期可编辑文字空间，不要做成普通海报。",
  },
  {
    id: "campaign-poster",
    name: "活动海报构图",
    prompt:
      "生成活动海报视觉：产品作为主角，但画面要有标题安全区、活动氛围、色彩节奏和营销层次；背景、道具和光影根据活动主题变化，不要套用白底产品居中构图。",
  },
] as const;

export const detailTemplates = [
  { id: "core-selling-point", name: "核心卖点图" },
  { id: "function-display", name: "功能展示图" },
  { id: "specification", name: "参数说明图" },
  { id: "material-craft", name: "材质工艺图" },
  { id: "detail-zoom", name: "细节放大图" },
  { id: "scene-application", name: "场景应用图" },
  { id: "advantage-comparison", name: "对比优势图" },
  { id: "size-guide", name: "尺寸说明图" },
  { id: "package-list", name: "包装清单图" },
] as const;

export const posterTypes = ["促销", "活动", "节日", "上新", "品牌"] as const;
export const posterStyles = ["科技感", "高级感", "极简", "清新", "节日氛围"] as const;

export const mimicTypes = ["产品图", "详情图", "海报图"] as const;
export const mimicDimensions = [
  "模仿风格",
  "模仿构图",
  "模仿排版",
  "模仿色调",
  "模仿氛围",
  "模仿材质表现",
] as const;
export const mimicStrengths = ["低", "中", "高"] as const;
export const mimicCounts = [1, 2, 4] as const;

export const ecommercePlatforms = [
  {
    id: "general",
    name: "通用电商",
    prompt:
      "平台用途：通用电商。请根据当前工作流决定视觉形态：主图重产品识别，详情重信息模块，海报重营销氛围，文本生图重用户创意；不要把所有结果都做成同一种干净商品图。",
  },
  {
    id: "mercado",
    name: "美客多",
    prompt:
      "平台用途：美客多 Mercado Libre。适合拉美电商展示，产品主体突出，背景干净明亮，卖点表达直观，避免过度奢华和复杂小字。",
  },
  {
    id: "amazon",
    name: "亚马逊",
    prompt:
      "平台用途：Amazon。适合亚马逊商品图和A+内容，产品准确可信，主图倾向干净白底或浅色背景，避免水印、夸张促销贴纸和误导性元素。",
  },
  {
    id: "ozon",
    name: "欧众",
    prompt:
      "平台用途：欧众/Ozon跨境电商。适合商品卡片、详情模块和促销图，构图清晰，产品识别度高，信息区域规整，适合多语言后期排版。",
  },
  {
    id: "wb_ozon",
    name: "WB/OZON",
    prompt:
      "平台用途：WB/OZON跨境电商。适合商品卡片、详情模块和促销图，构图清晰，产品识别度高，信息区域规整，适合多语言后期排版。",
  },
  {
    id: "tiktok",
    name: "TIKTOK",
    prompt:
      "平台用途：TikTok Shop。画面要有强停留感和短视频封面感，产品主体醒目，卖点直观，适合移动端信息流和直播间商品展示。",
  },
  {
    id: "douyin",
    name: "抖音",
    prompt:
      "平台用途：抖音电商。画面要适合移动端种草、直播间和短视频封面，视觉冲击明确，产品利益点清楚，氛围年轻但不要杂乱。",
  },
  {
    id: "tmall",
    name: "天猫",
    prompt:
      "平台用途：天猫。适合品牌旗舰店商品主图、详情页和活动图，画面高级、干净、可信，突出品牌感和产品质感。",
  },
  {
    id: "jd",
    name: "京东",
    prompt:
      "平台用途：京东。适合高转化商品主图和详情模块，产品清晰可信，信息表达直接，强调品质、参数、功能和购买理由。",
  },
] as const;

export type DetailTemplateId = (typeof detailTemplates)[number]["id"];
export type PosterType = (typeof posterTypes)[number];
export type PosterStyle = (typeof posterStyles)[number];
export type MimicType = (typeof mimicTypes)[number];
export type MimicDimension = (typeof mimicDimensions)[number];
export type MimicStrength = (typeof mimicStrengths)[number];
export type EcommercePlatformId = (typeof ecommercePlatforms)[number]["id"];

export const ratioToSize: Record<
  Ratio,
  | "1024x1024"
  | "1024x1536"
  | "1536x1024"
  | "1464x600"
  | "1464x625"
  | "600x450"
  | "463x625"
  | "1200x1500"
  | "1600x1600"
> = {
  "1:1": "1024x1024",
  "3:4": "1024x1536",
  "4:5": "1024x1536",
  "9:16": "1024x1536",
  "16:9": "1536x1024",
  "1464:600": "1464x600",
  "1464:625": "1464x625",
  "600:450": "600x450",
  "463:625": "463x625",
  "1200:1500": "1200x1500",
  "1600:1600": "1600x1600",
  custom: "1024x1024",
};

export function platformPrompt(platformId: EcommercePlatformId) {
  return (
    ecommercePlatforms.find((platform) => platform.id === platformId)?.prompt ||
    ecommercePlatforms[0].prompt
  );
}

export const workflowStyleToPreset: Record<string, StyleKey> = {
  科技感: "tech",
  高级感: "luxury",
  极简: "minimalEcommerce",
  清新: "realistic",
  节日氛围: "poster",
};
