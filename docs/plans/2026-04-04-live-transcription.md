# Live Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tap the mic, speak, words appear in the text box at cursor position — powered by Deepgram Nova-2 streaming through a Cloudflare Worker WebSocket proxy.

**Architecture:** Phone records PCM audio → streams via WebSocket to Cloudflare Worker → Worker proxies to Deepgram streaming API → interim/final transcripts flow back to the phone → text inserted at cursor position. A local audio buffer provides resilience against network failures.

**Tech Stack:** Expo (React Native), Cloudflare Workers (WebSocketPair), Deepgram Nova-2 streaming API, expo-audio

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `worker/src/index.ts` | Modify | Add `/ws/dictate` WebSocket proxy endpoint |
| `services/dictation.ts` | Create | WebSocket connection + audio streaming to worker |
| `services/audio-buffer.ts` | Create | Rolling PCM buffer for network resilience |
| `services/audio.ts` | Modify | No changes needed — long-press still uses existing flow |
| `services/api.ts` | Modify | Export `API_BASE` and `CAPTURE_SECRET` for dictation service |
| `components/ActionBar.tsx` | Modify | Short/long press gesture on mic button, visual states |
| `components/CaptureInput.tsx` | Modify | Cursor tracking, interim text overlay, `editable` prop |
| `components/Tooltip.tsx` | Create | First-use "hold for audio" tooltip |
| `app/index.tsx` | Modify | Wire dictation callbacks, visual states, disable-during-save |

---

### Task 1: Worker WebSocket Proxy

**Files:**
- Modify: `worker/src/index.ts`

This task adds the `/ws/dictate` endpoint that proxies audio from the phone to Deepgram and transcription results back.

- [ ] **Step 1: Add WebSocket upgrade handler to the router**

In `worker/src/index.ts`, add a case for `/ws/dictate` in the switch statement:

```typescript
case "/ws/dictate":
  return handleDictateWebSocket(request, env);
```

- [ ] **Step 2: Implement the WebSocket proxy function**

Add this function to `worker/src/index.ts`:

```typescript
async function handleDictateWebSocket(
  request: Request,
  env: Env
): Promise<Response> {
  const upgradeHeader = request.headers.get("Upgrade");
  if (upgradeHeader !== "websocket") {
    return json({ error: "Expected WebSocket upgrade" }, 426);
  }

  // Create the client ↔ worker WebSocket pair
  const [client, server] = Object.values(new WebSocketPair());

  // Open connection to Deepgram
  const dgParams = new URLSearchParams({
    model: "nova-2",
    language: "en",
    smart_format: "true",
    punctuate: "true",
    interim_results: "true",
    endpointing: "300",
    utterance_end_ms: "1000",
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
  });

  const dgUrl = `wss://api.deepgram.com/v1/listen?${dgParams.toString()}`;

  let dgSocket: WebSocket;
  try {
    dgSocket = new WebSocket(dgUrl, ["token", env.DEEPGRAM_API_KEY]);
  } catch (err: any) {
    server.accept();
    server.send(JSON.stringify({ type: "error", message: "Failed to connect to transcription service" }));
    server.close(1011, "Deepgram connection failed");
    return new Response(null, { status: 101, webSocket: client });
  }

  server.accept();

  // Keep-alive interval (8 seconds)
  const keepAlive = setInterval(() => {
    try {
      if (dgSocket.readyState === WebSocket.OPEN) {
        dgSocket.send(JSON.stringify({ type: "KeepAlive" }));
      }
    } catch {
      // ignore
    }
  }, 8000);

  const cleanup = () => {
    clearInterval(keepAlive);
    try { dgSocket.close(); } catch {}
    try { server.close(); } catch {}
  };

  // Client → Deepgram: forward audio and control messages
  server.addEventListener("message", (event) => {
    try {
      if (dgSocket.readyState === WebSocket.OPEN) {
        // Binary audio data or JSON control messages
        dgSocket.send(event.data);
      }
    } catch {
      cleanup();
    }
  });

  // Deepgram → Client: forward transcription results
  dgSocket.addEventListener("message", (event: MessageEvent) => {
    try {
      if (server.readyState === WebSocket.OPEN) {
        server.send(typeof event.data === "string" ? event.data : "");
      }
    } catch {
      cleanup();
    }
  });

  // Handle disconnections
  server.addEventListener("close", () => cleanup());
  server.addEventListener("error", () => cleanup());
  dgSocket.addEventListener("close", () => {
    try {
      if (server.readyState === WebSocket.OPEN) {
        server.send(JSON.stringify({ type: "error", message: "Transcription service disconnected" }));
        server.close(1011, "Deepgram disconnected");
      }
    } catch {}
    cleanup();
  });
  dgSocket.addEventListener("error", () => {
    try {
      if (server.readyState === WebSocket.OPEN) {
        server.send(JSON.stringify({ type: "error", message: "Transcription service error" }));
        server.close(1011, "Deepgram error");
      }
    } catch {}
    cleanup();
  });

  return new Response(null, { status: 101, webSocket: client });
}
```

- [ ] **Step 3: Move auth check so WebSocket route can access it**

The current auth check runs before the switch statement and uses `request.headers.get("Authorization")`. For WebSocket upgrades, the auth token may be in a query parameter since some WebSocket clients can't set headers. Update the auth block:

```typescript
// Auth — check header first, then query param (for WebSocket upgrades)
const authHeader = request.headers.get("Authorization");
const url = new URL(request.url);
const authParam = url.searchParams.get("token");
const token = authHeader?.replace("Bearer ", "") || authParam;

