# App Shortcuts + Auto-Categorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Android long-press app shortcuts (Voice Capture, Paste Capture) and background LLM auto-categorization of captures via Haiku.

**Architecture:** Two independent features sharing no code. Feature 1 adds expo-quick-actions shortcuts that deep-link into the existing CaptureScreen with action params. Feature 2 adds a `waitUntil()` background function in the Worker that calls Haiku to classify captures into Type/Tags, using few-shot examples pulled from the user's Notion captures (cached daily).

**Tech Stack:** expo-quick-actions, expo-clipboard, Anthropic Claude 3.5 Haiku (tool_use), Notion API (query + patch)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `app/_layout.tsx` | Modify | Register quick action shortcuts, enable routing |
| `app/index.tsx` | Modify | Handle action params on mount (voice/paste), track chipsTouched ref |
| `services/api.ts` | Modify | Add `autoClassify` to CapturePayload |
| `worker/src/index.ts` | Modify | Add autoClassify function, few-shot cache, Notion query, Haiku call, page PATCH |
| `app.json` | Modify | Add expo-quick-actions config plugin |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`
- Modify: `app.json`

- [ ] **Step 1: Install expo-quick-actions and expo-clipboard**

```bash
npx expo install expo-quick-actions expo-clipboard
```

- [ ] **Step 2: Add expo-quick-actions config plugin to app.json**

In `app.json`, add to the `plugins` array after `"expo-asset"`:

```json
"expo-quick-actions"
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app.json
git commit -m "chore: install expo-quick-actions and expo-clipboard"
```

---

## Task 2: Register shortcuts in layout

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Add shortcut registration**

Replace the entire contents of `app/_layout.tsx` with:

```tsx
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ShareIntentProvider } from "expo-share-intent";
import { KeyboardProvider } from "react-native-keyboard-controller";
import * as QuickActions from "expo-quick-actions";
import { useQuickActionRouting } from "expo-quick-actions/router";
import { colors } from "@/theme";

export default function RootLayout() {
  useQuickActionRouting();

  useEffect(() => {
    QuickActions.setItems([
      {
        id: "voice",
        title: "Voice Capture",
        icon: "symbol:mic.fill",
        params: { href: "/?action=voice" },
      },
      {
        id: "paste",
        title: "Paste Capture",
        icon: "symbol:doc.on.clipboard",
        params: { href: "/?action=paste" },
      },
    ]);
  }, []);

  return (
    <KeyboardProvider>
      <ShareIntentProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg.base },
          }}
        />
      </ShareIntentProvider>
    </KeyboardProvider>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: register Voice Capture and Paste Capture shortcuts"
