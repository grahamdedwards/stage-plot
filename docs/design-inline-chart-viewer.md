# Inline Chart Viewer — Design Spec v1.0

## Problem

Current flow: tap song → navigator shows link list → tap link → opens Google Drive in new tab. User leaves the app, loses prev/next navigation, can't flip through charts mid-show.

## Goal

One-tap chart viewing that stays in-app. Flipping between songs should feel as fast as swiping through photos.

## Architecture

### Rendering pipeline

1. Chart request → check offline cache (Cache API) → if miss, fetch via `/api/drive/download` → get raw PDF blob
2. Create `blob:` URL → render in `<embed type="application/pdf">` (native browser PDF, zero overhead)
3. Store blob URL in memory map keyed by `fileId` for session reuse

### Why `<embed>` over `<iframe>`

- No Google toolbar/chrome
- Native browser PDF renderer (fastest)
- Fills container, no inner scrollbars
- Mobile Safari handles it natively

### Prefetch strategy

- On song N render, prefetch N-1 and N+1 (filtered to active role)
- Prefetch = fetch blob + cache, but don't render
- Memory map holds blob URLs — swipe to next song renders instantly from memory
- Cap prefetch window at +/- 1 to avoid burning bandwidth

## UX Flow

### Entry points

1. **Song row tap** (Show tab, setlist) — if role filter active and exactly 1 chart for that role → open viewer directly. Otherwise → navigator with chart list (existing behavior).
2. **Chart link tap** (from navigator list) — opens viewer for that specific chart.

### Viewer layout (full-screen overlay)

```
┌─────────────────────────────────┐
│ ← Back    Song 5 of 30   Role ▼│  ← header bar
├─────────────────────────────────┤
│                                 │
│         [PDF embed]             │  ← fills remaining space
│                                 │
│                                 │
├─────────────────────────────────┤
│  ← Prev          Next →        │  ← footer nav
└─────────────────────────────────┘
```

- **Header:** back button, song position, role filter dropdown (same as current navigator)
- **Body:** `<embed>` filling the viewport minus header/footer
- **Footer:** prev/next buttons
- Swipe left/right and arrow keys still work (existing navigator behavior)
- Song title + lead displayed in header or just above the embed

### Multi-chart per song

- If a song has multiple charts for the active role (dupes), show a small pill bar below the header: `1 / 3 ▸` to cycle through variants
- Rare case — most songs have 1 chart per role

### No charts state

- Same as current: "No charts for this song" centered message
- Prev/next still works to skip to next song

## Integration with Offline Cache

- Already built: `getCachedChartUrl()` returns a blob URL from Cache API if available
- Prefetch stores blobs into the same cache
- Gig-day with cached charts = pure local, zero network, instant render

## Role Filter Shortcut

When role filter is active (e.g., "Guitar"):

- Song row tap → if exactly 1 chart → straight to viewer (skip navigator list)
- Song row tap → if 0 charts → show "No chart for this song" in viewer (still navigable)
- Song row tap → if 2+ charts → show picker, then viewer

## Mobile Considerations

- `<embed>` works on iOS Safari and Android Chrome for PDFs
- Fallback for any browser that doesn't support inline PDF: `<iframe src="blob:...">` with `#toolbar=0`
- Touch swipe activation: same 60px threshold as current navigator
- No pinch-to-zoom conflict — PDF embed has its own zoom

## What Changes

| Component | Current | New |
|---|---|---|
| ChartNavigator | Link list → new tab | Inline PDF viewer |
| Song row tap | Always opens navigator | Shortcut when single chart + role filter |
| Chart rendering | Google Drive web viewer | Native PDF via blob URL |
| Prefetch | None | N-1 and N+1 on render |

## What Doesn't Change

- Offline download flow (Setup tab)
- Chart resolution / matching logic
- Role filter persistence (sessionStorage)
- Keyboard nav (arrow keys, Escape)

## Open Questions

1. **Multiple roles in one view?** E.g., guitarist who also sings — show both Guitar and Lyrics charts? Or keep single-role filter as-is?
2. **Landscape mode?** Charts are usually portrait. Force portrait, or let the embed handle it?
3. **PDF page navigation?** Multi-page charts — rely on the native PDF embed's scroll, or add page controls?
