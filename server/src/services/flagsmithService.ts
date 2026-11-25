import type {
  CityFairPriceConfig,
  CityName,
  HagglingPersona,
} from "../types.js";

export interface EvaluatedFlags {
  haggling_persona: HagglingPersona;
  surge_lite_mode: boolean;
  city_fair_price_config: CityFairPriceConfig;
}

export async function evaluateBuyerFlags(
  _sessionId: string,
  _city: CityName
): Promise<EvaluatedFlags> {
  void _sessionId;
  void _city;
  return {
    haggling_persona: "polite_aunty",
    surge_lite_mode: false,
    city_fair_price_config: {
      multiplier: 1.0,
      label: "Standard",
    },
  };
}
