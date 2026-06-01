import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, Vibration } from "react-native";
import { Audio } from "expo-av";

export interface VoiceRecordingResult {
  uri: string;
  mimeType: string;
  durationSec: number;
}

const METER_SAMPLES = 28;

/** expo-av voice capture with live metering for waveform UI. */
export function useVoiceNoteRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [meteringSamples, setMeteringSamples] = useState<number[]>(() => Array(METER_SAMPLES).fill(0.15));
  const [reduceMotion, setReduceMotion] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  const pushMeter = useCallback((metering?: number) => {
    const normalized = metering != null && metering > -160 ? Math.min(1, Math.max(0.08, (metering + 60) / 60)) : 0.12;
    setMeteringSamples((prev) => [...prev.slice(-(METER_SAMPLES - 1)), normalized]);
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      return false;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(
      {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      },
      (status) => {
        if (!status.isRecording) return;
        pushMeter(status.metering);
        if (status.durationMillis != null) {
          setElapsedSec(Math.floor(status.durationMillis / 1000));
        }
      },
      120,
    );
    recordingRef.current = recording;
    startedAtRef.current = Date.now();
    setElapsedSec(0);
    setMeteringSamples(Array(METER_SAMPLES).fill(0.15));
    setIsRecording(true);
    if (Platform.OS !== "web") {
      Vibration.vibrate(10);
    }
    return true;
  }, [pushMeter]);

  const cancel = useCallback(async () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    setElapsedSec(0);
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
    if (Platform.OS !== "web") {
      Vibration.vibrate(10);
    }
    return { uri, mimeType: "audio/mp4", durationSec };
  }, []);

  return { isRecording, elapsedSec, meteringSamples, reduceMotion, start, stop, cancel };
}

/** Format seconds as MM:SS for voice UI. */
export function formatVoiceTime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
