import { useEffect, useCallback } from "react";
import { APP_VERSION } from "@/constants/version";

const CURRENT_VERSION = APP_VERSION;
const VERSION_CHECK_INTERVAL = 3 * 60 * 1000; // 3 minutes

export function useVersionCheck() {
  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch(`/version.json?_t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.version && data.version !== CURRENT_VERSION) {
        console.log(`New version ${data.version} available (current: ${CURRENT_VERSION}). Reloading…`);
        window.location.reload();
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    checkVersion();
    const interval = setInterval(checkVersion, VERSION_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [checkVersion]);
}

export { CURRENT_VERSION };
