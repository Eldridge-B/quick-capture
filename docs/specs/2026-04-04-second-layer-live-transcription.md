# Second Layer — Live Transcription

**Goal:** Tap the mic, speak, words appear in the text box at the cursor position. Powered by Deepgram Nova-2 streaming via a Cloudflare Worker WebSocket proxy.

**Decisions made during brainstorming:**
- Insert at cursor position (not append-only) — most flexible
- Short press = dictate, long press (500ms) = audio recording — one button, two modes
- Deepgram over Android built-in speech recognition — quality matters
- API key stays server-side — Worker proxies the WebSocket

---

## Architecture

```
Phone (Expo)                    Cloudflare Worker                 Deepgram
┌────���─────┐                    ┌──────────────┐                  ┌──────────┐
│ expo-av   │──── WebSocket ───→│ /ws/dictate  │──── WebSocket ──→│ Nova-2   │
│ mic audio │    (binary PCM)   │              │   (binary PCM)   │ Streaming│
│           │                   │ Proxies auth │                  │          │
│ text box  │←── WebSocket ────│ + audio data │←── JSON results ─│          │
│ (updates) │   (JSON results) │              │                  │          │
└──────────┘                    └──────────────┘                  └──────────┘
```

**Why a Worker proxy instead of connecting directly from the phone?**
- Deepgram API key never touches the device
- Worker can add logging, rate limiting, usage tracking later
- Same auth pattern as existing endpoints (Bearer token)
- Cloudflare's edge network minimizes latency to Deepgram

---

## Worker: WebSocket Proxy Endpoint

### `GET /ws/dictate` → WebSocket upgrade

**Auth:** Bearer token in the initial HTTP upgrade request (same `CAPTURE_SECRET`).

**Behavior:**
1. Client connects via WebSocket with Bearer token
2. Worker validates auth, opens a WebSocket to Deepgram:
   ```
   wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&punctuate=true&interim_results=true&endpointing=300&utterance_end_ms=1000&encoding=linear16&sample_rate=16000&channels=1
   ```
3. Worker pipes:
   - Client → Deepgram: binary audio frames (PCM 16-bit, 16kHz mono)
   - Deepgram → Client: JSON transcription results (forwarded as-is)
4. Client sends `{"type": "CloseStream"}` or disconnects → Worker closes Deepgram connection
5. Worker sends `{"type": "KeepAlive"}` every 8 seconds to Deepgram to prevent timeout

**Deepgram parameters:**
| Parameter | Value | Why |
|-----------|-------|-----|
| model | nova-2 | Best accuracy for English, matches existing config |
| language | en | English |
| smart_format | true | Auto punctuation, casing, paragraphs |
| punctuate | true | Sentence-level punctuation |
| interim_results | true | Shows words as user speaks (before finalization) |
| endpointing | 300 | 300ms silence triggers finalization — responsive but not jumpy |
| utterance_end_ms | 1000 | Fires UtteranceEnd after 1s silence — used to insert line breaks |
| encoding | linear16 | Raw PCM 16-bit — no codec overhead, best quality |
| sample_rate | 16000 | 16kHz — standard for speech, good quality/bandwidth balance |
| channels | 1 | Mono — single speaker dictation |

**Error handling:**
- If Deepgram connection fails, Worker sends `{"type": "error", "message": "..."}` to client and closes
- If client disconnects, Worker closes Deepgram connection (cleanup)
- If Deepgram disconnects unexpectedly, Worker sends error to client

---

## App: Dictation Service

### New file: `services/dictation.ts`

Manages the WebSocket connection and audio streaming.

**Exports:**
```typescript
interface DictationCallbacks {
  onInterimText: (text: string) => void;   // partial transcript, updates in place
  onFinalText: (text: string) => void;     // finalized transcript segment
  onUtteranceEnd: () => void;              // silence detected — can insert newline
  onError: (message: string) => void;
  onStateChange: (state: DictationState) => void;
}

type DictationState = "idle" | "connecting" | "listening" | "error";

function startDictation(callbacks: DictationCallbacks): Promise<void>;
function stopDictation(): void;
function getDictationState(): DictationState;
```

