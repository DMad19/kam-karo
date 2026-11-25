// GET /api/flags — live Flagsmith evaluation + A/B scoreboard + Ops log for the 3s UI poll.
import { Router, type Request, type Response } from "express";
import { evaluateBuyerFlags } from "../services/flagsmithService.js";
import { appendOpsLog, experimentStats, opsLog } from "../store.js";
import { GetFlagsQuerySchema, type GetFlagsResponse } from "../types.js";

export const flagsRouter = Router();

/** Last surge_lite_mode seen from live Flagsmith (null until first successful read). */
let lastSurgeLiteMode: boolean | null = null;

function trackSurgeTransition(surgeLiteMode: boolean): void {
  if (lastSurgeLiteMode === false && surgeLiteMode) {
    appendOpsLog(
      "SELF_HEALED",
      "Flagsmith surge_lite_mode=true (NudgeBee approval applied) — Diwali 8 PM Rush: TTS off, fixed fair-price text checkout on",
    );
  } else if (lastSurgeLiteMode === true && !surgeLiteMode) {
    appendOpsLog("INFO", "Flagsmith surge_lite_mode=false — voice haggling restored");
  }
  lastSurgeLiteMode = surgeLiteMode;
}

flagsRouter.get("/flags", async (req: Request, res: Response) => {
  // Contract: always 200 with safe defaults, even on a malformed query.
  const query = GetFlagsQuerySchema.safeParse(req.query);
  const { sessionId, city } = query.success ? query.data : { sessionId: "buyer_42", city: "Bengaluru" as const };

  const flags = await evaluateBuyerFlags(sessionId, city);
  if (flags.source === "flagsmith") trackSurgeTransition(flags.surge_lite_mode);

  const response: GetFlagsResponse = {
    haggling_persona: flags.haggling_persona,
    surge_lite_mode: flags.surge_lite_mode,
    city_fair_price_config: flags.city_fair_price_config,
    experimentStats,
    opsLog,
  };
  res.json(response);
});

export default flagsRouter;
