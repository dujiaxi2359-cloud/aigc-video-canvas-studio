"use client";

import { useEffect } from "react";

export function HydrationErrorFilter() {
  useEffect(() => {
    const patterns = [
      "Hydration failed because the server rendered HTML didn't match the client",
      "https://react.dev/link/hydration-mismatch",
      "Minified React error #418",
      "Minified React error #423",
    ];

    function isHydrationNoise(value: unknown) {
      const message =
        value instanceof Error
          ? value.message
          : typeof value === "string"
            ? value
            : "";

      return patterns.some((pattern) => message.includes(pattern));
    }

    function handleError(event: ErrorEvent) {
      if (isHydrationNoise(event.error) || isHydrationNoise(event.message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    function handleRejection(event: PromiseRejectionEvent) {
      if (isHydrationNoise(event.reason)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    window.addEventListener("error", handleError, true);
    window.addEventListener("unhandledrejection", handleRejection, true);

    return () => {
      window.removeEventListener("error", handleError, true);
      window.removeEventListener("unhandledrejection", handleRejection, true);
    };
  }, []);

  return null;
}
