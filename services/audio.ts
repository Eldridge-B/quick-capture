/**
 * Audio recording utilities using expo-audio (SDK 55+).
 */
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  createAudioPlayer,
} from "expo-audio";

let recorder: InstanceType<typeof AudioModule.AudioRecorder> | null = null;

/**
 * Request microphone permission and prepare audio mode.
 */
async function ensurePermissions(): Promise<boolean> {
  const { granted } = await AudioModule.requestRecordingPermissionsAsync();
  if (!granted) return false;

  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
  });

  return true;
}

/**
 * Start recording audio. Returns true if recording started successfully.
 */
export async function startRecording(): Promise<boolean> {
  try {
    if (recorder) {
      recorder.release();
      recorder = null;
    }

    const hasPermission = await ensurePermissions();
    if (!hasPermission) return false;

    recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
    await recorder.prepareToRecordAsync();
    recorder.record();
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
    if (!recorder) return null;

    await recorder.stop();
    const uri = recorder.uri;
    recorder.release();
    recorder = null;

    return uri ?? null;
  } catch (err) {
    console.error("Failed to stop recording:", err);
    if (recorder) {
      recorder.release();
      recorder = null;
    }
    return null;
  }
}

/**
 * Check if currently recording.
 */
export function isRecording(): boolean {
  return recorder !== null;
}

/**
 * Get the duration of a recorded audio file in seconds.
 */
export async function getAudioDuration(uri: string): Promise<number> {
  try {
    const player = createAudioPlayer(uri);
    // Wait briefly for the player to load metadata
    await new Promise((resolve) => setTimeout(resolve, 300));
    const duration = player.duration ?? 0;
    player.release();
    return Math.round(duration);
  } catch {
    return 0;
  }
}
