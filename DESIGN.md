# Quick Capture — Android Inbox

## Overview

A lightweight Android app for rapid capture to Notion. Text, images, voice notes, and research lookups — all feeding into the ⚡ Captures database. Designed for minimum friction: open, dump, done.

**Notion Project Page:** `338a7b0d-f11b-8105-9e26-c862700c3768`
**Captures Data Source:** `collection://c0213ae5-93d9-4fd8-828b-3c05acf22413`

---

## Architecture

```
┌─────────────────────────────────────┐
│         Android Phone (Expo)        │
│                                     │
│  ┌───────────┐  ┌────────────────┐  │
│  │ Share Sheet│  │  Quick Capture │  │
│  │ (text/img)│──│  Single Screen │  │
│  └───────────┘  │                │  │
│                 │  Text Input    │  │
│                 │  + Attachments │  │
│                 │  (img, audio)  │  │
│                 │  + Type/Tags   │  │
│                 └───────┬────────┘  │
│                         │           │
│  ┌──────────────────────┴────────┐  │
│  │ Offline Queue (AsyncStorage)  │  │
│  │ Queues text, audio URIs,      │  │
│  │ image URIs when no service    │  │
│  └──────────────┬────────────────┘  │
└─────────────────┼───────────────────┘
                  │ HTTPS + Bearer token
                  ▼
┌─────────────────────────────────────┐
│    Cloudflare Worker (Serverless)   │
│                                     │
│  POST /capture      → Notion API   │
│  POST /capture-multi → Deepgram    │
│                       → R2 storage  │
│                       → Notion API  │
│                                     │
│  ctx.waitUntil() for Lookup type:   │
│    → Anthropic API (research)       │
│    → Notion API (append results)    │
│                                     │
│  Secrets:                           │
│    NOTION_API_KEY                   │
│    DEEPGRAM_API_KEY                 │
│    ANTHROPIC_API_KEY                │
│    CAPTURE_SECRET                   │
└─────────────────────────────────────┘
         │              │
         ▼              ▼
┌──────────────┐ ┌──────────────┐
│  Cloudflare  │ │   Notion     │
│  R2 Buckets  │ │  ⚡ Captures  │
│  (img/audio) │ │  Database    │
└──────────────┘ └──────────────┘
```

---

## Tech Stack

| Layer         | Technology                          |
|---------------|-------------------------------------|
| Mobile app    | React Native (Expo) + TypeScript    |
| Routing       | Expo Router                         |
| Backend       | Cloudflare Worker                   |
| Transcription | Deepgram Nova-2                     |
| Research      | Anthropic API (Claude Sonnet)       |
| Media storage | Cloudflare R2                       |
| Database      | Notion (⚡ Captures)                |

---

## File Structure

```
quick-capture/
├── app/
│   ├── index.tsx              # Main capture screen (single screen app)
│   └── _layout.tsx            # Root layout + status bar
├── components/
│   ├── ActionBar.tsx          # Camera, gallery, mic, save buttons
│   ├── AttachmentBar.tsx      # Thumbnail previews of attached media
│   ├── CaptureInput.tsx       # Multiline text input
│   ├── TypeChips.tsx          # Capture type selector (horizontal scroll)
│   └── TagChips.tsx           # Tag multi-selector (horizontal scroll)
├── services/
│   ├── api.ts                 # Worker API client (submitCapture, submitMultiCapture)
│   ├── audio.ts               # Audio recording via expo-av
│   └── share-receiver.ts     # Android share intent handler (text + images)
├── worker/
│   ├── src/
│   │   └── index.ts           # Cloudflare Worker (all backend logic)
│   ├── wrangler.toml          # Worker config
│   ├── package.json           # Worker dependencies
│   └── tsconfig.json          # Worker TS config
├── theme.ts                   # All design tokens (colors, spacing, typography, etc.)
├── app.json                   # Expo config + Android intent filters + permissions
├── package.json               # App dependencies
├── tsconfig.json              # App TS config
├── babel.config.js            # Babel config (reanimated plugin)
├── .gitignore
├── .claude/
│   └── claude.md              # Claude Code bootstrap (Notion project page fetch)
├── SETUP.md                   # Setup & deployment guide
└── DESIGN.md                  # This file
```

