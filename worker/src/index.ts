/**
 * Quick Capture — Cloudflare Worker Backend
 *
 * Endpoints:
 *   POST /capture       — Text-only capture → Notion
 *   POST /capture-multi — Multipart capture (text + images + audio) → Notion
 *   GET  /health        — Health check
 *   WS   /ws/dictate    — WebSocket proxy to Deepgram streaming transcription
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

const CAPTURES_DATABASE_ID = "7c8ea33e74c648988981053dc46b8cde";
const NOTION_API_VERSION = "2022-06-28";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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
      return cachedExamples;
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
    return cachedExamples;
  }
}

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
  }
}

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

    // Auth — support both Authorization header and ?token= query param (for WebSocket upgrades)
    const authHeader = request.headers.get("Authorization");
    const url = new URL(request.url);
    const authParam = url.searchParams.get("token");
    const token = authHeader?.replace("Bearer ", "") || authParam;

    if (token !== env.CAPTURE_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    const path = url.pathname;

    try {
      switch (path) {
        case "/health":
          return json({ status: "ok", timestamp: new Date().toISOString() });
        case "/capture":
          return handleCapture(request, env, ctx);
        case "/capture-multi":
          return handleMultiCapture(request, env, ctx);
        case "/ws/dictate":
          return handleDictateWebSocket(request, env, ctx);
        case "/transcribe":
          return handleTranscribe(request, env);
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
  let imageCount = 0;
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("image_") && typeof value === "object" && "arrayBuffer" in value) {
      imageCount++;
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
    console.log(`[capture-multi] ${imageUrls.length} image(s) stored:`, imageUrls);
    pageContent = imageUrls
      .map((url) => `![Capture image](${url})`)
      .join("\n\n");
  } else if (imageCount > 0) {
    // Images were attached but R2 not configured — note it
    const note = imageCount === 1 ? "1 image attached (storage not configured)" : `${imageCount} images attached (storage not configured)`;
    if (payload.notes) {
      payload.notes += `\n\n📷 ${note}`;
    } else {
      payload.notes = `📷 ${note}`;
    }
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

// ── POST /transcribe — audio in, text out ──────────────────

async function handleTranscribe(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err: any) {
    console.error("[transcribe] Failed to parse formData:", err.message);
    return json({ error: "Invalid multipart body" }, 400);
  }

  const audioFile = formData.get("audio") as File | null;

  if (!audioFile) {
    console.error("[transcribe] No audio file in formData. Keys:", [...formData.keys()]);
    return json({ error: "audio file required" }, 400);
  }

  console.log(`[transcribe] Received: ${audioFile.name}, ${audioFile.type}, ${audioFile.size} bytes`);

  const transcript = await transcribeAudio(env, audioFile, false);
  return json({ transcript: transcript || "" });
}

// ── Deepgram transcription ──────────────────────────────────

async function transcribeAudio(
  env: Env,
  audioFile: File,
  diarize = false
): Promise<string | null> {
  const audioBuffer = await audioFile.arrayBuffer();

  console.log(`[transcribe] File: ${audioFile.name}, type: ${audioFile.type}, size: ${audioBuffer.byteLength} bytes`);

  const params = new URLSearchParams({
    model: "nova-2",
    language: "en",
    smart_format: "true",
    punctuate: "true",
    diarize: diarize ? "true" : "false",
    filler_words: "false",
  });

  // Let Deepgram auto-detect format if type is missing or generic
  const contentType = audioFile.type || "audio/mp4";

  const dgRes = await fetch(
    `https://api.deepgram.com/v1/listen?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        "Content-Type": contentType,
      },
      body: audioBuffer,
    }
  );

  if (!dgRes.ok) {
    const errBody = await dgRes.text();
    console.error("[transcribe] Deepgram error:", errBody);
    return null;
  }

  const result = await dgRes.json<{
    results: {
      channels: Array<{
        alternatives: Array<{ transcript: string; confidence: number }>;
      }>;
    };
  }>();

  const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || null;
  console.log(`[transcribe] Result: "${transcript?.slice(0, 100) ?? "(empty)"}"`);
  return transcript;
}

// ── WebSocket dictation proxy ──────────────────────────────

async function handleDictateWebSocket(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const upgradeHeader = request.headers.get("Upgrade");
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
    return json({ error: "Expected WebSocket upgrade" }, 426);
  }

  const [client, server] = Object.values(new WebSocketPair());
  server.accept();

  // Queue messages from client until Deepgram is ready
  const pendingMessages: (string | ArrayBuffer)[] = [];
  let deepgram: WebSocket | null = null;
  let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  let dgReady = false;

  // Buffer client messages until Deepgram connects
  server.addEventListener("message", (event) => {
    if (dgReady && deepgram) {
      const data = event.data;
      if (typeof data === "string") {
        try {
          const msg = JSON.parse(data);
          if (msg.type === "CloseStream") {
            deepgram.send(JSON.stringify({ type: "CloseStream" }));
            return;
          }
        } catch { /* not JSON */ }
      }
      deepgram.send(data);
    } else {
      pendingMessages.push(event.data);
    }
  });

  server.addEventListener("close", () => cleanup());
  server.addEventListener("error", () => cleanup());

  function cleanup() {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
    try { deepgram?.close(); } catch { /* ignore */ }
    deepgram = null;
    try { server.close(); } catch { /* ignore */ }
  }

  // Connect to Deepgram in the background (after returning the Response)
  ctx.waitUntil((async () => {
    try {
      const dgParams = new URLSearchParams({
        model: "nova-2",
        language: "en",
        smart_format: "true",
        punctuate: "true",
        interim_results: "true",
        endpointing: "300",
        utterance_end_ms: "1000",
      });

      const dgUrl = `https://api.deepgram.com/v1/listen?${dgParams.toString()}`;

      console.log("[dictate] Connecting to Deepgram...");
      const dgRes = await fetch(dgUrl, {
        headers: {
          Upgrade: "websocket",
          Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        },
      });

      deepgram = (dgRes as any).webSocket as WebSocket;
      if (!deepgram) {
        throw new Error("Deepgram did not return a WebSocket");
      }
      deepgram.accept();
      console.log("[dictate] Deepgram connected");

      // Flush any messages that arrived while connecting
      dgReady = true;
      for (const msg of pendingMessages) {
        deepgram.send(msg);
      }
      pendingMessages.length = 0;

      // KeepAlive every 8 seconds
      keepAliveInterval = setInterval(() => {
        try { deepgram?.send(JSON.stringify({ type: "KeepAlive" })); } catch { /* ignore */ }
      }, 8000);

      // Deepgram → client
      deepgram.addEventListener("message", (event) => {
        try { server.send(typeof event.data === "string" ? event.data : event.data); }
        catch { /* client disconnected */ }
      });

      deepgram.addEventListener("error", () => {
        try { server.send(JSON.stringify({ type: "error", message: "Deepgram error" })); }
        catch { /* ignore */ }
        cleanup();
      });

      deepgram.addEventListener("close", () => cleanup());

    } catch (err: any) {
      console.error("[dictate] Deepgram connection failed:", err);
      try {
        server.send(JSON.stringify({ type: "error", message: `Deepgram unavailable: ${err.message}` }));
        server.close(1011, "Deepgram connection failed");
      } catch { /* ignore */ }
    }
  })());

  // Return immediately — client WebSocket is live, Deepgram connects in background
  return new Response(null, { status: 101, webSocket: client });
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
  return `https://pub-db0b292ea5ba47e0b2020c98b6adfbe1.r2.dev/${key}`;
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
  autoClassify?: boolean;
}

async function createNotionCapture(
  env: Env,
  data: CaptureData,
  pageContent?: string
): Promise<{ id: string; url: string }> {
  // Use America/Los_Angeles to match user's timezone
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

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
