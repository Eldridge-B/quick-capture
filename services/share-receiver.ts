/**
 * Handle incoming share intents on Android.
 *
 * Supports both text and image sharing from other apps.
 */
import * as Linking from "expo-linking";
import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system";

export interface SharedContent {
  text?: string;
  url?: string;
  imageUri?: string;
  type: "text" | "url" | "image" | "unknown";
}

/**
 * Parse the initial URL/intent that launched the app.
 * Call this on mount to check if the app was opened via a share intent.
 */
export async function getSharedContent(): Promise<SharedContent | null> {
  try {
    const url = await Linking.getInitialURL();
    if (!url) return null;

    return parseSharedUrl(url);
  } catch {
    return null;
  }
}

/**
 * Subscribe to incoming share intents while the app is running.
 */
export function onSharedContent(callback: (content: SharedContent) => void) {
  const subscription = Linking.addEventListener("url", (event) => {
    const content = parseSharedUrl(event.url);
    if (content) callback(content);
  });

  return () => subscription.remove();
}

function parseSharedUrl(url: string): SharedContent | null {
  if (!url) return null;

  // Image URIs (content:// on Android, file:// or ph:// on iOS)
  if (
    url.startsWith("content://") ||
    url.startsWith("file://") ||
    /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(url)
  ) {
    return { imageUri: url, type: "image" };
  }

  // Web URLs
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return { url, text: url, type: "url" };
  }

  // Plain text
  return { text: url, type: "text" };
}
