# Inline Chart Viewer — Design Spec v1.3

## Problem

Current flow: tap song → navigator shows link list → tap link → opens Google Drive in new tab. User leaves the app, loses prev/next navigation, can't flip through charts mid-show.

## Goal

One-tap chart viewing that stays in-app. Flipping between songs should feel as fast as swiping through photos.

## Architecture

### Rendering pipeline

1. Chart request → check offline cache (Cache API) → if miss, fetch via `/api/drive/download` → get raw PDF blob
2. Pass blob to **pdf.js** → render target page to `<canvas>` at device resolution
3. Store loaded `PDFDocumentProxy` in memory map keyed by `${fileId}:${modifiedTime}` for session reuse (avoids re-parsing). Compound key ensures a Drive file update within the same session invalidates the stale parsed doc, matching the offline cache's existing `fileId + modifiedTime` versioning.

### Why pdf.js + canvas (not `<embed>` or `<iframe>`)

- **Page-level control** — render one page at a time, deliberate page turns mid-show (no accidental scroll)
- **Separation of axes** — tap = page turn, swipe = song change. `<embed>` conflates vertical scroll with page navigation
- **Consistent rendering** — same behavior across all browsers/devices. `<embed>` PDF support varies on mobile
- **Orientation control** — canvas dimensions controlled by us, native page aspect preserved and scaled to fit viewport
- **Dependency:** `pdfjs-dist` (Mozilla, Apache 2.0, ~500KB). Powers Firefox's PDF viewer. Commercial use, no copyleft.

### Prefetch strategy

- On song N render, prefetch N-1 and N+1 (filtered to active role)
- Prefetch = fetch blob + parse PDF document, but don't render pages
- Memory map holds parsed `PDFDocumentProxy` objects — swipe to next song renders page 1 instantly
- Cap prefetch window at +/- 1 to avoid burning bandwidth/memory

### Memory management

The memory map holds parsed `PDFDocumentProxy` objects which consume significant memory (each parsed PDF can be several MB). Without eviction, a 30-song set could accumulate ~100MB+ on mobile.

**Eviction policy:**
- Maximum 5 parsed PDFs in memory at any time (current + 2 prev + 2 next)
- When navigating to song N, evict any cached docs outside the window [N-2, N+2]
- Eviction calls `PDFDocumentProxy.destroy()` to release pdf.js internal buffers and revokes any associated blob URLs via `URL.revokeObjectURL()`
- The underlying blobs remain in the offline Cache API (persistent storage) — only the parsed in-memory representation is evicted
- On viewer close (back to setlist), destroy all in-memory docs and revoke all blob URLs

**Lifecycle:**
```
Song tap → load/parse PDF → render page 1 → prefetch N-1, N+1
Navigate to N+1 → evict N-3 (if exists) → prefetch N+2
Viewer close → destroy all in-memory docs, revoke blob URLs
```

## UX Flow

### Entry points

1. **Song row tap** (Show tab, setlist) — if role filter active and exactly 1 chart for that role → open inline viewer directly. If 2+ charts for that role → show pill picker inside the viewer (see Multi-chart below). If no role filter active → show inline viewer for the first chart with pill picker if multiple roles.
2. **Chart link tap** — removed. The navigator link list is replaced entirely by the inline viewer. All song taps go to the viewer.

### Viewer layout (full-screen overlay)

