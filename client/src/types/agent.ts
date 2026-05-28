export type AgentNodeType = "text" | "script" | "imageAsset" | "imageGenerate" | "videoGenerate" | "audio" | "compose";

export type AgentWorkflowPlan = {
  id: string;
  title: string;
  goal: string;
  summary: string;
  nodes: AgentPlannedNode[];
  edges: AgentPlannedEdge[];
  warnings: string[];
};

export type AgentPlannedNode = {
  tempId: string;
  type: AgentNodeType;
  title: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

export type AgentPlannedEdge = {
  sourceTempId: string;
  targetTempId: string;
};

export type AgentDiagnosticReport = {
  level: "info" | "warning" | "error";
  summary: string;
  issues: AgentDiagnosticIssue[];
};

export type AgentDiagnosticIssue = {
  nodeId?: string;
  title: string;
  message: string;
  suggestion: string;
  actionType?:
    | "openSettings"
    | "openNetworkSettings"
    | "switchToVerifiedModel"
    | "addImageAssetNode"
    | "switchToTextToVideo"
    | "setAspectRatio"
    | "explainError";
};

export type AgentCanvasState = {
  nodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>;
  edges: Array<{ id?: string; source: string; target: string }>;
};

