import { useCallback, useEffect, useState } from "react";
import type { UpdateInfo } from "../../shared/types";

/** Hook for in-app update notification.
 *  - Fetches /api/update-info on mount + on window focus (server caches 6h)
 *  - Indicator persists while `updateAvailable` is true — no dismiss option
 *    by design, so users actually update instead of silencing the prompt.
 */
export function useUpdateInfo(token: string) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  const refetch = useCallback(async () => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
      const res = await fetch("/api/update-info", { headers });
      if (!res.ok) return;
      const data = (await res.json()) as UpdateInfo;
      setInfo(data);
    } catch {
      // Network errors are silent — no notification shown
    }
  }, [token]);

  useEffect(() => {
    refetch();
    const onFocus = () => refetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  const showIndicator = Boolean(info?.updateAvailable && info.latest);

  return { info, showIndicator, refetch };
}
