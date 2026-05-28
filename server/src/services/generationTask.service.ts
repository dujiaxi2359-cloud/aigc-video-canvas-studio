const tasks = new Map<string, unknown>();

export function getGenerationTask(id: string) {
  return tasks.get(id) ?? { id, status: "not_found", progress: 0 };
}
