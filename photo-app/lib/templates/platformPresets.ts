export const platformPresets = [
  {
    key: "tiktok",
    name: "TikTok Shop",
    ratios: ["1:1"],
    sizes: ["600x600", "1000x1000"],
    prompt: "TikTok Shop 强转化信息图，移动端可读，产品利益点直接醒目。",
  },
  {
    key: "shopee",
    name: "Shopee",
    ratios: ["1:1"],
    sizes: ["1024x1024"],
    prompt: "Shopee 高转化信息图，卖点表达直接，视觉热区清晰。",
  },
  {
    key: "lazada",
    name: "Lazada",
    ratios: ["1:1"],
    sizes: ["1024x1024"],
    prompt: "Lazada 高转化商品信息图，主体明确，适合东南亚电商详情页。",
  },
  {
    key: "amazon",
    name: "Amazon / 亚马逊",
    ratios: ["1:1"],
    sizes: ["1600x1600", "1024x1024"],
    prompt:
      "Amazon 专业可信信息图，白底优先，参数说明明确，文案简洁，避免夸张营销词。",
  },
  {
    key: "wb_ozon",
    name: "WB/OZON",
    ratios: ["1:1", "3:4", "4:5"],
    sizes: ["1600x1600", "1200x1500", "1024x1536"],
    prompt:
      "WB/OZON 俄语跨境电商视觉，信息清晰、产品主体突出、适合俄罗斯平台详情页和商品卡展示，文案自然可信。",
  },
  {
    key: "independent",
    name: "独立站",
    ratios: ["1:1", "4:5", "16:9"],
    sizes: ["1600x1600", "1536x1024"],
    prompt: "独立站品牌视觉，质感高级，适合品牌落地页和产品卖点页。",
  },
  {
    key: "xiaohongshu",
    name: "小红书",
    ratios: ["3:4", "4:5"],
    sizes: ["1200x1500", "1024x1536"],
    prompt: "小红书封面感，精致生活方式表达，标题区域清晰。",
  },
  {
    key: "douyin",
    name: "抖音",
    ratios: ["9:16"],
    sizes: ["1024x1536"],
    prompt: "抖音视频封面风格，标题冲击力强，产品和卖点一眼可见。",
  },
  {
    key: "general",
    name: "通用电商",
    ratios: ["1:1", "4:5", "9:16", "16:9"],
    sizes: ["1024x1024", "1024x1536", "1536x1024"],
    prompt: "通用电商视觉，主体清晰，卖点明确，适合主图、详情和海报。",
  },
] as const;

export type PlatformPresetKey = (typeof platformPresets)[number]["key"];

export function getPlatformPreset(key: string) {
  return platformPresets.find((item) => item.key === key) || platformPresets[8];
}
