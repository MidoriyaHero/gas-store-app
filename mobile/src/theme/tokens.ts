/** Semantic design tokens for Gas Store mobile (see design-system/MASTER.md). */

export const colors = {
  primary: "#2563EB",
  primaryDark: "#1D4ED8",
  primarySoft: "#EFF6FF",
  accent: "#F97316",
  accentSoft: "#FFF7ED",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  text: "#1E293B",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  success: "#059669",
  successSoft: "#ECFDF5",
  warning: "#D97706",
  warningSoft: "#FFFBEB",
  error: "#DC2626",
  errorSoft: "#FEF2F2",
  offlineBg: "#FEF3C7",
  offlineText: "#92400E",
  shadow: "#0F172A",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const typography = {
  h1: { fontSize: 28, lineHeight: 34, fontFamily: "Inter_700Bold" as const },
  h2: { fontSize: 22, lineHeight: 28, fontFamily: "Inter_600SemiBold" as const },
  h3: { fontSize: 18, lineHeight: 24, fontFamily: "Inter_600SemiBold" as const },
  body: { fontSize: 16, lineHeight: 24, fontFamily: "Inter_400Regular" as const },
  bodyMedium: { fontSize: 16, lineHeight: 24, fontFamily: "Inter_500Medium" as const },
  label: { fontSize: 14, lineHeight: 20, fontFamily: "Inter_500Medium" as const },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" as const },
  mono: { fontSize: 14, lineHeight: 20, fontFamily: "Inter_500Medium" as const },
} as const;

export const shadow = {
  card: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  elevated: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
} as const;

/** Shared navigation chrome for tabs and stack headers. */
export const navTheme = {
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    height: 64,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerStyle: { backgroundColor: colors.surface },
  headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
  headerShadowVisible: false,
  headerTintColor: colors.primary,
} as const;
