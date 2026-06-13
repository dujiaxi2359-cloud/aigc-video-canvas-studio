import type { StoredAsset } from "@/lib/storage/storageTypes";

export const localStorageProvider = {
  async save(asset: StoredAsset) {
    return asset;
  },
};
