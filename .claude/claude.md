# Project: Quick Capture — Android Inbox

## Notion Documentation
At the START of every session, fetch the Notion project page to establish context:
- Notion MCP connector server UUID: 673d9811-c893-4139-b370-a0e58cb28d65
- Project page ID: 338a7b0d-f11b-8105-9e26-c862700c3768
- Use: mcp__673d9811-c893-4139-b370-a0e58cb28d65__notion-fetch with id: "338a7b0df11b81059e26c862700c3768"

## Milestone Documentation
At each milestone, update the Notion project page:
1. Update the "Current State" section with what's built and working
2. Append to the "Milestone Log" with date, milestone name, and summary
3. Update the "Key Decisions" section if any architecture decisions were made
4. Append to the "Session Log" with a brief summary of the session
5. Update the "Current Milestone" and "Next Step" properties

Use: mcp__673d9811-c893-4139-b370-a0e58cb28d65__notion-update-page

## Architecture Overview
- **Frontend:** Expo (React Native) with TypeScript, Expo Router
- **Backend:** Cloudflare Worker (serverless proxy)
- **Transcription:** Deepgram Nova-2 API
- **Target database:** ⚡ Captures (data source `collection://c0213ae5-93d9-4fd8-828b-3c05acf22413`)

## Key Files
- `app/index.tsx` — Main capture screen (single-screen app)
- `components/` — CaptureInput, VoiceButton, TypeChips, TagChips
- `services/api.ts` — Backend API client
- `services/audio.ts` — Audio recording via expo-av
- `services/share-receiver.ts` — Android share intent handler
- `worker/src/index.ts` — Cloudflare Worker (Notion API proxy + Whisper transcription)

## Captures Database Schema (for reference)
Title property: "Capture"
- Type (select): Observation, Moment, Idea, Emotion, Overheard, Image/Scene, Question, Dream
- Tags (multi_select): Daughters, School, Writing Material, Gut Health, Attachment, House/Property, Meditation, Reading, Nature
- Priority (select): 🔴 High, 🟡 Medium, 🟢 Low
- Connected To (text): Thread/project names, comma-separated
- Notes (text): The substance of the capture
- Date Captured (date): expanded format
- Next Step (text): What to do next

## Development
- App: `npm install && npx expo start`
- Worker: `cd worker && npm install && wrangler dev`
- Deploy worker: `cd worker && wrangler deploy`
- Build Android APK: `npx eas build --platform android --profile preview`
