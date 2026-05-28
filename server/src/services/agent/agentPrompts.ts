import type { AgentCanvasState } from "../../types/agent.js";

const workflowSchema = `{
  "id": "string",
  "title": "string",
  "goal": "string",
  "summary": "string",
  "nodes": [
    {
      "tempId": "string",
      "type": "text | script | imageAsset | imageGenerate | videoGenerate | audio | compose",
      "title": "string",
      "position": { "x": 120, "y": 120 },
      "data": {}
    }
  ],
  "edges": [
    { "sourceTempId": "string", "targetTempId": "string" }
  ],
  "warnings": ["string"]
}`;

const diagnosticSchema = `{
  "level": "info | warning | error",
  "summary": "string",
  "issues": [
    {
      "nodeId": "string optional",
      "title": "string",
      "message": "string",
      "suggestion": "string",
      "actionType": "openSettings | openNetworkSettings | switchToVerifiedModel | addImageAssetNode | switchToTextToVideo | setAspectRatio | explainError optional"
    }
  ]
}`;

export function workflowPlannerPrompt(userPrompt: string, canvasState?: AgentCanvasState) {
  return `你是 AIGC Video Canvas Studio 的工作流副驾驶。请根据用户目标生成严格 JSON workflowPlan。

必须遵守：
- 只输出 JSON，不要 Markdown，不要解释文字。
- 节点类型只能使用：text, script, imageAsset, imageGenerate, videoGenerate, audio, compose。
- 不要包含 API Key、API Base URL 或任何密钥。
- 第一版默认手动确认，只创建节点和连线，不自动运行生成。
- 节点 data 可以写入 prompt、inputMode、aspectRatio、duration、status。
- 产品视频优先创建 script -> imageAsset -> videoGenerate -> compose。
- 电商主图优先创建 imageAsset -> imageGenerate -> imageGenerate(image-edit)。
- 图生视频优先创建 imageAsset -> videoGenerate。
- 短剧分镜优先创建 text -> script -> imageGenerate -> videoGenerate。

Schema:
${workflowSchema}

用户目标：
${userPrompt}

当前画布状态：
${JSON.stringify(canvasState ?? {}, null, 2)}`;
}

export function diagnosticPrompt(canvasState?: AgentCanvasState) {
  return `你是 AIGC 工作流诊断智能体。请分析当前画布状态，输出严格 JSON 诊断报告。

重点检查：模型未配置、素材缺失、图生视频缺图、图片编辑缺图、首尾帧只连接一张图、Google 地区限制、Azure Deployment 错误、DashScope localhost 图片访问问题、网络代理问题。

Schema:
${diagnosticSchema}

当前画布状态：
${JSON.stringify(canvasState ?? {}, null, 2)}`;
}

export function errorExplainPrompt(errorMessage: string, nodeData?: Record<string, unknown>, canvasState?: AgentCanvasState) {
  return `你是 AIGC 节点错误解释智能体。请用严格 JSON 解释错误，不要 Markdown。

Schema:
{
  "explanation": "string",
  "suggestion": "string",
  "actions": ["openSettings | openNetworkSettings | addImageAssetNode | switchToTextToVideo | explainError"]
}

错误：
${errorMessage}

节点数据：
${JSON.stringify(nodeData ?? {}, null, 2)}

画布状态：
${JSON.stringify(canvasState ?? {}, null, 2)}`;
}

export function jsonRepairPrompt(rawText: string, schemaName: "workflowPlan" | "diagnosticReport" | "errorExplanation") {
  return `请把下面内容修正为合法的 ${schemaName} JSON。只输出 JSON，不要 Markdown，不要解释。

原始内容：
${rawText}`;
}

