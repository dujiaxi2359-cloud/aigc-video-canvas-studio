import type { PromptEnhancerInput } from "@/lib/promptEnhancer/promptEnhancerTypes";
import { getPlatformRule } from "@/lib/templates/platformRules";

function compact(value?: string) {
  return value?.trim() || "";
}

export function buildPromptEnhancement(input: PromptEnhancerInput) {
  const platform = getPlatformRule(input.platform || "通用电商");
  const size =
    input.targetWidth && input.targetHeight
      ? `${input.targetWidth}x${input.targetHeight}`
      : platform.targetSize.label;
  const textPolicy =
    input.textMode === "image-text"
      ? "可生成少量清晰文字，但必须符合输出语言，避免错字、乱码和无意义字符。"
      : "图片内不要直接生成可读文字，保留干净信息卡片、标题区和后期可编辑文案层。";

  return [
    compact(input.userPrompt) || "根据当前产品、工作流和用户选择生成对应视觉，不套用固定电商样片。",
    "",
    `工作流：${input.workflowType || "电商设计图"}`,
    `平台适配：${platform.name}，目标市场 ${input.market || platform.marketHint}，输出语言 ${input.language || "按用户选择"}。`,
    `目标导出规格：${size}。${platform.promptHint}`,
    `产品信息：${input.productName || "根据上传产品图判断"}；品类：${input.category || "未填写"}；品牌：${input.brandName || "未填写"}。`,
    `核心卖点：${compact(input.sellingPoints) || "根据用户输入选择功能、材质、场景、情绪或购买理由作为重点，不默认全都堆叠。"}。`,
    compact(input.parameters) ? `参数表达：${input.parameters}。` : "参数表达：只有参数说明类画面需要强化参数区域，其它画面不要默认生成参数信息图。",
    compact(input.materialInfo) ? `材质/工艺：${input.materialInfo}。` : "材质/工艺：只有材质细节类画面需要强化纹理和微距，其它画面按工作流决定。",
    `视觉表达：构图、主体比例、背景、信息密度和色彩由用户提示词与当前工作流决定；不要自动套用白底居中、极简电商、蓝紫科技或高级香氛模板。`,
    `内容结构：按当前工作流选择结构。主图重产品识别，详情重模块角色，海报重营销节奏，文本生图重用户创意，参考模仿重参考图维度。`,
    `技术要求：清晰锐利、无水印、无乱码、无低清像素感、产品不变形；${textPolicy}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildEnhancementNotes(input: PromptEnhancerInput) {
  const platform = getPlatformRule(input.platform || "通用电商");
  return [
    `已按 ${platform.name} 平台规则补充尺寸和可读性底线。`,
    "已避免把所有工作流统一改成白底主图、参数信息图或高级商业样片。",
    "已将风格控制交给用户提示词和当前工作流角色。",
    input.targetWidth && input.targetHeight
      ? `已读取目标尺寸 ${input.targetWidth}x${input.targetHeight}。`
      : `已使用平台默认尺寸 ${platform.targetSize.label}。`,
  ];
}
