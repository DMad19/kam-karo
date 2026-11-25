import { useCallback, useEffect, useState } from "react";
import { ShoppingBag, Store } from "lucide-react";
import { getItems } from "./api/kamKaroApi.ts";
import { BargainMicTab } from "./components/BargainMicTab.tsx";
import { DukaanMicTab } from "./components/DukaanMicTab.tsx";
import { OpsConsole } from "./components/OpsConsole.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { useFlagsmithPoll } from "./hooks/useFlagsmithPoll.ts";
import type {
  CityName,
  PublicItemView,
  SupportedLanguage,
} from "./types/index.ts";

type ActiveTab = "dukaan" | "bargain";

function createBuyerSessionId(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `buyer_${num}`;
}

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("dukaan");
  const [language, setLanguage] = useState<SupportedLanguage>("hi-IN");
  const [city, setCity] = useState<CityName>("Bengaluru");
  const [sessionId, setSessionId] = useState<string>(() =>
    createBuyerSessionId()
  );

  const [items, setItems] = useState<PublicItemView[]>([]);
  const [cityMultiplier, setCityMultiplier] = useState<number>(1.0);
  const [cityLabel, setCityLabel] = useState<string>("Standard");
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(false);

  const {
    flagsData,
    isSyncing,
    lastSyncedAt,
    selfHealedDetected,
    syncError,
    syncNow,
  } = useFlagsmithPoll(sessionId, city);

  const refreshItems = useCallback(async () => {
    setIsLoadingItems(true);
    try {
      const res = await getItems(city);
      setItems(res.items);
      setCityMultiplier(res.cityMultiplier);
      setCityLabel(res.cityLabel);
    } catch {
      // Backend may still be booting during parallel dev
    } finally {
      setIsLoadingItems(false);
    }
  }, [city]);

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      try {
        const res = await getItems(city);
        if (!cancelled) {
          setItems(res.items);
          setCityMultiplier(res.cityMultiplier);
          setCityLabel(res.cityLabel);
        }
      } catch {
        // Backend may still be booting during parallel dev
      }
    }

    void loadItems();
    return () => {
      cancelled = true;
    };
  }, [city]);

  const persona = flagsData?.haggling_persona ?? "polite_aunty";
  const surgeLiteMode = flagsData?.surge_lite_mode ?? false;

  function handleNewBuyerSession() {
    setSessionId(createBuyerSessionId());
  }

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
      <TopBar
        language={language}
        onLanguageChange={setLanguage}
        city={city}
        onCityChange={setCity}
        cityLabel={cityLabel}
        cityMultiplier={cityMultiplier}
        surgeLiteMode={surgeLiteMode}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 space-y-5">
        {/* 2-Tab Switcher */}
        <div className="inline-flex rounded-xl bg-white p-1 shadow-xs border border-plum/15">
          <button
            type="button"
            onClick={() => setActiveTab("dukaan")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition cursor-pointer ${
              activeTab === "dukaan"
                ? "bg-marigold text-white shadow-xs"
                : "text-plum hover:bg-canvas"
            }`}
          >
            <Store className="h-4 w-4" />
            Dukaan Mic (Seller)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bargain")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition cursor-pointer ${
              activeTab === "bargain"
                ? "bg-marigold text-white shadow-xs"
                : "text-plum hover:bg-canvas"
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            Bargain Mic (Buyer)
          </button>
        </div>

        {activeTab === "dukaan" ? (
          <DukaanMicTab
            language={language}
            city={city}
            items={items}
            isLoadingItems={isLoadingItems}
            onItemCreated={refreshItems}
          />
        ) : (
          <BargainMicTab
            language={language}
            city={city}
            sessionId={sessionId}
            persona={persona}
            surgeLiteMode={surgeLiteMode}
            items={items}
            onNewBuyerSession={handleNewBuyerSession}
            onDealLocked={async () => {
              await Promise.all([refreshItems(), syncNow()]);
            }}
          />
        )}
      </main>

      <OpsConsole
        city={city}
        items={items}
        flagsData={flagsData}
        isSyncing={isSyncing}
        lastSyncedAt={lastSyncedAt}
        selfHealedDetected={selfHealedDetected}
        syncError={syncError}
        onSyncNow={syncNow}
      />
    </div>
  );
}

export default App;
