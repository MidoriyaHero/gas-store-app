import { useCallback, useEffect, useRef, useState } from "react";
import { Audio, AVPlaybackStatus } from "expo-av";

import { API_BASE_URL } from "@/config";
import { getAccessToken } from "@/auth/session";

type VoiceSource = { voicePath?: string; audioUrl?: string };

/** Prepare expo-av for playback after recording. */
export async function preparePlaybackAudioMode(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  });
}

/** Resolve playable URI from local path or server audio_url. */
export function resolveVoiceUri(note: VoiceSource): string | null {
  if (note.voicePath) return note.voicePath;
  if (!note.audioUrl) return null;
  return note.audioUrl.startsWith("http") ? note.audioUrl : `${API_BASE_URL}${note.audioUrl}`;
}

/** Play/pause/scrub a single voice note clip. */
export function useVoicePlayback(note: VoiceSource) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const onStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setPositionMs(status.positionMillis ?? 0);
    setDurationMs(status.durationMillis ?? 0);
    setIsPlaying(status.isPlaying ?? false);
    if (status.didJustFinish) {
      setIsPlaying(false);
      setPositionMs(0);
      void soundRef.current?.setPositionAsync(0).catch(() => undefined);
    }
  }, []);

  const unload = useCallback(async () => {
    const s = soundRef.current;
    soundRef.current = null;
    if (s) {
      try {
        await s.unloadAsync();
      } catch {
        /* ignore */
      }
    }
    setIsPlaying(false);
    setPositionMs(0);
  }, []);

  useEffect(() => () => {
    void unload();
  }, [unload]);

  const loadSound = useCallback(async (): Promise<Audio.Sound | null> => {
    await preparePlaybackAudioMode();
    const primary = resolveVoiceUri(note);
    const fallbacks: string[] = [];
    if (note.voicePath && note.audioUrl) {
      const remote = note.audioUrl.startsWith("http") ? note.audioUrl : `${API_BASE_URL}${note.audioUrl}`;
      fallbacks.push(remote);
    }
    const uris = primary ? [primary, ...fallbacks.filter((u) => u !== primary)] : fallbacks;
    if (uris.length === 0) {
      setLoadError("Không có file ghi âm");
      return null;
    }
    const token = await getAccessToken();
    let lastErr: unknown;
    for (const uri of uris) {
      try {
        const headers = uri.startsWith("http") && token ? { Authorization: `Bearer ${token}` } : undefined;
        const { sound } = await Audio.Sound.createAsync({ uri, headers }, { shouldPlay: false }, onStatus);
        return sound;
      } catch (e) {
        lastErr = e;
      }
    }
    setLoadError(lastErr instanceof Error ? lastErr.message : "Không phát được ghi âm");
    return null;
  }, [note, onStatus]);

  const togglePlay = useCallback(async () => {
    setLoadError(null);
    if (!soundRef.current) {
      const sound = await loadSound();
      if (!sound) return;
      soundRef.current = sound;
    }
    const s = soundRef.current;
    if (!s) return;
    const status = await s.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await s.pauseAsync();
    } else {
      const duration = status.durationMillis ?? 0;
      const atEnd = duration > 0 && (status.positionMillis ?? 0) >= duration - 250;
      if (atEnd) {
        await s.setPositionAsync(0);
        setPositionMs(0);
      }
      await s.playAsync();
    }
  }, [loadSound]);

  const seek = useCallback(async (ratio: number) => {
    const s = soundRef.current;
    if (!s || durationMs <= 0) return;
    const clamped = Math.min(1, Math.max(0, ratio));
    await s.setPositionAsync(Math.floor(durationMs * clamped));
  }, [durationMs]);

  const retry = useCallback(async () => {
    await unload();
    setLoadError(null);
    await togglePlay();
  }, [unload, togglePlay]);

  return {
    isPlaying,
    positionMs,
    durationMs,
    loadError,
    togglePlay,
    seek,
    retry,
    unload,
  };
}
