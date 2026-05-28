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
Venue · Date                    [All | Guitar | Lyrics | Keys]
12 songs
```

- Show name takes priority over band name (if set)
- Song count as simple context
- Role selector pills right-aligned in header (see Role selector section)
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
- **Notes** — secondary text, italic, truncated to 1 line
- **Chart pills** — inline chart role pills (same as Mix tab, reuse existing component). Tap a pill to open the inline chart viewer.
- **Scene note** — hidden in Perform view (engineer-only concern)

#### Chart access

- **Same interaction as Mix tab:** chart pills appear inline on each song row. Tap a pill → inline chart viewer opens (already built — PR #33-34).
- This is not a new interaction model — it reuses the existing chart pill component and click handler from the Mix tab.
- Role filter persists from sessionStorage-based role filter.

#### Role selector

- Compact role/part picker in the Perform tab header (e.g., pill-style toggle: `All | Guitar | Lyrics | Keys`)
- Populated from the roles present in the resolved charts
- Sets the same sessionStorage role filter used by the chart pills and inline viewer
- Performers on a shared slug need this — they can't switch to Config to change their role

#### Empty states

- No setlist → "No setlist yet. Set up your show in the Config tab."
- No charts resolved → song rows have no chart pills; no special empty state needed

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

No new persisted state beyond the role filter. The current role filter uses a single global sessionStorage key (`stageplot-role-filter`). As part of this build, migrate it to a per-show key (`showrunr-role-filter-{slug}`) so the filter doesn't bleed across shows. `slug` is synchronous via `useParams()`.

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
  5. Add `PerformTab` component (renders setlist with chart pills, role selector, and its own ChartNavigator overlay)
  6. For non-owner slug views: default to `'perform'` instead of `'mix'`

Note: each tab manages its own `navigatorSongIdx` and `ChartNavigator` instance. Since only one tab renders at a time, there is no duplication risk or drift — the inactive tab's state is unmounted. Lifting state to `Page` would add prop-drilling complexity for no user-visible benefit.

### Component: PerformTab

```typescript
function PerformTab({
  setlist,
  showInfo,
}) {
  // role selector (compact pills in header)
  // setlist rendering (large rows, key pills, lead colors, chart pills)
  // chart button tap → open ChartNavigator overlay
}
```

**Props are a subset of MixTab props** — no inputs, monitors, stage plot, or print sections.

### Inline chart viewer integration

The chart viewer (`loadPdfDoc`, `renderPage`, etc.) is already decoupled from any specific tab. Each tab manages its own `navigatorSongIdx` state and renders its own `ChartNavigator` overlay. Since React unmounts the inactive tab, there is no state duplication at runtime.

### No new dependencies

Zero npm additions.

## UX Flow Checklist

| CTA / interaction | Destination |
|---|---|
| Tap Perform tab | Show Perform view (setlist) |
| Tap chart pill on song row | Open inline chart viewer for that role (existing behavior, same as Mix tab) |
| Tap role selector pill | Filter chart pills to that role (sessionStorage-persisted) |
| Swipe in chart viewer | Next/prev song chart (existing behavior) |
| Back from chart viewer | Return to Perform setlist |

No new gesture patterns. Every interaction reuses an existing component and behavior from the Mix tab.

## Testing

### Manual

- Open a show with 15+ songs → Perform tab → verify all songs visible, scrollable
- Tap chart pill → inline viewer opens → swipe through songs → back returns to Perform
- Role selector → tap "Guitar" → only guitar chart pills shown → tap one → correct chart opens
- Open shared slug (non-owner) → defaults to Perform tab, role selector works
- Open as owner → defaults to Perform tab, can switch to Mix/Config/AI
- Verify tab rename: "Mix" and "Config" labels appear correctly, all functionality unchanged
- Verify on iPad Safari (primary use case) — touch targets large enough, no layout issues
- Verify dark mode readability on stage (dim room test)

### Automated

- Confirm Perform tab renders setlist from config
- Confirm role selector filters chart pills
- Confirm chart viewer opens from Perform tab via chart button tap

## Future Considerations

- **Current-song tracking:** "Now playing" highlight with local state, then real-time sync via WebSocket/Supabase Realtime so all connected Perform views follow the MD. Deferred from v1 — low value without the sync layer.
- **Tempo / click track display:** BPM per song, potentially with a tap-tempo widget. Useful for the drummer. Data model addition (`bpm?: number` on `SetlistSong`).
- **Personal notes overlay:** Each performer adds their own notes per song (e.g., "watch for the ritard bar 32"). Requires per-user storage — ties into auth/role system.
- **Setlist-only sharing:** Share just the Perform view (no patch list) — useful for sending to session musicians who don't need the full show file.
- **Live lyrics / teleprompter mode:** Auto-scroll lyrics synced to current song. Very different feature but Perform tab is the natural home.
