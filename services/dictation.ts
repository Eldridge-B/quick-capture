/**
 * Dictation Service — manages a WebSocket connection to the Cloudflare Worker's
 * `/ws/dictate` endpoint and streams microphone audio to Deepgram for live
 * transcription.
 *
 * Audio streaming approach:
 *   expo-audio records to a file, not a raw stream. Every 250 ms we:
 *     1. Stop the current recorder segment.
 *     2. Read the WAV file it produced.
 *     3. Strip the 44-byte WAV header to get raw 16-bit PCM at 16 kHz mono.
 *     4. Send the PCM bytes over the WebSocket and append them to the local
 *        rolling buffer (for fallback on disconnect).
 *     5. Start a fresh recorder segment.
 *   This introduces ~250 ms of latency but is the only practical approach with
 *   expo-audio's file-based API.
 */

import { File } from "expo-file-system";
import { AudioModule, setAudioModeAsync, AudioQuality } from "expo-audio";
import { API_BASE, CAPTURE_SECRET } from "@/services/api";
import {
  appendChunk,
  clearBuffer,
  saveBufferAsWav,
} from "@/services/audio-buffer";

// ── Types ────────────────────────────────────────────────────────────────────

export type DictationState = "idle" | "connecting" | "listening" | "error";

export interface DictationCallbacks {
  /** Partial (interim) transcript from Deepgram. */
  onInterimText: (text: string) => void;
  /** Finalised transcript segment. */
  onFinalText: (text: string) => void;
  /** Silence detected — Deepgram sent UtteranceEnd. */
  onUtteranceEnd: () => void;
  onError: (message: string) => void;
  onStateChange: (state: DictationState) => void;
  /** Fallback: buffer saved as a WAV file when the WS disconnects unexpectedly. */
  onFallbackAudio: (uri: string) => void;
}

// ── Module-level state ────────────────────────────────────────────────────────

let ws: WebSocket | null = null;
let recorder: InstanceType<typeof AudioModule.AudioRecorder> | null = null;
let state: DictationState = "idle";
let callbacks: DictationCallbacks | null = null;
let streamInterval: ReturnType<typeof setInterval> | null = null;
let lastResultTime: number = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function setState(next: DictationState): void {
  state = next;
  callbacks?.onStateChange(next);
}

function cleanup(): void {
  if (streamInterval !== null) {
    clearInterval(streamInterval);
    streamInterval = null;
  }
  if (ws !== null) {
    try {
      ws.close();
    } catch {
      // ignore close errors
    }
    ws = null;
  }
  callbacks = null;
  setState("idle");
}

async function releaseRecorder(): Promise<void> {
  if (recorder !== null) {
    try {
      await recorder.stop();
    } catch {
      // ignore stop errors
    }
    try {
      recorder.release();
    } catch {
      // ignore release errors
    }
    recorder = null;
  }
}

async function handleDisconnectFallback(): Promise<void> {
  const uri = await saveBufferAsWav();
  if (uri) {
    callbacks?.onFallbackAudio(uri);
  }
}

/**
 * Recording options for 16 kHz mono PCM WAV — what Deepgram expects.
 * NOT the HIGH_QUALITY preset (which records AAC/M4A).
 */
