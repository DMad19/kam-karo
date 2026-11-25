import { useCallback, useEffect, useRef, useState } from "react";

const MAX_RECORDING_SECONDS = 25;

export interface AudioRecorderState {
  isRecording: boolean;
  secondsLeft: number;
  micError: string | null;
  startRecording: (onRecorded: (blob: Blob) => void) => Promise<void>;
  stopRecording: () => void;
  clearError: () => void;
}

function selectMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "";
}

export function useAudioRecorder(): AudioRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(MAX_RECORDING_SECONDS);
  const [micError, setMicError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const countdownTimerRef = useRef<number | null>(null);
  const autoStopTimerRef = useRef<number | null>(null);
  const onRecordedRef = useRef<((blob: Blob) => void) | null>(null);

  const cleanupResources = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (autoStopTimerRef.current !== null) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      cleanupResources();
    };
  }, [cleanupResources]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      cleanupResources();
      setIsRecording(false);
      setSecondsLeft(MAX_RECORDING_SECONDS);
    }
  }, [cleanupResources]);

  const startRecording = useCallback(
    async (onRecorded: (blob: Blob) => void) => {
      setMicError(null);

      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        setMicError(
          "Microphone capture is unavailable in this browser. Use the inline Text Fallback or a Diwali sample chip instead."
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        chunksRef.current = [];
        onRecordedRef.current = onRecorded;

        const preferredMime = selectMimeType();
        const recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime })
          : new MediaRecorder(stream);

        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.onstop = () => {
          const finalType =
            recorder.mimeType || preferredMime || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: finalType });
          chunksRef.current = [];
          cleanupResources();
          setIsRecording(false);
          setSecondsLeft(MAX_RECORDING_SECONDS);

          if (blob.size > 0 && onRecordedRef.current) {
            onRecordedRef.current(blob);
          }
        };

        recorder.onerror = () => {
          cleanupResources();
          setIsRecording(false);
          setSecondsLeft(MAX_RECORDING_SECONDS);
          setMicError(
            "Recording hit a microphone error. Use the inline Text Fallback or sample chips below."
          );
        };

        recorder.start(250);
        setIsRecording(true);
        setSecondsLeft(MAX_RECORDING_SECONDS);

        countdownTimerRef.current = window.setInterval(() => {
          setSecondsLeft((prev) => (prev > 1 ? prev - 1 : 1));
        }, 1000);

        autoStopTimerRef.current = window.setTimeout(() => {
          if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state !== "inactive"
          ) {
            mediaRecorderRef.current.stop();
          }
        }, MAX_RECORDING_SECONDS * 1000);
      } catch {
        cleanupResources();
        setIsRecording(false);
        setSecondsLeft(MAX_RECORDING_SECONDS);
        setMicError(
          "Microphone permission denied or noisy input detected. Use the inline Text Fallback or sample chips right below."
        );
      }
    },
    [cleanupResources]
  );

  const clearError = useCallback(() => {
    setMicError(null);
  }, []);

  return {
    isRecording,
    secondsLeft,
    micError,
    startRecording,
    stopRecording,
    clearError,
  };
}
