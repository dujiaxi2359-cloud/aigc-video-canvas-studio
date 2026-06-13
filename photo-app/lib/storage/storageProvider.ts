import { localStorageProvider } from "@/lib/storage/localStorageProvider";

// Current storage is local/browser based. Future SaaS mode can swap to R2/S3/Supabase.
export const storageProvider = localStorageProvider;