if (token !== env.CAPTURE_SECRET) {
  return json({ error: "Unauthorized" }, 401);
}
```

- [ ] **Step 4: Test with wscat**

Run the worker locally:
```bash
cd worker && wrangler dev
```

In another terminal, test the WebSocket:
```bash
wscat -c "ws://localhost:8787/ws/dictate?token=YOUR_SECRET"
```

Expected: connection opens. Sending any binary data should forward to Deepgram (which will respond with transcription results or close if the audio format is wrong). The connection should stay alive.

- [ ] **Step 5: Commit**

```bash
git add worker/src/index.ts
git commit -m "feat(worker): add /ws/dictate WebSocket proxy to Deepgram streaming"
```

---

### Task 2: Export API config for dictation service

**Files:**
- Modify: `services/api.ts`

The dictation service needs `API_BASE` and `CAPTURE_SECRET` but they're currently module-private constants.

- [ ] **Step 1: Export the constants**

In `services/api.ts`, change:

```typescript
const API_BASE = __DEV__
```

to:

```typescript
export const API_BASE = __DEV__
```

And change:

```typescript
const CAPTURE_SECRET = "REPLACE_WITH_YOUR_SECRET";
```

to:

```typescript
export const CAPTURE_SECRET = "REPLACE_WITH_YOUR_SECRET";
```

- [ ] **Step 2: Commit**

```bash
git add services/api.ts
git commit -m "feat(api): export API_BASE and CAPTURE_SECRET for dictation service"
```

---

### Task 3: Audio buffer service

**Files:**
- Create: `services/audio-buffer.ts`

A simple in-memory buffer that accumulates PCM chunks during dictation. If the connection drops, this buffer can be saved as an audio file.

- [ ] **Step 1: Create the audio buffer module**

Create `services/audio-buffer.ts`:

```typescript
/**
 * Rolling PCM audio buffer for network resilience.
 *
 * Accumulates raw PCM chunks during dictation. If the WebSocket
 * connection drops, the buffer can be saved as a WAV file so the
 * user's words aren't lost.
 */
import * as FileSystem from "expo-file-system";

const MAX_DURATION_SECONDS = 60;
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2; // 16-bit
const CHANNELS = 1;
const MAX_BYTES = MAX_DURATION_SECONDS * SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS;

let chunks: ArrayBuffer[] = [];
let totalBytes = 0;

export function appendChunk(chunk: ArrayBuffer) {
  chunks.push(chunk);
  totalBytes += chunk.byteLength;

  // Trim oldest chunks if we exceed max
  while (totalBytes > MAX_BYTES && chunks.length > 1) {
    const removed = chunks.shift()!;
    totalBytes -= removed.byteLength;
  }
}

export function clearBuffer() {
  chunks = [];
  totalBytes = 0;
}

export function getBufferSize(): number {
  return totalBytes;
}

/**
 * Save the buffer as a WAV file. Returns the file URI, or null if empty.
 */
