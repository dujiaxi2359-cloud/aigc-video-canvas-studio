import { createId } from "../../utils/id.js";
import type {
  AgentCanvasState,
  AgentDiagnosticIssue,
  AgentDiagnosticReport,
  AgentExplainErrorInput,
  AgentPlanInput,
  AgentWorkflowPlan
} from "../../types/agent.js";

function planId() {
  return createId("agent_plan");
}

function baseNode(tempId: string, type: AgentWorkflowPlan["nodes"][number]["type"], title: string, x: number, y: number, data: Record<string, unknown>) {
  return { tempId, type, title, position: { x, y }, data: { title, ...data } };
}

function productVideoPlan(prompt: string): AgentWorkflowPlan {
  return {
    id: planId(),
    title: "产品视频工作流",
    goal: prompt,
    summary: "创建脚本、图片素材、视频生成和视频合成节点，适合从产品图出发生成广告视频。",
    nodes: [
      baseNode("script", "script", "脚本草稿", 120, 120, { prompt, content: "" }),
      baseNode("image", "imageAsset", "产品图片素材", 500, 120, {}),
      baseNode("video", "videoGenerate", "产品视频生成", 880, 120, {
        prompt,
        inputMode: "image-to-video",
        aspectRatio: "16:9",
        duration: 8,
        status: "idle"
      }),
      baseNode("compose", "compose", "视频合成", 1280, 120, { status: "idle" })
    ],
    edges: [
      { sourceTempId: "script", targetTempId: "video" },
      { sourceTempId: "image", targetTempId: "video" },
      { sourceTempId: "video", targetTempId: "compose" }
    ],
    warnings: ["请先上传产品图片，再运行视频生成节点。"]
  };
}

function ecommerceImagePlan(prompt: string): AgentWorkflowPlan {
  return {
    id: planId(),
    title: "电商主图工作流",
    goal: prompt,
    summary: "创建图片素材、图片生成和图片编辑节点，用于产品主图和视觉优化。",
    nodes: [
      baseNode("image", "imageAsset", "产品参考图", 120, 120, {}),
      baseNode("generate", "imageGenerate", "主图生成", 520, 80, {
        prompt,
        inputMode: "text-to-image",
        aspectRatio: "1:1",
        generateCount: 1,
        status: "idle"
      }),
      baseNode("edit", "imageGenerate", "主图精修", 940, 120, {
        prompt: `${prompt}\n请强化产品质感、光影和商业构图。`,
        inputMode: "image-edit",
        aspectRatio: "1:1",
        generateCount: 1,
        status: "idle"
      })
    ],
    edges: [
      { sourceTempId: "image", targetTempId: "edit" },
      { sourceTempId: "generate", targetTempId: "edit" }
    ],
    warnings: ["图片编辑节点需要至少连接一张图片素材。"]
  };
}

function imageToVideoPlan(prompt: string): AgentWorkflowPlan {
  return {
    id: planId(),
    title: "图生视频工作流",
    goal: prompt,
    summary: "从图片素材直接连接到视频生成节点，适合快速生成动态镜头。",
    nodes: [
      baseNode("image", "imageAsset", "起始图片", 120, 120, {}),
      baseNode("video", "videoGenerate", "图生视频", 540, 120, {
        prompt,
        inputMode: "image-to-video",
        aspectRatio: "16:9",
        duration: 8,
        status: "idle"
      })
    ],
    edges: [{ sourceTempId: "image", targetTempId: "video" }],
    warnings: ["请上传或选择一张图片素材后再生成。"]
  };
}

function storyboardPlan(prompt: string): AgentWorkflowPlan {
  return {
    id: planId(),
    title: "短剧分镜工作流",
    goal: prompt,
    summary: "创建文本设定、脚本、图片生成和视频生成节点，用于短剧分镜初稿。",
    nodes: [
      baseNode("text", "text", "故事设定", 120, 120, { content: prompt }),
      baseNode("script", "script", "分镜脚本", 480, 120, { prompt, content: "" }),
      baseNode("image", "imageGenerate", "关键帧生成", 840, 80, {
        prompt,
        inputMode: "text-to-image",
        aspectRatio: "16:9",
        status: "idle"
      }),
      baseNode("video", "videoGenerate", "镜头视频生成", 1240, 120, {
        prompt,
        inputMode: "image-to-video",
        aspectRatio: "16:9",
        duration: 8,
        status: "idle"
      })
    ],
    edges: [
      { sourceTempId: "text", targetTempId: "script" },
      { sourceTempId: "script", targetTempId: "image" },
      { sourceTempId: "image", targetTempId: "video" }
    ],
    warnings: []
  };
}

export function createRuleBasedWorkflowPlan(input: AgentPlanInput): AgentWorkflowPlan {
  const prompt = input.prompt.trim() || "创建一个 AIGC 视频工作流";
  if (/电商|主图|亚马逊|产品图|详情图/i.test(prompt)) return ecommerceImagePlan(prompt);
  if (/图生视频|图片生成视频|image.?to.?video/i.test(prompt)) return imageToVideoPlan(prompt);
  if (/短剧|分镜|故事板|镜头/i.test(prompt)) return storyboardPlan(prompt);
  return productVideoPlan(prompt);
}

export function diagnoseCanvasWithRules(canvasState: AgentCanvasState = {}): AgentDiagnosticReport {
  const nodes = canvasState.nodes ?? [];
  const issues: AgentDiagnosticIssue[] = nodes.flatMap((node) => {
    const errorMessage = String(node.data?.errorMessage ?? "");
    if (!errorMessage) return [];
    return [{
      nodeId: node.id,
      title: "节点生成失败",
      message: errorMessage,
      suggestion: "可以让 Agent 分析错误来源，或检查模型配置、网络代理和上游素材连接。",
      actionType: "explainError" as const
    }];
  });

  if (nodes.length === 0) {
    issues.push({
      title: "画布为空",
      message: "当前还没有工作流节点。",
      suggestion: "可以让 Agent 根据创作目标生成一套基础工作流。"
    });
  }

  return {
    level: issues.some((issue) => issue.nodeId) ? "warning" : "info",
    summary: issues.length ? `发现 ${issues.length} 个可优化项。` : "当前画布没有明显错误。",
    issues
  };
}

export function explainErrorWithRules(input: AgentExplainErrorInput) {
  const message = input.errorMessage || "未知错误";
  let suggestion = "请检查模型配置、API Key、网络代理和上游素材连接。";
  if (/PUBLIC_URL_REQUIRED|localhost|公网|public/i.test(message)) {
    suggestion = "该错误通常表示云端模型无法访问本地图片。请配置 BACKEND_PUBLIC_BASE_URL，或使用 OSS / 内网穿透提供公网图片地址。";
  } else if (/API Key|401|403|unauthorized/i.test(message)) {
    suggestion = "该错误通常和 API Key、模型权限或资源区域不匹配有关。请回到设置中心重新确认对应模型配置。";
  } else if (/image|图片|素材|input/i.test(message)) {
    suggestion = "请确认该节点已经连接可用的图片素材节点，且上游节点有 outputUrl 或 assetId。";
  }

  return {
    explanation: `这个错误来自节点生成前校验或 provider 调用：${message}`,
    suggestion,
    actions: ["openSettings", "explainError"]
  };
}