```

---

## Task 3: Handle shortcut actions in CaptureScreen

**Files:**
- Modify: `app/index.tsx`

- [ ] **Step 1: Add imports**

At the top of `app/index.tsx`, add these imports:

```tsx
import { useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
```

- [ ] **Step 2: Read action param and trigger on mount**

Inside `CaptureScreen()`, after the existing `dictatingRef` and `recordingRef` declarations (around line 61), add:

```tsx
const { action } = useLocalSearchParams<{ action?: string }>();
```

Then add a new effect after the keyboard tracking effect (after line 89):

```tsx
// ── Shortcut action handling ────────────────────────────
useEffect(() => {
  if (!action) return;
  const timer = setTimeout(async () => {
    if (action === "voice") {
      handleDictationToggle();
    } else if (action === "paste") {
      const clip = await Clipboard.getStringAsync();
      if (clip) setText((prev) => prev + (prev ? "\n" : "") + clip);
    }
  }, 300); // Small delay to let the screen mount
  return () => clearTimeout(timer);
}, [action]);
```

The 300ms delay ensures the screen is fully mounted before triggering dictation (which needs audio permissions) or clipboard access.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Test on device**

Build and install dev build:

```bash
npx expo run:android
```

Test:
1. Long-press the app icon on the home screen — two shortcuts should appear
2. "Voice Capture" — app opens, dictation starts automatically
3. "Paste Capture" — copy some text first, then use the shortcut — text appears in the input box

- [ ] **Step 5: Commit**

```bash
git add app/index.tsx
git commit -m "feat: handle Voice Capture and Paste Capture shortcut actions"
```

---

## Task 4: Add autoClassify flag to app payload

**Files:**
- Modify: `services/api.ts`
- Modify: `app/index.tsx`

- [ ] **Step 1: Add autoClassify to CapturePayload**

In `services/api.ts`, add `autoClassify` to the `CapturePayload` interface (after `nextStep` on line 33):

```tsx
  nextStep?: string;
  autoClassify?: boolean;
```

- [ ] **Step 2: Add chipsTouched ref in CaptureScreen**

In `app/index.tsx`, after the `typeManuallySet` ref (around line 122), add:

```tsx
const chipsTouched = useRef(false);
```

- [ ] **Step 3: Set chipsTouched when user taps Type or Tag**

In `handleTypeSelect` (around line 124), add after `typeManuallySet.current = true;`:

```tsx
chipsTouched.current = true;
```

In the `toggleTag` callback (around line 464), add at the start of the function body:

```tsx
chipsTouched.current = true;
```

- [ ] **Step 4: Reset chipsTouched in resetForm**

In `resetForm()` (around line 474), add after `typeManuallySet.current = false;`:

```tsx
chipsTouched.current = false;
```

- [ ] **Step 5: Pass autoClassify in handleSave payload**

In `handleSave()`, in the payload construction (around line 413-419), add `autoClassify`:

```tsx
const payload: CapturePayload = {
  title,
  notes: content,
  type,
  tags,
  priority: "🟢 Low",
  autoClassify: !chipsTouched.current,
};
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add services/api.ts app/index.tsx
git commit -m "feat: send autoClassify flag when user skips chip selection"
```

---

## Task 5: Add autoClassify to Worker CaptureData interface

**Files:**
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Update CaptureData interface**

In `worker/src/index.ts`, find the `CaptureData` interface (around line 593) and add `autoClassify`:

```tsx
interface CaptureData {
  title: string;
  notes: string;
  type: string;
  tags: string[];
  priority: string;
  connectedTo?: string;
  nextStep?: string;
  autoClassify?: boolean;
}
```

- [ ] **Step 2: Verify Worker TypeScript compiles**

```bash
cd worker && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add worker/src/index.ts
git commit -m "feat(worker): add autoClassify to CaptureData interface"
```

---

## Task 6: Implement few-shot example cache

**Files:**
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Add cache variables and fetch function**

At the top of `worker/src/index.ts`, after the existing constants (after `const NOTION_API_VERSION` and `CAPTURES_DATABASE_ID`), add:

```tsx
// ── Auto-categorization cache ──────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
let cachedExamples: string = "";
let cacheTimestamp: number = 0;

async function fetchFewShotExamples(env: Env): Promise<string> {
  if (cachedExamples && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedExamples;
  }

  try {
    const res = await fetch(
      `https://api.notion.com/v1/databases/${CAPTURES_DATABASE_ID}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.NOTION_API_KEY}`,
          "Notion-Version": NOTION_API_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: {
            and: [
              { property: "Type", select: { is_not_empty: true } },
              { property: "Tags", multi_select: { is_not_empty: true } },
              { property: "Notes", rich_text: { is_not_empty: true } },
            ],
          },
          sorts: [{ property: "Date Captured", direction: "descending" }],
          page_size: 20,
        }),
      }
    );

    if (!res.ok) {
      console.error("[autoClassify] Notion query failed:", await res.text());
      return cachedExamples; // Return stale cache on failure
    }

    const data = await res.json<{
      results: Array<{
        properties: {
          Type: { select: { name: string } | null };
          Tags: { multi_select: Array<{ name: string }> };
          Notes: { rich_text: Array<{ plain_text: string }> };
        };
      }>;
    }>();

    // Pick one example per Type (up to 8) for taxonomy coverage
    const seenTypes = new Set<string>();
    const examples: string[] = [];

    for (const page of data.results) {
      const type = page.properties.Type?.select?.name;
      const tags = page.properties.Tags?.multi_select?.map((t) => t.name) ?? [];
      const notes = page.properties.Notes?.rich_text?.map((t) => t.plain_text).join("") ?? "";

      if (!type || !notes || seenTypes.has(type)) continue;
      seenTypes.add(type);

      const preview = notes.length > 120 ? notes.slice(0, 117) + "..." : notes;
      examples.push(
        `Capture: "${preview}"\n→ {"type": "${type}", "tags": ${JSON.stringify(tags)}}`
      );

      if (examples.length >= 8) break;
    }

    cachedExamples = examples.join("\n\n");
    cacheTimestamp = Date.now();
    console.log(`[autoClassify] Cached ${examples.length} few-shot examples`);
    return cachedExamples;
  } catch (err) {
    console.error("[autoClassify] Failed to fetch examples:", err);
    return cachedExamples; // Return stale cache on failure
  }
}
```

- [ ] **Step 2: Verify Worker TypeScript compiles**

```bash
cd worker && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add worker/src/index.ts
git commit -m "feat(worker): add daily-cached few-shot example fetcher from Notion"
```

---

## Task 7: Implement autoClassify function

**Files:**
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Add the autoClassify function**

After the `fetchFewShotExamples` function, add:

```tsx
async function autoClassify(
  env: Env,
  capturePageId: string,
  captureText: string
): Promise<void> {
  try {
    const examples = await fetchFewShotExamples(env);

    const systemPrompt = `You classify short text captures into Type and Tags for a personal note-taking app.

Types (pick exactly one):
- Observation: noticing something in the world
- Moment: a personal experience worth remembering
- Idea: a thought about something to create or try
- Emotion: a feeling or emotional state
- Overheard: something someone else said
- Image/Scene: a visual description
- Question: something to look into later
- Dream: a dream or aspiration

Tags (pick zero or more, only if clearly relevant):
Daughters, School, Writing Material, Gut Health, Attachment, House/Property, Meditation, Reading, Nature

${examples ? `Examples from recent captures:\n\n${examples}` : ""}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 128,
        system: systemPrompt,
        tools: [
          {
            name: "classify_capture",
            description: "Classify a text capture into type and tags",
            input_schema: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "Observation", "Moment", "Idea", "Emotion",
                    "Overheard", "Image/Scene", "Question", "Dream",
                  ],
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: [
                      "Daughters", "School", "Writing Material", "Gut Health",
                      "Attachment", "House/Property", "Meditation", "Reading", "Nature",
                    ],
                  },
                },
              },
              required: ["type", "tags"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "classify_capture" },
        messages: [
          {
            role: "user",
            content: `Classify this capture:\n\n"${captureText}"`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error("[autoClassify] Haiku API error:", await res.text());
      return;
    }

    const result = await res.json<{
      content: Array<{ type: string; input?: { type: string; tags: string[] } }>;
    }>();

    const toolUse = result.content?.find((c) => c.type === "tool_use");
    if (!toolUse?.input) {
      console.error("[autoClassify] No tool_use in response");
      return;
    }

    const { type, tags } = toolUse.input;
    console.log(`[autoClassify] Result: type="${type}", tags=${JSON.stringify(tags)}`);

    // PATCH the Notion page with classified Type and Tags
    const patchRes = await fetch(`https://api.notion.com/v1/pages/${capturePageId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${env.NOTION_API_KEY}`,
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          Type: { select: { name: type } },
          Tags: { multi_select: tags.map((t: string) => ({ name: t })) },
        },
      }),
    });

    if (!patchRes.ok) {
      console.error("[autoClassify] Notion PATCH failed:", await patchRes.text());
    }
  } catch (err) {
    console.error("[autoClassify] Failed:", err);
    // Non-fatal — the capture itself already succeeded
  }
}
```

- [ ] **Step 2: Verify Worker TypeScript compiles**

```bash
cd worker && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add worker/src/index.ts
git commit -m "feat(worker): add autoClassify — Haiku classification with Notion PATCH"
```

---

## Task 8: Wire autoClassify into capture handlers

**Files:**
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Trigger autoClassify in handleCapture**

In `handleCapture()` (around line 104-111), add the autoClassify trigger after the existing backgroundResearch trigger:

```tsx
  const result = await createNotionCapture(env, body);

  // Trigger background research for Lookup captures
  if (body.type === "Lookup" && body.notes) {
    ctx.waitUntil(backgroundResearch(env, result.id, body.notes));
  }

  // Trigger background auto-categorization if user didn't set chips
  if (body.autoClassify && body.notes) {
    ctx.waitUntil(autoClassify(env, result.id, body.notes));
  }

  return json(result);
