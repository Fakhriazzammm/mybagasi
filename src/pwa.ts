// PWA registration guarded for Lovable preview / iframe contexts.
// Service worker only registers in production builds AND when not in an iframe
// AND not on a Lovable preview host. This prevents stale cache issues in the editor.

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const hostname = window.location.hostname;
const isPreviewHost =
  hostname.includes("id-preview--") ||
  hostname.includes("lovableproject.com") ||
  hostname.includes("lovable.dev");

const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

export function registerPwa() {
  // Always clean up any existing SW in preview/iframe contexts.
  if (isPreviewHost || isInIframe) {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => undefined);
    }
    return;
  }

  // Only register in production-like environments outside iframes.
  if (!import.meta.env.PROD || isLocalhost) return;

  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => undefined);
}

// Detect whether the app is already running as an installed PWA.
export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
