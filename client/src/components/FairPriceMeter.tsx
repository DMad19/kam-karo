import type { FairPriceStatus } from "../types/index.ts";

interface FairPriceMeterProps {
  askPrice: number;
  adjustedBenchmark: number;
  markupPct: number;
  fairPriceStatus: FairPriceStatus;
}

const STATUS_META: Record<
  FairPriceStatus,
  { label: string; barColor: string; badgeClass: string }
> = {
  GREEN: {
    label: "Fair Deal",
    barColor: "bg-[#15803D]",
    badgeClass: "bg-[#15803D] text-white",
  },
  YELLOW: {
    label: "Festive Stretch",
    barColor: "bg-gold",
    badgeClass: "bg-gold text-ink",
  },
  RED: {
    label: "Diwali Markup Alert",
    barColor: "bg-vermilion",
    badgeClass: "bg-vermilion text-white",
  },
};

export function FairPriceMeter({
  askPrice,
  adjustedBenchmark,
  markupPct,
  fairPriceStatus,
}: FairPriceMeterProps) {
  const meta = STATUS_META[fairPriceStatus];
  // Scale bar smoothly from 0% markup (35% width) up to +50% markup (100% width)
  const normalizedWidth = Math.max(
    18,
    Math.min(100, Math.round(35 + markupPct * 1.3))
  );
  const formattedMarkup = `${markupPct >= 0 ? "+" : ""}${markupPct.toFixed(1)}%`;

  return (
    <div className="rounded-xl border border-plum/15 bg-canvas p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-plum">
            Fair-Price Meter
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.badgeClass}`}
          >
            {fairPriceStatus} · {meta.label}
          </span>
        </div>
        <span className="text-xs font-bold tabular-nums text-ink">
          Markup: {formattedMarkup}
        </span>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-plum/10">
        <div
          className={`h-full rounded-full transition-all duration-300 ${meta.barColor}`}
          style={{ width: `${normalizedWidth}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-ink/80 tabular-nums">
        <span>
          Ask Price: <strong className="text-ink">₹{askPrice}</strong>
        </span>
        <span>
          City Fair Benchmark:{" "}
          <strong className="text-ink">₹{adjustedBenchmark}</strong>
        </span>
      </div>
    </div>
  );
}
