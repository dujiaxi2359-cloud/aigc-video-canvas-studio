"use client";

import { useEffect } from "react";

const CACHE_RESET_VERSION = "force-aigc-nong-20260531";
const STORAGE_KEY = "aigc_nong_cache_reset_version";

export function ClientCacheReset() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.localStorage.getItem(STORAGE_KEY) === CACHE_RESET_VERSION) {
      return;
    }

    let cancelled = false;

    async function resetLegacyCache() {
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
          if (navigator.serviceWorker.controller) {
            await navigator.serviceWorker.ready.catch(() => null);
          }
        }

        if ("caches" in window) {
          const names = await window.caches.keys();
          await Promise.all(names.map((name) => window.caches.delete(name)));
        }

        window.localStorage.setItem(STORAGE_KEY, CACHE_RESET_VERSION);

        if (!cancelled && !window.location.search.includes("cache-reset=done")) {
          const url = new URL(window.location.href);
          url.searchParams.set("cache-reset", "done");
          url.searchParams.set("v", CACHE_RESET_VERSION);
          window.location.replace(url.toString());
        }
      } catch {
        window.localStorage.setItem(STORAGE_KEY, CACHE_RESET_VERSION);
      }
    }

    void resetLegacyCache();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
