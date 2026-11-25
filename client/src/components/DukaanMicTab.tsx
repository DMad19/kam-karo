import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  Mic,
  Package,
  Send,
  Sparkles,
  Square,
} from "lucide-react";
import { createVoiceItem } from "../api/kamKaroApi.ts";
import { useAudioRecorder } from "../hooks/useAudioRecorder.ts";
import {
  formatLanguageName,
  type CityName,
  type CreateVoiceItemResponse,
  type PublicItemView,
  type SupportedLanguage,
} from "../types/index.ts";
import { FairPriceMeter } from "./FairPriceMeter.tsx";

interface DukaanMicTabProps {
  language: SupportedLanguage;
  city: CityName;
  items: PublicItemView[];
  isLoadingItems: boolean;
  onItemCreated: () => Promise<void>;
}

const SELLER_SAMPLE_CHIPS: ReadonlyArray<{
  label: string;
  languageCode: SupportedLanguage;
  text: string;
}> = [
  {
    label: "Hindi · Kaju Katli",
    languageCode: "hi-IN",
    text: "Diwali special pure ghee kaju katli 1 kg box, asking 680 rupees, minimum floor 560 rupees, stock 8 boxes.",
  },
  {
    label: "Kannada · Terracotta Diyas",
    languageCode: "kn-IN",
    text: "Hand painted Bengaluru terracotta diyas set of 24, ask price 340 rupees, lowest floor 250 rupees, 15 sets available.",
  },
  {
    label: "Telugu · Dry-Fruit Hamper",
    languageCode: "te-IN",
    text: "Royal Diwali dry fruit gift hamper, ask price 1300 rupees, floor price 1020 rupees, 6 hampers ready.",
  },
];