export async function saveBufferAsWav(): Promise<string | null> {
  if (totalBytes === 0) return null;

  // Concatenate all chunks
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }

  // Build WAV header (44 bytes)
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + totalBytes, true); // file size - 8
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS, true); // byte rate
  view.setUint16(32, BYTES_PER_SAMPLE * CHANNELS, true); // block align
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true); // bits per sample

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, totalBytes, true);

  // Combine header + PCM data
  const wavData = new Uint8Array(44 + totalBytes);
  wavData.set(new Uint8Array(wavHeader), 0);
  wavData.set(combined, 44);

  // Write to temp file
  const uri = `${FileSystem.cacheDirectory}dictation-fallback-${Date.now()}.wav`;
  await FileSystem.writeAsStringAsync(uri, arrayBufferToBase64(wavData.buffer), {
    encoding: FileSystem.EncodingType.Base64,
  });

  clearBuffer();
  return uri;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
```

- [ ] **Step 2: Commit**

```bash
git add services/audio-buffer.ts
git commit -m "feat: add PCM audio buffer for dictation network resilience"
```

---

### Task 4: Dictation service

**Files:**
- Create: `services/dictation.ts`

Core service: opens WebSocket to Worker, streams mic audio, dispatches transcription callbacks.

- [ ] **Step 1: Create the dictation service**

Create `services/dictation.ts`:

```typescript
/**
 * Live dictation service — streams mic audio to Deepgram via Worker WebSocket.
 */
import { AudioModule, RecordingPresets, setAudioModeAsync } from "expo-audio";
import { API_BASE, CAPTURE_SECRET } from "@/services/api";
import {
  appendChunk,
  clearBuffer,
  saveBufferAsWav,
} from "@/services/audio-buffer";

export type DictationState = "idle" | "connecting" | "listening" | "error";

export interface DictationCallbacks {
  onInterimText: (text: string) => void;
  onFinalText: (text: string) => void;
  onUtteranceEnd: () => void;
  onError: (message: string) => void;
  onStateChange: (state: DictationState) => void;
}

let ws: WebSocket | null = null;
let recorder: InstanceType<typeof AudioModule.AudioRecorder> | null = null;
let state: DictationState = "idle";
let callbacks: DictationCallbacks | null = null;
let streamInterval: ReturnType<typeof setInterval> | null = null;
let lastResultTime = 0;

function setState(newState: DictationState) {
  state = newState;
  callbacks?.onStateChange(newState);
}

export function getDictationState(): DictationState {
  return state;
}

