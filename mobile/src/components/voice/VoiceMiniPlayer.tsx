import { useRef } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { useVoicePlayback } from "@/hooks/useVoicePlayback";
import { formatVoiceTime } from "@/hooks/useVoiceNoteRecorder";
import { colors, spacing } from "@/theme/tokens";

type VoiceMiniPlayerProps = {
  voicePath?: string;
  audioUrl?: string;
  durationSec?: number;
};

/** Inline play/pause + scrub timeline for a voice note row. */
export function VoiceMiniPlayer({ voicePath, audioUrl, durationSec }: VoiceMiniPlayerProps) {
  const playback = useVoicePlayback({ voicePath, audioUrl });
  const trackWidth = useRef(200);
  const totalSec = playback.durationMs > 0 ? playback.durationMs / 1000 : (durationSec ?? 0);
  const posSec = playback.positionMs / 1000;
  const ratio = totalSec > 0 ? posSec / totalSec : 0;

  function onTrackLayout(e: LayoutChangeEvent) {
    trackWidth.current = e.nativeEvent.layout.width || 200;
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.playBtn}
        onPress={() => void playback.togglePlay()}
        accessibilityRole="button"
        accessibilityLabel={playback.isPlaying ? "Tạm dừng ghi âm" : "Phát ghi âm"}
      >
        <Ionicons name={playback.isPlaying ? "pause" : "play"} size={22} color={colors.primary} />
      </Pressable>
      <View style={styles.timeline}>
        <Pressable
          style={styles.track}
          onLayout={onTrackLayout}
          onPress={(e) => {
            void playback.seek(e.nativeEvent.locationX / trackWidth.current);
          }}
          accessibilityRole="adjustable"
          accessibilityLabel="Tiến độ phát ghi âm"
        >
          <View style={styles.trackBg}>
            <View style={[styles.trackFill, { width: `${Math.min(100, ratio * 100)}%` }]} />
          </View>
        </Pressable>
        <AppText variant="mono" style={styles.time}>
          {formatVoiceTime(posSec)} / {formatVoiceTime(totalSec)}
        </AppText>
      </View>
      {playback.loadError ? (
        <Button label="Thử lại" variant="ghost" onPress={() => void playback.retry()} style={styles.retry} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48 },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  timeline: { flex: 1, justifyContent: "center", minHeight: 48, gap: 4 },
  track: { minHeight: 48, justifyContent: "center" },
  trackBg: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" },
  trackFill: { height: "100%", backgroundColor: colors.primary, borderRadius: 3 },
  time: { fontSize: 12, color: colors.textMuted },
  retry: { minHeight: 36, paddingHorizontal: spacing.sm },
});
