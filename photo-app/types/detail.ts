export type DetailMarket = "中国" | "美国" | "巴西" | "墨西哥" | "东南亚" | "欧洲";
export type DetailLanguage =
  | "中文"
  | "英文"
  | "葡语（巴西）"
  | "西语（墨西哥）"
  | "俄文";
export type DetailPlatform =
  | "TikTok Shop"
  | "Shopee"
  | "Lazada"
  | "Amazon / 亚马逊"
  | "Mercado Libre / 美客多"
  | "Ozon"
  | "Wildberries / WB"
  | "天猫"
  | "京东"
  | "抖音电商"
  | "小红书电商 / 内容电商"
  | "独立站"
  | "通用电商";

export type DetailTextLayer = {
  id: string;
  role: "title" | "subtitle" | "point" | "spec" | "note";
  text: string;
  x: number;
  y: number;
};

export type DetailBlueprintItem = {
  id: string;
  index: number;
  type: string;
  language: DetailLanguage;
  platform: DetailPlatform;
  title: string;
  subtitle: string;
  sellingPoints: string[];
  layout: string;
  visualDirection: string;
  productPlacement: string;
  backgroundStyle: string;
  prompt: string;
  textLayers: DetailTextLayer[];
  targetWidth?: number;
  targetHeight?: number;
  generationSize?: string;
  exportSize?: string;
};

export type DetailBlueprintInput = {
  productName: string;
  category: string;
  brandName: string;
  sellingPoints: string;
  specs: string;
  material: string;
  functions: string;
  packageList: string;
  useScenes: string;
  audience: string;
  advantages: string;
  dimensions: string;
  variants: string;
  afterSales: string;
  promotion?: string;
  visualPrompt?: string;
  targetMarket: DetailMarket;
  language: DetailLanguage;
  platform: DetailPlatform;
  count: number;
  style: string;
  textMode: "editable-layers" | "image-text" | "minimal-text";
};