const PCM_RECORDING_OPTIONS = {
  android: {
    extension: ".wav" as const,
    outputFormat: "default" as const,
    audioEncoder: "default" as const,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
  },
  ios: {
    extension: ".wav" as const,
    outputFormat: "linearPCM" as const,
    audioQuality: AudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

/**
 * Start a fresh recorder segment (16 kHz mono PCM, WAV output).
 * Returns the recorder instance, or null on failure.
 */
async function startSegment(): Promise<InstanceType<
  typeof AudioModule.AudioRecorder
> | null> {
  try {
    const seg = new AudioModule.AudioRecorder(PCM_RECORDING_OPTIONS);
    await seg.prepareToRecordAsync();
    seg.record();
    return seg;
  } catch (err) {
    console.warn("[dictation] startSegment failed:", err);
    return null;
  }
}

/**
 * Read the WAV file at `uri`, strip the 44-byte WAV header, and return the
 * raw PCM bytes as an ArrayBuffer. Returns null if the file cannot be read or
 * is too short to contain a valid header.
 */
async function readPcmFromWav(uri: string): Promise<ArrayBuffer | null> {
  try {
    const file = new File(uri);
    const base64 = await file.base64();

    // Decode base64 → binary string → Uint8Array
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // WAV header is exactly 44 bytes; anything shorter has no PCM data.
    if (bytes.byteLength <= 44) return null;

    return bytes.buffer.slice(44);
  } catch (err) {
    console.warn("[dictation] readPcmFromWav failed:", err);
    return null;
  }
}

/**
 * Called every 250 ms while listening.
 * Finalises the current recorder segment, extracts PCM, streams it over the
 * WebSocket, and starts a new segment.
 */
async function streamTick(): Promise<void> {
  if (ws === null || ws.readyState !== WebSocket.OPEN) return;

  const seg = recorder;
  if (seg === null) return;

  // Stop the current segment so we can read its file.
  let uri: string | null = null;
  try {
    await seg.stop();
    uri = seg.uri ?? null;
    seg.release();
  } catch (err) {
    console.warn("[dictation] streamTick stop failed:", err);
    try { seg.release(); } catch { /* ignore */ }
  }

  // Immediately start the next segment so we don't lose audio.
  recorder = await startSegment();

  // Read and send the PCM from the segment we just stopped.
  if (uri) {
    const pcm = await readPcmFromWav(uri);
    if (pcm && pcm.byteLength > 0) {
      try {
        ws.send(pcm);
      } catch (err) {
        console.warn("[dictation] ws.send failed:", err);
      }
      appendChunk(pcm);
    }
    // Delete the temp segment file to avoid filling storage.
    try {
      new File(uri).delete();
    } catch {
      // non-fatal
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Begin a dictation session.
 * Requests mic permission, opens a WebSocket to the worker, starts streaming
 * audio, and fires callbacks for transcription events.
 */
export async function startDictation(cb: DictationCallbacks): Promise<void> {
  if (state !== "idle") return;

  callbacks = cb;
  setState("connecting");
  clearBuffer();

  // 1. Mic permission
  const { granted } = await AudioModule.requestRecordingPermissionsAsync();
  if (!granted) {
    callbacks?.onError("Microphone permission denied");
    setState("idle");
    callbacks = null;
    return;
  }

  // 2. Audio mode
  try {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
  } catch (err) {
    console.warn("[dictation] setAudioModeAsync failed:", err);
  }

  // 3. Build WebSocket URL
  const wsUrl =
    API_BASE.replace(/^http/, "ws") + "/ws/dictate?token=" + CAPTURE_SECRET;

  // 4. Open WebSocket
  const socket = new WebSocket(wsUrl);
  socket.binaryType = "arraybuffer";
  ws = socket;

  socket.onopen = async () => {
    // Start the first recorder segment and the streaming interval.
    recorder = await startSegment();
    if (recorder === null) {
      callbacks?.onError("Failed to start microphone");
      cleanup();
      return;
    }

    setState("listening");
    lastResultTime = Date.now();

    // Stream a segment every 250 ms.
    streamInterval = setInterval(() => {
      streamTick().catch((err) =>
        console.warn("[dictation] streamTick error:", err)
      );
    }, 250);
  };

  socket.onmessage = (event: MessageEvent) => {
    lastResultTime = Date.now();

    try {
      const data = JSON.parse(event.data as string);

      // Handle error messages from the worker / Deepgram.
      if (data.type === "error") {
        callbacks?.onError(data.message ?? "Transcription error");
        stopDictation();
        return;
      }

      // Handle UtteranceEnd (silence detected).
      if (data.type === "UtteranceEnd") {
        callbacks?.onUtteranceEnd();
        return;
      }

      // Extract transcript — Deepgram response format varies between
      // streaming and batch modes, so we check both paths.
      const transcript: string =
        data.channel?.alternatives?.[0]?.transcript ??
        data.results?.channels?.[0]?.alternatives?.[0]?.transcript ??
        "";

      if (transcript.length > 0) {
        if (data.is_final) {
          callbacks?.onFinalText(transcript);
        } else {
          callbacks?.onInterimText(transcript);
        }
      }
    } catch (err) {
      console.warn("[dictation] Failed to parse WS message:", err);
    }
  };

  socket.onerror = async (_event: Event) => {
    if (state === "connecting") {
      callbacks?.onError("No connection — hold mic to record locally");
      await releaseRecorder();
      cleanup();
    } else if (state === "listening") {
      // Save whatever we buffered so far.
      await releaseRecorder();
      await handleDisconnectFallback();
      cleanup();
    }
  };

  socket.onclose = async (_event: CloseEvent) => {
    if (state === "listening") {
      // Unexpected close — save fallback audio.
      await releaseRecorder();
      await handleDisconnectFallback();
      cleanup();
    }
  };
}

/**
 * Gracefully end the dictation session.
 * Sends a CloseStream signal to Deepgram, stops the recorder, and cleans up.
 */
export async function stopDictation(): Promise<void> {
  if (state === "idle") return;

  // Pause the streaming interval while we do the final read.
  if (streamInterval !== null) {
    clearInterval(streamInterval);
    streamInterval = null;
  }

  // Signal Deepgram to flush and close.
  if (ws !== null && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: "CloseStream" }));
    } catch {
      // ignore send errors during teardown
    }
  }

  // Do one final streaming tick to capture any audio recorded since the last
  // interval fire before we release the recorder.
  await streamTick();

  await releaseRecorder();
  cleanup();
}

/**
 * Returns the current dictation state.
 */
export function getDictationState(): DictationState {
  return state;
}

/**
 * Returns true when the WebSocket is open but no transcription result has
 * been received for more than 3 seconds (possible network lag).
 */
export function isLagging(): boolean {
  return state === "listening" && Date.now() - lastResultTime > 3000;
}
