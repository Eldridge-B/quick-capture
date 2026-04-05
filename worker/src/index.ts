/**
 * Quick Capture — Cloudflare Worker Backend
 *
 * Endpoints:
 *   POST /capture       — Text-only capture → Notion
 *   POST /capture-multi — Multipart capture (text + images + audio) → Notion
 *   GET  /health        — Health check
 *
 * Features:
 *   - Images stored in R2, embedded in Notion page body
 *   - Audio transcribed via Deepgram Nova-2 (with optional diarization)
 *   - "Lookup" type captures trigger background research via Anthropic API
 *   - All endpoints require Bearer token auth
 *
 * Secrets (set via `wrangler secret put`):
 *   NOTION_API_KEY     — Notion internal integration token
 *   DEEPGRAM_API_KEY   — Deepgram API key (Nova-2 model)
 *   CAPTURE_SECRET     — Shared secret for app ↔ worker auth
 *   ANTHROPIC_API_KEY  — Anthropic API key (for background research on Lookup captures)
 */

interface Env {
  NOTION_API_KEY: string;
  DEEPGRAM_API_KEY: string;
  CAPTURE_SECRET: string;
  ANTHROPIC_API_KEY: string;
  AUDIO_BUCKET?: R2Bucket;
  IMAGE_BUCKET?: R2Bucket;
}

const CAPTURES_DATABASE_ID = "c0213ae5-93d9-4fd8-828b-3c05acf22413";
const NOTION_API_VERSION = "2022-06-28";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── Entry point ─────────────────────────────────────────────

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Auth
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${env.CAPTURE_SECRET}`) {
      return json({ error: "Unauthorized" }, 401);
    }

    const path = new URL(request.url).pathname;

    try {
      switch (path) {
        case "/health":
          return json({ status: "ok", timestamp: new Date().toISOString() });
        case "/capture":
          return handleCapture(request, env, ctx);
        case "/capture-multi":
          return handleMultiCapture(request, env, ctx);
        default:
          return json({ error: "Not found" }, 404);
      }
    } catch (err: any) {
      console.error("Worker error:", err);
      return json({ error: err.message || "Internal error" }, 500);
    }
  },
};

// ── POST /capture ───────────────────────────────────────────

async function handleCapture(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const body = await request.json<CaptureData>();

  if (!body.title && !body.notes) {
    return json({ error: "title or notes required" }, 400);
  }

  const result = await createNotionCapture(env, body);

  // Trigger background research for Lookup captures
  if (body.type === "Lookup" && body.notes) {
    ctx.waitUntil(backgroundResearch(env, result.id, body.notes));
  }

  return json(result);
}

// ── POST /capture-multi ─────────────────────────────────────

async function handleMultiCapture(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const formData = await request.formData();
  const payloadStr = formData.get("payload") as string | null;

  if (!payloadStr) {
    return json({ error: "payload is required" }, 400);
  }

  const payload = JSON.parse(payloadStr) as CaptureData;

  // ── Process images ──────────────────────────────────────
  const imageUrls: string[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("image_") && value instanceof File) {
      const imageUrl = await storeImage(env, value);
      if (imageUrl) imageUrls.push(imageUrl);
    }
  }

  // ── Process audio ───────────────────────────────────────
  const audioFile = formData.get("audio") as File | null;
  let transcription: string | null = null;
  let audioUrl: string | undefined;

  if (audioFile) {
    // Check for diarize flag in payload
    const diarize = (payload as any).diarize === true;

    // Store audio if bucket available
    if (env.AUDIO_BUCKET) {
      const key = `voice-notes/${Date.now()}-${audioFile.name}`;
      await env.AUDIO_BUCKET.put(key, audioFile.stream(), {
        httpMetadata: { contentType: audioFile.type },
      });
      audioUrl = key;
    }

    // Transcribe
    transcription = await transcribeAudio(env, audioFile, diarize);
  }

  // ── Build final notes ───────────────────────────────────
  let finalNotes = payload.notes || "";

  if (transcription) {
    if (finalNotes) {
      finalNotes += "\n\n---\n\n";
    }
    finalNotes += `🎙 Voice note:\n${transcription}`;
  }

  // Update title if it was a voice-only capture
  if (!payload.notes && transcription) {
    const trimmed =
      transcription.length > 57
        ? transcription.substring(0, 54) + "..."
        : transcription;
    payload.title = `🎙 ${trimmed}`;
  }

  payload.notes = finalNotes;

  // ── Build page body content (for images) ────────────────
  let pageContent = "";
  if (imageUrls.length > 0) {
    pageContent = imageUrls
      .map((url) => `![Capture image](${url})`)
      .join("\n\n");
  }
  if (audioUrl) {
    pageContent += `\n\n> 🎙 Audio stored: \`${audioUrl}\``;
  }

  const result = await createNotionCapture(env, payload, pageContent);

  // Background research for Lookup captures
  if (payload.type === "Lookup" && finalNotes) {
    ctx.waitUntil(backgroundResearch(env, result.id, finalNotes));
  }

  return json(result);
}

// ── Deepgram transcription ──────────────────────────────────

