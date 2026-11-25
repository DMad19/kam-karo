import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(import.meta.dirname, "../.env") });

export interface SarvamSpeakerConfig {
  polite: string;
  savage: string;
  knPolite: string;
  knSavage: string;
  tePolite: string;
  teSavage: string;
  taPolite: string;
  taSavage: string;
}

export interface AppConfig {
  port: number;
  frontendOrigin: string;
  sarvamApiKey: string;
  sarvamSpeakers: SarvamSpeakerConfig;
  flagsmithServerKey: string;
  flagsmithApiUrl: string;
  nudgebeeWebhookUrl: string;
}

const parsedPort = Number.parseInt(process.env.PORT ?? "4000", 10);

export const config: AppConfig = {
  port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 4000,
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  sarvamApiKey: process.env.SARVAM_API_KEY ?? "",
  sarvamSpeakers: {
    polite: process.env.SARVAM_SPEAKER_POLITE ?? "simran_en_customer",
    savage: process.env.SARVAM_SPEAKER_SAVAGE ?? "",
    knPolite: process.env.SARVAM_SPEAKER_KN_POLITE ?? "",
    knSavage: process.env.SARVAM_SPEAKER_KN_SAVAGE ?? "",
    tePolite: process.env.SARVAM_SPEAKER_TE_POLITE ?? "",
    teSavage: process.env.SARVAM_SPEAKER_TE_SAVAGE ?? "",
    taPolite: process.env.SARVAM_SPEAKER_TA_POLITE ?? "",
    taSavage: process.env.SARVAM_SPEAKER_TA_SAVAGE ?? "",
  },
  flagsmithServerKey: process.env.FLAGSMITH_SERVER_KEY ?? "",
  flagsmithApiUrl:
    process.env.FLAGSMITH_API_URL || "http://localhost:8000/api/v1/identities/",
  nudgebeeWebhookUrl: process.env.NUDGEBEE_WEBHOOK_URL ?? "",
};
