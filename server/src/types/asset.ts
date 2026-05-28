export type Asset = {
  id: string;
  name: string;
  type: "image" | "video" | "audio" | "text" | "script" | "unknown" | "generated" | "export";
  source: "uploaded" | "generated" | "imported";
  folderId: string | null;
  fileName: string;
  originalName: string;
  localPath: string;
  url: string;
  publicUrl?: string;
  downloadUrl?: string;
  size?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  thumbnailUrl?: string;
  providerId?: string;
  modelId?: string;
  nodeId?: string;
  projectId?: string;
  prompt?: string;
  negativePrompt?: string;
  generationParams?: Record<string, unknown>;
  createdAt: number;
  updatedAt?: number;
};

export type AssetFolder = {
  id: string;
  name: string;
  parentId: string | null;
  projectId?: string;
  createdAt: number;
  updatedAt?: number;
};
