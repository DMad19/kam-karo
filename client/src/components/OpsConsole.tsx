import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { simulateSurge } from "../api/kamKaroApi.ts";
import type {
  CityName,
  GetFlagsResponse,
  OpsLogEntry,
  PublicItemView,
} from "../types/index.ts";

interface OpsConsoleProps {
  city: CityName;
  items: PublicItemView[];
  flagsData: GetFlagsResponse | null;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  selfHealedDetected: boolean;
  syncError: string | null;
  onSyncNow: () => Promise<void>;
}

const DEFAULT_STATS = {
  polite_aunty: { sessions: 0, dealsClosed: 0, totalRevenue: 0 },
  savage_local: { sessions: 0, dealsClosed: 0, totalRevenue: 0 },
};

function getStageBadgeClass(stage: OpsLogEntry["stage"]): string {
  switch (stage) {
    case "SELF_HEALED":
      return "bg-[#15803D] text-white";
    case "ALERT_SENT":
      return "bg-vermilion text-white";
    case "AWAITING_APPROVAL":
      return "bg-gold text-ink";
    default:
      return "bg-white/15 text-white";
  }
}

export function OpsConsole({
  city,
  items,
  flagsData,
  isSyncing,
  lastSyncedAt,
  selfHealedDetected,
  syncError,
  onSyncNow,
}: OpsConsoleProps) {
  const [isTriggeringSurge, setIsTriggeringSurge] = useState(false);
  const [surgeMessage, setSurgeMessage] = useState<string | null>(null);
  const [surgeError, setSurgeError] = useState<string | null>(null);

  const stats = flagsData?.experimentStats ?? DEFAULT_STATS;
  const opsLog = flagsData?.opsLog ?? [];
  const surgeLiteMode = flagsData?.surge_lite_mode ?? false;
  const persona = flagsData?.haggling_persona ?? "polite_aunty";
  const cityConfig = flagsData?.city_fair_price_config ?? {
    multiplier: 1.0,
    label: "Standard",
  };

  async function handleSimulateSurge() {
    if (isTriggeringSurge) {
      return;
    }
    const targetItemId = items[items.length - 1]?.id ?? items[0]?.id ?? "item_03";
    setIsTriggeringSurge(true);
    setSurgeError(null);
    setSurgeMessage(null);

    try {
      const res = await simulateSurge({ itemId: targetItemId, city });
      setSurgeMessage(
        `NudgeBee webhook delivered (HTTP ${res.webhookStatusCode}) for ${res.payload.item_id}. Approve runbook in NudgeBee Cloud.`
      );
      await onSyncNow();
    } catch (err) {
      setSurgeError(
        err instanceof Error ? err.message : "Failed to trigger Diwali surge."
      );
    } finally {
      setIsTriggeringSurge(false);
    }
  }

  return (
    <footer className="bg-plum text-white">
      <div className="diwali-toran-strip" aria-hidden="true" />
      <div className="mx-auto max-w-6xl px-4 py-5 space-y-4">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Terminal className="h-5 w-5 text-gold" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Control Plane · Flagsmith &amp; NudgeBee Ops Console
            </h2>
            {(selfHealedDetected || surgeLiteMode) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#15803D] px-2.5 py-0.5 text-[11px] font-bold text-white shadow-xs">
                <CheckCircle2 className="h-3.5 w-3.5" />
                SELF_HEALED
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {lastSyncedAt && (
              <span className="text-[11px] text-white/70 tabular-nums">
                Synced {lastSyncedAt} (3s poll)
              </span>
            )}
            <button
              type="button"
              disabled={isSyncing}
              onClick={() => void onSyncNow()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/25 disabled:opacity-50 cursor-pointer transition"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
              />
              Sync Now
            </button>
            <button
              type="button"
              disabled={isTriggeringSurge}
              onClick={() => void handleSimulateSurge()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-vermilion px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50 cursor-pointer transition"
            >
              {isTriggeringSurge ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
              Simulate Diwali 8 PM Rush
            </button>
          </div>
        </div>

        {(surgeMessage || surgeError || syncError) && (
          <div className="space-y-1.5">
            {surgeMessage && (
              <p className="rounded-lg bg-gold/25 border border-gold/50 px-3 py-2 text-xs font-semibold text-gold">
                {surgeMessage}
              </p>
            )}
            {(surgeError || syncError) && (
              <p className="rounded-lg bg-vermilion/30 border border-vermilion px-3 py-2 text-xs font-semibold text-white">
                {surgeError ?? syncError}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-12">
          {/* Live Flagsmith JSON Badges */}
          <div className="lg:col-span-4 rounded-xl bg-white/10 p-3.5 border border-white/15 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gold">
              <Activity className="h-3.5 w-3.5" />
              Live Flagsmith State
            </div>
            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between rounded bg-black/25 px-2.5 py-1.5">
                <span className="text-white/75">haggling_persona</span>
                <span className="font-bold text-gold">&quot;{persona}&quot;</span>
              </div>
              <div className="flex items-center justify-between rounded bg-black/25 px-2.5 py-1.5">
                <span className="text-white/75">surge_lite_mode</span>
                <span
                  className={`font-bold ${
                    surgeLiteMode ? "text-gold" : "text-[#4ADE80]"
                  }`}
                >
                  {String(surgeLiteMode)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded bg-black/25 px-2.5 py-1.5">
                <span className="text-white/75 shrink-0">
                  city_fair_price_config
                </span>
                <span className="font-bold text-white truncate tabular-nums">
                  {JSON.stringify(cityConfig)}
                </span>
              </div>
            </div>
          </div>

          {/* Numeric A/B Scoreboard */}
          <div className="lg:col-span-4 rounded-xl bg-white/10 p-3.5 border border-white/15 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gold">
              <BarChart3 className="h-3.5 w-3.5" />
              Persona A/B Scoreboard
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs tabular-nums">
              <div className="rounded-lg bg-black/25 p-2.5 space-y-1">
                <span className="font-bold text-gold block">Polite Aunty</span>
                <div className="text-white/85">
                  Sessions: <strong>{stats.polite_aunty.sessions}</strong>
                </div>
                <div className="text-white/85">
                  Deals: <strong>{stats.polite_aunty.dealsClosed}</strong>
                </div>
                <div className="text-white">
                  Rev: <strong>₹{stats.polite_aunty.totalRevenue}</strong>
                </div>
              </div>
              <div className="rounded-lg bg-black/25 p-2.5 space-y-1">
                <span className="font-bold text-marigold block">
                  Savage Local
                </span>
                <div className="text-white/85">
                  Sessions: <strong>{stats.savage_local.sessions}</strong>
                </div>
                <div className="text-white/85">
                  Deals: <strong>{stats.savage_local.dealsClosed}</strong>
                </div>
                <div className="text-white">
                  Rev: <strong>₹{stats.savage_local.totalRevenue}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Timestamped Ops Activity Log */}
          <div className="lg:col-span-4 rounded-xl bg-white/10 p-3.5 border border-white/15 space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-gold">
              Ops Activity Log ({opsLog.length})
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1 text-[11px]">
              {opsLog.length === 0 ? (
                <p className="text-white/65 italic">
                  Waiting for Flagsmith &amp; NudgeBee events...
                </p>
              ) : (
                opsLog.map((entry, idx) => (
                  <div
                    key={`${entry.timestamp}-${idx}`}
                    className={`rounded px-2 py-1.5 ${
                      entry.stage === "SELF_HEALED"
                        ? "bg-[#15803D]/25 border border-[#15803D]"
                        : "bg-black/25"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${getStageBadgeClass(
                          entry.stage
                        )}`}
                      >
                        {entry.stage}
                      </span>
                      <span className="text-white/60 tabular-nums">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-white/90 leading-snug">{entry.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
