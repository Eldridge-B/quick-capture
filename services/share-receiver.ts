/**
 * Handle incoming share intents on Android.
 *
 * Uses expo-share-intent to read ACTION_SEND extras (text, URLs, images)
 * that expo-linking cannot access.
 */
import { ShareIntent } from "expo-share-intent";

interface SharedContent {
  text?: string;
  url?: string;
  imageUri?: string;
  type: "text" | "url" | "image" | "unknown";
}

/**
 * Convert an expo-share-intent ShareIntent into our SharedContent format.
 */
export function parseShareIntent(intent: ShareIntent): SharedContent | null {
  if (!intent.type) return null;

  // Image/media sharing
  if (
    (intent.type === "media" || intent.type === "file") &&
    intent.files?.length
  ) {
    const file = intent.files[0];
    const isImage = file.mimeType?.startsWith("image/");
    if (isImage) {
      return {
        imageUri: file.path,
        text: intent.text ?? undefined,
        type: "image",
      };
    }
  }

  // URL sharing
  if (intent.type === "weburl" && intent.webUrl) {
    return {
      url: intent.webUrl,
      text: intent.text ?? intent.webUrl,
      type: "url",
    };
  }

  // Text sharing (including highlighted text from apps like NYTimes)
  if (intent.type === "text" && intent.text) {
    // Check if the text contains a URL
    const urlMatch = intent.text.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      return {
        url: urlMatch[0],
        text: intent.text,
        type: "url",
      };
    }
    return { text: intent.text, type: "text" };
  }

  return null;
}
