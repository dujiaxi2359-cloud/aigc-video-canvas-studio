"use client";

import type { GeneratedImage } from "@/lib/image-generation";

const dbName = "ecommerce-ai-image-store";
const storeName = "generated-images";
const dbVersion = 1;

function openImageDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openImageDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = callback(transaction.objectStore(storeName));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function saveHistoryImages(historyId: string, images: GeneratedImage[]) {
  await withStore("readwrite", (store) => store.put(images, historyId));
}

export async function getHistoryImages(historyId: string) {
  return withStore<GeneratedImage[] | undefined>("readonly", (store) =>
    store.get(historyId),
  );
}
