import { useEffect, useCallback } from "react";

const CURRENT_VERSION = "0.1.8";
const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useVersionCheck() {
  const checkVersion = useCallback(async () => {
    try {
      // Fetch the index page with cache-busting to check for new deployments
      const res = await fetch(`/?_v=${Date.now()}`, {
        cache: "no-store",
        headers: { Accept: "text/html" },
      });
      const html = await res.text();
      // Look for a version meta tag or the JS bundle hash changing
      const match = html.match(/data-version="([^"]+)"/);
      if (match && match[1] !== CURRENT_VERSION) {
        console.log(`New version available: ${match[1]} (current: ${CURRENT_VERSION})`);
        window.location.reload();
      }
    } catch {
      // Silently fail — don't interrupt user experience
    }
  }, []);

  useEffect(() => {
    // Check on mount
    checkVersion();
    // Then periodically
    const interval = setInterval(checkVersion, VERSION_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [checkVersion]);
}

export { CURRENT_VERSION };
