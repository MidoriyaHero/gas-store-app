# Gas Store Mobile — Design System

## Product
Offline-first gas delivery & store operations (admin + staff).

## Style
Operations dashboard — clean, scannable, high contrast, status-driven (green/amber/red).

## Colors
| Token | Hex | Usage |
|-------|-----|--------|
| primary | `#2563EB` | Primary actions, active nav |
| primaryDark | `#1D4ED8` | Pressed primary |
| accent | `#F97316` | Delivery CTA, highlights |
| background | `#F8FAFC` | Screen background |
| surface | `#FFFFFF` | Cards, inputs |
| text | `#1E293B` | Headings, body |
| textSecondary | `#64748B` | Subtitles |
| textMuted | `#94A3B8` | Hints, inactive |
| border | `#E2E8F0` | Dividers, input borders |
| success | `#059669` | Completed, online |
| warning | `#D97706` | Pending sync |
| error | `#DC2626` | Errors, destructive |
| offlineBg | `#FEF3C7` | Offline banner |

## Typography
- **Inter** — all UI (400 body, 500 label, 600–700 headings)
- Min body **16px** on mobile

## Spacing
4 / 8 / 16 / 24 / 32 dp rhythm

## Touch
- Min target **48dp**
- Press feedback: opacity 0.85 or scale 0.98
- Icons: `@expo/vector-icons` Ionicons only — no emoji

## Anti-patterns
- Raw inline hex in screens (use `theme/tokens`)
- Placeholder-only labels
- Icon-only nav without labels