---

## Capture Flow

### Text Capture
1. Open app → text input auto-focused
2. Type or paste content
3. Optionally select Type chip + Tag chips
4. Tap "Capture ⚡"
5. → Worker creates Notion page in ⚡ Captures
6. Form resets, flash confirmation

### Share Sheet (Text)
1. In any app, share text → select Quick Capture
2. App opens with shared text pre-filled
3. Same flow as above from step 3

### Share Sheet (Screenshot/Image)
1. Take screenshot or share image from any app → select Quick Capture
2. App opens with image attached as thumbnail
3. Optionally add text notes, voice, type/tags
4. Tap "Capture ⚡"
5. → Worker uploads image to R2, embeds in Notion page body

### Voice Capture
1. Tap mic button in action bar → recording starts (red pulsing indicator)
2. Tap stop → audio attached as thumbnail card
3. Optionally add text notes, images, type/tags
4. Tap "Capture ⚡"
5. → Worker transcribes via Deepgram Nova-2, stores audio in R2
6. Notion page gets transcription in Notes + audio reference in body

### Combo Capture (Image + Audio)
Either order works:
- Screenshot first → then record voice commentary → save
- Record voice first → then attach screenshot → save
- Both show as thumbnail cards in the attachment bar

### Lookup (Background Research)
1. Select "Lookup" type chip (🔍)
2. Dictate or type what you're looking for
   - e.g., "Heard about dual process theory on Huberman podcast, find the episode and the passage about somatic markers"
3. Tap "Capture ⚡"
4. → Notion capture created immediately (you get flash confirmation)
5. → Worker fires `ctx.waitUntil()` background task:
   - Calls Anthropic API with the capture text
   - Claude researches the reference
   - Appends "🔍 Research Results" section to the Notion page body
   - Updates Next Step to "Review research results — verify accuracy"
6. Results appear in Notion next time you look (typically seconds to ~30s)

### Offline / No Service
1. All captures queue in AsyncStorage (text, audio URIs, image URIs)
2. On next app open with connectivity, queue flushes automatically
3. Voice transcription happens at sync time (audio file persists on device)
4. Flash still shows "✓ Captured" for queued items — user doesn't need to worry

---

## Captures Database Schema

**Data Source ID:** `collection://c0213ae5-93d9-4fd8-828b-3c05acf22413`

| Property      | Type         | Values / Notes                                                              |
|---------------|--------------|-----------------------------------------------------------------------------|
| Capture       | title        | Auto-generated from first 60 chars of content, or "🎙 Voice note — [date]" |
| Type          | select       | Observation, Moment, Idea, Emotion, Overheard, Image/Scene, Question, Dream, **Lookup** |
| Tags          | multi_select | Daughters, School, Writing Material, Gut Health, Attachment, House/Property, Meditation, Reading, Nature |
| Priority      | select       | 🔴 High, 🟡 Medium, 🟢 Low (default)                                      |
| Connected To  | text         | Thread/project names, comma-separated (filled in during triage)             |
| Notes         | text         | The substance of the capture. Voice transcriptions go here.                 |
| Next Step     | text         | Auto-set for Lookup captures; otherwise filled in during triage             |
| Date Captured | date         | Auto-set to capture time                                                    |
| Created       | created_time | Auto-set by Notion                                                          |

**Page body** (for multi-media captures):
- Embedded images from R2
- Audio storage reference
- 🔍 Research Results section (for Lookup captures, appended by background task)

---

## Security Design

| Concern               | Approach                                                    |
|-----------------------|-------------------------------------------------------------|
| API keys on device    | Never. All keys (Notion, Deepgram, Anthropic) live on the Cloudflare Worker as encrypted secrets. |
| Worker endpoint auth  | Shared secret via Bearer token. Every request validated. 401 without it. |
| Transit encryption    | HTTPS enforced by both Cloudflare (worker) and Expo (app).  |
| Notion scope          | Integration connected only to ⚡ Captures database.         |
| Offline data          | Queued in AsyncStorage, protected by Android app sandbox.   |
| Audio to Deepgram     | Processed via API (not used for training per Deepgram ToS). |
| R2 media storage      | Not public by default. Requires explicit public access config or signed URLs. |