```
┌─────────────────────────────────┐
│ ← Back   "Dancing Queen"  Role ▼│  ← header bar
│           Song 5 of 30         │
├─────────────────────────────────┤
│  [ Guitar ] [ Lyrics ] [ Piano ]│  ← chart pill picker (if multi)
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
- **Pill picker:** shown when song has charts from multiple roles (or multiple charts for same role). Tapping a pill loads that chart. When role filter is active, only matching charts shown — pill picker hidden if exactly 1 match.
- **Body:** canvas rendered in portrait aspect ratio, centered, scaled to fit viewport
- **Page indicator:** shows current page / total (hidden for single-page charts)
- **Footer:** prev/next song buttons
- Keyboard: arrow left/right = change song, up/down = change page, Escape = close

### Page navigation (within a chart)

Two interaction models, separated by axis:

| Action | Result |
|---|---|
| Tap right half of canvas | Next page |
| Tap left half of canvas | Previous page |
| Swipe left | Next song |
| Swipe right | Previous song |
| Arrow left/right | Change song |
| Arrow up/down | Change page |

When on the last page of a chart, tapping right half does nothing (prevents accidental song change). The song-level nav is always in the footer buttons and swipe gesture.

### Gesture conflict resolution

Touch gestures use a **dominant-axis lock** to prevent horizontal jitter during vertical interactions (and vice versa):

1. On `touchstart`, record start coordinates `(startX, startY)`
2. On `touchmove`, once displacement exceeds 10px, compute `abs(dx)` vs `abs(dy)`
3. Lock to the dominant axis for the remainder of the gesture:
   - **Horizontal dominant** (`abs(dx) > abs(dy)`): treat as song swipe. Threshold: `abs(dx) > 60px` to trigger.
   - **Vertical dominant** (`abs(dy) > abs(dx)`): ignore entirely — canvas content doesn't scroll (single page rendered, no vertical overflow). This prevents accidental song swipes during vertical finger movement.
4. Tap detection: if total displacement < 10px on `touchend`, treat as tap (page turn via left/right half zones)

Since charts render one page at a time (no vertical scrolling), the vertical axis is effectively dead — only horizontal swipes and taps are meaningful. This eliminates the scroll-vs-swipe conflict entirely.

### Multi-chart per song

- If a song has multiple charts (across roles or duplicates within a role), the pill picker bar appears below the header
- Each pill shows the role name (e.g., "Guitar", "Lyrics")
- If multiple charts exist for the same role (dupes), pills show `Guitar (1)`, `Guitar (2)`
- Tapping a pill loads that chart in the viewer
- When role filter is active, pills are filtered to matching role only — if exactly 1 match, pill bar is hidden

### No charts state

- "No charts for this song" centered message in the viewer body
- Prev/next still works to skip to next song

## Multi-Role Chart Assignment

Charts live in a single Drive folder (e.g., `Guitar/Superstition.pdf`), but the same chart may be useful for multiple roles (e.g., a chord chart used by guitarist, pianist, and vocalist).

### Override mapping (in-app, not Drive)

- **Setup tab** adds override controls per song: after chart resolution, each matched chart shows its source role and a multi-select: "Also show for: [ ] Lyrics [ ] Piano [ ] Bass ..."
- Stored per-song on the `SetlistSong` config object
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

Canonical storage is per-song only. No top-level map — avoids schema ambiguity and keeps overrides colocated with the song they apply to.

### Resolution with overrides

1. Batch resolution runs as-is → produces `charts[]` per song from Drive folders
2. At display time, if role filter is active, a chart matches if:
   - `chart.role === activeRole` (existing), OR
   - `song.chartOverrides` includes an entry where `fileId` matches and `additionalRoles` contains `activeRole`

Overrides are stored in the show file (YAML export/import) and shareable URL. No server-side state.

## Portrait Enforcement

- pdf.js renders at the PDF's native page dimensions — we scale the canvas to fit the viewport width while maintaining the page's aspect ratio
- Canvas constrained to viewport: `max-width: 100%; max-height: calc(100vh - header - footer)`
- If a PDF page is natively landscape, it renders at its native aspect ratio scaled to fit the viewport width. The page will appear smaller vertically but remains fully visible — no vertical scrolling needed
- No forced aspect ratio override — we respect the PDF's native dimensions but constrain to the available viewport

## Integration with Offline Cache

- Already built: `getCachedChartUrl()` returns a blob URL from Cache API if available
- Prefetch parses the blob into a `PDFDocumentProxy` — cached charts skip network entirely
- Gig-day with cached charts = pure local, zero latency, instant page rendering
- Memory eviction does not affect the persistent Cache API storage — blobs survive eviction and app restart

## Role Filter Shortcut

When role filter is active (e.g., "Guitar"):

- Song row tap → if exactly 1 chart (including overrides) → viewer opens with that chart, no pill picker
- Song row tap → if 0 charts → viewer opens with "No chart for this song" message (still navigable)
- Song row tap → if 2+ charts → viewer opens with pill picker visible

When no role filter (All Parts):

- Song row tap → viewer opens with first chart, pill picker visible if multiple charts

## Mobile Considerations

- Canvas rendering works identically on iOS Safari, Android Chrome, all modern browsers
- Touch: tap zones (left/right half) sized for thumb reach, minimum 44px touch targets
- Swipe: dominant-axis lock with 60px horizontal threshold (see Gesture conflict resolution)
- Device pixel ratio: canvas rendered at `window.devicePixelRatio` for crisp text on Retina displays
- Memory: 5-doc eviction cap prevents iOS Safari memory pressure crashes

## Dependencies

| Package | License | Size | Purpose |
|---|---|---|---|
| `pdfjs-dist` | Apache 2.0 | ~500KB | PDF parsing + page rendering to canvas |

No other new dependencies. pdf.js is Mozilla's official PDF renderer, actively maintained, used in Firefox.

### pdf.js worker configuration

pdf.js offloads PDF parsing to a Web Worker for non-blocking rendering. In a Next.js environment, the worker file must be served as a static asset:

- Copy `pdfjs-dist/build/pdf.worker.min.mjs` to `public/pdf.worker.min.mjs` (via postinstall script or manual copy)
- Set `pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'` before any `getDocument()` call
- This avoids the fake-worker fallback (which runs parsing on the main thread and degrades mobile performance)
- The worker file is ~300KB and cached by the browser after first load

## What Changes

| Component | Current | New |
|---|---|---|
| ChartNavigator | Link list → new tab | Inline PDF viewer with page controls |
| Song row tap | Opens navigator link list | Opens inline viewer directly |
| Chart rendering | Google Drive web viewer | pdf.js canvas rendering |
| Prefetch | None | N-1 and N+1 parsed PDF docs |
| Page navigation | N/A | Tap left/right half of canvas |
| Chart role assignment | 1 chart = 1 role (folder) | Override mapping for multi-role |
| Orientation | Uncontrolled | Portrait, native aspect preserved |
| Memory | Unbounded | 5-doc cap with destroy/revoke eviction |

## What Doesn't Change

- Offline download flow (Setup tab)
- Chart resolution / matching logic (Drive folder structure)
- Role filter persistence (sessionStorage)
- Song-level keyboard nav (arrow left/right, Escape)

## Build Phases

### Phase 1: Inline viewer (priority — unblocks UAT)
- Add `pdfjs-dist` dependency
- Replace ChartNavigator with canvas-based PDF viewer
- Page navigation (tap zones, dominant-axis gesture lock, arrow up/down)
- Prefetch N-1/N+1 with 5-doc memory eviction
- Role filter shortcut (single chart = direct open, multi = pill picker)
- Portrait canvas rendering at device pixel ratio

### Phase 2: Multi-role overrides
- Chart override UI in Setup tab (per-song multi-select)
- `chartOverrides` data model on SetlistSong
- YAML serialization for overrides
- Role filter + pill picker respects overrides at display time
