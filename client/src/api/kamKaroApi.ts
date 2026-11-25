import type {
  CityName,
  CreateVoiceItemResponse,
  GetFlagsResponse,
  GetItemsResponse,
  HaggleResponse,
  LockDealRequest,
  LockDealResponse,
  SimulateSurgeResponse,
  SupportedLanguage,
} from "../types/index.ts";
import {
  getItemDisplayImage,
  rememberItemPhoto,
} from "../utils/itemImages.ts";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      errorMessage = body.error || body.message || errorMessage;
    } catch {
      // Keep status fallback if body is not JSON
    }
    throw new Error(errorMessage);
  }
  return (await response.json()) as T;
}

export async function getItems(city: CityName): Promise<GetItemsResponse> {
  const params = new URLSearchParams({ city });
  const response = await fetch(`${API_BASE_URL}/api/items?${params.toString()}`);
  const data = await parseJsonOrThrow<GetItemsResponse>(response);
  return {
    ...data,
    items: data.items.map((item) => ({
      ...item,
      imageUrl: getItemDisplayImage(item),
    })),
  };
}

export async function createVoiceItem(params: {
  audioBlob?: Blob;
  textFallback?: string;
  photoDataUrl?: string;
  languageCode: SupportedLanguage;
  city: CityName;
}): Promise<CreateVoiceItemResponse> {
  const formData = new FormData();
  formData.append("language_code", params.languageCode);
  formData.append("city", params.city);

  if (params.audioBlob) {
    const ext = params.audioBlob.type.includes("ogg") ? "ogg" : "webm";
    formData.append("audio", params.audioBlob, `seller-clip.${ext}`);
  }
  if (params.textFallback && params.textFallback.trim().length > 0) {
    formData.append("textFallback", params.textFallback.trim());
  }
  if (params.photoDataUrl) {
    formData.append("imageUrl", params.photoDataUrl);
  }

  const response = await fetch(`${API_BASE_URL}/api/items/voice`, {
    method: "POST",
    body: formData,
  });
  const data = await parseJsonOrThrow<CreateVoiceItemResponse>(response);
  if (params.photoDataUrl) {
    rememberItemPhoto(data.item.id, params.photoDataUrl);
  }
  return {
    ...data,
    item: {
      ...data.item,
      imageUrl:
        data.item.imageUrl ??
        params.photoDataUrl ??
        getItemDisplayImage(data.item),
    },
  };
}

export async function submitHaggle(params: {
  itemId: string;
  sessionId: string;
  city: CityName;
  languageCode: SupportedLanguage;
  audioBlob?: Blob;
  textFallback?: string;
}): Promise<HaggleResponse> {
  const formData = new FormData();
  formData.append("itemId", params.itemId);
  formData.append("sessionId", params.sessionId);
  formData.append("city", params.city);
  formData.append("language_code", params.languageCode);

  if (params.audioBlob) {
    const ext = params.audioBlob.type.includes("ogg") ? "ogg" : "webm";
    formData.append("audio", params.audioBlob, `buyer-offer.${ext}`);
  }
  if (params.textFallback && params.textFallback.trim().length > 0) {
    formData.append("textFallback", params.textFallback.trim());
  }

  const response = await fetch(`${API_BASE_URL}/api/haggle`, {
    method: "POST",
    body: formData,
  });
  return parseJsonOrThrow<HaggleResponse>(response);
}

export async function lockDeal(
  payload: LockDealRequest
): Promise<LockDealResponse> {
  const response = await fetch(`${API_BASE_URL}/api/deals/lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<LockDealResponse>(response);
}

export async function getFlags(
  sessionId: string,
  city: CityName
): Promise<GetFlagsResponse> {
  const params = new URLSearchParams({ sessionId, city });
  const response = await fetch(`${API_BASE_URL}/api/flags?${params.toString()}`);
  return parseJsonOrThrow<GetFlagsResponse>(response);
}

export async function simulateSurge(params: {
  itemId: string;
  city: CityName;
}): Promise<SimulateSurgeResponse> {
  const response = await fetch(`${API_BASE_URL}/api/ops/simulate-surge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return parseJsonOrThrow<SimulateSurgeResponse>(response);
}
