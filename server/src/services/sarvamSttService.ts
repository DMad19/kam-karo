export interface TranscribeAudioResult {
  transcript: string;
  detectedLanguage: string;
}

export async function transcribeAudio(
  _audioBuffer: Buffer,
  _mimeType: string,
  languageCode = "unknown"
): Promise<TranscribeAudioResult> {
  void _audioBuffer;
  void _mimeType;
  void languageCode;
  throw new Error(
    "[SARVAM] sarvamSttService.transcribeAudio is a bootstrap stub pending Block 1 implementation."
  );
}
