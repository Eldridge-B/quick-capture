# Quick Capture — Setup Guide

## Prerequisites

- Node.js 18+
- An Android phone (or emulator)
- Expo Go app installed on your phone (for development)
- A Cloudflare account (free tier works)
- A Notion internal integration token
- A Deepgram API key (for Nova-2 transcription)

## 1. Notion Integration Setup

1. Go to https://www.notion.so/my-integrations
2. Create a new internal integration called "Quick Capture"
3. Give it **Insert content** and **Read content** capabilities
4. Copy the integration token (starts with `ntn_`)
5. In Notion, open your ⚡ Captures database
6. Click ··· → Connections → Connect to "Quick Capture"

## 2. Generate a Shared Secret

Generate a random string to use as the shared secret between the app and worker.
Any method works — here's one:

```bash
openssl rand -base64 32
```

Keep this value handy — you'll use it in both the worker and the app.

## 3. Backend (Cloudflare Worker)

```bash
cd worker
npm install

# Store secrets (never commit these)
wrangler secret put NOTION_API_KEY
# paste your Notion integration token

wrangler secret put DEEPGRAM_API_KEY
# paste your Deepgram API key

wrangler secret put CAPTURE_SECRET
# paste the shared secret you generated

# Test locally
wrangler dev

# Deploy
wrangler deploy
```

After deploying, note the worker URL (e.g., `https://quick-capture-worker.your-subdomain.workers.dev`).

## 4. Mobile App

```bash
# From the project root
npm install
```

Before running, update two values in `services/api.ts`:
1. `API_BASE` — set the production URL to your deployed worker URL
2. `CAPTURE_SECRET` — set to the same shared secret you put in the worker

```bash
# Start dev server
npx expo start

# Scan the QR code with Expo Go on your phone
```

## 5. Build for Android (standalone APK)

```bash
# First time: configure EAS
npx eas init
npx eas build:configure

# Build a preview APK (sideloadable, no Play Store needed)
npx eas build --platform android --profile preview
```

This gives you an APK you can install directly on your phone.

## 6. Optional: Audio Storage (R2)

If you want to keep audio files (not just transcriptions):

1. Create an R2 bucket in Cloudflare dashboard
2. Uncomment the R2 section in `worker/wrangler.toml`
3. Redeploy the worker

## Security Notes

- The **Notion API key** and **Deepgram key** never leave the Cloudflare Worker — they're stored as encrypted secrets
- The **shared secret** authenticates every request from the app to the worker — without it, the worker returns 401
- All traffic is HTTPS (enforced by Cloudflare and Expo)
- The Notion integration should be scoped to **only** the Captures database
- The offline queue stores captures in AsyncStorage (encrypted by Android app sandbox)

## Usage

- **Text capture:** Open app → type or paste → tap Save
- **Share sheet:** In any app, share text → select Quick Capture
- **Voice:** Open app → tap Voice → tap mic → speak → tap stop → review transcription → Save
- **Offline:** Captures queue locally and sync when connection returns

## Visual Customization

All colors, spacing, typography, and shadows are defined in `theme.ts`. To reskin the app, edit that single file — no component changes needed.
