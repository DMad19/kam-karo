// POST /api/ops/simulate-surge — fires the "Diwali 8 PM Rush" alert into NudgeBee Cloud.
import { Router, type Request, type Response } from "express";
import { NudgebeeError, triggerDiwaliSurge } from "../services/nudgebeeService.js";
import { appendOpsLog, getItemById } from "../store.js";
import { SimulateSurgeBodySchema, type SimulateSurgeResponse } from "../types.js";

export const opsRouter = Router();

opsRouter.post("/ops/simulate-surge", async (req: Request, res: Response) => {
  const body = SimulateSurgeBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body", details: body.error.issues });
    return;
  }
  const { itemId, city } = body.data;

  const item = getItemById(itemId);
  if (!item) {
    res.status(404).json({ error: `Item not found: ${itemId}` });
    return;
  }

  try {
    const result = await triggerDiwaliSurge(city, item.id, item.stock);
    appendOpsLog(
      "ALERT_SENT",
      `Diwali 8 PM Rush: diwali_surge sent to NudgeBee for ${city} / ${item.title} (stock ${item.stock}, TTS p95 4300ms, errors 19%) — HTTP ${result.webhookStatusCode}`,
    );
    appendOpsLog("AWAITING_APPROVAL", "NudgeBee runbook paused at Core -> Approval; Approve flips Flagsmith surge_lite_mode=true");

    const response: SimulateSurgeResponse = {
      status: "alert_sent",
      webhookStatusCode: result.webhookStatusCode,
      payload: result.payload,
    };
    res.json(response);
  } catch (error) {
    if (error instanceof NudgebeeError) {
      console.error("[NUDGEBEE] webhook error:", error.statusCode, error.responseBody.slice(0, 500));
      appendOpsLog("INFO", `NudgeBee webhook failed: ${error.message}`);
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

export default opsRouter;
