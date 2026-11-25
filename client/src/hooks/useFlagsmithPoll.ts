import { useCallback, useEffect, useRef, useState } from "react";
import { getFlags } from "../api/kamKaroApi.ts";
import type { CityName, GetFlagsResponse } from "../types/index.ts";

const POLL_INTERVAL_MS = 3000;

export interface FlagsmithPollState {
  flagsData: GetFlagsResponse | null;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  selfHealedDetected: boolean;
  syncError: string | null;
  syncNow: () => Promise<void>;
}

export function useFlagsmithPoll(
  sessionId: string,
  city: CityName
): FlagsmithPollState {
  const [flagsData, setFlagsData] = useState<GetFlagsResponse | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [selfHealedDetected, setSelfHealedDetected] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const prevSurgeRef = useRef<boolean>(false);

  const applyFlagsResponse = useCallback((res: GetFlagsResponse) => {
    if (!prevSurgeRef.current && res.surge_lite_mode) {
      setSelfHealedDetected(true);
    } else if (prevSurgeRef.current && !res.surge_lite_mode) {
      setSelfHealedDetected(false);
    }
    prevSurgeRef.current = res.surge_lite_mode;
    setFlagsData(res);
    setLastSyncedAt(new Date().toLocaleTimeString());
    setSyncError(null);
  }, []);

  const syncNow = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await getFlags(sessionId, city);
      applyFlagsResponse(res);
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : "Flagsmith sync unavailable"
      );
    } finally {
      setIsSyncing(false);
    }
  }, [sessionId, city, applyFlagsResponse]);

  useEffect(() => {
    let cancelled = false;

    async function pollOnce() {
      try {
        const res = await getFlags(sessionId, city);
        if (!cancelled) {
          applyFlagsResponse(res);
        }
      } catch {
        // Keep polling quietly if backend or Flagsmith is starting up
      }
    }

    void pollOnce();
    const intervalId = window.setInterval(() => {
      void pollOnce();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [sessionId, city, applyFlagsResponse]);

  return {
    flagsData,
    isSyncing,
    lastSyncedAt,
    selfHealedDetected,
    syncError,
    syncNow,
  };
}
