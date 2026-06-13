import type { WorkflowConfig } from "@/lib/workflows/workflowTypes";
import { photoPath } from "@/lib/app-path";

export const workflowRegistry: WorkflowConfig[] = [
  {
    id: "text-image",
    name: "文本生图",
    description: "用文字 Prompt 生成电商视觉图。",
    featureKey: "text-image",
    enabled: true,
    route: photoPath("/api/generate-image"),
  },
  {
    id: "reference-mimic",
    name: "参考图模仿",
    description: "参考构图、氛围和视觉语言，并可用产品图锁定主体。",
    featureKey: "reference-mimic",
    enabled: true,
    route: photoPath("/api/generate-reference"),
  },
  {
    id: "product-workflow",
    name: "产品图工作流",
    description: "锁定产品主体，按提示词生成背景、场景和光影。",
    featureKey: "product-workflow",
    enabled: true,
    route: photoPath("/api/product-workflow"),
  },
  {
    id: "product-variant",
    name: "产品风格变体",
    description: "同一产品生成多个视觉方向和陈列变体。",
    featureKey: "product-variant",
    enabled: true,
    route: photoPath("/api/product-variant"),
  },
  {
    id: "detail-workflow",
    name: "详情图套图",
    description: "按平台规则规划蓝图、锁定尺寸并批量生成详情图套图。",
    featureKey: "detail-batch",
    enabled: true,
    route: photoPath("/api/detail-batch-generate"),
  },
  {
    id: "poster-workflow",
    name: "海报工作流",
    description: "生成产品海报、活动图和内容封面。",
    featureKey: "poster",
    enabled: true,
    route: photoPath("/api/poster-generate"),
  },
];

export function getWorkflowConfig(id: string) {
  return workflowRegistry.find((workflow) => workflow.id === id);
}
