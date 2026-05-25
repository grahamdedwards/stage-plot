# Inline Chart Viewer — Design Spec v1.1

## Problem

Current flow: tap song → navigator shows link list → tap link → opens Google Drive in new tab. User leaves the app, loses prev/next navigation, can't flip through charts mid-show.

## Goal

One-tap chart viewing that stays in-app. Flipping between songs should feel as fast as swiping through photos.

## Architecture

### Rendering pipeline

1. Chart request → check offline cache (Cache API) → if miss, fetch via `/api/drive/download` → get raw PDF blob
2. Pass blob to **pdf.js** → render target page to `<canvas>` at device resolution
3. Store loaded `PDFDocumentProxy` in memory map keyed by `fileId` for session reuse (avoids re-parsing)

### Why pdf.js + canvas (not `<embed>` or `<iframe>`)

- **Page-level control** — render one page at a time, deliberate page turns mid-show (no accidental scroll)
- **Separation of axes** — tap = page turn, swipe = song change. `<embed>` conflates vertical scroll with page navigation
- **Consistent rendering** — same behavior across all browsers/devices. `<embed>` PDF support varies on mobile
- **Portrait enforcement** — canvas dimensions controlled by us, always portrait
- **Dependency:** `pdfjs-dist` (Mozilla, Apache 2.0, ~500KB). Powers Firefox's PDF viewer. Commercial use, no copyleft.

### Prefetch strategy

- On song N render, prefetch N-1 and N+1 (filtered to active role)
- Prefetch = fetch blob + parse PDF document, but don't render pages
- Memory map holds parsed `PDFDocumentProxy` objects — swipe to next song renders page 1 instantly
- Cap prefetch window at +/- 1 to avoid burning bandwidth/memory

## UX Flow

### Entry points

1. **Song row tap** (Show tab, setlist) — if role filter active and exactly 1 chart for that role → open viewer directly. Otherwise → navigator with chart list (existing behavior).
2. **Chart link tap** (from navigator list) — opens viewer for that specific chart.

### Viewer layout (full-screen overlay)

```
┌─────────────────────────────────┐
│ ← Back   "Dancing Queen"  Role ▼│  ← header bar
│           Song 5 of 30         │
├─────────────────────────────────┤
│                                 │
│    ┌───────────────────────┐    │
│    │                       │    │
│    │     [PDF page]        │    │  ← canvas, portrait aspect
│    │     rendered to       │    │
│    │     canvas            │    │
│    │                       │    │
│    └───────────────────────┘    │
│                                 │
│         Page 1 of 3             │  ← page indicator (if multi-page)
├─────────────────────────────────┤
│  ← Prev Song    Next Song →    │  ← footer nav
└─────────────────────────────────┘
```

- **Header:** back button, song title + position, role filter dropdown
- **Body:** canvas rendered in portrait aspect ratio, centered, scaled to fit viewport
- **Page indicator:** shows current page / total (hidden for single-page charts)
- **Footer:** prev/next song buttons
- Keyboard: arrow left/right = change song, up/down = change page, Escape = close
- Touch: swipe left/right = change song

### Page navigation (within a chart)

Two interaction models, separated by axis to avoid conflicts:

| Action | Result |
|---|---|
| Tap right half of canvas | Next page |
| Tap left half of canvas | Previous page |
| Swipe left | Next song |
| Swipe right | Previous song |
| Arrow left/right | Change song |
| Arrow up/down | Change page |

When on the last page of a chart, tapping right half does nothing (prevents accidental song change). The song-level nav is always in the footer buttons and swipe gesture.

### Multi-chart per song

- If a song has multiple charts for the active role (dupes), show a pill bar below the header: `Chart 1 / 3 ▸` to cycle through variants
- Rare case — most songs have 1 chart per role

### No charts state

- Same as current: "No charts for this song" centered message
- Prev/next still works to skip to next song

## Multi-Role Chart Assignment

Charts live in a single Drive folder (e.g., `Guitar/Superstition.pdf`), but the same chart may be useful for multiple roles (e.g., a chord chart used by guitarist, pianist, and vocalist).

### Override mapping (in-app, not Drive)

