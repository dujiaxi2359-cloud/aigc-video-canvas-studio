export type WorkflowNode = {
  id: string;
  type: "text" | "image" | "video" | "audio" | "script" | "compose";
  position: { x: number; y: number };
  data: unknown;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

export type Project = {
  id: string;
  name: string;
  ownerUserId?: string;
  sharedWithUserIds?: string[];
  createdAt: number;
  updatedAt: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};
