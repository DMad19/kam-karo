// Real Sarvam AI `saaras:v4` speech-to-text (no mocks).
import { config } from "../config.js";

const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";
const STT_MODEL = "saaras:v4";

/** Festive vocabulary biasing recognition toward Diwali bazaar terms (TDD §8.1). */
export const FESTIVE_KEYTERMS: readonly string[] = [
  "kaju katli",
  "diya",
  "laddoo",
  "diwali",
  "hamper",
  "bhaiya",
  "Bengaluru",
];

export interface TranscribeAudioResult {
  transcript: string;
  detectedLanguage: string;
}

export class SarvamSttError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly responseBody: string,
  ) {
    super(message);
    this.name = "SarvamSttError";
  }
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/flac": "flac",
};

/** "audio/webm;codecs=opus" -> "audio/webm" (unknown types default to webm, Chrome's MediaRecorder output). */
function baseMimeType(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return base in EXTENSION_BY_MIME ? base : "audio/webm";
}

async function postStt(
  audio: Buffer,
  mimeType: string,
  languageCode: string,
  includeKeyterms: boolean,
): Promise<Response> {
  const mime = baseMimeType(mimeType);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), `clip.${EXTENSION_BY_MIME[mime]}`);
  form.append("model", STT_MODEL);
  form.append("mode", "codemix");
  form.append("language_code", languageCode);
  if (includeKeyterms) form.append("keyterms", JSON.stringify(FESTIVE_KEYTERMS));

  return fetch(SARVAM_STT_URL, {
    method: "POST",
    headers: { "api-subscription-key": config.sarvamApiKey },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
}

/**
 * Transcribes a browser MediaRecorder clip (audio/webm or audio/ogg) in codemix mode,
 * so Hinglish / Kanglish speech keeps English loanwords intact.
 * languageCode "unknown" lets saaras:v4 auto-detect the spoken language.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  languageCode = "unknown",
): Promise<TranscribeAudioResult> {
  if (!config.sarvamApiKey) throw new SarvamSttError("SARVAM_API_KEY is not set in server/.env", 500, "");
  if (audioBuffer.length === 0) throw new SarvamSttError("Empty audio upload", 400, "");

  let response = await postStt(audioBuffer, mimeType, languageCode, true);

  // If this account/model rejects the keyterms field, retry the same real request without it.
  if (response.status === 400 || response.status === 422) {
    const body = await response.text();
    if (!/keyterm/i.test(body)) {
      throw new SarvamSttError(`Sarvam STT failed (${response.status})`, response.status, body);
    }
    console.warn("[SARVAM] STT rejected keyterms, retrying without:", body.slice(0, 300));
    response = await postStt(audioBuffer, mimeType, languageCode, false);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new SarvamSttError(`Sarvam STT failed (${response.status})`, response.status, body);
  }

  const data = (await response.json()) as { transcript?: unknown; language_code?: unknown };
  const transcript = typeof data.transcript === "string" ? data.transcript.trim() : "";
  const detectedLanguage =
    typeof data.language_code === "string" && data.language_code ? data.language_code : languageCode;
  return { transcript, detectedLanguage };
}