**Audio capture:**
- Use `expo-audio` AudioRecorder in streaming mode, or fall back to `expo-av` Recording with short buffer chunks
- Record as PCM 16-bit, 16kHz, mono (linear16)
- Send audio chunks to WebSocket every ~250ms (4KB chunks at 16kHz/16bit)

**Audio format note:**
- `expo-audio` records to compressed formats (m4a/aac) by default
- For raw PCM streaming, we may need to configure the recorder with `{ android: { extension: '.wav', outputFormat: 'wav', ... } }` or use a lower-level approach
- If direct PCM isn't available, record short segments (250ms) and send them — Deepgram handles chunked input
- Alternative: record as WAV (which is just PCM with headers) and strip the header before sending

**Connection lifecycle:**
1. `startDictation()` → state = "connecting"
2. Open WebSocket to `${WORKER_URL}/ws/dictate` with Bearer token
3. On open → start mic recording, state = "listening"
4. Stream audio chunks to WebSocket as binary messages
5. Receive JSON results, dispatch to callbacks
6. `stopDictation()` → stop mic, send CloseStream, close WebSocket, state = "idle"

---

## App: Mic Button Interaction

### Short press (tap) — Dictation mode

1. User taps mic button
2. Haptic feedback (medium)
3. Mic button border turns copper (accent color), subtle pulse
4. Header shows "listening" in monospace (replaces "recording" badge)
5. WebSocket opens, audio streams to Worker → Deepgram
6. Interim text appears at cursor position in the text box, styled slightly faded
7. When Deepgram finalizes a segment (`is_final: true`), interim text becomes solid
8. User taps mic again → dictation stops, final text committed
9. Mic button returns to default state

### Long press (500ms hold) — Audio recording mode

1. User holds mic button for 500ms
2. Haptic feedback (heavy) — distinct from tap
3. Mic button border turns red, existing pulse animation
4. Header shows "recording" badge (existing behavior)
5. Audio records locally to a file (existing `services/audio.ts` flow)
6. User taps to stop → audio attached as thumbnail card
7. On save, Worker transcribes via existing batch Deepgram endpoint

### Gesture detection

Use a timer-based approach:
- `onPressIn` → start 500ms timer
- `onPressOut` before 500ms → cancel timer, trigger dictation (short press)
- Timer fires at 500ms → trigger audio recording (long press), heavy haptic

### Visual states

| State | Mic border | Mic icon color | Header badge |
|-------|-----------|---------------|-------------|
| Idle | `border.subtle` | `text.secondary` | none |
| Dictating | `accent.primary` (copper) | `accent.primary` | "listening" (mono, copper) |
| Recording audio | `recording` (red) | `recording` | "recording" (mono, red) |
| Connecting | `accent.primary` pulsing | `text.muted` | "connecting..." (mono) |

---

## App: Text Insertion at Cursor

### How cursor tracking works in React Native

- `TextInput` exposes `onSelectionChange` event with `{ nativeEvent: { selection: { start, end } } }`
- Track cursor position in a ref: `cursorPos = useRef({ start: 0, end: 0 })`
- Update on every `onSelectionChange`

### Inserting dictated text

When `onFinalText` fires:
1. Get current text and cursor position
2. Replace selection range (or insert at cursor if no selection):
   ```
   newText = text.slice(0, cursor.start) + finalText + text.slice(cursor.end)
   ```
3. Update cursor position to end of inserted text
4. If text already has content before cursor and the dictated text doesn't start with a space, prepend a space

When `onInterimText` fires:
- Show interim text in a separate overlay or inline with reduced opacity
- Don't modify the actual TextInput value (avoids flicker)
- On next `onFinalText`, the interim display clears and real text is inserted

