/**
 * Audio recording utilities using expo-av.
 */
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

let recording: Audio.Recording | null = null;

/**
 * Request microphone permission and prepare audio mode.
 */
export async function ensurePermissions(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  if (status !== "granted") return false;

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  return true;
}

/**
 * Start recording audio. Returns true if recording started successfully.
 */
export async function startRecording(): Promise<boolean> {
  try {
    if (recording) {
      await recording.stopAndUnloadAsync();
      recording = null;
    }

    const hasPermission = await ensurePermissions();
    if (!hasPermission) return false;

    const { recording: newRecording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );

    recording = newRecording;
    return true;
  } catch (err) {
    console.error("Failed to start recording:", err);
    return false;
  }
}

/**
 * Stop recording and return the URI of the recorded audio file.
 */
export async function stopRecording(): Promise<string | null> {
  try {
    if (!recording) return null;

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    recording = null;

    return uri;
  } catch (err) {
    console.error("Failed to stop recording:", err);
    recording = null;
    return null;
  }
}

/**
 * Check if currently recording.
 */
export function isRecording(): boolean {
  return recording !== null;
}

/**
 * Get the duration of a recorded audio file in seconds.
 */
export async function getAudioDuration(uri: string): Promise<number> {
  try {
    const { sound } = await Audio.Sound.createAsync({ uri });
    const status = await sound.getStatusAsync();
    await sound.unloadAsync();

    if (status.isLoaded && status.durationMillis) {
      return Math.round(status.durationMillis / 1000);
    }
    return 0;
  } catch {
    return 0;
  }
}
