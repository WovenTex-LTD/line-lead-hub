import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config";
import { initializeCapacitor, initializePushNotifications } from "./lib/capacitor";
import { logError } from "./lib/error-logger";

// Global error handlers — catch unhandled errors and log to Supabase
window.onerror = (message, source, lineno, colno, error) => {
  logError({
    message: typeof message === 'string' ? message : 'Unknown error',
    stack: error?.stack,
    source: 'window.onerror',
    severity: 'error',
    metadata: { fileSource: source, lineno, colno },
  });
};

window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  const error = event.reason;
  // AbortError is expected when navigating away from a page with in-flight requests
  if (error?.name === 'AbortError') return;
  logError({
    message: error?.message ?? String(error),
    stack: error?.stack,
    source: 'unhandledrejection',
    severity: 'error',
    metadata: { reason: String(error) },
  });
};

// Register service worker for PWA (PROD only).
// In DEV/preview, a Service Worker can cache Vite pre-bundled deps and cause
// a React instance mismatch (e.g. "Cannot read properties of null (reading 'useEffect')").
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    // Reload the page when a new service worker takes control.
    // This handles the case where the new SW activates (skipWaiting + clients.claim)
    // and ensures users always run the latest code.
    // When a new service worker takes control, clear stale caches but DON'T
    // hard-reload — the version check hook already handles deployment updates
    // on a 1-minute interval. A hard reload here destroys unsaved form data.
    navigator.serviceWorker.addEventListener("controllerchange", async () => {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      // The next navigation or periodic version check will pick up new assets.
    });

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: 'none' })
        .then((registration) => {
          console.log("SW registered:", registration.scope);
          // Check for updates immediately and then every 2 minutes
          registration.update();
          setInterval(() => registration.update(), 2 * 60 * 1000);
        })
        .catch((error) => {
          console.log("SW registration failed:", error);
        });
    });
  } else {
    // DEV: ensure any previously installed SW is removed and its caches are cleared.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
    if ("caches" in window) {
      caches.keys().then((keys) => {
        keys.forEach((k) => caches.delete(k));
      });
    }
  }
}

// Initialize Capacitor for native functionality
initializeCapacitor().then(() => {
  // initializePushNotifications is safe to call — it gracefully catches
  // the native FATAL EXCEPTION if Firebase is not yet configured.
  initializePushNotifications();
});

createRoot(document.getElementById("root")!).render(<App />);