**Secrets to configure (via `wrangler secret put`):**
- `NOTION_API_KEY` — Notion internal integration token
- `DEEPGRAM_API_KEY` — Deepgram API key
- `ANTHROPIC_API_KEY` — Anthropic API key (for Lookup research)
- `CAPTURE_SECRET` — Shared secret (generate with `openssl rand -base64 32`)

---

## Visual Design

All design tokens live in `theme.ts`. To reskin the app, edit that single file.

### Color System (Dark Theme)

```
Background layers:     #0f0f1a (base) → #16213e (raised) → #1c2a4a (elevated)
Primary accent:        #e94560 (save button, recording, active states)
Secondary accent:      #533483 (selected tags)
Tertiary accent:       #0f3460 (active chips, mode toggle)
Text:                  #e8e8f0 (primary) → #a0a0bb (secondary) → #5c5c7a (muted)
Feedback:              #1b4332/#6bcb8b (success) | #6b1d1d/#f28b8b (error)
```

### Layout

Single screen, no navigation. Top to bottom:
1. **Header** — "⚡ Capture" title + recording indicator (when active)
2. **Text input** — Auto-focused, multiline, always visible
3. **Attachment bar** — Horizontal scroll of image/audio thumbnails with ✕ remove
4. **Type chips** — Horizontal scroll, single select
5. **Tag chips** — Horizontal scroll, multi select
6. **Action bar** — Camera | Gallery | Mic | "Capture ⚡" save button

### Interaction

- Save button glows (shadow) when content is present
- Mic button turns red and pulses while recording
- "Recording" badge appears in header during voice capture
- Flash banner (green success / red error) after save
- Haptic feedback on mic press, save, image pick

---

## Deepgram Configuration

| Parameter     | Value   | Why                                              |
|---------------|---------|--------------------------------------------------|
| model         | nova-2  | Best accuracy for English, good with varied audio |
| smart_format  | true    | Auto punctuation, casing, paragraphs             |
| punctuate     | true    | Sentence-level punctuation                       |
| filler_words  | false   | Drops "um", "uh" from output                     |
| diarize       | false   | Default single-speaker (set true for multi-voice) |
| language      | en      | English                                          |

Multi-speaker (e.g., recording kids): pass `diarize: true` in the capture payload. Deepgram returns speaker-labeled transcript ("Speaker 1: ... Speaker 2: ...").

---

## Claude Code Bootstrap

The `.claude/claude.md` file instructs Claude Code to:
1. **Fetch the Notion project page** (`338a7b0df11b81059e26c862700c3768`) at session start
2. **Update the page** at milestones (Current State, Milestone Log, Key Decisions, Session Log)
3. **Reference the Captures schema** for any database interactions

This keeps project context persistent across coding sessions.

---

## Setup Summary

1. **Notion**: Create internal integration → connect to ⚡ Captures database
2. **Cloudflare**: Deploy worker → set 4 secrets → optionally create R2 buckets
3. **App config**: Set worker URL + shared secret in `services/api.ts`
4. **Dev**: `npm install && npx expo start` → scan QR with Expo Go
5. **Build**: `npx eas build --platform android --profile preview` → sideload APK

Full details in `SETUP.md`.

---

## First Layer — Design Principles Conformity

**Goal:** Bring the existing scaffold into alignment with the Universal Design Principles before adding new features. Every change here is a behavioral correction, not a cosmetic preference.

**Principles addressed:** P1 (Sensory Feedback), P2 (Progressive Revelation), P5 (Trust Architecture), P8 (Microcopy & Voice), P9 (Psychological Intent)

### 1. Sensory Feedback (P1)

Every interactive element must produce an immediate visual response. No tap should go unacknowledged.

