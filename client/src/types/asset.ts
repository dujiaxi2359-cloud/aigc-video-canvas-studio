export type AssetType = "image" | "video" | "audio" | "text" | "script" | "unknown" | "generated" | "export";
export type AssetSource = "uploaded" | "generated" | "imported";

export type Asset = {
  id: string;
  name: string;
  type: AssetType;
  source: AssetSource;
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
  storageProvider?: string;
  storageKey?: string;
  storageBucket?: string;
  storageRegion?: string;
  storageFileType?: string;
  providerId?: string;
  modelId?: string;
  nodeId?: string;
  projectId?: string;
  ownerUserId?: string;
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
  ownerUserId?: string;
  createdAt: number;
  updatedAt?: number;
};
