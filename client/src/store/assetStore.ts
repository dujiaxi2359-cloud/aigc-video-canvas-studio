import { create } from "zustand";
import { assetApi, type AssetListQuery } from "../services/assetApi";
import type { Asset, AssetFolder } from "../types/asset";

type State = {
  assets: Asset[];
  folders: AssetFolder[];
  fetchAssets: (query?: AssetListQuery) => Promise<void>;
  fetchFolders: () => Promise<void>;
  uploadAsset: (file: File, input?: { folderId?: string | null; name?: string }) => Promise<Asset>;
  renameAsset: (id: string, name: string) => Promise<void>;
  moveAsset: (id: string, folderId: string | null) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  createFolder: (name: string, parentId?: string | null) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
};

export const useAssetStore = create<State>((set, get) => ({
  assets: [],
  folders: [],
  fetchAssets: async (query = {}) => set({ assets: await assetApi.list(query) }),
  fetchFolders: async () => set({ folders: await assetApi.folders() }),
  uploadAsset: async (file, input) => {
    const asset = await assetApi.upload(file, input);
    await get().fetchAssets();
    await get().fetchFolders();
    return asset;
  },
  renameAsset: async (id, name) => {
    await assetApi.update(id, { name });
    await get().fetchAssets();
  },
  moveAsset: async (id, folderId) => {
    await assetApi.update(id, { folderId });
    await get().fetchAssets();
  },
  deleteAsset: async (id) => {
    await assetApi.remove(id);
    await get().fetchAssets();
  },
  createFolder: async (name, parentId) => {
    await assetApi.createFolder(name, parentId);
    await get().fetchFolders();
  },
  renameFolder: async (id, name) => {
    await assetApi.updateFolder(id, { name });
    await get().fetchFolders();
  },
  deleteFolder: async (id) => {
    await assetApi.removeFolder(id);
    await get().fetchFolders();
  }
}));
