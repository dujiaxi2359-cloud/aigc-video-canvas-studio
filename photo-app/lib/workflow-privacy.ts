export const workflowPromptHiddenText = "工作流内部提示词已隐藏。";

export function publicPrompt() {
  return workflowPromptHiddenText;
}

export function redactHistoryPrompt<T extends { finalPrompt?: string }>(item: T | null) {
  if (!item) return item;
  return { ...item, finalPrompt: workflowPromptHiddenText };
}