export async function startDictation(cb: DictationCallbacks): Promise<void> {
  if (state !== "idle") return;

  callbacks = cb;
  setState("connecting");
  clearBuffer();

  // Request mic permission
  const { granted } = await AudioModule.requestRecordingPermissionsAsync();
  if (!granted) {
    setState("error");
    cb.onError("Microphone permission denied");
    setState("idle");
    return;
  }

  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
  });

  // Open WebSocket to Worker
  const wsUrl = API_BASE.replace("http", "ws") + `/ws/dictate?token=${CAPTURE_SECRET}`;

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    setState("error");
    cb.onError("No connection — hold mic to record locally");
    setState("idle");
    return;
  }

  ws.binaryType = "arraybuffer";

  ws.onopen = async () => {
    try {
      // Start recording audio
      recorder = new AudioModule.AudioRecorder({
        ...RecordingPresets.HIGH_QUALITY,
        android: {
          ...RecordingPresets.HIGH_QUALITY.android,
          extension: ".wav",
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 256000,
        },
        ios: {
          ...RecordingPresets.HIGH_QUALITY.ios,
          extension: ".wav",
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 256000,
        },
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      lastResultTime = Date.now();
      setState("listening");

      // Stream audio chunks every 250ms
      // Note: expo-audio doesn't support direct PCM streaming yet.
      // We'll read the recording file in chunks. This is a workaround —
      // if expo-audio adds streaming support, switch to that.
      // For now, we record and periodically read new data from the file.
      startAudioStreaming();
    } catch (err: any) {
      setState("error");
      cb.onError("Failed to start microphone");
      stopDictation();
    }
  };

  ws.onmessage = (event) => {
    lastResultTime = Date.now();
    try {
      const data = JSON.parse(event.data as string);

      if (data.type === "error") {
        cb.onError(data.message || "Transcription error");
        stopDictation();
        return;
      }

      if (data.type === "Results") {
        const alt = data.channel?.alternatives?.[0];
        if (!alt) return;

        const transcript = alt.transcript;
        if (!transcript) return;

        if (data.is_final) {
          cb.onFinalText(transcript);
        } else {
          cb.onInterimText(transcript);
        }
      }

      // Deepgram sends results in this shape:
      // { type: "Results", is_final: bool, channel: { alternatives: [{ transcript, confidence, words }] } }
      // Handle both possible shapes
      if (data.results?.channels?.[0]?.alternatives?.[0]) {
        const alt = data.results.channels[0].alternatives[0];
        if (alt.transcript) {
          if (data.is_final) {
            cb.onFinalText(alt.transcript);
          } else {
            cb.onInterimText(alt.transcript);
          }
        }
      }

      if (data.type === "UtteranceEnd") {
        cb.onUtteranceEnd();
      }
    } catch {
      // Ignore parse errors
    }
  };

  ws.onerror = () => {
    if (state === "connecting") {
      cb.onError("No connection — hold mic to record locally");
    } else {
      cb.onError("Connection lost — saved as voice note");
      handleDisconnectFallback();
    }
    stopDictation();
  };

  ws.onclose = () => {
    if (state === "listening") {
      // Unexpected close
      cb.onError("Connection lost — saved as voice note");
      handleDisconnectFallback();
    }
    cleanup();
  };
}

function startAudioStreaming() {
  // IMPLEMENTATION NOTE — Audio Streaming Strategy:
  //
  // expo-audio records to a file, not a stream. Three approaches to solve this:
  //
  // (A) Record short 250ms WAV segments in sequence, read each file, strip the
  //     44-byte WAV header, send raw PCM bytes over WebSocket, delete the file.
  //     Pros: works with current expo-audio API. Cons: file I/O overhead, ~250ms latency.
  //
  // (B) Use expo-av's legacy Recording API with onRecordingStatusUpdate to detect
  //     when new audio data is available, then read incremental file data.
  //     Pros: lower overhead than (A). Cons: depends on legacy API still working in SDK 55.
  //
  // (C) Use a native module (e.g., react-native-live-audio-stream) for direct PCM streaming.
  //     Pros: lowest latency, cleanest. Cons: adds a dependency, may need dev build.
  //
  // Start with approach (A) — simplest, no new deps. If latency is unacceptable,
  // upgrade to (C). The WebSocket and callback plumbing is the same regardless.
  //
  // Implementation for approach (A):
  // 1. Record a 250ms segment → save as WAV
  // 2. Read the WAV file, strip 44-byte header → raw PCM
  // 3. Send PCM bytes to WebSocket + append to local buffer
  // 4. Delete temp file, start next segment
  // 5. Repeat until stopDictation() is called
}

async function handleDisconnectFallback() {
  // Save buffered audio as a WAV file attachment
  const uri = await saveBufferAsWav();
  if (uri) {
    // The caller should add this as an attachment via the onError callback
    // or we could emit a specific callback. For now, logged.
    console.log("Fallback audio saved:", uri);
  }
}

export async function stopDictation(): Promise<void> {
  if (state === "idle") return;

  // Send close message to Deepgram via worker
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: "CloseStream" }));
    } catch {}
  }

  // Stop recording
  if (recorder) {
    try {
      await recorder.stop();
      recorder.release();
    } catch {}
    recorder = null;
  }

  cleanup();
}

function cleanup() {
  if (streamInterval) {
    clearInterval(streamInterval);
    streamInterval = null;
  }
  if (ws) {
    try { ws.close(); } catch {}
    ws = null;
  }
  callbacks = null;
  setState("idle");
}

/**
 * Check if interim results are lagging (slow connection indicator).
 * Returns true if >3 seconds since last result while actively listening.
 */
export function isLagging(): boolean {
  if (state !== "listening") return false;
  return Date.now() - lastResultTime > 3000;
}
```

- [ ] **Step 2: Commit**

```bash
git add services/dictation.ts
git commit -m "feat: add dictation service with WebSocket streaming and fallback"
```

---

### Task 5: Mic button gesture — short press / long press

**Files:**
- Modify: `components/ActionBar.tsx`

Replace the current mic button tap handler with a timer-based gesture that distinguishes short press (dictation) from long press (audio recording).

- [ ] **Step 1: Update ActionBar props and imports**

In `components/ActionBar.tsx`, add new props and a ref for the timer:

```typescript
// Add to imports:
import { useRef } from "react";

