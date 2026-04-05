import { File, Paths } from 'expo-file-system';

// Constants
const MAX_DURATION_SECONDS = 60;
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2; // 16-bit PCM
const CHANNELS = 1;
const MAX_BYTES = MAX_DURATION_SECONDS * SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS; // 1,920,000

// Rolling buffer state
let chunks: ArrayBuffer[] = [];
let totalBytes = 0;

/**
 * Adds a PCM audio chunk to the rolling buffer.
 * If the total size would exceed MAX_BYTES, oldest chunks are trimmed first.
 */
export function appendChunk(chunk: ArrayBuffer): void {
  // Trim oldest chunks until there is room for the new one
  while (totalBytes + chunk.byteLength > MAX_BYTES && chunks.length > 0) {
    const removed = chunks.shift()!;
    totalBytes -= removed.byteLength;
  }

  chunks.push(chunk);
  totalBytes += chunk.byteLength;
}

/**
 * Resets the buffer, discarding all accumulated audio data.
 */
export function clearBuffer(): void {
  chunks = [];
  totalBytes = 0;
}

/**
 * Returns the current total number of bytes stored in the buffer.
 */
export function getBufferSize(): number {
  return totalBytes;
}

/**
 * Concatenates all buffered PCM chunks, prepends a 44-byte WAV header,
 * writes the result to a temp file, and returns the file URI.
 * Returns null if the buffer is empty.
 * Clears the buffer after saving.
 */
export async function saveBufferAsWav(): Promise<string | null> {
  if (chunks.length === 0 || totalBytes === 0) {
    return null;
  }

  const dataSize = totalBytes;
  const fileSize = 44 + dataSize; // header + PCM data

  // Allocate output buffer: 44-byte WAV header + raw PCM data
  const output = new ArrayBuffer(fileSize);
  const view = new DataView(output);

  // --- WAV header (44 bytes, little-endian) ---
  // Bytes 0-3: "RIFF"
  writeString(view, 0, 'RIFF');
  // Bytes 4-7: file size minus 8
  view.setUint32(4, fileSize - 8, true);
  // Bytes 8-11: "WAVE"
  writeString(view, 8, 'WAVE');
  // Bytes 12-15: "fmt "
  writeString(view, 12, 'fmt ');
  // Bytes 16-19: 16 (PCM fmt chunk size)
  view.setUint32(16, 16, true);
  // Bytes 20-21: 1 (PCM format)
  view.setUint16(20, 1, true);
  // Bytes 22-23: channels
  view.setUint16(22, CHANNELS, true);
  // Bytes 24-27: sample rate
  view.setUint32(24, SAMPLE_RATE, true);
  // Bytes 28-31: byte rate = sample_rate * bytes_per_sample * channels
  view.setUint32(28, SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS, true);
  // Bytes 32-33: block align = bytes_per_sample * channels
  view.setUint16(32, BYTES_PER_SAMPLE * CHANNELS, true);
  // Bytes 34-35: bits per sample
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true);
  // Bytes 36-39: "data"
  writeString(view, 36, 'data');
  // Bytes 40-43: data size
  view.setUint32(40, dataSize, true);

  // Copy all PCM chunks into output starting at offset 44
  const outputBytes = new Uint8Array(output);
  let offset = 44;
  for (const chunk of chunks) {
    outputBytes.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }

  // Write WAV to cache directory
  const timestamp = Date.now();
  const file = new File(Paths.cache, `audio-capture-${timestamp}.wav`);
  file.create();
  // Write raw bytes via base64 string
  const base64 = arrayBufferToBase64(output);
  file.write(base64, { encoding: "base64" });

  // Clear buffer after successful save
  clearBuffer();

  return file.uri;
}

// --- Private helpers ---

/**
 * Writes an ASCII string into a DataView at the given byte offset.
 */
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Converts an ArrayBuffer to a base64-encoded string.
 * Works in React Native (no atob/btoa for binary, so we use charCodeAt).
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chars: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    chars.push(String.fromCharCode(bytes[i]));
  }
  // btoa is available in React Native's Hermes engine
  return btoa(chars.join(''));
}
