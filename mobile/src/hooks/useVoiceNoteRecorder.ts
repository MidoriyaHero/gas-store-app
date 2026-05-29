import { useCallback, useRef, useState } from "react";
import { Audio } from "expo-av";

export interface VoiceRecordingResult {
  uri: string;
  mimeType: string;
  durationSec: number;
}

/** expo-av voice capture for delivery notes. */
export function useVoiceNoteRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const startedAtRef = useRef(0);

  const start = useCallback(async (): Promise<boolean> => {
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      return false;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    recordingRef.current = recording;
    startedAtRef.current = Date.now();
    setIsRecording(true);
    return true;
  }, []);

  const cancel = useCallback(async () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
    } catch {
      /* ignore */
    }
  }, []);

  const stop = useCallback(async (): Promise<VoiceRecordingResult | null> => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    if (!rec) return null;
    const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    await rec.stopAndUnloadAsync();
    const uri = rec.getURI();
    if (!uri) return null;
    return { uri, mimeType: "audio/mp4", durationSec };
  }, []);

  return { isRecording, start, stop, cancel };
}
