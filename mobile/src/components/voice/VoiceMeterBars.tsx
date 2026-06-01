import { useEffect, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { colors } from "@/theme/tokens";

type VoiceMeterBarsProps = {
  samples: number[];
  animated?: boolean;
  barColor?: string;
  height?: number;
};

/** Live or static voice level bars (expo-av metering samples). */
export function VoiceMeterBars({
  samples,
  animated = true,
  barColor = colors.primary,
  height = 48,
}: VoiceMeterBarsProps) {
  const bars = useMemo(() => {
    const count = samples.length || 1;
    const barW = 4;
    const gap = 3;
    const width = count * barW + (count - 1) * gap;
    return { count, barW, gap, width };
  }, [samples.length]);

  useEffect(() => {
    /* placeholder for animated prop — static when reduceMotion */
  }, [animated]);

  return (
    <View style={[styles.wrap, { height }]} accessibilityLabel="Biểu đồ âm thanh">
      <Svg width={bars.width} height={height}>
        {samples.map((level, i) => {
          const h = Math.max(4, level * height);
          const x = i * (bars.barW + bars.gap);
          const y = height - h;
          return (
            <Rect
              key={`${i}-${level.toFixed(2)}`}
              x={x}
              y={y}
              width={bars.barW}
              height={h}
              rx={2}
              fill={barColor}
              opacity={0.85}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: "flex-end", overflow: "hidden" },
});
