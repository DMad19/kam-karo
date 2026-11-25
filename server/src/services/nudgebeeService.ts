// Real NudgeBee Cloud workflow webhook poster (no mocks).
// NudgeBee automation: Webhook trigger (event == "diwali_surge") -> Core/Approval -> Run Script (Flagsmith PATCH surge_lite_mode=true).

export interface DiwaliSurgePayload {
  event: "diwali_surge";
  service: "kam-karo-api";
  city: string;
  item_id: string;
  stock_remaining: number;
  tts_p95_latency_ms: number;
  error_rate: number;
  recommended_action: "enable_surge_lite_mode";
  triggered_at: string;
}

export interface DiwaliSurgeResult {
  webhookStatusCode: number;
  payload: DiwaliSurgePayload;
  responseBody: string;
}

export class NudgebeeError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly responseBody: string,
  ) {
    super(message);
    this.name = "NudgebeeError";
  }
}

export function buildDiwaliSurgePayload(city: string, itemId: string, stockRemaining: number): DiwaliSurgePayload {
  return {
    event: "diwali_surge",
    service: "kam-karo-api",
    city,
    item_id: itemId,
    stock_remaining: stockRemaining,
    tts_p95_latency_ms: 4300,
    error_rate: 0.19,
    recommended_action: "enable_surge_lite_mode",
    triggered_at: new Date().toISOString(),
  };
}

export async function triggerDiwaliSurge(
  city: string,
  itemId: string,
  stockRemaining: number,
): Promise<DiwaliSurgeResult> {
  const webhookUrl = process.env.NUDGEBEE_WEBHOOK_URL;
  if (!webhookUrl) throw new NudgebeeError("NUDGEBEE_WEBHOOK_URL is not set in server/.env", 500, "");

  const payload = buildDiwaliSurgePayload(city, itemId, stockRemaining);

  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new NudgebeeError(`NudgeBee webhook unreachable: ${reason}`, 504, "");
  }

  const responseBody = await response.text();
  if (!response.ok) {
    throw new NudgebeeError(`NudgeBee webhook rejected (${response.status})`, response.status, responseBody);
  }
  return { webhookStatusCode: response.status, payload, responseBody };
}