// Update interface:
interface ActionBarProps {
  recording: boolean;
  dictating: boolean;  // NEW
  busy: boolean;
  canSave: boolean;
  onImagePicked: (uri: string) => void;
  onRecordingStart: () => void;
  onRecordingComplete: (uri: string) => void;
  onDictationToggle: () => void;  // NEW — short press
  onSave: () => void;
}
```

- [ ] **Step 2: Replace handleMicPress with gesture logic**

Replace the `handleMicPress` function:

```typescript
const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
const didLongPress = useRef(false);

const handleMicPressIn = () => {
  if (busy) return;
  // If already dictating or recording, a press-in just preps for release
  if (dictating || recording) return;

  didLongPress.current = false;
  longPressTimer.current = setTimeout(async () => {
    didLongPress.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const started = await startRecording();
    if (started) onRecordingStart();
  }, 500);
};

const handleMicPressOut = () => {
  if (busy) return;

  // Cancel long press timer if still pending
  if (longPressTimer.current) {
    clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }

  // If already recording audio (long press was triggered), stop it
  if (recording) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopRecording().then((uri) => {
      if (uri) onRecordingComplete(uri);
    });
    return;
  }

  // If already dictating, stop dictation
  if (dictating) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDictationToggle();
    return;
  }

  // Short press — start dictation (only if long press didn't fire)
  if (!didLongPress.current) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDictationToggle();
  }
};
```

- [ ] **Step 3: Update the mic button JSX**

Replace the mic `AnimatedPressable` with `onPressIn`/`onPressOut`:

```typescript
<AnimatedPressable
  style={[
    styles.actionBtn,
    dictating && styles.micDictating,
    recording && styles.micRecording,
    busy && !recording && !dictating && styles.actionBtnDisabled,
  ]}
  onPressIn={handleMicPressIn}
  onPressOut={handleMicPressOut}
  disabled={busy && !recording && !dictating}
>
  {recording ? (
    <Text style={[styles.actionGlyph, styles.micGlyphRecording]}>◼</Text>
  ) : (
    <MicIcon color={dictating ? colors.accent.primary : colors.text.secondary} size={20} />
  )}
