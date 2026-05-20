# Design: Batch Chart Resolution & Navigator

**Status:** Draft v1.0 — awaiting review
**Depends on:** PR #1 (Charts / Lead Sheets — Google Drive integration)
**Scope:** Setup-time batch resolution + showtime chart navigator

---

## Problem

Current implementation loads chart links on-demand per tap in the Show tab. This creates two UX problems:

1. **Setup tax:** Engineer has to tap every song individually to discover which charts exist. For a 30-song setlist, that's 30 taps with loading spinners.
2. **No visual signal:** Chart icons are all gray until tapped — no way to see at a glance which songs have charts and which don't.

The chart links themselves are small (~200 bytes each). A worst-case 30-song x 8-role setlist is ~48KB — trivially fits in localStorage and the shareable URL.

---

## Design

### Phase: Setup (can afford latency)

#### Batch Resolution Trigger

Chart resolution fires automatically when **all three conditions** are met:
1. Google Drive is connected (valid token)
2. A `chartsRootFolderId` is configured
3. The setlist has at least one song

**Triggers:**
- Setlist loaded from Google Sheet import
- Song added manually to the setlist
- Song title edited (debounced — 1s after last keystroke)
- User clicks "Refresh Charts" button (manual re-scan)

#### Resolution Flow

```
For each song in setlist:
  POST /api/drive/batch
    body: { folderId, songTitles: ["Superstition", "Brick House", ...] }

Response: {
  "Superstition": [
    { role: "Guitar", url: "...", label: "Superstition.pdf", dupeCount: 1 },
    { role: "Lyrics", url: "...", label: "Superstition - lyrics.docx", dupeCount: 1 }
  ],
  "Brick House": [
    { role: "Horns", url: "...", label: "Brick House Bb.pdf", dupeCount: 2 }
  ],
  "Some Song": []
}
```

**Why a batch endpoint?** One round-trip instead of N. The server fans out to role folders in parallel, same as today, but for all songs at once.

#### Storage

Resolved charts are written to `SetlistSong.charts` on each song in the config. This means:
- They persist in localStorage automatically (existing mechanism)
- They're included in the shareable URL (existing `encodeConfig`)
- Anyone who opens a shared link gets pre-resolved chart links — no Drive connection needed to *view* them
- Only the person who *resolves* needs Drive access

#### UI Changes (Setup Tab)

- **Status indicator** on the Setlist section header: "Charts: 24/30 songs matched" or "Charts: not connected"
- **Refresh Charts** button — re-runs batch resolution for all songs
- **Per-song indicator** in the setlist table: small colored dot (green = has charts, gray = none, orange = has dupes)

#### Incremental Updates

When a song is added or its title changes:
- Resolve just that song (single-song API call, not full batch)
- Merge result into the existing charts data
- Debounce title edits (1s) to avoid API spam while typing

---

### Phase: Show (must be instant)

#### Setlist Table Enhancement

The existing setlist table gains a **Charts column** (already partially built in PR #1):
- Icon is pre-colored based on resolved data: **blue** = has charts, **gray** = no charts
- No loading spinners — data is already in config
- Tap icon → opens the **Chart Navigator** overlay

#### Chart Navigator Overlay

Full-screen overlay optimized for musicians at the gig.

```
┌─────────────────────────────────────┐
│  ← Back to Setlist                  │
│                                     │
│  Song 3 of 30                       │
│  "Superstition"                     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ Lyrics    Superstition.docx →│    │
│  │ Guitar    Superstition.pdf  →│    │
│  │ Horns     Superstition Bb   →│    │
│  │           ⚠ 2 found          │    │
│  │ Drums     Superstition.pdf  →│    │
│  └─────────────────────────────┘    │
│                                     │
│  [← Prev Song]      [Next Song →]  │
│                                     │
│  Filter: [All Roles ▼]             │
└─────────────────────────────────────┘
```

**Key interactions:**
- **Prev/Next** buttons step through the setlist in order. Swipe left/right also works (touch events).
- **Role filter dropdown** (sticky per session): pick "Guitar" and you only see Guitar charts as you step through songs. Persisted in sessionStorage so it survives page navigations but not new sessions.
- **Chart link tap** → opens in new tab. When the musician returns to the app tab, the navigator is still showing the same song, ready for next/prev.
- **Back to Setlist** returns to the full setlist table.
- **Keyboard nav:** left/right arrow keys for prev/next (desktop use case).
- **Empty state:** if a song has no charts for the selected role, show "No [Guitar] chart for this song" with prev/next still active.

#### Why Not Embed Charts?

Google Drive files can't be reliably iframed (CORS, auth, mixed content). The navigator is a **launch pad** — it shows what's available, you tap to open, and when you come back the navigator is waiting with prev/next. This is the same UX pattern as music apps that link to external scores.

---

## New API Route

### `POST /api/drive/batch`

Accepts a list of song titles, searches all role subfolders for each, returns a map.

```ts
// Request
{
  folderId: string;         // charts root folder ID
  songTitles: string[];     // ["Superstition", "Brick House", ...]
}

// Response
{
  [songTitle: string]: Chart[];  // keyed by original title (not normalized)
}
```

**Implementation:** Same fuzzy matching as the existing `/api/drive` route. Fetches the file list from each role folder once, then matches all song titles against it client-side. This is O(roles) API calls regardless of song count, not O(songs x roles).

**Optimization:** Instead of querying per-song, query each role folder once (get all files), then match all songs against that list in memory. For 8 role folders, that's 8 Drive API calls total — independent of setlist length.

---

## Data Model Changes

None — `SetlistSong.charts?: Chart[]` already exists from PR #1. The batch resolution just populates it at setup time instead of on-demand at show time.

`AppConfig.chartsRootFolderId` already exists.

---

## Migration from PR #1

The on-demand per-tap loading in PR #1 becomes dead code. It gets replaced by:
1. Batch resolution at setup time (writes to config)
2. Pre-colored icons at show time (reads from config)
3. Navigator overlay (pure client-side, no API calls)

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Song title changed after resolution | Re-resolve that song (debounced). Old charts cleared, new ones populated. |
| Song deleted from setlist | Charts removed with the song (they're on the SetlistSong object). |
| Drive folder has new files after initial resolution | Stale until "Refresh Charts" is clicked. No auto-polling. |
| Token expired during batch resolution | Show error banner with "Reconnect Google Drive" action. Partial results kept. |
| Shared link opened by someone without Drive access | Charts work — links are in the URL. They can open Drive files if they have access to the Drive folder (separate from app auth). |
| 50+ song setlist | Batch endpoint handles it — still only 8 Drive API calls (one per role folder). |

---

## Out of Scope

- Offline chart caching (separate design doc)
- "My Charts" per-musician filtered view (future feature)
- Drag-and-drop chart reordering
- Chart upload from within the app
