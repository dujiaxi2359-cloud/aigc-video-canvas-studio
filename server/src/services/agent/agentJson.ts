import type { AgentDiagnosticReport, AgentWorkflowPlan } from "../../types/agent.js";

export function extractJsonObject(text: string) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    throw new Error("Agent did not return valid JSON");
  }
}

export function validateWorkflowPlan(value: unknown): AgentWorkflowPlan {
  const plan = value as Partial<AgentWorkflowPlan>;
  if (!plan || typeof plan !== "object") throw new Error("Agent workflow plan is not an object");
  if (!plan.title || !Array.isArray(plan.nodes) || !Array.isArray(plan.edges)) throw new Error("Agent workflow plan schema mismatch");
  return {
    id: String(plan.id || `agent_plan_${Date.now()}`),
    title: String(plan.title),
    goal: String(plan.goal || ""),
    summary: String(plan.summary || ""),
    nodes: plan.nodes.map((node, index) => ({
      tempId: String(node.tempId || `node_${index}`),
      type: node.type,
      title: String(node.title || node.type),
      position: {
        x: Number(node.position?.x ?? 120 + index * 360),
        y: Number(node.position?.y ?? 120)
      },
      data: node.data && typeof node.data === "object" ? node.data : {}
    })),
    edges: plan.edges.map((edge) => ({
      sourceTempId: String(edge.sourceTempId),
      targetTempId: String(edge.targetTempId)
    })),
    warnings: Array.isArray(plan.warnings) ? plan.warnings.map(String) : []
  };
}

export function validateDiagnosticReport(value: unknown): AgentDiagnosticReport {
  const report = value as Partial<AgentDiagnosticReport>;
  if (!report || typeof report !== "object" || !Array.isArray(report.issues)) throw new Error("Agent diagnostic schema mismatch");
  return {
    level: report.level === "error" || report.level === "warning" ? report.level : "info",
    summary: String(report.summary || ""),
    issues: report.issues.map((issue) => ({
      nodeId: issue.nodeId ? String(issue.nodeId) : undefined,
      title: String(issue.title || "诊断项"),
      message: String(issue.message || ""),
      suggestion: String(issue.suggestion || ""),
      actionType: issue.actionType
    }))
  };
}

