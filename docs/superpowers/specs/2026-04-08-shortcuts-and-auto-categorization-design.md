# App Shortcuts + Auto-Categorization Design

**Date:** 2026-04-08
**Status:** Approved
**Features:** App icon long-press shortcuts, LLM-powered auto-categorization

---

## Feature 1: App Shortcuts

### Overview

Two Android long-press shortcuts on the app icon for the most common capture entry points: voice dictation and clipboard paste.

### Shortcuts

| ID | Label | Icon | Route Param | Action |
|----|-------|------|-------------|--------|
| `voice` | Voice Capture | mic | `/?action=voice` | Opens app, immediately starts dictation |
| `paste` | Paste Capture | clipboard | `/?action=paste` | Opens app, reads clipboard, pastes into text input |

### Implementation

**Library:** `expo-quick-actions@6.0.1` (Evan Bacon, MIT, 33K weekly downloads, Expo config plugin)

**Additional dependency:** `expo-clipboard` (for paste action)

**Registration (`_layout.tsx`):**
- Call `useQuickActionRouting()` from `expo-quick-actions/router` for Expo Router integration
- Register shortcuts via `QuickActions.setItems()` on mount
- Each shortcut passes `params.href` with query param

**Handling (`index.tsx`):**
- Read `action` search param from Expo Router on mount
- `action=voice` → call `handleDictationToggle()` to start recording
- `action=paste` → read clipboard via `expo-clipboard`, call `setText()`, auto-focus input

**Config (`app.json`):**
- Add `expo-quick-actions` plugin with Android adaptive icons for both shortcuts

### Constraints

- Shortcuts only work in dev builds or production APKs, not Expo Go
- Android typically supports 4-5 shortcuts max (we use 2)
- No official SDK 55 version tag for expo-quick-actions; community reports v6.0.1 works

### Testing

- Dev build on physical device via `npx expo run:android`
- Requires Android Studio SDK installed locally

---

## Feature 2: Auto-Categorization

### Overview

After a capture is saved, the Worker classifies it into Type and Tags using Claude Haiku 3.5 in the background. Only runs when the user didn't manually select Type/Tags before saving. Priority is never auto-classified (it's a judgment call about urgency, not content).

### Flow

```
User taps Save
    │
    ▼
Worker creates Notion page immediately → returns 200 to app
    │
    ▼
Worker checks payload.autoClassify
    │
    ├── false (user set chips) → done
    │
    └── true (user skipped chips) → ctx.waitUntil(autoClassify(...))
                                        │
                                        ▼
                                   Load few-shot examples (daily cache)
                                        │
                                        ▼
                                   Call Haiku with tool_use
                                        │
                                        ▼
                                   PATCH Notion page with Type + Tags
```

### Auto-classify signal

The app tracks whether the user tapped any Type or Tag chip before saving. A new boolean field `autoClassify` is added to `CapturePayload`:
- `true` — user typed text and hit save without touching chips
- `false` — user manually selected at least one Type or Tag

### LLM Classification

**Model:** Claude 3.5 Haiku (`claude-3-5-haiku-20241022`)
- Cost: ~$0.0008 per classification
- Latency: ~0.5-1s (runs in background, user doesn't wait)

**Method:** Anthropic tool_use with forced `tool_choice`

```json
{
  "tools": [{
    "name": "classify_capture",
    "input_schema": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": ["Observation", "Moment", "Idea", "Emotion", "Overheard",
                   "Image/Scene", "Question", "Dream"]
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": ["Daughters", "School", "Writing Material", "Gut Health",
                     "Attachment", "House/Property", "Meditation", "Reading", "Nature"]
          }
        }
      },
      "required": ["type", "tags"]
    }
  }],
  "tool_choice": { "type": "tool", "name": "classify_capture" }
}
```

Enum constraints ensure only valid Notion property values are returned.

### Few-Shot Examples (Daily Cache)

- Worker queries the Captures database for the 8 most recent manually-categorized entries (one per Type, to cover the full taxonomy)
- Query filters: entries where Type is set and at least one Tag is present
- Stored in a module-level variable with a TTL timestamp (24h)
- On first request after TTL expires, fetch fresh examples before classifying
- Examples are formatted as: `Capture: "..." → {"type": "...", "tags": [...]}`

This lets the LLM learn the user's personal vocabulary and categorization patterns from real data.

### Prompt Structure

```
System: You classify short text captures into Type and Tags.

[Type definitions with brief descriptions]
[Tag list]

Examples (from user's recent captures):
Capture: "Maya said the funniest thing..." → {"type": "Overheard", "tags": ["Daughters"]}
Capture: "What if the chapter opened with..." → {"type": "Idea", "tags": ["Writing Material"]}
[... up to 8 examples]

Classify this capture:
"[user's capture text]"
```

### Changes Required

**`worker/src/index.ts` (~80 lines):**
- `autoClassify()` function — calls Haiku, extracts tool_use result, PATCHes Notion page
- `fetchFewShotExamples()` function — queries Notion for recent categorized captures
- Cache logic — module-level variable with TTL check
- Trigger in `handleCapture()` and `handleMultiCapture()` via `ctx.waitUntil()`

**`app/index.tsx` (~5 lines):**
- Track `chipsTouched` ref — set to `true` when user taps any Type or Tag chip
- Pass `autoClassify: !chipsTouched.current` in payload

**`services/api.ts` (~3 lines):**
- Add `autoClassify?: boolean` to `CapturePayload` interface

### Cost

| Volume | Monthly Cost |
|--------|-------------|
| 10 captures/day | ~$0.24 |
| 30 captures/day | ~$0.72 |
| 50 captures/day | ~$1.20 |

---

## Out of Scope

- Priority classification (intentionally excluded — urgency is a human judgment)
- Client-side pre-fill / suggestion UI (conflicts with dump-and-go philosophy)
- On-device classification (unnecessary complexity for a personal app)
- Light mode (deferred)
