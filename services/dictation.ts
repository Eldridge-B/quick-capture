/**
 * Dictation Service — records audio, then sends it to the Worker for
 * batch transcription when the user stops. Returns the transcript.
 *
 * Approach: Record continuously while "listening", then on stop, send
 * the audio file to the existing /capture-multi endpoint for Deepgram
 * batch transcription. This is simpler and more reliable than streaming
 * short segments over WebSocket (which expo-audio doesn't support well).
 *
 * Future: When expo-audio supports streaming/callbacks, switch to the
 * WebSocket streaming approach for real-time interim results.
 */

import { AudioModule, setAudioModeAsync, RecordingPresets } from "expo-audio";

export type DictationState = "idle" | "connecting" | "listening" | "error";

interface DictationCallbacks {
  onInterimText: (text: string) => void;
  onFinalText: (text: string) => void;
  onUtteranceEnd: () => void;
  onError: (message: string) => void;
  onStateChange: (state: DictationState) => void;
  onFallbackAudio: (uri: string) => void;
}

let recorder: InstanceType<typeof AudioModule.AudioRecorder> | null = null;
let state: DictationState = "idle";
let callbacks: DictationCallbacks | null = null;

function setState(next: DictationState): void {
  state = next;
  callbacks?.onStateChange(next);
}

function getDictationState(): DictationState {
  return state;
}

export function isLagging(): boolean {
  // No lag concept in batch mode — always false
  return false;
}

/**
 * Start dictation — begins recording audio.
 * The recording continues until stopDictation() is called,
 * at which point the audio is sent for transcription.
 */
export async function startDictation(cb: DictationCallbacks): Promise<void> {
  if (state !== "idle") return;

  callbacks = cb;
  setState("connecting");

  // Request mic permission
  const { granted } = await AudioModule.requestRecordingPermissionsAsync();
  if (!granted) {
    cb.onError("Microphone permission denied");
    setState("idle");
    callbacks = null;
    return;
  }

  try {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
  } catch (err) {
    console.warn("[dictation] setAudioModeAsync failed:", err);
  }

  try {
    recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
    await recorder.prepareToRecordAsync();
    recorder.record();
    setState("listening");
  } catch (err: any) {
    console.error("[dictation] Failed to start recording:", err);
    cb.onError("Failed to start microphone");
    setState("idle");
    callbacks = null;
  }
}

/**
 * Stop dictation — stops recording and returns the audio URI.
 * The caller (index.tsx) is responsible for submitting the audio
 * as an attachment via submitMultiCapture, which triggers batch
 * transcription on the Worker.
 */
export async function stopDictation(): Promise<string | null> {
  if (state === "idle" || !recorder) {
    setState("idle");
    callbacks = null;
    return null;
  }

  try {
    await recorder.stop();
    const uri = recorder.uri ?? null;
    recorder.release();
    recorder = null;
    setState("idle");
    callbacks = null;
    return uri;
  } catch (err) {
    console.error("[dictation] Failed to stop recording:", err);
    try { recorder?.release(); } catch { /* ignore */ }
    recorder = null;
    setState("idle");
    callbacks = null;
    return null;
  }
}