- **Setup tab** adds a "Chart Overrides" section per song (or global)
- UI: after chart resolution, each matched chart shows its source role and a multi-select: "Also show for: [ ] Lyrics [ ] Piano [ ] Bass ..."
- Stored in config as `chartOverrides` on the song or as a top-level map
- At render time, the role filter checks both the chart's source role and any override assignments
- No Drive changes required — file stays in one folder, overrides are app-level metadata

### Data model

```typescript
// Per-song override: chart fileId → additional roles
interface ChartOverride {
  fileId: string;
  additionalRoles: string[];
}

// On SetlistSong (extends existing)
interface SetlistSong {
  // ... existing fields
  chartOverrides?: ChartOverride[];
}
```

### Resolution with overrides

1. Batch resolution runs as-is → produces `charts[]` per song from Drive folders
2. At display time, if role filter is active, a chart matches if:
   - `chart.role === activeRole` (existing), OR
   - `song.chartOverrides` maps `chart.fileId` to an `additionalRoles` array containing `activeRole`

Overrides are stored in the show file (YAML export/import) and shareable URL. No server-side state.

## Portrait Enforcement

- Canvas dimensions set to portrait aspect ratio (US Letter 8.5x11 = ~0.773 aspect, A4 = ~0.707)
- pdf.js renders at the PDF's native page dimensions — we scale the canvas to fit the viewport width while maintaining the page's aspect ratio
- If a PDF page is landscape, it still renders at its native aspect but constrained to the viewport width (user can scroll vertically if needed, but this is an edge case)
- CSS: `max-width: 100%; max-height: calc(100vh - header - footer)` on the canvas container

## Integration with Offline Cache

- Already built: `getCachedChartUrl()` returns a blob URL from Cache API if available
- Prefetch parses the blob into a `PDFDocumentProxy` — cached charts skip network entirely
- Gig-day with cached charts = pure local, zero latency, instant page rendering

## Role Filter Shortcut

When role filter is active (e.g., "Guitar"):

- Song row tap → if exactly 1 chart (including overrides) → straight to viewer (skip navigator list)
- Song row tap → if 0 charts → show "No chart for this song" in viewer (still navigable)
- Song row tap → if 2+ charts → show picker, then viewer

## Mobile Considerations

- Canvas rendering works identically on iOS Safari, Android Chrome, all modern browsers
- Touch: tap zones (left/right half) sized for thumb reach, minimum 44px touch targets
- Swipe: 60px threshold (same as current navigator) — horizontal only, no conflict with vertical page content
- Device pixel ratio: canvas rendered at `window.devicePixelRatio` for crisp text on Retina displays

## Dependencies

| Package | License | Size | Purpose |
|---|---|---|---|
| `pdfjs-dist` | Apache 2.0 | ~500KB | PDF parsing + page rendering to canvas |

No other new dependencies. pdf.js is Mozilla's official PDF renderer, actively maintained, used in Firefox.

## What Changes

| Component | Current | New |
|---|---|---|
| ChartNavigator | Link list → new tab | Inline PDF viewer with page controls |
| Song row tap | Always opens navigator | Shortcut when single chart + role filter |
| Chart rendering | Google Drive web viewer | pdf.js canvas rendering |
| Prefetch | None | N-1 and N+1 parsed PDF docs |
| Page navigation | N/A | Tap left/right half of canvas |
| Chart role assignment | 1 chart = 1 role (folder) | Override mapping for multi-role |
| Orientation | Uncontrolled | Portrait enforced |

## What Doesn't Change

- Offline download flow (Setup tab)
- Chart resolution / matching logic (Drive folder structure)
- Role filter persistence (sessionStorage)
- Song-level keyboard nav (arrow left/right, Escape)

## Build Phases

### Phase 1: Inline viewer (priority — unblocks UAT)
- Add `pdfjs-dist` dependency
- Replace ChartNavigator link list with canvas-based PDF viewer
- Page navigation (tap zones + arrow up/down)
- Prefetch N-1/N+1
- Role filter shortcut (single chart = direct open)
- Portrait canvas rendering

### Phase 2: Multi-role overrides
- Chart override UI in Setup tab
- Override data model on SetlistSong
- YAML serialization for overrides
- Role filter respects overrides at display time
