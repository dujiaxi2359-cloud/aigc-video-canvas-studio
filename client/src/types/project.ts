import type { Edge, Node } from "reactflow";

export type Project = {
  id: string;
  name: string;
  ownerUserId?: string;
  sharedWithUserIds?: string[];
  createdAt: number;
  updatedAt: number;
  nodes: Node[];
  edges: Edge[];
};