| Element | Current | Target |
|---------|---------|--------|
| Type chips | No press state | `Animated` scale to 97% on press, 150ms spring-back |
| Tag chips | No press state | Same scale animation as type chips |
| Flash banner | Appears/disappears instantly | Slide-down entrance (250ms) + fade-out exit (400ms) |
| Recording dot | Static red circle | Looping opacity pulse (0.3 → 1.0, 600ms cycle per `animation.pulse`) |
| Save button | Glow only | Add 98% scale on press + glow |
| Transcription indicator | Generic `ActivityIndicator` | Pulsing mic icon with contextual text |
| Attachment remove (✕) | No press state | Opacity shift to 0.6 on press |

**Implementation:** Use `react-native-reanimated` (already configured in babel.config.js) for all animations. Create a shared `AnimatedPressable` wrapper component for consistent press states across chips and buttons.

### 2. Microcopy & Voice (P8)

Every string the user reads should sound like the same warm, clear human wrote it. Outcome labels over mechanism labels.

| Current | Revised | Why |
|---------|---------|-----|
| "Saving..." | "Capturing..." | Outcome, not mechanism |
| "Transcribing audio & saving..." | "Listening to your voice note..." | Warm, contextual |
| "✗ Failed" | "Couldn't save — tap to retry" | Explains + guides |
| "✓ Captured" | "✓ Captured" (keep) | Already good |
| "Permission needed" (Alert title) | "One more thing" | Less clinical |
| "Grant photo access to attach images." | "Quick Capture needs photo access to attach images." | Names the app, not the system |
| "Grant camera access to take photos." | "Quick Capture needs camera access to take photos." | Same pattern |

**Error state expansion:** When a save fails (not queued offline), the flash should persist until tapped (not auto-dismiss), show the error reason when available, and offer retry.

### 3. Draft Persistence (P5)

User input must never silently vanish. If the app is killed mid-capture, the draft survives.

**Behavior:**
- On every text change (500ms debounce), auto-save to AsyncStorage: `{ text, type, tags, attachmentUris }`
- On app open, check for draft. If found, restore silently — no modal, no "restore draft?" prompt
- On successful save or successful offline-queue, clear the draft
- Attachment URIs are stored (files persist on device); actual file availability is checked on restore

**Key:** `DRAFT_KEY = "quick-capture-draft"`

**Storage shape:**
```typescript
interface Draft {
  text: string;
  type: CaptureType;
  tags: CaptureTag[];
  attachments: Array<{ type: "image" | "audio"; uri: string; duration?: number }>;
  savedAt: number; // timestamp for staleness check
}
```

### 4. Smart Tag Collapse (P2)

First visit: simple. Tenth visit: personalized. Tags should surface what's most likely useful.

**Behavior:**
- Track tag usage frequency in AsyncStorage (`TAG_USAGE_KEY`)
- On render, sort tags by usage count (descending), show top 4
- Render a "+N more" chip at the end; tapping expands to full list with slide animation
- If no usage data (first-time user), show all tags (no collapse)
- Selected tags always remain visible even when collapsed
- Expanded state persists for the duration of the session (not saved)

**Storage shape:**
```typescript
interface TagUsage {
  [tag: string]: number; // cumulative usage count
}
```

### 5. Smart Type Defaults (P9)

Reduce decisions without removing options. The app should anticipate the user's intent based on context.

**Rules:**
- When the first image is attached and the user has NOT manually changed the type → auto-select "Image/Scene"
- When recording starts and type is still default ("Idea") → auto-select "Overheard"
- When the user pastes a URL (detected via regex) → auto-select "Lookup"
- Any manual type selection overrides auto-selection permanently for that capture session
- Auto-selections are visually distinct (subtle pulse on the chip) so the user notices and can override

**State tracking:** Add a `typeManuallySet: boolean` flag. Set `true` on user tap of any type chip. Reset on form clear.

---

## Future Considerations

- **Android home screen widget** — one-tap to open capture
- **Auto-categorization** — LLM suggests Type and Tags based on content
- **Diarization toggle in UI** — for multi-speaker recordings
- **Wear OS companion** — wrist capture
- **Light mode** — second token set in theme.ts, swap via context
- **On-device transcription** — Whisper.cpp for fully offline voice capture
- **Capture streak** — gentle daily nudge
