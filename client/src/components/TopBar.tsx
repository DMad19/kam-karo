import { Flame, Globe, MapPin, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  CITY_OPTIONS,
  LANGUAGE_OPTIONS,
  type CityName,
  type SupportedLanguage,
} from "../types/index.ts";

interface TopBarProps {
  language: SupportedLanguage;
  onLanguageChange: (language: SupportedLanguage) => void;
  city: CityName;
  onCityChange: (city: CityName) => void;
  cityLabel: string;
  cityMultiplier: number;
  surgeLiteMode: boolean;
}

export function TopBar({
  language,
  onLanguageChange,
  city,
  onCityChange,
  cityLabel,
  cityMultiplier,
  surgeLiteMode,
}: TopBarProps) {
  return (
    <header className="bg-plum text-white shadow-md">
      <div className="mx-auto max-w-6xl px-4 py-3.5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-marigold text-white shadow-md ring-2 ring-gold/70">
            <Flame className="h-6 w-6 fill-gold text-gold" />
          </div>
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <h1 className="text-xl font-extrabold tracking-tight text-gold">
                Kam Karo
              </h1>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-canvas border border-gold/30">
                by Coffee and Chaos
              </span>
            </div>
            <p className="text-xs text-canvas/85">
              Voice-First Multilingual Diwali Bazaar · Bengaluru &amp; Beyond
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs border border-white/15">
            <Globe className="h-3.5 w-3.5 text-gold shrink-0" />
            <span className="sr-only">Language</span>
            <select
              aria-label="Language selector"
              value={language}
              onChange={(e) =>
                onLanguageChange(e.target.value as SupportedLanguage)
              }
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option
                  key={opt.code}
                  value={opt.code}
                  className="bg-plum text-white"
                >
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs border border-white/15">
            <MapPin className="h-3.5 w-3.5 text-gold shrink-0" />
            <span className="sr-only">City</span>
            <select
              aria-label="City selector"
              value={city}
              onChange={(e) => onCityChange(e.target.value as CityName)}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
            >
              {CITY_OPTIONS.map((c) => (
                <option key={c} value={c} className="bg-plum text-white">
                  {c}
                </option>
              ))}
            </select>
            <span className="ml-1 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-gold">
              {cityLabel} · {cityMultiplier.toFixed(2)}x
            </span>
          </label>

          {surgeLiteMode ? (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-xs font-bold text-ink shadow-sm">
              <ShieldAlert className="h-3.5 w-3.5 text-vermilion" />
              <span>SURGE PROTECTION: TEXT LITE</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#15803D] px-3 py-1.5 text-xs font-bold text-white shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>LIVE MODE: NORMAL</span>
            </div>
          )}
        </div>
      </div>
      <div className="diwali-toran-strip" aria-hidden="true" />
    </header>
  );
}
