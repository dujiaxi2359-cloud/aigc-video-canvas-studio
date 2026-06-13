import { styleLabels, stylePresets, type Ratio, type StyleKey } from "@/lib/workflow";
import type {
  DetailTemplateId,
  MimicDimension,
  MimicStrength,
  MimicType,
  PosterStyle,
  PosterType,
} from "@/lib/templates";
import { detailTemplates } from "@/lib/templates";

const antiTemplateInstruction =
  "不要沿用内置示例的固定商品、背景或构图；除非用户明确提到，不要默认生成耳机、香氛、护肤品、宠物玩具、科技悬浮球或白底居中样片。";

function isPresetStyle(style?: string): style is StyleKey {
  return Boolean(style && style in stylePresets);
}

const detailPromptMap: Record<DetailTemplateId, string> = {
  "core-selling-point":
    "核心卖点图：用单一强焦点和 1-3 个大信息区表达关键优势，避免普通主图式摆拍。",
  "function-display":
    "功能展示图：用分区、箭头、图标感模块或使用前后关系表达功能，不要只做产品居中渲染。",
  specification:
    "参数说明图：以技术参数板、表格式区域或尺寸标注表达规格，视觉语言应像说明页而不是海报。",
  "material-craft":
    "材质工艺图：强调微距纹理、剖面、局部光泽和工艺细节，主体可以局部放大。",
  "detail-zoom":
    "细节放大图：使用放大框、局部特写、连线或对比窗口表达细节，不要复用完整产品主图构图。",
  "scene-application":
    "场景应用图：把产品放入真实使用环境，强调人物/空间/动作关系和购买想象。",
  "advantage-comparison":
    "对比优势图：用左右对比、上下对比或清晰分区表达优势，必须有比较关系。",
  "size-guide":
    "尺寸说明图：呈现尺寸线、比例参照和空间关系，画面要像测量说明图。",
  "package-list":
    "包装清单图：平铺展示产品、配件、包装内容和数量关系，适合套装清单。",
};

export function buildTextPrompt({
  prompt,
  style,
  ratio,
}: {
  prompt: string;
  style?: StyleKey | string;
  ratio: Ratio;
}) {
  const styleGuide = isPresetStyle(style)
    ? `视觉风格：${styleLabels[style]}。${stylePresets[style]}`
    : style?.trim()
      ? `视觉方向补充：${style.trim()}。这是用户补充方向，不是固定模板。`
    : "视觉风格：完全由用户 prompt 决定，不套用默认电商样片。";
  return [
    "文本生图工作流：以用户 prompt 为最高优先级，可以生成概念海报、场景视觉、内容封面、背景图或商品相关创意，不强制做成产品主图。",
    prompt.trim(),
    styleGuide,
    `画面比例：${ratio}。`,
    "根据用户描述决定主体、视角、场景、信息密度和色彩；不要自动套用白底产品居中、玻璃反射、蓝紫科技光或极简香氛布景。",
    antiTemplateInstruction,
    "质量底线：避免水印、乱码文字、低清晰度、明显畸变和无意义元素。",
  ].join("\n");
}

export function buildMimicPrompt({
  productName,
  sellingPoints,
  extraRequirements,
  outputType,
  dimensions,
  strength,
  ratio,
}: {
  productName: string;
  sellingPoints: string;
  extraRequirements: string;
  outputType: MimicType;
  dimensions: MimicDimension[];
  strength: MimicStrength;
  ratio: Ratio;
}) {
  const strengthMap: Record<MimicStrength, string> = {
    低: "低强度借鉴：只吸收参考图的大方向，不明显接近原图。",
    中: "中等强度借鉴：保留参考图的视觉结构和气质，但内容必须重新生成。",
    高: "高强度借鉴：更接近参考图的风格、构图和视觉节奏，但不要复制原图内容、文案或品牌元素。",
  };

  const typeMap: Record<MimicType, string> = {
    产品图:
      "生成类型：电商产品主图。重点是产品识别与货架转化，可借参考图的摄影方法，但不要自动变成海报或详情页。",
    详情图:
      "生成类型：电商详情图。必须有模块化信息结构、功能区、局部展示或使用场景，不能只是一张漂亮产品照。",
    海报图:
      "生成类型：商业海报图。允许更强标题区、节奏、动势和营销氛围，和产品主图/详情图明显区分。",
  };

  return [
    "你正在执行“参考图模仿生图”电商设计工作流。",
    "输入图片角色必须严格区分：",
    "1. 参考图：只用于参考风格、构图、排版、色调、氛围、材质表现等视觉方法。",
    "2. 产品图：作为新画面的产品主体来源，保持产品主体清晰、真实、完整、可信。",
    "请生成新的商业图片，不要直接照搬参考图内容，不要复制参考图里的文案、Logo、人物、品牌元素或具体商品。",
    typeMap[outputType],
    `产品名称：${productName || "未填写，请根据产品图主体判断"}`,
    `卖点描述：${sellingPoints || "突出产品质感、使用价值和电商转化力"}`,
    `补充要求：${extraRequirements || "保持高级、干净、适合电商展示"}`,
    `模仿维度：${dimensions.length ? dimensions.join("、") : "模仿风格、模仿构图、模仿色调"}`,
    `模仿强度：${strength}。${strengthMap[strength]}`,
    `输出比例：${ratio}。`,
    "最终画面要求：按参考图和用户补充要求重新组织画面，让本次结果在构图、背景、色彩和信息密度上不同于其他工作流。",
    antiTemplateInstruction,
    "负面要求：不要低清、不要畸变、不要脏乱背景、不要错别字、不要水印、不要直接复制参考图文案。",
  ].join("\n");
}