### Interim text display

Two approaches:

**Option A — Ghost text overlay:** Render a semi-transparent `Text` component positioned after the cursor that shows the interim transcript. Doesn't modify the input value. Simpler but positioning is tricky.

**Option B — Inline insertion with rollback:** Insert interim text directly into the TextInput with a marker, replace it when final text arrives. Simpler to implement but causes slight flicker.

**Recommendation: Option A (ghost overlay)** for a cleaner feel, but fall back to **Option B** if positioning proves too complex in React Native.

---

## First-Use Tooltip

On the very first app open (tracked via AsyncStorage flag `TOOLTIP_SHOWN_KEY`):
- After the user's first tap on the mic button (dictation starts successfully)
- Show a small tooltip below the mic button: "hold for audio"
- Auto-dismiss after 3 seconds
- Never show again

---

## Known Bug Fix (Bundle with this layer)

**Editing during save:** Currently the user can modify type/tags/text while "Capturing..." is in progress. During the save flow (`saving === true`), disable:
- Type chip interaction
- Tag chip interaction
- Action bar buttons (already partially done)
- Text input editing

---

## Network Resilience

**Principle: the user's words are never lost.** Either Deepgram got them in real-time, or we have the audio file as a fallback.

### Local audio buffer

While streaming to Deepgram, the app keeps a rolling PCM buffer of the current dictation session on-device (up to ~60 seconds). This buffer is the safety net for all failure modes.

### Failure scenarios

| Scenario | Detection | App behavior |
|----------|-----------|-------------|
| **No network at all** | WebSocket fails to connect | Flash: "No connection — hold mic to record locally". Dictation doesn't start. Long-press audio recording still works (local file, queued for batch transcription later). |
| **Connection drops mid-dictation** | WebSocket `onclose`/`onerror` during active session | Auto-save the local PCM buffer as an audio attachment. Flash: "Connection lost — saved as voice note." Text already transcribed stays in the box. The audio attachment covers whatever was said after the last finalized segment. |
| **Slow/degraded connection** | No interim results received >3 seconds after last audio chunk sent | Show subtle "catching up..." indicator below the text box. Don't kill the session — Deepgram handles buffered input and will catch up. Remove indicator once results resume. |
| **Worker is down** | WebSocket connection refused or 5xx on upgrade | Same as "no network" — flash message, offer long-press audio recording. |
| **Deepgram is down** | Worker receives Deepgram connection error, forwards `{"type": "error"}` to client | Flash: "Transcription unavailable — hold mic to record locally". Stop dictation session. |

### Buffer management

- Buffer starts when dictation begins, clears on successful `stopDictation()`
- On disconnect: buffer is written to a temp file, converted to an audio attachment, added to the capture
- Buffer is PCM 16-bit 16kHz mono — same format streamed to Deepgram, so no conversion needed
- Max buffer size ~1.9MB for 60 seconds — manageable in memory

### Offline queue integration

Audio attachments created from the fallback buffer use the existing offline queue path:
- Attachment stored locally → queued → on next app open with connectivity → Worker batch-transcribes via existing `/capture-multi` endpoint

---

## Dependencies

**New:**
- None expected — uses existing `expo-audio` for mic access and native WebSocket

**Worker changes:**
- New WebSocket endpoint `/ws/dictate`
- Cloudflare Workers support WebSocket proxying via `WebSocketPair`

---

## Scope Boundaries

**In scope:**
- WebSocket proxy endpoint on Worker
- Dictation service (connect, stream, receive results)
- Mic button short/long press gesture
- Cursor-position text insertion
- Interim text display
- Visual states (dictating vs recording)
- First-use tooltip
- Disable editing during save (bug fix)
- Offline fallback messaging

**Out of scope (future layers):**
- On-device transcription (Whisper.cpp)
- Multi-language support
- Speaker diarization in dictation mode
- Custom vocabulary/keyword boosting
- Dictation history/undo