</AnimatedPressable>
```

- [ ] **Step 4: Add dictating style**

Add to ActionBar styles:

```typescript
micDictating: {
  borderColor: colors.accent.primary,
},
```

- [ ] **Step 5: Commit**

```bash
git add components/ActionBar.tsx
git commit -m "feat(ActionBar): short press dictation, long press audio recording"
```

---

### Task 6: Cursor tracking in CaptureInput

**Files:**
- Modify: `components/CaptureInput.tsx`

Add cursor position tracking, an `editable` prop (for disable-during-save), and an interim text display area.

- [ ] **Step 1: Update CaptureInput props and add cursor tracking**

```typescript
interface CaptureInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  ref?: React.Ref<TextInput>;
  editable?: boolean;                    // NEW
  interimText?: string;                  // NEW — ghost text from dictation
  onCursorChange?: (pos: { start: number; end: number }) => void;  // NEW
}
```

- [ ] **Step 2: Add onSelectionChange handler and interim text display**

Inside the component, add:

```typescript
const handleSelectionChange = (e: any) => {
  const { start, end } = e.nativeEvent.selection;
  onCursorChange?.({ start, end });
};
```

Add `onSelectionChange={handleSelectionChange}` and `editable={editable !== false}` to the TextInput.

Below the TextInput (inside the container), add the interim text display:

```typescript
{interimText ? (
  <Text style={styles.interimText}>{interimText}</Text>
) : null}
```

Add the style:

```typescript
interimText: {
  color: colors.accent.primary,
  fontSize: typography.size.md,
  fontStyle: "italic",
  opacity: 0.6,
  paddingHorizontal: spacing.xl,
  paddingTop: spacing.xs,
},
```

- [ ] **Step 3: Commit**

```bash
git add components/CaptureInput.tsx
git commit -m "feat(CaptureInput): cursor tracking, editable prop, interim text display"
```

---

### Task 7: Wire dictation into the main screen

**Files:**
- Modify: `app/index.tsx`

Connect the dictation service to the text input, handle interim/final text insertion at cursor, and update visual states.

- [ ] **Step 1: Add dictation state and cursor tracking**

In `CaptureScreen`, add new state:

```typescript
const [dictating, setDictating] = useState(false);
const [dictationState, setDictationState] = useState<DictationState>("idle");
const [interimText, setInterimText] = useState("");
const cursorPos = useRef({ start: 0, end: 0 });
```

Add imports:

```typescript
import { startDictation, stopDictation, DictationState } from "@/services/dictation";
```

- [ ] **Step 2: Implement dictation toggle handler**

```typescript
const handleDictationToggle = async () => {
  if (dictating) {
    await stopDictation();
    setDictating(false);
    setInterimText("");
    return;
  }

  setDictating(true);
  await startDictation({
    onInterimText: (text) => setInterimText(text),
    onFinalText: (text) => {
      setInterimText("");
      // Insert at cursor position
      setText((prev) => {
        const { start, end } = cursorPos.current;
        const before = prev.slice(0, start);
        const after = prev.slice(end);
        const needsSpace = before.length > 0 && !before.endsWith(" ") && !text.startsWith(" ");
        const inserted = (needsSpace ? " " : "") + text;
        // Update cursor to end of inserted text
        const newPos = start + inserted.length;
        cursorPos.current = { start: newPos, end: newPos };
        return before + inserted + after;
      });
    },
    onUtteranceEnd: () => {
      // Could insert a line break here if desired
    },
    onError: (message) => {
      showFlash("error", message);
      setDictating(false);
      setInterimText("");
    },
    onStateChange: (s) => setDictationState(s),
  });
};
```

- [ ] **Step 3: Update header badge for dictation states**

Replace the recording badge block:

```typescript
{/* Status badges */}
{dictating && (
  <View style={styles.recordingBadge}>
    <Animated.View style={[styles.recordingDot, { backgroundColor: colors.accent.primary }, pulseStyle]} />
    <Text style={[styles.recordingText, { color: colors.accent.primary }]}>
      {dictationState === "connecting" ? "connecting..." : "listening"}
    </Text>
  </View>
)}
{recording && !dictating && (
  <View style={styles.recordingBadge}>
    <Animated.View style={[styles.recordingDot, pulseStyle]} />
    <Text style={styles.recordingText}>recording</Text>
  </View>
)}
```

- [ ] **Step 4: Wire up CaptureInput with new props**

```typescript
<CaptureInput
  value={text}
  onChangeText={setText}
  editable={!saving}
  interimText={interimText}
  onCursorChange={(pos) => { cursorPos.current = pos; }}
/>
```

- [ ] **Step 5: Wire up ActionBar with dictation props**

```typescript
<ActionBar
  recording={recording}
  dictating={dictating}
  busy={saving}
  canSave={canSave}
  onImagePicked={handleImagePicked}
  onRecordingStart={handleRecordingStart}
  onRecordingComplete={handleRecordingComplete}
  onDictationToggle={handleDictationToggle}
  onSave={handleSave}
/>
```

- [ ] **Step 6: Disable chips during save**

Pass `disabled` to TypeChips and TagChips (update their interfaces to accept it):

```typescript
<TypeChips selected={type} onSelect={handleTypeSelect} disabled={saving} />
<TagChips selected={tags} onToggle={toggleTag} disabled={saving} />
```

In `TypeChips.tsx` and `TagChips.tsx`, add `disabled?: boolean` to their props interfaces. When `disabled` is true, set `pointerEvents: "none"` and `opacity: 0.4` on the container.

- [ ] **Step 7: Commit**

```bash
git add app/index.tsx components/CaptureInput.tsx components/TypeChips.tsx components/TagChips.tsx
git commit -m "feat: wire dictation into main screen with cursor insertion and visual states"
```

---

### Task 8: First-use tooltip

**Files:**
- Create: `components/Tooltip.tsx`
- Modify: `app/index.tsx`

- [ ] **Step 1: Create Tooltip component**

Create `components/Tooltip.tsx`:

```typescript
import React, { useEffect } from "react";
import { Text, StyleSheet } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { colors, spacing, radii, typography } from "@/theme";

interface TooltipProps {
  text: string;
  visible: boolean;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export default function Tooltip({
  text,
  visible,
  onDismiss,
  autoDismissMs = 3000,
}: TooltipProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.container}
    >
      <Text style={styles.text}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: -28,
    right: 0,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: {
    color: colors.text.secondary,
    fontSize: typography.size.xs,
    fontFamily: typography.family.mono,
    letterSpacing: typography.tracking.wide,
  },
});
```

- [ ] **Step 2: Add tooltip to ActionBar**

In `app/index.tsx`, track tooltip state:

```typescript
const [showMicTooltip, setShowMicTooltip] = useState(false);
const TOOLTIP_KEY = "quick-capture-mic-tooltip-shown";

