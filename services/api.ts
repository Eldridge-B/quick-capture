/**
 * API client for the Quick Capture backend (Cloudflare Worker).
 *
 * Handles text captures, multi-attachment captures (image + audio),
 * and background research triggers.
 */
import type { Attachment } from "@/components/AttachmentBar";

const API_BASE = __DEV__
  ? "http://10.0.2.2:8787" // Android emulator → host machine
  : "https://quick-capture-worker.YOUR_SUBDOMAIN.workers.dev"; // ← replace after deploy

/**
 * Shared secret for authenticating with the worker.
 * Must match the CAPTURE_SECRET set on the worker via `wrangler secret put`.
 */
const CAPTURE_SECRET = "REPLACE_WITH_YOUR_SECRET"; // ← replace before building

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

export interface CaptureResult {
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

// ── Health check ────────────────────────────────────────────

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      headers: AUTH_HEADERS,
    });
    return res.ok;
  } catch {
    return false;
  }
}