export function DukaanMicTab({
  language,
  city,
  items,
  isLoadingItems,
  onItemCreated,
}: DukaanMicTabProps) {
  const recorder = useAudioRecorder();
  const [textFallback, setTextFallback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdResult, setCreatedResult] =
    useState<CreateVoiceItemResponse | null>(null);

  async function submitListing(params: {
    audioBlob?: Blob;
    text?: string;
    overrideLanguage?: SupportedLanguage;
  }) {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await createVoiceItem({
        audioBlob: params.audioBlob,
        textFallback: params.text,
        languageCode: params.overrideLanguage ?? language,
        city,
      });
      setCreatedResult(response);
      if (params.text) {
        setTextFallback("");
      }
      await onItemCreated();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to publish listing.";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleMicToggle() {
    if (recorder.isRecording) {
      recorder.stopRecording();
    } else {
      void recorder.startRecording((blob) => {
        void submitListing({ audioBlob: blob });
      });
    }
  }

  function handleTextSubmit(event: FormEvent) {
    event.preventDefault();
    if (!textFallback.trim() || isSubmitting) {
      return;
    }
    void submitListing({ text: textFallback });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left: Voice + Text Seller Input */}
      <section className="lg:col-span-5 rounded-2xl bg-[#FFFDF9] p-5 shadow-sm border border-marigold/30 flex flex-col gap-4">
        <div>
          <span className="inline-flex items-center gap-1 rounded-full bg-gold/30 px-2.5 py-0.5 text-[11px] font-bold text-ink">
            <Sparkles className="h-3 w-3 text-plum" />
            SELLER LISTING STUDIO
          </span>
          <h2 className="mt-1.5 text-lg font-bold text-plum">
            Speak Your Diwali Listing
          </h2>
          <p className="text-xs text-ink/75">
            Speak up to 25 seconds in {formatLanguageName(language)} — mention
            item name, ask price, private floor price, and stock.
          </p>
        </div>

        {/* 25s Mic Button */}
        <div className="flex flex-col items-center justify-center rounded-xl bg-canvas p-5 border border-marigold/30">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleMicToggle}
            className={`flex h-20 w-20 items-center justify-center rounded-full text-white shadow-md transition cursor-pointer disabled:opacity-50 ${
              recorder.isRecording
                ? "bg-vermilion animate-pulse ring-4 ring-vermilion/30"
                : "bg-marigold hover:brightness-95"
            }`}
            aria-label={
              recorder.isRecording ? "Stop recording" : "Start seller mic"
            }
          >
            {recorder.isRecording ? (
              <Square className="h-7 w-7 fill-current" />
            ) : (
              <Mic className="h-8 w-8" />
            )}
          </button>

          <div className="mt-3 text-center">
            {recorder.isRecording ? (
              <p className="text-sm font-bold text-vermilion tabular-nums">
                Recording · 00:{String(recorder.secondsLeft).padStart(2, "0")}{" "}
                left (click to stop)
              </p>
            ) : isSubmitting ? (
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-plum">
                <Loader2 className="h-4 w-4 animate-spin" />
                Transcribing &amp; extracting Diwali catalog item...
              </p>
            ) : (
              <p className="text-xs font-semibold text-ink/80">
                Tap Marigold Mic (hard 25s auto-stop)
              </p>
            )}
          </div>
        </div>

        {recorder.micError && (
          <div className="flex items-start gap-2 rounded-xl border border-vermilion/30 bg-vermilion/10 p-3 text-xs text-vermilion">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{recorder.micError}</span>
          </div>
        )}

        {/* Inline Text Fallback */}
        <form onSubmit={handleTextSubmit} className="flex flex-col gap-2">
          <label
            htmlFor="dukaan-text-fallback"
            className="text-xs font-bold text-plum"
          >
            Noisy Hall Text Fallback
          </label>
          <div className="flex gap-2">
            <input
              id="dukaan-text-fallback"
              type="text"
              value={textFallback}
              onChange={(e) => setTextFallback(e.target.value)}
              placeholder="e.g., Kaju katli 1kg ask ₹650, floor ₹550, 5 boxes"
              className="flex-1 rounded-xl border border-plum/20 bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-marigold focus:outline-none"
            />
            <button
              type="submit"
              disabled={isSubmitting || !textFallback.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-plum px-4 py-2 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50 cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              Publish
            </button>
          </div>
        </form>

        {/* 3 Diwali Sample Chips */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink/60 mb-2">
            One-Click Diwali Sample Chips
          </p>
          <div className="flex flex-wrap gap-2">
            {SELLER_SAMPLE_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                disabled={isSubmitting || recorder.isRecording}
                onClick={() =>
                  void submitListing({
                    text: chip.text,
                    overrideLanguage: chip.languageCode,
                  })
                }
                className="rounded-full border border-marigold/50 bg-gold/20 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-gold/40 disabled:opacity-50 cursor-pointer transition"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {submitError && (
          <div className="flex items-start gap-2 rounded-xl border border-vermilion/30 bg-vermilion/10 p-3 text-xs font-medium text-vermilion">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Listing Preview Card (Shows Private Floor Price Badge) */}
        {createdResult && (
          <div className="rounded-xl border-2 border-[#15803D]/40 bg-[#15803D]/5 p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#15803D]">
                <CheckCircle2 className="h-4 w-4" />
                Listing Published Live
              </span>
              <span className="rounded-full bg-plum/10 px-2 py-0.5 text-[11px] font-semibold text-plum">
                {formatLanguageName(createdResult.detectedLanguage)}
              </span>
            </div>

            <p className="text-xs italic text-ink/75">
              &ldquo;{createdResult.transcript}&rdquo;
            </p>

            <div className="rounded-lg bg-white p-3 border border-plum/10 space-y-1.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-ink">
                  {createdResult.item.title}
                </h3>
                <span className="rounded bg-canvas px-2 py-0.5 text-[11px] font-semibold uppercase text-plum">
                  {createdResult.item.category}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-xs tabular-nums">
                <div>
                  <span className="text-ink/60 block">Ask Price</span>
                  <strong className="text-ink">
                    ₹{createdResult.item.askPrice}
                  </strong>
                </div>
                <div>
                  <span className="text-ink/60 block">Stock</span>
                  <strong className="text-ink">
                    {createdResult.item.stock} units
                  </strong>
                </div>
                <div>
                  <span className="text-ink/60 block">City</span>
                  <strong className="text-ink">
                    {createdResult.item.city}
                  </strong>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between rounded-lg bg-plum/10 px-2.5 py-1.5 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-plum">
                  <Lock className="h-3.5 w-3.5" />
                  Floor Price: ₹{createdResult.item.floorPrice}
                </span>
                <span className="rounded-full bg-plum px-2 py-0.5 text-[10px] font-bold text-white">
                  Hidden from Buyer
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Right: Live Inventory Grid */}
      <section className="lg:col-span-7 rounded-2xl bg-[#FFFDF9] p-5 shadow-sm border border-marigold/30 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-plum flex items-center gap-2">
              <Package className="h-5 w-5 text-marigold" />
              Live Bazaar Inventory ({items.length})
            </h2>
            <p className="text-xs text-ink/70">
              Buyer-safe catalog view — private seller floor prices are stripped
              server-side.
            </p>
          </div>
          {isLoadingItems && (
            <Loader2 className="h-4 w-4 animate-spin text-plum" />
          )}
        </div>

        {items.length === 0 && !isLoadingItems ? (
          <div className="rounded-xl border border-dashed border-plum/20 p-8 text-center text-sm text-ink/60">
            No items loaded yet. Speak or pick a sample chip to publish!
          </div>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-plum/15 bg-white p-4 flex flex-col justify-between gap-3 hover:border-marigold transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-ink leading-snug">
                      {item.title}
                    </h3>
                    <span className="shrink-0 rounded-full bg-gold/30 px-2 py-0.5 text-[10px] font-bold text-ink">
                      {item.sellerLanguage}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-ink/70 tabular-nums">
                    <span className="uppercase font-semibold text-plum">
                      {item.category}
                    </span>
                    <span>·</span>
                    <span>{item.city}</span>
                    <span>·</span>
                    <span
                      className={
                        item.stock === 0
                          ? "font-bold text-vermilion"
                          : "font-semibold text-ink"
                      }
                    >
                      {item.stock === 0
                        ? "Sold Out"
                        : `${item.stock} left`}
                    </span>
                  </div>
                </div>

                <FairPriceMeter
                  askPrice={item.askPrice}
                  adjustedBenchmark={item.adjustedBenchmark}
                  markupPct={item.markupPct}
                  fairPriceStatus={item.fairPriceStatus}
                />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