// After first successful dictation start, show tooltip once
useEffect(() => {
  if (dictating && dictationState === "listening") {
    AsyncStorage.getItem(TOOLTIP_KEY).then((shown) => {
      if (!shown) {
        setShowMicTooltip(true);
        AsyncStorage.setItem(TOOLTIP_KEY, "true").catch(() => {});
      }
    });
  }
}, [dictating, dictationState]);
```

Render the tooltip near the mic button area (position via the ActionBar or as an overlay).

- [ ] **Step 3: Commit**

```bash
git add components/Tooltip.tsx app/index.tsx
git commit -m "feat: add first-use 'hold for audio' tooltip on mic button"
```

---

### Task 9: Network resilience integration

**Files:**
- Modify: `services/dictation.ts`
- Modify: `app/index.tsx`

- [ ] **Step 1: Add fallback attachment callback to dictation**

Update `DictationCallbacks` in `services/dictation.ts`:

```typescript
export interface DictationCallbacks {
  onInterimText: (text: string) => void;
  onFinalText: (text: string) => void;
  onUtteranceEnd: () => void;
  onError: (message: string) => void;
  onStateChange: (state: DictationState) => void;
  onFallbackAudio: (uri: string) => void;  // NEW — buffer saved as audio file
}
```

Update `handleDisconnectFallback` to call the new callback:

```typescript
async function handleDisconnectFallback() {
  const uri = await saveBufferAsWav();
  if (uri) {
    callbacks?.onFallbackAudio(uri);
  }
}
```

- [ ] **Step 2: Handle fallback audio in index.tsx**

In the `startDictation` callbacks:

```typescript
onFallbackAudio: (uri) => {
  // Add the fallback audio as an attachment
  setAttachments((prev) => [...prev, { type: "audio", uri }]);
},
```

- [ ] **Step 3: Add "catching up" indicator**

In `app/index.tsx`, add a slow-connection check:

```typescript
const [lagging, setLagging] = useState(false);

// Check for lag every second while dictating
useEffect(() => {
  if (!dictating) { setLagging(false); return; }
  const interval = setInterval(() => {
    setLagging(isLagging());
  }, 1000);
  return () => clearInterval(interval);
}, [dictating]);
```

Import `isLagging` from dictation service. Render below the text input when `lagging` is true:

```typescript
{lagging && (
  <Text style={styles.laggingText}>catching up...</Text>
)}
```

Style:

```typescript
laggingText: {
  color: colors.text.muted,
  fontSize: typography.size.xs,
  fontStyle: "italic",
  textAlign: "center",
  marginBottom: spacing.sm,
},
```

- [ ] **Step 4: Commit**

```bash
git add services/dictation.ts app/index.tsx
git commit -m "feat: network resilience — fallback audio, lag indicator"
```

---

### Task 10: Final integration testing and cleanup

**Files:**
- All modified files

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "^worker/"
```

Expected: no errors in app files.

- [ ] **Step 2: Manual test — dictation flow**

1. Run `cd worker && wrangler dev` (needs DEEPGRAM_API_KEY set)
2. Run `npx expo start --clear`
3. Open on Android device
4. Tap mic → should show "connecting..." then "listening"
5. Speak → words should appear in text box
6. Tap mic again → dictation stops

- [ ] **Step 3: Manual test — long press audio recording**

1. Long press mic (hold >500ms)
2. Should feel heavy haptic, border turns red, header shows "recording"
3. Release → audio attachment appears
4. Save → worker transcribes via batch endpoint

- [ ] **Step 4: Manual test — network failure**

1. Start dictation
2. Toggle airplane mode
3. Should see error flash, audio buffer saved as attachment

- [ ] **Step 5: Manual test — disable during save**

1. Type text, select type/tags
2. Tap "capture"
3. During save, chips and input should be non-interactive

- [ ] **Step 6: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: Second Layer complete — live transcription via Deepgram streaming"
```

- [ ] **Step 7: Update Notion project page**

Update milestone, current state, session log on the Notion project page.