async function transcribeAudio(
  env: Env,
  audioFile: File,
  diarize = false
): Promise<string | null> {
  const audioBuffer = await audioFile.arrayBuffer();

  const params = new URLSearchParams({
    model: "nova-2",
    language: "en",
    smart_format: "true",
    punctuate: "true",
    diarize: diarize ? "true" : "false",
    filler_words: "false",
  });

  const dgRes = await fetch(
    `https://api.deepgram.com/v1/listen?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        "Content-Type": audioFile.type || "audio/m4a",
      },
      body: audioBuffer,
    }
  );

  if (!dgRes.ok) {
    const errBody = await dgRes.text();
    console.error("Deepgram error:", errBody);
    return null;
  }

  const result = await dgRes.json<{
    results: {
      channels: Array<{
        alternatives: Array<{ transcript: string; confidence: number }>;
      }>;
    };
  }>();

  return result.results?.channels?.[0]?.alternatives?.[0]?.transcript || null;
}

// ── Image storage ───────────────────────────────────────────

async function storeImage(env: Env, file: File): Promise<string | null> {
  if (!env.IMAGE_BUCKET) {
    console.warn("No IMAGE_BUCKET configured — image not stored");
    return null;
  }

  const ext = file.name.split(".").pop() || "jpg";
  const key = `captures/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  await env.IMAGE_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Return the public URL — requires R2 public access or custom domain
  // Update this to match your R2 public URL pattern
  return `https://YOUR_R2_PUBLIC_DOMAIN/${key}`;
}

// ── Background research (Anthropic API) ─────────────────────

async function backgroundResearch(
  env: Env,
  capturePageId: string,
  captureText: string
): Promise<void> {
  try {
    // Call Claude to research the reference
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: `You are a research assistant. The user captured a quick note while busy (likely driving, walking, etc.) and needs you to find the reference they're describing.

Your job:
1. Identify what they're looking for (podcast episode, article, book passage, etc.)
2. Provide the most likely source with a URL if possible
3. If they mentioned a specific quote or passage, try to find or reconstruct it
4. Be concise — this will be appended to a Notion capture.

Format your response as:
**Source:** [what you found]
**URL:** [link if available]
**Relevant passage/info:** [the specific content they were looking for]
**Confidence:** [High/Medium/Low — how sure you are this is the right reference]`,
        messages: [
          {
            role: "user",
            content: `Find the reference described in this quick capture note:\n\n${captureText}`,
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      console.error("Anthropic API error:", await claudeRes.text());
      return;
    }

    const claudeResult = await claudeRes.json<{
      content: Array<{ type: string; text?: string }>;
    }>();

    const researchText =
      claudeResult.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n") || "";

    if (!researchText) return;

    // Append research results to the Notion page
    // We use the Notion API to append a block to the page
    await fetch(
      `https://api.notion.com/v1/blocks/${capturePageId}/children`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${env.NOTION_API_KEY}`,
          "Notion-Version": NOTION_API_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          children: [
            {
              object: "block",
              type: "divider",
              divider: {},
            },
            {
              object: "block",
              type: "heading_3",
              heading_3: {
                rich_text: [
                  { type: "text", text: { content: "🔍 Research Results" } },
                ],
              },
            },
            {
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [
                  {
                    type: "text",
                    text: { content: researchText.slice(0, 2000) },
                  },
                ],
              },
            },
            {
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [
                  {
                    type: "text",
                    text: {
                      content: `— Auto-researched at ${new Date().toISOString().split("T")[0]}`,
                    },
                    annotations: { italic: true, color: "gray" },
                  },
                ],
              },
            },
          ],
        }),
      }
    );

    // Update the Next Step field to indicate research is done
    await fetch(`https://api.notion.com/v1/pages/${capturePageId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${env.NOTION_API_KEY}`,
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          "Next Step": {
            rich_text: [
              {
                type: "text",
                text: {
                  content: "Review research results — verify accuracy",
                },
              },
            ],
          },
        },
      }),
    });
  } catch (err) {
    console.error("Background research failed:", err);
    // Non-fatal — the capture itself already succeeded
  }
}

// ── Notion capture creation ─────────────────────────────────

interface CaptureData {
  title: string;
  notes: string;
  type: string;
  tags: string[];
  priority: string;
  connectedTo?: string;
  nextStep?: string;
}

async function createNotionCapture(
  env: Env,
  data: CaptureData,
  pageContent?: string
): Promise<{ id: string; url: string }> {
  const today = new Date().toISOString().split("T")[0];

  const properties: Record<string, any> = {
    Capture: { title: [{ text: { content: data.title || "Untitled" } }] },
    Type: { select: { name: data.type || "Idea" } },
    Priority: { select: { name: data.priority || "🟢 Low" } },
    Notes: {
      rich_text: [{ text: { content: (data.notes || "").slice(0, 2000) } }],
    },
    "Date Captured": { date: { start: today } },
  };

  if (data.tags && data.tags.length > 0) {
    properties.Tags = {
      multi_select: data.tags.map((t) => ({ name: t })),
    };
  }

  if (data.connectedTo) {
    properties["Connected To"] = {
      rich_text: [{ text: { content: data.connectedTo } }],
    };
  }

  if (data.nextStep) {
    properties["Next Step"] = {
      rich_text: [{ text: { content: data.nextStep } }],
    };
  }

  const body: Record<string, any> = {
    parent: { database_id: CAPTURES_DATABASE_ID },
    properties,
  };

  // If there's page content (images, etc.), add it as blocks
  if (pageContent) {
    body.children = pageContent.split("\n\n").map((block) => {
      if (block.startsWith("![")) {
        // Image block
        const urlMatch = block.match(/\((.*?)\)/);
        if (urlMatch) {
          return {
            object: "block",
            type: "image",
            image: {
              type: "external",
              external: { url: urlMatch[1] },
            },
          };
        }
      }
      // Text/quote block
      return {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: block } }],
        },
      };
    });
  }

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.NOTION_API_KEY}`,
      "Notion-Version": NOTION_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error("Notion API error:", errBody);
    throw new Error(`Notion API error (${res.status}): ${errBody}`);
  }

  const page = await res.json<{ id: string; url: string }>();
  return { id: page.id, url: page.url };
}

// ── Utilities ───────────────────────────────────────────────

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
