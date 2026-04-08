# Quick Capture

Lightweight Android inbox app for rapid capture to Notion. One screen, dump and go.

Text, voice dictation, images, and shared content all flow into the [Captures](https://www.notion.so/) database with type, tags, and priority metadata.

## Architecture

```
Expo App (React Native)  ──>  Cloudflare Worker  ──>  Notion API
                                    │
                                    ├──>  Deepgram Nova-2 (transcription)
                                    ├──>  Cloudflare R2 (image/audio storage)
                                    └──>  Anthropic Claude (Lookup research)
```

- **Frontend:** Expo SDK 55 / React Native 0.83 / TypeScript
- **Backend:** Cloudflare Worker (serverless proxy — keeps API keys off device)
- **Transcription:** Deepgram Nova-2 (batch record-then-transcribe)
- **Storage:** Cloudflare R2 (images + audio)
- **Target:** Android (primary), iOS (future)

## Project Structure

```
quick-capture/
├── app/                        # Expo Router screens
│   ├── index.tsx               # Main capture screen
│   └── _layout.tsx             # Root layout (ShareIntent + Keyboard providers)
├── components/
│   ├── ActionBar.tsx           # Camera, gallery, mic, save buttons
│   ├── AnimatedPressable.tsx   # Spring-animated pressable
│   ├── AttachmentBar.tsx       # Image/audio thumbnail strip
│   ├── CaptureInput.tsx        # Text input + inline waveform + attachments
│   ├── CardStack.tsx           # Animated overlapping card deck
│   ├── TagChips.tsx            # Tag selector (CardStack layout)
│   ├── Tooltip.tsx             # First-use tooltip overlay
│   ├── TypeChips.tsx           # Capture type selector (CardStack layout)
│   └── Waveform.tsx            # Animated copper waveform visualizer
├── services/
│   ├── api.ts                  # Backend API client
│   ├── audio.ts                # Audio recording (expo-audio)
│   ├── dictation.ts            # Record-then-transcribe service
│   └── share-receiver.ts       # expo-share-intent handler
├── worker/                     # Cloudflare Worker backend
│   ├── src/index.ts            # Worker entry (Notion proxy, transcription, R2, research)
│   └── wrangler.toml           # Worker config + R2 bucket bindings
├── theme.ts                    # Design tokens (colors, spacing, typography, shadows)
├── .env.example                # Environment variable reference
└── app.json                    # Expo config
```

## Setup

### Prerequisites

- Node.js 20+
- Expo CLI (`npm install -g expo-cli`)
- Wrangler CLI (`npm install -g wrangler`)
- Android device or emulator
- Accounts: [Notion](https://www.notion.so/), [Deepgram](https://deepgram.com/), [Cloudflare](https://dash.cloudflare.com/), [Anthropic](https://console.anthropic.com/)

### 1. Clone and install

```bash
git clone https://github.com/Eldridge-B/quick-capture.git
cd quick-capture
npm install
cd worker && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

| Variable | Where it's used | How to get it |
|----------|----------------|---------------|
| `EXPO_PUBLIC_API_BASE` | Expo app | Your deployed Worker URL |
| `EXPO_PUBLIC_CAPTURE_SECRET` | Expo app | Shared secret (you choose) |
| `DEEPGRAM_API_KEY` | Worker | [Deepgram Console](https://console.deepgram.com/) |
| `NOTION_API_KEY` | Worker | [Notion Integrations](https://www.notion.so/my-integrations) |
| `ANTHROPIC_API_KEY` | Worker | [Anthropic Console](https://console.anthropic.com/) |
| `CAPTURE_SECRET` | Worker | Must match `EXPO_PUBLIC_CAPTURE_SECRET` |

### 3. Deploy the Worker

```bash
cd worker

# Set secrets (one-time)
wrangler secret put NOTION_API_KEY
wrangler secret put DEEPGRAM_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put CAPTURE_SECRET

# Deploy
wrangler deploy
```

### 4. Run the app

```bash
npx expo start
# Press 'a' for Android
```

### 5. Build APK

```bash
npx eas build --platform android --profile preview
```

## How It Works

**Text capture:** Type or paste text, pick a type and tags, hit save. Goes straight to Notion.

**Voice dictation:** Tap the mic button to record. When you stop, audio is sent to Deepgram Nova-2 for transcription, and the text appears in the input box. Long-press the mic to save as an audio attachment instead.

**Image capture:** Camera or gallery picker. Images are uploaded to Cloudflare R2, and the URL is attached to the Notion page.

**Share intent:** Share text or images from any Android app (browser, NYTimes, etc.) and it lands in Quick Capture ready to tag and save.

**Offline:** Captures are queued in AsyncStorage and flushed when the app opens with connectivity.

## Design

"Quiet Studio" aesthetic — warm charcoal background with copper accents. All colors are centralized in `theme.ts` as semantic design tokens. No Tailwind; pure React Native StyleSheet.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm run android` | Run on Android device/emulator |
| `npm run build:android` | Build APK via EAS |
| `npm run worker:dev` | Start Worker locally |
| `npm run worker:deploy` | Deploy Worker to Cloudflare |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 55, React Native 0.83 |
| Language | TypeScript 5.9 |
| Navigation | Expo Router |
| Animation | Reanimated 4, react-native-keyboard-controller |
| Audio | expo-audio |
| Share receiving | expo-share-intent |
| Backend | Cloudflare Workers |
| Transcription | Deepgram Nova-2 |
| Storage | Cloudflare R2 |
| Database | Notion API |
| AI | Anthropic Claude (Lookup research) |
