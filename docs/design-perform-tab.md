# Perform Tab — Design Spec v1.0

## Problem

The Show tab serves two audiences with conflicting needs:

1. **FOH/Monitor engineers** need the full input list, monitor mixes, stage plot, and scene notes to prep the desk.
2. **Performers** need the setlist, keys, notes, and chart access to play the show.

Today, the Show tab mixes both — the performer sees channel numbers and monitor bus assignments they don't care about, while the engineer has to scroll past the setlist to reach the patch list. The print view / cue sheet is closer to what performers want, but it's a static PDF, not interactive (no chart taps, no current-song tracking).

## Goal

A dedicated **Perform** tab optimized for musicians on stage: large text, setlist-first, one-tap chart access, minimal chrome. The existing Show tab becomes the **Mix** tab (engineer's view). Setup becomes **Config**. Each audience gets exactly what they need.

## Relationship to Designer/Performer Roles (Backlog #22)

This spec builds the **view layer** for performers. The **access control layer** (who can edit vs. view, show locking, invite model) is a separate spec. This is intentional — the Perform tab is useful immediately for show owners viewing their own show on a tablet, before any role/permission system exists.

When the role system is built later, it can simply default shared-slug viewers to the Perform tab and restrict Config/Mix tabs to the designer.

## UX Design

### Tab bar

Current: `Show | Setup | AI`

New: `Perform | Mix | Config | AI`

- **Perform** — musician's gig-day view (setlist, charts, keys)
- **Mix** — FOH/Mon engineer's view (stage plot, input list, monitor mixes, scene notes) — renamed from "Show"
- **Config** — build/edit the show (stage plot editor, input list editor, export/import) — renamed from "Setup"
- **AI** — agent codesigner (unchanged)

Perform is first because it's the primary use case during a gig. The engineer switches to Mix; the performer stays on Perform.

**On shared slug views (not the owner):** Default to Perform tab. Mix tab still accessible (engineers viewing a shared link need the full patch). Config and AI tabs hidden for non-owners (existing behavior).

### Perform tab layout

#### Header (compact)

```
Show Name or Band Name
Venue · Date
Song 3 of 12
```

- Show name takes priority over band name (if set)
- "Song X of Y" shows current position (defaults to song 1)
- No lineup count, no stage plot thumbnail — those are engineer concerns

#### Setlist (primary content)

Full-height scrollable list. Each song row:

```
┌─────────────────────────────────────────────┐
│  3.  Don't Stop Believin'           Em      │
│       Graham + Rachel    ♪  key change      │
└─────────────────────────────────────────────┘
```

- **Position number** — large, left-aligned
- **Song title** — large, bold, primary text
- **Key** — pill badge, right-aligned (reuse existing key pill from Show tab)
- **Lead singer(s)** — secondary text, color-coded (reuse `getSingerColor`)
- **Notes** — secondary text, italic, truncated to 1 line (tap to expand)
- **Chart indicator** — music note icon if charts are resolved for this song (reuse existing `♪` pattern)
- **Scene note** — hidden in Perform view (engineer-only concern)

#### Current song highlight

- Tap a song to mark it as "now playing" — highlighted with a left border accent and subtle background
- The current song sticks to a visible position (not necessarily top — the performer may want to see what's next)
- Only one song is current at a time
- Current song state is local (sessionStorage) — not persisted to the database or shared in real-time (that's a future WebSocket feature)

#### Chart access

- Tap a song row to open the inline chart viewer (already built — PR #33-34)
- Behavior identical to Mix tab chart tap: if one chart for the active role, opens directly; if multiple, shows pill picker
- Role filter persists from the existing sessionStorage-based role filter

#### Empty states

- No setlist → "No setlist yet. Set up your show in the Config tab."
- No charts resolved → song rows have no music note; chart tap shows "No charts for this song"

### What Perform does NOT show

- Stage plot grid
- Input list / channel numbers
- Monitor mix assignments
- General notes (engineer notes)
- Print/export buttons
- Offline cache controls
- Edit controls of any kind

### Responsive behavior

- **Tablet (primary use case):** Song rows are large, touch-friendly. Key pills are prominent.
- **Phone:** Same layout, narrower. Song title may wrap to 2 lines — that's fine.
- **Desktop:** Same layout. No special wide-screen treatment — keep it simple.

### Dark mode

Perform tab uses the existing dark theme (`bg-zinc-950`, `text-zinc-100`). This is stage-friendly — bright screens blind performers. No light mode variant needed for this tab.

## Data Model

### No schema changes

The Perform tab is a pure view layer over existing data:
- `config.setlist` — song list with title, key, lead, notes, charts
- `config.showInfo` — band name, show name, date, venue

### New state

```typescript
// Local state in Perform tab component
const [currentSongId, setCurrentSongId] = useState<string | null>(null);
```

Stored in `sessionStorage` under key `showrunr-current-song-{showId}` so it survives tab refresh but not session close.

## Implementation Plan

### Approach

Extract a new `PerformTab` component following the same pattern as `MixTab` (currently `ShowTab`) and `ConfigTab` (currently `SetupTab`) in `app/[slug]/page.tsx`.

### Files to create

- None. The `PerformTab` component lives in `app/[slug]/page.tsx` alongside the existing tab components (consistent with current architecture — all tabs are in one file).

### Files to modify

- `app/[slug]/page.tsx`:
  1. Rename tab union type: `useState<'perform' | 'mix' | 'config' | 'ai'>('perform')`
  2. Rename `ShowTab` → `MixTab`, `SetupTab` → `ConfigTab` (component names + tab labels)
  3. Default tab changes from `'show'` to `'perform'`
  4. Add Perform tab button to the tab bar (first position)
  5. Add `PerformTab` component (renders setlist, handles current-song, delegates to inline chart viewer)
  6. For non-owner slug views: default to `'perform'` instead of `'mix'`

### Component: PerformTab

```typescript
function PerformTab({
  setlist,
  showInfo,
  isOffline,
  accessToken,
}: {
  setlist: SetlistSong[];
  showInfo: AppConfig['showInfo'];
  isOffline: boolean;
  accessToken?: string;
}) {
  // current song tracking (sessionStorage-backed)
  // setlist rendering (large rows, key pills, lead colors)
  // chart viewer integration (tap → open inline viewer)
}
```

**Props are a subset of MixTab props** — no inputs, monitors, stage plot, or print sections. This keeps the component focused.

### Inline chart viewer integration

The existing chart viewer (`loadPdfDoc`, `renderPage`, etc.) is already decoupled from the Mix tab. The Perform tab calls the same functions on song tap. No viewer changes needed.

### No new dependencies

Zero npm additions.

## UX Flow Checklist

| CTA / interaction | Destination |
|---|---|
| Tap Perform tab | Show Perform view (setlist) |
| Tap song row | Open inline chart viewer (if charts exist) or mark as current song |
| Tap song row (no charts) | Mark as current song |
| Tap current song again | Unmark (deselect) |
| Swipe in chart viewer | Next/prev song chart (existing behavior) |
| Back from chart viewer | Return to Perform setlist |
| Role filter (existing) | Filters which charts are shown on tap (persisted in sessionStorage) |

**Decision — tap behavior:** Since tap serves two purposes (mark current + open chart), resolve with: **short tap = mark current, long-press or tap chart icon = open chart viewer.** Alternative: tap always opens the chart viewer if charts exist, and a small "now" button on the left edge marks current. The simpler approach: **tap opens chart if charts exist; tap marks current if no charts. A dedicated "now playing" indicator button on the left edge.** This avoids gesture ambiguity.

## Testing

### Manual

- Open a show with 15+ songs → Perform tab → verify all songs visible, scrollable
- Tap song with charts → inline viewer opens → swipe through songs → back returns to Perform
- Tap song without charts → current song highlight appears
- Tap current song again → highlight removed
- Refresh page → current song restored from sessionStorage
- Open shared slug (non-owner) → defaults to Perform tab
- Open as owner → defaults to Perform tab, can switch to Mix/Config/AI
- Verify on iPad Safari (primary use case) — touch targets large enough, no layout issues
- Verify dark mode readability on stage (dim room test)

### Automated

- Confirm Perform tab renders setlist from config
- Confirm current-song state persists in sessionStorage
- Confirm chart viewer opens on song tap when charts are resolved

## Future Considerations

- **Real-time song sync:** When the MD taps "now playing," all connected Perform views follow. Requires WebSocket/Supabase Realtime. Separate spec — the local-only version ships first.
- **Tempo / click track display:** BPM per song, potentially with a tap-tempo widget. Useful for the drummer. Data model addition (`bpm?: number` on `SetlistSong`).
- **Personal notes overlay:** Each performer adds their own notes per song (e.g., "watch for the ritard bar 32"). Requires per-user storage — ties into auth/role system.
- **Setlist-only sharing:** Share just the Perform view (no patch list) — useful for sending to session musicians who don't need the full show file.
- **Live lyrics / teleprompter mode:** Auto-scroll lyrics synced to current song. Very different feature but Perform tab is the natural home.