export function buildDetailPrompt({
  productName,
  sellingPoints,
  templateId,
  ratio,
}: {
  productName: string;
  sellingPoints: string;
  templateId: DetailTemplateId;
  ratio: Ratio;
}) {
  const template = detailTemplates.find((item) => item.id === templateId);

  return [
    "你正在为电商详情页生成单屏详情图。",
    `详情图模板：${template?.name || "核心卖点图"}。`,
    detailPromptMap[templateId],
    `产品名称：${productName || "未填写，请根据产品图主体判断"}`,
    `卖点信息：${sellingPoints || "突出产品核心优势、使用价值和购买理由"}`,
    `输出比例：${ratio}。`,
    "画面要求：必须像详情页信息模块，而不是单张产品主图或海报。优先使用分区、标签、留白卡片、局部特写、说明线、对比区或场景步骤。",
    antiTemplateInstruction,
    "不要生成难以阅读的小字，不要乱码，不要堆砌元素，不要廉价促销感。",
  ].join("\n");
}

export function buildPosterPrompt({
  productName,
  title,
  subtitle,
  posterType,
  posterStyle,
  ratio,
}: {
  productName: string;
  title: string;
  subtitle: string;
  posterType: PosterType;
  posterStyle: PosterStyle;
  ratio: Ratio;
}) {
  const typeGuide: Record<PosterType, string> = {
    促销: "促销海报：强调价格/优惠/行动感区域，视觉节奏更直接，允许高对比色块和强转化布局。",
    活动: "活动海报：强调活动主题、时间感、入口感和场景氛围，版式要有明确主标题区域。",
    节日: "节日海报：使用节日符号、礼赠感、季节色彩和装饰节奏，氛围优先于白底商品展示。",
    上新: "上新海报：强调新品发布、新鲜感、首发感和品牌仪式感，可用更大胆的构图。",
    品牌: "品牌海报：强调品牌调性、留白、材质和叙事感，避免促销贴纸感。",
  };
  const styleGuide: Record<PosterStyle, string> = {
    科技感: "科技感：可使用结构光、界面感、深浅反差、金属/玻璃材质和未来空间，但不要所有产品都悬浮蓝光。",
    高级感: "高级感：强调品牌摄影、克制色彩、材质细节和留白，不等于统一浅色香氛风。",
    极简: "极简：少元素、大留白、强秩序，用一个视觉动作完成表达。",
    清新: "清新：更明亮、生活化、自然光、轻道具和柔和色彩。",
    节日氛围: "节日氛围：强装饰、礼赠、季节符号和热闹层次，和普通产品图拉开差异。",
  };

  return [
    "你正在为电商营销生成商业海报。",
    `海报类型：${posterType}。`,
    typeGuide[posterType],
    `海报风格：${posterStyle}。`,
    styleGuide[posterStyle],
    `产品名称：${productName || "未填写，请根据产品图主体判断"}`,
    `主标题：${title || "保留醒目的标题区域，不要生成乱码文字"}`,
    `副标题：${subtitle || "保留副标题区域，画面信息克制"}`,
    `输出比例：${ratio}。`,
    "请以产品图为主体，Logo 只作为品牌标识参考。画面必须有海报式版式、主标题安全区、活动/品牌氛围和明确视觉节奏，不要生成普通白底产品图。",
    antiTemplateInstruction,
    "避免直接生成错误文字。可预留标题区域或生成清晰短标题感，不要水印、乱码、变形产品。",
  ].join("\n");
}
