import { api, apiUrl } from "./api";
import type { Asset, AssetFolder } from "../types/asset";

export type AssetListQuery = {
  type?: string;
  folderId?: string | null;
  source?: string;
  projectId?: string;
  keyword?: string;
  sortBy?: string;
  sortOrder?: string;
};

export const assetApi = {
  list: (query: AssetListQuery = {}) => api.get<Asset[]>("/api/assets", {
    params: Object.fromEntries(Object.entries(query).map(([key, value]) => [key, value == null ? undefined : String(value)]))
  }),
  folders: (projectId?: string) => api.get<AssetFolder[]>("/api/assets/folders", { params: { projectId } }),
  createFolder: (name: string, parentId?: string | null) => api.post<AssetFolder>("/api/assets/folders", { name, parentId }),
  updateFolder: (id: string, input: { name?: string; parentId?: string | null }) => api.patch<AssetFolder>(`/api/assets/folders/${id}`, input),
  removeFolder: (id: string) => api.delete(`/api/assets/folders/${id}`),
  upload: (file: File, input: { folderId?: string | null; name?: string } = {}) => {
    const formData = new FormData();
    formData.append("file", file);
    if (input.folderId) formData.append("folderId", input.folderId);
    if (input.name) formData.append("name", input.name);
    return api.post<Asset>("/api/assets/upload", formData);
  },
  update: (id: string, input: { name?: string; folderId?: string | null }) => api.patch<Asset>(`/api/assets/${id}`, input),
  remove: (id: string) => api.delete(`/api/assets/${id}`),
  downloadUrl: (id: string) => apiUrl(`/api/assets/${id}/download`)
};
