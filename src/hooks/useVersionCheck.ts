import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Polls /version.json to detect new deployments.
 * When a newer build is found, shows a toast and hard-reloads after a short delay
 * so every user automatically gets the latest code.
 *
 * Also checks immediately when the tab becomes visible (e.g. user switches back
 * after the app was in the background).
 *
 * The hook is a no-op in development (VITE_BUILD_ID is only defined in prod builds).
 */

const POLL_INTERVAL_MS = 60 * 1000; // check every 1 minute

export function useVersionCheck() {
  const currentBuildId = useRef(
    // Vite injects this at build time via the versionPlugin
    (import.meta.env.VITE_BUILD_ID as string | undefined) ?? null,
  );

  useEffect(() => {
    // Skip in dev — there's no version.json and no build ID
    if (!import.meta.env.PROD || !currentBuildId.current) return;

    // On mount: clean up the _v cache-bust param from a previous reload
    const params = new URLSearchParams(window.location.search);
    if (params.has("_v")) {
      params.delete("_v");
      const clean = params.toString();
      const newUrl = window.location.pathname + (clean ? `?${clean}` : "") + window.location.hash;
      window.history.replaceState(null, "", newUrl);
    }

    let timer: ReturnType<typeof setInterval>;
    let updating = false;

    async function check() {
      if (updating) return;
      try {
        const res = await fetch("/version.json", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok) return;
        const { buildId } = (await res.json()) as { buildId: string };

        if (buildId && buildId !== currentBuildId.current) {
          updating = true;
          clearInterval(timer);

          toast.info("Updating to the latest version...", { duration: 3000 });

          setTimeout(async () => {
            // Nuke ALL caches (SW cache + browser Cache API)
            if ("caches" in window) {
              const keys = await caches.keys();
              await Promise.all(keys.map((k) => caches.delete(k)));
            }

            // Unregister service workers so the next load is completely fresh
            if ("serviceWorker" in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map((r) => r.unregister()));
            }

            // Navigate to a cache-busted URL to force a true hard reload
            // This is the programmatic equivalent of Ctrl+Shift+R
            const url = new URL(window.location.href);
            url.searchParams.set("_v", buildId);
            window.location.replace(url.toString());
          }, 3000);
        }
      } catch {
        // Network error — ignore, we'll try again next interval
      }
    }

    // Check when tab becomes visible (user switches back after being away)
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        check();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    // First check shortly after mount (give the page time to settle)
    const initial = setTimeout(check, 3_000);
    // Then periodically
    timer = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}