```

- [ ] **Step 2: Trigger autoClassify in handleMultiCapture**

Find the similar backgroundResearch trigger in `handleMultiCapture()` (around line 211-212) and add the autoClassify trigger after it:

```tsx
  // Trigger background auto-categorization if user didn't set chips
  if (payload.autoClassify && (payload.notes || transcription)) {
    const classifyText = payload.notes || transcription || "";
    ctx.waitUntil(autoClassify(env, result.id, classifyText));
  }
```

- [ ] **Step 3: Verify Worker TypeScript compiles**

```bash
cd worker && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Deploy and test**

```bash
cd worker && wrangler deploy
```

Test: Open the app, type a capture like "Maya said something hilarious at dinner about trees being patient", don't touch any chips, and save. Check the Notion page — within a few seconds, Type should update to "Overheard" and Tags should include "Daughters".

- [ ] **Step 5: Commit**

```bash
git add worker/src/index.ts
git commit -m "feat(worker): wire autoClassify into capture and capture-multi handlers"
```

---

## Task 9: Push and verify

- [ ] **Step 1: Run full TypeScript check**

```bash
npx tsc --noEmit && cd worker && npx tsc --noEmit
```

Expected: both clean

- [ ] **Step 2: Push all commits**

```bash
git push
```

- [ ] **Step 3: End-to-end verification**

1. Long-press app icon → two shortcuts visible
2. "Voice Capture" → app opens, dictation starts
3. "Paste Capture" → app opens, clipboard text appears
4. Type text without touching chips → save → Notion page gets auto-categorized within seconds
5. Type text, manually pick Type/Tags → save → Notion page keeps user's choices (no auto-classify)
