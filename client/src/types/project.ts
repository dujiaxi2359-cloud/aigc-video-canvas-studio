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

export type ProjectFolder = {
  id: string;
  name: string;
  parentId?: string;
  createdAt: number;
  updatedAt: number;
  sortOrder: number;
};

export type ProjectMeta = {
  folderId?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  coverAssetId?: string;
};
