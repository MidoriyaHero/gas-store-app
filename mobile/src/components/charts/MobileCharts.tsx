import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";

import { AppText } from "@/components/ui/AppText";
import { colors, spacing } from "@/theme/tokens";
import type { DailySeriesRow } from "@/lib/dashboard-analytics";

type ChartCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

/** Wrapper for dashboard chart blocks. */
export function ChartCard({ title, subtitle, children }: ChartCardProps) {
  return (
    <View style={styles.card}>
      <AppText variant="bodyMedium">{title}</AppText>
      {subtitle ? (
        <AppText variant="caption" muted style={{ marginBottom: spacing.xs }}>
          {subtitle}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

type LineChartProps = {
  data: DailySeriesRow[];
  dataKey: "revenue" | "orderCount";
  height?: number;
};

/** Simple line chart for daily trends. */
export function MobileLineChart({ data, dataKey, height = 120 }: LineChartProps) {
  const width = 320;
  const pad = { l: 28, r: 8, t: 8, b: 22 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const values = data.map((d) => (dataKey === "revenue" ? d.revenue : d.orderCount));
  const max = Math.max(...values, 1);
  const points = values
    .map((v, i) => {
      const x = pad.l + (i / Math.max(values.length - 1, 1)) * innerW;
      const y = pad.t + innerH - (v / max) * innerH;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Line x1={pad.l} y1={pad.t} x2={pad.l} y2={height - pad.b} stroke={colors.border} strokeWidth={1} />
      <Line x1={pad.l} y1={height - pad.b} x2={width - pad.r} y2={height - pad.b} stroke={colors.border} strokeWidth={1} />
      <Polyline points={points} fill="none" stroke={colors.primary} strokeWidth={2.5} />
      {data.filter((_, i) => i % Math.ceil(data.length / 4) === 0 || i === data.length - 1).map((d, idx) => (
        <SvgText
          key={d.dateKey}
          x={pad.l + (idx / Math.max(3, 1)) * (innerW / Math.max(3, 1))}
          y={height - 4}
          fontSize={9}
          fill={colors.textMuted}
        >
          {d.label}
        </SvgText>
      ))}
    </Svg>
  );
}

type DonutSlice = { label: string; value: number; color: string };

/** Donut chart for debt status split. */
export function MobileDonutChart({ slices, size = 100 }: { slices: DonutSlice[]; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  let offset = 0;
  const circumference = 2 * Math.PI * r;

  return (
    <View style={styles.donutWrap}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke={colors.border} strokeWidth={12} fill="none" />
        {slices.map((slice) => {
          const len = (slice.value / total) * circumference;
          const dash = `${len} ${circumference - len}`;
          const el = (
            <Circle
              key={slice.label}
              cx={cx}
              cy={cy}
              r={r}
              stroke={slice.color}
              strokeWidth={12}
              fill="none"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              rotation={-90}
              origin={`${cx}, ${cy}`}
            />
          );
          offset += len;
          return el;
        })}
      </Svg>
      <View style={styles.legend}>
        {slices.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <AppText variant="caption" muted>
              {s.label}: {s.value}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

type BarRow = { label: string; value: number };

/** Horizontal bar chart for top debtors. */
export function MobileHBarChart({ rows, maxWidth = 280 }: { rows: BarRow[]; maxWidth?: number }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((row) => (
        <View key={row.label}>
          <AppText variant="caption" muted numberOfLines={1}>
            {row.label}
          </AppText>
          <View style={[styles.barTrack, { maxWidth }]}>
            <View style={[styles.barFill, { width: `${(row.value / max) * 100}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Vertical mini bar chart for low stock SKUs. */
export function MobileVBarChart({ rows, height = 88 }: { rows: BarRow[]; height?: number }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <View style={[styles.vBars, { height }]}>
      {rows.map((row) => (
        <View key={row.label} style={styles.vBarCol}>
          <View style={[styles.vBar, { height: `${(row.value / max) * 100}%`, backgroundColor: colors.warning }]} />
          <AppText variant="caption" muted style={styles.vLabel} numberOfLines={1}>
            {row.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** Compact KPI tile with optional delta. */
export function CompactKpi({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number | null;
}) {
  const deltaText =
    delta == null ? null : `${delta >= 0 ? "↑" : "↓"} ${Math.abs(Math.round(delta))}%`;
  return (
    <View style={styles.kpi}>
      <AppText variant="caption" muted style={{ fontSize: 10 }}>
        {label}
      </AppText>
      <AppText variant="bodyMedium" style={{ fontWeight: "700", marginTop: 2 }}>
        {value}
      </AppText>
      {deltaText ? (
        <AppText variant="caption" style={{ color: delta! >= 0 ? colors.success : colors.error, fontSize: 10 }}>
          {deltaText}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
  },
  donutWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  legend: { flex: 1, gap: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  barTrack: { height: 10, backgroundColor: colors.primarySoft, borderRadius: 4, marginTop: 4, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.primary, borderRadius: 4 },
  vBars: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", marginTop: spacing.xs },
  vBarCol: { flex: 1, alignItems: "center", height: "100%", justifyContent: "flex-end" },
  vBar: { width: 18, borderRadius: 4, minHeight: 4 },
  vLabel: { fontSize: 9, marginTop: 4, maxWidth: 44, textAlign: "center" },
  kpi: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
  },
});
