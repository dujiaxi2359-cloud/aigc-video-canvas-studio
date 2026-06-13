import type { DetailPlatform } from "@/types/detail";

export type PlatformRule = {
  id: string;
  name: DetailPlatform;
  marketHint: string;
  defaultCount: number;
  targetSize: { width: number; height: number; label: string };
  alternateSizes: Array<{ width: number; height: number; label: string }>;
  structure: string[];
  rules: string[];
  promptHint: string;
};

export const platformRules: PlatformRule[] = [
  {
    id: "amazon",
    name: "Amazon / 亚马逊",
    marketHint: "美国",
    defaultCount: 9,
    targetSize: { width: 2000, height: 2000, label: "详情图 2000x2000" },
    alternateSizes: [
      { width: 970, height: 300, label: "A+ 横幅 970x300" },
      { width: 970, height: 600, label: "A+ 横幅 970x600" },
      { width: 1464, height: 600, label: "A+ 横幅 1464x600" },
    ],
    structure: ["封面主卖点", "产品整体展示", "核心功能 1", "核心功能 2", "细节特写", "参数说明", "使用场景", "对比优势", "购买理由"],
    rules: ["遵守平台审核与可读性", "避免夸张促销词", "保留可编辑文案层空间", "每张图按详情角色选择不同构图"],
    promptHint: "适合 Amazon 商品详情图和 A+ 信息图。平台只约束可信度和可读性，视觉形式由当前详情图角色决定；不要自动套用白底参数信息图。",
  },
  {
    id: "tiktok",
    name: "TikTok Shop",
    marketHint: "东南亚",
    defaultCount: 6,
    targetSize: { width: 1000, height: 1000, label: "详情图 1000x1000" },
    alternateSizes: [{ width: 1080, height: 1920, label: "移动封面 1080x1920" }],
    structure: ["产品封面", "核心卖点", "使用场景", "功能演示", "细节证明", "行动理由"],
    rules: ["移动端第一眼可读", "保留标题区域", "按图的角色改变场景和信息密度", "避免模板化短视频封面"],
    promptHint: "适合 TikTok Shop 商品图。移动端需要明确焦点，但不要每张都做成同样的强标题封面；按卖点、场景、功能或细节角色变化。",
  },
  {
    id: "shopee",
    name: "Shopee",
    marketHint: "东南亚",
    defaultCount: 6,
    targetSize: { width: 1024, height: 1024, label: "详情图 1024x1024" },
    alternateSizes: [],
    structure: ["产品封面", "核心卖点", "功能说明", "细节展示", "使用场景", "收口图"],
    rules: ["信息直接", "商品识别度高", "适合方图详情模块", "不同详情页模块使用不同版式"],
    promptHint: "适合 Shopee 商品详情。方图只限制画布比例，不强制固定卡片模板；根据模块角色决定是场景、拆解、特写还是清单。",
  },
  {
    id: "lazada",
    name: "Lazada",
    marketHint: "东南亚",
    defaultCount: 6,
    targetSize: { width: 1200, height: 1200, label: "详情图 1200x1200" },
    alternateSizes: [],
    structure: ["产品封面", "核心卖点", "功能信息", "材质细节", "场景展示", "购买理由"],
    rules: ["主体明确", "信息分区清楚", "保留后期文案区", "按模块角色改变背景和构图"],
    promptHint: "适合 Lazada 详情图。需要信息可读，但不要默认干净明亮背景；场景图、细节图、参数图应有不同视觉结构。",
  },
  {
    id: "mercado",
    name: "Mercado Libre / 美客多",
    marketHint: "墨西哥",
    defaultCount: 6,
    targetSize: { width: 1200, height: 1200, label: "详情图 1200x1200" },
    alternateSizes: [{ width: 1200, height: 1540, label: "竖版详情 1200x1540" }],
    structure: ["产品封面", "核心优势", "细节展示", "参数说明", "场景应用", "信任收口"],
    rules: ["避免复杂小字", "转化信息直观", "适合拉美市场", "视觉由产品和模块决定"],
    promptHint: "适合 Mercado Libre 拉美电商。强调转化和可信，但不要把所有图都做成明亮主图；允许场景、比较、细节、清单等不同表达。",
  },
  {
    id: "ozon",
    name: "Ozon",
    marketHint: "欧洲",
    defaultCount: 6,
    targetSize: { width: 1200, height: 1600, label: "详情图 1200x1600" },
    alternateSizes: [{ width: 1000, height: 1000, label: "主图 1000x1000" }],
    structure: ["产品封面", "功能卖点", "参数信息", "细节特写", "使用场景", "包装/收口"],
    rules: ["竖版信息层级", "后期文字区规整", "适合俄语后期排版", "避免所有页面同一信息图模板"],
    promptHint: "适合 Ozon 竖版详情页。信息区要清楚，但每张图应按功能、参数、细节、场景或包装角色采用不同结构。",
  },
  {
    id: "wildberries",
    name: "Wildberries / WB",
    marketHint: "欧洲",
    defaultCount: 6,
    targetSize: { width: 900, height: 1200, label: "详情图 900x1200" },
    alternateSizes: [],
    structure: ["产品封面", "核心卖点", "功能说明", "细节展示", "场景展示", "购买理由"],
    rules: ["竖版商品展示", "信息简洁", "适合移动端", "每屏有独立叙事角色"],
    promptHint: "适合 Wildberries 竖版详情图。移动端需要简洁，但不要固定卡片留白模板；按当前卖点选择场景、特写、拆解或对比。",
  },
  {
    id: "tmall",
    name: "天猫",
    marketHint: "中国",
    defaultCount: 6,
    targetSize: { width: 790, height: 1200, label: "详情图 790x1200" },
    alternateSizes: [],
    structure: ["产品首屏", "核心卖点", "材质工艺", "细节展示", "场景应用", "品牌收口"],
    rules: ["品牌感", "竖版详情", "文案区克制", "按产品品类决定调性"],
    promptHint: "适合天猫详情页。可有品牌感，但不要默认高级大片风；材质、功能、场景、品牌收口应形成不同视觉段落。",
  },
  {
    id: "jd",
    name: "京东",
    marketHint: "中国",
    defaultCount: 6,
    targetSize: { width: 790, height: 1200, label: "详情图 790x1200" },
    alternateSizes: [],
    structure: ["产品首屏", "品质卖点", "参数说明", "功能展示", "细节证明", "收口图"],
    rules: ["品质可信", "转化直接", "结构理性", "参数只在参数图中强化"],
    promptHint: "适合京东详情页。平台强调可信，但不要每张都突出参数；只有参数说明图使用参数版式，其它图按场景、功能、细节或对比表达。",
  },
  {
    id: "douyin",
    name: "抖音电商",
    marketHint: "中国",
    defaultCount: 6,
    targetSize: { width: 1000, height: 1000, label: "商品详情图 1000x1000" },
    alternateSizes: [{ width: 1080, height: 1920, label: "内容封面 1080x1920" }],
    structure: ["产品封面", "爆点卖点", "场景演示", "功能证明", "细节展示", "转化收口"],
    rules: ["移动端", "标题空间明显", "不要杂乱", "避免所有图都变成爆款封面"],
    promptHint: "适合抖音电商移动端详情与内容封面。封面图可以强视觉，其它详情图按场景演示、功能证明、细节展示分别处理。",
  },
  {
    id: "xiaohongshu",
    name: "小红书电商 / 内容电商",
    marketHint: "中国",
    defaultCount: 6,
    targetSize: { width: 1080, height: 1350, label: "内容详情 1080x1350" },
    alternateSizes: [{ width: 1080, height: 1440, label: "内容详情 1080x1440" }],
    structure: ["封面吸引", "产品亮点", "场景种草", "细节体验", "使用建议", "收藏理由"],
    rules: ["生活方式", "视觉吸引力", "适合内容电商", "封面感只用于封面类页面"],
    promptHint: "适合小红书内容封面和种草详情。封面可有标题和笔记感，其它页面要按体验、细节、建议或收藏理由变化，不要统一封面模板。",
  },
  {
    id: "general",
    name: "通用电商",
    marketHint: "中国",
    defaultCount: 6,
    targetSize: { width: 1000, height: 1000, label: "默认详情图 1000x1000" },
    alternateSizes: [{ width: 1080, height: 1350, label: "4:5 详情 1080x1350" }],
    structure: ["产品封面", "核心卖点", "细节展示", "参数信息", "使用场景", "收口图"],
    rules: ["卖点明确", "可编辑文案区", "适合多平台复用", "视觉形态由工作流和用户提示词决定"],
    promptHint: "通用电商详情图。平台规则只提供尺寸和可读性底线，构图、背景、信息密度和场景必须由用户提示词与详情角色决定。",
  },
  {
    id: "independent",
    name: "独立站",
    marketHint: "美国",
    defaultCount: 6,
    targetSize: { width: 1200, height: 1600, label: "详情图 1200x1600" },
    alternateSizes: [{ width: 1600, height: 1600, label: "品牌方图 1600x1600" }],
    structure: ["品牌首屏", "产品价值", "功能细节", "场景故事", "参数说明", "品牌收口"],
    rules: ["品牌落地页", "叙事感", "转化模块清晰", "按品牌调性选择版式"],
    promptHint: "适合 Shopify/独立站产品落地页。允许品牌叙事和落地页节奏，但不要默认高级留白模板；根据产品故事选择场景、细节或转化模块。",
  },
];

export const detailPlatformOptions = platformRules.map((item) => item.name);

export function getPlatformRule(platform: string) {
  return (
    platformRules.find((item) => item.name === platform) ||
    platformRules.find((item) => item.id === platform) ||
    platformRules[platformRules.length - 2]
  );
}
