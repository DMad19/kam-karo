// Real Flagsmith identity evaluation against the local Docker instance (zero local cache, no mocks).
// Every call hits Flagsmith so a NudgeBee PATCH of surge_lite_mode is visible on the very next request.
import { z } from "zod";
import { config } from "../config.js";
import {
  HagglingPersonaSchema,
  type CityFairPriceConfig,
  type CityName,
  type HagglingPersona,
} from "../types.js";

export interface EvaluatedFlags {
  haggling_persona: HagglingPersona;
  surge_lite_mode: boolean;
  city_fair_price_config: CityFairPriceConfig;
  /** "flagsmith" when evaluated live, "fallback" when Flagsmith was unreachable. */
  source: "flagsmith" | "fallback";
}

export const FALLBACK_FLAGS: Readonly<EvaluatedFlags> = Object.freeze({
  haggling_persona: "polite_aunty",
  surge_lite_mode: false,
  city_fair_price_config: { multiplier: 1.0, label: "Fallback" },
  source: "fallback",
});

const DEFAULT_CITY_CONFIG: CityFairPriceConfig = { multiplier: 1.0, label: "Standard" };

const IdentityFlagSchema = z.object({
  feature: z.object({ name: z.string() }),
  enabled: z.boolean(),
  feature_state_value: z.unknown().optional(),
});

const IdentityResponseSchema = z.object({
  flags: z.array(IdentityFlagSchema),
});

const CityConfigSchema = z.object({
  multiplier: z.coerce.number().finite().positive(),
  label: z.string().trim().min(1),
});

type IdentityFlag = z.infer<typeof IdentityFlagSchema>;

function parsePersona(flag: IdentityFlag | undefined): HagglingPersona {
  if (!flag?.enabled) return "polite_aunty";
  const parsed = HagglingPersonaSchema.safeParse(
    typeof flag.feature_state_value === "string" ? flag.feature_state_value.trim() : flag.feature_state_value,
  );
  return parsed.success ? parsed.data : "polite_aunty";
}

function parseCityConfig(flag: IdentityFlag | undefined): CityFairPriceConfig {
  if (!flag?.enabled) return DEFAULT_CITY_CONFIG;
  let raw = flag.feature_state_value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      console.warn("[FLAGSMITH] city_fair_price_config is not valid JSON, using default");
      return DEFAULT_CITY_CONFIG;
    }
  }
  const parsed = CityConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_CITY_CONFIG;
}

/**
 * Evaluates the buyer's identity (sessionId + city trait) so Flagsmith applies the
 * 50/50 persona split and city segment overrides. Never throws: any network or
 * parse problem returns FALLBACK_FLAGS (TDD §8.2).
 */
export async function evaluateBuyerFlags(sessionId: string, city: CityName): Promise<EvaluatedFlags> {
  if (!config.flagsmithServerKey) {
    console.error("[FLAGSMITH] FLAGSMITH_SERVER_KEY is not set in server/.env, using fallback flags");
    return { ...FALLBACK_FLAGS };
  }

  try {
    const response = await fetch(config.flagsmithApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Environment-Key": config.flagsmithServerKey,
      },
      body: JSON.stringify({
        identifier: sessionId,
        traits: [{ trait_key: "city", trait_value: city }],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
    }

    const parsed = IdentityResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error(`Unexpected identities payload: ${parsed.error.message}`);

    const byName = new Map(parsed.data.flags.map((flag) => [flag.feature.name, flag]));
    return {
      haggling_persona: parsePersona(byName.get("haggling_persona")),
      surge_lite_mode: byName.get("surge_lite_mode")?.enabled === true,
      city_fair_price_config: parseCityConfig(byName.get("city_fair_price_config")),
      source: "flagsmith",
    };
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error("[FLAGSMITH] evaluation failed, using fallback flags:", reason);
    return { ...FALLBACK_FLAGS, city_fair_price_config: { ...FALLBACK_FLAGS.city_fair_price_config } };
  }
}
