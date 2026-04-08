/**
 * API client for the Quick Capture backend (Cloudflare Worker).
 *
 * Handles text captures, multi-attachment captures (image + audio),
 * and background research triggers.
 */
import type { Attachment } from "@/components/AttachmentBar";

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ??
  "https://quick-capture-worker.quick-capture-worker.workers.dev";

/**
 * Shared secret for authenticating with the worker.
 * Must match the CAPTURE_SECRET set on the worker via `wrangler secret put`.
 */
const CAPTURE_SECRET = process.env.EXPO_PUBLIC_CAPTURE_SECRET ?? "";
if (!CAPTURE_SECRET) {
  console.warn("CAPTURE_SECRET is not set — API calls will fail auth");
}

const AUTH_HEADERS = {
  Authorization: `Bearer ${CAPTURE_SECRET}`,
};

export interface CapturePayload {
  title: string;
  notes: string;
  type: string;
  tags: string[];
  priority: string;
  connectedTo?: string;
  nextStep?: string;
}

interface CaptureResult {
  id: string;
  url: string;
}

// ── Text-only capture ───────────────────────────────────────

export async function submitCapture(
  capture: CapturePayload
): Promise<CaptureResult> {
  const res = await fetch(`${API_BASE}/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...AUTH_HEADERS,
    },
    body: JSON.stringify(capture),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Capture failed (${res.status}): ${body}`);
  }

  return res.json();
}

// ── Multi-attachment capture (image + audio + text) ─────────

export async function submitMultiCapture(
  payload: CapturePayload,
  attachments: Attachment[]
): Promise<CaptureResult> {
  const formData = new FormData();

  // Text payload as JSON
  formData.append("payload", JSON.stringify(payload));

  // Attach files
  attachments.forEach((att, i) => {
    if (att.type === "audio") {
      formData.append("audio", {
        uri: att.uri,
        type: "audio/m4a",
        name: `voice-note-${i}.m4a`,
      } as any);
    } else if (att.type === "image") {
      // Determine image type from URI
      const ext = att.uri.split(".").pop()?.toLowerCase() || "jpg";
      const mimeType = ext === "png" ? "image/png" : "image/jpeg";
      formData.append(`image_${i}`, {
        uri: att.uri,
        type: mimeType,
        name: `capture-${i}.${ext}`,
      } as any);
    }
  });

  const res = await fetch(`${API_BASE}/capture-multi`, {
    method: "POST",
    headers: {
      ...AUTH_HEADERS,
      // Don't set Content-Type — fetch adds multipart boundary
    },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Multi-capture failed (${res.status}): ${body}`);
  }

  return res.json();
}

// ── Transcribe audio — returns text ─────────────────────────

export async function transcribeAudioFile(
  uri: string
): Promise<string> {
  const formData = new FormData();
  const ext = uri.split(".").pop()?.toLowerCase() || "m4a";
  const mimeType = ext === "wav" ? "audio/wav" : "audio/mp4";

  formData.append("audio", {
    uri,
    type: mimeType,
    name: `dictation.${ext}`,
  } as any);

  const res = await fetch(`${API_BASE}/transcribe`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Transcription failed (${res.status}): ${body}`);
  }

  const data = await res.json() as { transcript: string };
  return data.transcript;
}

// ── Health check ────────────────────────────────────────────

async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      headers: AUTH_HEADERS,
    });
    return res.ok;
  } catch {
    return false;
  }
}
