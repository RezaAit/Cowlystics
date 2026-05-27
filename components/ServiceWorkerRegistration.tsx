"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((r) => console.log("[SW] registered", r.scope))
        .catch((e) => console.warn("[SW] failed", e));
    }
  }, []);

  return null;
}
