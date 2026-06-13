import type { WorkflowHistoryItem } from "@/lib/history/historyTypes";

const localHistoryKey = "commerce_ai_workflow_history";

export function loadLocalHistory(): WorkflowHistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(localHistoryKey) || "[]");
  } catch {
    return [];
  }
}

export function saveLocalHistory(items: WorkflowHistoryItem[]) {
  localStorage.setItem(localHistoryKey, JSON.stringify(items.slice(0, 100)));
}
