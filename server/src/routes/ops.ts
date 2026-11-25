// POST /api/ops/simulate-surge — fires the "Diwali 8 PM Rush" alert into NudgeBee Cloud.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { NudgebeeError, triggerDiwaliSurge, type DiwaliSurgePayload } from "../services/nudgebeeService.js";
import { appendOpsLog, getItem, listItems } from "../store.js";

const router = Router();

const surgeBodySchema = z.object({
  itemId: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).max(60).catch("Bengaluru"),
});

export interface SimulateSurgeResponse {
  status: "alert_sent";
  webhookStatusCode: number;
  payload: DiwaliSurgePayload;
}

router.post("/ops/simulate-surge", async (req: Request, res: Response) => {
  const parsed = surgeBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }
  const { itemId, city } = parsed.data;

  const item = itemId ? getItem(itemId) : listItems()[0];
  if (!item) {
    res.status(404).json({ error: `Item not found: ${itemId ?? "(none)"}` });
    return;
  }

  try {
    const result = await triggerDiwaliSurge(city, item.id, item.stock);
    appendOpsLog(
      "ALERT_SENT",
      `Diwali 8 PM Rush: diwali_surge sent to NudgeBee for ${city} / ${item.title} (stock ${item.stock}, p95 TTS 4300ms, errors 19%) — HTTP ${result.webhookStatusCode}`,
    );
    appendOpsLog("AWAITING_APPROVAL", "NudgeBee workflow awaiting human Approve -> Flagsmith surge_lite_mode=true");

    const response: SimulateSurgeResponse = {
      status: "alert_sent",
      webhookStatusCode: result.webhookStatusCode,
      payload: result.payload,
    };
    res.json(response);
  } catch (error) {
    if (error instanceof NudgebeeError) {
      console.error("[ops/simulate-surge] NudgeBee error:", error.statusCode, error.responseBody);
      appendOpsLog("ERROR", `NudgeBee webhook failed: ${error.message}`);
      res.status(502).json({
        error: error.message,
        nudgebeeStatus: error.statusCode,
        nudgebeeBody: error.responseBody.slice(0, 500),
      });
      return;
    }
    throw error;
  }
});

export default router;
